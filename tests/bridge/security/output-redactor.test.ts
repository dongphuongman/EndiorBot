/**
 * Bridge Output Redactor Tests
 *
 * Tests for redactBridgeOutput() — covers line limits by riskMode,
 * OutputScrubber integration, high-sensitivity blocking, bridge token
 * redaction, policy pattern application, and idempotency.
 *
 * @module tests/bridge/security/output-redactor
 * @version 1.0.0
 * @date 2026-03-06
 * @authority ADR-024 D2, CTO C1
 * @stage 04 - BUILD (Sprint 82)
 */

import { describe, it, expect } from "vitest";

import { redactBridgeOutput } from "../../../src/bridge/security/output-redactor.js";
import type { SessionRiskMode } from "../../../src/bridge/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeLines(count: number, prefix = "line"): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n");
}

function redact(
  output: string,
  mode: SessionRiskMode = "read",
  extra: string[] = []
): ReturnType<typeof redactBridgeOutput> {
  return redactBridgeOutput(output, mode, extra);
}

// ============================================================================
// Empty Input
// ============================================================================

describe("redactBridgeOutput — empty input", () => {
  it("returns non-blocked empty result for empty string", () => {
    const result = redact("");
    expect(result.blocked).toBe(false);
    expect(result.content).toBe("");
    expect(result.violations).toEqual([]);
  });
});

// ============================================================================
// Line Limits by RiskMode (ADR-024 D2)
// ============================================================================

describe("redactBridgeOutput — line limits", () => {
  it("read mode keeps last 30 lines", () => {
    const output = makeLines(50);
    const result = redact(output, "read");
    expect(result.blocked).toBe(false);
    const lines = result.content.split("\n");
    expect(lines.length).toBeLessThanOrEqual(30);
    // Last line should be "line 50"
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toBe("line 50");
  });

  it("patch mode keeps last 50 lines", () => {
    const output = makeLines(80);
    const result = redact(output, "patch");
    expect(result.blocked).toBe(false);
    const lines = result.content.split("\n");
    expect(lines.length).toBeLessThanOrEqual(50);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toBe("line 80");
  });

  it("interactive mode keeps last 100 lines", () => {
    const output = makeLines(150);
    const result = redact(output, "interactive");
    expect(result.blocked).toBe(false);
    const lines = result.content.split("\n");
    expect(lines.length).toBeLessThanOrEqual(100);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toBe("line 150");
  });

  it("output under limit passes through unchanged (line count)", () => {
    const output = makeLines(10);
    const result = redact(output, "read");
    expect(result.blocked).toBe(false);
    expect(result.content.split("\n").length).toBe(10);
  });
});

// ============================================================================
// OutputScrubber.scrub() Integration
// ============================================================================

