/**
 * Intent Parser Tests
 *
 * Tests for parsing CEO messages to intents.
 *
 * @module tests/channels/conversation/intents
 * @date 2026-02-24
 * @status Sprint 46 Days 6-7
 */

import { describe, it, expect } from "vitest";
import {
  parseIntent,
  requiresApprovalId,
  isActionableIntent,
  getIntentDescription,
  type ParsedIntent,
} from "../../../src/channels/conversation/intents.js";

// ============================================================================
// Command Parsing Tests
// ============================================================================

describe("Intent Parser - Commands", () => {
  describe("/approve command", () => {
    it("should parse /approve with ID", () => {
      const result = parseIntent("/approve apr-123");

      expect(result.intent).toBe("APPROVE");
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe("command");
      expect(result.params.approvalId).toBe("apr-123");
    });

    it("should parse /approve with ID and notes", () => {
      const result = parseIntent("/approve apr-123 Looks good");

      expect(result.intent).toBe("APPROVE");
      expect(result.params.approvalId).toBe("apr-123");
      expect(result.params.reason).toBe("Looks good");
    });

    it("should be case-insensitive", () => {
      const result = parseIntent("/APPROVE apr-123");

      expect(result.intent).toBe("APPROVE");
      expect(result.params.approvalId).toBe("apr-123");
    });
  });

  describe("/reject command", () => {
    it("should parse /reject with ID", () => {
      const result = parseIntent("/reject apr-456");

      expect(result.intent).toBe("REJECT");
      expect(result.confidence).toBe(1.0);
      expect(result.params.approvalId).toBe("apr-456");
      expect(result.params.reason).toBe("Rejected by CEO");
    });

    it("should parse /reject with ID and reason", () => {
      const result = parseIntent("/reject apr-456 Too risky");

      expect(result.intent).toBe("REJECT");
      expect(result.params.approvalId).toBe("apr-456");
      expect(result.params.reason).toBe("Too risky");
    });
  });

  describe("/status command", () => {
    it("should parse /status", () => {
      const result = parseIntent("/status");

      expect(result.intent).toBe("STATUS");
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe("command");
    });

    it("should parse /help as STATUS", () => {
      const result = parseIntent("/help");

      expect(result.intent).toBe("STATUS");
    });
  });

  describe("/error command", () => {
    it("should parse /error without index", () => {
      const result = parseIntent("/error");

      expect(result.intent).toBe("SHOW_ERROR");
      expect(result.params.errorIndex).toBeUndefined();
    });

    it("should parse /error with index", () => {
      const result = parseIntent("/error 3");

      expect(result.intent).toBe("SHOW_ERROR");
      expect(result.params.errorIndex).toBe(3);
    });
  });

  describe("/retry command", () => {
    it("should parse /retry without strategy", () => {
      const result = parseIntent("/retry");

      expect(result.intent).toBe("TRY_DIFFERENT");
      expect(result.params.strategy).toBeUndefined();
    });

    it("should parse /retry with strategy", () => {
      const result = parseIntent("/retry claude");

      expect(result.intent).toBe("TRY_DIFFERENT");
      expect(result.params.strategy).toBe("claude");
    });
  });
});

// ============================================================================
// NLP Parsing Tests
// ============================================================================

