/**
 * Brain Layer 1: Events
 *
 * Raw events storage (session logs, fix attempts, escalations).
 * Bottom layer of the iceberg model - most concrete data.
 *
 * @see ADR-009-Brain-Architecture.md
 */

import {
  bumpBrainVersion,
  generateId,
  readEvents,
  writeEvents,
} from '../storage.js';
import type { CreateEventInput, EventEntry, EventType } from '../types.js';
import { BRAIN_LAYERS } from '../types.js';

// =============================================================================
// Event Layer Operations
// =============================================================================

/**
 * Append a new event to the events layer
 *
 * @param input - Event data (without id and timestamp)
 * @returns The created event entry with id and timestamp
 * @throws Error if event with same id already exists
 */
export function appendEvent(input: CreateEventInput): EventEntry {
  const events = readEvents();
  const now = new Date().toISOString();

  const entry: EventEntry = {
    id: generateId(),
    timestamp: now,
    ...input,
  };

  // Check for duplicate id (defensive, should never happen with UUID)
  if (events.some((e) => e.id === entry.id)) {
    throw new Error(`Event with id ${entry.id} already exists`);
  }

  events.push(entry);
  writeEvents(events);

  // Bump layer version
  bumpBrainVersion(BRAIN_LAYERS.EVENTS);

  return entry;
}

/**
 * Append event with explicit id and timestamp (for imports/migrations)
 *
 * @param entry - Complete event entry
 * @returns The event entry
 * @throws Error if event with same id already exists
 */
export function appendEventRaw(entry: EventEntry): EventEntry {
  const events = readEvents();

  // Check for duplicate id
  if (events.some((e) => e.id === entry.id)) {
    throw new Error(`Event with id ${entry.id} already exists`);
  }

  // Validate timestamp format
  if (!isValidISOTimestamp(entry.timestamp)) {
    throw new Error(`Invalid timestamp format: ${entry.timestamp}`);
  }

  events.push(entry);
  writeEvents(events);
  bumpBrainVersion(BRAIN_LAYERS.EVENTS);

  return entry;
}

/**
 * Get all events
 *
 * @returns All event entries sorted by timestamp (oldest first)
 */
export function getAllEvents(): EventEntry[] {
  const events = readEvents();
  return sortByTimestamp(events);
}

/**
 * Get events since a given timestamp
 *
 * @param since - ISO 8601 timestamp
 * @returns Events with timestamp >= since, sorted by timestamp
 */
export function getEventsSince(since: string): EventEntry[] {
  if (!isValidISOTimestamp(since)) {
    throw new Error(`Invalid timestamp format: ${since}`);
  }

  const events = readEvents();
  const sinceDate = new Date(since);

  const filtered = events.filter((e) => new Date(e.timestamp) >= sinceDate);
  return sortByTimestamp(filtered);
}

/**
 * Get events by session ID
 *
 * @param sessionId - Session identifier
 * @returns Events for the given session, sorted by timestamp
 */
export function getEventsBySession(sessionId: string): EventEntry[] {
  const events = readEvents();
  const filtered = events.filter((e) => e.sessionId === sessionId);
  return sortByTimestamp(filtered);
}

/**
 * Get events by type
 *
 * @param type - Event type
 * @returns Events of the given type, sorted by timestamp
 */
export function getEventsByType(type: EventType): EventEntry[] {
  const events = readEvents();
  const filtered = events.filter((e) => e.type === type);
  return sortByTimestamp(filtered);
}

/**
 * Get a single event by ID
 *
 * @param id - Event ID
 * @returns Event entry or undefined if not found
 */
export function getEventById(id: string): EventEntry | undefined {
  const events = readEvents();
  return events.find((e) => e.id === id);
}

/**
 * Get the most recent N events
 *
 * @param limit - Maximum number of events to return
 * @returns Most recent events, sorted by timestamp (newest first)
 */
export function getRecentEvents(limit: number): EventEntry[] {
  const events = readEvents();
  const sorted = sortByTimestamp(events, 'desc');
  return sorted.slice(0, limit);
}

/**
 * Count events by type
 *
 * @returns Map of event type to count
 */
export function countEventsByType(): Map<EventType, number> {
  const events = readEvents();
  const counts = new Map<EventType, number>();

  for (const event of events) {
    const current = counts.get(event.type) ?? 0;
    counts.set(event.type, current + 1);
  }

  return counts;
}

/**
 * Get total event count
 *
 * @returns Number of events
 */
export function getEventCount(): number {
  return readEvents().length;
}

/**
 * Clear all events (for tests only)
 *
 * @internal
 */
export function clearEvents(): void {
  writeEvents([]);
  bumpBrainVersion(BRAIN_LAYERS.EVENTS);
}

/**
 * Delete events older than a given timestamp (for rotation)
 *
 * @param before - ISO 8601 timestamp
 * @returns Number of deleted events
 */
export function deleteEventsBefore(before: string): number {
  if (!isValidISOTimestamp(before)) {
    throw new Error(`Invalid timestamp format: ${before}`);
  }

  const events = readEvents();
  const beforeDate = new Date(before);

  const remaining = events.filter((e) => new Date(e.timestamp) >= beforeDate);
  const deleted = events.length - remaining.length;

  if (deleted > 0) {
    writeEvents(remaining);
    bumpBrainVersion(BRAIN_LAYERS.EVENTS);
  }

  return deleted;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sort events by timestamp
 */
function sortByTimestamp(
  events: EventEntry[],
  order: 'asc' | 'desc' = 'asc'
): EventEntry[] {
  return [...events].sort((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return order === 'asc' ? diff : -diff;
  });
}

/**
 * Validate ISO 8601 timestamp format
 */
function isValidISOTimestamp(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && timestamp.includes('T');
}

// =============================================================================
// Convenience Functions for Common Event Types
// =============================================================================

/**
 * Log session start event
 */
export function logSessionStart(
  sessionId: string,
  payload: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'session_start',
    sessionId,
    payload,
  });
}

/**
 * Log session end event
 */
export function logSessionEnd(
  sessionId: string,
  payload: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'session_end',
    sessionId,
    payload,
  });
}

/**
 * Log fix attempt event
 */
export function logFixAttempt(
  sessionId: string,
  error: string,
  fix: string,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'fix_attempt',
    sessionId,
    payload: { error, fix, ...metadata },
  });
}

/**
 * Log fix success event
 */
export function logFixSuccess(
  sessionId: string,
  error: string,
  fix: string,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'fix_success',
    sessionId,
    payload: { error, fix, ...metadata },
  });
}

/**
 * Log fix failure event
 */
export function logFixFailure(
  sessionId: string,
  error: string,
  attemptedFix: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'fix_failure',
    sessionId,
    payload: { error, attemptedFix, reason, ...metadata },
  });
}

/**
 * Log escalation event
 */
export function logEscalation(
  sessionId: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'escalation',
    sessionId,
    payload: { reason, ...metadata },
  });
}

/**
 * Log model routing event
 */
export function logModelRouted(
  sessionId: string,
  model: string,
  confidence: number,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'model_routed',
    sessionId,
    payload: { model, confidence, ...metadata },
  });
}

/**
 * Log checkpoint created event
 */
export function logCheckpointCreated(
  sessionId: string,
  checkpointId: string,
  metadata: Record<string, unknown> = {}
): EventEntry {
  return appendEvent({
    type: 'checkpoint_created',
    sessionId,
    payload: { checkpointId, ...metadata },
  });
}
