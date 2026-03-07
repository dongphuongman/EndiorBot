/**
 * Bridge Types
 *
 * Core types for Notification Bridge + Multi-Agent Session Management.
 *
 * @module bridge/types
 * @version 1.0.0
 * @date 2026-03-06
 * @authority ADR-024 Notification Bridge
 * @stage 04 - BUILD (Sprint 82)
 */

// ============================================================================
// Agent Provider Types
// ============================================================================

/**
 * Supported AI agent CLI providers.
 * copilot-chat excluded (no CLI/tmux integration path — ADR-024 BLOCK-4).
 */
export type AgentProviderType = "claude-code" | "cursor" | "codex-cli" | "gemini-cli";

/**
 * CLI commands to launch each agent type.
 */
export const AGENT_COMMANDS: Record<AgentProviderType, string> = {
  "claude-code": "claude",
  "cursor": "cursor agent --force",
  "codex-cli": "codex",
  "gemini-cli": "gemini",
};

/**
 * All valid agent provider types (for validation).
 */
export const VALID_AGENT_TYPES: AgentProviderType[] = [
  "claude-code", "cursor", "codex-cli", "gemini-cli",
];

// ============================================================================
// Risk Mode (ADR-024 D2)
// ============================================================================

/**
 * Session risk mode governs sendKeys and capture capabilities.
 *
 * - read: plain text prompts only, max 30 capture lines
 * - patch: prompts + apply patch workflow, max 50 capture lines
 * - interactive: broader input, max 100 capture lines, permission required
 */
export type SessionRiskMode = "read" | "patch" | "interactive";

/**
 * Capture line limits per risk mode.
 */
export const CAPTURE_LINE_LIMITS: Record<SessionRiskMode, number> = {
  read: 30,
  patch: 50,
  interactive: 100,
};

// ============================================================================
// Bridge Session
// ============================================================================

export type SessionStatus = "active" | "stopped" | "error";

/**
 * A bridge session represents an AI agent running in a tmux pane.
 */
export interface BridgeSession {
  /** Unique session ID (format: bridge_<timestamp>_<random>) */
  id: string;
  /** AI agent type */
  agentType: AgentProviderType;
  /** tmux target (e.g. "endiorbot:claude.0") */
  tmuxTarget: string;
  /** tmux session name (e.g. "endiorbot") */
  tmuxSessionName: string;
  /** Project directory path */
  projectPath: string;
  /** sha256(projectPath + gitRemoteUrl) — prevents wrong-repo confusion */
  workspaceFingerprint: string;
  /** Current session status */
  status: SessionStatus;
  /** Risk mode (governs sendKeys + capture capabilities) */
  riskMode: SessionRiskMode;
  /** PID of the agent process (if known) */
  providerPid?: number;
  /** Last error message */
  lastError?: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last activity timestamp */
  lastActivityAt: string;
}

// ============================================================================
// Session Registry File
// ============================================================================

/**
 * File-backed session registry format.
 * Includes version + checksum for corruption detection.
 */
export interface SessionRegistryFile {
  /** Incremented on each write */
  version: number;
  /** sha256 of JSON content (excluding checksum field) */
  checksum: string;
  /** All bridge sessions */
  sessions: BridgeSession[];
}

// ============================================================================
// Bridge Policy (ADR-024 A4)
// ============================================================================

/**
 * Bridge policy governs rate limits, session limits, and security constraints.
 */
export interface BridgePolicy {
  /** Allowed agent types (whitelist) */
  allowedAgentTypes: AgentProviderType[];
  /** Max sessions per agent type */
  maxSessionsPerAgent: number;
  /** Max total sessions across all types */
  maxTotalSessions: number;
  /** Telegram command rate limits */
  telegramRateLimit: {
    commandsPerMinute: number;
    sendKeysPerMinute: number;
  };
  /** Min interval between sendKeys to same session (ms) */
  perSessionSendKeysInterval: number;
  /** Max sendKeys input length (chars) */
  sendKeysMaxLength: number;
  /** Additional capture redaction patterns */
  captureRedactPatterns: string[];
  /** Block sendKeys to bare shell panes (always true — safety invariant) */
  shellPanesDisabled: boolean;
}

// ============================================================================
// Hook Events
// ============================================================================

export type HookEventType = "stop" | "permission_request";

/**
 * Event from an AI agent hook (e.g. Claude Code Stop hook).
 */
export interface AgentHookEvent {
  /** Event type */
  eventType: HookEventType;
  /** Agent type that fired the event */
  agentType: AgentProviderType;
  /** Associated bridge session ID */
  sessionId: string;
  /** tmux target of the pane */
  tmuxTarget: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** HMAC-SHA256 signature */
  hmacSignature: string;
  /** Nonce (format: sessionId:randomHex) */
  nonce: string;
  /** Event-specific payload */
  payload: Record<string, unknown>;
}

// ============================================================================
// Audit Events
// ============================================================================

export type BridgeAuditEventType =
  | "session_create"
  | "session_kill"
  | "send_keys"
  | "capture"
  | "capture_blocked"
  | "hook_stop"
  | "hook_permission"
  | "permission_decision"
  | "policy_violation"
  | "identity_link";

export type BridgeAuditActor = "telegram" | "hook" | "system";

/**
 * Bridge audit log entry (appended to bridge_event_log.jsonl).
 */
export interface BridgeAuditEntry {
  /** ISO 8601 timestamp */
  ts: string;
  /** Unique entry ID (inv_<timestamp>_<random>) */
  id: string;
  /** Event type */
  event: BridgeAuditEventType;
  /** Associated session ID */
  sessionId?: string;
  /** Agent type */
  agentType?: string;
  /** Actor identity (from /link) */
  actorId: string;
  /** Actor type */
  actor: BridgeAuditActor;
  /** Event-specific details */
  details: Record<string, unknown>;
}

// ============================================================================
// Redact Result
// ============================================================================

/**
 * Result of output redaction.
 */
export interface RedactResult {
  /** Whether the entire output was blocked (not sent to Telegram) */
  blocked: boolean;
  /** Redacted content (empty string if blocked) */
  content: string;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Credential violations found */
  violations: string[];
}