describe("Intent Parser - NLP", () => {
  describe("STATUS patterns", () => {
    const statusPatterns = [
      "what's the status",
      "show status",
      "check status",
      "how is it going",
      "how is everything going",
      "what's happening",
      "status update",
      "give me a status",
    ];

    it.each(statusPatterns)("should parse '%s' as STATUS", (message) => {
      const result = parseIntent(message);

      expect(result.intent).toBe("STATUS");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.method).toBe("nlp");
    });
  });

  describe("SHOW_ERROR patterns", () => {
    const errorPatterns = [
      "show me the error",
      "what's the error",
      "what went wrong",
      "what failed",
      "last error",
      "error details",
    ];

    it.each(errorPatterns)("should parse '%s' as SHOW_ERROR", (message) => {
      const result = parseIntent(message);

      expect(result.intent).toBe("SHOW_ERROR");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("TRY_DIFFERENT patterns", () => {
    const retryPatterns = [
      "try a different approach",
      "try again",
      "retry",
      "do it differently",
      "use a different model",
    ];

    it.each(retryPatterns)("should parse '%s' as TRY_DIFFERENT", (message) => {
      const result = parseIntent(message);

      expect(result.intent).toBe("TRY_DIFFERENT");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("should extract model strategy from message", () => {
      const result = parseIntent("try with claude");

      expect(result.intent).toBe("TRY_DIFFERENT");
      expect(result.params.strategy).toBe("claude");
    });

    it("should extract gpt strategy", () => {
      const result = parseIntent("try with gpt");

      expect(result.intent).toBe("TRY_DIFFERENT");
      expect(result.params.strategy).toBe("gpt");
    });
  });

  describe("APPROVE patterns (low confidence)", () => {
    it("should parse 'yes' as APPROVE with low confidence", () => {
      const result = parseIntent("yes");

      expect(result.intent).toBe("APPROVE");
      expect(result.confidence).toBeLessThan(0.8);
    });

    it("should parse 'looks good' as APPROVE", () => {
      const result = parseIntent("looks good");

      expect(result.intent).toBe("APPROVE");
    });
  });

  describe("REJECT patterns (low confidence)", () => {
    it("should parse 'no' as REJECT with low confidence", () => {
      const result = parseIntent("no");

      expect(result.intent).toBe("REJECT");
      expect(result.confidence).toBeLessThan(0.8);
    });

    it("should parse 'abort' as REJECT", () => {
      const result = parseIntent("abort");

      expect(result.intent).toBe("REJECT");
    });
  });
});

// ============================================================================
// UNKNOWN Intent Tests
// ============================================================================

describe("Intent Parser - Unknown", () => {
  it("should return UNKNOWN for unrecognized messages", () => {
    const result = parseIntent("hello there");

    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
  });

  it("should return UNKNOWN for random text", () => {
    const result = parseIntent("xyz abc 123");

    expect(result.intent).toBe("UNKNOWN");
  });

  it("should preserve original message", () => {
    const message = "some random message";
    const result = parseIntent(message);

    expect(result.originalMessage).toBe(message);
  });
});

// ============================================================================
// Priority Tests
// ============================================================================

describe("Intent Parser - Priority", () => {
  it("should prefer commands over NLP", () => {
    // "status" could match NLP, but "/status" should match command
    const result = parseIntent("/status");

    expect(result.method).toBe("command");
    expect(result.confidence).toBe(1.0);
  });

  it("should handle whitespace", () => {
    const result = parseIntent("  /approve apr-123  ");

    expect(result.intent).toBe("APPROVE");
    expect(result.params.approvalId).toBe("apr-123");
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("Intent Helpers", () => {
  describe("requiresApprovalId", () => {
    it("should return true for APPROVE", () => {
      expect(requiresApprovalId("APPROVE")).toBe(true);
    });

    it("should return true for REJECT", () => {
      expect(requiresApprovalId("REJECT")).toBe(true);
    });

    it("should return false for STATUS", () => {
      expect(requiresApprovalId("STATUS")).toBe(false);
    });

    it("should return false for SHOW_ERROR", () => {
      expect(requiresApprovalId("SHOW_ERROR")).toBe(false);
    });

    it("should return false for TRY_DIFFERENT", () => {
      expect(requiresApprovalId("TRY_DIFFERENT")).toBe(false);
    });
  });

  describe("isActionableIntent", () => {
    it("should return true for all known intents", () => {
      expect(isActionableIntent("APPROVE")).toBe(true);
      expect(isActionableIntent("REJECT")).toBe(true);
      expect(isActionableIntent("STATUS")).toBe(true);
      expect(isActionableIntent("SHOW_ERROR")).toBe(true);
      expect(isActionableIntent("TRY_DIFFERENT")).toBe(true);
    });

    it("should return false for UNKNOWN", () => {
      expect(isActionableIntent("UNKNOWN")).toBe(false);
    });
  });

  describe("getIntentDescription", () => {
    it("should return description for each intent", () => {
      expect(getIntentDescription("APPROVE")).toContain("Approve");
      expect(getIntentDescription("REJECT")).toContain("Reject");
      expect(getIntentDescription("STATUS")).toContain("status");
      expect(getIntentDescription("SHOW_ERROR")).toContain("error");
      expect(getIntentDescription("TRY_DIFFERENT")).toContain("Retry");
      expect(getIntentDescription("UNKNOWN")).toContain("Unknown");
    });
  });
});
