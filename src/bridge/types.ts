/**
 * Bridge Types
 *
 * Core types for Notification Bridge + Multi-Agent Session Management.
 *
 * @module bridge/types
 * @version 1.1.0
 * @date 2026-03-07
 * @authority ADR-024 Notification Bridge
 * @stage 04 - BUILD (Sprint 82, 82.5, 83)
 */

import type { AgentRole } from "./intelligence/envelope.js";
import type { TeamId } from "../agents/types/team.js";

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
  /** Agent role persona (Sprint 84 — SOUL Bridge) */
  agentRole?: AgentRole;
  /** SHA256 hash of the SOUL content injected at launch (Sprint 84) */
  soulContentHash?: string;
  /** SHA256 hash of Brain L4 content injected at launch (Sprint 87) */
  brainContentHash?: string;
  /** SHA256 hash of Context content injected at launch (Sprint 87) */
  contextHash?: string;
  /** Team ID for team-mode sessions (Sprint 90 — ADR-026) */
  teamId?: TeamId;
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
// Launch Options (Sprint 84 — ADR-025)
// ============================================================================

/**
 * Options for launching an AI agent via AgentLauncher.
 */
export interface LaunchOptions {
  agentType: AgentProviderType;
  projectPath: string;
  actorId: string;
  riskMode?: SessionRiskMode;
  /** Agent role for SOUL injection (Sprint 84 — ADR-025) */
  agentRole?: AgentRole;
  /** Team ID for team-mode launch (Sprint 90 — ADR-026) */
  teamId?: TeamId;
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
  // Sprint 83 — Managed Shell (ADR-024 D4)
  /** Max shell sessions per repo (default 1) */
  shellSessionsPerRepo: number;
  /** Max total shell sessions across all repos (default 3) */
  maxShellSessions: number;
  /** Actor IDs allowed to use /sh, /run, /cp commands */
  shellActorAllowlist: string[];
  // Sprint 91 — Team Monitoring (ADR-026, CTO A4)
  /** Cost threshold for team sessions in USD (default 5.0) */
  teamCostThresholdUsd: number;
  /** Seconds of idle before member classified "stuck" (default 180) */
  teamStuckIdleThresholdSec: number;
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
  | "identity_link"
  // Sprint 83 — Repo Context, Copilot CLI, Managed Shell
  | "repo_focus"
  | "copilot_detect"
  | "copilot_suggest"
  | "copilot_explain"
  | "shell_send"
  | "shell_capture"
  | "run_request"
  | "run_approved"
  | "run_rejected"
  | "run_executed"
  // Sprint 84 — SOUL Bridge
  | "soul_strategy_selected"
  // Sprint 86 — /send Command
  | "send_command"
  // Sprint 87 — Brain L4 + Context Anchoring
  | "brain_context_injected"
  // Sprint 88 — Evaluator + Vibecoding
  | "evaluation_recorded"
  // Sprint 90 — Agent Teams Telegram
  | "team_launch"
  | "complexity_gate_decision"
  | "team_launch_aborted"
  // Sprint 91 — Team Monitoring + Lifecycle
  | "team_status_checked"
  | "team_cost_threshold"
  | "team_cost_extended"
  | "team_killed";

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
// Permission Request (Sprint 85 — ADR-024 §8.4)
// ============================================================================

export type PermissionDecision = "approve" | "deny" | "timeout";

/**
 * A pending permission request forwarded from a Claude Code hook.
 */
export interface PermissionRequest {
  /** Unique permission ID (perm_<timestamp>_<hex>) */
  id: string;
  /** Associated bridge session */
  sessionId: string;
  /** tmux target for sendKeys relay */
  tmuxTarget: string;
  /** Agent provider type */
  agentType: AgentProviderType;
  /** Tool requesting permission (Bash, Edit, Write, etc.) */
  toolName: string;
  /** File path affected (if applicable) */
  filePath?: string;
  /** Risk mode of the operation */
  riskMode: string;
  /** HMAC nonce (for audit linkage) */
  nonce: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 expiry timestamp (5 min TTL) */
  expiresAt: string;
  /** Final decision (set on resolve) */
  decision?: PermissionDecision;
  /** ISO 8601 decision timestamp */
  decidedAt?: string;
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

// ============================================================================
// ExecRunner Contract (ADR-024 A7, CTO C3)
// ============================================================================

/**
 * Options for ExecRunner.exec().
 */
export interface ExecOpts {
  /** Working directory */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Environment variables (replaces process.env entirely) */
  env?: Record<string, string>;
}

/**
 * Result of ExecRunner.exec().
 */
export interface ExecResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
}

/**
 * ExecRunner — dependency-injectable subprocess executor.
 *
 * Implementation MUST use execFile() from node:child_process.
 * NEVER exec(), spawn({shell: true}), or child_process.exec().
 * Matches TmuxBridge pattern from Sprint 82.
 *
 * @authority ADR-024 A7
 */
export interface ExecRunner {
  exec(binary: string, args: string[], opts?: ExecOpts): Promise<ExecResult>;
}
