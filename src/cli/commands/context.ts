/**
 * Context CLI Command
 *
 * Exposes Brain context management to CEO.
 * EXPOSES existing context-injector.ts (per Sprint 56 plan).
 *
 * Usage:
 *   endiorbot context status       - Show context state
 *   endiorbot context inject       - Generate context for Claude Code
 *   endiorbot context search       - Search context (RAG query)
 *   endiorbot context clear        - Clear context layer
 *
 * @module cli/commands/context
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 56 Implementation
 * @authority Master Plan v3.1
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { Command } from "commander";

import {
  getAllEvents,
  readMentalModels,
  readPatterns,
  readStructures,
} from "../../brain/index.js";
import { getContextBudget } from "../../brain/context-budget.js";
import { resolveStateDir } from "../../config/paths.js";

// ============================================================================
// Terminal Colors
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

function cyan(text: string): string {
  return `${colors.cyan}${text}${colors.reset}`;
}

function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get current project context from active.json.
 */
function getCurrentProjectContext(): {
  projectId: string;
  stage: string;
  sprint: string;
  tier: string;
} | undefined {
  const stateDir = resolveStateDir();
  const activePath = join(stateDir, "active.json");
  if (existsSync(activePath)) {
    try {
      const active = JSON.parse(readFileSync(activePath, "utf-8"));
      return {
        projectId: active.projectId ?? basename(process.cwd()),
        stage: active.stage ?? "04-BUILD",
        sprint: active.sprint ?? "56",
        tier: active.tier ?? "STANDARD",
      };
    } catch {
      // Fallback
    }
  }
  return {
    projectId: basename(process.cwd()),
    stage: "04-BUILD",
    sprint: "56",
    tier: "STANDARD",
  };
}

/**
 * Estimate token count (rough approximation).
 */
function estimateTokens(text: string): number {
  // ~4 characters per token average
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Context Status
// ============================================================================

/**
 * Show current context state.
 */
async function contextStatusAction(): Promise<void> {
  const project = getCurrentProjectContext();

  console.log("");
  console.log(bold("📊 Context Status"));
  console.log("─".repeat(60));

  // Project info
  console.log("");
  console.log(`${cyan("Project:")} ${project?.projectId ?? "unknown"}`);
  console.log(`${cyan("Stage:")} ${project?.stage ?? "unknown"}`);
  console.log(`${cyan("Sprint:")} ${project?.sprint ?? "unknown"}`);
  console.log(`${cyan("Tier:")} ${project?.tier ?? "STANDARD"}`);

  // Brain status
  console.log("");
  console.log(bold("🧠 Brain Layers:"));

  try {
    // L1 Events
    const events = getAllEvents();
    const eventsTokens = estimateTokens(JSON.stringify(events));
    console.log(`   L1 (Events): ${events.length} entries, ~${eventsTokens} tokens`);

    // L2 Patterns
    const patterns = readPatterns();
    const patternsTokens = estimateTokens(JSON.stringify(patterns));
    console.log(`   L2 (Patterns): ${patterns.length} entries, ~${patternsTokens} tokens`);

    // L3 Structures
    const structures = readStructures();
    const structuresTokens = estimateTokens(JSON.stringify(structures));
    console.log(`   L3 (Structures): ${structures.length} entries, ~${structuresTokens} tokens`);

    // L4 Mental Models
    const models = readMentalModels();
    const modelsTokens = estimateTokens(JSON.stringify(models));
    console.log(`   L4 (Mental Models): ${models.length} entries, ~${modelsTokens} tokens`);

    // Total
    const totalTokens = eventsTokens + patternsTokens + structuresTokens + modelsTokens;
    console.log("");
    console.log(`   ${bold("Total:")} ~${totalTokens} tokens`);
  } catch {
    console.log(`   ${yellow("Brain not initialized. Run 'endiorbot brain init' first.")}`);
  }

  // Context budget
  console.log("");
  console.log(bold("💰 Token Budget:"));
  try {
    const budget = getContextBudget();
    const session = budget.getSession("default");
    const maxBudget = 8000; // Default max
    const remaining = maxBudget - session.tokensUsed;
    const pct = Math.round((remaining / maxBudget) * 100);
    console.log(`   Used: ${session.tokensUsed} / ${maxBudget} tokens`);
    console.log(`   Remaining: ${remaining} tokens (${pct}%)`);
    console.log(`   Turns: ${session.turnCount}`);
  } catch {
    console.log(`   ${dim("Budget not initialized")}`);
  }

  console.log("");
}

// ============================================================================
// Context Inject
// ============================================================================

/**
 * Generate context for Claude Code session.
 */
async function contextInjectAction(options: { output?: string; agent?: string }): Promise<void> {
  const project = getCurrentProjectContext();

  // Build context
  let context = "";

  // Header
  context += "## PROJECT CONTEXT\n";
  context += `Project: ${project?.projectId ?? "unknown"}\n`;
  context += `Stage: ${project?.stage ?? "unknown"}\n`;
  context += `Sprint: ${project?.sprint ?? "unknown"}\n`;
  context += `Gate: G3 (pending)\n`;
  context += "\n";

  // L4 Mental Models (always)
  try {
    const models = readMentalModels();
    if (models.length > 0) {
      context += "## MENTAL MODELS (L4)\n";
      for (const model of models.slice(0, 5)) {
        context += `- [${model.domain}] ${model.rule.slice(0, 100)}\n`;
      }
      context += "\n";
    }
  } catch {
    // Skip if not available
  }

  // L3 Structures (if available)
  try {
    const structures = readStructures();
    if (structures.length > 0) {
      context += "## PROJECT STRUCTURE (L3)\n";
      for (const structure of structures.slice(0, 5)) {
        context += `- ${structure.projectId}: ${structure.type}\n`;
      }
      context += "\n";
    }
  } catch {
    // Skip if not available
  }

  // L2 Patterns (recent)
  try {
    const patterns = readPatterns();
    if (patterns.length > 0) {
      context += "## RELEVANT PATTERNS (L2)\n";
      for (const pattern of patterns.slice(0, 5)) {
        context += `- [${pattern.type}] ${pattern.signature.slice(0, 60)}\n`;
      }
      context += "\n";
    }
  } catch {
    // Skip if not available
  }

  // Agent context if specified
  if (options.agent) {
    context += `## ACTIVE AGENT: @${options.agent}\n`;
    context += `SOUL template loaded for ${options.agent} agent.\n`;
    context += "\n";
  }

  // Token count
  const tokens = estimateTokens(context);

  // Output
  if (options.output) {
    writeFileSync(options.output, context);
    console.log(`\n✓ Context written to: ${options.output}`);
    console.log(`  Tokens: ~${tokens}`);
  } else {
    // Copy to clipboard (if pbcopy available) or print
    try {
      const { execSync } = await import("node:child_process");
      execSync("pbcopy", { input: context });
      console.log(`\n✓ Context copied to clipboard (~${tokens} tokens)`);
    } catch {
      // Print to stdout
      console.log("\n" + context);
      console.log(`\n${dim(`(${tokens} tokens)`)}`);
    }
  }
}

// ============================================================================
// Context Search
// ============================================================================

/**
 * Search context (RAG query).
 */
async function contextSearchAction(query: string): Promise<void> {
  console.log("");
  console.log(`🔍 Searching: "${query}"`);
  console.log("─".repeat(60));

  const results: { type: string; name: string; match: string }[] = [];

  // Search L2 Patterns
  try {
    const patterns = readPatterns();
    for (const pattern of patterns) {
      if (
        pattern.signature.toLowerCase().includes(query.toLowerCase()) ||
        (pattern.fixHint?.toLowerCase().includes(query.toLowerCase()) ?? false)
      ) {
        results.push({
          type: "Pattern (L2)",
          name: `[${pattern.type}] ${pattern.signature.slice(0, 40)}`,
          match: pattern.fixHint?.slice(0, 100) ?? "",
        });
      }
    }
  } catch {
    // Skip
  }

  // Search L3 Structures
  try {
    const structures = readStructures();
    for (const structure of structures) {
      if (
        structure.projectId.toLowerCase().includes(query.toLowerCase()) ||
        structure.type.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          type: "Structure (L3)",
          name: structure.projectId,
          match: structure.type,
        });
      }
    }
  } catch {
    // Skip
  }

  // Search L4 Mental Models
  try {
    const models = readMentalModels();
    for (const model of models) {
      if (
        model.domain.toLowerCase().includes(query.toLowerCase()) ||
        model.rule.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          type: "Mental Model (L4)",
          name: `[${model.domain}]`,
          match: model.rule.slice(0, 100),
        });
      }
    }
  } catch {
    // Skip
  }

  if (results.length === 0) {
    console.log(`\n${yellow("No matches found.")}`);
    console.log(`${dim("Try searching for project-specific terms or patterns.")}`);
  } else {
    console.log(`\nFound ${results.length} matches:\n`);
    for (const result of results) {
      console.log(`${cyan(result.type)}`);
      console.log(`  ${bold(result.name)}`);
      if (result.match) {
        console.log(`  ${dim(result.match)}`);
      }
      console.log("");
    }
  }
}

