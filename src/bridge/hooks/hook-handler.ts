/**
 * Hook Handler
 *
 * Processes incoming Claude Code hook events.
 * Validates HMAC signature and nonce, then either auto-approves (read mode)
 * or forwards to PermissionRelay for Telegram notification.
 *
 * @module bridge/hooks/hook-handler
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-024 §8.4
 * @stage 04 - BUILD (Sprint 85)
 */

import type { AgentHookEvent } from "../types.js";
import type { HookVerifier } from "./hook-verifier.js";
import type { PermissionRelay } from "./permission-relay.js";

// ============================================================================
// Types
// ============================================================================

export interface HookHandlerResult {
  success: boolean;
  action: "auto_approved" | "forwarded" | "rejected";
  reason?: string;
  permissionId?: string;
}

export interface HookHandlerDeps {
  verifier: HookVerifier;
  relay: PermissionRelay;
}

// ============================================================================
// Hook Event Processing
// ============================================================================

/**
 * Build the canonical payload string used for HMAC signing.
 * Both the hook script (sender) and this handler (receiver) must use
 * the same field set and serialization order.
 */
export function buildHmacPayload(event: AgentHookEvent): string {
  return JSON.stringify({
    eventType: event.eventType,
    sessionId: event.sessionId,
    tmuxTarget: event.tmuxTarget,
    timestamp: event.timestamp,
    nonce: event.nonce,
    payload: event.payload,
  });
}

/**
 * Process an incoming hook event from Claude Code.
 *
 * Flow:
 * 1. Parse JSON
 * 2. Validate required fields
 * 3. Verify HMAC-SHA256 signature (CTO A1: timingSafeEqual)
 * 4. Validate nonce (single-use, 5-min TTL)
 * 5. Auto-approve if read mode operation
 * 6. Forward to PermissionRelay for Telegram notification
 */
export async function processHookEvent(
  raw: string,
  deps: HookHandlerDeps,
): Promise<HookHandlerResult> {
  // 1. Parse JSON
  let event: AgentHookEvent;
  try {
    event = JSON.parse(raw) as AgentHookEvent;
  } catch {
    return { success: false, action: "rejected", reason: "invalid JSON" };
  }

  // 2. Validate required fields
  if (!event.sessionId || !event.tmuxTarget || !event.hmacSignature || !event.nonce) {
    return { success: false, action: "rejected", reason: "missing required fields" };
  }

  if (!event.eventType) {
    return { success: false, action: "rejected", reason: "missing eventType" };
  }

  // 3. Verify HMAC (CTO A1: timingSafeEqual)
  const hmacPayload = buildHmacPayload(event);
  if (!deps.verifier.verifySignature(hmacPayload, event.hmacSignature)) {
    return { success: false, action: "rejected", reason: "HMAC verification failed" };
  }

  // 4. Validate nonce
  const nonceResult = deps.verifier.validateNonce(event.nonce);
  if (!nonceResult.valid) {
    return {
      success: false,
      action: "rejected",
      reason: nonceResult.reason ?? "nonce invalid",
    };
  }

  // 5. Extract tool info from payload (MF-2: validate string types)
  const rawToolName = event.payload["tool_name"];
  const toolName = typeof rawToolName === "string" ? rawToolName : "unknown";
  const rawFilePath = event.payload["file_path"];
  const filePath = typeof rawFilePath === "string" ? rawFilePath : undefined;
  const rawRiskMode = event.payload["risk_mode"];
  const riskMode = typeof rawRiskMode === "string" ? rawRiskMode : "read";

  // 6. Auto-approve read mode operations
  if (riskMode === "read") {
    await deps.relay.autoApprove(event.sessionId, event.tmuxTarget, toolName);
    return { success: true, action: "auto_approved" };
  }

  // 7. Forward to PermissionRelay for Telegram notification
  // exactOptionalPropertyTypes: build params, then conditionally set filePath
  const createParams: import("./permission-relay.js").CreatePermissionParams = {
    sessionId: event.sessionId,
    tmuxTarget: event.tmuxTarget,
    agentType: event.agentType,
    toolName,
    riskMode,
    nonce: event.nonce,
  };
  if (filePath) createParams.filePath = filePath;

  const permissionId = await deps.relay.createPermissionRequest(createParams);

  return { success: true, action: "forwarded", permissionId };
}
