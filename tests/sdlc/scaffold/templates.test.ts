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

    // LITE tier has 2 agents, STANDARD has more
    expect(liteContent).toContain("Total Agents:** 2");
    expect(standardContent).toContain("Total Agents:** ");
    // The roster table should contain pm for STANDARD but not LITE
    expect(liteContent).toContain("| @coder |");
    expect(liteContent).not.toContain("| @pm |");
    expect(standardContent).toContain("| @pm |");
  });

  it("should include architect agent for PROFESSIONAL+", () => {
    const standardContent = generateAgentsMd(testProject);
    const enterpriseContent = generateAgentsMd(enterpriseProject);

    // Check the roster table specifically (not usage examples)
    expect(standardContent).not.toContain("| @architect |");
    expect(enterpriseContent).toContain("| @architect |");
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
    expect(architect?.minTier).toBe("PROFESSIONAL");
  });

  it("should find ceo agent", () => {
    const ceo = getAgentById("ceo");

    expect(ceo).toBeDefined();
    expect(ceo?.name).toBe("CEO Advisor");
  });
});
