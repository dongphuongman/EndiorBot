/**
 * Content Generator Tests — Sprint 80
 *
 * Validates SDLC 6.1.1 quality blocks in buildSystemPrompt()
 * and Section 8 YAML frontmatter + BDD in deterministic templates.
 *
 * @module tests/sdlc/compliance/content-generator
 * @version 1.0.0
 * @date 2026-03-05
 * @status ACTIVE - Sprint 80
 * @authority ADR-023 SDLC-Aligned Content Quality
 */

import { describe, it, expect } from "vitest";
import type { PatchResponse } from "../../../src/agents/invoke/claude-code-bridge.js";
import {
  generateContent,
  type ContentGeneratorBridge,
  type ContentGeneratorDeps,
} from "../../../src/sdlc/compliance/content-generator.js";
import type { AgentFixTask, FixAction, GeneratorConfig, ProjectSnapshot } from "../../../src/sdlc/compliance/fix-types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function makeSnapshot(): ProjectSnapshot {
  return {
    name: "TestProject",
    description: "A test project",
    tier: "STANDARD",
    projectPath: "/tmp/test-project",
    techStack: {
      language: "TypeScript",
      hasTypeScript: true,
      hasDocker: false,
      hasCI: false,
      dependencies: ["express", "vitest"],
      devDependencies: ["typescript"],
      scripts: { test: "vitest run", build: "tsc" },
    },
    codeModules: [
      { name: "api", path: "src/api", fileCount: 5, keyFiles: ["index.ts"] },
      { name: "auth", path: "src/auth", fileCount: 3, keyFiles: ["auth.ts"] },
    ],
    testFiles: [
      { path: "tests/api.test.ts", type: "unit", name: "api.test.ts" },
    ],
    existingDocs: [],
  };
}

function makeTask(stage: string, agent: "pm" | "architect" | "tester" | "devops" | "pjm" = "pm"): AgentFixTask {
  return {
    stage,
    agent,
    actions: [],
    issues: [],
    gates: [],
    promptContext: `Project: TestProject (STANDARD tier)`,
  };
}

function makeAction(stage: string, artifactType: string): FixAction {
  return {
    targetPath: `docs/${stage}/${artifactType}`,
    stage,
    artifactType,
    description: `Generate ${artifactType} for ${stage}`,
  };
}

function makeConfig(): GeneratorConfig {
  return {
    projectPath: "/tmp/test-project",
    tier: "STANDARD",
    dryRun: false,
    autoConfirm: true,
  };
}

// ============================================================================
// Mock Bridge — captures system prompt
// ============================================================================

class CapturingBridge implements ContentGeneratorBridge {
  capturedSystemPrompt = "";

  async invokePatch(
    request: { systemPrompt: string; userPrompt: string; workspace: string; agent: string },
  ): Promise<PatchResponse> {
    this.capturedSystemPrompt = request.systemPrompt;
    // Return not-applied so no file is written
    return {
      output: "",
      exitCode: 0,
      durationMs: 1,
      mode: "PATCH",
      success: true,
      affectedFiles: [],
      applied: false,
      confirmed: false,
    } as PatchResponse;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// ============================================================================
// buildSystemPrompt() — SDLC 6.1.1 Block Tests
// ============================================================================

describe("buildSystemPrompt() — SDLC 6.1.1 blocks", () => {
  it("Block 6: includes stage guiding question for 01-planning", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("WHAT are we building");
    expect(bridge.capturedSystemPrompt).toContain("01-planning");
  });

  it("Block 6: includes stage guiding question for 02-design", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("HOW will we build it");
  });

  it("Block 7: includes Section 8 YAML frontmatter for requirements.md", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("spec_id:");
    expect(bridge.capturedSystemPrompt).toContain("Section 8 Specification Standard");
    expect(bridge.capturedSystemPrompt).toContain("status: draft");
    expect(bridge.capturedSystemPrompt).toContain("tier: STANDARD");
  });

