/**
 * Tests for FailoverClassifier — error classification + abort matrix.
 *
 * @module tests/agents/resilience/failover-classifier
 * @sprint 121 — Track 1
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  FailoverClassifier,
  ABORT_MATRIX,
  COOLDOWN_TTLS,
  formatProfileKey,
  parseProfileKey,
  getCooldownKey,
  getFailoverClassifier,
  resetFailoverClassifier,
  type FailoverReason,
  type FailoverAction,
  type ProviderProfileKey,
} from "../../../src/agents/resilience/failover-classifier.js";

let classifier: FailoverClassifier;

beforeEach(() => {
  classifier = new FailoverClassifier();
  resetFailoverClassifier();
});

// ============================================================================
// Constants
// ============================================================================

describe("ABORT_MATRIX", () => {
  it("auth → abort", () => expect(ABORT_MATRIX.auth).toBe("abort"));
  it("billing → abort", () => expect(ABORT_MATRIX.billing).toBe("abort"));
  it("rate_limit → fallback", () => expect(ABORT_MATRIX.rate_limit).toBe("fallback"));
  it("timeout → fallback", () => expect(ABORT_MATRIX.timeout).toBe("fallback"));
  it("format → retry", () => expect(ABORT_MATRIX.format).toBe("retry"));
  it("unknown → abort", () => expect(ABORT_MATRIX.unknown).toBe("abort"));
});

describe("COOLDOWN_TTLS", () => {
  it("rate_limit → 60s", () => expect(COOLDOWN_TTLS.rate_limit).toBe(60));
  it("timeout → 120s", () => expect(COOLDOWN_TTLS.timeout).toBe(120));
  it("auth → 300s", () => expect(COOLDOWN_TTLS.auth).toBe(300));
  it("billing → 600s", () => expect(COOLDOWN_TTLS.billing).toBe(600));
  it("format → 0s (no cooldown)", () => expect(COOLDOWN_TTLS.format).toBe(0));
  it("unknown → 0s", () => expect(COOLDOWN_TTLS.unknown).toBe(0));
});

// ============================================================================
// Provider Profile Key
// ============================================================================

describe("formatProfileKey", () => {
  it("formats key as provider:account:region:modelFamily", () => {
    const key: ProviderProfileKey = {
      provider: "anthropic",
      account: "default",
      region: "us",
      modelFamily: "claude",
    };
    expect(formatProfileKey(key)).toBe("anthropic:default:us:claude");
  });
});

describe("parseProfileKey", () => {
  it("parses valid key string", () => {
    const result = parseProfileKey("openai:acct1:eu:gpt");
    expect(result.provider).toBe("openai");
    expect(result.account).toBe("acct1");
    expect(result.region).toBe("eu");
    expect(result.modelFamily).toBe("gpt");
  });

  it("throws for invalid format (too few parts)", () => {
    expect(() => parseProfileKey("openai:acct1")).toThrow("Invalid provider profile key");
  });

  it("throws for invalid format (too many parts)", () => {
    expect(() => parseProfileKey("a:b:c:d:e")).toThrow("Invalid provider profile key");
  });

  it("throws for empty string", () => {
    expect(() => parseProfileKey("")).toThrow();
  });
});

describe("getCooldownKey", () => {
  it("returns cooldown: prefixed profile key", () => {
    const key: ProviderProfileKey = {
      provider: "anthropic",
      account: "default",
      region: "us",
      modelFamily: "claude",
    };
    expect(getCooldownKey(key)).toBe("cooldown:anthropic:default:us:claude");
  });
});

// ============================================================================
// classifyHttpError
// ============================================================================

describe("classifyHttpError", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [402, "billing"],
    [429, "rate_limit"],
    [408, "timeout"],
    [504, "timeout"],
    [400, "format"],
    [500, "unknown"],
    [503, "unknown"],
    [404, "unknown"],
  ] as [number, FailoverReason][])("status %d → %s", (status, expected) => {
    expect(classifier.classifyHttpError(status)).toBe(expected);
  });
});

// ============================================================================
// classifyErrorMessage
// ============================================================================

describe("classifyErrorMessage", () => {
  it("detects timeout patterns", () => {
    expect(classifier.classifyErrorMessage("Connection timed out")).toBe("timeout");
    expect(classifier.classifyErrorMessage("ETIMEDOUT")).toBe("timeout");
    expect(classifier.classifyErrorMessage("deadline exceeded")).toBe("timeout");
    expect(classifier.classifyErrorMessage("ECONNRESET")).toBe("timeout");
    expect(classifier.classifyErrorMessage("ECONNREFUSED")).toBe("timeout");
  });

  it("detects auth patterns", () => {
    expect(classifier.classifyErrorMessage("Unauthorized access")).toBe("auth");
    expect(classifier.classifyErrorMessage("Request forbidden")).toBe("auth");
  });

  it("detects rate limit patterns", () => {
    expect(classifier.classifyErrorMessage("Rate limit exceeded")).toBe("rate_limit");
    expect(classifier.classifyErrorMessage("Too many requests")).toBe("rate_limit");
  });

  it("detects billing patterns", () => {
    expect(classifier.classifyErrorMessage("Billing issue")).toBe("billing");
    expect(classifier.classifyErrorMessage("Payment required")).toBe("billing");
  });

  it("detects format patterns", () => {
    expect(classifier.classifyErrorMessage("Invalid request body")).toBe("format");
    expect(classifier.classifyErrorMessage("Malformed JSON")).toBe("format");
  });

  it("returns unknown for unrecognized messages", () => {
    expect(classifier.classifyErrorMessage("Something went wrong")).toBe("unknown");
    expect(classifier.classifyErrorMessage("")).toBe("unknown");
  });
});

// ============================================================================
// classifyException
// ============================================================================

describe("classifyException", () => {
  it("classifies Error by its message", () => {
    const err = new Error("Connection timed out");
    expect(classifier.classifyException(err)).toBe("timeout");
  });

  it("returns unknown for generic errors", () => {
    expect(classifier.classifyException(new Error("oops"))).toBe("unknown");
  });
});

// ============================================================================
// getAction / getCooldownTtl
// ============================================================================

describe("getAction", () => {
  it.each<[FailoverReason, FailoverAction]>([
    ["auth", "abort"],
    ["billing", "abort"],
    ["rate_limit", "fallback"],
    ["timeout", "fallback"],
    ["format", "retry"],
    ["unknown", "abort"],
  ])("%s → %s", (reason, expected) => {
    expect(classifier.getAction(reason)).toBe(expected);
  });
});

describe("getCooldownTtl", () => {
  it("returns correct TTL for rate_limit", () => {
    expect(classifier.getCooldownTtl("rate_limit")).toBe(60);
  });

  it("returns 0 for format (no cooldown)", () => {
    expect(classifier.getCooldownTtl("format")).toBe(0);
  });
});

// ============================================================================
// formatErrorAsString
// ============================================================================

describe("formatErrorAsString", () => {
  it("formats error with reason and action", () => {
    const result = classifier.formatErrorAsString("timeout", "Connection timed out");
    expect(result).toContain("Error [timeout]");
    expect(result).toContain("Connection timed out");
    expect(result).toContain("Action: fallback");
  });

  it("includes provider info when provided", () => {
    const key: ProviderProfileKey = {
      provider: "anthropic",
      account: "default",
      region: "us",
      modelFamily: "claude",
    };
    const result = classifier.formatErrorAsString("auth", new Error("Unauthorized"), key);
    expect(result).toContain("provider: anthropic:default:us:claude");
  });

  it("works with Error object", () => {
    const result = classifier.formatErrorAsString("format", new Error("Bad request"));
    expect(result).toContain("Bad request");
  });

  it("works without provider key", () => {
    const result = classifier.formatErrorAsString("unknown", "Some error");
    expect(result).not.toContain("provider:");
  });
});

// ============================================================================
// classifyAndRoute
// ============================================================================

describe("classifyAndRoute", () => {
  it("uses statusCode when provided (takes priority)", () => {
    const error = new Error("Something about billing");
    const result = classifier.classifyAndRoute(error, undefined, 429);
    expect(result.reason).toBe("rate_limit");
    expect(result.action).toBe("fallback");
  });

  it("falls back to error message classification", () => {
    const error = new Error("Connection timed out");
    const result = classifier.classifyAndRoute(error);
    expect(result.reason).toBe("timeout");
    expect(result.action).toBe("fallback");
  });

  it("returns complete ClassificationResult", () => {
    const error = new Error("Unauthorized");
    const result = classifier.classifyAndRoute(error);
    expect(result.reason).toBe("auth");
    expect(result.action).toBe("abort");
    expect(result.errorString).toContain("Error [auth]");
    expect(result.errorString).toContain("Unauthorized");
  });

  it("includes provider key in error string", () => {
    const key: ProviderProfileKey = {
      provider: "openai",
      account: "acct1",
      region: "eu",
      modelFamily: "gpt",
    };
    const result = classifier.classifyAndRoute(new Error("Rate limit"), key, 429);
    expect(result.errorString).toContain("openai:acct1:eu:gpt");
  });
});

// ============================================================================
// shouldFallback / shouldRetry / shouldAbort
// ============================================================================

describe("action predicates", () => {
  it("shouldFallback returns true only for fallback", () => {
    expect(classifier.shouldFallback("fallback")).toBe(true);
    expect(classifier.shouldFallback("abort")).toBe(false);
    expect(classifier.shouldFallback("retry")).toBe(false);
  });

  it("shouldRetry returns true only for retry", () => {
    expect(classifier.shouldRetry("retry")).toBe(true);
    expect(classifier.shouldRetry("abort")).toBe(false);
    expect(classifier.shouldRetry("fallback")).toBe(false);
  });

  it("shouldAbort returns true only for abort", () => {
    expect(classifier.shouldAbort("abort")).toBe(true);
    expect(classifier.shouldAbort("retry")).toBe(false);
    expect(classifier.shouldAbort("fallback")).toBe(false);
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe("singleton", () => {
  it("getFailoverClassifier returns same instance", () => {
    const a = getFailoverClassifier();
    const b = getFailoverClassifier();
    expect(a).toBe(b);
  });

  it("resetFailoverClassifier clears the singleton", () => {
    const a = getFailoverClassifier();
    resetFailoverClassifier();
    const b = getFailoverClassifier();
    expect(a).not.toBe(b);
  });
});
