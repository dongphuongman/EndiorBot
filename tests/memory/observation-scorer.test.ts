/**
 * Tests for observation scorer.
 *
 * @module tests/memory/observation-scorer
 * @sprint 120 — Track B3
 */

import { describe, it, expect } from "vitest";
import {
  scoreObservation,
  filterByImportance,
  getTypeImportance,
  getTypeConfidence,
  IMPORTANCE_THRESHOLDS,
} from "../../src/memory/observation-scorer.js";
import type { MemoryType, ScoredObservation } from "../../src/memory/types.js";

// ============================================================================
// scoreObservation
// ============================================================================

describe("scoreObservation", () => {
  it("decision → importance 0.9, confidence 0.85", () => {
    const result = scoreObservation("decision", "use PostgreSQL for sessions");
    expect(result.importance).toBe(0.9);
    expect(result.confidence).toBe(0.85);
  });

  it("commitment → importance 0.85, confidence 0.9", () => {
    const result = scoreObservation("commitment", "ship by Friday");
    expect(result.importance).toBe(0.85);
    expect(result.confidence).toBe(0.9);
  });

  it("lesson → importance 0.8, confidence 0.7", () => {
    const result = scoreObservation("lesson", "always test regex edge cases");
    expect(result.importance).toBe(0.8);
    expect(result.confidence).toBe(0.7);
  });

  it("blocker → importance 0.75, confidence 0.8", () => {
    const result = scoreObservation("blocker", "tmux not available in CI");
    expect(result.importance).toBe(0.75);
    expect(result.confidence).toBe(0.8);
  });

  it("fact → importance 0.6, confidence 0.75", () => {
    const result = scoreObservation("fact", "Node.js 20 required");
    expect(result.importance).toBe(0.6);
    expect(result.confidence).toBe(0.75);
  });

  it("preference → importance 0.5, confidence 0.6", () => {
    const result = scoreObservation("preference", "prefer Sonnet over Opus");
    expect(result.importance).toBe(0.5);
    expect(result.confidence).toBe(0.6);
  });

  it("project → importance 0.5, confidence 0.8", () => {
    const result = scoreObservation("project", "EndiorBot TypeScript monorepo");
    expect(result.importance).toBe(0.5);
    expect(result.confidence).toBe(0.8);
  });

  it("all 7 memory types have defined scores", () => {
    const types: MemoryType[] = ["decision", "commitment", "lesson", "blocker", "fact", "preference", "project"];
    for (const type of types) {
      const result = scoreObservation(type, "test");
      expect(result.importance).toBeGreaterThan(0);
      expect(result.importance).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// filterByImportance
// ============================================================================

describe("filterByImportance", () => {
  const observations: ScoredObservation[] = [
    { id: "1", type: "decision", content: "d", importance: 0.9, confidence: 0.85, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "2", type: "commitment", content: "c", importance: 0.85, confidence: 0.9, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "3", type: "lesson", content: "l", importance: 0.8, confidence: 0.7, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "4", type: "blocker", content: "b", importance: 0.75, confidence: 0.8, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "5", type: "fact", content: "f", importance: 0.6, confidence: 0.75, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "6", type: "preference", content: "p", importance: 0.5, confidence: 0.6, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
    { id: "7", type: "project", content: "j", importance: 0.5, confidence: 0.8, source: "s", createdAt: "", sessionId: "sess-1", tags: [] },
  ];

  it("structural threshold (0.8) returns decision, commitment, lesson", () => {
    const result = filterByImportance(observations, IMPORTANCE_THRESHOLDS.structural);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.type)).toEqual(["decision", "commitment", "lesson"]);
  });

  it("potential threshold (0.4) returns all types", () => {
    const result = filterByImportance(observations, IMPORTANCE_THRESHOLDS.potential);
    expect(result).toHaveLength(7);
  });

  it("threshold 1.0 returns empty array", () => {
    const result = filterByImportance(observations, 1.0);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// IMPORTANCE_THRESHOLDS
// ============================================================================

describe("IMPORTANCE_THRESHOLDS", () => {
  it("structural equals 0.8", () => {
    expect(IMPORTANCE_THRESHOLDS.structural).toBe(0.8);
  });

  it("potential equals 0.4", () => {
    expect(IMPORTANCE_THRESHOLDS.potential).toBe(0.4);
  });
});

// ============================================================================
// getTypeImportance / getTypeConfidence
// ============================================================================

describe("getTypeImportance and getTypeConfidence", () => {
  it("match scoreObservation output for all types", () => {
    const types: MemoryType[] = ["decision", "commitment", "lesson", "blocker", "fact", "preference", "project"];
    for (const type of types) {
      const scored = scoreObservation(type, "test");
      expect(getTypeImportance(type)).toBe(scored.importance);
      expect(getTypeConfidence(type)).toBe(scored.confidence);
    }
  });
});
