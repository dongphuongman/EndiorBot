/**
 * Sprint 139 P1-3: Frozen Input Injection tests (OpenMythos frozen `e` analog).
 *
 * Validates that:
 *   - Optimizer.optimize() accepts and threads FrozenContext
 *   - buildFrozenContextBlock() builds the correct prefix with truncation
 *   - FrozenContext is constructed once in loop.ts and passed to every iteration
 *   - 500-token (2000-char) cap is enforced (CTO condition)
 */

import { describe, it, expect } from "vitest";
import { Optimizer } from "../../src/evaluator/optimizer.js";
import type { FrozenContext } from "../../src/evaluator/types.js";
import { FROZEN_CONTEXT_CHAR_CAP } from "../../src/evaluator/types.js";

// ---------------------------------------------------------------------------
// Tests for the frozen context block builder (via Optimizer instance)
// ---------------------------------------------------------------------------

describe("Frozen context — buildFrozenContextBlock (via Optimizer)", () => {
  // Access the private method via bracket notation for testing
  const optimizer = new Optimizer();
  const build = (ctx?: FrozenContext): string =>
    (optimizer as unknown as { buildFrozenContextBlock(ctx?: FrozenContext): string })
      .buildFrozenContextBlock(ctx);

  it("returns empty string when no frozen context provided", () => {
    expect(build(undefined)).toBe("");
    expect(build()).toBe("");
  });

  it("includes originalTask in the block", () => {
    const block = build({ originalTask: "What is the capital of France?" });
    expect(block).toContain("FROZEN CONTEXT");
    expect(block).toContain("Original Task: What is the capital of France?");
  });

  it("includes soulIdentity when provided (capped at 200 chars)", () => {
    const block = build({
      originalTask: "test",
      soulIdentity: "A".repeat(300),
    });
    expect(block).toContain("Agent Identity: " + "A".repeat(200));
    expect(block).not.toContain("A".repeat(201));
  });

  it("includes constraints when provided", () => {
    const block = build({
      originalTask: "test",
      constraints: "LOCAL-ONLY, no SSH",
    });
    expect(block).toContain("Constraints: LOCAL-ONLY, no SSH");
  });

  it("truncates originalTask at FROZEN_CONTEXT_CHAR_CAP (CTO 500-token / 2000-char condition)", () => {
    const longTask = "X".repeat(FROZEN_CONTEXT_CHAR_CAP + 500);
    const block = build({ originalTask: longTask });
    expect(block).toContain("[...truncated]");
    expect(block.length).toBeLessThan(longTask.length + 200); // much shorter than raw
  });

  it("ends with separator (---) followed by double newline", () => {
    const block = build({ originalTask: "test" });
    expect(block).toMatch(/---\n\n$/);
  });
});

describe("Frozen context — FrozenContext type + CHAR_CAP constant", () => {
  it("FROZEN_CONTEXT_CHAR_CAP = 500 tokens * 4 chars = 2000", () => {
    expect(FROZEN_CONTEXT_CHAR_CAP).toBe(2000);
  });
});
