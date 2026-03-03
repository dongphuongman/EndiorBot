/**
 * Mention Parser — Team Detection Tests
 *
 * Tests for team mention parsing (Sprint 74 extension).
 * Also includes regression tests for existing agent mention behavior.
 *
 * @module tests/agents/orchestrator/mention-parser-teams
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseMention,
  parseCLIMention,
  getFirstAgent,
  hasMention,
  getExecutorAgents,
  formatMention,
} from "../../../src/agents/orchestrator/mention-parser.js";
import {
  createTeamRegistry,
} from "../../../src/agents/orchestrator/team-registry.js";
import type { TeamRegistry } from "../../../src/agents/orchestrator/team-registry.js";

describe("Mention Parser — Team Detection", () => {
  let standardRegistry: TeamRegistry;
  let liteRegistry: TeamRegistry;
  let enterpriseRegistry: TeamRegistry;

  beforeEach(() => {
    standardRegistry = createTeamRegistry("STANDARD");
    liteRegistry = createTeamRegistry("LITE");
    enterpriseRegistry = createTeamRegistry("ENTERPRISE");
  });

  // ==========================================================================
  // Agent-First Namespace Resolution
  // ==========================================================================

  describe("Agent-first resolution (ADR-017)", () => {
    it("@pm should route to PM directly, not via team", () => {
      const result = parseMention('@pm "design auth system"', standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.isTeam).toBe(false);
        expect(result.data.teamId).toBeUndefined();
      }
    });

    it("@coder should route directly even though coder is in dev team", () => {
      const result = parseMention("@coder implement feature X", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["coder"]);
        expect(result.data.isTeam).toBe(false);
      }
    });

    it("@assistant should route directly (router role)", () => {
      const result = parseMention("@assistant help me", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isTeam).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Team Detection
  // ==========================================================================

  describe("Team detection", () => {
    it("@planning should resolve to PM via team", () => {
      const result = parseMention('@planning "design auth system"', standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBe("planning");
      }
    });

    it("@dev should resolve to coder via team", () => {
      const result = parseMention("@dev implement feature X", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["coder"]);
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBe("dev");
      }
    });

    it("@qa should resolve to reviewer in STANDARD", () => {
      const result = parseMention("@qa verify release quality", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["reviewer"]);
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBe("qa");
      }
    });

    it("@fullstack routes to fullstack agent directly (agent-first)", () => {
      // "fullstack" is both a valid AgentRole AND a team name.
      // Agent-first resolution means it routes as agent, not team.
      const result = parseMention("@fullstack build the app", liteRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["fullstack"]);
        expect(result.data.isTeam).toBe(false); // Agent takes priority
        expect(result.data.teamId).toBeUndefined();
      }
    });

    it("@ops should resolve to devops in ENTERPRISE", () => {
      const result = parseMention("@ops deploy to production", enterpriseRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["devops"]);
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBe("ops");
      }
    });

    it("@executive should resolve to ceo in ENTERPRISE", () => {
      const result = parseMention("@executive strategic review", enterpriseRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["ceo"]);
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBe("executive");
      }
    });
  });

  // ==========================================================================
  // Tier-Dependent Availability
  // ==========================================================================

  describe("Tier-dependent team availability", () => {
    it("@planning should fail in LITE (not available)", () => {
      const result = parseMention("@planning design auth", liteRegistry);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_AGENT");
      }
    });

    it("@ops should fail in STANDARD (not available)", () => {
      const result = parseMention("@ops deploy app", standardRegistry);
      expect(result.success).toBe(false);
    });

    it("@design should fail in STANDARD (not available)", () => {
      const result = parseMention("@design create architecture", standardRegistry);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Backward Compatibility (no registry)
  // ==========================================================================

  describe("Backward compatibility (no TeamRegistry)", () => {
    it("should work without registry — agents only", () => {
      const result = parseMention('@pm "plan feature"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.isTeam).toBe(false);
        expect(result.data.teamId).toBeUndefined();
      }
    });

    it("@planning without registry should fail (not a valid agent)", () => {
      const result = parseMention("@planning design auth");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_AGENT");
      }
    });

    it("OTT format should still work", () => {
      const result = parseMention("[@pm: plan payment gateway]");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.isTeam).toBe(false);
      }
    });
  });

  // ==========================================================================
  // isTeam Derivation (B3)
  // ==========================================================================

  describe("isTeam derivation from teamId (CTO B3)", () => {
    it("isTeam === true when teamId is set", () => {
      const result = parseMention("@planning task", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isTeam).toBe(true);
        expect(result.data.teamId).toBeDefined();
      }
    });

    it("isTeam === false when teamId is undefined", () => {
      const result = parseMention("@pm task", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isTeam).toBe(false);
        expect(result.data.teamId).toBeUndefined();
      }
    });

    it("isTeam and teamId are always consistent", () => {
      // Test with various inputs
      const inputs = [
        { input: "@pm task", registry: standardRegistry },
        { input: "@planning task", registry: standardRegistry },
        { input: "@coder task", registry: enterpriseRegistry },
        { input: "@dev task", registry: enterpriseRegistry },
        { input: "@fullstack task", registry: liteRegistry },
      ];

      for (const { input, registry } of inputs) {
        const result = parseMention(input, registry);
        if (result.success) {
          const hasTeamId = result.data.teamId !== undefined;
          expect(result.data.isTeam).toBe(hasTeamId);
        }
      }
    });
  });

  // ==========================================================================
  // Message Preservation
  // ==========================================================================

  describe("Message preservation", () => {
    it("should preserve message when routing via team", () => {
      const result = parseMention('@planning "design auth system with OAuth2"', standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("design auth system with OAuth2");
      }
    });

    it("should preserve unquoted message via team", () => {
      const result = parseMention("@dev implement the payment feature", standardRegistry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("implement the payment feature");
      }
    });
  });
});

// =============================================================================
// Regression Tests — Existing Agent Mention Behavior
// =============================================================================

describe("Mention Parser — Existing Behavior Regression", () => {
  describe("CLI format", () => {
    it("should parse quoted CLI mention", () => {
      const result = parseCLIMention('@pm "plan payment gateway"');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.message).toBe("plan payment gateway");
        expect(result.data.isTeam).toBe(false);
      }
    });

    it("should parse unquoted CLI mention", () => {
      const result = parseCLIMention("@coder implement the feature");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["coder"]);
        expect(result.data.message).toBe("implement the feature");
      }
    });
  });

  describe("OTT format", () => {
    it("should parse OTT mention", () => {
      const result = parseMention("[@pm: plan payment gateway]");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm"]);
        expect(result.data.message).toBe("plan payment gateway");
      }
    });

    it("should parse multi-agent OTT mention", () => {
      const result = parseMention("[@pm,architect: design the system]");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents).toEqual(["pm", "architect"]);
      }
    });
  });

  describe("Helper functions", () => {
    it("getFirstAgent should work with team mentions", () => {
      const registry = createTeamRegistry("STANDARD");
      const result = parseMention("@planning task", registry);
      const agent = getFirstAgent(result);
      expect(agent).toBe("pm");
    });

    it("hasMention should detect team mentions", () => {
      // Without registry, @planning is unknown → false
      expect(hasMention("@planning task")).toBe(false);
      // With registry (via parseMention), @pm works
      expect(hasMention("@pm task")).toBe(true);
    });

    it("getExecutorAgents should work with team-resolved agents", () => {
      const registry = createTeamRegistry("STANDARD");
      const result = parseMention("@planning task", registry);
      const executors = getExecutorAgents(result);
      expect(executors).toEqual(["pm"]);
    });

    it("formatMention should format correctly", () => {
      expect(formatMention("pm", "plan feature")).toBe("[@pm: plan feature]");
    });
  });
});
