/**
 * Workspace Resolver — Shared function for per-chat workspace resolution.
 *
 * Bridges ChatFocusManager + RepoRegistry to resolve the workspace
 * directory for a given chat. Used by GatewayIngress, CommandDispatcher,
 * and bridge launcher.
 *
 * @module bridge/repo/workspace-resolver
 * @version 1.0.0
 * @authority ADR-029 AD-1, Sprint 99
 * @sprint 99
 */

import { getChatFocusManager } from "./chat-focus.js";
import { getRepoRegistry } from "./repo-registry.js";

/**
 * Resolve workspace directory for a chat.
 *
 * Looks up the chat's focused repo via ChatFocusManager,
 * then resolves the absolute path via RepoRegistry.
 * Falls back to the provided default if no focus or repo not found.
 *
 * @param chatId - Chat/conversation identifier
 * @param fallback - Default workspace path when no focus is set
 * @returns Absolute path to workspace directory
 */
export function resolveWorkspace(chatId: string, fallback: string): string {
  const focus = getChatFocusManager().getFocus(chatId);
  if (!focus) return fallback;

  const repo = getRepoRegistry().get(focus.repoName);
  return repo?.path ?? fallback;
}
