/**
 * Unified Launcher — Single process for all Bridge sessions.
 *
 * Orchestrates lock acquisition, session recovery, and process monitoring.
 * CEO never loses a session due to launcher downtime.
 *
 * @module bridge/launcher/unified-launcher
 * @version 1.0.0
 * @authority ADR-024 (Sprint 92)
 */

import type { SessionRegistry } from "../session-registry.js";
import type { TmuxBridge } from "../tmux/tmux-bridge.js";
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
import { LockManager } from "./lock-manager.js";
import { ProcessMonitor } from "./process-monitor.js";

// ============================================================================
// Types
// ============================================================================

export interface UnifiedLauncherDeps {
  lockManager?: LockManager;
  registry: SessionRegistry;
  tmux: TmuxBridge;
  agentLauncher: AgentLauncher;
  audit: { log: (entry: AuditLogParams) => void };
  /** Notification callback (e.g. Telegram send) */
  onNotify?: (message: string) => Promise<void>;
  /** Override poll interval for ProcessMonitor */
  pollIntervalMs?: number;
  /** Injectable process liveness check */
  isProcessAlive?: (pid: number) => boolean;
}

export interface StartResult {
  success: boolean;
  error?: string;
  staleLockRemoved?: boolean;
  recoveredSessions?: number;
  lostSessions?: number;
}

export interface LauncherStatus {
  running: boolean;
  activeSessions: number;
  uptime?: number;
}

// ============================================================================
// Unified Launcher
// ============================================================================

export class UnifiedLauncher {
  private monitor: ProcessMonitor | null = null;
  private running = false;
  private startTime = 0;

  private readonly lockManager: LockManager;
  private readonly registry: SessionRegistry;
  private readonly tmux: TmuxBridge;
  private readonly agentLauncher: AgentLauncher;
  private readonly audit: { log: (entry: AuditLogParams) => void };
  private readonly onNotify: ((message: string) => Promise<void>) | undefined;
  private readonly pollIntervalMs: number | undefined;
  private readonly isProcessAlive: ((pid: number) => boolean) | undefined;

  constructor(deps: UnifiedLauncherDeps) {
    this.lockManager = deps.lockManager ?? new LockManager();
    this.registry = deps.registry;
    this.tmux = deps.tmux;
    this.agentLauncher = deps.agentLauncher;
    this.audit = deps.audit;
    this.onNotify = deps.onNotify;
    this.pollIntervalMs = deps.pollIntervalMs;
    this.isProcessAlive = deps.isProcessAlive;
  }

  /**
   * Start the launcher: acquire lock, recover sessions, start monitor.
   */
  async start(): Promise<StartResult> {
    // 1. Acquire lock
    const lockResult = this.lockManager.acquire();
    if (!lockResult.acquired) {
      const failResult: StartResult = { success: false };
      if (lockResult.error) failResult.error = lockResult.error;
      return failResult;
    }

    this.running = true;
    this.startTime = Date.now();

    // 2. Audit
    this.audit.log({
      event: "launcher_started",
      actorId: "launcher",
      actor: "system",
      details: {
        pid: process.pid,
        staleLockRemoved: lockResult.staleLockRemoved ?? false,
      },
    });

    // 3. Recovery pass
    const recovery = await this.recoverSessions();

    // 4. Start process monitor
    const monitorDeps: import("./process-monitor.js").ProcessMonitorDeps = {
      registry: this.registry,
      launcher: this.agentLauncher,
      audit: this.audit,
    };
    if (this.onNotify) monitorDeps.onNotify = this.onNotify;
    if (this.pollIntervalMs !== undefined) monitorDeps.pollIntervalMs = this.pollIntervalMs;
    if (this.isProcessAlive) monitorDeps.isProcessAlive = this.isProcessAlive;
    this.monitor = new ProcessMonitor(monitorDeps);
    this.monitor.start();

    const result: StartResult = {
      success: true,
      recoveredSessions: recovery.recovered,
      lostSessions: recovery.lost,
    };
    if (lockResult.staleLockRemoved) result.staleLockRemoved = true;
    return result;
  }

  /**
   * Stop the launcher: stop monitor, audit, release lock.
   */
  async stop(): Promise<void> {
    if (this.monitor) {
      this.monitor.stop();
      this.monitor = null;
    }

    // CTO F1: Audit launcher_stopped
    if (this.running) {
      this.audit.log({
        event: "launcher_stopped",
        actorId: "launcher",
        actor: "system",
        details: {
          pid: process.pid,
          uptimeMs: Date.now() - this.startTime,
        },
      });
    }

    this.running = false;
    this.lockManager.release();
  }

