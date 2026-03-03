/**
 * Agent Loop Integration Tests
 *
 * Tests basic agent routing and handoff loops.
 *
 * @module tests/integration/agent-loop
 * @version 2.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseMention,
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
  ALLOWED_TRANSITIONS,
  isValidRole,
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

  // ==========================================================================
  // Mention Parsing Tests
  // ==========================================================================

  describe("Mention Parsing", () => {
    it("should parse single @agent mentions", () => {
      const result = parseMention("@pm plan the feature");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents[0]).toBe("pm");
        expect(result.data.message).toBe("plan the feature");
      }
    });

    it("should parse agent mentions with quotes", () => {
      const result = parseMention('@architect "design the system"');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents[0]).toBe("architect");
        expect(result.data.message).toContain("design the system");
      }
    });

    it("should normalize agent names to lowercase", () => {
      const result = parseMention("@PM Plan Feature");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agents[0]).toBe("pm");
      }
    });

    it("should reject invalid agents", () => {
      const result = parseMention("@invalid do something");

      expect(result.success).toBe(false);
    });

    it("should extract message after mention", () => {
      const result = parseMention('@coder "implement login endpoint"');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toContain("implement login endpoint");
      }
    });

    it("should handle @agent with no message", () => {
      const result = parseMention("@pm");

      // May fail or succeed with empty message depending on parser
      if (result.success) {
        expect(result.data.agents[0]).toBe("pm");
      }
    });
  });

  // ==========================================================================
  // Agent Router Tests
  // ==========================================================================

  describe("Agent Router", () => {
    it("should validate all known agent roles", () => {
      const validRoles: AgentRole[] = [
        "researcher", "pm", "pjm", "architect",
        "coder", "reviewer", "tester", "devops", "assistant",
      ];

      for (const role of validRoles) {
        expect(isValidRole(role)).toBe(true);
      }
    });

    it("should route to valid agents", async () => {
      const result = await router.route('@pm "plan the payment gateway"');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.agent).toBe("pm");
      }
    });

    it("should reject unknown agents", async () => {
      const result = await router.route('@unknown "do something"');

      expect(result.success).toBe(false);
    });

    it("should validate transitions", () => {
      const allowed = router.validateTransition("pm", "architect");
      const blocked = router.validateTransition("pm", "devops");

      expect(allowed.allowed).toBe(true);
      expect(blocked.allowed).toBe(false);
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
    it("should allow valid handoff within limits", () => {
      const state = guards.createState("test-chain");

      const result = guards.checkHandoff(state, "pm", "architect");

      expect(result.allowed).toBe(true);
    });

    it("should reject invalid transitions", () => {
      const state = guards.createState("test-chain");

      const result = guards.checkHandoff(state, "pm", "devops");

      expect(result.allowed).toBe(false);
    });

    it("should enforce depth limits", () => {
      const state = guards.createState("test-chain");
      // Simulate being at max depth
      state.currentDepth = 10; // Over default limit

      const result = guards.checkHandoff(state, "pm", "architect");

      expect(result.allowed).toBe(false);
    });

    it("should enforce total handoff limits", () => {
      const state = guards.createState("test-chain");
      // Simulate many handoffs
      state.totalHandoffs = 100; // Over default limit

      const result = guards.checkHandoff(state, "pm", "architect");

      expect(result.allowed).toBe(false);
    });

    it("should validate chain of transitions", () => {
      const chain = [
        { from: "pm" as AgentRole, to: "architect" as AgentRole },
        { from: "architect" as AgentRole, to: "coder" as AgentRole },
        { from: "coder" as AgentRole, to: "reviewer" as AgentRole },
      ];

      const result = guards.validateChain(chain);

      expect(result.allowed).toBe(true);
    });

    it("should reject invalid chain", () => {
      const chain = [
        { from: "pm" as AgentRole, to: "devops" as AgentRole }, // Invalid
      ];

      const result = guards.validateChain(chain);

      expect(result.allowed).toBe(false);
    });

    it("should allow configurable limits", () => {
      const customGuards = createHandoffGuards({
        maxDepth: 5,
        maxTotalPerRequest: 10,
      });

      const state = customGuards.createState("test-chain");
      state.currentDepth = 4; // Under custom limit of 5

      const result = customGuards.checkHandoff(state, "pm", "architect");
      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // Full Agent Loop Tests
  // ==========================================================================

  describe("Full Agent Loop", () => {
    it("should complete PM → Architect → Coder chain", () => {
      const state = guards.createState("test-chain");

      // Step 1: PM → Architect
      const pmToArch = guards.checkHandoff(state, "pm", "architect");
      expect(pmToArch.allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      // Step 2: Architect → Coder
      const archToCoder = guards.checkHandoff(state, "architect", "coder");
      expect(archToCoder.allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      // Step 3: Coder → Reviewer
      const coderToReviewer = guards.checkHandoff(state, "coder", "reviewer");
      expect(coderToReviewer.allowed).toBe(true);
    });

    it("should track depth through chain", () => {
      const state = guards.createState("test-chain");

      // PM → Architect (depth 1)
      expect(guards.checkHandoff(state, "pm", "architect").allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      // Architect → Coder (depth 2)
      expect(guards.checkHandoff(state, "architect", "coder").allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      // Coder → Reviewer (depth 3)
      expect(guards.checkHandoff(state, "coder", "reviewer").allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      expect(state.currentDepth).toBe(3);
      expect(state.totalHandoffs).toBe(3);
    });

    it("should block invalid chains", () => {
      const state = guards.createState("test-chain");

      // PM cannot go directly to DevOps
      const result = guards.checkHandoff(state, "pm", "devops");
      expect(result.allowed).toBe(false);
    });

    it("should allow researcher → pm → architect", () => {
      const state = guards.createState("test-chain");

      // Researcher → PM
      const resToPm = guards.checkHandoff(state, "researcher", "pm");
      expect(resToPm.allowed).toBe(true);
      state.currentDepth++;
      state.totalHandoffs++;

      // PM → Architect
      const pmToArch = guards.checkHandoff(state, "pm", "architect");
      expect(pmToArch.allowed).toBe(true);
    });

    it("should track full loop state", () => {
      const loopSteps: { agent: string; status: string }[] = [];
      const state = guards.createState("test-chain");

      // PM
      loopSteps.push({ agent: "pm", status: "complete" });
      state.currentDepth++;
      state.totalHandoffs++;

      // Architect
      loopSteps.push({ agent: "architect", status: "complete" });
      state.currentDepth++;
      state.totalHandoffs++;

      // Coder
      loopSteps.push({ agent: "coder", status: "complete" });
      state.currentDepth++;
      state.totalHandoffs++;

      expect(loopSteps.length).toBe(3);
      expect(state.currentDepth).toBe(3);
      // At maxDepth (3), further handoffs are blocked
      expect(guards.checkHandoff(state, "coder", "reviewer").allowed).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle special characters in messages", () => {
      const result = parseMention('@coder implement fn(x) => x * 2');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toContain("fn(x)");
      }
    });

    it("should handle very long messages", () => {
      const longMessage = "@pm " + "a".repeat(10000);
      const result = parseMention(longMessage);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message.length).toBeGreaterThan(1000);
      }
    });

    it("should handle concurrent routing", async () => {
      const routes = await Promise.all([
        router.route('@pm "task 1"'),
        router.route('@architect "task 2"'),
        router.route('@coder "task 3"'),
      ]);

      expect(routes.every((r) => r.success)).toBe(true);
    });

    it("should validate all transition map entries", () => {
      // Every agent in ALLOWED_TRANSITIONS should be a valid role
      for (const from of Object.keys(ALLOWED_TRANSITIONS)) {
        expect(isValidRole(from)).toBe(true);
        const targets = ALLOWED_TRANSITIONS[from as AgentRole];
        for (const to of targets) {
          expect(isValidRole(to)).toBe(true);
        }
      }
    });
  });
});
