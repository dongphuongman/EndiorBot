/**
 * Workflow Templates
 *
 * Pre-built agent chains for common development workflows.
 * Templates define the sequence of agents and their tasks.
 *
 * Available Templates:
 * - feature-development: PM → Architect → Coder → Reviewer → Tester
 * - bug-fix: Researcher → Coder → Reviewer
 * - code-review: Reviewer → Coder (if fixes needed)
 * - refactoring: Architect → Coder → Reviewer
 * - documentation: PM → Coder
 *
 * @module agents/orchestrator/workflow-templates
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import type { AgentRole } from "../types/handoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Workflow template step definition.
 */
export interface TemplateStep {
  /** Agent to invoke */
  agent: AgentRole;
  /** Task template (supports {variables}) */
  taskTemplate: string;
  /** Whether this step is optional */
  optional?: boolean;
  /** Condition to run this step */
  condition?: string;
  /** Mode for this step */
  mode?: "READ" | "PATCH" | "INTERACTIVE";
  /** Timeout override in seconds */
  timeout?: number;
}

/**
 * Workflow template definition.
 */
export interface WorkflowTemplate {
  /** Template ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Minimum tier required */
  minTier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  /** SDLC stages this template covers */
  sdlcStages: string[];
  /** Template steps */
  steps: TemplateStep[];
  /** Variables this template accepts */
  variables: {
    name: string;
    description: string;
    required: boolean;
    default?: string;
  }[];
  /** Tags for search */
  tags: string[];
  /** Estimated duration in minutes */
  estimatedDuration: number;
}

/**
 * Template execution options.
 */
export interface TemplateExecutionOptions {
  /** Template ID to execute */
  templateId: string;
  /** Variable values */
  variables: Record<string, string>;
  /** Override tier */
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  /** Dry run mode */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Skip optional steps */
  skipOptional?: boolean;
}

// ============================================================================
// Built-in Templates
// ============================================================================

/**
 * Feature development workflow.
 * PM → Architect → Coder → Reviewer → Tester
 */
const FEATURE_DEVELOPMENT: WorkflowTemplate = {
  id: "feature-development",
  name: "Feature Development",
  description: "Full feature development workflow from requirements to testing",
  minTier: "LITE",
  sdlcStages: ["00-DISCOVERY", "01-REQUIREMENTS", "02-DESIGN", "04-BUILD", "05-TEST"],
  steps: [
    {
      agent: "pm",
      taskTemplate: "Create user stories and acceptance criteria for: {feature}",
      mode: "READ",
    },
    {
      agent: "architect",
      taskTemplate: "Design technical approach for: {feature}",
      mode: "READ",
      optional: true,
    },
    {
      agent: "coder",
      taskTemplate: "Implement the feature: {feature}",
      mode: "PATCH",
    },
    {
      agent: "reviewer",
      taskTemplate: "Review the implementation of: {feature}",
      mode: "READ",
    },
    {
      agent: "tester",
      taskTemplate: "Write and run tests for: {feature}",
      mode: "READ",
      optional: true,
    },
  ],
  variables: [
    {
      name: "feature",
      description: "Feature description",
      required: true,
    },
  ],
  tags: ["feature", "development", "full-cycle"],
  estimatedDuration: 30,
};

/**
 * Bug fix workflow.
 * Researcher → Coder → Reviewer
 */
const BUG_FIX: WorkflowTemplate = {
  id: "bug-fix",
  name: "Bug Fix",
  description: "Quick bug fix workflow with investigation and review",
  minTier: "LITE",
  sdlcStages: ["04-BUILD", "05-TEST"],
  steps: [
    {
      agent: "researcher",
      taskTemplate: "Investigate root cause of: {bug}",
      mode: "READ",
      optional: true,
    },
    {
      agent: "coder",
      taskTemplate: "Fix the bug: {bug}",
      mode: "PATCH",
    },
    {
      agent: "reviewer",
      taskTemplate: "Review the fix for: {bug}",
      mode: "READ",
    },
  ],
  variables: [
    {
      name: "bug",
      description: "Bug description or issue reference",
      required: true,
    },
  ],
  tags: ["bug", "fix", "quick"],
  estimatedDuration: 15,
};

/**
 * Code review workflow.
 * Reviewer → Coder (if fixes needed)
 */
const CODE_REVIEW: WorkflowTemplate = {
  id: "code-review",
  name: "Code Review",
  description: "Code review workflow with optional fix cycle",
  minTier: "LITE",
  sdlcStages: ["04-BUILD"],
  steps: [
    {
      agent: "reviewer",
      taskTemplate: "Review code changes: {scope}",
      mode: "READ",
    },
    {
      agent: "coder",
      taskTemplate: "Address review feedback for: {scope}",
      mode: "PATCH",
      optional: true,
      condition: "review_has_issues",
    },
  ],
  variables: [
    {
      name: "scope",
      description: "Scope of review (PR, files, feature)",
      required: true,
    },
  ],
  tags: ["review", "code", "quality"],
  estimatedDuration: 10,
};

/**
 * Refactoring workflow.
 * Architect → Coder → Reviewer
 */
const REFACTORING: WorkflowTemplate = {
  id: "refactoring",
  name: "Refactoring",
  description: "Safe refactoring with architecture review",
  minTier: "STANDARD",
  sdlcStages: ["02-DESIGN", "04-BUILD"],
  steps: [
    {
      agent: "architect",
      taskTemplate: "Plan refactoring approach for: {target}",
      mode: "READ",
    },
    {
      agent: "coder",
      taskTemplate: "Implement refactoring of: {target}",
      mode: "PATCH",
    },
    {
      agent: "reviewer",
      taskTemplate: "Review refactored code: {target}",
      mode: "READ",
    },
    {
      agent: "tester",
      taskTemplate: "Verify tests still pass after refactoring: {target}",
      mode: "READ",
      optional: true,
    },
  ],
  variables: [
    {
      name: "target",
      description: "What to refactor (module, function, component)",
      required: true,
    },
  ],
  tags: ["refactor", "cleanup", "improvement"],
  estimatedDuration: 25,
};