describe("redactBridgeOutput — OutputScrubber integration", () => {
  it("redacts token=secret pattern (credential pattern)", () => {
    const result = redact("token=supersecretvalue123", "read");
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain("supersecretvalue123");
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("redacts api_key=value pattern", () => {
    const result = redact("api_key=my-api-key-value-here", "read");
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain("my-api-key-value-here");
  });
});

// ============================================================================
// High-Sensitivity Deny-by-Default
// ============================================================================

describe("redactBridgeOutput — high-sensitivity blocking", () => {
  it("blocks output containing BEGIN RSA PRIVATE KEY", () => {
    // Use just the header line without a closing END block so OutputScrubber's
    // full PEM_PATTERN (which requires BEGIN + content + END) does not consume
    // it, leaving the header visible for HIGH_SENSITIVITY_PATTERNS to match.
    const output = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA... (truncated)";
    const result = redact(output, "interactive");
    expect(result.blocked).toBe(true);
    expect(result.content).toBe("");
    expect(result.reason).toMatch(/sensitive/i);
    expect(result.violations).toContain("high_sensitivity_blocked");
  });

  it("blocks output containing DATABASE_URL=", () => {
    const output = "DATABASE_URL=postgresql://user:pass@localhost/db";
    const result = redact(output, "interactive");
    expect(result.blocked).toBe(true);
    expect(result.content).toBe("");
    expect(result.violations).toContain("high_sensitivity_blocked");
  });

  it("blocks output containing AWS_SECRET_ACCESS_KEY=", () => {
    const output = "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const result = redact(output, "read");
    expect(result.blocked).toBe(true);
    expect(result.violations).toContain("high_sensitivity_blocked");
  });

  it("blocks output containing OPENSSH private key header", () => {
    // Use just the header line without a closing END block — same reason as
    // the RSA test: OutputScrubber only replaces complete BEGIN...END blocks.
    const output = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA= (truncated)";
    const result = redact(output, "read");
    expect(result.blocked).toBe(true);
    expect(result.violations).toContain("high_sensitivity_blocked");
  });
});

// ============================================================================
// Bridge Token Pattern Redaction
// ============================================================================

describe("redactBridgeOutput — bridge token patterns", () => {
  it("redacts Anthropic API key (sk-ant-...)", () => {
    const token = "sk-ant-api03-" + "A".repeat(20);
    const result = redact(`Here is the key: ${token}`, "read");
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain(token);
    expect(result.content).toContain("[REDACTED]");
    expect(result.violations).toContain("bridge_token");
  });

  it("redacts Anthropic short prefix key (sk-...)", () => {
    const token = "sk-" + "B".repeat(25);
    const result = redact(`key=${token}`, "read");
    // sk- prefix is handled by the bridge pattern
    expect(result.content).not.toContain(token);
  });

  it("redacts GitHub PAT (ghp_...)", () => {
    const token = "ghp_" + "X".repeat(25);
    // Avoid the "token:" prefix so OutputScrubber's token pattern does not
    // consume it first; present it as a bare value in a log line.
    const result = redact(`auth_header=${token}`, "read");
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain(token);
    expect(result.violations).toContain("bridge_token");
  });

  it("redacts Google API key (AIzaSy...)", () => {
    const token = "AIzaSy" + "Z".repeat(33);
    const result = redact(`GOOGLE_KEY=${token}`, "read");
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain(token);
    expect(result.violations).toContain("bridge_token");
  });
});

// ============================================================================
// Policy Extra Patterns
// ============================================================================

describe("redactBridgeOutput — policy extra patterns", () => {
  it("redacts custom pattern from extraPatterns list", () => {
    const result = redact(
      "internal-secret-value-123",
      "read",
      ["internal-secret-[a-z0-9-]+"]
    );
    expect(result.blocked).toBe(false);
    expect(result.content).not.toContain("internal-secret-value-123");
    expect(result.content).toContain("[REDACTED]");
    expect(result.violations).toContain("policy_pattern");
  });

  it("skips invalid regex in extraPatterns without throwing", () => {
    // Invalid regex — should be silently skipped
    expect(() =>
      redact("some safe output", "read", ["[invalid-regex"])
    ).not.toThrow();
  });

  it("applies multiple extra patterns", () => {
    const result = redact(
      "alpha=foo beta=bar",
      "read",
      ["alpha=[a-z]+", "beta=[a-z]+"]
    );
    expect(result.content).not.toContain("foo");
    expect(result.content).not.toContain("bar");
  });
});

// ============================================================================
// Idempotency — already-scrubbed content
// ============================================================================

describe("redactBridgeOutput — idempotency", () => {
  it("does not double-redact already scrubbed [REDACTED] markers", () => {
    // Content already scrubbed by OutputScrubber contains [REDACTED]
    const alreadyScrubbed = "token=abcd****[REDACTED] some normal text";
    const result = redact(alreadyScrubbed, "read");
    expect(result.blocked).toBe(false);
    // Should not add extra [REDACTED] markers after the existing one
    const redactedCount = (result.content.match(/\[REDACTED\]/g) ?? []).length;
    expect(redactedCount).toBe(1);
  });
});

// ============================================================================
// Violations Array
// ============================================================================

describe("redactBridgeOutput — violations array", () => {
  it("returns empty violations for clean output", () => {
    const result = redact("This is a clean build log.", "read");
    expect(result.violations).toEqual([]);
  });

  it("populates violations with deduplicated entries", () => {
    // Two different bridge tokens in same output → only one 'bridge_token' entry
    const tok1 = "ghp_" + "A".repeat(25);
    const tok2 = "ghp_" + "B".repeat(25);
    const result = redact(`${tok1} and ${tok2}`, "read");
    const count = result.violations.filter((v) => v === "bridge_token").length;
    expect(count).toBe(1);
  });
});
