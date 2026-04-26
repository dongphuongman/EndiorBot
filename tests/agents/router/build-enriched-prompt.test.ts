/**
 * Tests for buildEnrichedPrompt() — Sprint 142 vendor-agnostic enrichment.
 *
 * Verifies:
 *   1. Workspace context injected for READ tasks (CEO bug fix)
 *   2. Workspace context injected for PATCH tasks
 *   3. Kill switch ENDIORBOT_DISABLE_WORKSPACE_CONTEXT works
 *   4. SOUL content present
 *   5. RL enrichment included when available
 *   6. History formatted and included
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildEnrichedPrompt } from "../../../src/agents/router/providers.js";

// Mock dependencies
vi.mock("../../../src/agents/intelligence/patch-intent-classifier.js", () => ({
  classifyPatchIntent: vi.fn((task: string) => {
    if (task.toLowerCase().includes("fix") || task.toLowerCase().includes("patch")) {
      return { intent: "PATCH", confidence: 0.9, reason: "explicit fix" };
    }
    return { intent: "READ", confidence: 0.1, reason: "advisory" };
  }),
}));

vi.mock("../../../src/agents/intelligence/workspace-context.js", () => ({
  getWorkspaceContext: vi.fn(() => ({
    branch: "main",
    recentCommits: ["feat: add login", "fix: auth bug"],
    diffStats: { filesChanged: 2, insertions: 10, deletions: 5 },
  })),
  formatWorkspaceContext: vi.fn(() => "[Workspace] Branch: main / Recent: feat: add login | fix: auth bug / Uncommitted: 2 files (+10/-5)"),
}));

vi.mock("../../../src/rl/prompt-enrichment.js", () => ({
  getPromptEnrichment: vi.fn(() => ({ patterns: ["concise answers"], sampleCount: 10 })),
  formatEnrichmentForPrompt: vi.fn(() => "[RL Feedback] Preferred: concise answers"),
}));

vi.mock("../../../src/agents/router/agent-constants.js", () => ({
  getAgentSoul: vi.fn((agent: string) => `[SOUL: @${agent}]`),
  formatHistoryContext: vi.fn((history: Array<{ role: string; content: string }>) =>
    history.length > 0 ? `\n[History: ${history.length} turns]` : ""),
  resolveWorkspaceTier: vi.fn(() => "STANDARD"),
  getAgentModel: vi.fn(() => "sonnet"),
  getAgentProviderModel: vi.fn(),
  TIER_FALLBACK_CHAIN: { 1: ["claude-code", "kimi", "ollama"], 2: ["kimi", "claude-code", "ollama"], 3: ["ollama", "kimi", "claude-code"] },
}));

vi.mock("../../../src/bridge/security/bridge-audit.js", () => ({
  getBridgeAuditLogger: vi.fn(() => ({ log: vi.fn() })),
}));

vi.mock("../../../src/agents/router/patch-flow.js", () => ({
  requestPatchConfirmation: vi.fn(),
  executePatch: vi.fn(),
}));

vi.mock("../../../src/providers/provider-registry.js", () => ({
  getProviderRegistry: vi.fn(() => ({ get: vi.fn(), has: vi.fn(), list: vi.fn(() => []) })),
}));

vi.mock("../../../src/providers/claude-code/rate-limit-detector.js", () => ({
  classifyClaudeCodeFailure: vi.fn(),
}));

const config = { projectRoot: "/test/project" };

describe("buildEnrichedPrompt — Sprint 142 vendor-agnostic enrichment", () => {
  const originalEnv = process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT;
    } else {
      process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT = originalEnv;
    }
  });

  it("CEO bug fix: READ task gets workspace context", () => {
    const result = buildEnrichedPrompt("pm", "check sprint 1 readiness", config);

    expect(result.systemPrompt).toContain("[Workspace]");
    expect(result.systemPrompt).toContain("Branch: main");
    expect(result.intent.intent).toBe("READ");
  });

  it("PATCH task also gets workspace context", () => {
    const result = buildEnrichedPrompt("coder", "fix the login bug", config);

    expect(result.systemPrompt).toContain("[Workspace]");
    expect(result.systemPrompt).toContain("Branch: main");
    expect(result.intent.intent).toBe("PATCH");
  });

  it("kill switch ENDIORBOT_DISABLE_WORKSPACE_CONTEXT suppresses workspace", () => {
    process.env.ENDIORBOT_DISABLE_WORKSPACE_CONTEXT = "true";

    const result = buildEnrichedPrompt("pm", "check sprint status", config);

    expect(result.systemPrompt).not.toContain("[Workspace]");
  });

  it("includes SOUL content for agent", () => {
    const result = buildEnrichedPrompt("architect", "review design", config);

    expect(result.systemPrompt).toContain("[SOUL: @architect]");
  });

  it("includes RL enrichment when available", () => {
    const result = buildEnrichedPrompt("coder", "write unit tests", config);

    expect(result.systemPrompt).toContain("[RL Feedback]");
    expect(result.systemPrompt).toContain("concise answers");
  });

  it("includes formatted history when provided", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const result = buildEnrichedPrompt("pm", "continue", config, history);

    expect(result.systemPrompt).toContain("[History: 2 turns]");
  });

  it("resolves workspace from config when not provided", () => {
    const result = buildEnrichedPrompt("pm", "status", config);

    expect(result.workspace).toBe("/test/project");
  });

  it("uses explicit workspace when provided", () => {
    const result = buildEnrichedPrompt("pm", "status", config, [], "/custom/path");

    expect(result.workspace).toBe("/custom/path");
  });
});