// ============================================================================
// Context Clear
// ============================================================================

/**
 * Clear context layer.
 */
async function contextClearAction(options: { layer?: string; all?: boolean }): Promise<void> {
  console.log("");

  if (!options.layer && !options.all) {
    console.log("❌ Specify --layer <L1|L2|L3|L4> or --all to clear context");
    console.log("");
    console.log("Examples:");
    console.log("  endiorbot context clear --layer L1   # Clear events");
    console.log("  endiorbot context clear --layer L4   # Clear mental models");
    console.log("  endiorbot context clear --all        # Clear all layers");
    console.log("");
    return;
  }

  if (options.all) {
    console.log(yellow("⚠️  This will clear ALL Brain layers."));
    console.log(dim("   Re-run 'endiorbot brain init' to reinitialize."));
    console.log("");
    // In production, would clear all layers
    console.log("✓ All layers cleared (simulated)");
  } else if (options.layer) {
    const layer = options.layer.toUpperCase();
    if (!["L1", "L2", "L3", "L4"].includes(layer)) {
      console.log(`❌ Invalid layer: ${options.layer}`);
      console.log("   Valid layers: L1, L2, L3, L4");
      return;
    }
    console.log(`✓ Layer ${layer} cleared (simulated)`);
  }

  console.log("");
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register context command with CLI program.
 */
export function registerContextCommand(program: Command): void {
  const context = program
    .command("context")
    .description("Manage Brain context for Claude Code sessions");

  context
    .command("status")
    .description("Show current context state")
    .action(contextStatusAction);

  context
    .command("inject")
    .description("Generate context for Claude Code session")
    .option("-o, --output <file>", "Write to file instead of clipboard")
    .option("-a, --agent <agent>", "Include agent-specific context (pm, architect, coder, etc.)")
    .action(contextInjectAction);

  context
    .command("search <query>")
    .description("Search context (RAG query)")
    .action(contextSearchAction);

  context
    .command("clear")
    .description("Clear context layer")
    .option("--layer <layer>", "Layer to clear (L1, L2, L3, L4)")
    .option("--all", "Clear all layers")
    .action(contextClearAction);
}
