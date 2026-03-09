/**
 * Protocol Converters — bridge between old types and canonical types.
 *
 * These converters enable backward compatibility: existing InboundMessage,
 * OTTMessage, IncomingMessage types continue to work while canonical
 * EndiorMessage types are adopted incrementally.
 *
 * NOTE: This file imports from src/ (converters are EndiorBot-specific).
 * The types.ts file remains import-free for ADR-002 portability.
 *
 * @module protocol/converters
 * @version 1.0.0
 * @authority Sprint 94 Plan (D1)
 * @sprint 94
 */

import type { InboundMessage, InboundResponse } from "../gateway/ingress.js";
import type { OTTMessage } from "../channels/ott/message-router.js";
import type { IncomingMessage } from "../channels/types.js";
import type {
  EndiorMessage,
  EndiorResponse,
  ChannelSource,
} from "./types.js";
import { generateMessageId } from "./validators.js";

// ============================================================================
// InboundMessage ↔ EndiorMessage
// ============================================================================

/**
 * Convert a Gateway InboundMessage to canonical EndiorMessage.
 *
 * CTO F4: ID format is `${channel}-${vendorMessageId}` when available.
 * CTO F1: receivedAt is ISO 8601 string.
 */
export function fromInboundMessage(
  msg: InboundMessage,
  vendorMessageId?: string,
): EndiorMessage {
  const channel = msg.channel as ChannelSource;
  const id = generateMessageId(channel, vendorMessageId);

  const result: EndiorMessage = {
    id,
    channel,
    senderId: msg.senderId,
    content: msg.content,
    receivedAt: new Date().toISOString(),
  };

  // exactOptionalPropertyTypes: conditionally assign optional fields
  if (msg.metadata) result.vendorMeta = msg.metadata;

  return result;
}

/**
 * Convert a canonical EndiorMessage back to InboundMessage.
 *
 * Used when feeding canonical messages into existing GatewayIngress pipeline.
 */
export function toInboundMessage(msg: EndiorMessage): InboundMessage {
  const result: InboundMessage = {
    channel: msg.channel,
    senderId: msg.senderId,
    content: msg.content,
  };

  // exactOptionalPropertyTypes: conditionally assign
  if (msg.vendorMeta) result.metadata = msg.vendorMeta;

  return result;
}

// ============================================================================
// OTTMessage → EndiorMessage
// ============================================================================

/**
 * Convert an OTTMessage to canonical EndiorMessage.
 *
 * Maps `source` (OTTChannelSource) to `channel` (ChannelSource).
 * CTO F4: Uses existing `messageId` from OTTMessage.
 */
export function fromOTTMessage(msg: OTTMessage): EndiorMessage {
  // Map OTT source to ChannelSource (handle 'unknown' → 'webhook')
  const channelMap: Record<string, ChannelSource> = {
    telegram: "telegram",
    zalo: "zalo",
    whatsapp: "webhook",
    slack: "webhook",
    discord: "webhook",
    webhook: "webhook",
    unknown: "webhook",
  };

  const channel = channelMap[msg.source] ?? "webhook";

  const result: EndiorMessage = {
    id: generateMessageId(channel, msg.messageId),
    channel,
    senderId: msg.senderId,
    content: msg.content,
    receivedAt: msg.receivedAt.toISOString(),
  };

  // exactOptionalPropertyTypes: conditionally assign
  if (msg.replyTo) result.replyToId = msg.replyTo;
  if (msg.metadata) result.vendorMeta = msg.metadata;

  return result;
}

// ============================================================================
// IncomingMessage → EndiorMessage
// ============================================================================

/**
 * Convert an IncomingMessage to canonical EndiorMessage.
 *
 * Requires explicit channel parameter since IncomingMessage
 * doesn't carry channel info.
 */
export function fromIncomingMessage(
  msg: IncomingMessage,
  channel: ChannelSource,
): EndiorMessage {
  const result: EndiorMessage = {
    id: generateMessageId(channel, msg.messageId),
    channel,
    senderId: msg.senderId,
    content: msg.content,
    receivedAt: msg.receivedAt.toISOString(),
  };

  // exactOptionalPropertyTypes: conditionally assign
  if (msg.replyTo) result.replyToId = msg.replyTo;
  if (msg.senderName) result.senderName = msg.senderName;
  if (msg.metadata) result.vendorMeta = msg.metadata;

  return result;
}

// ============================================================================
// EndiorResponse → InboundResponse
// ============================================================================

/**
 * Convert a canonical EndiorResponse to InboundResponse.
 *
 * Used when returning responses through existing GatewayIngress pipeline.
 */
export function toInboundResponse(resp: EndiorResponse): InboundResponse {
  const result: InboundResponse = {
    text: resp.text,
  };

  // exactOptionalPropertyTypes: conditionally assign
  if (resp.format) result.format = resp.format;
  if (resp.replyMarkup) result.replyMarkup = resp.replyMarkup;

  return result;
}
