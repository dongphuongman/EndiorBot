/**
 * Bridge Policy
 *
 * BridgePolicy defaults and enforcement for session management.
 * Governs rate limits, max sessions, allowed agent types, and security constraints.
 *
 * @module bridge/security/bridge-policy
 * @version 1.0.0
 * @authority ADR-024 A4
 * @stage 04 - BUILD (Sprint 82)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  BridgePolicy,
  AgentProviderType,
  BridgeSession,
} from "../types.js";

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_BRIDGE_POLICY: BridgePolicy = {
  allowedAgentTypes: ["claude-code", "cursor", "codex-cli", "gemini-cli"],
  maxSessionsPerAgent: 2,
  maxTotalSessions: 6,
  telegramRateLimit: {
    commandsPerMinute: 20,
    sendKeysPerMinute: 10,
  },
  perSessionSendKeysInterval: 3000,
  sendKeysMaxLength: 500,
  captureRedactPatterns: [],
  shellPanesDisabled: true, // Safety invariant — NOT overridable
  // Sprint 83 — Managed Shell
  shellSessionsPerRepo: 1,
  maxShellSessions: 3,
  shellActorAllowlist: [], // Empty = all linked actors allowed
  // Sprint 91 — Team Monitoring (ADR-026, CTO A4)
  teamCostThresholdUsd: 5.0,
  teamStuckIdleThresholdSec: 180,
};

const POLICY_FILE_PATH = join(homedir(), ".endiorbot", "bridge-policy.json");

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateBucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;

  let bucket = rateBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateBuckets.set(key, bucket);
  }

  // Prune old entries
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxPerMinute) {
    return false; // Rate exceeded
  }

  bucket.timestamps.push(now);
  return true;
}

// Per-session sendKeys interval tracking
const lastSendKeysTime = new Map<string, number>();

// ============================================================================
// Policy Manager
// ============================================================================

export class BridgePolicyManager {
  private policy: BridgePolicy;

  constructor(policy?: Partial<BridgePolicy>) {
    this.policy = { ...DEFAULT_BRIDGE_POLICY, ...policy };
    // Safety invariant: shellPanesDisabled is ALWAYS true
    this.policy.shellPanesDisabled = true;
  }

  /**
   * Load policy from ~/.endiorbot/bridge-policy.json (if exists).
   * Falls back to defaults.
   */
  static fromFile(): BridgePolicyManager {
    if (!existsSync(POLICY_FILE_PATH)) {
      return new BridgePolicyManager();
    }

    try {
      const raw = readFileSync(POLICY_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<BridgePolicy>;
      return new BridgePolicyManager(parsed);
    } catch {
      return new BridgePolicyManager();
    }
  }

  getPolicy(): BridgePolicy {
    return { ...this.policy };
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Check if agent type is allowed.
   */
  isAgentTypeAllowed(agentType: AgentProviderType): boolean {
    return this.policy.allowedAgentTypes.includes(agentType);
  }

  /**
   * Check if a new session can be created.
   */
  canCreateSession(
    agentType: AgentProviderType,
    activeSessions: BridgeSession[]
  ): { allowed: boolean; reason: string } {
    if (!this.isAgentTypeAllowed(agentType)) {
      return { allowed: false, reason: `Agent type "${agentType}" is not allowed` };
    }

    const agentCount = activeSessions.filter(
      (s) => s.agentType === agentType && s.status === "active"
    ).length;

    if (agentCount >= this.policy.maxSessionsPerAgent) {
      return {
        allowed: false,
        reason: `Max sessions reached for ${agentType} (${agentCount}/${this.policy.maxSessionsPerAgent}). Kill a session first.`,
      };
    }

    const totalActive = activeSessions.filter((s) => s.status === "active").length;
    if (totalActive >= this.policy.maxTotalSessions) {
      return {
        allowed: false,
        reason: `Max total sessions reached (${totalActive}/${this.policy.maxTotalSessions}). Kill a session first.`,
      };
    }

    return { allowed: true, reason: "OK" };
  }

  /**
   * Check command rate limit.
   */
  checkCommandRateLimit(actorId: string): boolean {
    return checkRateLimit(`cmd:${actorId}`, this.policy.telegramRateLimit.commandsPerMinute);
  }

  /**
   * Check sendKeys rate limit.
   */
  checkSendKeysRateLimit(actorId: string): boolean {
    return checkRateLimit(`sk:${actorId}`, this.policy.telegramRateLimit.sendKeysPerMinute);
  }

  /**
   * Check per-session sendKeys interval (1 msg / 3s default).
   */
  checkSessionSendKeysInterval(sessionId: string): boolean {
    const now = Date.now();
    const lastTime = lastSendKeysTime.get(sessionId);

    if (lastTime !== undefined && now - lastTime < this.policy.perSessionSendKeysInterval) {
      return false; // Too fast
    }

    lastSendKeysTime.set(sessionId, now);
    return true;
  }

  /**
   * Check if sendKeys is allowed to a shell pane.
   * Always returns false (shell panes disabled — safety invariant).
   */
  isShellPaneAllowed(): boolean {
    return !this.policy.shellPanesDisabled; // always false
  }

  /**
   * Check if an actor is allowed to use shell commands (/sh, /run, /cp).
   * Empty allowlist = all linked actors allowed.
   */
  isShellActorAllowed(actorId: string): boolean {
    if (this.policy.shellActorAllowlist.length === 0) return true;
    return this.policy.shellActorAllowlist.includes(actorId);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalPolicyManager: BridgePolicyManager | undefined;

export function getBridgePolicyManager(): BridgePolicyManager {
  if (!globalPolicyManager) {
    globalPolicyManager = BridgePolicyManager.fromFile();
  }
  return globalPolicyManager;
}

export function resetBridgePolicyManager(): void {
  globalPolicyManager = undefined;
  rateBuckets.clear();
  lastSendKeysTime.clear();
}
