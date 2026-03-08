/**
 * Process Monitor — Session liveness polling + crash recovery.
 *
 * Polls active sessions on a configurable interval (default 15s).
 * Detects crashed PIDs, auto-restarts with same SOUL/team context.
 * Includes restart cap (CTO MF-1) to prevent crash-loops.
 *
 * @module bridge/launcher/process-monitor
 * @version 1.0.0
 * @authority ADR-024 (Sprint 92)
 */

import type { SessionRegistry } from "../session-registry.js";
import type { AgentLauncher, LaunchResult } from "../agent-launcher.js";
import type { BridgeSession, BridgeAuditEventType, BridgeAuditActor, LaunchOptions } from "../types.js";

/** Params shape matching BridgeAuditLogger.log() */
interface AuditLogParams {
  event: BridgeAuditEventType;
  actorId: string;
  actor: BridgeAuditActor;
  sessionId?: string;
  agentType?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Types
// ============================================================================

export interface ProcessMonitorDeps {
  registry: SessionRegistry;
  launcher: AgentLauncher;
  audit: { log: (entry: AuditLogParams) => void };
  /** Override poll interval (default 15000ms) */
  pollIntervalMs?: number;
  /** Injectable process liveness check */
  isProcessAlive?: (pid: number) => boolean;
  /** Injectable timer (for testing) */
  scheduleNext?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** Injectable timer cancel (for testing) */
  cancelSchedule?: (handle: ReturnType<typeof setTimeout>) => void;
  /** Notification callback (e.g. Telegram send) */
  onNotify?: (message: string) => Promise<void>;
}

export interface PollResult {
  checked: number;
  alive: number;
  crashed: number;
  restarted: number;
  exhausted: number;
}

// ============================================================================
// Constants — Restart Cap (CTO MF-1)
// ============================================================================

/** Maximum restarts per session within the restart window. */
export const MAX_RESTARTS = 3;

/** Restart window in milliseconds (5 minutes). */
export const RESTART_WINDOW_MS = 5 * 60_000;

/** Default poll interval in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 15_000;

// ============================================================================
// Restart Tracker (CTO MF-1)
// ============================================================================

interface RestartTracker {
  count: number;
  firstAttemptAt: number;
}

// ============================================================================
// Default Liveness Check
// ============================================================================

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Process Monitor
// ============================================================================

export class ProcessMonitor {
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly restartTrackers = new Map<string, RestartTracker>();

  private readonly registry: SessionRegistry;
  private readonly launcher: AgentLauncher;
  private readonly audit: { log: (entry: AuditLogParams) => void };
  private readonly pollIntervalMs: number;
  private readonly isProcessAlive: (pid: number) => boolean;
  private readonly scheduleNext: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly cancelSchedule: (handle: ReturnType<typeof setTimeout>) => void;
  private readonly onNotify: ((message: string) => Promise<void>) | undefined;

  constructor(deps: ProcessMonitorDeps) {
    this.registry = deps.registry;
    this.launcher = deps.launcher;
    this.audit = deps.audit;
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
    this.scheduleNext = deps.scheduleNext ?? ((cb, ms) => setTimeout(cb, ms));
    this.cancelSchedule = deps.cancelSchedule ?? ((h) => clearTimeout(h));
    this.onNotify = deps.onNotify;
  }

  /**
   * Start the polling loop (recursive setTimeout).
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const loop = async (): Promise<void> => {
      if (!this.running) return;
      await this.poll();
      if (this.running) {
        this.timerHandle = this.scheduleNext(loop, this.pollIntervalMs);
      }
    };

    // First poll after one interval (give sessions time to start)
    this.timerHandle = this.scheduleNext(loop, this.pollIntervalMs);
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    this.running = false;
    if (this.timerHandle !== null) {
      this.cancelSchedule(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * Single poll cycle — exposed for testing.
   */
  async poll(): Promise<PollResult> {
    const result: PollResult = {
      checked: 0,
      alive: 0,
      crashed: 0,
      restarted: 0,
      exhausted: 0,
    };

    const sessions = this.registry.getActive();

    for (const session of sessions) {
      result.checked++;

      const alive = this.checkLiveness(session);
      if (alive) {
        result.alive++;
        continue;
      }

      // Session is crashed
      result.crashed++;

      // Check restart cap (CTO MF-1)
      if (this.isRestartExhausted(session.id)) {
        result.exhausted++;
        this.registry.markError(session.id, "Restart cap exceeded (3 restarts in 5 min)");

        this.audit.log({
          event: "session_crash_restart",
          actorId: "launcher",
          actor: "system",
          sessionId: session.id,
          agentType: session.agentType,
          details: {
            reason: "restart_exhausted",
            maxRestarts: MAX_RESTARTS,
            windowMs: RESTART_WINDOW_MS,
          },
        });

        if (this.onNotify) {
          this.onNotify(
            `⚠️ Session ${session.id} crashed ${MAX_RESTARTS}+ times in ${RESTART_WINDOW_MS / 60_000}min — giving up. Check agent config.`,
          ).catch(() => {});
        }
        continue;
      }

      // Attempt restart
      const restarted = await this.restartSession(session);
      if (restarted) {
        result.restarted++;
        this.trackRestart(session.id);
      }
    }

    return result;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Check if a session's process is alive.
   */
  private checkLiveness(session: BridgeSession): boolean {
    if (session.providerPid !== undefined) {
      return this.isProcessAlive(session.providerPid);
    }

    // No PID tracked — try tmux capturePane as fallback
    // We can't use async here efficiently, so treat as alive
    // (the next poll with PID info will catch it)
    return true;
  }

  /**
   * Restart a crashed session with same options.
   */
  private async restartSession(session: BridgeSession): Promise<boolean> {
    // Mark old session as error
    this.registry.markError(session.id, "Process crashed — auto-restarting");

    // Build LaunchOptions from existing session
    const options: LaunchOptions = {
      agentType: session.agentType,
      projectPath: session.projectPath,
      actorId: "launcher",
    };
    if (session.riskMode) options.riskMode = session.riskMode;
    if (session.agentRole) options.agentRole = session.agentRole;
    if (session.teamId) options.teamId = session.teamId;

    let launchResult: LaunchResult;
    try {
      launchResult = await this.launcher.launch(options);
    } catch {
      return false;
    }

    if (!launchResult.success) {
      return false;
    }

    // Audit
    this.audit.log({
      event: "session_crash_restart",
      actorId: "launcher",
      actor: "system",
      sessionId: session.id,
      agentType: session.agentType,
      details: {
        reason: "auto_restart",
        oldSessionId: session.id,
        newSessionId: launchResult.session?.id,
        agentRole: session.agentRole,
        teamId: session.teamId,
        launcherStartTime: session.launcherStartTime,
      },
    });

    // Notify CEO
    if (this.onNotify) {
      const role = session.agentRole ? ` @${session.agentRole}` : "";
      const team = session.teamId ? ` (${session.teamId}-team)` : "";
      this.onNotify(
        `🔄 Session${role}${team} recovered automatically.`,
      ).catch(() => {});
    }

    return true;
  }

  // ==========================================================================
  // Restart Cap (CTO MF-1)
  // ==========================================================================

  /**
   * Check if a session has exhausted its restart attempts.
   */
  private isRestartExhausted(sessionId: string): boolean {
    const tracker = this.restartTrackers.get(sessionId);
    if (!tracker) return false;

    const now = Date.now();
    // Window has elapsed — reset tracker, allow restart
    if (now - tracker.firstAttemptAt > RESTART_WINDOW_MS) {
      this.restartTrackers.delete(sessionId);
      return false;
    }

    return tracker.count >= MAX_RESTARTS;
  }

  /**
   * Record a restart attempt.
   */
  private trackRestart(sessionId: string): void {
    const existing = this.restartTrackers.get(sessionId);
    const now = Date.now();

    if (existing && now - existing.firstAttemptAt <= RESTART_WINDOW_MS) {
      existing.count++;
    } else {
      this.restartTrackers.set(sessionId, { count: 1, firstAttemptAt: now });
    }
  }
}
