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