/**
 * Documentation workflow.
 * PM → Coder
 */
const DOCUMENTATION: WorkflowTemplate = {
  id: "documentation",
  name: "Documentation",
  description: "Create or update documentation",
  minTier: "LITE",
  sdlcStages: ["01-REQUIREMENTS", "04-BUILD"],
  steps: [
    {
      agent: "pm",
      taskTemplate: "Outline documentation structure for: {topic}",
      mode: "READ",
    },
    {
      agent: "coder",
      taskTemplate: "Write documentation for: {topic}",
      mode: "PATCH",
    },
  ],
  variables: [
    {
      name: "topic",
      description: "Documentation topic or area",
      required: true,
    },
  ],
  tags: ["docs", "documentation", "writing"],
  estimatedDuration: 20,
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * All built-in workflow templates.
 */
export const WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
  FEATURE_DEVELOPMENT,
  BUG_FIX,
  CODE_REVIEW,
  REFACTORING,
  DOCUMENTATION,
];

/**
 * Template registry for lookup.
 */
const templateRegistry = new Map<string, WorkflowTemplate>(
  WORKFLOW_TEMPLATES.map((t) => [t.id, t])
);

// ============================================================================
// Template Manager
// ============================================================================

/**
 * Workflow template manager.
 */
export class WorkflowTemplateManager {
  /**
   * Get all available templates.
   */
  getTemplates(): WorkflowTemplate[] {
    return [...WORKFLOW_TEMPLATES];
  }

  /**
   * Get template by ID.
   */
  getTemplate(id: string): WorkflowTemplate | undefined {
    return templateRegistry.get(id);
  }

  /**
   * Search templates by tags.
   */
  searchTemplates(tags: string[]): WorkflowTemplate[] {
    return WORKFLOW_TEMPLATES.filter((t) =>
      tags.some((tag) =>
        t.tags.includes(tag.toLowerCase()) ||
        t.name.toLowerCase().includes(tag.toLowerCase()) ||
        t.description.toLowerCase().includes(tag.toLowerCase())
      )
    );
  }

  /**
   * Get templates for a tier.
   */
  getTemplatesForTier(tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE"): WorkflowTemplate[] {
    const tierOrder = { LITE: 1, STANDARD: 2, PROFESSIONAL: 3, ENTERPRISE: 4 };
    return WORKFLOW_TEMPLATES.filter((t) => tierOrder[t.minTier] <= tierOrder[tier]);
  }

  /**
   * Expand template step with variables.
   */
  expandStep(step: TemplateStep, variables: Record<string, string>): TemplateStep {
    let task = step.taskTemplate;
    for (const [key, value] of Object.entries(variables)) {
      task = task.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return { ...step, taskTemplate: task };
  }

  /**
   * Validate template variables.
   */
  validateVariables(
    template: WorkflowTemplate,
    variables: Record<string, string>
  ): { valid: boolean; missing: string[] } {
    const missing = template.variables
      .filter((v) => v.required && !variables[v.name])
      .map((v) => v.name);

    return { valid: missing.length === 0, missing };
  }

  /**
   * Generate execution plan for a template.
   */
  generatePlan(
    template: WorkflowTemplate,
    variables: Record<string, string>,
    options: { skipOptional?: boolean } = {}
  ): { steps: TemplateStep[]; estimatedDuration: number } {
    const steps = template.steps
      .filter((s) => !options.skipOptional || !s.optional)
      .map((s) => this.expandStep(s, variables));

    return {
      steps,
      estimatedDuration: template.estimatedDuration,
    };
  }

  /**
   * Format template for display.
   */
  formatTemplate(template: WorkflowTemplate): string {
    const lines = [
      `📋 ${template.name} (${template.id})`,
      `   ${template.description}`,
      `   Tier: ${template.minTier}+ | Duration: ~${template.estimatedDuration}min`,
      "",
      "   Steps:",
      ...template.steps.map((s, i) =>
        `   ${i + 1}. @${s.agent}: ${s.taskTemplate}${s.optional ? " (optional)" : ""}`
      ),
      "",
      "   Variables:",
      ...template.variables.map((v) =>
        `   - {${v.name}}: ${v.description}${v.required ? " (required)" : ""}`
      ),
    ];
    return lines.join("\n");
  }

  /**
   * Format template list.
   */
  formatTemplateList(templates: WorkflowTemplate[]): string {
    if (templates.length === 0) {
      return "No templates found.";
    }

    const lines = templates.map((t) =>
      `  ${t.id.padEnd(20)} ${t.name.padEnd(25)} ${t.minTier.padEnd(12)} ~${t.estimatedDuration}min`
    );

    return [
      "Available Workflow Templates:",
      "",
      "  ID                   Name                      Tier         Duration",
      "  ─".repeat(35),
      ...lines,
      "",
      "Use 'endiorbot workflow show <id>' for details.",
    ].join("\n");
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: WorkflowTemplateManager | undefined;

/**
 * Get the workflow template manager singleton.
 */
export function getWorkflowTemplateManager(): WorkflowTemplateManager {
  if (!instance) {
    instance = new WorkflowTemplateManager();
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetWorkflowTemplateManager(): void {
  instance = undefined;
}
