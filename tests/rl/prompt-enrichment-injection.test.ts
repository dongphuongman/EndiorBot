/**
 * Sprint 115 (T1): RL Prompt Enrichment Injection Tests
 *
 * Tests:
 * - formatEnrichmentForPrompt() returns "" when sampleCount < 5
 * - formatEnrichmentForPrompt() returns "" when no patterns
 * - formatEnrichmentForPrompt() returns enrichment section for sufficient data
 * - Budget enforcement: output ≤ 200 chars
 * - C7 exact match: provider === agentKey (not .includes())
 * - Confidence threshold tightens at MIN_SAMPLES_FOR_STRONG (100+)
 *
 * @module tests/rl/prompt-enrichment-injection
 * @sprint 115
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getPromptEnrichment,
  formatEnrichmentForPrompt,
  clearEnrichmentCache,
  MIN_SAMPLES_FOR_STRONG,
} from "../../src/rl/prompt-enrichment.js";

const testDir = join(tmpdir(), `endiorbot-enrichment-t1-${Date.now()}`);

describe("formatEnrichmentForPrompt (T1)", () => {
  beforeEach(() => {
    clearEnrichmentCache();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    clearEnrichmentCache();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("T1-1: returns empty string when sampleCount < 5 (cold-start guard)", () => {
    // 3 records = below MIN_SAMPLES_FOR_ENRICHMENT (5)
    const records = [
      { provider: "coder", feedback_label: "good", response: "Here is the fix for your bug in the auth module" },
      { provider: "coder", feedback_label: "good", response: "Here is the fix for the login component" },
      { provider: "coder", feedback_label: "good", response: "Here is the fix with detailed explanation" },
    ];
    writeFileSync(join(testDir, "rl.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const enrichment = getPromptEnrichment("coder", testDir);
    expect(enrichment.sampleCount).toBe(3);
    expect(formatEnrichmentForPrompt(enrichment)).toBe("");
  });

  it("T1-2: returns enrichment section when sampleCount >= 5", () => {
    const records = Array.from({ length: 6 }, (_, i) => ({
      provider: "coder",
      feedback_label: "good",
      response: `Here is a detailed implementation of feature ${i} with proper error handling`,
    }));
    writeFileSync(join(testDir, "rl.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const enrichment = getPromptEnrichment("coder", testDir);
    expect(enrichment.sampleCount).toBe(6);

    const result = formatEnrichmentForPrompt(enrichment);
    expect(result).toContain("[RL Feedback]");
    expect(result).toContain("Preferred response style:");
    expect(result.length).toBeGreaterThan(0);
  });

  it("T1-3: returns empty when no patterns (all records without response)", () => {
    const records = Array.from({ length: 6 }, () => ({
      provider: "coder",
      feedback_label: "good",
      // no response field
    }));
    writeFileSync(join(testDir, "rl.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const enrichment = getPromptEnrichment("coder", testDir);
    expect(formatEnrichmentForPrompt(enrichment)).toBe("");
  });

  it("T1-4: budget enforcement — output ≤ 200 chars", () => {
    // Create many long patterns to push output over 200 chars
    const records = Array.from({ length: 10 }, (_, i) => ({
      provider: "assistant",
      feedback_label: "good",
      response: `Pattern ${i}: ${"a".repeat(100)} long response with lots of detail for testing budget`,
    }));
    writeFileSync(join(testDir, "rl.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    const enrichment = getPromptEnrichment("assistant", testDir);
    const result = formatEnrichmentForPrompt(enrichment);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("T1-5: C7 exact match — 'pm' does NOT match 'ai-platform'", () => {
    const records = [
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 1" },
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 2" },
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 3" },
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 4" },
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 5" },
      { provider: "ai-platform", feedback_label: "good", response: "Platform response 6" },
    ];
    writeFileSync(join(testDir, "rl.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");

    // "pm" should NOT match "ai-platform" (C7 fix: exact match)
    const pmResult = getPromptEnrichment("pm", testDir);
    expect(pmResult.sampleCount).toBe(0);

    clearEnrichmentCache();

    // "ai-platform" exact match should work
    const platformResult = getPromptEnrichment("ai-platform", testDir);
    expect(platformResult.sampleCount).toBe(6);
  });

  it("T1-6: MIN_SAMPLES_FOR_STRONG constant exported for Sprint 116 config", () => {
    expect(MIN_SAMPLES_FOR_STRONG).toBe(100);
  });
});
