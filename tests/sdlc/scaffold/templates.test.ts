/**
 * Template Generator Tests
 *
 * Unit tests for SDLC template generation (CLAUDE.md, AGENTS.md, etc.).
 *
 * @module tests/sdlc/scaffold/templates
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect } from "vitest";
import {
  generateSdlcConfig,
  serializeSdlcConfig,
  generateMinimalConfig,
  generateClaudeMd,
  generateIdentityMd,
  generateAgentsMd,
  getAllAgents,
  getAgentById,
} from "../../../src/sdlc/scaffold/templates/index.js";
import type { ProjectConfig } from "../../../src/sdlc/scaffold/types.js";
import type { ProjectSnapshot } from "../../../src/sdlc/compliance/fix-types.js";

// ============================================================================
// Test Data
// ============================================================================

const testProject: ProjectConfig = {
  id: "test-project",
  name: "Test Project",
  description: "A test project for unit testing",
  tier: "STANDARD",
  frameworkVersion: "6.1.1",
};

const liteProject: ProjectConfig = {
  id: "lite-project",
  name: "Lite Project",
  description: "A lite tier project",
  tier: "LITE",
  frameworkVersion: "6.1.1",
};

const enterpriseProject: ProjectConfig = {
  id: "enterprise-project",
  name: "Enterprise Project",
  description: "An enterprise tier project",
  tier: "ENTERPRISE",
  frameworkVersion: "6.1.1",
};

// ============================================================================
// generateSdlcConfig Tests
// ============================================================================

describe("generateSdlcConfig", () => {
  it("should generate config with correct generator", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.generator).toBe("endiorbot");
  });

  it("should include schema version", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.schema_version).toBeDefined();
  });

  it("should include project tier", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.tier).toBe("STANDARD");
  });

  it("should include project metadata", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.project.id).toBe("test-project");
    expect(config.project.name).toBe("Test Project");
    expect(config.project.description).toBe("A test project for unit testing");
  });

  it("should include framework version", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.framework_version).toBe("6.1.1");
  });

  it("should include generated_at timestamp", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.generated_at).toBeDefined();
  });
});

// ============================================================================
// serializeSdlcConfig Tests
// ============================================================================

describe("serializeSdlcConfig", () => {
  it("should return valid JSON", () => {
    const config = generateSdlcConfig(testProject);
    const json = serializeSdlcConfig(config);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should pretty-print with indentation", () => {
    const config = generateSdlcConfig(testProject);
    const json = serializeSdlcConfig(config);

    expect(json).toContain("\n");
    expect(json).toContain("  "); // Indentation
  });
});

// ============================================================================
// generateMinimalConfig Tests
// ============================================================================

describe("generateMinimalConfig", () => {
  it("should generate minimal config for migration", () => {
    const config = generateMinimalConfig(
      { id: "migrated", name: "Migrated Project" },
      "LITE",
      "tinysdlc",
      { original: true }
    );
    expect(config.generator).toBe("endiorbot");
    expect(config.tier).toBe("LITE");
    expect(config.migrated_from).toBe("tinysdlc");
  });
});

// ============================================================================
// generateClaudeMd Tests
// ============================================================================

describe("generateClaudeMd", () => {
  it("should include project name", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("Test Project");
  });

  it("should include CLAUDE.md header", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("# CLAUDE.md");
  });

  it("should include 4 Non-Negotiable Invariants", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("Non-Negotiable Invariants");
    expect(content).toContain("THIN CLIENT PATTERN");
    expect(content).toContain("STDIN JSON FOR HOOKS");
  });

  it("should include thin client pattern", () => {
    const content = generateClaudeMd(testProject);
    // Content mentions "THIN CLIENT PATTERN" and "Thin client pattern"
    expect(content.toLowerCase()).toContain("thin client");
  });

  it("should include framework version", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("6.1.1");
  });

  it("should include SDLC integration section", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("SDLC");
  });
});

// ============================================================================
// generateIdentityMd Tests
// ============================================================================

describe("generateIdentityMd", () => {
  it("should include project name", () => {
    const content = generateIdentityMd(testProject);
    expect(content).toContain("Test Project");
  });

  it("should include Project Identity header", () => {
    const content = generateIdentityMd(testProject);
    expect(content).toContain("Project Identity");
  });

  it("should include project description", () => {
    const content = generateIdentityMd(testProject);
    expect(content).toContain("A test project for unit testing");
  });

  it("should include tier information", () => {
    const content = generateIdentityMd(testProject);
    expect(content).toContain("STANDARD");
  });

  it("should include framework version", () => {
    const content = generateIdentityMd(testProject);
    expect(content).toContain("6.1.1");
  });
});

// ============================================================================
// generateAgentsMd Tests
// ============================================================================

describe("generateAgentsMd", () => {
  it("should include project name", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("Test Project");
  });

  it("should include AGENTS.md header", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("AGENTS.md");
  });

  it("should include agent roster table", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("Agent Roster");
    expect(content).toContain("| ID |");
    expect(content).toContain("| Name |");
  });

  it("should include tier in content", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("STANDARD");
  });

  it("should include coder agent for all tiers", () => {
    const liteContent = generateAgentsMd(liteProject);
    const standardContent = generateAgentsMd(testProject);

    expect(liteContent).toContain("@coder");
    expect(standardContent).toContain("@coder");
  });

  it("should include pm agent for STANDARD+", () => {
    const liteContent = generateAgentsMd(liteProject);
    const standardContent = generateAgentsMd(testProject);

    // LITE tier has 3 agents (SASE 6.1.2), STANDARD has more
    expect(liteContent).toContain("Total Agents:** 3");
    expect(standardContent).toContain("Total Agents:** ");
    // The roster table should contain pm for STANDARD but not LITE
    expect(liteContent).toContain("| @coder |");
    expect(liteContent).not.toContain("| @pm |");
    expect(standardContent).toContain("| @pm |");
  });

  it("should include architect agent for STANDARD+ (SASE 6.1.2)", () => {
    const liteContent = generateAgentsMd(liteProject);
    const standardContent = generateAgentsMd(testProject);

    // SASE 6.1.2: architect is STANDARD tier (was PROFESSIONAL)
    expect(liteContent).not.toContain("| @architect |");
    expect(standardContent).toContain("| @architect |");
  });

  it("should include SASE section", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("SASE");
    expect(content).toContain("CRP");
    expect(content).toContain("MRP");
  });

  it("should include usage examples", () => {
    const content = generateAgentsMd(testProject);
    expect(content).toContain("Usage");
    expect(content).toContain("endiorbot");
  });
});

// ============================================================================
// getAllAgents Tests
// ============================================================================

describe("getAllAgents", () => {
  it("should return array of agents", () => {
    const agents = getAllAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  it("should include required properties for each agent", () => {
    const agents = getAllAgents();

    for (const agent of agents) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.model).toBeDefined();
      expect(agent.minTier).toBeDefined();
      expect(agent.capabilities).toBeDefined();
    }
  });

  it("should include coder agent", () => {
    const agents = getAllAgents();
    const coder = agents.find((a) => a.id === "coder");

    expect(coder).toBeDefined();
    expect(coder?.name).toBe("Coder");
  });

  it("should include assistant agent", () => {
    const agents = getAllAgents();
    const assistant = agents.find((a) => a.id === "assistant");

    expect(assistant).toBeDefined();
    expect(assistant?.minTier).toBe("LITE");
  });

  it("should return a copy, not the original array", () => {
    const agents1 = getAllAgents();
    const agents2 = getAllAgents();

    expect(agents1).not.toBe(agents2);
  });
});

// ============================================================================
// getAgentById Tests
// ============================================================================

describe("getAgentById", () => {
  it("should return agent by ID", () => {
    const coder = getAgentById("coder");

    expect(coder).toBeDefined();
    expect(coder?.id).toBe("coder");
    expect(coder?.name).toBe("Coder");
  });

  it("should return undefined for unknown ID", () => {
    const unknown = getAgentById("nonexistent");
    expect(unknown).toBeUndefined();
  });

  it("should find architect agent", () => {
    const architect = getAgentById("architect");

    expect(architect).toBeDefined();
    expect(architect?.model).toBe("opus");
    expect(architect?.minTier).toBe("STANDARD");
  });

  it("should find ceo agent", () => {
    const ceo = getAgentById("ceo");

    expect(ceo).toBeDefined();
    expect(ceo?.name).toBe("CEO Advisor");
  });
});

// ============================================================================
// Snapshot-aware template tests (Sprint 79)
// ============================================================================

/** Mock snapshot mimicking open-pencil: TypeScript + Vue/Vite + Bun + Tauri 2 */
const mockSnapshot: ProjectSnapshot = {
  name: "open-pencil",
  description: "A collaborative design tool",
  tier: "STANDARD",
  techStack: {
    language: "TypeScript",
    framework: "Vue/Vite",
    packageManager: "bun",
    desktop: "Tauri 2",
    hasTypeScript: true,
    hasDocker: false,
    hasCI: false,
    dependencies: ["vue", "vite", "@tauri-apps/api"],
    devDependencies: ["vitest", "playwright"],
    scripts: {
      dev: "vite",
      build: "vite build",
      test: "vitest run",
      lint: "eslint .",
    },
  },
  codeModules: [],
  testFiles: [
    { path: "tests/e2e/app.spec.ts", name: "app.spec.ts", type: "e2e" },
    { path: "tests/unit/store.test.ts", name: "store.test.ts", type: "unit" },
  ],
  existingDocs: [],
  projectPath: "/tmp/open-pencil",
};

