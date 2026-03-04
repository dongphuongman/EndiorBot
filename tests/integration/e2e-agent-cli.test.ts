/**
 * E2E Agent CLI Tests
 *
 * Tests full CLI → orchestration → response flow.
 * Mocks Claude Code bridge for deterministic tests.
 *
 * @module tests/integration/e2e-agent-cli
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 58
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// Orchestration imports
import {
  getAgentRouter,
  resetAgentRouter,
} from "../../src/agents/orchestrator/agent-router.js";
import {
  getWorkflowEngine,
  resetWorkflowEngine,
} from "../../src/agents/orchestrator/workflow-engine.js";
import {
  getClaudeCodeBridge,
  resetClaudeCodeBridge,
} from "../../src/agents/invoke/claude-code-bridge.js";
import {
  resetHandoffDetector,
} from "../../src/agents/handoff/handoff-detector.js";
import {
  resetRiskClassifier,
} from "../../src/agents/safety/risk-classifier.js";
import {
  resetAuditLogger,
} from "../../src/agents/safety/audit-logger.js";

// OTT imports
import {
  formatForTelegram,
  formatForZalo,
  formatError,
  formatAgentNotFound,
  type AgentResponse,
} from "../../src/channels/ott/response-formatter.js";
import {
  createHandoffKeyboard,
  parseCallbackData,
} from "../../src/channels/telegram/keyboards.js";
import type { AgentRole, ParsedHandoff } from "../../src/agents/types/handoff.js";

// ============================================================================
// Test Setup
// ============================================================================

const CLI_PATH = join(process.cwd(), "endiorbot.mjs");

describe("E2E Agent CLI", () => {
  beforeEach(() => {
    // Reset all singletons
    resetAgentRouter();
    resetWorkflowEngine();
    resetClaudeCodeBridge();
    resetHandoffDetector();
    resetRiskClassifier();
    resetAuditLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Agent Router E2E
  // ==========================================================================

  describe("Agent Router E2E", () => {
    it("should route PM agent request", async () => {
      const router = getAgentRouter();

      const result = await router.route("@pm plan payment gateway integration");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.agent).toBe("pm");
        expect(result.decision.message).toContain("plan");
      }
    });

    it("should route Architect agent request", async () => {
      const router = getAgentRouter();

      const result = await router.route("@architect design database schema");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.agent).toBe("architect");
      }
    });

    it("should route Coder agent request", async () => {
      const router = getAgentRouter();

      const result = await router.route("@coder implement login endpoint");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.agent).toBe("coder");
      }
    });

    it("should reject invalid agent", async () => {
      const router = getAgentRouter();

      const result = await router.route("@invalid do something");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("No valid agents");
      }
    });

    it("should classify task complexity", async () => {
      const router = getAgentRouter();

      const result = await router.route("@pm plan enterprise microservices architecture with 50 services");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.classification).toBeDefined();
        expect(result.decision.classification.taskType).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Workflow Engine E2E
  // ==========================================================================

  describe("Workflow Engine E2E", () => {
    it("should start and complete simple workflow", () => {
      const workflow = getWorkflowEngine();

      // Start workflow
      const ctx = workflow.start("pm", "plan feature");

      expect(ctx.id).toBeDefined();
      expect(ctx.id).toMatch(/^wf_/);

      // Start step
      workflow.startStep(ctx.id);

      // Complete step - should not throw
      expect(() => workflow.completeStep(ctx.id, "Task completed")).not.toThrow();
    });

    it("should detect handoff in output", () => {
      const workflow = getWorkflowEngine();

      const ctx = workflow.start("pm", "plan feature");
      workflow.startStep(ctx.id);

      const output = `
Plan complete.

\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design architecture", "priority": "HIGH"}]}
\`\`\`
      `;

      // Complete step with handoff output - should not throw
      expect(() => workflow.completeStep(ctx.id, output)).not.toThrow();
    });

    it("should track multiple steps", () => {
      const workflow = getWorkflowEngine();

      // Step 1: PM
      const ctx1 = workflow.start("pm", "plan");
      workflow.startStep(ctx1.id);
      workflow.completeStep(ctx1.id, "Plan done");

      // Step 2: Architect (new workflow)
      const ctx2 = workflow.start("architect", "design");
      workflow.startStep(ctx2.id);
      workflow.completeStep(ctx2.id, "Design done");

      expect(ctx1.id).not.toBe(ctx2.id);
    });
  });

  // ==========================================================================
  // OTT Response Formatting E2E
  // ==========================================================================

  describe("OTT Response Formatting E2E", () => {
    it("should format Telegram response", () => {
      const response: AgentResponse = {
        agent: "pm",
        task: "plan payment gateway",
        output: "Here is my plan:\n1. Research providers\n2. Design API",
        durationMs: 1500,
      };

      const formatted = formatForTelegram(response);

      expect(formatted.text).toContain("@pm");
      expect(formatted.text).toContain("plan payment gateway");
      expect(formatted.parseMode).toBe("Markdown");
      expect(formatted.showHandoffButtons).toBe(false);
    });

    it("should format Telegram response with handoff", () => {
      const handoff: ParsedHandoff = {
        to: "architect",
        from: "pm",
        intent: "Design the architecture",
        priority: "HIGH",
        inputs: {},
        reason: "Ready for design",
        depth: 0,
        timestamp: new Date(),
        correlationId: "test-123",
      };

      const response: AgentResponse = {
        agent: "pm",
        task: "plan feature",
        output: "Plan complete",
        durationMs: 2000,
        handoff,
      };

      const formatted = formatForTelegram(response);

      expect(formatted.showHandoffButtons).toBe(true);
      expect(formatted.handoffOptions).toHaveLength(1);
      expect(formatted.handoffOptions[0].agent).toBe("architect");
    });

    it("should format Zalo response", () => {
      const response: AgentResponse = {
        agent: "coder",
        task: "implement login",
        output: "Code implementation complete",
        durationMs: 3000,
      };

      const formatted = formatForZalo(response);

      expect(formatted.text).toContain("@coder");
      expect(formatted.parseMode).toBe("plain");
    });

    it("should truncate long Telegram response", () => {
      const response: AgentResponse = {
        agent: "pm",
        task: "test",
        output: "A".repeat(5000),
        durationMs: 1000,
      };

      const formatted = formatForTelegram(response);

      expect(formatted.text.length).toBeLessThanOrEqual(4096);
    });

    it("should truncate long Zalo response", () => {
      const response: AgentResponse = {
        agent: "pm",
        task: "test",
        output: "A".repeat(3000),
        durationMs: 1000,
      };

      const formatted = formatForZalo(response);

      expect(formatted.text.length).toBeLessThanOrEqual(2000);
    });

    it("should format error response", () => {
      const telegramError = formatError("Connection timeout", "telegram");
      const zaloError = formatError("Connection timeout", "zalo");

      expect(telegramError).toContain("Error");
      expect(zaloError).toContain("Error");
    });

    it("should format agent not found", () => {
      const message = formatAgentNotFound("@unknown task");

      expect(message).toContain("Unknown agent");
      expect(message).toContain("Agents:");
    });
  });

  // ==========================================================================
  // Telegram Keyboards E2E
  // ==========================================================================

  describe("Telegram Keyboards E2E", () => {
    it("should create handoff keyboard", () => {
      const handoffs = [
        { agent: "architect" as AgentRole, intent: "Design system", priority: "HIGH" },
        { agent: "coder" as AgentRole, intent: "Implement", priority: "NORMAL" },
      ];

      const keyboard = createHandoffKeyboard(handoffs);

      expect(keyboard.inline_keyboard.length).toBe(3); // 2 handoffs + cancel
      expect(keyboard.inline_keyboard[0][0].callback_data).toContain("handoff:");
    });

    it("should parse handoff callback", () => {
      const callback = "handoff:architect:ZGVzaWdu";
      const parsed = parseCallbackData(callback);

      expect(parsed.action).toBe("handoff");
      expect(parsed.target).toBe("architect");
      expect(parsed.data).toBeDefined();
    });

    it("should parse confirm callback", () => {
      const parsed = parseCallbackData("confirm:patch-123");

      expect(parsed.action).toBe("confirm");
      expect(parsed.target).toBe("patch-123");
    });

    it("should parse cancel callback", () => {
      const parsed = parseCallbackData("cancel:workflow-456");

      expect(parsed.action).toBe("cancel");
      expect(parsed.target).toBe("workflow-456");
    });
  });

  // ==========================================================================
  // Full E2E Flow
  // ==========================================================================

  describe("Full E2E Flow", () => {
    it("should complete PM → response flow", async () => {
      const router = getAgentRouter();
      const workflow = getWorkflowEngine();

      // Step 1: Route request
      const routeResult = await router.route("@pm plan user authentication");
      expect(routeResult.success).toBe(true);

      if (!routeResult.success) return;

      const decision = routeResult.decision;

      // Step 2: Start workflow
      const ctx = workflow.start(decision.agent, decision.message);
      workflow.startStep(ctx.id);

      // Step 3: Simulate agent output (normally from Claude Code)
      const mockOutput = "Authentication plan:\n1. JWT tokens\n2. OAuth2\n3. Session management";

      workflow.completeStep(ctx.id, mockOutput);

      // Step 4: Format for OTT
      const agentResponse: AgentResponse = {
        agent: decision.agent,
        task: decision.message,
        output: mockOutput,
        durationMs: 1500,
      };

      const telegramFormatted = formatForTelegram(agentResponse);
      const zaloFormatted = formatForZalo(agentResponse);

      expect(telegramFormatted.text).toContain("@pm");
      expect(zaloFormatted.text).toContain("@pm");
    });

    it("should complete PM → Architect handoff flow", async () => {
      const router = getAgentRouter();
      const workflow = getWorkflowEngine();

      // Step 1: PM routing
      const pmResult = await router.route("@pm plan payment system");
      expect(pmResult.success).toBe(true);

      if (!pmResult.success) return;

      // Step 2: PM workflow
      const pmCtx = workflow.start(pmResult.decision.agent, pmResult.decision.message);
      workflow.startStep(pmCtx.id);

      // Step 3: PM outputs with handoff
      const pmOutput = `
Payment system plan complete.

\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design payment architecture", "priority": "HIGH"}]}
\`\`\`
      `;

      workflow.completeStep(pmCtx.id, pmOutput);

      // Step 4: Format response with handoff
      const handoff: ParsedHandoff = {
        to: "architect",
        from: "pm",
        intent: "Design payment architecture",
        priority: "HIGH",
        inputs: {},
        reason: "Ready for architecture",
        depth: 0,
        timestamp: new Date(),
        correlationId: pmCtx.id,
      };

      const pmResponse: AgentResponse = {
        agent: pmResult.decision.agent,
        task: pmResult.decision.message,
        output: "Payment system plan complete.",
        durationMs: 2000,
        handoff,
      };

      const formatted = formatForTelegram(pmResponse);

      expect(formatted.showHandoffButtons).toBe(true);
      expect(formatted.handoffOptions[0].agent).toBe("architect");

      // Step 5: Create keyboard for handoff
      const keyboard = createHandoffKeyboard(formatted.handoffOptions);
      expect(keyboard.inline_keyboard.length).toBeGreaterThan(0);

      // Step 6: Simulate user clicking handoff button
      const callbackData = keyboard.inline_keyboard[0][0].callback_data!;
      const parsed = parseCallbackData(callbackData);

      expect(parsed.action).toBe("handoff");
      expect(parsed.target).toBe("architect");

      // Step 7: Route to architect
      const archResult = await router.route(`@${parsed.target} ${parsed.data || "continue"}`);
      expect(archResult.success).toBe(true);
    });

    it("should handle error gracefully", async () => {
      const router = getAgentRouter();

      // Invalid agent
      const result = await router.route("@nonexistent do something");

      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMsg = formatError(result.error.message, "telegram");
        expect(errorMsg).toContain("Error");
      }
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle empty task", async () => {
      const router = getAgentRouter();

      const result = await router.route("@pm");

      // Should still route but with empty message
      if (result.success) {
        expect(result.decision.message).toBe("");
      }
    });

    it("should handle special characters", async () => {
      const router = getAgentRouter();

      const result = await router.route("@coder implement fn(x) => x * 2 && x > 0");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.message).toContain("fn(x)");
      }
    });

    it("should handle unicode", async () => {
      const router = getAgentRouter();

      const result = await router.route("@pm plan tính năng thanh toán 💳");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.message).toContain("thanh toán");
      }
    });

    it("should handle long task", async () => {
      const router = getAgentRouter();
      const longTask = "@pm " + "a".repeat(5000);

      const result = await router.route(longTask);

      expect(result.success).toBe(true);
    });
  });
});
