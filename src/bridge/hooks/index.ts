/**
 * Hooks Module — Barrel Exports
 *
 * Permission Approval via Telegram for Claude Code hook events.
 *
 * @module bridge/hooks
 * @version 1.0.0
 * @authority ADR-024 §8.4
 * @stage 04 - BUILD (Sprint 85)
 */

export { HookVerifier } from "./hook-verifier.js";
export type { NonceValidationResult } from "./hook-verifier.js";

export { processHookEvent, buildHmacPayload } from "./hook-handler.js";
export type { HookHandlerResult, HookHandlerDeps } from "./hook-handler.js";

export { PermissionRelay, PERMISSION_TIMEOUT_MS } from "./permission-relay.js";
export type {
  CreatePermissionParams,
  PermissionRelayDeps,
  PermissionDecisionResult,
} from "./permission-relay.js";

// Sprint 86 — Hook Installer
export { installHooks } from "./hook-installer.js";
export type { InstallHooksOptions, InstallHooksResult, HookDetail } from "./hook-installer.js";
