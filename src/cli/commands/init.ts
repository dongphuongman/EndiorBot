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
import {
  detectProject,
  scaffoldProject,
  createBackup,
  migrateConfig,
  writeMigratedConfig,
  type ProjectTier,
  type InitOptions,
  type InitResult,
  type DetectionResult,
} from "../../sdlc/scaffold/index.js";
import { saveActiveProject } from "../../config/paths.js";

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
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute init command.
 */
async function executeInit(
  projectName: string | undefined,
  options: InitCommandOptions
): Promise<void> {
  const startTime = Date.now();
  const targetPath = resolve(options.path);

  // Resolve project name
  const name = projectName ?? basename(targetPath);

  // Validate tier
  const tier = validateTier(options.tier);
  if (!tier) {
    console.error(fmt.error(t("init.invalid_tier", { tier: options.tier })));
    console.log("Valid tiers: LITE, STANDARD, PROFESSIONAL, ENTERPRISE");
    process.exit(1);
  }

  logger.info("Starting init", { name, tier, path: targetPath });

  // Step 1: Detect existing structure
  console.log(fmt.info("Detecting existing SDLC structure..."));
  const detection = detectProject(targetPath);

  // Display detection result
  displayDetectionResult(detection);

  // Step 2: Handle based on state
  const result = await handleProjectState(detection, {
    projectName: name,
    tier,
    path: targetPath,
    analyze: options.analyze ?? false,
    force: options.force ?? false,
    noScaffold: options.scaffold === false,
    refresh: options.refresh ?? false,
  });

  // Step 3: Display result
  displayResult(result, Date.now() - startTime);

  // Step 4: Save active project (if not dry-run)
  if (!options.analyze && result.created.length > 0) {
    try {
      saveActiveProject({
        name,
        path: targetPath,
        tier,
        startedAt: Date.now(),
      });
    } catch (error) {
      // Non-fatal - log and continue
      logger.debug("Failed to save active project state", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================================
// State Handlers
// ============================================================================

/**
 * Handle project based on detected state.
 */
async function handleProjectState(
  detection: DetectionResult,
  options: InitOptions
): Promise<InitResult> {
  const startTime = Date.now();

  switch (detection.state) {
    case "FRESH":
      return handleFreshProject(options, startTime);

    case "ENDIORBOT":
      return handleEndiorBotProject(detection, options, startTime);

    case "PARTIAL":
      return handlePartialProject(detection, options, startTime);

    case "TINYSDLC":
    case "SDLC_ORCHESTRATOR":
      return handleMigration(detection, options, startTime);

    case "UNKNOWN":
      if (options.force) {
        console.log(fmt.warning("Force mode - migrating unknown config to EndiorBot format..."));
        const backupPath = await createBackup(options.path!, detection.existingFiles);
        if (backupPath) {
          console.log(fmt.info(`Backup created: ${backupPath}`));
        }
        return handleFreshProject(options, startTime);
      }
      console.log(fmt.warning("Unknown config format detected."));
      console.log("Use --force to overwrite with EndiorBot structure.");
      return createEmptyResult(detection.state, options.tier!, startTime);

    default:
      return createEmptyResult(detection.state, options.tier!, startTime);
  }
}

/**
 * Handle fresh project (no SDLC files).
 */
async function handleFreshProject(
  options: InitOptions,
  startTime: number
): Promise<InitResult> {
  console.log(fmt.info("Fresh project - creating full scaffold..."));

  const spinner = options.analyze ? null : createSpinner("Scaffolding project...");

  const result = await scaffoldProject({
    projectName: options.projectName!,
    projectDescription: "",
    tier: options.tier!,
    targetPath: options.path!,
    dryRun: options.analyze ?? false,
    force: options.force ?? false,
  });

  spinner?.succeed("Scaffold complete");

  return {
    created: result.steps.filter((s) => s.status === "created").map((s) => s.path),
    updated: result.steps.filter((s) => s.status === "updated").map((s) => s.path),
    preserved: result.steps.filter((s) => s.status === "preserved").map((s) => s.path),
    skipped: result.steps.filter((s) => s.status === "skipped").map((s) => s.path),
    durationMs: Date.now() - startTime,
    detectedState: "FRESH",
    tier: options.tier!,
  };
}

/**
 * Handle existing EndiorBot project.
 */
async function handleEndiorBotProject(
  detection: DetectionResult,
  options: InitOptions,
  startTime: number
): Promise<InitResult> {
  if (options.force) {
    // Create backup before force
    console.log(fmt.warning("Force mode - creating backup..."));
    const backupPath = await createBackup(options.path!, detection.existingFiles);
    console.log(fmt.info(`Backup created: ${backupPath}`));

    return handleFreshProject(options, startTime);
  }

  if (options.refresh) {
    console.log(fmt.info("Refresh mode - updating managed sections..."));
    // Refresh logic will be in Sprint 61a-2
    console.log(fmt.warning("Refresh mode will be available in next update."));
  }

  // Default: Check if updates needed
  const missingFiles = detection.missingFiles;

  if (missingFiles.length === 0) {
    console.log(fmt.success("Project is up to date. No changes needed."));
    return {
      created: [],
      updated: [],
      preserved: detection.existingFiles,
      skipped: [],
      durationMs: Date.now() - startTime,
      detectedState: "ENDIORBOT",
      tier: detection.configTier ?? options.tier!,
    };
  }

  // Complete missing files
  console.log(fmt.info(`Found ${missingFiles.length} missing files. Completing...`));

  const result = await scaffoldProject({
    projectName: options.projectName!,
    tier: detection.configTier ?? options.tier!,
    targetPath: options.path!,
    dryRun: options.analyze ?? false,
    force: false,
  });

  return {
    created: result.steps.filter((s) => s.status === "created").map((s) => s.path),
    updated: result.steps.filter((s) => s.status === "updated").map((s) => s.path),
    preserved: result.steps.filter((s) => s.status === "preserved").map((s) => s.path),
    skipped: result.steps.filter((s) => s.status === "skipped").map((s) => s.path),
    durationMs: Date.now() - startTime,
    detectedState: "ENDIORBOT",
    tier: detection.configTier ?? options.tier!,
  };
}

/**
 * Handle partial project (has docs/ but no config).
 */
async function handlePartialProject(
  detection: DetectionResult,
  options: InitOptions,
  startTime: number
): Promise<InitResult> {
  // Use detected tier from docs/ or specified tier
  const tier = detection.structureTier ?? options.tier!;

  if (detection.structureTier && detection.structureTier !== options.tier) {
    console.log(fmt.warning(
      `Detected tier from docs/: ${detection.structureTier} (specified: ${options.tier})`
    ));
    console.log(fmt.info(`Using detected tier: ${tier}`));
  }

  console.log(fmt.info("Partial project - completing structure..."));

  const result = await scaffoldProject({
    projectName: options.projectName!,
    tier,
    targetPath: options.path!,
    dryRun: options.analyze ?? false,
    force: options.force ?? false,
  });

  return {
    created: result.steps.filter((s) => s.status === "created").map((s) => s.path),
    updated: result.steps.filter((s) => s.status === "updated").map((s) => s.path),
    preserved: result.steps.filter((s) => s.status === "preserved").map((s) => s.path),
    skipped: result.steps.filter((s) => s.status === "skipped").map((s) => s.path),
    durationMs: Date.now() - startTime,
    detectedState: "PARTIAL",
    tier,
  };
}

/**
 * Handle migration from tinysdlc or SDLC Orchestrator.
 */
async function handleMigration(
  detection: DetectionResult,
  options: InitOptions,
  startTime: number
): Promise<InitResult> {
  const source = detection.generator ?? detection.state.toLowerCase();
  console.log(fmt.warning(`Detected ${source} config - migrating to EndiorBot...`));

  // Perform migration
  const migrationOptions: Parameters<typeof migrateConfig>[1] = {
    createBackup: true,
    dryRun: options.analyze ?? false,
  };
  if (options.tier) migrationOptions.tier = options.tier;
  const migrationResult = await migrateConfig(detection, migrationOptions);

  if (!migrationResult.success || !migrationResult.config) {
    console.error(fmt.error(`Migration failed: ${migrationResult.error}`));
    console.log("Use --force to overwrite with fresh EndiorBot structure.");
    return createEmptyResult(detection.state, options.tier!, startTime);
  }

  // Show backup info
  if (migrationResult.backupPath) {
    console.log(fmt.info(`Backup created: ${migrationResult.backupPath}`));
  }

  // Write migrated config
  if (!options.analyze && detection.configPath) {
    await writeMigratedConfig(detection.configPath, migrationResult.config);
    console.log(fmt.success(`Config migrated from ${source}`));
  }

  // Now scaffold remaining structure
  console.log(fmt.info("Creating remaining scaffold structure..."));

  const tier = migrationResult.config.tier as ProjectTier;
  const scaffoldConfig: Parameters<typeof scaffoldProject>[0] = {
    projectName: migrationResult.config.project.name,
    tier,
    targetPath: options.path!,
    dryRun: options.analyze ?? false,
    force: false,
    detection, // Pass detection to avoid re-writing config
  };
  if (migrationResult.config.project.description) {
    scaffoldConfig.projectDescription = migrationResult.config.project.description;
  }
  const result = await scaffoldProject(scaffoldConfig);

  // Build result with config as updated
  const created = result.steps.filter((s) => s.status === "created").map((s) => s.path);
  const updated = result.steps.filter((s) => s.status === "updated").map((s) => s.path);
  const preserved = result.steps.filter((s) => s.status === "preserved").map((s) => s.path);
  const skipped = result.steps.filter((s) => s.status === "skipped").map((s) => s.path);

  // Add config to updated if it was migrated
  if (!options.analyze && detection.configPath && !updated.includes(detection.configPath)) {
    updated.push(detection.configPath);
  }

  return {
    created,
    updated,
    preserved,
    skipped,
    durationMs: Date.now() - startTime,
    detectedState: detection.state,
    tier,
    migrated: {
      from: source,
      originalConfig: detection.rawConfig,
    },
  };
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Display detection result.
 */
function displayDetectionResult(detection: DetectionResult): void {
  const stateColors: Record<string, (s: string) => string> = {
    FRESH: fmt.green,
    ENDIORBOT: fmt.cyan,
    PARTIAL: fmt.yellow,
    TINYSDLC: fmt.yellow,
    SDLC_ORCHESTRATOR: fmt.yellow,
    UNKNOWN: fmt.red,
  };

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

  console.log();
}

/**
 * Display init result.
 */
function displayResult(result: InitResult, totalMs: number): void {
  console.log();

  if (result.created.length > 0) {
    console.log(fmt.bold("Created:"));
    for (const file of result.created) {
      console.log(`  ${fmt.green("✅")} ${file}`);
    }
  }

  if (result.updated.length > 0) {
    console.log(fmt.bold("Updated:"));
    for (const file of result.updated) {
      console.log(`  ${fmt.blue("🔄")} ${file}`);
    }
  }

  if (result.preserved.length > 0 && result.preserved.length <= 5) {
    console.log(fmt.bold("Preserved:"));
    for (const file of result.preserved) {
      console.log(`  ${fmt.yellow("⏭️")} ${file}`);
    }
  } else if (result.preserved.length > 5) {
    console.log(fmt.dim(`Preserved: ${result.preserved.length} files`));
  }

  if (result.skipped.length > 0 && result.skipped.length <= 5) {
    console.log(fmt.bold("Skipped:"));
    for (const file of result.skipped) {
      console.log(`  ${fmt.gray("⏭️")} ${file}`);
    }
  } else if (result.skipped.length > 5) {
    console.log(fmt.dim(`Skipped: ${result.skipped.length} files (up to date)`));
  }

  console.log();

  const total = result.created.length + result.updated.length;
  if (total > 0) {
    console.log(fmt.success(`Project initialized! (${formatDuration(totalMs)})`));
    console.log();
    console.log("Next steps:");
    console.log("  1. Review IDENTITY.md and add project details");
    console.log("  2. Run: ./endiorbot.mjs compliance check");
    console.log("  3. Start Claude Code: claude .");
  } else {
    console.log(fmt.info(`No changes made. (${formatDuration(totalMs)})`));
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

/**
 * Create empty result for unsupported states.
 */
function createEmptyResult(
  state: string,
  tier: ProjectTier,
  startTime: number
): InitResult {
  return {
    created: [],
    updated: [],
    preserved: [],
    skipped: [],
    durationMs: Date.now() - startTime,
    detectedState: state as any,
    tier,
  };
}
