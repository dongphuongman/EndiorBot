/**
 * Hook Verifier
 *
 * HMAC-SHA256 verification for Claude Code hook events.
 * Uses node:crypto.timingSafeEqual() per CTO A1 to prevent timing attacks.
 * Nonce store prevents replay attacks with 5-minute TTL.
 *
 * @module bridge/hooks/hook-verifier
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-024 §8.4, CTO A1
 * @stage 04 - BUILD (Sprint 85)
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

// ============================================================================
// Constants
// ============================================================================

const HMAC_SECRET_ENV = "ENDIORBOT_HOOK_HMAC_SECRET";
const DEFAULT_NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Types
// ============================================================================

export interface NonceValidationResult {
  valid: boolean;
  reason?: string;
}

// ============================================================================
// HookVerifier
// ============================================================================

export class HookVerifier {
  private readonly nonceStore = new Map<string, number>(); // nonce → timestamp
  private readonly secret: Buffer;
  private readonly nonceTtlMs: number;

  constructor(secret?: string, nonceTtlMs = DEFAULT_NONCE_TTL_MS) {
    const resolvedSecret = secret ?? process.env[HMAC_SECRET_ENV];
    if (!resolvedSecret) {
      throw new Error(
        `HMAC secret required: set ${HMAC_SECRET_ENV} environment variable or pass secret to constructor`,
      );
    }
    this.secret = Buffer.from(resolvedSecret, "utf-8");
    this.nonceTtlMs = nonceTtlMs;
  }

  /**
   * Create HMAC-SHA256 signature for a payload string.
   */
  sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  /**
   * Generate a nonce for a session.
   * Format: {sessionId}:{randomHex(16)}
   */
  createNonce(sessionId: string): string {
    const random = randomBytes(16).toString("hex");
    return `${sessionId}:${random}`;
  }

  /**
   * Verify HMAC signature using timing-safe comparison.
   * CTO A1: Must use node:crypto.timingSafeEqual() to prevent timing attacks.
   */
  verifySignature(payload: string, signature: string): boolean {
    const expected = this.sign(payload);

    // MF-4: Validate hex format before Buffer.from (rejects non-hex silently)
    if (!/^[a-f0-9]+$/i.test(signature)) {
      return false;
    }

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");

    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Validate nonce: must be well-formed, single-use, and not expired.
   */
  validateNonce(nonce: string): NonceValidationResult {
    // Check format: must contain ":"
    if (!nonce.includes(":")) {
      return { valid: false, reason: "invalid nonce format" };
    }

    // Check replay
    if (this.nonceStore.has(nonce)) {
      return { valid: false, reason: "nonce already used (replay)" };
    }

    // Sweep expired nonces before adding
    this.sweepExpired();

    // Record nonce with current timestamp
    this.nonceStore.set(nonce, Date.now());

    return { valid: true };
  }

  /**
   * Remove expired nonces from store.
   */
  private sweepExpired(): void {
    const cutoff = Date.now() - this.nonceTtlMs;
    for (const [nonce, ts] of this.nonceStore) {
      if (ts < cutoff) {
        this.nonceStore.delete(nonce);
      }
    }
  }

  /**
   * Get nonce store size (for testing).
   */
  getNonceCount(): number {
    return this.nonceStore.size;
  }
}
