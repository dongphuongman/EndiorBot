/**
 * Message Bus — Barrel Exports
 *
 * Sprint 106 (ADR-032): Event Bus Foundation
 *
 * @module bus
 * @version 1.0.0
 * @authority ADR-032
 * @sprint 106
 */

// Types
export type {
  IMessageBus,
  BusInboundMessage,
  BusOutboundMessage,
  BusStats,
  CorrelationId,
  ChannelSendFn,
} from "./types.js";

// Bus implementation
export {
  EventEmitterBus,
  getMessageBus,
  resetMessageBus,
  createCorrelationId,
} from "./message-bus.js";

// Consumer
export { BusConsumer } from "./consumer.js";

// Sprint 107: Reliability
export { BusDebounce } from "./debounce.js";
export { BusDedup } from "./dedup.js";
