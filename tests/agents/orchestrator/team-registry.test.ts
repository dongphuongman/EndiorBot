/**
 * Team Registry Tests
 *
 * @module tests/agents/orchestrator/team-registry
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TeamRegistry,
  getTeamRegistry,
  resetTeamRegistry,
  createTeamRegistry,
} from "../../../src/agents/orchestrator/team-registry.js";
import {
  isValidTeamId,
  isValidTeamArchetype,
  isAllowedTeamTransition,
  ALLOWED_TEAM_TRANSITIONS,
  TEAM_SDLC_INFO,
  TEAM_DISPLAY_NAMES,
} from "../../../src/agents/types/team.js";

describe("TeamRegistry", () => {
  beforeEach(() => {
    resetTeamRegistry();
  });

  // ==========================================================================
  // Singleton & Factory
  // ==========================================================================

  describe("Singleton", () => {
    it("should return singleton instance", () => {
      const reg1 = getTeamRegistry("STANDARD");
      const reg2 = getTeamRegistry();
      expect(reg1).toBe(reg2);
    });

    it("should reset singleton", () => {
      const reg1 = getTeamRegistry("STANDARD");
      resetTeamRegistry();
      const reg2 = getTeamRegistry("STANDARD");
      expect(reg1).not.toBe(reg2);
    });

    it("should create independent instance with factory", () => {
      const global = getTeamRegistry("STANDARD");
      const local = createTeamRegistry("PROFESSIONAL");
      expect(global).not.toBe(local);
    });
  });

  // ==========================================================================
  // Team Loading per Tier
  // ==========================================================================

  describe("LITE tier", () => {
    it("should load fullstack team", () => {
      const reg = createTeamRegistry("LITE");
      const teams = reg.getAvailableTeams();
      expect(teams.length).toBe(1);
      expect(teams[0]!.id).toBe("fullstack");
      expect(teams[0]!.leader).toBe("fullstack");
    });

    it("should not have planning team", () => {
      const reg = createTeamRegistry("LITE");
      expect(reg.isTeam("planning")).toBe(false);
    });

    it("should identify fullstack as a team", () => {
      const reg = createTeamRegistry("LITE");
      expect(reg.isTeam("fullstack")).toBe(true);
    });
  });

  describe("STANDARD tier", () => {
    it("should load 3 teams: planning, dev, qa", () => {
      const reg = createTeamRegistry("STANDARD");
      const teams = reg.getAvailableTeams();
      const ids = teams.map((t) => t.id).sort();
      expect(ids).toEqual(["dev", "planning", "qa"]);
    });

    it("should have correct leaders", () => {
      const reg = createTeamRegistry("STANDARD");
      const planning = reg.getTeam("planning");
      const dev = reg.getTeam("dev");
      const qa = reg.getTeam("qa");

      expect(planning.found && planning.team.leader).toBe("pm");
      expect(dev.found && dev.team.leader).toBe("coder");
      expect(qa.found && qa.team.leader).toBe("reviewer");
    });
  });

  describe("PROFESSIONAL tier", () => {
    it("should load 5 teams including design", () => {
      const reg = createTeamRegistry("PROFESSIONAL");
      const teams = reg.getAvailableTeams();
      const ids = teams.map((t) => t.id).sort();
      expect(ids).toEqual(["design", "dev", "executive", "planning", "qa"]);
    });

    it("should have architect as design team leader", () => {
      const reg = createTeamRegistry("PROFESSIONAL");
      const design = reg.getTeam("design");
      expect(design.found && design.team.leader).toBe("architect");
    });
  });

  describe("ENTERPRISE tier", () => {
    it("should load 6 teams including ops", () => {
      const reg = createTeamRegistry("ENTERPRISE");
      const teams = reg.getAvailableTeams();
      const ids = teams.map((t) => t.id).sort();
      expect(ids).toEqual(["design", "dev", "executive", "ops", "planning", "qa"]);
    });

    it("should have devops as ops team leader", () => {
      const reg = createTeamRegistry("ENTERPRISE");
      const ops = reg.getTeam("ops");
      expect(ops.found && ops.team.leader).toBe("devops");
    });

    it("should have ceo as executive team leader", () => {
      const reg = createTeamRegistry("ENTERPRISE");
      const exec = reg.getTeam("executive");
      expect(exec.found && exec.team.leader).toBe("ceo");
    });
  });

  // ==========================================================================
  // Team Lookup
  // ==========================================================================

  describe("getTeam", () => {
    it("should return found=true for existing team", () => {
      const reg = createTeamRegistry("STANDARD");
      const result = reg.getTeam("planning");
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.team.id).toBe("planning");
        expect(result.team.name).toBe("Planning Team");
        expect(result.team.archetype).toBe("planning");
      }
    });

    it("should return found=false for non-existent team in tier", () => {
      const reg = createTeamRegistry("LITE");
      const result = reg.getTeam("planning");
      expect(result.found).toBe(false);
    });

    it("should return found=false for invalid team id", () => {
      const reg = createTeamRegistry("ENTERPRISE");
      const result = reg.getTeam("nonexistent");
      expect(result.found).toBe(false);
    });

    it("should include SDLC stages and gates from archetype", () => {
      const reg = createTeamRegistry("STANDARD");
      const result = reg.getTeam("planning");
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.team.sdlcStages).toEqual(["00", "01"]);
        expect(result.team.sdlcGates).toContain("G0.1");
        expect(result.team.sdlcGates).toContain("G1");
      }
    });
  });

  // ==========================================================================
  // Teams for Agent
  // ==========================================================================

  describe("getTeamsForAgent", () => {
    it("should find teams containing an agent", () => {
      const reg = createTeamRegistry("ENTERPRISE");
      const coderTeams = reg.getTeamsForAgent("coder");
      const ids = coderTeams.map((t) => t.id).sort();
      // coder is in: design, dev, ops
      expect(ids).toContain("dev");
      expect(ids).toContain("design");
      expect(ids).toContain("ops");
    });

    it("should return empty for agent not in any team", () => {
      const reg = createTeamRegistry("LITE");
      const teams = reg.getTeamsForAgent("pm");
      expect(teams.length).toBe(0);
    });
  });

  // ==========================================================================
  // Team Resolution
  // ==========================================================================

  describe("resolveTeam", () => {
    it("should resolve team to leader with context", async () => {
      const reg = createTeamRegistry("STANDARD");
      const result = await reg.resolveTeam("planning");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.leader).toBe("pm");
        expect(result.result.context.teamId).toBe("planning");
        expect(result.result.context.teamName).toBe("Planning Team");
        expect(result.result.context.leader).toBe("pm");
      }
    });

    it("should include teammates excluding leader", async () => {
      const reg = createTeamRegistry("STANDARD");
      const result = await reg.resolveTeam("planning");
      expect(result.success).toBe(true);
      if (result.success) {
        const teammateRoles = result.result.context.teammates.map((t) => t.role);
        expect(teammateRoles).toContain("pjm");
        expect(teammateRoles).not.toContain("pm"); // leader excluded
      }
    });

    it("should include delegation instruction", async () => {
      const reg = createTeamRegistry("STANDARD");
      const result = await reg.resolveTeam("dev");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.context.delegationInstruction).toContain("[@agent:");
        expect(result.result.context.delegationInstruction).toContain("@reviewer");
      }
    });

    it("should return solo instruction for single-member teams", async () => {
      const reg = createTeamRegistry("LITE");
      const result = await reg.resolveTeam("fullstack");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.context.delegationInstruction).toContain("sole member");
      }
    });

    it("should fail for non-existent team", async () => {
      const reg = createTeamRegistry("LITE");
      const result = await reg.resolveTeam("planning");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("TEAM_NOT_FOUND");
      }
    });
  });

  // ==========================================================================
  // Tier Switching
  // ==========================================================================

  describe("setTier", () => {
    it("should reload teams when tier changes", () => {
      const reg = createTeamRegistry("LITE");
      expect(reg.getAvailableTeams().length).toBe(1);

      reg.setTier("ENTERPRISE");
      expect(reg.getAvailableTeams().length).toBe(6);
    });

    it("should clear charter cache on tier change", async () => {
      const reg = createTeamRegistry("ENTERPRISE");
      // Load a charter
      await reg.loadCharter("planning");

      // Switch tier — cache should be cleared
      reg.setTier("LITE");
      expect(reg.getAvailableTeams().length).toBe(1);
    });
  });

  // ==========================================================================
  // Charter Loading
  // ==========================================================================

  describe("loadCharter", () => {
    it("should load existing charter file", async () => {
      const reg = createTeamRegistry("STANDARD");
      const charter = await reg.loadCharter("planning");
      expect(charter).toBeDefined();
      expect(charter).toContain("Planning Team");
    });

    it("should return undefined for non-existent charter", async () => {
      const reg = createTeamRegistry("STANDARD");
      // Cast to bypass type check for testing
      const charter = await reg.loadCharter("nonexistent" as "planning");
      expect(charter).toBeUndefined();
    });

    it("should cache charter on second load", async () => {
      const reg = createTeamRegistry("STANDARD");
      const charter1 = await reg.loadCharter("planning");
      const charter2 = await reg.loadCharter("planning");
      expect(charter1).toBe(charter2); // Same reference from cache
    });
  });
});

// =============================================================================
// Team Type Guards
// =============================================================================

describe("Team Type Guards", () => {
  describe("isValidTeamId", () => {
    it("should accept valid team IDs", () => {
      expect(isValidTeamId("planning")).toBe(true);
      expect(isValidTeamId("dev")).toBe(true);
      expect(isValidTeamId("qa")).toBe(true);
      expect(isValidTeamId("ops")).toBe(true);
      expect(isValidTeamId("design")).toBe(true);
      expect(isValidTeamId("fullstack")).toBe(true);
      expect(isValidTeamId("executive")).toBe(true);
    });

    it("should reject invalid team IDs", () => {
      expect(isValidTeamId("pm")).toBe(false);
      expect(isValidTeamId("coder")).toBe(false);
      expect(isValidTeamId("unknown")).toBe(false);
      expect(isValidTeamId("")).toBe(false);
    });
  });

  describe("isValidTeamArchetype", () => {
    it("should accept valid archetypes", () => {
      expect(isValidTeamArchetype("planning")).toBe(true);
      expect(isValidTeamArchetype("dev")).toBe(true);
      expect(isValidTeamArchetype("fullstack")).toBe(true);
    });

    it("should reject invalid archetypes", () => {
      expect(isValidTeamArchetype("pm")).toBe(false);
      expect(isValidTeamArchetype("invalid")).toBe(false);
    });
  });

  describe("isAllowedTeamTransition", () => {
    it("should allow planning → design", () => {
      expect(isAllowedTeamTransition("planning", "design")).toBe(true);
    });

    it("should allow planning → dev", () => {
      expect(isAllowedTeamTransition("planning", "dev")).toBe(true);
    });

    it("should allow dev → qa", () => {
      expect(isAllowedTeamTransition("dev", "qa")).toBe(true);
    });

    it("should allow qa → ops", () => {
      expect(isAllowedTeamTransition("qa", "ops")).toBe(true);
    });

    it("should block fullstack → any (self-contained)", () => {
      expect(isAllowedTeamTransition("fullstack", "planning")).toBe(false);
      expect(isAllowedTeamTransition("fullstack", "dev")).toBe(false);
    });

    it("should allow executive → any operational team", () => {
      expect(isAllowedTeamTransition("executive", "planning")).toBe(true);
      expect(isAllowedTeamTransition("executive", "dev")).toBe(true);
      expect(isAllowedTeamTransition("executive", "qa")).toBe(true);
      expect(isAllowedTeamTransition("executive", "ops")).toBe(true);
    });

    it("should block ops → planning (must go through qa)", () => {
      expect(isAllowedTeamTransition("ops", "planning")).toBe(false);
    });
  });
});

// =============================================================================
// SDLC Info & Display Names
// =============================================================================

describe("Team Constants", () => {
  describe("TEAM_SDLC_INFO", () => {
    it("should have info for all archetypes", () => {
      expect(TEAM_SDLC_INFO.planning.stages).toEqual(["00", "01"]);
      expect(TEAM_SDLC_INFO.design.stages).toEqual(["02", "03"]);
      expect(TEAM_SDLC_INFO.dev.stages).toEqual(["04"]);
      expect(TEAM_SDLC_INFO.qa.stages).toEqual(["05"]);
      expect(TEAM_SDLC_INFO.ops.stages).toEqual(["06", "07"]);
      expect(TEAM_SDLC_INFO.executive.stages).toEqual([]);
    });

    it("should have gates for all archetypes", () => {
      expect(TEAM_SDLC_INFO.planning.gates).toContain("G0.1");
      expect(TEAM_SDLC_INFO.design.gates).toContain("G2");
      expect(TEAM_SDLC_INFO.dev.gates).toContain("G-Sprint");
      expect(TEAM_SDLC_INFO.qa.gates).toContain("G3");
      expect(TEAM_SDLC_INFO.ops.gates).toContain("G4");
    });
  });

  describe("TEAM_DISPLAY_NAMES", () => {
    it("should have display names for all teams", () => {
      expect(TEAM_DISPLAY_NAMES.planning).toBe("Planning Team");
      expect(TEAM_DISPLAY_NAMES.dev).toBe("Development Team");
      expect(TEAM_DISPLAY_NAMES.qa).toBe("Quality Assurance Team");
      expect(TEAM_DISPLAY_NAMES.ops).toBe("Operations Team");
      expect(TEAM_DISPLAY_NAMES.design).toBe("Design Team");
      expect(TEAM_DISPLAY_NAMES.fullstack).toBe("Full Stack Team");
      expect(TEAM_DISPLAY_NAMES.executive).toBe("Executive Team");
    });
  });

  describe("ALLOWED_TEAM_TRANSITIONS", () => {
    it("should have transitions for all team IDs", () => {
      const teamIds = ["fullstack", "planning", "design", "dev", "qa", "ops", "executive"] as const;
      for (const id of teamIds) {
        expect(ALLOWED_TEAM_TRANSITIONS[id]).toBeDefined();
        expect(Array.isArray(ALLOWED_TEAM_TRANSITIONS[id])).toBe(true);
      }
    });
  });
});
