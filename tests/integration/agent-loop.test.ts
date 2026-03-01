/**
 * Agent Loop Integration Tests
 *
 * Tests basic agent routing and handoff loops.
 *
 * @module tests/integration/agent-loop
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseMention,
  parseMentions,
  type MentionResult,
} from "../../src/agents/orchestrator/mention-parser.js";
import {
  AgentRouter,
  createAgentRouter,
  resetAgentRouter,
} from "../../src/agents/orchestrator/agent-router.js";
import {
  HandoffGuards,
  createHandoffGuards,
  resetHandoffGuards,
} from "../../src/agents/orchestrator/handoff-guards.js";
import {
  VALID_AGENTS,
  TRANSITION_MAP,
  type AgentRole,
} from "../../src/agents/types/handoff.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Agent Loop Integration", () => {
  let router: AgentRouter;
  let guards: HandoffGuards;

  beforeEach(() => {
    resetAgentRouter();
    resetHandoffGuards();

    router = createAgentRouter();
    guards = createHandoffGuards();
  });

  afterEach(() => {
    // Cleanup
  });

  // ==========================================================================
  // Mention Parsing Tests
  // ==========================================================================

  describe("Mention Parsing", () => {
    it("should parse single @agent mentions", () => {
      const result = parseMention("@pm plan the feature");

      expect(result.found).toBe(true);
      expect(result.agent).toBe("pm");
      expect(result.message).toBe("plan the feature");
    });

    it("should parse agent mentions without @", () => {
      const result = parseMention("architect design the system");

      expect(result.found).toBe(true);
      expect(result.agent).toBe("architect");
    });

    it("should handle multiple mentions", () => {
      const results = parseMentions("@pm @architect collaborate on design");

      expect(results.length).toBe(2);
      expect(results[0].agent).toBe("pm");
      expect(results[1].agent).toBe("architect");
    });

    it("should normalize agent names", () => {
      const result = parseMention("@PM Plan Feature");

      expect(result.agent).toBe("pm"); // lowercase
    });

    it("should reject invalid agents", () => {
      const result = parseMention("@invalid do something");

      expect(result.found).toBe(false);
    });

    it("should extract message after mention", () => {
      const result = parseMention('@coder "implement login endpoint"');

      expect(result.found).toBe(true);
      expect(result.message).toContain("implement login endpoint");
    });
  });

  // ==========================================================================
  // Agent Router Tests
  // ==========================================================================

  describe("Agent Router", () => {
    it("should validate all known agents", () => {
      for (const agent of VALID_AGENTS) {
        expect(router.isValidAgent(agent)).toBe(true);
      }
    });

    it("should route to valid agents", () => {
      const result = router.route("pm", "plan the payment gateway");

      expect(result.valid).toBe(true);
      expect(result.agent).toBe("pm");
    });

    it("should reject unknown agents", () => {
      const result = router.route("unknown" as AgentRole, "do something");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown agent");
    });

    it("should get agent capabilities", () => {
      const capabilities = router.getAgentCapabilities("architect");

      expect(capabilities).toBeDefined();
      expect(capabilities?.role).toBe("architect");
    });

    it("should validate transitions", () => {
      const allowed = router.canTransition("pm", "architect");
      const blocked = router.canTransition("pm", "devops");

      expect(allowed).toBe(true);
      expect(blocked).toBe(false);
    });

    it("should get allowed targets for an agent", () => {
      const targets = router.getAllowedTargets("pm");

      expect(targets).toContain("architect");
      expect(targets).toContain("pjm");
      expect(targets).not.toContain("devops");
    });
  });

  // ==========================================================================
  // Handoff Guards Tests
  // ==========================================================================

  describe("Handoff Guards", () => {
    it("should enforce depth limits", () => {
      // Default limit is 3
      const result1 = guards.checkDepth(2);
      const result2 = guards.checkDepth(4);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toContain("depth");
    });

    it("should enforce total handoff limits", () => {
      // Default limit is 5
      const result1 = guards.checkTotal(4);
      const result2 = guards.checkTotal(6);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
    });

    it("should enforce transition rules", () => {
      const result1 = guards.checkTransition("pm", "architect");
      const result2 = guards.checkTransition("pm", "devops");

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toContain("not allowed");
    });

    it("should perform full validation", () => {
      const result = guards.validate({
        from: "pm",
        to: "architect",
        depth: 1,
        totalHandoffs: 1,
      });

      expect(result.allowed).toBe(true);
      expect(result.checks.depth).toBe(true);
      expect(result.checks.total).toBe(true);
      expect(result.checks.transition).toBe(true);
    });

    it("should fail when any check fails", () => {
      const result = guards.validate({
        from: "pm",
        to: "devops", // Invalid transition
        depth: 1,
        totalHandoffs: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.checks.transition).toBe(false);
    });

    it("should allow configurable limits", () => {
      const customGuards = createHandoffGuards({
        maxDepth: 5,
        maxTotalHandoffs: 10,
      });

      const result = customGuards.checkDepth(4);
      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // Full Agent Loop Tests
  // ==========================================================================

  describe("Full Agent Loop", () => {
    it("should complete PM → Architect → Coder chain", () => {
      // Step 1: PM starts
      const pmResult = router.route("pm", "plan the feature");
      expect(pmResult.valid).toBe(true);

      // Step 2: PM hands off to Architect
      const pmToArch = guards.checkTransition("pm", "architect");
      expect(pmToArch.allowed).toBe(true);

      const archResult = router.route("architect", "design the system");
      expect(archResult.valid).toBe(true);

      // Step 3: Architect hands off to Coder
      const archToCoder = guards.checkTransition("architect", "coder");
      expect(archToCoder.allowed).toBe(true);

      const coderResult = router.route("coder", "implement the feature");
      expect(coderResult.valid).toBe(true);
    });

    it("should track depth through chain", () => {
      let depth = 0;

      // PM (depth 0)
      depth++;
      expect(guards.checkDepth(depth).allowed).toBe(true);

      // Architect (depth 1)
      depth++;
      expect(guards.checkDepth(depth).allowed).toBe(true);

      // Coder (depth 2)
      depth++;
      expect(guards.checkDepth(depth).allowed).toBe(true);

      // Reviewer (depth 3) - at limit
      depth++;
      expect(guards.checkDepth(depth).allowed).toBe(false);
    });

    it("should block invalid chains", () => {
      // PM cannot go directly to DevOps
      const invalidChain = guards.validate({
        from: "pm",
        to: "devops",
        depth: 1,
        totalHandoffs: 1,
      });

      expect(invalidChain.allowed).toBe(false);
    });

    it("should allow researcher → pm → architect", () => {
      // Researcher discovers requirements
      const resResult = router.route("researcher", "research the market");
      expect(resResult.valid).toBe(true);

      // Researcher → PM
      const resToPm = guards.checkTransition("researcher", "pm");
      expect(resToPm.allowed).toBe(true);

      // PM → Architect
      const pmToArch = guards.checkTransition("pm", "architect");
      expect(pmToArch.allowed).toBe(true);
    });

    it("should track full loop state", () => {
      const loopState = {
        steps: [] as { agent: string; status: string }[],
        currentDepth: 0,
        totalHandoffs: 0,
      };

      // PM
      loopState.steps.push({ agent: "pm", status: "complete" });
      loopState.currentDepth++;
      loopState.totalHandoffs++;

      // Architect
      loopState.steps.push({ agent: "architect", status: "complete" });
      loopState.currentDepth++;
      loopState.totalHandoffs++;

      // Coder
      loopState.steps.push({ agent: "coder", status: "complete" });
      loopState.currentDepth++;
      loopState.totalHandoffs++;

      expect(loopState.steps.length).toBe(3);
      expect(loopState.currentDepth).toBe(3);
      expect(guards.checkDepth(loopState.currentDepth).allowed).toBe(true);
      expect(guards.checkTotal(loopState.totalHandoffs).allowed).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle empty messages", () => {
      const result = parseMention("@pm");

      expect(result.found).toBe(true);
      expect(result.message).toBe("");
    });

    it("should handle special characters in messages", () => {
      const result = parseMention('@coder implement fn(x) => x * 2');

      expect(result.found).toBe(true);
      expect(result.message).toContain("fn(x)");
    });

    it("should handle very long messages", () => {
      const longMessage = "@pm " + "a".repeat(10000);
      const result = parseMention(longMessage);

      expect(result.found).toBe(true);
      expect(result.message?.length).toBeGreaterThan(1000);
    });

    it("should handle concurrent routing", async () => {
      const routes = await Promise.all([
        Promise.resolve(router.route("pm", "task 1")),
        Promise.resolve(router.route("architect", "task 2")),
        Promise.resolve(router.route("coder", "task 3")),
      ]);

      expect(routes.every((r) => r.valid)).toBe(true);
    });
  });
});
