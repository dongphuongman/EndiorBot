/**
 * Protocol Validators — type guards and validation helpers.
 *
 * @module protocol/validators
 * @version 1.0.0
 * @authority Sprint 94 Plan (D1)
 * @sprint 94
 */

import { CHANNEL_SOURCES, type ChannelSource, type EndiorMessage } from "./types.js";

// ============================================================================
// Channel Source Validation
// ============================================================================

/**
 * Check if a string is a valid ChannelSource.
 */
export function isValidChannelSource(value: string): value is ChannelSource {
  return (CHANNEL_SOURCES as readonly string[]).includes(value);
}

// ============================================================================
// EndiorMessage Validation
// ============================================================================

/**
 * Type guard for EndiorMessage.
 *
 * Checks all required fields are present and correctly typed.
 * Does NOT validate content semantics (length, encoding, etc.).
 */
export function isValidEndiorMessage(value: unknown): value is EndiorMessage {
  if (value === null || typeof value !== "object") return false;

  const msg = value as Record<string, unknown>;

  // Required string fields
  if (typeof msg.id !== "string" || msg.id.length === 0) return false;
  if (typeof msg.channel !== "string" || !isValidChannelSource(msg.channel)) return false;
  if (typeof msg.senderId !== "string" || msg.senderId.length === 0) return false;
  if (typeof msg.content !== "string") return false;
  if (typeof msg.receivedAt !== "string" || msg.receivedAt.length === 0) return false;

  return true;
}

// ============================================================================
// Content Validation
// ============================================================================

/**
 * Validate message content against channel limits.
 *
 * Returns null if valid, or a reason string if invalid.
 */
export function validateMessageContent(
  content: string,
  maxLength: number,
): string | null {
  if (content.length === 0) {
    return "Empty message content";
  }
  if (content.length > maxLength) {
    return `Message exceeds ${maxLength} character limit (${content.length} chars)`;
  }
  return null;
}

// ============================================================================
// Message ID Generation (CTO F4)
// ============================================================================

let idCounter = 0;

/**
 * Generate a canonical message ID.
 *
 * CTO F4: Uses `${channel}-${vendorId}` format for traceability.
 * Falls back to `${channel}-${timestamp}-${counter}` when vendor ID unavailable.
 */
export function generateMessageId(channel: ChannelSource, vendorId?: string): string {
  if (vendorId) {
    return `${channel}-${vendorId}`;
  }
  idCounter++;
  return `${channel}-${Date.now()}-${idCounter}`;
}
