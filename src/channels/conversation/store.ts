/**
 * Conversation Store
 *
 * Persists multi-turn conversation history per OTT chat ID.
 * Enables CEO to continue conversations without repeating context.
 *
 * Storage: in-memory Map (resets on restart — acceptable for single-user tool).
 * Max turns enforced per chat to prevent unbounded memory growth.
 *
 * @module channels/conversation/store
 * @version 1.0.0
 * @date 2026-03-05
 * @status ACTIVE - Sprint 78
 * @authority ADR-021 Local Ollama Router + Conversation Persistence
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A single turn in a conversation.
 */
export interface ConversationTurn {
  /** Speaker role */
  role: "user" | "assistant";
  /** Message content */
  content: string;
  /** When this turn was recorded */
  timestamp: Date;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum number of turns to retain per chat. */
export const DEFAULT_MAX_TURNS = 10;

// ============================================================================
// ConversationStore
// ============================================================================

/**
 * In-memory conversation history keyed by chat ID.
 *
 * Thread-safe for single-process (no async locking needed).
 */
export class ConversationStore {
  private readonly store = new Map<string, ConversationTurn[]>();
  private readonly maxTurns: number;

  constructor(maxTurns = DEFAULT_MAX_TURNS) {
    this.maxTurns = maxTurns;
  }

  /**
   * Append a turn to the conversation for a chat.
   * Evicts oldest turn when maxTurns is exceeded.
   */
  add(chatId: string, role: "user" | "assistant", content: string): void {
    const turns = this.store.get(chatId) ?? [];
    turns.push({ role, content, timestamp: new Date() });

    // Evict oldest to stay within maxTurns
    while (turns.length > this.maxTurns) {
      turns.shift();
    }

    this.store.set(chatId, turns);
  }

  /**
   * Get conversation history for a chat (chronological order, oldest first).
   * Returns empty array for unknown chatId.
   */
  get(chatId: string): ConversationTurn[] {
    return this.store.get(chatId) ?? [];
  }

  /**
   * Number of turns stored for a chat.
   */
  size(chatId: string): number {
    return this.store.get(chatId)?.length ?? 0;
  }

  /**
   * Clear conversation history for a specific chat.
   */
  clear(chatId: string): void {
    this.store.delete(chatId);
  }

  /**
   * Clear all conversation histories.
   */
  clearAll(): void {
    this.store.clear();
  }

  /**
   * Number of distinct chats tracked.
   */
  chatCount(): number {
    return this.store.size;
  }

  /**
   * Check if there is history for a chat.
   */
  hasHistory(chatId: string): boolean {
    return (this.store.get(chatId)?.length ?? 0) > 0;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _instance: ConversationStore | null = null;

/**
 * Get the shared ConversationStore instance.
 */
export function getConversationStore(): ConversationStore {
  if (!_instance) {
    _instance = new ConversationStore();
  }
  return _instance;
}

/**
 * Reset singleton (for testing).
 */
export function resetConversationStore(): void {
  _instance = null;
}