  it("Block 7: includes Section 8 YAML frontmatter for architecture.md", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("spec_id:");
    expect(bridge.capturedSystemPrompt).toContain("SPEC-02DESIGN-001");
  });

  it("Block 7: does NOT inject YAML frontmatter for non-spec artifacts", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("04-build", "pjm");
    const action = makeAction("04-build", "sprint-plan.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).not.toContain("Section 8 Specification Standard");
  });

  it("Block 8: includes BDD format for 01-planning requirements.md", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("GIVEN");
    expect(bridge.capturedSystemPrompt).toContain("WHEN");
    expect(bridge.capturedSystemPrompt).toContain("THEN");
    expect(bridge.capturedSystemPrompt).toContain("BDD Requirements Format");
  });

  it("Block 8: does NOT inject BDD for 02-design stage", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).not.toContain("BDD Requirements Format");
  });

  it("Block 9: includes cross-stage upstream refs for 02-design", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("docs/01-planning/");
    expect(bridge.capturedSystemPrompt).toContain("docs/00-foundation/");
    expect(bridge.capturedSystemPrompt).toContain("Cross-Stage Traceability");
  });

  it("Block 9: includes upstream refs for 05-test stage", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("05-test", "tester");
    const action = makeAction("05-test", "test-plan.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("docs/01-planning/");
    expect(bridge.capturedSystemPrompt).toContain("docs/04-build/");
  });

  it("Block 10: includes completeness rules", async () => {
    const bridge = new CapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedSystemPrompt).toContain("Completeness Rules");
    expect(bridge.capturedSystemPrompt).toContain("150 lines");
  });
});

// ============================================================================
// Deterministic Template Tests (bridge = null)
// ============================================================================

describe("Deterministic templates — YAML frontmatter + BDD", () => {
  function makeDeps(): ContentGeneratorDeps {
    return { bridge: null, snapshot: makeSnapshot() };
  }

  it("planning template (requirements.md) includes YAML frontmatter", async () => {
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.success).toBe(true);
    expect(result.content).toContain("---");
    expect(result.content).toContain("spec_id: SPEC-01PLANNING-001");
    expect(result.content).toContain("status: draft");
    expect(result.content).toContain("tier: STANDARD");
  });

  it("planning template (requirements.md) includes BDD acceptance criteria", async () => {
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.content).toContain("GIVEN");
    expect(result.content).toContain("WHEN");
    expect(result.content).toContain("THEN");
    expect(result.content).toContain("Acceptance Criteria");
  });

  it("planning template includes upstream References to 00-foundation", async () => {
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.content).toContain("## References");
    expect(result.content).toContain("../00-foundation/");
  });

  it("design template (architecture.md) includes YAML frontmatter", async () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.success).toBe(true);
    expect(result.content).toContain("spec_id: SPEC-02DESIGN-001");
  });

  it("design template includes upstream References to 00-foundation and 01-planning", async () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.content).toContain("../00-foundation/");
    expect(result.content).toContain("../01-planning/");
  });

  it("test template includes BDD acceptance criteria", async () => {
    const task = makeTask("05-test", "tester");
    const action = makeAction("05-test", "test-plan.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.success).toBe(true);
    expect(result.content).toContain("GIVEN");
    expect(result.content).toContain("WHEN");
    expect(result.content).toContain("THEN");
  });

  it("test template includes upstream References to 01-planning and 04-build", async () => {
    const task = makeTask("05-test", "tester");
    const action = makeAction("05-test", "test-plan.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.content).toContain("../01-planning/");
    expect(result.content).toContain("../04-build/");
  });

  it("deploy template (deploy-guide.md) includes YAML frontmatter", async () => {
    const task = makeTask("06-deploy", "devops");
    const action = makeAction("06-deploy", "deploy-guide.md");
    const result = await generateContent(task, action, makeConfig(), new Map(), makeDeps());

    expect(result.success).toBe(true);
    expect(result.content).toContain("spec_id: SPEC-06DEPLOY-001");
    expect(result.content).toContain("../05-test/");
  });
});

// ============================================================================
// Sprint 80 Supplement — Gate-Driven Prompt Tests
// ============================================================================

/**
 * Extended CapturingBridge that also captures the user prompt and counts invocations.
 */
class ExtendedCapturingBridge implements ContentGeneratorBridge {
  capturedSystemPrompt = "";
  capturedUserPrompt = "";
  invocationCount = 0;