describe("generateIdentityMd with snapshot", () => {
  it("includes Tech Stack section when snapshot provided", () => {
    const content = generateIdentityMd(testProject, mockSnapshot);
    expect(content).toContain("## Tech Stack");
  });

  it("includes detected language", () => {
    const content = generateIdentityMd(testProject, mockSnapshot);
    expect(content).toContain("TypeScript");
  });

  it("includes detected framework", () => {
    const content = generateIdentityMd(testProject, mockSnapshot);
    expect(content).toContain("Vue/Vite");
  });

  it("includes detected package manager", () => {
    const content = generateIdentityMd(testProject, mockSnapshot);
    expect(content).toContain("bun");
  });

  it("includes desktop runtime", () => {
    const content = generateIdentityMd(testProject, mockSnapshot);
    expect(content).toContain("Tauri 2");
  });

  it("omits Tech Stack section when no snapshot", () => {
    const content = generateIdentityMd(testProject);
    expect(content).not.toContain("## Tech Stack");
  });
});

describe("generateClaudeMd with snapshot", () => {
  it("uses detected package manager in install command", () => {
    const content = generateClaudeMd(testProject, mockSnapshot);
    expect(content).toContain("bun install");
  });

  it("includes bun run dev from scripts", () => {
    const content = generateClaudeMd(testProject, mockSnapshot);
    expect(content).toContain("bun run dev");
  });

  it("includes bun run test from scripts", () => {
    const content = generateClaudeMd(testProject, mockSnapshot);
    expect(content).toContain("bun run test");
  });

  it("does NOT include pnpm install when snapshot provided", () => {
    const content = generateClaudeMd(testProject, mockSnapshot);
    expect(content).not.toContain("pnpm install");
  });

  it("falls back to pnpm commands when no snapshot", () => {
    const content = generateClaudeMd(testProject);
    expect(content).toContain("pnpm install");
  });
});

describe("generateSdlcConfig with snapshot", () => {
  it("includes techStack when snapshot provided", () => {
    const config = generateSdlcConfig(testProject, mockSnapshot);
    expect(config.techStack).toBeDefined();
    expect(config.techStack?.language).toBe("TypeScript");
    expect(config.techStack?.framework).toBe("Vue/Vite");
  });

  it("includes analyzedAt when snapshot provided", () => {
    const config = generateSdlcConfig(testProject, mockSnapshot);
    expect(config.analyzedAt).toBeDefined();
    expect(typeof config.analyzedAt).toBe("string");
  });

  it("omits techStack when no snapshot", () => {
    const config = generateSdlcConfig(testProject);
    expect(config.techStack).toBeUndefined();
    expect(config.analyzedAt).toBeUndefined();
  });
});
