/**
 * Patch Flow — CEO approval + execution for PATCH mode
 *
 * Standalone functions extracted from ChannelRouter (Sprint 121 T3).
 * CTO C1: Explicit params, not class delegation.
 *
 * @module agents/router/patch-flow
 * @sprint 121 — Track 3
 */

import type { ClaudeCodeBridge } from "../invoke/index.js";
import type { AgentRole } from "../types/handoff.js";
import { PATCH_CONFIRMATION_TTL_MS, PATCH_SCOPE_SYSTEM_PROMPT, MAX_PATCH_FILES } from "../intelligence/patch-budget.js";
// CSO audit: agents/ importing from gateway/ is an architectural inversion.
// approval.ts doesn't import from agents/ so no runtime cycle exists,
// but this should be refactored to a neutral module (src/approval/) in a future sprint.
import { createApprovalRequest, waitForApproval } from "../../gateway/methods/approval.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import type { ChannelSendFn } from "../../bus/types.js";
import type { ChannelRouterConfig, AIResult } from "../channel-router.js";

// ============================================================================
// Patch Flow Dependencies (CTO C1: explicit params)
// ============================================================================

export interface PatchFlowDeps {
  bridge: ClaudeCodeBridge | null;
  config: ChannelRouterConfig;
}

// ============================================================================
// Patch Confirmation
// ============================================================================

/**
 * Request CEO confirmation for a PATCH operation.
 * TTL: 5 minutes. On expiry → auto-decline → READ fallback. (CTO C1)
 */
export async function requestPatchConfirmation(
  deps: PatchFlowDeps,
  agent: string,
  task: string,
  intent: { confidence: number; reason: string },
  workspace?: string,
  notifyFn?: ChannelSendFn,
): Promise<boolean> {
  const approvalRequest = createApprovalRequest("action", `@${agent} wants to modify files`, {
    details: {
      agent,
      task: task.slice(0, 200),
      intent: "PATCH",
      confidence: intent.confidence,
      reason: intent.reason,
      workspace: workspace ?? deps.config.projectRoot,
      instructions: `Use /approve ${"{id}"} to allow or /reject ${"{id}"} to keep as read-only suggestion.`,
    },
    expiresInMs: PATCH_CONFIRMATION_TTL_MS, // 5 minutes (CTO C1)
  });

  getBridgeAuditLogger().log({
    event: "patch_confirmation_requested",
    actorId: "system",
    actor: "system",
    details: { approvalId: approvalRequest.id, agent, task: task.slice(0, 100) },
  });

  // Sprint 115 (T3): Immediately notify CEO about pending approval — before waitForApproval blocks
  if (notifyFn) {
    const approvalMsg = `🔐 *PATCH approval required*\n@${agent} wants to modify files.\n\nApproval ID: \`${approvalRequest.id}\`\nUse /approve ${approvalRequest.id} to allow or /reject ${approvalRequest.id} to cancel.\nExpires in 5 min.`;
    notifyFn(approvalMsg).catch(() => {}); // best-effort, non-blocking
  }

  try {
    const result = await waitForApproval(approvalRequest.id, PATCH_CONFIRMATION_TTL_MS);

    if (result.status === "approved") {
      getBridgeAuditLogger().log({
        event: "patch_confirmation_approved",
        actorId: result.respondedBy ?? "ceo",
        actor: "system",
        details: { approvalId: approvalRequest.id, agent },
      });
      return true;
    }

    if (result.status === "expired") {
      getBridgeAuditLogger().log({
        event: "patch_confirmation_expired",
        actorId: "system",
        actor: "system",
        details: { approvalId: approvalRequest.id, agent, task: task.slice(0, 100) },
      });
    } else {
      getBridgeAuditLogger().log({
        event: "patch_confirmation_rejected",
        actorId: result.respondedBy ?? "ceo",
        actor: "system",
        details: { approvalId: approvalRequest.id, agent, notes: result.notes },
      });
    }

    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// Patch Execution
// ============================================================================

/**
 * Execute @agent in PATCH mode (confirmed by CEO).
 * Injects scope system prompt (max 5 files). (CPO C9, CTO C2)
 */
export async function executePatch(
  deps: PatchFlowDeps,
  agent: string,
  task: string,
  soulPrompt: string,
  workspace?: string,
  model?: string,
): Promise<AIResult | null> {
  if (!deps.bridge) return null;

  const ws = workspace ?? deps.config.projectRoot;
  // Inject scope cap system prompt (CTO C2: soft cap via prompt)
  const systemPrompt = soulPrompt + "\n\n" + PATCH_SCOPE_SYSTEM_PROMPT;

  try {
    const response = await deps.bridge.invokePatch({
      systemPrompt,
      userPrompt: task,
      workspace: ws,
      agent: agent as AgentRole,
      timeout: deps.config.claudeTimeout,
      maxTokens: deps.config.claudeMaxTokens,
      model: model ?? "sonnet",
    });

    if (!response.success) {
      console.warn(`[Router] PATCH execution failed: ${response.error}`);
      return null;
    }

    // Post-execution audit: check if file cap was exceeded (CTO C2 safety net)
    const fileCount = response.affectedFiles?.length ?? 0;
    if (fileCount > MAX_PATCH_FILES) {
      getBridgeAuditLogger().log({
        event: "patch_scope_exceeded",
        actorId: "system",
        actor: "system",
        details: { agent, fileCount, limit: MAX_PATCH_FILES, workspace: ws },
      });
      const exceeded = `\n\n⚠️ Note: ${fileCount} files modified (limit ${MAX_PATCH_FILES}). Review git diff.`;
      return {
        content: (response.output ?? "") + exceeded,
        provider: "claude-code-patch",
        durationMs: response.durationMs,
      };
    }

    return {
      content: response.output ?? "",
      provider: "claude-code-patch",
      durationMs: response.durationMs,
    };
  } catch (e) {
    console.warn(`[Router] PATCH execution failed: ${(e as Error).message}`);
    return null;
  }
}
