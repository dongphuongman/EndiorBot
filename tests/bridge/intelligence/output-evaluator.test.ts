/**
 * Tests for Output Evaluator — Sprint 88 (ADR-025)
 *
 * Covers: 5-signal scoring, weighted average, summary generation,
 * null returns, edge cases.
 *
 * @module tests/bridge/intelligence/output-evaluator
 */

import { describe, it, expect } from "vitest";
import {
  evaluateOutput,
  scoreCodeTestRatio,
  scoreCommentDensity,
  scoreErrorPatterns,
  scoreComplexity,
  scoreLintCompliance,
  computeVibecodingIndex,
  generateSummary,
  MIN_TEXT_LENGTH,
  PASS_THRESHOLD,
  SIGNAL_WEIGHTS,
} from "../../../src/bridge/intelligence/output-evaluator.js";
import type { EvaluatorSignals } from "../../../src/bridge/intelligence/envelope.js";

// ============================================================================
// evaluateOutput — main function
// ============================================================================

describe("evaluateOutput", () => {
  it("returns null for empty string", () => {
    expect(evaluateOutput("", 1)).toBeNull();
  });

  it("returns null for short text below MIN_TEXT_LENGTH", () => {
    expect(evaluateOutput("hi", 1)).toBeNull();
    expect(evaluateOutput("x".repeat(MIN_TEXT_LENGTH - 1), 1)).toBeNull();
  });

  it("returns envelope for text at exactly MIN_TEXT_LENGTH", () => {
    const text = "x".repeat(MIN_TEXT_LENGTH);
    const result = evaluateOutput(text, 1);
    expect(result).not.toBeNull();
    expect(result!.turnNumber).toBe(1);
  });

  it("returns envelope with all required fields", () => {
    const text = "const foo = 'bar';\nconst baz = 42;\n// a comment\nexport default foo;";
    const result = evaluateOutput(text, 3);

    expect(result).not.toBeNull();
    expect(result!.turnNumber).toBe(3);
    expect(result!.evaluatedAt).toBeDefined();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.signals).toBeDefined();
    expect(result!.signals.codeTestRatio).toBeDefined();
    expect(result!.signals.commentDensity).toBeDefined();
    expect(result!.signals.errorPatterns).toBeDefined();
    expect(result!.signals.complexity).toBeDefined();
    expect(result!.signals.lintCompliance).toBeDefined();
    expect(result!.summary).toBeDefined();
    expect(result!.captureHash).toHaveLength(64); // SHA256 hex
  });

  it("produces consistent captureHash for same input", () => {
    const text = "function hello() { return 'world'; }";
    const r1 = evaluateOutput(text, 1);
    const r2 = evaluateOutput(text, 2);
    expect(r1!.captureHash).toBe(r2!.captureHash);
  });
});

// ============================================================================
// scoreCodeTestRatio
// ============================================================================

describe("scoreCodeTestRatio", () => {
  it("scores higher when test patterns present", () => {
    const withTests = [
      "describe('foo', () => {",
      "  it('works', () => {",
      "    expect(true).toBe(true);",
      "  });",
      "});",
      "const x = 1;",
      "const y = 2;",
    ].join("\n");

    const withoutTests = [
      "const x = 1;",
      "const y = 2;",
      "const z = 3;",
      "function foo() { return x + y; }",
    ].join("\n");

    expect(scoreCodeTestRatio(withTests)).toBeGreaterThan(scoreCodeTestRatio(withoutTests));
  });

  it("returns 50 for empty text", () => {
    expect(scoreCodeTestRatio("")).toBe(50);
  });
});

// ============================================================================
// scoreCommentDensity
// ============================================================================

