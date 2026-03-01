/**
 * Workflow Templates Tests
 *
 * @module tests/agents/orchestrator/workflow-templates
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  WorkflowTemplateManager,
  getWorkflowTemplateManager,
  resetWorkflowTemplateManager,
  WORKFLOW_TEMPLATES,
} from "../../../src/agents/orchestrator/workflow-templates.js";

describe("WorkflowTemplateManager", () => {
  beforeEach(() => {
    resetWorkflowTemplateManager();
  });

  describe("Singleton", () => {
    it("should return singleton instance", () => {
      const manager1 = getWorkflowTemplateManager();
      const manager2 = getWorkflowTemplateManager();
      expect(manager1).toBe(manager2);
    });

    it("should reset singleton", () => {
      const manager1 = getWorkflowTemplateManager();
      resetWorkflowTemplateManager();
      const manager2 = getWorkflowTemplateManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe("getTemplates", () => {
    it("should return all templates", () => {
      const manager = getWorkflowTemplateManager();
      const templates = manager.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates).toEqual(WORKFLOW_TEMPLATES);
    });
  });

  describe("getTemplate", () => {
    it("should return template by ID", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Feature Development");
    });

    it("should return undefined for unknown ID", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("unknown-template");
      expect(template).toBeUndefined();
    });
  });

  describe("searchTemplates", () => {
    it("should find templates by tag", () => {
      const manager = getWorkflowTemplateManager();
      const templates = manager.searchTemplates(["bug"]);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.id === "bug-fix")).toBe(true);
    });

    it("should find templates by name", () => {
      const manager = getWorkflowTemplateManager();
      const templates = manager.searchTemplates(["feature"]);
      expect(templates.some((t) => t.id === "feature-development")).toBe(true);
    });
  });

  describe("getTemplatesForTier", () => {
    it("should return LITE templates for LITE tier", () => {
      const manager = getWorkflowTemplateManager();
      const templates = manager.getTemplatesForTier("LITE");
      expect(templates.every((t) => t.minTier === "LITE")).toBe(true);
    });

    it("should return LITE and STANDARD templates for STANDARD tier", () => {
      const manager = getWorkflowTemplateManager();
      const templates = manager.getTemplatesForTier("STANDARD");
      const tiers = templates.map((t) => t.minTier);
      expect(tiers).toContain("LITE");
      // Refactoring template requires STANDARD
      expect(templates.some((t) => t.minTier === "STANDARD")).toBe(true);
    });
  });

  describe("validateVariables", () => {
    it("should pass for valid variables", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const result = manager.validateVariables(template, { feature: "test" });
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("should fail for missing required variables", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const result = manager.validateVariables(template, {});
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("feature");
    });
  });

  describe("expandStep", () => {
    it("should replace variables in task template", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const step = template.steps[0];
      const expanded = manager.expandStep(step, { feature: "user auth" });
      expect(expanded.taskTemplate).toContain("user auth");
      expect(expanded.taskTemplate).not.toContain("{feature}");
    });
  });

  describe("generatePlan", () => {
    it("should generate execution plan", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const plan = manager.generatePlan(template, { feature: "test" });
      expect(plan.steps.length).toBe(template.steps.length);
      expect(plan.estimatedDuration).toBe(template.estimatedDuration);
    });

    it("should skip optional steps when requested", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const fullPlan = manager.generatePlan(template, { feature: "test" });
      const skipPlan = manager.generatePlan(template, { feature: "test" }, { skipOptional: true });
      expect(skipPlan.steps.length).toBeLessThan(fullPlan.steps.length);
    });
  });

  describe("formatTemplate", () => {
    it("should format template for display", () => {
      const manager = getWorkflowTemplateManager();
      const template = manager.getTemplate("feature-development")!;
      const formatted = manager.formatTemplate(template);
      expect(formatted).toContain("Feature Development");
      expect(formatted).toContain("@pm");
      expect(formatted).toContain("{feature}");
    });
  });

  describe("Built-in Templates", () => {
    it("should have feature-development template", () => {
      expect(WORKFLOW_TEMPLATES.some((t) => t.id === "feature-development")).toBe(true);
    });

    it("should have bug-fix template", () => {
      expect(WORKFLOW_TEMPLATES.some((t) => t.id === "bug-fix")).toBe(true);
    });

    it("should have code-review template", () => {
      expect(WORKFLOW_TEMPLATES.some((t) => t.id === "code-review")).toBe(true);
    });

    it("should have refactoring template", () => {
      expect(WORKFLOW_TEMPLATES.some((t) => t.id === "refactoring")).toBe(true);
    });

    it("should have documentation template", () => {
      expect(WORKFLOW_TEMPLATES.some((t) => t.id === "documentation")).toBe(true);
    });
  });
});
