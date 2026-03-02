/**
 * Failure Classifier Tests
 *
 * Unit tests for FailureClassifier.
 *
 * @module sessions/__tests__/failure-classifier.test
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @sprint 69-71
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  FailureClassifier,
  FailureType,
  createFailureClassifier,
  type FailureEvidence,
} from "../failure/index.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("FailureClassifier", () => {
  let classifier: FailureClassifier;

  beforeEach(() => {
    classifier = new FailureClassifier({ debug: false });
  });

  // ============================================================================
  // Classification Tests
  // ============================================================================

  describe("classify", () => {
    it("should classify network errors as TRANSIENT", () => {
      const error = new Error("ECONNREFUSED: Connection refused");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.TRANSIENT);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should classify timeout errors as TRANSIENT", () => {
      // Use pattern that matches: /network timeout/i
      const error = new Error("Network timeout after 30000ms");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.TRANSIENT);
    });

    it("should classify rate limit errors as TRANSIENT", () => {
      const error = new Error("Rate limit exceeded, please retry after 60 seconds");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.TRANSIENT);
    });

    it("should classify TypeScript errors as FIXABLE", () => {
      // Uses pattern /TS\d{4}:/
      const error = new Error("TS2345: Argument of type 'string' is not assignable");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.FIXABLE);
    });

    it("should classify ESLint errors as FIXABLE", () => {
      // Uses pattern /eslint/i
      const error = new Error("ESLint: Unexpected console statement (no-console)");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.FIXABLE);
    });

    it("should classify test failures as FIXABLE", () => {
      // Uses pattern /test failed/i
      const error = new Error("Test failed: expected 1 to equal 2");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.FIXABLE);
    });

    it("should classify syntax errors as FIXABLE", () => {
      // Uses pattern /syntax error/i
      const error = new Error("Syntax error: Unexpected token '}'");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.FIXABLE);
    });

    it("should classify unknown errors as DESIGN_ISSUE by default", () => {
      // Errors that don't match any pattern default to DESIGN_ISSUE
      const error = new Error("Some unknown error occurred");
      const result = classifier.classify(error);

      expect(result.type).toBe(FailureType.DESIGN_ISSUE);
    });
  });

  // ============================================================================
  // Evidence Gathering Tests
  // ============================================================================

  describe("gatherEvidence", () => {
    it("should gather error information", () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.ts:10:5";

      const evidence = classifier.gatherEvidence(error);

      expect(evidence.type).toBe("Error");
      expect(evidence.message).toBe("Test error");
      expect(evidence.stackTrace).toContain("test.ts:10:5");
      expect(evidence.timestamp).toBeDefined();
    });

    it("should include context information", () => {
      const error = new Error("Test error");
      const context = {
        attempts: 3,
        sourceFile: "src/test.ts",
        relatedFiles: ["src/other.ts"],
      };

      const evidence = classifier.gatherEvidence(error, context);

      expect(evidence.attempts).toBe(3);
      expect(evidence.sourceFile).toBe("src/test.ts");
      expect(evidence.relatedFiles).toEqual(["src/other.ts"]);
    });

    it("should default attempts to 1", () => {
      const error = new Error("Test error");
      const evidence = classifier.gatherEvidence(error);

      expect(evidence.attempts).toBe(1);
    });
  });

  // ============================================================================
  // Design Issue Evidence Tests
  // ============================================================================

  describe("hasDesignIssueEvidence", () => {
    it("should return false for no failures", () => {
      expect(classifier.hasDesignIssueEvidence([])).toBe(false);
    });

    it("should return false for single evidence type", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "spec mismatch detected", // Only spec_mismatch evidence
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      expect(classifier.hasDesignIssueEvidence(failures)).toBe(false);
    });

    it("should return true for multiple evidence types (CTO P0-6)", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "spec mismatch detected", // spec_mismatch evidence
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
        {
          type: "Error",
          message: "breaking change in API", // breaking_change evidence
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      expect(classifier.hasDesignIssueEvidence(failures)).toBe(true);
    });

    it("should detect repeated_failure when attempts >= 3", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "Some error",
          attempts: 3, // repeated_failure evidence
          timestamp: new Date().toISOString(),
          context: {},
        },
        {
          type: "Error",
          message: "spec mismatch", // spec_mismatch evidence
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      expect(classifier.hasDesignIssueEvidence(failures)).toBe(true);
    });
  });

  // ============================================================================
  // Evidence Type Detection Tests
  // ============================================================================

  describe("getEvidenceTypes", () => {
    it("should detect spec_mismatch evidence", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "spec mismatch detected",
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      const types = classifier.getEvidenceTypes(failures);
      expect(types).toContain("spec_mismatch");
    });

    it("should detect breaking_change evidence", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "breaking change in module",
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      const types = classifier.getEvidenceTypes(failures);
      expect(types).toContain("breaking_change");
    });

    it("should detect repeated_failure when attempts >= 3", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "Some error",
          attempts: 3,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      const types = classifier.getEvidenceTypes(failures);
      expect(types).toContain("repeated_failure");
    });

    it("should detect integration_failure evidence", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "Integration fail in service",
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      const types = classifier.getEvidenceTypes(failures);
      expect(types).toContain("integration_failure");
    });

    it("should return unique evidence types", () => {
      const failures: FailureEvidence[] = [
        {
          type: "Error",
          message: "spec mismatch #1",
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
        {
          type: "Error",
          message: "spec mismatch #2",
          attempts: 1,
          timestamp: new Date().toISOString(),
          context: {},
        },
      ];

      const types = classifier.getEvidenceTypes(failures);
      expect(types.filter((t) => t === "spec_mismatch").length).toBe(1);
    });
  });

  // ============================================================================
  // Classify Evidence Tests
  // ============================================================================

  describe("classifyEvidence", () => {
    it("should classify gathered evidence as TRANSIENT", () => {
      const evidence: FailureEvidence = {
        type: "Error",
        message: "ECONNREFUSED",
        attempts: 1,
        timestamp: new Date().toISOString(),
        context: {},
      };

      const result = classifier.classifyEvidence(evidence);

      expect(result.type).toBe(FailureType.TRANSIENT);
    });

    it("should classify gathered evidence as FIXABLE", () => {
      const evidence: FailureEvidence = {
        type: "Error",
        message: "ESLint error: no-unused-vars",
        attempts: 1,
        timestamp: new Date().toISOString(),
        context: {},
      };

      const result = classifier.classifyEvidence(evidence);

      expect(result.type).toBe(FailureType.FIXABLE);
    });
  });

  // ============================================================================
  // Pattern Matching Tests
  // ============================================================================

  describe("pattern matching", () => {
    it("should detect transient patterns", () => {
      const transientErrors = [
        "network timeout",
        "rate limit exceeded",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "connection reset",
        "socket hang up",
      ];

      for (const msg of transientErrors) {
        const error = new Error(msg);
        expect(classifier.classify(error).type).toBe(FailureType.TRANSIENT);
      }
    });

    it("should detect fixable patterns", () => {
      const fixableErrors = [
        "lint error detected",
        "ESLint warning",
        "test failed",
        "TS2345: type error",
        "syntax error",
        "compilation failed",
      ];

      for (const msg of fixableErrors) {
        const error = new Error(msg);
        expect(classifier.classify(error).type).toBe(FailureType.FIXABLE);
      }
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createFailureClassifier", () => {
  it("should create a new classifier", () => {
    const classifier = createFailureClassifier({ debug: false });

    expect(classifier).toBeInstanceOf(FailureClassifier);
  });
});
