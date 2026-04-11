/**
 * Safe Fetch Tests — Sprint 133 S2
 *
 * Tests for:
 * - SSRF blocking via safeFetch
 * - Audit log writes on block
 * - Redirect interception
 * - Public URLs pass through
 */

import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SSRFBlockedError } from "../http-validator.js";
import {
  getSSRFAuditLogPath,
  safeFetch,
  writeSSRFAuditRecord,
  type SSRFAuditRecord,
} from "../safe-fetch.js";

// ============================================================================
// Test helpers
// ============================================================================

const TEST_STATE_DIR = join(tmpdir(), `endiorbot-ssrf-test-${Date.now()}`);

function setupTestStateDir(): void {
  process.env["ENDIORBOT_STATE_DIR"] = TEST_STATE_DIR;
}

function cleanupTestStateDir(): void {
  delete process.env["ENDIORBOT_STATE_DIR"];
  try {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

function readAuditLog(): SSRFAuditRecord[] {
  const logPath = getSSRFAuditLogPath();
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SSRFAuditRecord);
}

// ============================================================================
// Audit log write tests
// ============================================================================

describe("writeSSRFAuditRecord", () => {
  beforeEach(setupTestStateDir);
  afterEach(cleanupTestStateDir);

  it("creates the audit log file on first write", () => {
    const logPath = getSSRFAuditLogPath();
    expect(existsSync(logPath)).toBe(false);

    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://10.0.0.1/",
      reason: "blocked-private-ipv4:10.0.0.0/8",
    });

    expect(existsSync(logPath)).toBe(true);
  });

  it("writes valid JSONL record", () => {
    writeSSRFAuditRecord({
      timestamp: "2026-04-11T00:00:00.000Z",
      url: "http://10.0.0.1/",
      reason: "blocked-private-ipv4:10.0.0.0/8",
    });

    const records = readAuditLog();
    expect(records).toHaveLength(1);
    expect(records[0]?.reason).toBe("blocked-private-ipv4:10.0.0.0/8");
    expect(records[0]?.url).toBe("http://10.0.0.1/");
  });

  it("appends multiple records", () => {
    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://10.0.0.1/",
      reason: "blocked-private-ipv4:10.0.0.0/8",
    });
    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://127.0.0.1/",
      reason: "blocked-private-ipv4:127.0.0.0/8",
    });

    const records = readAuditLog();
    expect(records).toHaveLength(2);
  });

  it("writes optional provider field when present", () => {
    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://169.254.169.254/",
      reason: "blocked-hostname:169.254.169.254",
      provider: "openai",
    });

    const records = readAuditLog();
    expect(records[0]?.provider).toBe("openai");
  });

  it("writes optional session_id field when present", () => {
    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://10.0.0.1/",
      reason: "test",
      session_id: "sess-123",
    });

    const records = readAuditLog();
    expect(records[0]?.session_id).toBe("sess-123");
  });

  it("omits undefined optional fields (exactOptionalPropertyTypes)", () => {
    writeSSRFAuditRecord({
      timestamp: new Date().toISOString(),
      url: "http://10.0.0.1/",
      reason: "test",
    });

    const records = readAuditLog();
    const record = records[0];
    expect(record).toBeDefined();
    // provider and session_id should not be present at all (not as undefined)
    expect("provider" in (record ?? {})).toBe(false);
    expect("session_id" in (record ?? {})).toBe(false);
  });
});

// ============================================================================
// safeFetch — block tests
// ============================================================================

