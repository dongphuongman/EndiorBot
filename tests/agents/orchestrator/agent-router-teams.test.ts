/**
 * Agent Router — Team Routing Tests (ADR-017)
 *
 * Tests team routing through AgentRouter:
 * - @team mentions resolve to leader agents with enriched SOUL
 * - Team context (teammates, delegation, charter) injected into SOUL
 * - Tier-dependent team availability
 * - setTier updates both tierConfig and TeamRegistry
 * - Direct @agent mentions remain unaffected (isTeam: false)
 *
 * @module tests/agents/orchestrator/agent-router-teams
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74
 * @authority ADR-017 Team Agent System
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AgentRouter,
  createAgentRouter,
  resetAgentRouter,
} from "../../../src/agents/orchestrator/agent-router.js";
import { resetTeamRegistry } from "../../../src/agents/orchestrator/team-registry.js";

describe("AgentRouter — Team Routing (ADR-017)", () => {
  beforeEach(() => {
    resetAgentRouter();
    resetTeamRegistry();
  });

  // ==========================================================================
  // Direct @agent routing (backward compatibility)
  // ==========================================================================

  describe("Direct @agent routing (no team)", () => {
    it("should route @pm directly with isTeam: false", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@pm "plan payment gateway"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("pm");
      expect(result.decision.isTeam).toBe(false);
      expect(result.decision.teamId).toBeUndefined();
      expect(result.decision.teamName).toBeUndefined();
    });

    it("should route @coder directly with isTeam: false", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@coder "implement auth"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("coder");
      expect(result.decision.isTeam).toBe(false);
      expect(result.decision.teamId).toBeUndefined();
    });

    it("should route @architect directly with isTeam: false", async () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const result = await router.route('@architect "design database schema"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("architect");
      expect(result.decision.isTeam).toBe(false);
    });
  });

  // ==========================================================================
  // Team routing — STANDARD tier
  // ==========================================================================

  describe("Team routing — STANDARD tier", () => {
    it("should route @planning to PM with team context", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@planning "design auth system"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("pm");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("planning");
      expect(result.decision.teamName).toBe("Planning Team");
      expect(result.decision.message).toBe("design auth system");
    });

    it("should inject Team Context section into SOUL", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@planning "plan sprint"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const soulContent = result.decision.soul.content;
      expect(soulContent).toContain("## Team Context");
      expect(soulContent).toContain("**leader**");
      expect(soulContent).toContain("Planning Team");
      expect(soulContent).toContain("### Teammates");
      expect(soulContent).toContain("### Delegation");
    });

    it("should route @dev to coder with team context", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@dev "implement login"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("coder");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("dev");
      expect(result.decision.teamName).toBe("Development Team");
    });

    it("should route @qa to reviewer with team context", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@qa "review pull request"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("reviewer");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("qa");
      expect(result.decision.teamName).toBe("Quality Assurance Team");
    });

    it("should fail for @ops in STANDARD tier (not available)", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@ops "deploy to production"');

      // @ops is unknown in STANDARD → parse failure
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe("INVALID_MENTION");
    });

    it("should fail for @design in STANDARD tier (not available)", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@design "create wireframes"');

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe("INVALID_MENTION");
    });
  });

  // ==========================================================================
  // Team routing — PROFESSIONAL tier
  // ==========================================================================

  describe("Team routing — PROFESSIONAL tier", () => {
    it("should route @design to architect", async () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const result = await router.route('@design "create system architecture"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("architect");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("design");
      expect(result.decision.teamName).toBe("Design Team");
    });

    it("should route @executive to cto in PROFESSIONAL tier", async () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const result = await router.route('@executive "review architecture"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("cto");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("executive");
      expect(result.decision.teamName).toBe("Executive Team");
    });

    it("should include teammates in SOUL for @design team", async () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const result = await router.route('@design "review design"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const soulContent = result.decision.soul.content;
      expect(soulContent).toContain("## Team Context");
      expect(soulContent).toContain("### Teammates");
      // Design team has members: architect (leader), pm, coder
      // Teammates = members excluding leader
      expect(soulContent).toContain("@pm");
      expect(soulContent).toContain("@coder");
    });
  });

  // ==========================================================================
  // Team routing — ENTERPRISE tier
  // ==========================================================================

  describe("Team routing — ENTERPRISE tier", () => {
    it("should route @ops to devops", async () => {
      const router = createAgentRouter({ tier: "ENTERPRISE" });
      const result = await router.route('@ops "deploy to production"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("devops");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("ops");
      expect(result.decision.teamName).toBe("Operations Team");
    });

    it("should route @executive to ceo in ENTERPRISE tier", async () => {
      const router = createAgentRouter({ tier: "ENTERPRISE" });
      const result = await router.route('@executive "strategic review"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.agent).toBe("ceo");
      expect(result.decision.isTeam).toBe(true);
      expect(result.decision.teamId).toBe("executive");
    });

    it("should have all 6 teams available", async () => {
      const router = createAgentRouter({ tier: "ENTERPRISE" });
      const registry = router.getTeamRegistry();
      const teams = registry.getAvailableTeams();

      expect(teams.length).toBe(6);
      const teamIds = teams.map((t) => t.id).sort();
      expect(teamIds).toEqual(["design", "dev", "executive", "ops", "planning", "qa"]);
    });
  });

  // ==========================================================================
  // Team routing — LITE tier
  // ==========================================================================

  describe("Team routing — LITE tier", () => {
    it("should route @fullstack as agent (agent-first), not team", async () => {
      const router = createAgentRouter({ tier: "LITE" });
      const result = await router.route('@fullstack "build landing page"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      // fullstack is both an AgentRole and a TeamId
      // Agent-first resolution means it routes as agent, not team
      expect(result.decision.agent).toBe("fullstack");
      expect(result.decision.isTeam).toBe(false);
      expect(result.decision.teamId).toBeUndefined();
    });

    it("should fail for @planning in LITE tier", async () => {
      const router = createAgentRouter({ tier: "LITE" });
      const result = await router.route('@planning "plan feature"');

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe("INVALID_MENTION");
    });
  });

  // ==========================================================================
  // SOUL content enrichment
  // ==========================================================================

  describe("SOUL content enrichment", () => {
    it("should include delegation instruction for multi-member teams", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@dev "build auth module"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const soulContent = result.decision.soul.content;
      expect(soulContent).toContain("### Delegation");
      expect(soulContent).toContain("delegate tasks");
    });

    it("should show sole member message for single-member teams", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@qa "review code"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const soulContent = result.decision.soul.content;
      // QA team in STANDARD: leader=reviewer, members=[reviewer]
      // Only 1 member = sole member
      expect(soulContent).toContain("sole member");
    });

    it("should preserve original SOUL metadata for team routes", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@planning "plan sprint"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      // SOUL metadata should still be the leader's (PM)
      expect(result.decision.soul.metadata.role).toBe("pm");
    });

    it("should not inject team context for direct agent routes", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@pm "plan sprint"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const soulContent = result.decision.soul.content;
      expect(soulContent).not.toContain("## Team Context");
    });
  });

  // ==========================================================================
  // setTier synchronization
  // ==========================================================================

  describe("setTier synchronization", () => {
    it("should update TeamRegistry when tier changes", async () => {
      const router = createAgentRouter({ tier: "LITE" });

      // @planning fails in LITE
      const r1 = await router.route('@planning "test"');
      expect(r1.success).toBe(false);

      // Switch to STANDARD
      router.setTier("STANDARD");

      // @planning should now work
      const r2 = await router.route('@planning "test"');
      expect(r2.success).toBe(true);
      if (!r2.success) return;

      expect(r2.decision.agent).toBe("pm");
      expect(r2.decision.isTeam).toBe(true);
      expect(r2.decision.teamId).toBe("planning");
    });

    it("should reflect new tier in TeamRegistry", () => {
      const router = createAgentRouter({ tier: "LITE" });
      const registry = router.getTeamRegistry();

      expect(registry.getTier()).toBe("LITE");

      router.setTier("ENTERPRISE");
      expect(registry.getTier()).toBe("ENTERPRISE");
    });
  });

  // ==========================================================================
  // Task classification with team routes
  // ==========================================================================

  describe("Task classification with team routes", () => {
    it("should classify task even for team routes", async () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const result = await router.route('@planning "plan payment gateway architecture"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.classification).toBeDefined();
      expect(result.decision.classification.taskType).toBeDefined();
      expect(result.decision.classification.complexity).toBeDefined();
    });

    it("should include tier in team routing decisions", async () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const result = await router.route('@design "design database schema"');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.decision.tier).toBe("PROFESSIONAL");
    });
  });

  // ==========================================================================
  // getTeamRegistry accessor
  // ==========================================================================

  describe("getTeamRegistry accessor", () => {
    it("should return TeamRegistry matching router tier", () => {
      const router = createAgentRouter({ tier: "PROFESSIONAL" });
      const registry = router.getTeamRegistry();

      expect(registry).toBeDefined();
      expect(registry.getTier()).toBe("PROFESSIONAL");
    });

    it("should return same instance on repeated calls", () => {
      const router = createAgentRouter({ tier: "STANDARD" });
      const reg1 = router.getTeamRegistry();
      const reg2 = router.getTeamRegistry();

      expect(reg1).toBe(reg2);
    });
  });
});
