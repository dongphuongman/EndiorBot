/**
 * Repo Context Types
 *
 * Types for repo registry and per-chat focus management.
 *
 * @module bridge/repo/types
 * @version 1.0.0
 * @authority ADR-024 D4, Sprint 83
 */

// ============================================================================
// Repo Config
// ============================================================================

export type RepoRiskProfile = "read-only" | "dev" | "deploy";

/**
 * A registered repository configuration.
 */
export interface RepoConfig {
  /** Short name (e.g. "endiorbot") */
  name: string;
  /** Absolute path on server */
  path: string;
  /** ISO 8601 registration timestamp */
  registeredAt: string;
  /** Default git branch */
  defaultBranch?: string;
  /** Risk profile for shell operations */
  riskProfile?: RepoRiskProfile;
  /** Environment variable names allowed in /run (default empty) */
  envAllowlist?: string[];
}

/**
 * File-backed repo registry format (~/.endiorbot/repos.json).
 */
export interface ReposRegistryFile {
  /** Incremented on each write */
  version: number;
  /** sha256 of JSON content (excluding checksum field) */
  checksum: string;
  /** Registered repositories */
  repos: RepoConfig[];
}

// ============================================================================
// Chat Focus
// ============================================================================

/**
 * Per-chat focus entry: which repo a Telegram chat is targeting.
 */
export interface ChatFocus {
  /** Telegram chat ID */
  chatId: string;
  /** Repo name (must exist in RepoRegistry) */
  repoName: string;
  /** ISO 8601 when focus was set */
  setAt: string;
}

/**
 * File-backed chat focus registry (~/.endiorbot/chat-focus.json).
 */
export interface ChatFocusRegistryFile {
  /** Incremented on each write */
  version: number;
  /** sha256 of JSON content (excluding checksum field) */
  checksum: string;
  /** Chat focus entries */
  entries: ChatFocus[];
}
