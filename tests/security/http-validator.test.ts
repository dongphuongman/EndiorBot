/**
 * HTTP Validator / SSRF Defense Tests
 *
 * ADR-053: Validate that Kimi Coding API and Moonshot backup endpoints
 * are not blocked by the SSRF validator.
 *
 * @module tests/security/http-validator
 * @sprint 145
 */

import { describe, it, expect } from "vitest";
import { validateFetchUrl, SSRFBlockedError } from "../../src/security/http-validator.js";

describe("HTTP Validator — ADR-053 Provider Endpoints", () => {
  it("should allow api.kimi.com (Kimi Coding primary)", () => {
    expect(() => validateFetchUrl("https://api.kimi.com/coding/v1/chat/completions")).not.toThrow();
    expect(() => validateFetchUrl("https://api.kimi.com/coding/v1/healthz")).not.toThrow();
  });

  it("should allow api.moonshot.ai (Moonshot backup)", () => {
    expect(() => validateFetchUrl("https://api.moonshot.ai/v1/chat/completions")).not.toThrow();
    expect(() => validateFetchUrl("https://api.moonshot.ai/v1/models")).not.toThrow();
  });

  it("should still block private IPs", () => {
    expect(() => validateFetchUrl("http://192.168.1.1/secret")).toThrow(SSRFBlockedError);
    expect(() => validateFetchUrl("http://10.0.0.1/admin")).toThrow(SSRFBlockedError);
  });

  it("should still block localhost", () => {
    expect(() => validateFetchUrl("http://localhost:8080/")).toThrow(SSRFBlockedError);
  });

  it("should still block metadata endpoints", () => {
    expect(() => validateFetchUrl("http://169.254.169.254/latest/meta-data/")).toThrow(SSRFBlockedError);
  });

  it("should still block file protocol", () => {
    expect(() => validateFetchUrl("file:///etc/passwd")).toThrow(SSRFBlockedError);
  });
});
