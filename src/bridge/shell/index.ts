/**
 * Shell Session Manager — Barrel Exports
 *
 * @module bridge/shell
 * @authority ADR-024 D4, Sprint 83
 */

export type { TmuxClient, TmuxSessionResult, MarkerResult, CommandQueueEntry } from "./types.js";
export { isAllowed } from "./shell-allowlist.js";
export { ShellSessionManager } from "./shell-session-manager.js";