  async invokePatch(
    request: { systemPrompt: string; userPrompt: string; workspace: string; agent: string },
  ): Promise<PatchResponse> {
    this.capturedSystemPrompt = request.systemPrompt;
    this.capturedUserPrompt = request.userPrompt;
    this.invocationCount++;
    return {
      output: "",
      exitCode: 0,
      durationMs: 1,
      mode: "PATCH",
      success: true,
      affectedFiles: [],
      applied: false,
      confirmed: false,
    } as PatchResponse;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe("buildUserPrompt() — gate-driven instructions", () => {
  it("requirements.md prompt includes Gate G0.1 context", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedUserPrompt).toContain("G0.1");
    expect(bridge.capturedUserPrompt).toContain("Scope Lock");
  });

  it("architecture.md prompt includes Gate G2 context", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedUserPrompt).toContain("G2");
    expect(bridge.capturedUserPrompt).toContain("Design Approval");
  });

  it("test-plan.md prompt includes Gate G3 context", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("05-test", "tester");
    const action = makeAction("05-test", "test-plan.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedUserPrompt).toContain("G3");
    expect(bridge.capturedUserPrompt).toContain("Build Complete");
  });

  it("gate-driven prompt includes ALL module names from snapshot", async () => {
    const bridge = new ExtendedCapturingBridge();
    const snapshot = makeSnapshot();
    snapshot.codeModules = [
      { name: "api", path: "src/api", fileCount: 5, keyFiles: ["index.ts"] },
      { name: "auth", path: "src/auth", fileCount: 3, keyFiles: ["auth.ts"] },
      { name: "security", path: "src/security", fileCount: 8, keyFiles: ["sanitizer.ts"] },
      { name: "sdlc", path: "src/sdlc", fileCount: 20, keyFiles: ["gates/"] },
      { name: "cli", path: "src/cli", fileCount: 10, keyFiles: ["index.ts"] },
      { name: "agents", path: "src/agents", fileCount: 15, keyFiles: ["orchestrator.ts"] },
    ];
    const deps: ContentGeneratorDeps = { bridge, snapshot };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    // All 6 modules should be in the prompt (not truncated to top 5)
    expect(bridge.capturedUserPrompt).toContain("src/api/");
    expect(bridge.capturedUserPrompt).toContain("src/auth/");
    expect(bridge.capturedUserPrompt).toContain("src/security/");
    expect(bridge.capturedUserPrompt).toContain("src/sdlc/");
    expect(bridge.capturedUserPrompt).toContain("src/cli/");
    expect(bridge.capturedUserPrompt).toContain("src/agents/");
  });

  it("gate-driven prompt includes dependency list", async () => {
    const bridge = new ExtendedCapturingBridge();
    const snapshot = makeSnapshot();
    snapshot.techStack.dependencies = ["express", "vitest", "zod", "commander"];
    const deps: ContentGeneratorDeps = { bridge, snapshot };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    expect(bridge.capturedUserPrompt).toContain("express");
    expect(bridge.capturedUserPrompt).toContain("vitest");
    expect(bridge.capturedUserPrompt).toContain("zod");
    expect(bridge.capturedUserPrompt).toContain("commander");
  });

  it("test-plan.md prompt includes coverage targets for tier", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("05-test", "tester");
    const action = makeAction("05-test", "test-plan.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    // STANDARD tier: unit ≥60%
    expect(bridge.capturedUserPrompt).toContain("60%");
  });

  it("non-gate artifact falls back to enriched generic prompt", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("08-collaborate", "pm");
    const action = makeAction("08-collaborate", "team-communication.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    // Should use generic prompt (no gate-specific content for this artifact)
    expect(bridge.capturedUserPrompt).toContain("Generate the file:");
    expect(bridge.capturedUserPrompt).toContain("team-communication.md");
  });
});

// ============================================================================
// Sprint 80 Supplement — Quality Validation Tests
// ============================================================================

import { validateContentQuality, extractKeyContent } from "../../../src/sdlc/compliance/content-generator.js";

