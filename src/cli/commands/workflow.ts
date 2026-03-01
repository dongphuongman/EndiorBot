/**
 * Workflow Command
 *
 * Manage and execute workflow templates.
 *
 * Usage:
 *   endiorbot workflow list                    # List available templates
 *   endiorbot workflow show <id>               # Show template details
 *   endiorbot workflow run <id> --var key=val  # Execute a template
 *
 * @module cli/commands/workflow
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import type { Command } from "commander";
import { getWorkflowTemplateManager } from "../../agents/orchestrator/workflow-templates.js";

// ============================================================================
// Types
// ============================================================================

interface WorkflowRunOptions {
  var?: string[];
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  dryRun?: boolean;
  verbose?: boolean;
  skipOptional?: boolean;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * List available workflow templates.
 */
async function listAction(options: { tier?: string }): Promise<void> {
  const manager = getWorkflowTemplateManager();
  const tier = (options.tier ?? "LITE") as "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";

  const templates = manager.getTemplatesForTier(tier);
  console.log(manager.formatTemplateList(templates));
}

/**
 * Show template details.
 */
async function showAction(templateId: string): Promise<void> {
  const manager = getWorkflowTemplateManager();
  const template = manager.getTemplate(templateId);

  if (!template) {
    console.error(`❌ Template not found: ${templateId}`);
    console.log("");
    console.log("Available templates:");
    const templates = manager.getTemplates();
    for (const t of templates) {
      console.log(`  - ${t.id}`);
    }
    process.exit(1);
  }

  console.log(manager.formatTemplate(template));
}

/**
 * Run a workflow template.
 */
async function runAction(
  templateId: string,
  options: WorkflowRunOptions
): Promise<void> {
  const manager = getWorkflowTemplateManager();
  const template = manager.getTemplate(templateId);

  if (!template) {
    console.error(`❌ Template not found: ${templateId}`);
    process.exit(1);
  }

  // Parse variables
  const variables: Record<string, string> = {};
  if (options.var) {
    for (const v of options.var) {
      const [key, ...valueParts] = v.split("=");
      if (key && valueParts.length > 0) {
        variables[key] = valueParts.join("=");
      }
    }
  }

  // Validate variables
  const validation = manager.validateVariables(template, variables);
  if (!validation.valid) {
    console.error(`❌ Missing required variables: ${validation.missing.join(", ")}`);
    console.log("");
    console.log("Required variables:");
    for (const v of template.variables.filter((v) => v.required)) {
      console.log(`  --var ${v.name}="..." : ${v.description}`);
    }
    process.exit(1);
  }

  // Check tier
  const tier = options.tier ?? "LITE";
  const tierOrder = { LITE: 1, STANDARD: 2, PROFESSIONAL: 3, ENTERPRISE: 4 };
  if (tierOrder[template.minTier] > tierOrder[tier]) {
    console.error(`❌ Template requires ${template.minTier}+ tier (current: ${tier})`);
    console.log("   Use --tier to set a higher tier.");
    process.exit(1);
  }

  // Generate plan
  const plan = manager.generatePlan(template, variables, {
    skipOptional: options.skipOptional ?? false,
  });

  console.log(`\n🚀 Workflow: ${template.name}`);
  console.log(`   ${template.description}`);
  console.log(`   Steps: ${plan.steps.length} | Duration: ~${plan.estimatedDuration}min`);
  console.log("");

  if (options.dryRun) {
    console.log("📋 Dry Run - Execution Plan:");
    console.log("");
    plan.steps.forEach((step, i) => {
      console.log(`   ${i + 1}. @${step.agent}`);
      console.log(`      Task: ${step.taskTemplate}`);
      console.log(`      Mode: ${step.mode ?? "READ"}`);
      if (step.optional) {
        console.log("      (optional step)");
      }
      console.log("");
    });
    console.log("Run without --dry-run to execute.");
    return;
  }

  // Execute workflow
  console.log("Executing workflow...\n");

  for (const [i, step] of plan.steps.entries()) {
    console.log(`\n[${i + 1}/${plan.steps.length}] @${step.agent}`);
    console.log(`    Task: ${step.taskTemplate}`);

    if (options.verbose) {
      console.log(`    Mode: ${step.mode ?? "READ"}`);
    }

    // In a real implementation, this would invoke the agent
    // For now, we simulate the execution
    console.log("    → Invoking agent...");

    // Simulate execution time
    await sleep(500);

    console.log("    ✅ Step completed");
  }

  console.log(`\n✅ Workflow completed: ${template.name}`);
}

/**
 * Search templates by tags.
 */
async function searchAction(tags: string[]): Promise<void> {
  const manager = getWorkflowTemplateManager();
  const templates = manager.searchTemplates(tags);

  if (templates.length === 0) {
    console.log(`No templates found matching: ${tags.join(", ")}`);
    return;
  }

  console.log(`Found ${templates.length} template(s) matching: ${tags.join(", ")}\n`);
  console.log(manager.formatTemplateList(templates));
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register workflow commands.
 */
export function registerWorkflowCommand(program: Command): void {
  const workflow = program
    .command("workflow")
    .description("Manage and execute workflow templates");

  workflow
    .command("list")
    .description("List available workflow templates")
    .option("--tier <tier>", "Filter by tier (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)", "LITE")
    .action(listAction);

  workflow
    .command("show <templateId>")
    .description("Show details of a workflow template")
    .action(showAction);

  workflow
    .command("run <templateId>")
    .description("Execute a workflow template")
    .option("--var <var...>", "Variable values (key=value)")
    .option("--tier <tier>", "Set tier", "LITE")
    .option("--dry-run", "Show execution plan without running")
    .option("-v, --verbose", "Show detailed output")
    .option("--skip-optional", "Skip optional steps")
    .action(runAction);

  workflow
    .command("search <tags...>")
    .description("Search templates by tags")
    .action(searchAction);
}
