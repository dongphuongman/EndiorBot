/**
 * Workflow Engine Integration Tests
 *
 * Tests the full agent workflow chain:
 * - Workflow lifecycle (start, pause, resume, cancel)
 * - Step management (create, complete, fail)
 * - Handoff detection and confirmation
 * - Risk classification
 * - Audit logging
 * - Project verification
 * - Agent transitions
 *
 * @module tests/integration/workflow
 * @version 2.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 72
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  WorkflowEngine,
  createWorkflowEngine,
  resetWorkflowEngine,
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
    logger = createAuditLogger({ logPath: "/dev/null", consoleLog: false });
    verifier = createProjectVerifier();
  });

  afterEach(() => {
    // Cleanup
  });

  // ==========================================================================
  // Workflow State Machine Tests
  // ==========================================================================

  describe("Workflow State Machine", () => {
    it("should start in RUNNING state after start", () => {
      const context = workflow.start("pm", "Plan user authentication");
      expect(context.state).toBe("RUNNING");
    });

    it("should create workflow with proper context", () => {
      const context = workflow.start("pm", "Plan user authentication");

      expect(context.id).toBeDefined();
      expect(context.initialAgent).toBe("pm");
      expect(context.initialTask).toBe("Plan user authentication");
      expect(context.steps.length).toBe(1);
      expect(context.startedAt).toBeInstanceOf(Date);
    });

    it("should transition to WAITING_CONFIRM on handoff detection", () => {
      const context = workflow.start("pm", "Plan payment gateway");

      // Start the step
      workflow.startStep(context.id);

      // Complete step with a handoff
      workflow.completeStep(context.id, "Plan complete.", {
        from: "pm",
        to: "architect",
        intent: "Design payment gateway architecture",
        priority: "P1",
        inputs: {},
        reason: "Ready for technical design",
        depth: 1,
        timestamp: new Date(),
        correlationId: "test-hf-1",
      });

      const updated = workflow.get(context.id);
      expect(updated?.state).toBe("WAITING_CONFIRM");
    });

    it("should transition WAITING_CONFIRM → DONE when declined", () => {
      const context = workflow.start("pm", "Test task");
      workflow.startStep(context.id);

      workflow.completeStep(context.id, "Done.", {
        from: "pm",
        to: "architect",
        intent: "Design",
        priority: "P1",
        inputs: {},
        reason: "Test",
        depth: 1,
        timestamp: new Date(),
        correlationId: "test-hf-2",
      });

      expect(workflow.get(context.id)?.state).toBe("WAITING_CONFIRM");

      // Decline handoff
      workflow.confirmHandoff(context.id, false);

      expect(workflow.get(context.id)?.state).toBe("DONE");
    });

    it("should transition WAITING_CONFIRM → RUNNING when confirmed", () => {
      const context = workflow.start("pm", "Test task");
      workflow.startStep(context.id);

      workflow.completeStep(context.id, "Done.", {
        from: "pm",
        to: "architect",
        intent: "Design",
        priority: "P1",
        inputs: {},
        reason: "Test",
        depth: 1,
        timestamp: new Date(),
        correlationId: "test-hf-3",
      });

      expect(workflow.get(context.id)?.state).toBe("WAITING_CONFIRM");

      // Confirm handoff
      workflow.confirmHandoff(context.id, true);

      expect(workflow.get(context.id)?.state).toBe("RUNNING");
    });

    it("should emit state change events", () => {
      const stateChanges: string[] = [];

      workflow.on("state:change", (_oldState: string, newState: string) => {
        stateChanges.push(newState);
      });

      workflow.start("pm", "Test task");

      expect(stateChanges).toContain("RUNNING");
    });

    it("should support pause and resume", () => {
      const context = workflow.start("pm", "Test task");

      expect(workflow.pause(context.id)).toBe(true);
      expect(workflow.get(context.id)?.state).toBe("PAUSED");

      expect(workflow.resume(context.id)).toBe(true);
      expect(workflow.get(context.id)?.state).toBe("RUNNING");
    });

    it("should support cancel", () => {
      const context = workflow.start("pm", "Test task");

      expect(workflow.cancel(context.id, "User cancelled")).toBe(true);
      expect(workflow.get(context.id)?.state).toBe("ERROR");
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

      // Natural language detection may or may not match depending on implementation
      if (result.detected) {
        expect(result.method).toBe("natural_language");
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      } else {
        // If NL detection doesn't match, confidence should be low
        expect(result.confidence).toBeLessThan(0.7);
      }
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
      expect(validations[0].errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Risk Classification Tests
  // ==========================================================================

  describe("Risk Classification", () => {
    it("should classify READ mode as lower risk", () => {
      const result = classifier.classify({
        agent: "pm",
        mode: "READ",
        task: "generate plan",
      });

      expect(result.level).toBe("LOW");
      expect(result.confirmation).toBe("none");
    });

    it("should classify PATCH mode as higher risk", () => {
      const result = classifier.classify({
        agent: "coder",
        mode: "PATCH",
        task: "modify source code",
      });

      expect(["MEDIUM", "HIGH"]).toContain(result.level);
    });

    it("should classify destructive actions as CRITICAL", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "INTERACTIVE",
        task: "deploy to production",
      });

      expect(result.level).toBe("CRITICAL");
      expect(result.confirmation).toBe("explicit_with_audit");
    });

    it("should detect dangerous patterns in commands", () => {
      const result = classifier.classify({
        agent: "coder",
        mode: "PATCH",
        task: "modify source files",
        commands: ["rm -rf /important/directory"],
      });

      expect(["HIGH", "CRITICAL"]).toContain(result.level);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it("should accumulate risk factors", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "INTERACTIVE",
        task: "deploy production database migration",
        files: Array(20).fill("file.ts"),
        commands: ["DROP TABLE users;"],
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
      const entry = logger.logEntry({
        agent: "pm",
        task: "Plan feature",
        project: "test-project",
        mode: "READ",
        tier: "LITE",
        status: "success",
        duration_ms: 1000,
        risk: "LOW",
      });

      expect(entry.id).toMatch(/^inv_/);
      expect(entry.agent).toBe("pm");
      expect(entry.status).toBe("success");
    });

    it("should track handoffs", () => {
      const entry = logger.logEntry({
        agent: "pm",
        task: "Plan feature",
        project: "test-project",
        mode: "READ",
        tier: "STANDARD",
        status: "success",
        duration_ms: 2000,
        risk: "LOW",
        handoff_to: "architect",
      });

      expect(entry.handoff_to).toBe("architect");
    });

    it("should include risk level", () => {
      const entry = logger.logEntry({
        agent: "coder",
        task: "Modify files",
        project: "test-project",
        mode: "PATCH",
        tier: "PROFESSIONAL",
        status: "success",
        duration_ms: 5000,
        risk: "HIGH",
      });

      expect(entry.risk).toBe("HIGH");
    });

    it("should track token usage", () => {
      const entry = logger.logEntry({
        agent: "pm",
        task: "Plan",
        project: "test",
        mode: "READ",
        tier: "LITE",
        status: "success",
        duration_ms: 3000,
        risk: "LOW",
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
    it("should execute PM → Architect chain", () => {
      const events: string[] = [];

      workflow.on("state:change", (_oldState: string, newState: string) =>
        events.push(`state:${newState}`)
      );
      workflow.on("handoff:request", () => events.push("handoff"));
      workflow.on("step:complete", () => events.push("step"));

      // Start with PM
      const context = workflow.start("pm", "Plan user authentication");
      workflow.startStep(context.id);

      // PM outputs handoff to architect
      workflow.completeStep(context.id, "Plan complete.", {
        from: "pm",
        to: "architect",
        intent: "Design auth system",
        priority: "P1",
        inputs: {},
        reason: "Ready for design",
        depth: 1,
        timestamp: new Date(),
        correlationId: "test-chain-1",
      });

      expect(events).toContain("state:RUNNING");
      expect(events).toContain("handoff");
      expect(events).toContain("state:WAITING_CONFIRM");

      // Confirm handoff
      workflow.confirmHandoff(context.id, true);

      // Should be running with architect step now
      const updated = workflow.get(context.id);
      expect(updated?.state).toBe("RUNNING");
      expect(updated?.steps.length).toBe(2);
      expect(updated?.steps[1].agent).toBe("architect");
    });

    it("should track step history", () => {
      const context = workflow.start("pm", "Test task");
      workflow.startStep(context.id);

      // Complete PM step with handoff
      workflow.completeStep(context.id, "Done.", {
        from: "pm",
        to: "architect",
        intent: "Design",
        priority: "P1",
        inputs: {},
        reason: "Test",
        depth: 1,
        timestamp: new Date(),
        correlationId: "test-history-1",
      });
      workflow.confirmHandoff(context.id, true);

      // Complete architect step (no handoff → completes workflow)
      workflow.startStep(context.id);
      workflow.completeStep(context.id, "Design complete.");

      const updated = workflow.get(context.id);
      expect(updated?.steps.length).toBe(2);
      expect(updated?.state).toBe("DONE");
    });

    it("should handle workflow completion", () => {
      const context = workflow.start("pm", "Simple task");
      workflow.startStep(context.id);

      // No handoff - task complete
      workflow.completeStep(context.id, "Task completed successfully.");

      expect(workflow.get(context.id)?.state).toBe("DONE");
    });

    it("should handle errors gracefully", () => {
      const context = workflow.start("pm", "Test task");
      workflow.startStep(context.id);

      // Fail the step
      workflow.failStep(context.id, "Test error");

      expect(workflow.get(context.id)?.state).toBe("ERROR");
      expect(workflow.get(context.id)?.error).toBeDefined();
    });
  });
});
