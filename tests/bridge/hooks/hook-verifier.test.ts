/**
 * Tests for HookVerifier — Sprint 85 (ADR-024 §8.4)
 *
 * Covers: HMAC signing, timing-safe verification (CTO A1),
 * nonce creation, nonce validation, replay rejection, expiry sweep.
 *
 * @module tests/bridge/hooks/hook-verifier
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { HookVerifier } from "../../../src/bridge/hooks/hook-verifier.js";

// ============================================================================
// Constants
// ============================================================================

const TEST_SECRET = "test-hmac-secret-for-unit-tests";

// ============================================================================
// Tests
// ============================================================================

describe("HookVerifier", () => {
  let verifier: HookVerifier;

  beforeEach(() => {
    verifier = new HookVerifier(TEST_SECRET);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  it("throws when no secret is provided and env is unset", () => {
    const original = process.env["ENDIORBOT_HOOK_HMAC_SECRET"];
    delete process.env["ENDIORBOT_HOOK_HMAC_SECRET"];
    try {
      expect(() => new HookVerifier()).toThrow("HMAC secret required");
    } finally {
      if (original !== undefined) {
        process.env["ENDIORBOT_HOOK_HMAC_SECRET"] = original;
      }
    }
  });

  it("accepts secret from environment variable", () => {
    const original = process.env["ENDIORBOT_HOOK_HMAC_SECRET"];
    process.env["ENDIORBOT_HOOK_HMAC_SECRET"] = "env-secret";
    try {
      const v = new HookVerifier();
      const sig = v.sign("test");
      expect(sig).toHaveLength(64); // SHA256 hex = 64 chars
    } finally {
      if (original !== undefined) {
        process.env["ENDIORBOT_HOOK_HMAC_SECRET"] = original;
      } else {
        delete process.env["ENDIORBOT_HOOK_HMAC_SECRET"];
      }
    }
  });

  // --------------------------------------------------------------------------
  // HMAC Signing
  // --------------------------------------------------------------------------

  it("produces correct HMAC-SHA256 signature", () => {
    const payload = '{"eventType":"stop","sessionId":"bridge_123"}';
    const sig = verifier.sign(payload);

    // Reference: node:crypto directly
    const expected = createHmac("sha256", Buffer.from(TEST_SECRET, "utf-8"))
      .update(payload)
      .digest("hex");

    expect(sig).toBe(expected);
  });

  // --------------------------------------------------------------------------
  // HMAC Verification (CTO A1: timingSafeEqual)
  // --------------------------------------------------------------------------

  it("verifies a valid signature", () => {
    const payload = "test-payload";
    const sig = verifier.sign(payload);
    expect(verifier.verifySignature(payload, sig)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const payload = "test-payload";
    const sig = verifier.sign(payload);
    // Tamper with last char
    const tampered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifier.verifySignature(payload, tampered)).toBe(false);
  });

  it("rejects a signature with wrong length", () => {
    const payload = "test-payload";
    expect(verifier.verifySignature(payload, "abcd")).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Nonce Creation
  // --------------------------------------------------------------------------

  it("creates nonce in sessionId:randomHex format", () => {
    const nonce = verifier.createNonce("bridge_12345");
    expect(nonce).toMatch(/^bridge_12345:[a-f0-9]{32}$/);
  });

  it("creates unique nonces for same session", () => {
    const n1 = verifier.createNonce("bridge_123");
    const n2 = verifier.createNonce("bridge_123");
    expect(n1).not.toBe(n2);
  });

  // --------------------------------------------------------------------------
  // Nonce Validation
  // --------------------------------------------------------------------------

  it("accepts a valid nonce on first use", () => {
    const nonce = verifier.createNonce("bridge_123");
    const result = verifier.validateNonce(nonce);
    expect(result.valid).toBe(true);
  });

  it("rejects a replayed nonce", () => {
    const nonce = verifier.createNonce("bridge_123");
    verifier.validateNonce(nonce); // First use
    const result = verifier.validateNonce(nonce); // Replay
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("replay");
  });

  it("rejects a nonce without colon separator", () => {
    const result = verifier.validateNonce("no-colon-here");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("invalid nonce format");
  });

  it("sweeps expired nonces", () => {
    // Use short TTL for test
    const shortTtlVerifier = new HookVerifier(TEST_SECRET, 50); // 50ms TTL

    const nonce = shortTtlVerifier.createNonce("bridge_123");
    shortTtlVerifier.validateNonce(nonce);
    expect(shortTtlVerifier.getNonceCount()).toBe(1);

    // Wait for expiry + trigger sweep
    vi.useFakeTimers();
    vi.advanceTimersByTime(100);

    const freshNonce = shortTtlVerifier.createNonce("bridge_456");
    shortTtlVerifier.validateNonce(freshNonce); // triggers sweep

    // Expired nonce should be swept, only fresh one remains
    expect(shortTtlVerifier.getNonceCount()).toBe(1);

    vi.useRealTimers();
  });
});
