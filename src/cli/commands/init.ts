/**
 * Init Command
 *
 * Initialize project with SDLC structure and AI governance files.
 *
 * @module cli/commands/init
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import type { Command } from "commander";
import { resolve, basename } from "node:path";
import { createLogger } from "../../logging/index.js";
import { t } from "../../i18n/index.js";
import { fmt, formatDuration } from "../ui/format.js";
import { createSpinner } from "../ui/progress.js";
import type { ProjectTier } from "../../sdlc/scaffold/index.js";
import { saveActiveProject } from "../../config/paths.js";
import { executeInitCommand, type ExecuteInitResult, type ExecuteInitOptions } from "../../commands/handlers.js";

const logger = createLogger("init-command");

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register init command.
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init [project-name]")
    .description("Initialize project with SDLC + AI governance files")
    .option("--tier <tier>", "Project tier (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)", "STANDARD")
    .option("--path <path>", "Target directory", process.cwd())
    .option("--analyze", "Show preview without writing (dry-run)")
    .option("--force", "Overwrite existing files (creates backup)")
    .option("--no-scaffold", "Skip docs/ structure creation")
    .option("--refresh", "Update EndiorBot-managed sections only")
    .option("--skip-analysis", "Skip codebase analysis, use generic placeholders")
    .action(async (projectName: string | undefined, options: InitCommandOptions) => {
      // If projectName looks like a path, use it as --path instead
      if (projectName && (projectName.startsWith("/") || projectName.startsWith("./") || projectName.startsWith("../"))) {
        options.path = projectName;
        projectName = undefined;
      }
      await executeInit(projectName, options);
    });
}

// ============================================================================
// Types
// ============================================================================

interface InitCommandOptions {
  tier: string;
  path: string;
  analyze?: boolean;
  force?: boolean;
  scaffold?: boolean;
  refresh?: boolean;
  skipAnalysis?: boolean;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute init command — CLI wrapper around shared executeInitCommand().
 *
 * Adds CLI-specific UX: spinners, colored output, process.exit.
 * Core logic lives in executeInitCommand() (commands/handlers.ts).
 * Sprint 102: Unified Command Architecture.
 */
