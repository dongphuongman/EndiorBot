/**
 * Tests for Evaluation Store — Sprint 88 (ADR-025)
 *
 * Covers: JSONL append, load with per-line resilience, path format,
 * missing file handling, corrupted line handling.
 *
 * @module tests/bridge/intelligence/evaluation-store
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockAppendFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockMkdirSync = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    appendFileSync: (...args: unknown[]) => mockAppendFileSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  };
});

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  appendEvaluation,
  loadEvaluations,
  getEvaluationStorePath,
  generateEvaluationId,
} from "../../../src/bridge/intelligence/evaluation-store.js";
import type { EvaluationRecord } from "../../../src/bridge/intelligence/evaluation-store.js";

// ============================================================================
// Helpers
// ============================================================================

function createRecord(overrides: Partial<EvaluationRecord> = {}): EvaluationRecord {
  return {
    id: "eval_1234567890_abcd1234",
    ts: "2026-03-07T12:00:00.000Z",
    turnNumber: 1,
    score: 75,
    signals: {
      codeTestRatio: 80,
      commentDensity: 70,
      errorPatterns: 90,
      complexity: 60,
      lintCompliance: 50,
    },
    summary: "PASS (75/100) — weakest: lint compliance: 50, complexity: 60",
    captureHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    captureLines: 50,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("getEvaluationStorePath", () => {
  it("returns path under ~/.endiorbot/sessions/{sessionId}/evaluations.jsonl", () => {
    const path = getEvaluationStorePath("bridge_123_abc");
    expect(path).toContain(".endiorbot");
    expect(path).toContain("sessions");
    expect(path).toContain("bridge_123_abc");
    expect(path).toContain("evaluations.jsonl");
  });
});

describe("generateEvaluationId", () => {
  it("starts with eval_ prefix", () => {
    const id = generateEvaluationId();
    expect(id).toMatch(/^eval_\d+_[a-f0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(generateEvaluationId());
    }
    expect(ids.size).toBe(10);
  });
});

describe("appendEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("creates directory if absent", () => {
    mockExistsSync.mockReturnValue(false);
    appendEvaluation("bridge_123", createRecord());

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("bridge_123"),
      { recursive: true },
    );
  });

  it("appends JSONL line to file", () => {
    appendEvaluation("bridge_123", createRecord());

    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const [, content] = mockAppendFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('"turnNumber":1');
    expect(content).toContain('"score":75');
    expect(content.endsWith("\n")).toBe(true);
  });

  it("silently handles write errors", () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    // Should not throw
    expect(() => appendEvaluation("bridge_123", createRecord())).not.toThrow();
  });
});

describe("loadEvaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("returns empty array when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadEvaluations("bridge_123");
    expect(result).toEqual([]);
  });

  it("parses valid JSONL lines", () => {
    const r1 = createRecord({ turnNumber: 1, score: 75 });
    const r2 = createRecord({ turnNumber: 2, score: 82 });
    mockReadFileSync.mockReturnValue(
      JSON.stringify(r1) + "\n" + JSON.stringify(r2) + "\n",
    );

    const result = loadEvaluations("bridge_123");
    expect(result).toHaveLength(2);
    expect(result[0]!.turnNumber).toBe(1);
    expect(result[1]!.turnNumber).toBe(2);
  });

  it("skips corrupted lines (CTO MF-2)", () => {
    const valid = createRecord({ turnNumber: 1 });
    const content = JSON.stringify(valid) + "\n" + "CORRUPTED{invalid json\n" + JSON.stringify(createRecord({ turnNumber: 3 })) + "\n";
    mockReadFileSync.mockReturnValue(content);

    const result = loadEvaluations("bridge_123");
    expect(result).toHaveLength(2);
    expect(result[0]!.turnNumber).toBe(1);
    expect(result[1]!.turnNumber).toBe(3);
  });

  it("skips empty lines", () => {
    const r1 = createRecord({ turnNumber: 1 });
    mockReadFileSync.mockReturnValue(
      "\n" + JSON.stringify(r1) + "\n\n",
    );

    const result = loadEvaluations("bridge_123");
    expect(result).toHaveLength(1);
  });

  it("returns empty array on read error", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("permission denied");
    });

    const result = loadEvaluations("bridge_123");
    expect(result).toEqual([]);
  });
});
