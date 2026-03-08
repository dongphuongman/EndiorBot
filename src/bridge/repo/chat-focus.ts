/**
 * Chat Focus Manager
 *
 * Per-chatId focus tracking at ~/.endiorbot/chat-focus.json.
 * Determines which repo a Telegram chat is targeting.
 *
 * @module bridge/repo/chat-focus
 * @version 1.0.0
 * @authority ADR-024 D4, Sprint 83
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { ChatFocus, ChatFocusRegistryFile } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_DIR = join(homedir(), ".endiorbot");
const FOCUS_PATH = join(REGISTRY_DIR, "chat-focus.json");

// ============================================================================
// Checksum
// ============================================================================

function computeChecksum(data: Omit<ChatFocusRegistryFile, "checksum">): string {
  const payload = JSON.stringify({ version: data.version, entries: data.entries });
  return createHash("sha256").update(payload).digest("hex");
}

// ============================================================================
// ChatFocusManager
// ============================================================================

export class ChatFocusManager {
  private focusPath: string;

  constructor(focusPath?: string) {
    this.focusPath = focusPath ?? FOCUS_PATH;
  }

  private read(): ChatFocusRegistryFile {
    if (!existsSync(this.focusPath)) {
      return { version: 0, checksum: "", entries: [] };
    }

    try {
      const raw = readFileSync(this.focusPath, "utf-8");
      return JSON.parse(raw) as ChatFocusRegistryFile;
    } catch {
      return { version: 0, checksum: "", entries: [] };
    }
  }

  /**
   * Write atomically: write-to-tmp + renameSync (MF-3).
   */
  private write(data: ChatFocusRegistryFile): void {
    const dir = join(this.focusPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    data.version += 1;
    data.checksum = computeChecksum(data);
    const tmpPath = this.focusPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmpPath, this.focusPath);
  }

  /**
   * Get the current focus for a chat.
   */
  getFocus(chatId: string): ChatFocus | null {
    const registry = this.read();
    return registry.entries.find((e) => e.chatId === chatId) ?? null;
  }

  /**
   * Set focus for a chat to a specific repo.
   */
  setFocus(chatId: string, repoName: string): void {
    const registry = this.read();
    const idx = registry.entries.findIndex((e) => e.chatId === chatId);

    const entry: ChatFocus = {
      chatId,
      repoName,
      setAt: new Date().toISOString(),
    };

    if (idx !== -1) {
      registry.entries[idx] = entry;
    } else {
      registry.entries.push(entry);
    }

    this.write(registry);
  }

  /**
   * Clear focus for a chat.
   */
  clearFocus(chatId: string): boolean {
    const registry = this.read();
    const idx = registry.entries.findIndex((e) => e.chatId === chatId);
    if (idx === -1) return false;

    registry.entries.splice(idx, 1);
    this.write(registry);
    return true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalChatFocusManager: ChatFocusManager | undefined;

export function getChatFocusManager(): ChatFocusManager {
  if (!globalChatFocusManager) {
    globalChatFocusManager = new ChatFocusManager();
  }
  return globalChatFocusManager;
}

export function resetChatFocusManager(): void {
  globalChatFocusManager = undefined;
}
