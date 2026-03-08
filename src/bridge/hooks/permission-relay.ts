/**
 * Permission Relay
 *
 * Manages pending permission requests from Claude Code hooks.
 * Routes CEO decisions (approve/deny) back to the tmux pane via sendKeys.
 * Auto-denies on 5-minute timeout.
 *
 * @module bridge/hooks/permission-relay
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-024 §8.4
 * @stage 04 - BUILD (Sprint 85)
 */

import { randomBytes } from "node:crypto";
import type { BridgeAuditLogger } from "../security/bridge-audit.js";
import type { TmuxBridge } from "../tmux/tmux-bridge.js";
import type {
  AgentProviderType,
  PermissionDecision,
  PermissionRequest,
} from "../types.js";

// ============================================================================
// Constants
// ============================================================================

/** Permission request timeout (5 minutes) */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

const PERMISSION_ID_PREFIX = "perm_";

// ============================================================================
// Types
// ============================================================================

export interface CreatePermissionParams {
  sessionId: string;
  tmuxTarget: string;
  agentType: AgentProviderType;
  toolName: string;
  filePath?: string;
  riskMode: string;
  nonce: string;
}

export interface PermissionRelayDeps {
  tmux: TmuxBridge;
  audit: BridgeAuditLogger;
  /** Callback invoked when a new permission request is created (for Telegram notification) */
  onPermissionRequest?: (request: PermissionRequest) => void;
  /** Callback invoked when a permission is auto-denied by timeout */
  onPermissionTimeout?: (request: PermissionRequest) => void;
}

export interface PermissionDecisionResult {
  success: boolean;
  reason?: string;
}

// ============================================================================
// PermissionRelay
// ============================================================================

export class PermissionRelay {
  private readonly pending = new Map<string, PermissionRequest>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly deps: PermissionRelayDeps;

  constructor(deps: PermissionRelayDeps) {
    this.deps = deps;
  }

  /**
   * Auto-approve a read-mode operation.
   * Sends "y" + Enter to tmux immediately, no Telegram prompt.
   */
  async autoApprove(
    sessionId: string,
    tmuxTarget: string,
    toolName: string,
  ): Promise<void> {
    await this.deps.tmux.sendKeys(tmuxTarget, "y");
    await this.deps.tmux.sendEnter(tmuxTarget);

    this.deps.audit.log({
      event: "hook_permission",
      actorId: "system",
      actor: "hook",
      sessionId,
      details: { toolName, action: "auto_approved", riskMode: "read" },
    });

    this.deps.audit.log({
      event: "permission_decision",
      actorId: "system",
      actor: "hook",
      sessionId,
      details: { toolName, decision: "approve", method: "auto_approve" },
    });
  }

  /**
   * Create a permission request and notify Telegram.
   * Returns the permission ID for CEO to approve/deny.
   */
  async createPermissionRequest(params: CreatePermissionParams): Promise<string> {
    const id = this.generatePermissionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PERMISSION_TIMEOUT_MS);

    const request: PermissionRequest = {
      id,
      sessionId: params.sessionId,
      tmuxTarget: params.tmuxTarget,
      agentType: params.agentType,
      toolName: params.toolName,
      riskMode: params.riskMode,
      nonce: params.nonce,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // exactOptionalPropertyTypes: only set filePath if defined
    if (params.filePath) request.filePath = params.filePath;

    this.pending.set(id, request);

    // Set timeout for auto-deny
    const timer = setTimeout(() => {
      void this.handleTimeout(id);
    }, PERMISSION_TIMEOUT_MS);
    this.timeouts.set(id, timer);

    // Log receipt
    this.deps.audit.log({
      event: "hook_permission",
      actorId: "system",
      actor: "hook",
      sessionId: params.sessionId,
      agentType: params.agentType,
      details: {
        permissionId: id,
        toolName: params.toolName,
        filePath: params.filePath,
        riskMode: params.riskMode,
      },
    });

    // Notify Telegram (via callback)
    this.deps.onPermissionRequest?.(request);

    return id;
  }

  /**
   * Handle CEO decision (approve or deny).
   */
  async handleDecision(
    permissionId: string,
    decision: PermissionDecision,
    actorId: string,
  ): Promise<PermissionDecisionResult> {
    const request = this.pending.get(permissionId);
    if (!request) {
      return { success: false, reason: "permission request not found or expired" };
    }

    // Clear timeout
    const timer = this.timeouts.get(permissionId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(permissionId);
    }

    // Update request
    request.decision = decision;
    request.decidedAt = new Date().toISOString();

    // Send key to tmux
    const key = decision === "approve" ? "y" : "n";
    await this.deps.tmux.sendKeys(request.tmuxTarget, key);
    await this.deps.tmux.sendEnter(request.tmuxTarget);

    // Log decision
    this.deps.audit.log({
      event: "permission_decision",
      actorId,
      actor: "telegram",
      sessionId: request.sessionId,
      agentType: request.agentType,
      details: {
        permissionId,
        toolName: request.toolName,
        decision,
        filePath: request.filePath,
      },
    });

    // Remove from pending
    this.pending.delete(permissionId);

    return { success: true };
  }

  /**
   * Get a pending permission request by ID.
   */
  getPending(permissionId: string): PermissionRequest | undefined {
    return this.pending.get(permissionId);
  }

  /**
   * Get all pending permission requests.
   */
  getAllPending(): PermissionRequest[] {
    return Array.from(this.pending.values());
  }

  /**
   * Clean up all timers and pending requests (for testing/shutdown).
   */
  dispose(): void {
    for (const timer of this.timeouts.values()) {
      clearTimeout(timer);
    }
    this.timeouts.clear();
    this.pending.clear();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  /**
   * Handle permission timeout — auto-deny after 5 minutes.
   */
  private async handleTimeout(permissionId: string): Promise<void> {
    const request = this.pending.get(permissionId);
    if (!request) return;

    request.decision = "timeout";
    request.decidedAt = new Date().toISOString();

    // Send deny to tmux
    try {
      await this.deps.tmux.sendKeys(request.tmuxTarget, "n");
      await this.deps.tmux.sendEnter(request.tmuxTarget);
    } catch (err: unknown) {
      // MF-3: Log tmux errors at warning level instead of silently swallowing
      this.deps.audit.log({
        event: "permission_decision",
        actorId: "system",
        actor: "system",
        sessionId: request.sessionId,
        details: {
          permissionId,
          warning: "tmux sendKeys failed on timeout",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }

    // Log timeout
    this.deps.audit.log({
      event: "permission_decision",
      actorId: "system",
      actor: "system",
      sessionId: request.sessionId,
      agentType: request.agentType,
      details: {
        permissionId,
        toolName: request.toolName,
        decision: "timeout",
        timeoutMs: PERMISSION_TIMEOUT_MS,
      },
    });

    // Notify Telegram (via callback)
    this.deps.onPermissionTimeout?.(request);

    // Clean up
    this.pending.delete(permissionId);
    this.timeouts.delete(permissionId);
  }

  private generatePermissionId(): string {
    return `${PERMISSION_ID_PREFIX}${Date.now()}_${randomBytes(4).toString("hex")}`;
  }
}
