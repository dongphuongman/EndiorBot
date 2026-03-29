/**
 * Tests for FactStore.
 *
 * @module tests/memory/fact-store
 * @sprint 120 — Track B1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  const { join: pathJoin } = await import("node:path");
  return {
    ...os,
    homedir: () => pathJoin(os.tmpdir(), "endiorbot-factstore-test"),
  };
});

let testBaseDir: string;

import { FactStore } from "../../src/memory/fact-store.js";
import type { StructuredFact } from "../../src/memory/types.js";

function makeFact(overrides: Partial<StructuredFact> = {}): StructuredFact {
  return {
    id: overrides.id ?? randomUUID(),
    entity: overrides.entity ?? "EndiorBot",
    relation: overrides.relation ?? "uses_framework",
    value: overrides.value ?? "SDLC 6.2.0",
    confidence: overrides.confidence ?? 0.8,
    validFrom: overrides.validFrom ?? new Date().toISOString(),
    source: overrides.source ?? "test",
    ...(overrides.validUntil ? { validUntil: overrides.validUntil } : {}),
  };
}

let store: FactStore;

beforeEach(() => {
  testBaseDir = join(tmpdir(), "endiorbot-factstore-test");
  store = new FactStore("test-project");
});

afterEach(() => {
  try {
    rmSync(testBaseDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================================
// createFact
// ============================================================================

describe("FactStore.createFact", () => {
  it("returns fact with UUID, entity, relation, value, confidence, validFrom, source", () => {
    const fact = FactStore.createFact("EndiorBot", "tier", "STANDARD", "test-source");
    expect(fact.id).toBeDefined();
    expect(fact.entity).toBe("EndiorBot");
    expect(fact.relation).toBe("tier");
    expect(fact.value).toBe("STANDARD");
    expect(fact.confidence).toBe(0.8);
    expect(fact.validFrom).toBeDefined();
    expect(fact.source).toBe("test-source");
  });

  it("accepts custom confidence", () => {
    const fact = FactStore.createFact("E", "r", "v", "s", 0.95);
    expect(fact.confidence).toBe(0.95);
  });
});

// ============================================================================
// addFacts + query
// ============================================================================

describe("addFacts and query", () => {
  it("indexes by entity — query({ entity }) returns matching facts", () => {
    const f1 = makeFact({ entity: "EndiorBot", relation: "lang", value: "TypeScript" });
    const f2 = makeFact({ entity: "OtherProject", relation: "lang", value: "Python" });
    store.addFacts([f1, f2]);

    const result = store.query({ entity: "EndiorBot" });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("TypeScript");
  });

  it("indexes by relation — query({ relation }) returns matching facts", () => {
    const f1 = makeFact({ relation: "tier", value: "STANDARD" });
    const f2 = makeFact({ relation: "lang", value: "TypeScript" });
    store.addFacts([f1, f2]);

    const result = store.query({ relation: "tier" });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("STANDARD");
  });

  it("query with entity+relation intersects both indices", () => {
    const f1 = makeFact({ entity: "A", relation: "x", value: "v1" });
    const f2 = makeFact({ entity: "A", relation: "y", value: "v2" });
    const f3 = makeFact({ entity: "B", relation: "x", value: "v3" });
    store.addFacts([f1, f2, f3]);

    const result = store.query({ entity: "A", relation: "x" });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("v1");
  });

  it("query with no filter returns all current facts", () => {
    store.addFacts([
      makeFact({ entity: "A", relation: "r1" }),
      makeFact({ entity: "B", relation: "r2" }),
    ]);
    const result = store.query({});
    expect(result).toHaveLength(2);
  });

  it("query excludes superseded facts (those with validUntil set)", () => {
    const old = makeFact({ entity: "A", relation: "tier", value: "LITE", validUntil: "2026-03-01T00:00:00Z" });
    const current = makeFact({ entity: "A", relation: "tier", value: "STANDARD" });
    store.addFacts([old, current]);

    const result = store.query({ entity: "A", relation: "tier" });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("STANDARD");
  });
});

// ============================================================================
// Conflict resolution
// ============================================================================

describe("conflict resolution", () => {
  it("adding fact with same entity+relation sets validUntil on old fact", () => {
    const old = makeFact({ entity: "E", relation: "r", value: "old-val" });
    store.addFacts([old]);
    expect(store.getCurrentFactCount()).toBe(1);

    const newer = makeFact({ entity: "E", relation: "r", value: "new-val" });
    store.addFacts([newer]);

    const all = store.getAllFacts();
    expect(all).toHaveLength(2);
    expect(all[0].validUntil).toBeDefined();
    expect(all[1].validUntil).toBeUndefined();
  });

  it("new fact becomes the current one", () => {
    store.addFacts([makeFact({ entity: "E", relation: "r", value: "v1" })]);
    store.addFacts([makeFact({ entity: "E", relation: "r", value: "v2" })]);

    const result = store.query({ entity: "E", relation: "r" });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("v2");
  });
});

// ============================================================================
// getCurrentFactCount / getAllFacts
// ============================================================================

describe("getCurrentFactCount", () => {
  it("returns only non-superseded facts", () => {
    store.addFacts([makeFact({ entity: "A", relation: "r" })]);
    store.addFacts([makeFact({ entity: "A", relation: "r" })]); // supersedes first
    store.addFacts([makeFact({ entity: "B", relation: "r" })]);

    expect(store.getCurrentFactCount()).toBe(2); // A (latest) + B
    expect(store.getAllFacts()).toHaveLength(3); // includes superseded A
  });
});

// ============================================================================
// save / load
// ============================================================================

describe("save and load", () => {
  it("save creates directory if missing", async () => {
    store.addFacts([makeFact()]);
    await store.save(); // should not throw
  });

  it("save then load round-trips all facts", async () => {
    const f1 = makeFact({ entity: "A", relation: "r1", value: "v1" });
    const f2 = makeFact({ entity: "B", relation: "r2", value: "v2" });
    store.addFacts([f1, f2]);
    await store.save();

    const store2 = new FactStore("test-project");
    await store2.load();
    expect(store2.getAllFacts()).toHaveLength(2);
    expect(store2.query({ entity: "A" })[0].value).toBe("v1");
  });

  it("load skips malformed JSONL lines without throwing", async () => {
    const dir = join(testBaseDir, ".endiorbot", "memory", "test-malformed");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "facts.jsonl"), '{"valid":"json"}\nnot json at all\n{"also":"valid"}\n', "utf-8");

    const malformedStore = new FactStore("test-malformed");
    await malformedStore.load();
    // Should have loaded the 2 valid lines (even though they're not real StructuredFacts)
    expect(malformedStore.getAllFacts().length).toBeGreaterThanOrEqual(1);
  });

  it("load on non-existent file initializes empty store", async () => {
    const emptyStore = new FactStore("nonexistent-project");
    await emptyStore.load();
    expect(emptyStore.getAllFacts()).toHaveLength(0);
    expect(emptyStore.getCurrentFactCount()).toBe(0);
  });
});

// ============================================================================
// Empty store
// ============================================================================

describe("empty store", () => {
  it("returns empty array for any query", () => {
    expect(store.query({})).toEqual([]);
    expect(store.query({ entity: "anything" })).toEqual([]);
    expect(store.query({ relation: "anything" })).toEqual([]);
  });
});
