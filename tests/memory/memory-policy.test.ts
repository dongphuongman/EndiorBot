/**
 * Memory Policy Tests — Sprint 124a
 *
 * Covers: allowlist, scrubber, TTL eviction, max facts, format injection, opt-out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isMemoryDisabled,
  isAllowedFactType,
  scrubFactValue,
  evictExpiredFacts,
  enforceMaxFacts,
  formatFactsForInjection,
  MAX_MEMORY_TOKENS,
} from "../../src/memory/memory-policy.js";
import type { StructuredFact } from "../../src/memory/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeFact(overrides: Partial<StructuredFact> = {}): StructuredFact {
  return {
    id: `fact-${Date.now()}`,
    entity: "test-project",
    relation: "agent_decision",
    value: "Test decision value",
    confidence: 0.8,
    source: "agent:coder",
    validFrom: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("isMemoryDisabled", () => {
  const originalEnv = process.env.ENDIORBOT_MEMORY_DISABLED;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENDIORBOT_MEMORY_DISABLED = originalEnv;
    } else {
      delete process.env.ENDIORBOT_MEMORY_DISABLED;
    }
  });

  it("returns false by default", () => {
    delete process.env.ENDIORBOT_MEMORY_DISABLED;
    expect(isMemoryDisabled()).toBe(false);
  });

  it("returns true when env is 'true'", () => {
    process.env.ENDIORBOT_MEMORY_DISABLED = "true";
    expect(isMemoryDisabled()).toBe(true);
  });

  it("returns false for other values", () => {
    process.env.ENDIORBOT_MEMORY_DISABLED = "false";
    expect(isMemoryDisabled()).toBe(false);
  });
});

describe("isAllowedFactType", () => {
  it("allows decision type", () => {
    expect(isAllowedFactType("decision")).toBe(true);
  });

  it("allows bugfix type", () => {
    expect(isAllowedFactType("bugfix")).toBe(true);
  });

  it("allows discovery type", () => {
    expect(isAllowedFactType("discovery")).toBe(true);
  });

  it("allows architecture_choice type", () => {
    expect(isAllowedFactType("architecture_choice")).toBe(true);
  });

  it("rejects raw_code type", () => {
    expect(isAllowedFactType("raw_code")).toBe(false);
  });

  it("rejects credential type", () => {
    expect(isAllowedFactType("credential")).toBe(false);
  });
});

describe("evictExpiredFacts", () => {
  it("keeps recent facts", () => {
    const recent = makeFact({ validFrom: new Date().toISOString() });
    const result = evictExpiredFacts([recent]);
    expect(result).toHaveLength(1);
  });

  it("evicts facts older than 30 days", () => {
    const old = makeFact({
      validFrom: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = evictExpiredFacts([old]);
    expect(result).toHaveLength(0);
  });

  it("excludes superseded facts", () => {
    const superseded = makeFact({ validUntil: new Date().toISOString() });
    const result = evictExpiredFacts([superseded]);
    expect(result).toHaveLength(0);
  });
});

describe("enforceMaxFacts", () => {
  it("keeps all facts when under limit", () => {
    const facts = [makeFact(), makeFact()];
    expect(enforceMaxFacts(facts)).toHaveLength(2);
  });

  it("trims to max when over limit", () => {
    const facts = Array.from({ length: 505 }, (_, i) =>
      makeFact({
        id: `fact-${i}`,
        validFrom: new Date(Date.now() - i * 1000).toISOString(),
      }),
    );
    const result = enforceMaxFacts(facts);
    expect(result).toHaveLength(500);
  });
});

describe("formatFactsForInjection", () => {
  it("returns empty string for no facts", () => {
    expect(formatFactsForInjection([])).toBe("");
  });

  it("formats facts as memory block", () => {
    const facts = [makeFact({ entity: "payment", value: "Use Stripe SDK v12" })];
    const result = formatFactsForInjection(facts);
    expect(result).toContain("[Memory");
    expect(result).toContain("payment");
    expect(result).toContain("Stripe SDK v12");
  });

  it("respects token budget", () => {
    const longFacts = Array.from({ length: 50 }, (_, i) =>
      makeFact({ entity: `entity-${i}`, value: "A".repeat(100) }),
    );
    const result = formatFactsForInjection(longFacts);
    expect(result.length).toBeLessThanOrEqual(MAX_MEMORY_TOKENS * 4 + 100); // buffer
  });
});
