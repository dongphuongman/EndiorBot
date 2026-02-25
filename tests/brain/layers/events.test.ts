/**
 * Brain Layer 1: Events Tests
 *
 * Tests for event storage operations.
 */

import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendEvent,
  appendEventRaw,
  clearEvents,
  countEventsByType,
  deleteEventsBefore,
  getAllEvents,
  getEventById,
  getEventCount,
  getEventsBySession,
  getEventsByType,
  getEventsSince,
  getRecentEvents,
  logCheckpointCreated,
  logEscalation,
  logFixAttempt,
  logFixFailure,
  logFixSuccess,
  logModelRouted,
  logSessionEnd,
  logSessionStart,
} from '../../../src/brain/layers/events.js';
import { initializeBrain, readBrainVersion } from '../../../src/brain/storage.js';
import type { EventEntry } from '../../../src/brain/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-test', `events-${Date.now()}`);

describe('EventsLayer', () => {
  beforeEach(() => {
    process.env['ENDIORBOT_BRAIN_PATH'] = TEST_BRAIN_PATH;
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    initializeBrain();
  });

  afterEach(() => {
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    delete process.env['ENDIORBOT_BRAIN_PATH'];
  });

  // ===========================================================================
  // Append Events
  // ===========================================================================

  describe('appendEvent', () => {
    it('should append event with auto-generated id and timestamp', () => {
      const event = appendEvent({
        type: 'session_start',
        sessionId: 'session-1',
        payload: { projectId: 'test' },
      });

      expect(event.id).toBeDefined();
      expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.timestamp).toBeDefined();
      expect(event.type).toBe('session_start');
      expect(event.sessionId).toBe('session-1');
    });

    it('should persist appended events', () => {
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'session_end', payload: {} });

      const events = getAllEvents();
      expect(events).toHaveLength(2);
    });

    it('should append multiple events in order', () => {
      const e1 = appendEvent({ type: 'session_start', payload: {} });
      const e2 = appendEvent({ type: 'fix_attempt', payload: {} });
      const e3 = appendEvent({ type: 'session_end', payload: {} });

      const events = getAllEvents();
      expect(events[0]?.id).toBe(e1.id);
      expect(events[1]?.id).toBe(e2.id);
      expect(events[2]?.id).toBe(e3.id);
    });

    it('should generate unique ids for each event', () => {
      const e1 = appendEvent({ type: 'session_start', payload: {} });
      const e2 = appendEvent({ type: 'session_end', payload: {} });
      expect(e1.id).not.toBe(e2.id);
    });

    it('should bump brain version on append', () => {
      const vBefore = readBrainVersion();
      appendEvent({ type: 'session_start', payload: {} });
      const vAfter = readBrainVersion();
      expect(vAfter.layerVersions.events).toBe(vBefore.layerVersions.events + 1);
    });

    it('should handle event without sessionId', () => {
      const entry = appendEvent({ type: 'budget_warning', payload: { threshold: 0.9 } });
      expect(entry.sessionId).toBeUndefined();
      expect(entry.type).toBe('budget_warning');
    });
  });

  describe('appendEventRaw', () => {
    it('should append event with explicit id and timestamp', () => {
      const entry: EventEntry = {
        id: 'custom-id-123',
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'session_start',
        sessionId: 'session-1',
        payload: {},
      };

      const result = appendEventRaw(entry);
      expect(result.id).toBe('custom-id-123');
      expect(result.timestamp).toBe('2026-02-20T10:00:00.000Z');
    });

    it('should reject duplicate id', () => {
      const entry: EventEntry = {
        id: 'duplicate-id',
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'session_start',
        payload: {},
      };

      appendEventRaw(entry);

      expect(() => appendEventRaw(entry)).toThrow('already exists');
    });

    it('should reject invalid timestamp format', () => {
      const entry: EventEntry = {
        id: 'some-id',
        timestamp: 'invalid-timestamp',
        type: 'session_start',
        payload: {},
      };

      expect(() => appendEventRaw(entry)).toThrow('Invalid timestamp');
    });

    it('should reject timestamp without T separator', () => {
      const entry: EventEntry = {
        id: 'some-id',
        timestamp: '2026-02-20 10:00:00',
        type: 'session_start',
        payload: {},
      };

      expect(() => appendEventRaw(entry)).toThrow('Invalid timestamp');
    });
  });

  // ===========================================================================
  // Get Events
  // ===========================================================================

  describe('getAllEvents', () => {
    it('should return empty array when no events', () => {
      const events = getAllEvents();
      expect(events).toEqual([]);
    });

    it('should return all events sorted by timestamp', () => {
      // Add events in non-chronological order
      appendEventRaw({
        id: 'e3',
        timestamp: '2026-02-20T12:00:00.000Z',
        type: 'session_end',
        payload: {},
      });
      appendEventRaw({
        id: 'e1',
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'session_start',
        payload: {},
      });
      appendEventRaw({
        id: 'e2',
        timestamp: '2026-02-20T11:00:00.000Z',
        type: 'fix_attempt',
        payload: {},
      });

      const events = getAllEvents();
      expect(events[0]?.id).toBe('e1');
      expect(events[1]?.id).toBe('e2');
      expect(events[2]?.id).toBe('e3');
    });
  });

  describe('getEventsSince', () => {
    beforeEach(() => {
      appendEventRaw({
        id: 'e1',
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'session_start',
        payload: {},
      });
      appendEventRaw({
        id: 'e2',
        timestamp: '2026-02-20T11:00:00.000Z',
        type: 'fix_attempt',
        payload: {},
      });
      appendEventRaw({
        id: 'e3',
        timestamp: '2026-02-20T12:00:00.000Z',
        type: 'session_end',
        payload: {},
      });
    });

    it('should return events since timestamp (inclusive)', () => {
      const events = getEventsSince('2026-02-20T11:00:00.000Z');
      expect(events).toHaveLength(2);
      expect(events[0]?.id).toBe('e2');
      expect(events[1]?.id).toBe('e3');
    });

    it('should return all events if since is before first event', () => {
      const events = getEventsSince('2026-02-20T09:00:00.000Z');
      expect(events).toHaveLength(3);
    });

    it('should return empty if since is after all events', () => {
      const events = getEventsSince('2026-02-20T13:00:00.000Z');
      expect(events).toHaveLength(0);
    });

    it('should reject invalid timestamp', () => {
      expect(() => getEventsSince('invalid')).toThrow('Invalid timestamp');
    });
  });

  describe('getEventsBySession', () => {
    beforeEach(() => {
      appendEvent({ type: 'session_start', sessionId: 'session-1', payload: {} });
      appendEvent({ type: 'fix_attempt', sessionId: 'session-1', payload: {} });
      appendEvent({ type: 'session_start', sessionId: 'session-2', payload: {} });
      appendEvent({ type: 'session_end', sessionId: 'session-1', payload: {} });
    });

    it('should return events for specific session', () => {
      const events = getEventsBySession('session-1');
      expect(events).toHaveLength(3);
      expect(events.every((e) => e.sessionId === 'session-1')).toBe(true);
    });

    it('should return empty for non-existent session', () => {
      const events = getEventsBySession('non-existent');
      expect(events).toHaveLength(0);
    });

    it('should not include events without sessionId', () => {
      appendEvent({ type: 'budget_warning', payload: {} });
      const events = getEventsBySession('session-1');
      expect(events).toHaveLength(3); // unchanged from beforeEach
    });
  });

  describe('getEventsByType', () => {
    beforeEach(() => {
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'fix_attempt', payload: {} });
      appendEvent({ type: 'fix_attempt', payload: {} });
      appendEvent({ type: 'session_end', payload: {} });
    });

    it('should return events of specific type', () => {
      const events = getEventsByType('fix_attempt');
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.type === 'fix_attempt')).toBe(true);
    });

    it('should return empty for unused type', () => {
      const events = getEventsByType('escalation');
      expect(events).toHaveLength(0);
    });
  });

  describe('getEventById', () => {
    it('should return event by id', () => {
      const created = appendEvent({ type: 'session_start', payload: {} });

      const found = getEventById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for non-existent id', () => {
      const found = getEventById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('getRecentEvents', () => {
    beforeEach(() => {
      for (let i = 1; i <= 10; i++) {
        appendEventRaw({
          id: `e${i}`,
          timestamp: `2026-02-20T${String(i).padStart(2, '0')}:00:00.000Z`,
          type: 'session_start',
          payload: { index: i },
        });
      }
    });

    it('should return most recent N events', () => {
      const events = getRecentEvents(3);
      expect(events).toHaveLength(3);
      expect(events[0]?.id).toBe('e10'); // Most recent
      expect(events[1]?.id).toBe('e9');
      expect(events[2]?.id).toBe('e8');
    });

    it('should return all events if limit exceeds count', () => {
      const events = getRecentEvents(20);
      expect(events).toHaveLength(10);
    });
  });

  // ===========================================================================
  // Count and Stats
  // ===========================================================================

  describe('countEventsByType', () => {
    it('should count events by type', () => {
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'fix_attempt', payload: {} });
      appendEvent({ type: 'fix_attempt', payload: {} });
      appendEvent({ type: 'fix_success', payload: {} });
      appendEvent({ type: 'session_end', payload: {} });

      const counts = countEventsByType();
      expect(counts.get('session_start')).toBe(1);
      expect(counts.get('fix_attempt')).toBe(2);
      expect(counts.get('fix_success')).toBe(1);
      expect(counts.get('session_end')).toBe(1);
    });
  });

  describe('getEventCount', () => {
    it('should return total event count', () => {
      expect(getEventCount()).toBe(0);

      appendEvent({ type: 'session_start', payload: {} });
      expect(getEventCount()).toBe(1);

      appendEvent({ type: 'session_end', payload: {} });
      expect(getEventCount()).toBe(2);
    });
  });

  // ===========================================================================
  // Clear and Delete
  // ===========================================================================

  describe('clearEvents', () => {
    it('should remove all events', () => {
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'session_end', payload: {} });
      expect(getEventCount()).toBe(2);

      clearEvents();
      expect(getEventCount()).toBe(0);
      expect(getAllEvents()).toEqual([]);
    });

    it('should bump version on clear', () => {
      appendEvent({ type: 'session_start', payload: {} });
      const vBefore = readBrainVersion();
      clearEvents();
      const vAfter = readBrainVersion();
      expect(vAfter.layerVersions.events).toBe(vBefore.layerVersions.events + 1);
    });

    it('should be idempotent', () => {
      clearEvents();
      clearEvents();
      expect(getEventCount()).toBe(0);
    });
  });

  describe('deleteEventsBefore', () => {
    beforeEach(() => {
      appendEventRaw({
        id: 'e1',
        timestamp: '2026-02-20T10:00:00.000Z',
        type: 'session_start',
        payload: {},
      });
      appendEventRaw({
        id: 'e2',
        timestamp: '2026-02-20T11:00:00.000Z',
        type: 'fix_attempt',
        payload: {},
      });
      appendEventRaw({
        id: 'e3',
        timestamp: '2026-02-20T12:00:00.000Z',
        type: 'session_end',
        payload: {},
      });
    });

    it('should delete events before timestamp', () => {
      const deleted = deleteEventsBefore('2026-02-20T11:00:00.000Z');
      expect(deleted).toBe(1);
      expect(getEventCount()).toBe(2);
    });

    it('should return 0 if no events to delete', () => {
      const deleted = deleteEventsBefore('2026-02-20T09:00:00.000Z');
      expect(deleted).toBe(0);
      expect(getEventCount()).toBe(3);
    });

    it('should reject invalid timestamp', () => {
      expect(() => deleteEventsBefore('invalid')).toThrow('Invalid timestamp');
    });

    it('should bump version only when events deleted', () => {
      const v1 = readBrainVersion();
      deleteEventsBefore('2026-02-20T09:00:00.000Z'); // nothing deleted
      const v2 = readBrainVersion();
      expect(v2.layerVersions.events).toBe(v1.layerVersions.events);

      deleteEventsBefore('2026-02-20T10:30:00.000Z'); // 1 deleted
      const v3 = readBrainVersion();
      expect(v3.layerVersions.events).toBe(v2.layerVersions.events + 1);
    });

    it('should delete all when timestamp is after latest', () => {
      const deleted = deleteEventsBefore('2026-12-31T00:00:00.000Z');
      expect(deleted).toBe(3);
      expect(getEventCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty payload', () => {
      const entry = appendEvent({ type: 'session_start', payload: {} });
      expect(entry.payload).toEqual({});
    });

    it('should handle complex nested payload', () => {
      const entry = appendEvent({
        type: 'fix_attempt',
        payload: {
          error: { name: 'TypeError', stack: 'line1\nline2' },
          context: { files: ['a.ts', 'b.ts'], depth: 3 },
        },
      });

      const found = getEventById(entry.id);
      expect(found?.payload).toEqual({
        error: { name: 'TypeError', stack: 'line1\nline2' },
        context: { files: ['a.ts', 'b.ts'], depth: 3 },
      });
    });

    it('should handle many events efficiently', () => {
      for (let i = 0; i < 100; i++) {
        appendEvent({
          type: 'fix_attempt',
          sessionId: `stress-${i % 10}`,
          payload: { index: i },
        });
      }

      expect(getEventCount()).toBe(100);
      expect(getEventsBySession('stress-0')).toHaveLength(10);
      expect(getRecentEvents(5)).toHaveLength(5);
    });

    it('should handle events across multiple sessions and types', () => {
      logSessionStart('s1', {});
      logFixAttempt('s1', 'err1', 'fix1');
      logSessionStart('s2', {});
      logFixSuccess('s1', 'err1', 'fix1');
      logFixAttempt('s2', 'err2', 'fix2');
      logSessionEnd('s1', {});

      expect(getEventsBySession('s1')).toHaveLength(4);
      expect(getEventsBySession('s2')).toHaveLength(2);
      expect(getEventsByType('fix_attempt')).toHaveLength(2);
      expect(countEventsByType().get('session_start')).toBe(2);
    });
  });

  // ===========================================================================
  // Convenience Functions
  // ===========================================================================

  describe('Convenience Functions', () => {
    const sessionId = 'test-session';

    it('should log session start', () => {
      const event = logSessionStart(sessionId, { projectId: 'test' });
      expect(event.type).toBe('session_start');
      expect(event.sessionId).toBe(sessionId);
      expect(event.payload).toEqual({ projectId: 'test' });
    });

    it('should log session end', () => {
      const event = logSessionEnd(sessionId);
      expect(event.type).toBe('session_end');
      expect(event.sessionId).toBe(sessionId);
    });

    it('should log fix attempt', () => {
      const event = logFixAttempt(sessionId, 'TypeError', 'add null check');
      expect(event.type).toBe('fix_attempt');
      expect(event.payload).toMatchObject({ error: 'TypeError', fix: 'add null check' });
    });

    it('should log fix success', () => {
      const event = logFixSuccess(sessionId, 'TypeError', 'add null check');
      expect(event.type).toBe('fix_success');
      expect(event.payload).toMatchObject({ error: 'TypeError', fix: 'add null check' });
    });

    it('should log fix failure', () => {
      const event = logFixFailure(sessionId, 'TypeError', 'add null check', 'still fails');
      expect(event.type).toBe('fix_failure');
      expect(event.payload).toMatchObject({
        error: 'TypeError',
        attemptedFix: 'add null check',
        reason: 'still fails',
      });
    });

    it('should log escalation', () => {
      const event = logEscalation(sessionId, 'max retries exceeded');
      expect(event.type).toBe('escalation');
      expect(event.payload).toMatchObject({ reason: 'max retries exceeded' });
    });

    it('should log model routed', () => {
      const event = logModelRouted(sessionId, 'claude-3-opus', 0.95);
      expect(event.type).toBe('model_routed');
      expect(event.payload).toMatchObject({ model: 'claude-3-opus', confidence: 0.95 });
    });

    it('should log checkpoint created', () => {
      const event = logCheckpointCreated(sessionId, 'checkpoint-123');
      expect(event.type).toBe('checkpoint_created');
      expect(event.payload).toMatchObject({ checkpointId: 'checkpoint-123' });
    });
  });
});
