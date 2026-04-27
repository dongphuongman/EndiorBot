/**
 * Security Headers + HTTP Rate Limiting Tests
 *
 * Sprint 117 B3: Verify security headers on all HTTP responses
 * and rate limiting returns 429.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGatewayServer } from "../../src/gateway/server.js";
import type { GatewayServer } from "../../src/gateway/server.js";
import http from "http";

// ============================================================================
// Helpers
// ============================================================================

function httpGet(port: number, path: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, resolve);
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("Security Headers (Sprint 117 B1)", () => {
  let server: GatewayServer;
  const port = 19817;

  beforeAll(async () => {
    server = createGatewayServer({ port, host: "127.0.0.1" });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should include X-Content-Type-Options on HTML response", async () => {
    const res = await httpGet(port, "/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should include X-Frame-Options on HTML response", async () => {
    const res = await httpGet(port, "/");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("should include Referrer-Policy header", async () => {
    const res = await httpGet(port, "/");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("should include Permissions-Policy header", async () => {
    const res = await httpGet(port, "/");
    expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("should include Content-Security-Policy header", async () => {
    const res = await httpGet(port, "/");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
  });

  it("should include security headers on API endpoints", async () => {
    const res = await httpGet(port, "/api/status");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("should include security headers on health endpoint", async () => {
    const res = await httpGet(port, "/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should include security headers on 404 responses", async () => {
    const res = await httpGet(port, "/nonexistent");
    expect(res.statusCode).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("HTTP Rate Limiting (Sprint 117 B2)", () => {
  let server: GatewayServer;
  // Sprint 147: dynamic port to avoid EADDRINUSE flake when serve is running
  const port = 19818 + Math.floor(Math.random() * 1000);

  beforeAll(async () => {
    server = createGatewayServer({ port, host: "127.0.0.1" });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should return 429 after exceeding rate limit", async () => {
    // Send 101 requests (limit is 100/min)
    const promises: Promise<http.IncomingMessage>[] = [];
    for (let i = 0; i < 101; i++) {
      promises.push(httpGet(port, "/api/status"));
    }
    const responses = await Promise.all(promises);
    const statusCodes = responses.map((r) => r.statusCode);

    // At least the last request should be 429
    expect(statusCodes).toContain(429);
  });

  it("should include Retry-After header on 429 response", async () => {
    // After previous test, rate limit should still be active
    const res = await httpGet(port, "/api/status");
    if (res.statusCode === 429) {
      expect(res.headers["retry-after"]).toBeDefined();
    }
  });

  it("should exempt /api/health from rate limiting", async () => {
    // Health endpoint should always work regardless of rate limit
    const res = await httpGet(port, "/api/health");
    expect(res.statusCode).toBe(200);
  });
});
