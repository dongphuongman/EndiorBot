/**
 * RL Prompt Enrichment Tests — Sprint 114
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getPromptEnrichment,
  clearEnrichmentCache,
} from "../../src/rl/prompt-enrichment.js";

const testDir = join(tmpdir(), `endiorbot-enrichment-test-${Date.now()}`);

describe("getPromptEnrichment", () => {
  beforeEach(() => {
    clearEnrichmentCache();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    clearEnrichmentCache();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("returns empty patterns when directory is empty", () => {
    const result = getPromptEnrichment("assistant", testDir);
    expect(result.agentKey).toBe("assistant");
    expect(result.topPatterns).toEqual([]);
    expect(result.avoidPatterns).toEqual([]);
    expect(result.sampleCount).toBe(0);
  });

  it("returns empty patterns when directory does not exist", () => {
    const result = getPromptEnrichment("assistant", "/nonexistent/path");
    expect(result.topPatterns).toEqual([]);
    expect(result.sampleCount).toBe(0);
  });

  it("extracts good patterns from JSONL records", () => {
    const records = [
      { provider: "assistant", feedback_label: "good", response: "Here is a detailed analysis of your code structure..." },
      { provider: "assistant", feedback_label: "good", response: "Here is a detailed breakdown of the architecture..." },
      { provider: "assistant", feedback_label: "good", response: "The implementation follows best practices for..." },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("assistant", testDir);
    expect(result.sampleCount).toBe(3);
    expect(result.topPatterns.length).toBeGreaterThan(0);
    // "Here is a detailed" appears twice → should be top pattern
    expect(result.topPatterns[0]).toContain("Here is a detailed");
  });

  it("extracts bad patterns as avoidPatterns", () => {
    const records = [
      { provider: "coder", feedback_label: "bad", response: "I don't know how to do that, sorry." },
      { provider: "coder", feedback_label: "bad", response: "I don't know the answer to your question." },
      { provider: "coder", feedback_label: "good", response: "Here is the implementation:" },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("coder", testDir);
    expect(result.avoidPatterns.length).toBeGreaterThan(0);
    expect(result.avoidPatterns[0]).toContain("I don't know");
    expect(result.topPatterns.length).toBeGreaterThan(0);
  });

  it("filters by agent key (provider field)", () => {
    const records = [
      { provider: "assistant", feedback_label: "good", response: "assistant response" },
      { provider: "coder", feedback_label: "good", response: "coder response" },
      { provider: "assistant", feedback_label: "good", response: "another assistant response" },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("assistant", testDir);
    expect(result.sampleCount).toBe(2); // only assistant records
  });

  it("wildcard '*' matches all providers", () => {
    const records = [
      { provider: "assistant", feedback_label: "good", response: "response 1" },
      { provider: "coder", feedback_label: "good", response: "response 2" },
      { provider: "reviewer", feedback_label: "bad", response: "response 3" },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("*", testDir);
    expect(result.sampleCount).toBe(3);
  });

  it("caches results", () => {
    const records = [
      { provider: "assistant", feedback_label: "good", response: "cached response" },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result1 = getPromptEnrichment("assistant", testDir);
    const result2 = getPromptEnrichment("assistant", testDir);
    expect(result1.sampleCount).toBe(result2.sampleCount);
    // Same reference due to cache
    expect(result1).toBe(result2);
  });

  it("skips malformed JSONL lines", () => {
    const content = [
      JSON.stringify({ provider: "assistant", feedback_label: "good", response: "valid" }),
      "not json",
      "",
      JSON.stringify({ provider: "assistant", feedback_label: "bad", response: "also valid" }),
    ].join("\n") + "\n";

    writeFileSync(join(testDir, "rl-test.jsonl"), content);

    const result = getPromptEnrichment("assistant", testDir);
    expect(result.sampleCount).toBe(2);
  });

  it("handles partial records without response field", () => {
    const records = [
      { provider: "assistant", feedback_label: "good" }, // no response
      { provider: "assistant", feedback_label: "good", response: "has response" },
    ];

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("assistant", testDir);
    expect(result.sampleCount).toBe(2);
    expect(result.topPatterns.length).toBe(1); // only the one with response
  });

  it("limits patterns to max count", () => {
    const records: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 20; i++) {
      records.push({ provider: "assistant", feedback_label: "good", response: `Unique pattern ${i}: some content here` });
    }

    writeFileSync(join(testDir, "rl-test.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const result = getPromptEnrichment("assistant", testDir);
    expect(result.topPatterns.length).toBeLessThanOrEqual(5);
  });
});
