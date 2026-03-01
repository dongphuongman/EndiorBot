/**
 * Compliance Command
 *
 * Check SDLC compliance for project structure and configuration.
 *
 * @module cli/commands/compliance
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import type { Command } from "commander";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "../../logging/index.js";
import { t } from "../../i18n/index.js";
import { fmt } from "../ui/format.js";
import {
  detectProject,
  TIER_STAGES,
  TIER_ROOT_FILES,
  type ProjectTier,
  type DetectionResult,
} from "../../sdlc/scaffold/index.js";

const logger = createLogger("compliance-command");

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register compliance command.
 */
export function registerComplianceCommand(program: Command): void {
  const compliance = program
    .command("compliance")
    .description("Check SDLC compliance for project");

  // compliance check
  compliance
    .command("check")
    .description("Check project compliance against SDLC requirements")
    .option("--path <path>", "Target directory", process.cwd())
    .option("--tier <tier>", "Expected tier (auto-detected if not specified)")
    .option("--strict", "Fail on any compliance issue")
    .option("--json", "Output as JSON")
    .action(async (options: ComplianceOptions) => {
      await executeComplianceCheck(options);
    });

  // compliance score (alias for check --json)
  compliance
    .command("score")
    .description("Show compliance score")
    .option("--path <path>", "Target directory", process.cwd())
    .action(async (options: { path: string }) => {
      await executeComplianceCheck({ ...options, json: false, showScoreOnly: true });
    });
}

// ============================================================================
// Types
// ============================================================================

interface ComplianceOptions {
  path: string;
  tier?: string;
  strict?: boolean;
  json?: boolean;
  showScoreOnly?: boolean;
}

interface ComplianceIssue {
  type: "missing_file" | "missing_stage" | "invalid_config" | "tier_mismatch";
  severity: "error" | "warning";
  message: string;
  file?: string;
  stage?: string;
}

interface ComplianceResult {
  passed: boolean;
  score: number;
  tier: ProjectTier;
  issues: ComplianceIssue[];
  checkedFiles: string[];
  checkedStages: string[];
  missingFiles: string[];
  missingStages: string[];
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute compliance check.
 */
async function executeComplianceCheck(options: ComplianceOptions): Promise<void> {
  const targetPath = resolve(options.path);

  logger.info("Starting compliance check", { path: targetPath });

  if (!options.json && !options.showScoreOnly) {
    console.log(fmt.info(t("compliance.checking")));
  }

  // Detect project
  const detection = detectProject(targetPath);

  // Determine tier
  const tier = determineTier(detection, options.tier);

  if (!tier) {
    if (options.json) {
      console.log(JSON.stringify({ passed: false, score: 0, error: "No tier detected" }));
    } else {
      console.error(fmt.error("Cannot determine project tier. Use --tier to specify."));
    }
    process.exit(1);
  }

  // Run compliance checks
  const result = checkCompliance(targetPath, detection, tier);

  // Output results
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.showScoreOnly) {
    displayScoreOnly(result);
  } else {
    displayResult(result, options.strict);
  }

  // Exit with error if strict mode and issues found
  if (options.strict && !result.passed) {
    process.exit(1);
  }
}

// ============================================================================
// Compliance Checks
// ============================================================================

/**
 * Run all compliance checks.
 */
function checkCompliance(
  projectPath: string,
  detection: DetectionResult,
  tier: ProjectTier
): ComplianceResult {
  const issues: ComplianceIssue[] = [];
  const checkedFiles: string[] = [];
  const checkedStages: string[] = [];
  const missingFiles: string[] = [];
  const missingStages: string[] = [];

  // Check root files
  const requiredFiles = TIER_ROOT_FILES[tier];
  for (const file of requiredFiles) {
    checkedFiles.push(file);
    const filePath = resolve(projectPath, file);
    if (!existsSync(filePath)) {
      missingFiles.push(file);
      issues.push({
        type: "missing_file",
        severity: "error",
        message: t("compliance.missing_file", { file }),
        file,
      });
    }
  }

  // Check stages
  const requiredStages = TIER_STAGES[tier];
  for (const stage of requiredStages) {
    checkedStages.push(stage);
    const stagePath = resolve(projectPath, "docs", stage);
    if (!existsSync(stagePath)) {
      missingStages.push(stage);
      issues.push({
        type: "missing_stage",
        severity: "error",
        message: t("compliance.missing_stage", { stage }),
        stage,
      });
    }
  }

  // Check config validity
  if (detection.state === "UNKNOWN") {
    issues.push({
      type: "invalid_config",
      severity: "error",
      message: "Invalid or unrecognized .sdlc-config.json format",
    });
  }

  // Check tier mismatch
  if (detection.configTier && detection.structureTier && detection.configTier !== detection.structureTier) {
    issues.push({
      type: "tier_mismatch",
      severity: "warning",
      message: t("init.tier_mismatch", {
        config: detection.configTier,
        docs: detection.structureTier,
      }),
    });
  }

  // Calculate score
  const totalChecks = checkedFiles.length + checkedStages.length;
  const passedChecks = totalChecks - missingFiles.length - missingStages.length;
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  const passed = issues.filter((i) => i.severity === "error").length === 0;

  return {
    passed,
    score,
    tier,
    issues,
    checkedFiles,
    checkedStages,
    missingFiles,
    missingStages,
  };
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Display compliance result.
 */
function displayResult(result: ComplianceResult, strict?: boolean): void {
  console.log();

  // Score
  const scoreColor = result.score >= 80 ? fmt.green : result.score >= 50 ? fmt.yellow : fmt.red;
  console.log(fmt.bold("Compliance Score: ") + scoreColor(`${result.score}%`));
  console.log(fmt.dim(`Tier: ${result.tier}`));
  console.log();

  // Issues
  if (result.issues.length > 0) {
    console.log(fmt.bold("Issues:"));
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      const colorFn = issue.severity === "error" ? fmt.red : fmt.yellow;
      console.log(`  ${icon} ${colorFn(issue.message)}`);
    }
    console.log();
  }

  // Summary
  if (result.passed) {
    console.log(fmt.success(t("compliance.passed")));
  } else {
    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    console.log(fmt.error(t("compliance.failed", { count: String(errorCount) })));

    if (!strict) {
      console.log();
      // Show appropriate fix command based on issue type
      const hasInvalidConfig = result.issues.some((i) => i.type === "invalid_config");
      if (hasInvalidConfig) {
        console.log("Run " + fmt.cyan("endiorbot init --force") + " to migrate config to EndiorBot format.");
      } else {
        console.log("Run " + fmt.cyan("endiorbot init") + " to fix missing files and stages.");
      }
    }
  }
}

/**
 * Display score only.
 */
function displayScoreOnly(result: ComplianceResult): void {
  const scoreColor = result.score >= 80 ? fmt.green : result.score >= 50 ? fmt.yellow : fmt.red;
  console.log(t("compliance.score", { score: scoreColor(String(result.score)) }));

  if (result.passed) {
    console.log(fmt.success("✓ " + t("compliance.passed")));
  } else {
    const errorCount = result.issues.filter((i) => i.severity === "error").length;
    console.log(fmt.error("✗ " + t("compliance.failed", { count: String(errorCount) })));
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Determine tier from detection or option.
 */
function determineTier(
  detection: DetectionResult,
  optionTier?: string
): ProjectTier | null {
  if (optionTier) {
    const normalized = optionTier.toUpperCase();
    if (["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"].includes(normalized)) {
      return normalized as ProjectTier;
    }
  }

  return detection.configTier ?? detection.structureTier ?? null;
}