describe("safeFetch — SSRF blocking", () => {
  beforeEach(setupTestStateDir);
  afterEach(cleanupTestStateDir);

  it("throws SSRFBlockedError for private IP", async () => {
    await expect(safeFetch("http://10.0.0.1/")).rejects.toThrow(SSRFBlockedError);
  });

  it("throws SSRFBlockedError for loopback", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(SSRFBlockedError);
  });

  it("throws SSRFBlockedError for metadata endpoint", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SSRFBlockedError);
  });

  it("throws SSRFBlockedError for file:// protocol", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(SSRFBlockedError);
  });

  it("writes audit log entry on block", async () => {
    await expect(safeFetch("http://192.168.1.1/", undefined, { provider: "test" })).rejects.toThrow(SSRFBlockedError);

    const records = readAuditLog();
    expect(records.length).toBeGreaterThanOrEqual(1);
    const last = records[records.length - 1];
    expect(last?.url).toContain("192.168.1.1");
    expect(last?.reason).toBeTruthy();
    expect(last?.provider).toBe("test");
    expect(last?.timestamp).toBeTruthy();
  });

  it("audit log entry has no query params (URL scrubbed)", async () => {
    await expect(
      safeFetch("http://10.0.0.1/api?key=SECRET&token=ABC")
    ).rejects.toThrow(SSRFBlockedError);

    const records = readAuditLog();
    const last = records[records.length - 1];
    // scrubUrl strips query params — should not contain SECRET
    expect(last?.url).not.toContain("SECRET");
    expect(last?.url).not.toContain("ABC");
  });
});

// ============================================================================
// safeFetch — passthrough (mocked fetch)
// ============================================================================

describe("safeFetch — public URL passthrough", () => {
  beforeEach(() => {
    setupTestStateDir();
    // Mock global fetch to avoid real network calls
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupTestStateDir();
  });

  it("passes through https://api.github.com/zen", async () => {
    const response = await safeFetch("https://api.github.com/zen");
    expect(response.status).toBe(200);
  });

  it("passes through https://api.openai.com/v1/models", async () => {
    const response = await safeFetch("https://api.openai.com/v1/models");
    expect(response.status).toBe(200);
  });

  it("passes through https://api.anthropic.com/v1/messages", async () => {
    const response = await safeFetch("https://api.anthropic.com/v1/messages");
    expect(response.status).toBe(200);
  });

  it("passes through https://generativelanguage.googleapis.com/v1/models", async () => {
    const response = await safeFetch("https://generativelanguage.googleapis.com/v1/models");
    expect(response.status).toBe(200);
  });

  it("does NOT write audit log for allowed URLs", async () => {
    await safeFetch("https://api.github.com/zen");
    const records = readAuditLog();
    expect(records).toHaveLength(0);
  });
});

// ============================================================================
// safeFetch — redirect interception
// ============================================================================

describe("safeFetch — redirect guard", () => {
  beforeEach(() => {
    setupTestStateDir();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupTestStateDir();
  });

  it("blocks redirect from public to private IP (301)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: "http://192.168.1.1/secret" },
      })
    ));

    await expect(
      safeFetch("https://api.example.com/resource")
    ).rejects.toThrow(SSRFBlockedError);
  });

  it("blocks redirect to metadata endpoint (302)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      })
    ));

    await expect(
      safeFetch("https://api.example.com/resource")
    ).rejects.toThrow(SSRFBlockedError);
  });

  it("writes audit log on redirect block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: "http://10.0.0.1/secret" },
      })
    ));

    await expect(safeFetch("https://api.example.com/resource")).rejects.toThrow(SSRFBlockedError);

    const records = readAuditLog();
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it("allows public-to-public redirect (302)", async () => {
    // First call returns redirect, second call returns 200
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/resource" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    );

    const response = await safeFetch("https://api.example.com/resource");
    expect(response.status).toBe(200);
  });
});

// ============================================================================
// getSSRFAuditLogPath
// ============================================================================

describe("getSSRFAuditLogPath", () => {
  it("uses ENDIORBOT_STATE_DIR env var when set", () => {
    process.env["ENDIORBOT_STATE_DIR"] = "/custom/state";
    try {
      const path = getSSRFAuditLogPath();
      expect(path).toContain("/custom/state");
      expect(path).toContain("ssrf-blocks.log");
    } finally {
      delete process.env["ENDIORBOT_STATE_DIR"];
    }
  });

  it("falls back to ~/.endiorbot when env not set", () => {
    delete process.env["ENDIORBOT_STATE_DIR"];
    const path = getSSRFAuditLogPath();
    expect(path).toContain(".endiorbot");
    expect(path).toContain("ssrf-blocks.log");
  });
});
