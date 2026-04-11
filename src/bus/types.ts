/**
 * Message Bus Types — Sprint 106 (ADR-032)
 *
 * Pure type definitions — no imports from src/ modules.
 * Aligned with MTClaw internal/bus/types.go pattern.
 *
 * @module bus/types
 * @version 1.0.0
 * @authority ADR-032
 * @sprint 106
 */

// ============================================================================
// Correlation + Channel types
// ============================================================================

/**
 * Unique ID that ties an inbound request to its async outbound response.
 * Format: `${channel}-${senderId}-${Date.now()}`
 */
export type CorrelationId = string;

/**
 * Channel-specific send function registered by the adapter.
 * BusConsumer calls this to deliver the async response.
 *
 * Sprint 110 (Step 0.5): Added correlationId, isTrainableTurn, provider for RL feedback capture.
 * All new fields are optional — existing callers (Zalo, Web) are unaffected. See ADR-033 D4.
 */
export type ChannelSendFn = (
  text: string,
  opts?: {
    format?: string;
    /** App-level correlation ID for RL feedback linking (Sprint 110) */
    correlationId?: string;
    /** Whether this response is eligible for RL training (Sprint 110) */
    isTrainableTurn?: boolean;
    /** AI provider/model that generated this response (Sprint 110) */
    provider?: string;
    /**
     * Conversation context for RL training record (Sprint 111a).
     * Set to [{role: "user", content: <inbound_text>}] for trainable turns.
     */
    request?: Array<{ role: string; content: string }>;
    /** Sprint 114 (CTO C1): Token usage from AI call for RL pipeline */
    tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  },
) => Promise<boolean>;

// ============================================================================
// Bus Messages
// ============================================================================

// ============================================================================
// Active Memory types (Sprint 133 S1 — CTO C-SOFT-1)
// ============================================================================

/**
 * Active Memory context payload injected onto BusInboundMessage.metadata.
 *
 * Sprint 133 S1: Pre-dispatch hook fetches recent context and injects it here
 * so that GatewayIngress.handleInbound() can prepend it to the agent prompt.
 *
 * source:
 *   "cache"      — served from in-memory cache (≤50ms)
 *   "sub-agent"  — fetched fresh from session history / Brain L4 (≤300ms)
 *   "none"       — circuit breaker open or feature disabled (fail-open)
 */
export interface ActiveMemoryPayload {
  /** Injected context text (empty string when source is "none") */
  content: string;
  /** Estimated token count via Math.ceil(content.length / 4) */
  tokenCount: number;
  /** Fetch source — tells downstream how the context was obtained */
  source: "cache" | "sub-agent" | "none";
}

/**
 * Inbound bus message — wraps channel input with bus routing metadata.
 * Equivalent to MTClaw InboundMessage struct.
 *
 * NOTE: replyFn is non-serializable (function pointer).
 * Acceptable for in-process EventEmitterBus (Sprint 106).
 * Sprint 107+ Redis upgrade replaces with replyAddress + registry.
 */
export interface BusInboundMessage {
  /** Unique correlation ID for this request/response pair */
  correlationId: CorrelationId;
  /** Source channel identifier: "telegram", "web", "zalo", etc. */
  channel: string;
  /** Sender ID within the channel (user/chat ID) */
  senderId: string;
  /** Message content (text) */
  content: string;
  /** Optional vendor-specific metadata (chatId, messageId, username, etc.) */
  metadata?: Record<string, unknown>;
  /** Timestamp when message was published to the bus */
  enqueuedAt: number;
  /**
   * Channel-specific send function for async response delivery.
   * Registered by the channel adapter; called by BusConsumer after processing.
   */
  replyFn: ChannelSendFn;
  /**
   * Sprint 115 (T3): Optional notification function for progress/approval messages.
   * Same signature as replyFn. Called by channel-router when PATCH approval is needed,
   * so CEO sees the approval prompt immediately (before waitForApproval blocks).
   */
  notifyFn?: ChannelSendFn;
}

/**
 * Outbound bus message — carries processed response back to channel.
 * Also broadcast to WebSocket clients as "bus.response" event.
 */
export interface BusOutboundMessage {
  /** Correlation ID matching the original inbound message */
  correlationId: CorrelationId;
  /** Response text */
  text: string;
  /** Optional format hint for channel adapter */
  format?: "markdown" | "plain" | "html";
  /** Optional processing metadata (agent, model, latency) */
  processingMeta?: {
    agent?: string;
    model?: string;
    latencyMs?: number;
  };
  /** If true, text is an error message */
  isError?: boolean;
  /**
   * If true, this is a streaming progress update, NOT the final response.
   * Does NOT decrement inFlight counter.
   * Sprint 107: used for intermediate progress events.
   */
  isProgress?: boolean;
}

// ============================================================================
// Bus statistics
// ============================================================================

/**
 * Bus runtime statistics (for health checks / monitoring).
 */
export interface BusStats {
  /** Total inbound messages published since bus start */
  totalInbound: number;
  /** Total outbound final responses published since bus start */
  totalOutbound: number;
  /** Currently in-flight (inbound published, response not yet sent) */
  inFlight: number;
  /** Bus start timestamp (ms) */
  startedAt: number;
  /** Sprint 115 (T5): Number of active inbound listeners */
  inboundListeners: number;
  /** Sprint 115 (T5): Number of active outbound listeners */
  outboundListeners: number;
}

// ============================================================================
// IMessageBus interface — Redis upgrade path
// ============================================================================

/**
 * IMessageBus — interface both EventEmitterBus and future RedisBus implement.
 *
 * Sprint 106: EventEmitterBus (in-process, single-process)
 * Sprint 110+: RedisBus (multi-process, horizontal scale)
 *
 * Upgrade path: swap implementation in src/bus/message-bus.ts.
 * Zero changes to GatewayIngress, channel adapters, or BusConsumer.
 */
export interface IMessageBus {
  /** Publish an inbound message to the bus */
  publishInbound(msg: BusInboundMessage): void;
  /** Publish an outbound response to the bus */
  publishOutbound(msg: BusOutboundMessage): void;
  /** Subscribe to inbound messages */
  onInbound(handler: (msg: BusInboundMessage) => void): void;
  /** Subscribe to outbound messages */
  onOutbound(handler: (msg: BusOutboundMessage) => void): void;
  /** Remove inbound subscription */
  offInbound(handler: (msg: BusInboundMessage) => void): void;
  /** Remove outbound subscription */
  offOutbound(handler: (msg: BusOutboundMessage) => void): void;
  /** Get bus statistics */
  getStats(): BusStats;
  /**
   * Reset bus — removes all listeners, clears stats.
   * NOTE: Does NOT update BusConsumer._started flag.
   * Always recreate BusConsumer after reset() in tests.
   */
  reset(): void;
}
