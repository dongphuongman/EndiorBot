/**
 * Token Counter
 *
 * Estimates token count for messages.
 * Uses simple heuristic (4 chars ≈ 1 token) for portability.
 * Can be replaced with tiktoken for accuracy.
 */

import type { Message } from "../providers/types.js";

// Average chars per token (conservative estimate)
const CHARS_PER_TOKEN = 4;

// Overhead per message (role tokens, separators)
const MESSAGE_OVERHEAD = 4;

export class TokenCounter {
  /**
   * Count tokens in a text string.
   */
  count(text: string): number {
    if (!text) return 0;
    // Simple heuristic: ~4 characters per token
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Count tokens in a single message.
   */
  countMessage(message: Message): number {
    const content = typeof message.content === "string"
      ? message.content
      : message.content
          .filter((c) => c.type === "text" && "text" in c)
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("\n");

    return this.count(content) + MESSAGE_OVERHEAD;
  }

  /**
   * Count tokens in an array of messages.
   */
  countMessages(messages: Message[]): number {
    return messages.reduce((total, msg) => total + this.countMessage(msg), 0);
  }

  /**
   * Estimate if content will fit within a token budget.
   */
  willFit(content: string, budget: number): boolean {
    return this.count(content) <= budget;
  }

  /**
   * Truncate text to fit within a token budget.
   */
  truncateToFit(text: string, maxTokens: number): string {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + "...";
  }
}

// Singleton instance
let globalCounter: TokenCounter | undefined;

export function getTokenCounter(): TokenCounter {
  if (!globalCounter) {
    globalCounter = new TokenCounter();
  }
  return globalCounter;
}