  /**
   * Get launcher status.
   */
  status(): LauncherStatus {
    const activeSessions = this.registry.getActive().length;
    const result: LauncherStatus = {
      running: this.running,
      activeSessions,
    };
    if (this.running) {
      result.uptime = Date.now() - this.startTime;
    }
    return result;
  }

  /**
   * Launch a new session (delegates to AgentLauncher + PID tracking).
   */
  async startSession(options: LaunchOptions): Promise<LaunchResult> {
    return this.agentLauncher.launch(options);
  }

  /**
   * Stop a session.
   */
  async stopSession(
    sessionId: string,
    actorId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.agentLauncher.kill(sessionId, actorId);
  }

  /**
   * Stop all active sessions.
   */
  async stopAll(actorId: string): Promise<{ stopped: number }> {
    const sessions = this.registry.getActive();
    let stopped = 0;

    for (const session of sessions) {
      const result = await this.agentLauncher.kill(session.id, actorId);
      if (result.success) stopped++;
    }

    return { stopped };
  }

  // ==========================================================================
  // Recovery (CTO F2: PID-match + pane existence)
  // ==========================================================================

  /**
   * Recovery pass: re-attach to existing tmux sessions.
   *
   * CTO F2 logic:
   * - Pane exists AND stored providerPid alive → RECOVERED
   * - Pane exists BUT providerPid dead → ZOMBIE → kill pane, mark LOST
   * - Pane gone → LOST
   */
  private async recoverSessions(): Promise<{ recovered: number; lost: number }> {
    let recovered = 0;
    let lost = 0;

    const sessions = this.registry.getActive();

    for (const session of sessions) {
      // Check if tmux pane still exists
      let paneExists = false;
      try {
        const paneExists_ = await this.tmux.sessionExists(session.tmuxSessionName);
        if (paneExists_) {
          // Also verify pane by trying capturePane
          await this.tmux.capturePane(session.tmuxTarget, 1);
          paneExists = true;
        }
      } catch {
        paneExists = false;
      }

      if (paneExists && session.providerPid !== undefined) {
        // CTO F2: Check PID match — not just pane existence
        const pidAlive = this.isProcessAlive
          ? this.isProcessAlive(session.providerPid)
          : defaultIsProcessAlive(session.providerPid);

        if (pidAlive) {
          // RECOVERED: pane exists + PID alive
          const updates: Partial<BridgeSession> = {
            launcherStartTime: Date.now(),
          };
          this.registry.update(session.id, updates);
          recovered++;

          this.audit.log({
            event: "session_recovered",
            actorId: "launcher",
            actor: "system",
            sessionId: session.id,
            agentType: session.agentType,
            details: {
              providerPid: session.providerPid,
              launcherStartTime: session.launcherStartTime,
            },
          });
        } else {
          // ZOMBIE: pane exists but PID is dead — kill zombie pane
          try {
            await this.tmux.killWindow(session.tmuxTarget);
          } catch {
            // Already gone
          }
          this.registry.markError(
            session.id,
            "Zombie pane detected on launcher restart (PID dead, pane alive)",
          );
          lost++;

          if (this.onNotify) {
            this.onNotify(`⚠️ Session ${session.id} lost (zombie pane — agent process exited).`).catch(() => {});
          }
        }
      } else if (paneExists) {
        // Pane exists but no PID tracked — treat as recovered (best effort)
        const updates: Partial<BridgeSession> = {
          launcherStartTime: Date.now(),
        };
        // Try to get PID now
        const pid = await this.tmux.getPanePid(session.tmuxTarget);
        if (pid !== null) updates.providerPid = pid;
        const paneId = await this.tmux.getPaneId(session.tmuxTarget);
        if (paneId !== null) updates.tmuxPaneId = paneId;
        this.registry.update(session.id, updates);
        recovered++;

        this.audit.log({
          event: "session_recovered",
          actorId: "launcher",
          actor: "system",
          sessionId: session.id,
          agentType: session.agentType,
          details: { recoveredWithoutPid: true },
        });
      } else {
        // LOST: pane gone
        this.registry.markError(
          session.id,
          "tmux pane lost on launcher restart",
        );
        lost++;

        if (this.onNotify) {
          this.onNotify(`⚠️ Session ${session.id} lost (tmux pane gone).`).catch(() => {});
        }
      }
    }

    return { recovered, lost };
  }
}

// ============================================================================
// Helper (CTO F2 — default liveness for recovery)
// ============================================================================

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
