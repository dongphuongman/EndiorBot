/**
 * HTTP Validator Tests — Sprint 133 S2
 *
 * Block-list tests: private IPs, cloud metadata, blocked protocols
 * Allow-list tests: CPO false-positive guard (all 4 + 2 extra)
 * Redirect guard tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SSRFBlockedError, validateFetchUrl, validateRedirectTarget } from "../http-validator.js";

// ============================================================================
// Helpers
// ============================================================================

function expectBlocked(url: string): void {
  expect(() => validateFetchUrl(url)).toThrow(SSRFBlockedError);
}

function expectAllowed(url: string): void {
  expect(() => validateFetchUrl(url)).not.toThrow();
}

// ============================================================================
// Block-list tests
// ============================================================================

describe("validateFetchUrl — block list", () => {
  it("blocks loopback 127.0.0.1", () => {
    expectBlocked("http://127.0.0.1/");
  });

  it("blocks loopback 127.0.0.2 (entire /8)", () => {
    expectBlocked("http://127.0.0.2/api");
  });

  it("blocks RFC 1918 class A — 10.0.0.1", () => {
    expectBlocked("http://10.0.0.1/api");
  });

  it("blocks RFC 1918 class A — 10.255.255.255", () => {
    expectBlocked("http://10.255.255.255/");
  });

  it("blocks RFC 1918 class B — 172.16.0.1", () => {
    expectBlocked("http://172.16.0.1/");
  });

  it("blocks RFC 1918 class B — 172.31.255.255", () => {
    expectBlocked("http://172.31.255.255/");
  });

  it("blocks RFC 1918 class C — 192.168.1.1", () => {
    expectBlocked("http://192.168.1.1/");
  });

  it("blocks RFC 1918 class C — 192.168.0.1", () => {
    expectBlocked("http://192.168.0.1/");
  });

  it("blocks AWS/Azure metadata IP — 169.254.169.254", () => {
    expectBlocked("http://169.254.169.254/latest/meta-data/");
  });

  it("blocks link-local APIPA range — 169.254.1.1", () => {
    expectBlocked("http://169.254.1.1/");
  });

  it("blocks 0.0.0.0", () => {
    expectBlocked("http://0.0.0.0/");
  });

  it("blocks GCP metadata hostname", () => {
    expectBlocked("http://metadata.google.internal/computeMetadata/v1/");
  });

  it("blocks localhost hostname (no debug mode)", () => {
    delete process.env["ENDIORBOT_DEBUG"];
    expectBlocked("http://localhost/");
  });

  it("blocks localhost:3000 when ENDIORBOT_DEBUG not set", () => {
    delete process.env["ENDIORBOT_DEBUG"];
    expectBlocked("http://localhost:3000/");
  });

  it("blocks localhost:3000 when ENDIORBOT_DEBUG is empty string", () => {
    process.env["ENDIORBOT_DEBUG"] = "";
    expectBlocked("http://localhost:3000/");
    delete process.env["ENDIORBOT_DEBUG"];
  });

  it("blocks IPv6 loopback ::1", () => {
    expectBlocked("http://[::1]/");
  });

  it("blocks IPv6 ULA fc00::/7 — fc00::1", () => {
    expectBlocked("http://[fc00::1]/");
  });

  it("blocks IPv6 ULA fc00::/7 — fd00::1", () => {
    expectBlocked("http://[fd00::1]/");
  });

  it("blocks IPv6 link-local fe80::/10", () => {
    expectBlocked("http://[fe80::1]/");
  });

  it("blocks file:// protocol", () => {
    expectBlocked("file:///etc/passwd");
  });

  it("blocks ftp:// protocol", () => {
    expectBlocked("ftp://internal/");
  });

  it("blocks gopher:// protocol", () => {
    expectBlocked("gopher://evil.com/");
  });

  it("blocks *.internal hostnames", () => {
    expectBlocked("http://redis.internal/");
  });

  it("blocks *.local hostnames", () => {
    expectBlocked("http://myservice.local/api");
  });

  it("blocks *.localhost hostnames", () => {
    expectBlocked("http://app.localhost/");
  });

  it("throws SSRFBlockedError with reason field", () => {
    try {
      validateFetchUrl("http://127.0.0.1/");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SSRFBlockedError);
      const ssrf = err as SSRFBlockedError;
      expect(ssrf.reason).toBeTruthy();
      expect(ssrf.blockedUrl).toContain("127.0.0.1");
    }
  });

  it("throws on invalid URL syntax", () => {
    expect(() => validateFetchUrl("not-a-url")).toThrow(SSRFBlockedError);
  });
});

// ============================================================================
// Allow-list tests — CPO false-positive guard (NON-NEGOTIABLE)
// ============================================================================

describe("validateFetchUrl — CPO allow list (false-positive guard)", () => {
  it("allows https://api.github.com/zen", () => {
    expectAllowed("https://api.github.com/zen");
  });

  it("allows https://api.openai.com/v1/models", () => {
    expectAllowed("https://api.openai.com/v1/models");
  });

  it("allows https://generativelanguage.googleapis.com/v1/models", () => {
    expectAllowed("https://generativelanguage.googleapis.com/v1/models");
  });

  it("allows https://api.anthropic.com/v1/messages", () => {
    expectAllowed("https://api.anthropic.com/v1/messages");
  });

  it("allows https://registry.npmjs.org/ (CDN/package registry)", () => {
    expectAllowed("https://registry.npmjs.org/");
  });

  it("allows http://localhost:3000/ when ENDIORBOT_DEBUG=true", () => {
    process.env["ENDIORBOT_DEBUG"] = "true";
    try {
      expectAllowed("http://localhost:3000/");
    } finally {
      delete process.env["ENDIORBOT_DEBUG"];
    }
  });
});

// ============================================================================
// Redirect guard tests
// ============================================================================

describe("validateRedirectTarget", () => {
  it("blocks redirect to private IP", () => {
    expect(() =>
      validateRedirectTarget("https://api.example.com/", "http://192.168.1.1/secret")
    ).toThrow(SSRFBlockedError);
  });

  it("blocks redirect to metadata endpoint", () => {
    expect(() =>
      validateRedirectTarget("https://api.example.com/", "http://169.254.169.254/metadata")
    ).toThrow(SSRFBlockedError);
  });

  it("allows public-to-public redirect", () => {
    expect(() =>
      validateRedirectTarget("https://api.example.com/", "https://cdn.example.com/resource")
    ).not.toThrow();
  });

  it("allows redirect to different public domain", () => {
    expect(() =>
      validateRedirectTarget("https://api.openai.com/", "https://openai.com/docs")
    ).not.toThrow();
  });
});

// ============================================================================
// SSRFBlockedError class tests
// ============================================================================

describe("SSRFBlockedError", () => {
  it("has correct name", () => {
    const err = new SSRFBlockedError("http://10.0.0.1/", "blocked-private-ipv4");
    expect(err.name).toBe("SSRFBlockedError");
  });

  it("has reason property", () => {
    const err = new SSRFBlockedError("http://10.0.0.1/", "blocked-private-ipv4:10.0.0.0/8");
    expect(err.reason).toBe("blocked-private-ipv4:10.0.0.0/8");
  });

  it("has blockedUrl property", () => {
    const err = new SSRFBlockedError("http://10.0.0.1/api", "test");
    expect(err.blockedUrl).toBe("http://10.0.0.1/api");
  });

  it("is an instance of Error", () => {
    const err = new SSRFBlockedError("http://10.0.0.1/", "test");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("validateFetchUrl — edge cases", () => {
  it("allows https with query params (key in query — still allowed)", () => {
    expectAllowed("https://generativelanguage.googleapis.com/v1beta/models?key=secret");
  });

  it("blocks 172.16.x.x but allows 172.15.x.x (outside /12 range)", () => {
    expectBlocked("http://172.16.0.1/");
    expectAllowed("https://172.15.0.1/"); // public IP outside RFC 1918
  });

  it("blocks 172.31.255.255 (last address in /12)", () => {
    expectBlocked("http://172.31.255.255/");
  });

  it("allows 172.32.0.1 (just outside /12 range)", () => {
    expectAllowed("https://172.32.0.1/");
  });
});

// ============================================================================
// Cleanup
// ============================================================================

describe("env cleanup", () => {
  beforeEach(() => {
    delete process.env["ENDIORBOT_DEBUG"];
  });
  afterEach(() => {
    delete process.env["ENDIORBOT_DEBUG"];
  });

  it("localhost blocked when debug not set", () => {
    expectBlocked("http://localhost/");
  });
});
