/**
 * Autonomous Event Emitter
 *
 * Thin interface used by TaskQueue and GateManager to emit events
 * without depending on the full AutonomousSessionManager.
 *
 * @module sessions/autonomous/event-emitter
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE
 */

import type { AutonomousEvent } from "./types.js";

/**
 * Minimal event emitter surface consumed by extracted sub-modules.
 */
export interface AutonomousEventEmitter {
  emit(type: AutonomousEvent["type"], data: Record<string, unknown>): void;
}
