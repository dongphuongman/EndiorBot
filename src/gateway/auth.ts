/**
 * Gateway Authentication
 *
 * Token-based authentication with HMAC signatures.
 *
 * @module gateway/auth
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 4
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * Auth token payload.
 */
export interface TokenPayload {
  /** Client identifier */
  clientId: string;
  /** Client type (desktop, cli, test) */
  clientType: "desktop" | "cli" | "test" | "unknown";
  /** Token issue timestamp */
  issuedAt: number;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Unique nonce to ensure token uniqueness */
  nonce: string;
}

/**
 * Token validation result.
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

/**
 * Auth configuration.
 */
export interface AuthConfig {
  /** Secret key for HMAC (auto-generated if not provided) */
  secretKey?: string;
  /** Token expiration in milliseconds (default: 24 hours) */
  tokenExpirationMs?: number;
  /** Enable localhost bypass (no token required from localhost) */
  localhostBypass?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_SEPARATOR = ".";
const ALGORITHM = "sha256";

// ============================================================================
// Localhost Detection
// ============================================================================

/**
 * IPv4 and IPv6 localhost patterns.
 */
const LOCALHOST_PATTERNS = [
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
  // Docker bridge gateway - only for dev/Docker environment.
  // WARNING: This is the host network from container perspective,
  // not true localhost. Only enable for trusted Docker setups.
  "172.17.0.1",
  // Additional loopback addresses
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
];

/**
 * Check if an address is localhost.
 */
export function isLocalhostAddress(address: string): boolean {
  if (!address) return false;

  const normalizedAddress = address.toLowerCase().trim();

  for (const pattern of LOCALHOST_PATTERNS) {
    if (typeof pattern === "string") {
      if (normalizedAddress === pattern) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      if (pattern.test(normalizedAddress)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Gateway Auth Manager.
 */
export class GatewayAuthManager {
  private secretKey: string;
  private tokenExpirationMs: number;
  private localhostBypass: boolean;
  private revokedTokens: Set<string> = new Set();

  constructor(config?: AuthConfig) {
    this.secretKey = config?.secretKey ?? this.generateSecretKey();
    this.tokenExpirationMs = config?.tokenExpirationMs ?? DEFAULT_TOKEN_EXPIRATION_MS;
    this.localhostBypass = config?.localhostBypass ?? true;
  }

  /**
   * Generate a new secret key.
   */
  private generateSecretKey(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Generate HMAC signature for payload.
   */
  private sign(payload: string): string {
    return createHmac(ALGORITHM, this.secretKey).update(payload).digest("hex");
  }

  /**
   * Create a new auth token.
   */
  createToken(clientId: string, clientType: TokenPayload["clientType"] = "unknown"): string {
    const now = Date.now();
    const payload: TokenPayload = {
      clientId,
      clientType,
      issuedAt: now,
      expiresAt: now + this.tokenExpirationMs,
      nonce: randomBytes(8).toString("hex"),
    };

    const payloadStr = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadStr).toString("base64url");
    const signature = this.sign(payloadBase64);

    return `${payloadBase64}${TOKEN_SEPARATOR}${signature}`;
  }

  /**
   * Validate an auth token.
   */
  validateToken(token: string): TokenValidationResult {
    if (!token) {
      return { valid: false, error: "Token is required" };
    }

    // Check if revoked
    if (this.revokedTokens.has(token)) {
      return { valid: false, error: "Token has been revoked" };
    }

    // Split token
    const parts = token.split(TOKEN_SEPARATOR);
    if (parts.length !== 2) {
      return { valid: false, error: "Invalid token format" };
    }

    const payloadBase64 = parts[0] as string;
    const signature = parts[1] as string;

    // Verify signature (timing-safe comparison to prevent timing attacks)
    const expectedSignature = this.sign(payloadBase64);
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: "Invalid token signature" };
    }

    // Parse payload
    let payload: TokenPayload;
    try {
      const payloadStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
      payload = JSON.parse(payloadStr) as TokenPayload;
    } catch {
      return { valid: false, error: "Invalid token payload" };
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: "Token has expired" };
    }

    return { valid: true, payload };
  }

  /**
   * Revoke a token.
   */
  revokeToken(token: string): void {
    this.revokedTokens.add(token);
  }

  /**
   * Clear revoked tokens (cleanup).
   */
  clearRevokedTokens(): void {
    this.revokedTokens.clear();
  }

  /**
   * Check if client should be allowed based on address.
   */
  shouldAllowConnection(remoteAddress: string, hasToken: boolean): boolean {
    // If localhost bypass is enabled and address is localhost, allow
    if (this.localhostBypass && isLocalhostAddress(remoteAddress)) {
      return true;
    }

    // Otherwise require token
    return hasToken;
  }

  /**
   * Get token expiration time remaining (ms).
   */
  getTokenExpiration(token: string): number | null {
    const result = this.validateToken(token);
    if (!result.valid || !result.payload) {
      return null;
    }
    return Math.max(0, result.payload.expiresAt - Date.now());
  }

  /**
   * Refresh a token (create new with same client info).
   */
  refreshToken(token: string): string | null {
    const result = this.validateToken(token);
    if (!result.valid || !result.payload) {
      return null;
    }

    // Revoke old token
    this.revokeToken(token);

    // Create new token
    return this.createToken(result.payload.clientId, result.payload.clientType);
  }
}

// ============================================================================
// Rate Limiting — Re-export from shared module (Sprint 116 T7)
// ============================================================================

export { RateLimiter, createRateLimiter } from "../security/rate-limiter.js";

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an auth manager instance.
 */
export function createAuthManager(config?: AuthConfig): GatewayAuthManager {
  return new GatewayAuthManager(config);
}