describe("validateContentQuality()", () => {
  it("fails for missing YAML frontmatter on spec artifact", () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    const content = "# Architecture\n\nSome content.\n".repeat(20);

    const result = validateContentQuality(content, task, action, makeSnapshot());

    expect(result.passed).toBe(false);
    expect(result.feedback.some((f) => f.includes("Missing Section 8 YAML frontmatter"))).toBe(true);
  });

  it("fails for missing BDD on planning requirements", () => {
    const task = makeTask("01-planning", "pm");
    const action = makeAction("01-planning", "requirements.md");
    const content = "---\nspec_id: SPEC-001\n---\n# Requirements\n\nContent.\n".repeat(20);

    const result = validateContentQuality(content, task, action, makeSnapshot());

    expect(result.feedback.some((f) => f.includes("Missing BDD"))).toBe(true);
  });

  it("fails for content below minLines", () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    const content = "---\nspec_id: SPEC-001\n---\n# Architecture\n\nShort content.";

    const result = validateContentQuality(content, task, action, makeSnapshot());

    expect(result.passed).toBe(false);
    expect(result.feedback.some((f) => f.includes("lines — gate requires minimum"))).toBe(true);
  });

  it("passes for complete content meeting all requirements", () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    // Build content with YAML, references, module mentions, 120+ lines
    const lines = [
      "---", "spec_id: SPEC-02DESIGN-001", "status: draft", "---",
      "# Architecture", "",
      "## Overview", "The api module provides REST endpoints.", "",
      "## Module Structure", "The auth module handles authentication.", "",
    ];
    // Pad to 120+ lines
    for (let i = 0; i < 115; i++) {
      lines.push(`Line ${i}: Content about the api and auth modules.`);
    }
    lines.push("", "## References", "- docs/00-foundation/", "- docs/01-planning/");
    const content = lines.join("\n");

    const result = validateContentQuality(content, task, action, makeSnapshot());

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.feedback).toHaveLength(0);
  });

  it("returns specific feedback messages for each issue", () => {
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");
    const content = "# Architecture\nShort.";

    const result = validateContentQuality(content, task, action, makeSnapshot());

    // Should have multiple feedback items
    expect(result.feedback.length).toBeGreaterThanOrEqual(2);
    // Score decreases with more issues
    expect(result.score).toBeLessThan(100);
  });
});

// ============================================================================
// Sprint 80 Supplement — extractKeyContent Tests
// ============================================================================

describe("extractKeyContent()", () => {
  it("preserves YAML frontmatter", () => {
    const content = "---\nspec_id: SPEC-001\ntier: STANDARD\n---\n# Title\n\nContent.";
    const result = extractKeyContent(content, 2000);

    expect(result).toContain("spec_id: SPEC-001");
    expect(result).toContain("tier: STANDARD");
  });

  it("preserves headings and first line after heading", () => {
    const content = "## Overview\nThe system architecture.\n\nMore details here.\n\n## Modules\nList of modules.";
    const result = extractKeyContent(content, 2000);

    expect(result).toContain("## Overview");
    expect(result).toContain("The system architecture.");
    expect(result).toContain("## Modules");
    expect(result).toContain("List of modules.");
  });

  it("respects maxChars limit", () => {
    const longContent = "## " + "A".repeat(500) + "\n" + "B".repeat(500) + "\n## " + "C".repeat(500);
    const result = extractKeyContent(longContent, 200);

    expect(result.length).toBeLessThanOrEqual(220); // 200 + "...(truncated)"
  });
});

// ============================================================================
// Sprint 80 Supplement — Refinement Loop Tests
// ============================================================================

describe("Refinement loop", () => {
  it("single invocation when first draft does not write file (no quality check)", async () => {
    const bridge = new ExtendedCapturingBridge();
    const deps: ContentGeneratorDeps = { bridge, snapshot: makeSnapshot() };
    const task = makeTask("02-design", "architect");
    const action = makeAction("02-design", "architecture.md");

    await generateContent(task, action, makeConfig(), new Map(), deps);

    // Bridge returns applied=false, so no quality check is performed
    // Only 1 invocation
    expect(bridge.invocationCount).toBe(1);
  });
});
