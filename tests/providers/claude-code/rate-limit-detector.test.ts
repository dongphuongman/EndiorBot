/**
 * Rate-Limit Detector Tests — Sprint 136 A11
 *
 * @module tests/providers/claude-code/rate-limit-detector
 */

import { describe, it, expect } from "vitest";
import { classifyClaudeCodeFailure } from "../../../src/providers/claude-code/rate-limit-detector.js";

describe("classifyClaudeCodeFailure (Sprint 136 A11)", () => {
  describe("TIMEOUT — host-enforced takes precedence", () => {
    it("classifies host timeout as TIMEOUT regardless of other signals", () => {
      const r = classifyClaudeCodeFailure({
        timedOutByHost: true,
        stderr: "rate limit exceeded", // even this is overridden by host timeout
        exitCode: 143,
      });
      expect(r.kind).toBe("TIMEOUT");
      expect(r.reason).toMatch(/Host-enforced timeout/);
    });
  });

  describe("RATE_LIMITED — Max plan quotas", () => {
    it("detects 5-hour limit", () => {
      const r = classifyClaudeCodeFailure({
        stderr: "You've hit your 5-hour limit, resets at 18:00 UTC",
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.matchedToken).toBe("5-hour-limit");
    });

    it("detects weekly limit", () => {
      const r = classifyClaudeCodeFailure({
        stderr: "Weekly rate limit reached. Please try again after Monday.",
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.matchedToken).toBe("weekly-limit");
    });

    it("detects generic rate_limit_error from API JSON", () => {
      const r = classifyClaudeCodeFailure({
        stdout: '{"error":{"type":"rate_limit_error","message":"too many"}}',
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.matchedToken).toBe("api-error-rate_limit");
    });

    it("detects HTTP 429", () => {
      const r = classifyClaudeCodeFailure({
        error: "Request failed with HTTP 429 Too Many Requests",
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.matchedToken).toBe("http-429");
    });

    it("detects usage limit phrasing", () => {
      const r = classifyClaudeCodeFailure({
        stderr: "Your usage limit has been reached for this period.",
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.matchedToken).toBe("usage-limit");
    });
  });

  describe("AUTH — session / login failures", () => {
    it("detects not-authenticated", () => {
      const r = classifyClaudeCodeFailure({
        stderr: "You are not authenticated. Please run `claude login`.",
      });
      expect(r.kind).toBe("AUTH");
    });

    it("detects OAuth expired", () => {
      const r = classifyClaudeCodeFailure({
        error: "OAuth token expired",
      });
      expect(r.kind).toBe("AUTH");
    });

    it("detects HTTP 401", () => {
      const r = classifyClaudeCodeFailure({
        error: "HTTP 401 Unauthorized",
      });
      expect(r.kind).toBe("AUTH");
    });

    it("auth pattern does not mis-match rate-limit", () => {
      // a rate-limit message that happens to contain 'auth' word shouldn't
      // become AUTH. 'rate limit' wins when it's the strongest signal.
      const r = classifyClaudeCodeFailure({
        stderr: "authenticated user exceeded rate limit",
      });
      expect(r.kind).toBe("RATE_LIMITED");
    });
  });

  describe("OTHER — everything else", () => {
    it("returns OTHER when no pattern matches", () => {
      const r = classifyClaudeCodeFailure({
        stderr: "Some unexpected segfault in tokenizer.c",
        exitCode: 139,
      });
      expect(r.kind).toBe("OTHER");
    });

    it("returns OTHER for empty context (missing signals)", () => {
      const r = classifyClaudeCodeFailure({});
      expect(r.kind).toBe("OTHER");
    });

    it("includes exit code in reason when provided", () => {
      const r = classifyClaudeCodeFailure({ exitCode: 137 });
      expect(r.kind).toBe("OTHER");
      expect(r.reason).toMatch(/137/);
    });
  });

  describe("Static contract (security / threat-model)", () => {
    it("classifier does not expose or log the raw error corpus", () => {
      // If callers pass secrets in error, classification should not embed
      // them in the reason/matchedToken. Reason contains only classification
      // labels + generic text; matchedToken is a human-readable pattern label.
      const secret = "my-very-secret-api-key-12345";
      const r = classifyClaudeCodeFailure({
        stderr: `rate limit exceeded. token=${secret}`,
      });
      expect(r.kind).toBe("RATE_LIMITED");
      expect(r.reason).not.toContain(secret);
      expect(r.matchedToken ?? "").not.toContain(secret);
    });
  });
});
