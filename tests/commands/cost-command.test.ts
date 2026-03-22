/**
 * /cost Command Tests — Sprint 114
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// vi.hoisted runs before module-level code, ensuring testDir is available for mock
const { testDir, rlDir } = vi.hoisted(() => {
  const _tmpdir = typeof globalThis.process !== "undefined" ? globalThis.process.env.TMPDIR || "/tmp" : "/tmp";
  const _testDir = `${_tmpdir}/endiorbot-cost-test-${Date.now()}`;
  return {
    testDir: _testDir,
    rlDir: `${_testDir}/.endiorbot/rl-training-data`,
  };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    homedir: () => testDir,
  };
});

import { handleCostCommand } from "../../src/commands/handlers.js";

describe("handleCostCommand", () => {
  beforeEach(() => {
    mkdirSync(rlDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("returns 'no data' when rl directory is empty", () => {
    const result = handleCostCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("No usage data");
  });

  it("aggregates token usage from JSONL records", () => {
    const now = Date.now();
    const records = [
      { timestamp: now - 1000, provider: "claude-code", token_usage: { input: 100, output: 50, total: 150 }, feedback_label: "good", reward: 1 },
      { timestamp: now - 2000, provider: "ai-platform", token_usage: { input: 200, output: 100, total: 300 }, feedback_label: "good", reward: 1 },
      { timestamp: now - 3000, provider: "claude-code", token_usage: { input: 150, output: 75, total: 225 }, feedback_label: "bad", reward: -1 },
    ];

    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(rlDir, `rl-${date}.jsonl`), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = handleCostCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Token Usage");
    expect(result.response).toContain("Input:");
    expect(result.response).toContain("Output:");
    expect(result.response).toContain("Estimated Cost");
    expect(result.response).toContain("Records: 3");
  });

  it("filters by period when --period flag provided", () => {
    const now = Date.now();
    const records = [
      { timestamp: now - 1000, provider: "claude-code", token_usage: { input: 100, output: 50, total: 150 } },
      { timestamp: now - 25 * 60 * 60 * 1000, provider: "claude-code", token_usage: { input: 200, output: 100, total: 300 } }, // >24h ago
    ];

    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(rlDir, `rl-${date}.jsonl`), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = handleCostCommand(["--period", "24h"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Records: 1");
  });

  it("handles records without token_usage gracefully", () => {
    const now = Date.now();
    const records = [
      { timestamp: now - 1000, provider: "claude-code", feedback_label: "good" },
      { timestamp: now - 2000, provider: "ai-platform", token_usage: { input: 100, output: 50, total: 150 } },
    ];

    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(rlDir, `rl-${date}.jsonl`), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = handleCostCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Records: 2");
  });

  it("skips malformed JSONL lines", () => {
    const now = Date.now();
    const content = [
      JSON.stringify({ timestamp: now - 1000, provider: "claude-code", token_usage: { input: 100, output: 50, total: 150 } }),
      "this is not valid json",
      "",
      JSON.stringify({ timestamp: now - 2000, provider: "claude-code", token_usage: { input: 50, output: 25, total: 75 } }),
    ].join("\n") + "\n";

    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(rlDir, `rl-${date}.jsonl`), content);

    const result = handleCostCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Records: 2");
  });
});
