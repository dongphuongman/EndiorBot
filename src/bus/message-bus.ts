/**
 * In-Process Message Bus — EventEmitter implementation.
 *
 * Sprint 106 (ADR-032): Decouples channel ingress from AI processing.
 *
 * Technology choice: Node.js EventEmitter (in-process, single-process).
 * - Zero external dependencies
 * - Matches codebase singleton pattern (setGatewayServer, approvalQueue, etc.)
 * - Redis upgrade path via IMessageBus interface (Sprint 110+)
 *
 * Pattern: Module-level singleton (matches gateway/events.ts pattern).
 *
 * @module bus/message-bus
 * @version 1.0.0
 * @authority ADR-032
 * @sprint 106
 */

import { EventEmitter } from "events";
import type {
  IMessageBus,
  BusInboundMessage,
  BusOutboundMessage,
  BusStats,
} from "./types.js";

// ============================================================================
// Event name constants (MTClaw pkg/protocol/events.go alignment)
// ============================================================================

const INBOUND_EVENT = "inbound.message";
const OUTBOUND_EVENT = "outbound.response";

// ============================================================================
// EventEmitterBus
// ============================================================================

/**
 * In-process message bus backed by Node.js EventEmitter.
 *
 * Sprint 106 implementation of IMessageBus.
 * Sprint 110+: RedisBus implements the same interface for multi-process.
 */
export class EventEmitterBus implements IMessageBus {
  private readonly emitter: EventEmitter;
  private readonly inFlight: Set<string>;
  private totalInbound: number;
  private totalOutbound: number;
  private readonly startedAt: number;

  constructor() {
    this.emitter = new EventEmitter();
    // Prevent false MaxListenersExceededWarning during integration tests
    // (channel adapters + gateway server + consumer + test subscribers)
    this.emitter.setMaxListeners(50);
    this.inFlight = new Set();
    this.totalInbound = 0;
    this.totalOutbound = 0;
    this.startedAt = Date.now();
  }

  publishInbound(msg: BusInboundMessage): void {
    this.inFlight.add(msg.correlationId);
    this.totalInbound++;
    this.emitter.emit(INBOUND_EVENT, msg);
  }

  publishOutbound(msg: BusOutboundMessage): void {
    // Progress updates do NOT close the in-flight entry (more chunks may follow)
    if (!msg.isProgress) {
      this.inFlight.delete(msg.correlationId);
      this.totalOutbound++;
    }
    this.emitter.emit(OUTBOUND_EVENT, msg);
  }

  onInbound(handler: (msg: BusInboundMessage) => void): void {
    this.emitter.on(INBOUND_EVENT, handler);
  }

  onOutbound(handler: (msg: BusOutboundMessage) => void): void {
    this.emitter.on(OUTBOUND_EVENT, handler);
  }

  offInbound(handler: (msg: BusInboundMessage) => void): void {
    this.emitter.off(INBOUND_EVENT, handler);
  }

  offOutbound(handler: (msg: BusOutboundMessage) => void): void {
    this.emitter.off(OUTBOUND_EVENT, handler);
  }

  getStats(): BusStats {
    return {
      totalInbound: this.totalInbound,
      totalOutbound: this.totalOutbound,
      inFlight: this.inFlight.size,
      startedAt: this.startedAt,
      inboundListeners: this.emitter.listenerCount(INBOUND_EVENT),
      outboundListeners: this.emitter.listenerCount(OUTBOUND_EVENT),
    };
  }

  /**
   * Reset bus state — removes all listeners and clears counters.
   *
   * NOTE: Does NOT update BusConsumer._started flag.
   * Always recreate BusConsumer after reset() in tests.
   */
  reset(): void {
    this.emitter.removeAllListeners();
    this.inFlight.clear();
    this.totalInbound = 0;
    this.totalOutbound = 0;
  }
}

// ============================================================================
// Module-level singleton (matches gateway/events.ts pattern)
// ============================================================================

let _bus: EventEmitterBus | null = null;

/**
 * Get the global message bus instance.
 * Creates on first call (lazy initialization).
 */
export function getMessageBus(): EventEmitterBus {
  if (!_bus) {
    _bus = new EventEmitterBus();
  }
  return _bus;
}

/**
 * Reset the global message bus singleton.
 * Use in tests to get a clean bus between test cases.
 *
 * IMPORTANT: recreate BusConsumer after calling this.
 */
export function resetMessageBus(): void {
  _bus?.reset();
  _bus = null;
}

/**
 * Create a correlation ID for a bus message.
 *
 * Format: `${channel}-${senderId}-${Date.now()}`
 * (MTClaw-aligned: channel + sender + timestamp for human readability)
 *
 * @param channel Source channel ("telegram", "web", "zalo")
 * @param senderId Sender ID within the channel
 * @returns Correlation ID string
 */
export function createCorrelationId(channel: string, senderId: string): string {
  return `${channel}-${senderId}-${Date.now()}`;
}
