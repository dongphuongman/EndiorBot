/**
 * SystemBlock Tests — Sprint 126 (ADR-040)
 *
 * Covers: SystemBlock type, cacheEligible on SoulLoadResult,
 * provider handling of SystemBlock[] (Anthropic passthrough, OpenAI/Gemini flatten).
 */

import { describe, it, expect } from "vitest";
import type { SystemBlock, Message } from "../../src/providers/types.js";

// ============================================================================
// SystemBlock type
// ============================================================================

describe("SystemBlock type", () => {
  it("can create a cacheable system block", () => {
    const block: SystemBlock = {
      type: "text",
      text: "SOUL content here",
      cache_control: { type: "ephemeral" },
    };
    expect(block.type).toBe("text");
    expect(block.cache_control?.type).toBe("ephemeral");
  });

  it("can create a non-cacheable system block", () => {
    const block: SystemBlock = {
      type: "text",
      text: "Mutable context",
    };
    expect(block.type).toBe("text");
    expect(block.cache_control).toBeUndefined();
  });

  it("Message accepts SystemBlock[] as content", () => {
    const msg: Message = {
      role: "system",
      content: [
        { type: "text", text: "Cacheable SOUL", cache_control: { type: "ephemeral" } },
        { type: "text", text: "Mutable context" },
      ],
    };
    expect(Array.isArray(msg.content)).toBe(true);
    expect((msg.content as SystemBlock[]).length).toBe(2);
  });

  it("Message still accepts flat string content", () => {
    const msg: Message = { role: "system", content: "flat string" };
    expect(typeof msg.content).toBe("string");
  });
});

// ============================================================================
// cacheEligible on SoulLoadResult
// ============================================================================

describe("SoulLoadResult cacheEligible", () => {
  it("file-loaded SOUL has cacheEligible=true", async () => {
    const { createSoulLoader } = await import("../../src/bridge/intelligence/soul-loader.js");
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    const soulsDir = join(tempDir, "souls");
    mkdirSync(soulsDir, { recursive: true });
    writeFileSync(join(soulsDir, "SOUL-pm.md"), "---\nrole: pm\n---\n\n# PM SOUL\n", "utf-8");

    const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
    const result = loader.load("pm");

    expect(result.loaded).toBe(true);
    expect(result.cacheEligible).toBe(true);

    const { rmSync } = await import("node:fs");
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fallback SOUL has cacheEligible=false", async () => {
    const { createSoulLoader } = await import("../../src/bridge/intelligence/soul-loader.js");
    const { mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tempDir = mkdtempSync(join(tmpdir(), "cache-fallback-"));
    const loader = createSoulLoader({ templatesRoot: tempDir, logWarn: () => {} });
    const result = loader.load("pm");

    expect(result.fallback).toBe(true);
    expect(result.cacheEligible).toBe(false);

    const { rmSync } = await import("node:fs");
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ============================================================================
// Tool allowlist/blocklist (Sprint 126 T2)
// ============================================================================

describe("RiskClassifier toolAllowlist/toolBlocklist", () => {
  it("toolBlocklist blocks matching tool", async () => {
    const { RiskClassifier } = await import("../../src/agents/safety/risk-classifier.js");
    const classifier = new RiskClassifier({ toolBlocklist: ["Deploy"] });
    const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "Deploy" });
    expect(result.allowed).toBe(false);
    expect(result.decisionReason?.type).toBe("rule");
    expect(result.decisionReason?.detail).toContain("toolBlocklist");
  });

  it("toolAllowlist blocks tools not in list", async () => {
    const { RiskClassifier } = await import("../../src/agents/safety/risk-classifier.js");
    const classifier = new RiskClassifier({ toolAllowlist: ["Read", "Grep"] });
    const result = classifier.classify({ agent: "coder", mode: "READ", task: "Write" });
    expect(result.allowed).toBe(false);
    expect(result.decisionReason?.type).toBe("rule");
    expect(result.decisionReason?.detail).toContain("toolAllowlist");
  });

  it("toolAllowlist allows listed tools", async () => {
    const { RiskClassifier } = await import("../../src/agents/safety/risk-classifier.js");
    const classifier = new RiskClassifier({ toolAllowlist: ["Read", "Grep"] });
    const result = classifier.classify({ agent: "researcher", mode: "READ", task: "Read" });
    expect(result.allowed).toBe(true);
  });

  it("blocklist takes priority over allowlist", async () => {
    const { RiskClassifier } = await import("../../src/agents/safety/risk-classifier.js");
    const classifier = new RiskClassifier({
      toolAllowlist: ["Deploy"],
      toolBlocklist: ["Deploy"],
    });
    const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "Deploy" });
    expect(result.allowed).toBe(false);
    expect(result.decisionReason?.detail).toContain("toolBlocklist");
  });
});
