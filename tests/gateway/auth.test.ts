/**
 * Gateway Auth Tests
 *
 * @module tests/gateway/auth
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 4
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GatewayAuthManager,
  RateLimiter,
  isLocalhostAddress,
  createAuthManager,
  createRateLimiter,
} from "../../src/gateway/auth.js";

describe("Gateway Auth", () => {
  describe("isLocalhostAddress", () => {
    it("should detect IPv4 localhost", () => {
      expect(isLocalhostAddress("127.0.0.1")).toBe(true);
      expect(isLocalhostAddress("127.0.0.2")).toBe(true);
      expect(isLocalhostAddress("127.255.255.255")).toBe(true);
    });

    it("should detect IPv6 localhost", () => {
      expect(isLocalhostAddress("::1")).toBe(true);
      expect(isLocalhostAddress("::ffff:127.0.0.1")).toBe(true);
    });

    it("should detect localhost hostname", () => {
      expect(isLocalhostAddress("localhost")).toBe(true);
      expect(isLocalhostAddress("LOCALHOST")).toBe(true);
    });

    it("should reject non-localhost addresses", () => {
      expect(isLocalhostAddress("192.168.1.1")).toBe(false);
      expect(isLocalhostAddress("10.0.0.1")).toBe(false);
      expect(isLocalhostAddress("8.8.8.8")).toBe(false);
      expect(isLocalhostAddress("example.com")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isLocalhostAddress("")).toBe(false);
      expect(isLocalhostAddress("   ")).toBe(false);
    });
  });

  describe("GatewayAuthManager", () => {
    let authManager: GatewayAuthManager;

    beforeEach(() => {
      authManager = createAuthManager({ secretKey: "test-secret-key" });
    });

    describe("Token Creation", () => {
      it("should create valid token", () => {
        const token = authManager.createToken("client-1", "desktop");

        expect(token).toBeDefined();
        expect(token).toContain(".");
        expect(token.split(".")).toHaveLength(2);
      });

      it("should create different tokens for different clients", () => {
        const token1 = authManager.createToken("client-1");
        const token2 = authManager.createToken("client-2");

        expect(token1).not.toBe(token2);
      });
    });

    describe("Token Validation", () => {
      it("should validate correct token", () => {
        const token = authManager.createToken("client-1", "cli");

        const result = authManager.validateToken(token);

        expect(result.valid).toBe(true);
        expect(result.payload).toBeDefined();
        expect(result.payload?.clientId).toBe("client-1");
        expect(result.payload?.clientType).toBe("cli");
      });

      it("should reject empty token", () => {
        const result = authManager.validateToken("");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("required");
      });

      it("should reject malformed token", () => {
        const result = authManager.validateToken("invalid-token-without-dot");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid token format");
      });

      it("should reject token with invalid signature", () => {
        const token = authManager.createToken("client-1");
        const tamperedToken = token.slice(0, -5) + "XXXXX";

        const result = authManager.validateToken(tamperedToken);

        expect(result.valid).toBe(false);
        expect(result.error).toContain("signature");
      });

      it("should reject expired token", async () => {
        // Create manager with very short expiration
        const shortLivedManager = createAuthManager({
          secretKey: "test",
          tokenExpirationMs: 1, // 1ms
        });

        const token = shortLivedManager.createToken("client-1");

        // Wait for expiration
        await new Promise((r) => setTimeout(r, 10));

        const result = shortLivedManager.validateToken(token);

        expect(result.valid).toBe(false);
        expect(result.error).toContain("expired");
      });
    });

    describe("Token Revocation", () => {
      it("should revoke token", () => {
        const token = authManager.createToken("client-1");

        // Valid before revocation
        expect(authManager.validateToken(token).valid).toBe(true);

        // Revoke
        authManager.revokeToken(token);

        // Invalid after revocation
        const result = authManager.validateToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("revoked");
      });

      it("should clear revoked tokens", () => {
        const token = authManager.createToken("client-1");
        authManager.revokeToken(token);

        // Should be invalid
        expect(authManager.validateToken(token).valid).toBe(false);

        // Clear revoked tokens
        authManager.clearRevokedTokens();

        // Should be valid again
        expect(authManager.validateToken(token).valid).toBe(true);
      });
    });

    describe("Token Refresh", () => {
      it("should refresh valid token", () => {
        const token = authManager.createToken("client-1", "desktop");

        const newToken = authManager.refreshToken(token);

        expect(newToken).toBeDefined();
        expect(newToken).not.toBe(token);

        // Old token should be revoked
        expect(authManager.validateToken(token).valid).toBe(false);

        // New token should be valid
        const result = authManager.validateToken(newToken!);
        expect(result.valid).toBe(true);
        expect(result.payload?.clientId).toBe("client-1");
        expect(result.payload?.clientType).toBe("desktop");
      });

      it("should return null for invalid token", () => {
        const result = authManager.refreshToken("invalid-token");

        expect(result).toBeNull();
      });
    });

    describe("Connection Allowance", () => {
      it("should allow localhost with bypass enabled", () => {
        const manager = createAuthManager({ localhostBypass: true });

        expect(manager.shouldAllowConnection("127.0.0.1", false)).toBe(true);
        expect(manager.shouldAllowConnection("::1", false)).toBe(true);
      });

      it("should require token for non-localhost", () => {
        const manager = createAuthManager({ localhostBypass: true });

        expect(manager.shouldAllowConnection("192.168.1.1", false)).toBe(false);
        expect(manager.shouldAllowConnection("192.168.1.1", true)).toBe(true);
      });

      it("should require token when bypass disabled", () => {
        const manager = createAuthManager({ localhostBypass: false });

        expect(manager.shouldAllowConnection("127.0.0.1", false)).toBe(false);
        expect(manager.shouldAllowConnection("127.0.0.1", true)).toBe(true);
      });
    });

    describe("Token Expiration", () => {
      it("should return expiration time remaining", () => {
        const token = authManager.createToken("client-1");

        const remaining = authManager.getTokenExpiration(token);

        expect(remaining).toBeDefined();
        expect(remaining).toBeGreaterThan(0);
        // Should be close to 24 hours (default)
        expect(remaining).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      });

      it("should return null for invalid token", () => {
        const remaining = authManager.getTokenExpiration("invalid");

        expect(remaining).toBeNull();
      });
    });
  });

  describe("RateLimiter", () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = createRateLimiter(1000, 10); // 10 requests per second
    });

    it("should allow requests within limit", () => {
      for (let i = 0; i < 10; i++) {
        const result = limiter.check("client-1");
        expect(result.allowed).toBe(true);
      }
    });

    it("should block requests over limit", () => {
      // Use up all requests
      for (let i = 0; i < 10; i++) {
        limiter.check("client-1");
      }

      // Next request should be blocked
      const result = limiter.check("client-1");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track remaining requests", () => {
      const result1 = limiter.check("client-1");
      expect(result1.remaining).toBe(9);

      const result2 = limiter.check("client-1");
      expect(result2.remaining).toBe(8);
    });

    it("should track different clients separately", () => {
      // Client 1 uses all requests
      for (let i = 0; i < 10; i++) {
        limiter.check("client-1");
      }

      // Client 2 should still have requests
      const result = limiter.check("client-2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should reset after window", async () => {
      // Create limiter with short window
      const shortLimiter = createRateLimiter(50, 5);

      // Use all requests
      for (let i = 0; i < 5; i++) {
        shortLimiter.check("client-1");
      }

      // Should be blocked
      expect(shortLimiter.check("client-1").allowed).toBe(false);

      // Wait for window reset
      await new Promise((r) => setTimeout(r, 60));

      // Should be allowed again
      expect(shortLimiter.check("client-1").allowed).toBe(true);
    });

    it("should allow manual reset", () => {
      // Use all requests
      for (let i = 0; i < 10; i++) {
        limiter.check("client-1");
      }

      // Reset
      limiter.reset("client-1");

      // Should be allowed
      const result = limiter.check("client-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should clear all limits", () => {
      limiter.check("client-1");
      limiter.check("client-2");

      limiter.clear();

      // Both should have full quota
      expect(limiter.check("client-1").remaining).toBe(9);
      expect(limiter.check("client-2").remaining).toBe(9);
    });
  });
});