async function executeInit(
  projectName: string | undefined,
  options: InitCommandOptions
): Promise<void> {
  const targetPath = resolve(options.path);
  const name = projectName ?? basename(targetPath);

  // Validate tier
  const tier = validateTier(options.tier);
  if (!tier) {
    console.error(fmt.error(t("init.invalid_tier", { tier: options.tier })));
    console.log("Valid tiers: LITE, STANDARD, PROFESSIONAL, ENTERPRISE");
    process.exit(1);
  }

  logger.info("Starting init", { name, tier, path: targetPath });

  // Show analysis spinner
  const analysisSpinner = (!options.skipAnalysis && !options.analyze)
    ? createSpinner("Analyzing codebase...")
    : null;

  // Call shared init command (exactOptionalPropertyTypes: build opts conditionally)
  const initOpts: ExecuteInitOptions = { projectName: name, tier, targetPath };
  if (options.force) initOpts.force = options.force;
  if (options.analyze) initOpts.analyze = options.analyze;
  if (options.skipAnalysis) initOpts.skipAnalysis = options.skipAnalysis;
  const result = await executeInitCommand(initOpts);

  // Show analysis result
  if (analysisSpinner) {
    if (result.techStackSummary) {
      analysisSpinner.succeed(result.techStackSummary);
    } else {
      analysisSpinner.warn("Codebase analysis failed — using generic placeholders");
    }
  }

  // Display detection result
  displayDetectionResult(result);

  // Display progress messages
  for (const msg of result.messages) {
    if (!msg.startsWith("Tech stack:") && !msg.startsWith("Codebase analysis")) {
      console.log(fmt.info(msg));
    }
  }

  if (!result.success) {
    console.error(fmt.error(result.error ?? "Init failed"));
    if (result.error?.includes("--force")) {
      console.log("Use --force to overwrite with EndiorBot structure.");
    }
    return;
  }

  // Display step results
  displayStepResult(result);

  // Save active project (if not dry-run)
  const createdCount = result.steps.filter((s) => s.status === "created").length;
  if (!options.analyze && createdCount > 0) {
    try {
      saveActiveProject({
        name,
        path: targetPath,
        tier: result.tier as ProjectTier,
        startedAt: Date.now(),
      });
    } catch (error) {
      logger.debug("Failed to save active project state", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================================
// Display Functions (CLI-specific formatting)
// ============================================================================

/**
 * Display detection result from shared ExecuteInitResult.
 */
function displayDetectionResult(result: ExecuteInitResult): void {
  const detection = result.detection;
  const stateColors: Record<string, (s: string) => string> = {
    FRESH: fmt.green,
    ENDIORBOT: fmt.cyan,
    PARTIAL: fmt.yellow,
    TINYSDLC: fmt.yellow,
    SDLC_ORCHESTRATOR: fmt.yellow,
    UNKNOWN: fmt.red,
  };

  console.log(fmt.info("Detecting existing SDLC structure..."));

  const colorFn = stateColors[detection.state] ?? fmt.gray;
  console.log(`   Status: ${colorFn(detection.state)}`);

  if (detection.generator) {
    console.log(`   Generator: ${detection.generator}@${detection.generatorVersion ?? "unknown"}`);
  }

  if (detection.configTier) {
    console.log(`   Tier (config): ${detection.configTier}`);
  }

  if (detection.structureTier) {
    console.log(`   Tier (docs/): ${detection.structureTier}`);
  }

  if (detection.existingFiles.length > 0) {
    console.log(`   Existing files: ${detection.existingFiles.length}`);
  }

  console.log(`   Selected tier: ${result.tier} (${result.tierSource})`);
  console.log();
}

/**
 * Display step results from shared ExecuteInitResult.
 */
function displayStepResult(result: ExecuteInitResult): void {
  console.log();

  const created = result.steps.filter((s) => s.status === "created");
  const updated = result.steps.filter((s) => s.status === "updated");
  const preserved = result.steps.filter((s) => s.status === "preserved");
  const skipped = result.steps.filter((s) => s.status === "skipped");

  if (created.length > 0) {
    console.log(fmt.bold("Created:"));
    for (const step of created) {
      console.log(`  ${fmt.green("+")} ${step.path}`);
    }
  }

  if (updated.length > 0) {
    console.log(fmt.bold("Updated:"));
    for (const step of updated) {
      console.log(`  ${fmt.blue("~")} ${step.path}`);
    }
  }

  if (preserved.length > 0 && preserved.length <= 5) {
    console.log(fmt.bold("Preserved:"));
    for (const step of preserved) {
      console.log(`  ${fmt.yellow("-")} ${step.path}`);
    }
  } else if (preserved.length > 5) {
    console.log(fmt.dim(`Preserved: ${preserved.length} files`));
  }

  if (skipped.length > 0 && skipped.length <= 5) {
    console.log(fmt.bold("Skipped:"));
    for (const step of skipped) {
      console.log(`  ${fmt.gray("-")} ${step.path}`);
    }
  } else if (skipped.length > 5) {
    console.log(fmt.dim(`Skipped: ${skipped.length} files (up to date)`));
  }

  console.log();

  const total = created.length + updated.length;
  if (total > 0) {
    console.log(fmt.success(`Project initialized! (${formatDuration(result.durationMs)})`));
    console.log();
    console.log("Next steps:");
    console.log("  1. Review IDENTITY.md and add project details");
    console.log("  2. Run: ./endiorbot.mjs compliance check");
    console.log("  3. Start Claude Code: claude .");
  } else {
    console.log(fmt.info(`No changes made. (${formatDuration(result.durationMs)})`));
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate tier option.
 */
function validateTier(tier: string): ProjectTier | null {
  const normalized = tier.toUpperCase();
  if (["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"].includes(normalized)) {
    return normalized as ProjectTier;
  }
  return null;
}