describe("scoreCommentDensity", () => {
  it("scores higher when JSDoc comments present", () => {
    const withComments = [
      "/**",
      " * Calculates the sum of two numbers.",
      " * @param a - First number",
      " * @returns The sum",
      " */",
      "function sum(a: number, b: number): number {",
      "  return a + b;",
      "}",
    ].join("\n");

    const noComments = [
      "function sum(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "function mul(a: number, b: number): number {",
      "  return a * b;",
      "}",
    ].join("\n");

    expect(scoreCommentDensity(withComments)).toBeGreaterThan(scoreCommentDensity(noComments));
  });

  it("returns 50 for empty text", () => {
    expect(scoreCommentDensity("")).toBe(50);
  });
});

// ============================================================================
// scoreErrorPatterns
// ============================================================================

describe("scoreErrorPatterns", () => {
  it("penalizes any type annotations", () => {
    const withAny = "const x: any = {};\nconst y: any[] = [];\nconst z = foo as any;";
    const clean = "const x: string = 'hello';\nconst y: number[] = [1, 2, 3];";

    expect(scoreErrorPatterns(withAny)).toBeLessThan(scoreErrorPatterns(clean));
  });

  it("returns 100 for clean text", () => {
    expect(scoreErrorPatterns("const x = 1;\nconst y = 'hello';")).toBe(100);
  });

  it("penalizes TODO and FIXME", () => {
    const withTodo = "// TODO: fix this\n// FIXME: broken\nconst x = 1;";
    expect(scoreErrorPatterns(withTodo)).toBeLessThan(100);
  });
});

// ============================================================================
// scoreComplexity
// ============================================================================

describe("scoreComplexity", () => {
  it("scores lower for high control-flow density", () => {
    const complex = [
      "if (a) {",
      "  for (const x of items) {",
      "    if (x > 0) {",
      "      try {",
      "        while (true) {",
      "          if (done) break;",
      "        }",
      "      } catch (e) {",
      "        throw e;",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");

    const simple = [
      "const x = 1;",
      "const y = 2;",
      "const z = x + y;",
      "export default z;",
    ].join("\n");

    expect(scoreComplexity(complex)).toBeLessThan(scoreComplexity(simple));
  });

  it("returns 50 for empty text", () => {
    expect(scoreComplexity("")).toBe(50);
  });
});

// ============================================================================
// scoreLintCompliance
// ============================================================================

describe("scoreLintCompliance", () => {
  it("penalizes TypeScript errors in output", () => {
    const withErrors = "error TS2345: Argument of type 'string' is not assignable\nerror TS2304: Cannot find name 'foo'";
    const clean = "All checks passed. No errors found.";

    expect(scoreLintCompliance(withErrors)).toBeLessThan(scoreLintCompliance(clean));
  });

  it("returns 100 for clean output", () => {
    expect(scoreLintCompliance("Build successful. 0 errors, 0 warnings.")).toBe(100);
  });

  it("penalizes ESLint format errors", () => {
    const eslintOutput = "12:5 error 'foo' is not defined\n15:10 warning Unexpected any";
    expect(scoreLintCompliance(eslintOutput)).toBeLessThan(100);
  });
});

// ============================================================================
// computeVibecodingIndex
// ============================================================================

describe("computeVibecodingIndex", () => {
  it("computes weighted average correctly", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 100,
      commentDensity: 100,
      errorPatterns: 100,
      complexity: 100,
      lintCompliance: 100,
    };
    expect(computeVibecodingIndex(signals)).toBe(100);
  });

  it("computes weighted average for mixed scores", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 80,   // * 0.25 = 20
      commentDensity: 60,  // * 0.15 = 9
      errorPatterns: 100,  // * 0.25 = 25
      complexity: 70,      // * 0.20 = 14
      lintCompliance: 40,  // * 0.15 = 6
    };
    // Total: 20 + 9 + 25 + 14 + 6 = 74
    expect(computeVibecodingIndex(signals)).toBe(74);
  });

  it("rounds to nearest integer", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 33,
      commentDensity: 33,
      errorPatterns: 33,
      complexity: 33,
      lintCompliance: 33,
    };
    // 33 * (0.25+0.15+0.25+0.20+0.15) = 33 * 1.0 = 33
    expect(computeVibecodingIndex(signals)).toBe(33);
  });
});

// ============================================================================
// generateSummary
// ============================================================================

describe("generateSummary", () => {
  it("uses PASS badge when score >= 60", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 80,
      commentDensity: 80,
      errorPatterns: 80,
      complexity: 80,
      lintCompliance: 80,
    };
    const summary = generateSummary(80, signals);
    expect(summary).toContain("PASS");
    expect(summary).toContain("80/100");
  });

  it("uses WARN badge when score < 60", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 30,
      commentDensity: 20,
      errorPatterns: 40,
      complexity: 50,
      lintCompliance: 10,
    };
    const summary = generateSummary(30, signals);
    expect(summary).toContain("WARN");
    expect(summary).toContain("30/100");
  });

  it("includes top 2 weakest signals", () => {
    const signals: EvaluatorSignals = {
      codeTestRatio: 90,
      commentDensity: 20,     // weakest #2
      errorPatterns: 80,
      complexity: 70,
      lintCompliance: 10,     // weakest #1
    };
    const summary = generateSummary(60, signals);
    expect(summary).toContain("lint compliance");
    expect(summary).toContain("comment density");
  });
});

// ============================================================================
// Constants
// ============================================================================

describe("Constants", () => {
  it("MIN_TEXT_LENGTH is 10", () => {
    expect(MIN_TEXT_LENGTH).toBe(10);
  });

  it("PASS_THRESHOLD is 60", () => {
    expect(PASS_THRESHOLD).toBe(60);
  });

  it("signal weights sum to 1.0", () => {
    const sum = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
