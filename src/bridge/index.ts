/**
 * Bridge Module — Barrel Exports
 *
 * Notification Bridge + Multi-Agent Session Management.
 *
 * @module bridge
 * @version 1.0.0
 * @authority ADR-024
 * @stage 04 - BUILD (Sprint 82)
 */

// Types
export type {
  AgentProviderType,
  SessionRiskMode,
  SessionStatus,
  BridgeSession,
  SessionRegistryFile,
  BridgePolicy,
  HookEventType,
  AgentHookEvent,
  BridgeAuditEventType,
  BridgeAuditActor,
  BridgeAuditEntry,
  RedactResult,
} from "./types.js";

export {
  AGENT_COMMANDS,
  VALID_AGENT_TYPES,
  CAPTURE_LINE_LIMITS,
} from "./types.js";

// Security
export { sanitizeBridgeInput } from "./security/input-sanitizer.js";
export { redactBridgeOutput } from "./security/output-redactor.js";
export {
  BridgeAuditLogger,
  getBridgeAuditLogger,
  resetBridgeAuditLogger,
} from "./security/bridge-audit.js";
export {
  BridgePolicyManager,
  getBridgePolicyManager,
  resetBridgePolicyManager,
  DEFAULT_BRIDGE_POLICY,
} from "./security/bridge-policy.js";

// Tmux
export {
  TmuxBridge,
  getTmuxBridge,
  resetTmuxBridge,
} from "./tmux/tmux-bridge.js";

// Session Registry
export {
  SessionRegistry,
  getSessionRegistry,
  resetSessionRegistry,
} from "./session-registry.js";

// Agent Launcher
export {
  AgentLauncher,
  getAgentLauncher,
  resetAgentLauncher,
} from "./agent-launcher.js";
export type { LaunchOptions, LaunchResult } from "./agent-launcher.js";
