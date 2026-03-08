/**
 * Repo Context — Barrel Exports
 *
 * @module bridge/repo
 * @authority ADR-024 D4, Sprint 83
 */

export type { RepoConfig, ReposRegistryFile, RepoRiskProfile, ChatFocus, ChatFocusRegistryFile } from "./types.js";
export { RepoRegistry, getRepoRegistry, resetRepoRegistry, validateRepoPath } from "./repo-registry.js";
export type { PathValidationResult } from "./repo-registry.js";
export { ChatFocusManager, getChatFocusManager, resetChatFocusManager } from "./chat-focus.js";
