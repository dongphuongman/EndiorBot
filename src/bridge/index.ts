/**
 * Bridge Module — Barrel Exports
 *
 * Notification Bridge + Multi-Agent Session Management.
 *
 * @module bridge
 * @version 1.1.0
 * @authority ADR-024
 * @stage 04 - BUILD (Sprint 82, 82.5, 83)
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
  // Sprint 83 — ExecRunner
  ExecOpts,
  ExecResult,
  ExecRunner,
  // Sprint 84 — SOUL Bridge
  LaunchOptions,
  // Sprint 85 — Permission Approval
  PermissionDecision,
  PermissionRequest,
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
export type { LaunchResult } from "./agent-launcher.js";

// Sprint 83 — Repo Context
export type {
  RepoConfig,
  ReposRegistryFile,
  RepoRiskProfile,
  ChatFocus,
  ChatFocusRegistryFile,
} from "./repo/index.js";
export {
  RepoRegistry,
  getRepoRegistry,
  resetRepoRegistry,
  validateRepoPath,
  ChatFocusManager,
  getChatFocusManager,
  resetChatFocusManager,
} from "./repo/index.js";

// Sprint 83 — Copilot CLI Bridge
export { CopilotBridge, stripAnsi } from "./copilot/index.js";
export type { CopilotToolKind, CopilotDetectResult } from "./copilot/index.js";

// Sprint 83 — Shell Session Manager
export { isAllowed, ShellSessionManager } from "./shell/index.js";
export type { TmuxClient, TmuxSessionResult, MarkerResult } from "./shell/index.js";

// Sprint 85 — Permission Approval via Telegram
export {
  HookVerifier,
  processHookEvent,
  buildHmacPayload,
  PermissionRelay,
  PERMISSION_TIMEOUT_MS,
} from "./hooks/index.js";
export type {
  NonceValidationResult,
  HookHandlerResult,
  HookHandlerDeps,
  CreatePermissionParams,
  PermissionRelayDeps,
  PermissionDecisionResult,
} from "./hooks/index.js";

// Sprint 86 — /send Command + Hook Installer
export { installHooks } from "./hooks/index.js";
export type { InstallHooksOptions, InstallHooksResult, HookDetail } from "./hooks/index.js";
export {
  buildTurnContext,
  loadTurnContextFromActive,
  TURN_CONTEXT_MAX_CHARS,
  incrementTurnCount,
  getTurnCount,
  shouldRefreshContext,
  resetTurnCount,
  REFRESH_INTERVAL,
} from "./intelligence/turn-context.js";
export type { TurnContextData } from "./intelligence/turn-context.js";

// Sprint 87 — Brain L4 + Context Anchoring
export type { BrainEnvelope, ContextEnvelope } from "./intelligence/envelope.js";
export { loadBrainL4, BRAIN_TOKEN_BUDGET } from "./intelligence/brain-loader.js";
export { buildContextEnvelope, CONTEXT_TOKEN_BUDGET } from "./intelligence/context-builder.js";
export {
  buildFullEnvelope,
  serializeEnvelopeForInjection,
} from "./intelligence/envelope-builder.js";

// Sprint 88 — Evaluator + Vibecoding
export type { EvaluatorEnvelope, EvaluatorSignals } from "./intelligence/envelope.js";
export { evaluateOutput } from "./intelligence/output-evaluator.js";
export type { EvaluationRecord } from "./intelligence/evaluation-store.js";
export {
  appendEvaluation,
  loadEvaluations,
  getEvaluationStorePath,
  generateEvaluationId,
} from "./intelligence/evaluation-store.js";

// Sprint 89 — Agent Teams
export type { TeamInstallResult } from "./intelligence/team-installer.js";
export { installTeams, TEAM_LEADERS } from "./intelligence/team-installer.js";
