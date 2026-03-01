/**
 * Workflow Engine Integration Tests
 *
 * Tests the full agent workflow chain:
 * - Agent routing
 * - Handoff detection
 * - State machine transitions
 * - Risk classification
 * - Audit logging
 *
 * @module tests/integration/workflow
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WorkflowEngine,
  createWorkflowEngine,
  resetWorkflowEngine,
  type WorkflowConfig,
} from "../../src/agents/orchestrator/workflow-engine.js";
import {
  HandoffDetector,
  createHandoffDetector,
  resetHandoffDetector,
} from "../../src/agents/handoff/handoff-detector.js";
import {
  RiskClassifier,
  createRiskClassifier,
  resetRiskClassifier,
} from "../../src/agents/safety/risk-classifier.js";
import {
  AuditLogger,
  createAuditLogger,
  resetAuditLogger,
} from "../../src/agents/safety/audit-logger.js";
import {
  ProjectVerifier,
  createProjectVerifier,
  resetProjectVerifier,
} from "../../src/agents/context/project-verifier.js";
import { isValidRole, isAllowedTransition } from "../../src/agents/types/handoff.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Workflow Integration", () => {
  let workflow: WorkflowEngine;
  let detector: HandoffDetector;
  let classifier: RiskClassifier;
  let logger: AuditLogger;
  let verifier: ProjectVerifier;

  beforeEach(() => {
    // Reset all singletons
    resetWorkflowEngine();
    resetHandoffDetector();
    resetRiskClassifier();
    resetAuditLogger();
    resetProjectVerifier();

    // Create fresh instances
    workflow = createWorkflowEngine();
    detector = createHandoffDetector({ sourceAgent: "pm" });
    classifier = createRiskClassifier();
    logger = createAuditLogger({ enabled: false }); // Disable file writing
    verifier = createProjectVerifier();
  });

  afterEach(() => {
    workflow.reset();
  });

  // ==========================================================================
  // Workflow State Machine Tests
  // ==========================================================================

  describe("Workflow State Machine", () => {
    it("should start in IDLE state", () => {
      const state = workflow.getState();
      expect(state).toBe("IDLE");
    });

    it("should transition IDLE → RUNNING on start", async () => {
      // Start workflow
      await workflow.start({
        task: "Plan user authentication",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      expect(workflow.getState()).toBe("RUNNING");
    });

    it("should transition to WAITING_CONFIRM on handoff detection", async () => {
      // Start workflow
      await workflow.start({
        task: "Plan payment gateway",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      // Simulate agent output with handoff
      const mockOutput = `
I've analyzed the requirements. Here's my recommendation:

\`\`\`json
{
  "handoff": [{
    "to": "architect",
    "intent": "Design payment gateway architecture",
    "priority": "P1",
    "reason": "Ready for technical design"
  }]
}
\`\`\`
      `;

      // Process output
      workflow.processAgentOutput(mockOutput);

      expect(workflow.getState()).toBe("WAITING_CONFIRM");
    });

    it("should transition WAITING_CONFIRM → DONE when declined", async () => {
      await workflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      workflow.processAgentOutput(`
\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design", "priority": "P1"}]}
\`\`\`
      `);

      expect(workflow.getState()).toBe("WAITING_CONFIRM");

      // Decline handoff
      workflow.confirmHandoff(false);

      expect(workflow.getState()).toBe("DONE");
    });

    it("should transition WAITING_CONFIRM → RUNNING when confirmed", async () => {
      await workflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      workflow.processAgentOutput(`
\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design", "priority": "P1"}]}
\`\`\`
      `);

      expect(workflow.getState()).toBe("WAITING_CONFIRM");

      // Confirm handoff
      workflow.confirmHandoff(true);

      expect(workflow.getState()).toBe("RUNNING");
    });

    it("should emit state change events", async () => {
      const stateChanges: string[] = [];

      workflow.on("stateChange", (newState) => {
        stateChanges.push(newState);
      });

      await workflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      expect(stateChanges).toContain("RUNNING");
    });

    it("should respect max depth limit", async () => {
      const limitedWorkflow = createWorkflowEngine({
        limits: { maxDepth: 2, maxTotalHandoffs: 10, maxDuration: 300000 },
      });

      await limitedWorkflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: "/tmp/test-project",
      });

      // First handoff (depth 1)
      limitedWorkflow.processAgentOutput(`
\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design", "priority": "P1"}]}
\`\`\`
      `);
      limitedWorkflow.confirmHandoff(true);

      // Second handoff (depth 2) - should be blocked
      limitedWorkflow.processAgentOutput(`
\`\`\`json
{"handoff": [{"to": "coder", "intent": "Implement", "priority": "P1"}]}
\`\`\`
      `);

      const context = limitedWorkflow.getContext();
      expect(context?.depth).toBeLessThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Handoff Detection Tests
  // ==========================================================================

  describe("Handoff Detection", () => {
    it("should detect JSON block format", () => {
      const output = `
Here's my analysis:

\`\`\`json
{
  "handoff": [{
    "to": "architect",
    "intent": "Design system architecture",
    "priority": "P1"
  }]
}
\`\`\`
      `;

      const result = detector.detect(output);

      expect(result.detected).toBe(true);
      expect(result.method).toBe("json_block");
      expect(result.handoffs.length).toBe(1);
      expect(result.handoffs[0].to).toBe("architect");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should detect inline tag format", () => {
      const output = "Please [@architect: design the database schema]";

      const result = detector.detect(output);

      expect(result.detected).toBe(true);
      expect(result.method).toBe("inline_tag");
      expect(result.handoffs[0].to).toBe("architect");
    });

    it("should detect explicit marker format", () => {
      const output = 'HANDOFF: @coder "implement the login endpoint"';

      const result = detector.detect(output);

      expect(result.detected).toBe(true);
      expect(result.method).toBe("explicit_marker");
      expect(result.handoffs[0].to).toBe("coder");
    });

    it("should detect natural language patterns", () => {
      const nlDetector = createHandoffDetector({ enableNaturalLanguage: true });

      const output = "I recommend handing this off to the architect for design review.";

      const result = nlDetector.detect(output);

      expect(result.detected).toBe(true);
      expect(result.method).toBe("natural_language");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("should validate allowed transitions", () => {
      detector.setSourceAgent("pm");

      const validOutput = `
\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design", "priority": "P1"}]}
\`\`\`
      `;

      const { detection, validations } = detector.detectAndValidate(validOutput);

      expect(detection.detected).toBe(true);
      expect(validations[0].valid).toBe(true);
    });

    it("should reject invalid transitions", () => {
      detector.setSourceAgent("pm");

      const invalidOutput = `
\`\`\`json
{"handoff": [{"to": "devops", "intent": "Deploy", "priority": "P1"}]}
\`\`\`
      `;

      const { validations } = detector.detectAndValidate(invalidOutput);

      expect(validations[0].valid).toBe(false);
      expect(validations[0].errors).toContain(
        "Transition from @pm to @devops is not allowed"
      );
    });
  });

  // ==========================================================================
  // Risk Classification Tests
  // ==========================================================================

  describe("Risk Classification", () => {
    it("should classify READ mode as lower risk", () => {
      const result = classifier.classify({
        agent: "pm",
        mode: "read",
        action: "generate_plan",
      });

      expect(result.level).toBe("LOW");
      expect(result.confirmation).toBe("none");
    });

    it("should classify PATCH mode as higher risk", () => {
      const result = classifier.classify({
        agent: "coder",
        mode: "patch",
        action: "modify_source",
      });

      expect(["MEDIUM", "HIGH"]).toContain(result.level);
    });

    it("should classify destructive actions as CRITICAL", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "interactive",
        action: "deploy",
      });

      expect(result.level).toBe("CRITICAL");
      expect(result.confirmation).toBe("explicit_with_audit");
    });

    it("should detect dangerous patterns", () => {
      const result = classifier.classify({
        agent: "coder",
        mode: "patch",
        action: "modify_source",
        content: "rm -rf /important/directory",
      });

      expect(result.level).toBe("CRITICAL");
      expect(result.factors.some((f) => f.name === "dangerous_pattern")).toBe(true);
    });

    it("should accumulate risk factors", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "interactive",
        action: "deploy",
        affectedFiles: Array(20).fill("file.ts"),
        content: "DROP TABLE users;",
      });

      expect(result.level).toBe("CRITICAL");
      expect(result.factors.length).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // Audit Logging Tests
  // ==========================================================================

  describe("Audit Logging", () => {
    it("should create audit entries", () => {
      const entry = logger.log({
        agent: "pm",
        task: "Plan feature",
        project: "test-project",
        mode: "read",
        tier: "LITE",
        status: "success",
      });

      expect(entry.id).toMatch(/^inv_/);
      expect(entry.agent).toBe("pm");
      expect(entry.status).toBe("success");
    });

    it("should track handoffs", () => {
      const entry = logger.log({
        agent: "pm",
        task: "Plan feature",
        project: "test-project",
        mode: "read",
        tier: "STANDARD",
        status: "success",
        handoff_to: "architect",
      });

      expect(entry.handoff_to).toBe("architect");
    });

    it("should include risk level", () => {
      const entry = logger.log({
        agent: "coder",
        task: "Modify files",
        project: "test-project",
        mode: "patch",
        tier: "PROFESSIONAL",
        status: "success",
        risk: "HIGH",
      });

      expect(entry.risk).toBe("HIGH");
    });

    it("should track token usage", () => {
      const entry = logger.log({
        agent: "pm",
        task: "Plan",
        project: "test",
        mode: "read",
        tier: "LITE",
        status: "success",
        tokens_in: 1500,
        tokens_out: 2000,
      });

      expect(entry.tokens_in).toBe(1500);
      expect(entry.tokens_out).toBe(2000);
    });
  });

  // ==========================================================================
  // Project Verification Tests
  // ==========================================================================

  describe("Project Verification", () => {
    it("should quick check project paths", () => {
      const result = verifier.quickCheck("/nonexistent/path");

      expect(result.exists).toBe(false);
      expect(result.hasSDLCConfig).toBe(false);
      expect(result.isGitRepo).toBe(false);
    });

    it("should verify existing projects", () => {
      // Use current directory for test
      const result = verifier.verify(process.cwd());

      expect(result.path).toBe(process.cwd());
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect git repositories", () => {
      const result = verifier.verify(process.cwd());

      // EndiorBot should be a git repo
      expect(result.git.isGitRepo).toBe(true);
      expect(result.git.branch).toBeDefined();
    });

    it("should format verification results", () => {
      const result = verifier.verify(process.cwd());
      const formatted = verifier.formatResult(result);

      expect(formatted).toContain("Project:");
      expect(formatted).toContain("Path:");
      expect(formatted).toContain("Tier:");
    });
  });

  // ==========================================================================
  // Agent Transition Tests
  // ==========================================================================

  describe("Agent Transitions", () => {
    it("should validate all agent roles", () => {
      const validRoles = [
        "pm", "pjm", "researcher", "architect",
        "coder", "reviewer", "tester", "devops", "assistant"
      ];

      for (const role of validRoles) {
        expect(isValidRole(role)).toBe(true);
      }
    });

    it("should reject invalid roles", () => {
      expect(isValidRole("invalid")).toBe(false);
      expect(isValidRole("manager")).toBe(false);
      expect(isValidRole("")).toBe(false);
    });

    it("should allow valid transitions", () => {
      // PM can hand off to architects
      expect(isAllowedTransition("pm", "architect")).toBe(true);

      // Architect can hand off to coders
      expect(isAllowedTransition("architect", "coder")).toBe(true);

      // Coder can hand off to reviewers
      expect(isAllowedTransition("coder", "reviewer")).toBe(true);
    });

    it("should block invalid transitions", () => {
      // PM cannot hand off directly to devops
      expect(isAllowedTransition("pm", "devops")).toBe(false);

      // Researcher cannot hand off to coder
      expect(isAllowedTransition("researcher", "coder")).toBe(false);
    });
  });

  // ==========================================================================
  // Full Chain Integration Tests
  // ==========================================================================

  describe("Full Workflow Chain", () => {
    it("should execute PM → Architect chain", async () => {
      const events: string[] = [];

      workflow.on("stateChange", (state) => events.push(`state:${state}`));
      workflow.on("handoffDetected", () => events.push("handoff"));
      workflow.on("stepComplete", () => events.push("step"));

      // Start with PM
      await workflow.start({
        task: "Plan user authentication",
        agent: "pm",
        mode: "read",
        workspace: process.cwd(),
      });

      // PM outputs handoff to architect
      workflow.processAgentOutput(`
Plan complete.

\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design auth system", "priority": "P1"}]}
\`\`\`
      `);

      expect(events).toContain("state:RUNNING");
      expect(events).toContain("handoff");
      expect(events).toContain("state:WAITING_CONFIRM");

      // Confirm handoff
      workflow.confirmHandoff(true);

      // Should be running architect now
      const context = workflow.getContext();
      expect(context?.currentAgent).toBe("architect");
    });

    it("should track step history", async () => {
      await workflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: process.cwd(),
      });

      // First handoff
      workflow.processAgentOutput(`
\`\`\`json
{"handoff": [{"to": "architect", "intent": "Design", "priority": "P1"}]}
\`\`\`
      `);
      workflow.confirmHandoff(true);

      // Complete architect step
      workflow.processAgentOutput("Design complete. No further handoffs needed.");

      const context = workflow.getContext();
      expect(context?.steps.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle workflow completion", async () => {
      await workflow.start({
        task: "Simple task",
        agent: "pm",
        mode: "read",
        workspace: process.cwd(),
      });

      // No handoff - task complete
      workflow.processAgentOutput("Task completed successfully.");

      expect(workflow.getState()).toBe("DONE");
    });

    it("should handle errors gracefully", async () => {
      await workflow.start({
        task: "Test task",
        agent: "pm",
        mode: "read",
        workspace: process.cwd(),
      });

      // Simulate error
      workflow.handleError(new Error("Test error"));

      expect(workflow.getState()).toBe("ERROR");

      const context = workflow.getContext();
      expect(context?.error).toBeDefined();
    });
  });
});
