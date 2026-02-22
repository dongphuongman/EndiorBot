/**
 * Skill Loader Tests
 *
 * Tests for the skill loader and registry modules.
 *
 * @module tests/skills/skill-loader
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 5 Testing
 * @authority ADR-005 Skills Architecture
 * @pillar 3 - Agent Personas
 * @stage 05 - TEST
 * @sdlc SDLC Framework 6.1.1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  SkillLoader,
  SkillRegistry,
  resetSkillLoader,
  resetSkillRegistry,
} from "../../src/skills/index.js";

const SKILLS_DIR = join(process.cwd(), "skills");

describe("SkillLoader", () => {
  let loader: SkillLoader;

  beforeEach(() => {
    resetSkillLoader();
    loader = new SkillLoader({
      skillDirs: [SKILLS_DIR],
      validateRequirements: false, // Don't check for binaries in tests
      loadDisabled: true,
    });
  });

  afterEach(() => {
    resetSkillLoader();
  });

  describe("discoverSkills", () => {
    it("discovers all skills in skills/ directory", () => {
      const skills = loader.discoverSkills();

      expect(skills).toContain("coding-agent");
      expect(skills).toContain("github");
      expect(skills).toContain("model-usage");
      expect(skills).toContain("session-logs");
      expect(skills).toContain("test-coverage");
      expect(skills.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("loadSkill", () => {
    it("loads coding-agent skill with correct metadata", () => {
      const result = loader.loadSkill("coding-agent");

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.name).toBe("coding-agent");
      expect(result.skill?.metadata.emoji).toBe("🧩");
      expect(result.skill?.metadata.category).toBe("development");
      expect(result.skill?.metadata.tags).toContain("codex");
      expect(result.skill?.prompt).toContain("PTY Mode Required");
    });

    it("loads github skill with correct metadata", () => {
      const result = loader.loadSkill("github");

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.name).toBe("github");
      expect(result.skill?.metadata.emoji).toBe("🐙");
      expect(result.skill?.metadata.category).toBe("development");
      expect(result.skill?.metadata.requires).toBeDefined();
      expect(result.skill?.metadata.requires?.length).toBeGreaterThan(0);
      expect(result.skill?.metadata.requires?.[0]?.name).toBe("gh");
    });

    it("loads test-coverage skill with correct metadata", () => {
      const result = loader.loadSkill("test-coverage");

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.name).toBe("test-coverage");
      expect(result.skill?.metadata.emoji).toBe("🧪");
      expect(result.skill?.metadata.tags).toContain("vitest");
    });

    it("returns error for non-existent skill", () => {
      const result = loader.loadSkill("non-existent-skill");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("loadAllSkills", () => {
    it("loads all skills and returns results map", () => {
      const results = loader.loadAllSkills();

      expect(results.size).toBeGreaterThanOrEqual(5);

      const codingAgent = results.get("coding-agent");
      expect(codingAgent?.success).toBe(true);
      expect(codingAgent?.skill?.name).toBe("coding-agent");

      const github = results.get("github");
      expect(github?.success).toBe(true);
      expect(github?.skill?.name).toBe("github");
    });
  });
});

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    resetSkillRegistry();
    registry = new SkillRegistry({
      loader: {
        skillDirs: [SKILLS_DIR],
        validateRequirements: false,
        loadDisabled: true,
      },
      autoEnable: true,
    });
    registry.load();
  });

  afterEach(() => {
    resetSkillRegistry();
  });

  describe("load", () => {
    it("loads all skills into registry", () => {
      const ids = registry.getSkillIds();

      expect(ids).toContain("coding-agent");
      expect(ids).toContain("github");
      expect(ids).toContain("model-usage");
      expect(ids).toContain("session-logs");
      expect(ids).toContain("test-coverage");
    });
  });

  describe("get", () => {
    it("retrieves skill by ID", () => {
      const skill = registry.get("github");

      expect(skill).toBeDefined();
      expect(skill?.name).toBe("github");
      expect(skill?.status).toBe("enabled");
    });

    it("returns undefined for non-existent skill", () => {
      const skill = registry.get("non-existent");

      expect(skill).toBeUndefined();
    });
  });

  describe("list", () => {
    it("lists all skills as SkillInfo", () => {
      const skills = registry.list();

      expect(skills.length).toBeGreaterThanOrEqual(5);
      expect(skills.some((s) => s.id === "coding-agent")).toBe(true);
      expect(skills.some((s) => s.id === "github")).toBe(true);
    });

    it("filters by category", () => {
      const devSkills = registry.list({ category: "development" });

      expect(devSkills.every((s) => s.category === "development")).toBe(true);
      expect(devSkills.some((s) => s.id === "coding-agent")).toBe(true);
      expect(devSkills.some((s) => s.id === "github")).toBe(true);
    });

    it("filters by status", () => {
      registry.disable("github");
      const enabledSkills = registry.list({ status: "enabled" });

      expect(enabledSkills.every((s) => s.status === "enabled")).toBe(true);
      expect(enabledSkills.some((s) => s.id === "github")).toBe(false);
    });

    it("searches by query", () => {
      const results = registry.list({ query: "codex" });

      expect(results.some((s) => s.id === "coding-agent")).toBe(true);
    });
  });

  describe("enable/disable", () => {
    it("enables a disabled skill", () => {
      registry.disable("github");
      expect(registry.isEnabled("github")).toBe(false);

      registry.enable("github");
      expect(registry.isEnabled("github")).toBe(true);
    });

    it("disables an enabled skill", () => {
      expect(registry.isEnabled("github")).toBe(true);

      registry.disable("github");
      expect(registry.isEnabled("github")).toBe(false);
    });
  });

  describe("getPrompt", () => {
    it("returns prompt content for skill", () => {
      const prompt = registry.getPrompt("test-coverage");

      expect(prompt).toBeDefined();
      expect(prompt).toContain("Test Coverage Skill");
      expect(prompt).toContain("Vitest");
    });
  });

  describe("getByCategory", () => {
    it("groups skills by category", () => {
      const categories = registry.getByCategory();

      expect(categories.has("development")).toBe(true);
      expect(categories.get("development")?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("getStats", () => {
    it("returns registry statistics", () => {
      const stats = registry.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(5);
      expect(stats.byStatus.enabled).toBeGreaterThanOrEqual(5);
      expect(stats.byCategory.development).toBeGreaterThanOrEqual(3);
    });
  });
});
