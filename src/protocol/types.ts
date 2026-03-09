/**
 * Canonical Protocol Types — EndiorBot lingua franca.
 *
 * These types define the canonical message format used across all layers.
 * Portable to MTClaw / SDLC Orchestrator (ADR-002: zero runtime coupling).
 *
 * IMPORTANT: This file must import ZERO modules from src/.
 * Only standard TypeScript types allowed — pure protocol definitions.
 *
 * @module protocol/types
 * @version 1.0.0
 * @authority Sprint 94 Plan (D1) + ADR-002
 * @sprint 94
 */

// ============================================================================
// Channel Sources
// ============================================================================

/**
 * Channel source identifier.
 * String union (not enum) to avoid runtime artifacts — ADR-002 portability.
 */
export type ChannelSource =
  | "telegram"
  | "zalo"
  | "web"
  | "webhook"
  | "cli"
  | "desktop";

/** All valid channel sources */
export const CHANNEL_SOURCES: readonly ChannelSource[] = [
  "telegram", "zalo", "web", "webhook", "cli", "desktop",
] as const;

// ============================================================================
// EndiorMessage — Canonical Inbound Message
// ============================================================================

/**
 * Canonical inbound message.
 *
 * All incoming messages from any channel normalize to this type.
 * This is the "Level 0" raw canonical representation.
 *
 * CTO F1: All timestamps are ISO 8601 strings (not Date objects)
 * for JSON serialization consistency with WebSocket/audit logs.
 *
 * CTO F4: Message IDs use `${channel}-${vendorId}` format for traceability.
 */
export interface EndiorMessage {
  /** Unique message ID — format: `${channel}-${vendorId}` (CTO F4) */
  id: string;
  /** Channel source */
  channel: ChannelSource;
  /** Sender identifier (channel-specific user/chat ID) */
  senderId: string;
  /** Message content (text only for v1) */
  content: string;
  /** When the message was received — ISO 8601 string (CTO F1) */
  receivedAt: string;
  /** Optional reply-to message ID */
  replyToId?: string;
  /** Optional sender display name */
  senderName?: string;
  /** Vendor-specific metadata (non-portable, opaque) */
  vendorMeta?: Record<string, unknown>;
}

// ============================================================================
// EndiorRequest — Enriched Message Ready for Processing
// ============================================================================

/**
 * Enriched message after sanitization + policy check.
 *
 * Adds security/policy context. Created by GatewayIngress
 * after input validation and rate limit checks.
 */
export interface EndiorRequest {
  /** The original canonical message */
  message: EndiorMessage;
  /** Whether message passed sanitization */
  sanitized: boolean;
  /** Whether message passed policy check (rate limits, etc.) */
  policyAllowed: boolean;
  /** Linked actor ID if identity is linked */
  actorId?: string;
  /** Security violations detected (empty = clean) */
  violations: string[];
  /** Policy denial reason if blocked */
  policyDenialReason?: string;
  /** Processing timestamp — ISO 8601 string (CTO F1) */
  processedAt: string;
}

// ============================================================================
// EndiorResponse — Canonical Outbound Response
// ============================================================================

/**
 * Canonical outbound response.
 *
 * All outbound responses normalize to this before
 * channel-specific formatting (truncation, markdown stripping, etc.).
 */
export interface EndiorResponse {
  /** Response text content */
  text: string;
  /** Preferred format (channels may override per vendor limits) */
  format?: "markdown" | "plain" | "html";
  /** Optional reply markup (vendor-specific, opaque) */
  replyMarkup?: unknown;
  /** Response metadata */
  meta?: EndiorResponseMeta;
}

/**
 * Response metadata — agent/provider/timing info.
 */
export interface EndiorResponseMeta {
  /** Which agent produced this response */
  agent?: string;
  /** AI provider used */
  provider?: string;
  /** Processing duration in ms */
  durationMs?: number;
}
