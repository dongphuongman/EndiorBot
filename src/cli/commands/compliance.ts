/**
 * Compliance Command
 *
 * Check SDLC compliance for project structure (L1) and content quality (L2).
 *
 * L1: File/directory existence (structure)
 * L2: Content quality (placeholder detection, min content, required artifacts)
 *
 * @module cli/commands/compliance
 * @version 1.1.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 73 (L2 added, BUG-011 fix)
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
import { resolveActiveProjectDir } from "../../config/paths.js";
import { checkL2Compliance, type L2Result } from "../../sdlc/compliance/index.js";

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
    .option("--path <path>", "Target directory")
    .option("--tier <tier>", "Expected tier (auto-detected if not specified)")
    .option("--level <level>", "Compliance level: L1 (structure) or L2 (content)", "L2")
    .option("--strict", "Fail on any compliance issue")
    .option("--json", "Output as JSON")
    .action(async (options: ComplianceOptions) => {
      if (!options.path) {
        options.path = resolveActiveProjectDir();
      }
      await executeComplianceCheck(options);
    });

  // compliance score
  compliance
    .command("score")
    .description("Show compliance score (L1 structure + L2 content)")
    .option("--path <path>", "Target directory")
    .option("--level <level>", "Compliance level: L1 (structure) or L2 (content)", "L2")
    .action(async (options: { path: string; level?: string }) => {
      if (!options.path) {
        options.path = resolveActiveProjectDir();
      }
      await executeComplianceCheck({ ...options, json: false, showScoreOnly: true });
    });
}

// ============================================================================
// Types
// ============================================================================

type ComplianceLevel = "L1" | "L2";

interface ComplianceOptions {
  path: string;
  tier?: string;
  level?: string;
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
  l2Score?: number;
  l2Result?: L2Result;
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
function parseLevel(level?: string): ComplianceLevel {
  if (!level) return "L2";
  const normalized = level.toUpperCase();
  if (normalized === "L1" || normalized === "L2") return normalized;
  return "L2";
}

async function executeComplianceCheck(options: ComplianceOptions): Promise<void> {
  const targetPath = resolve(options.path);
  const level = parseLevel(options.level);

  logger.info("Starting compliance check", { path: targetPath, level });

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

  // Run L1 compliance checks
  const result = checkCompliance(targetPath, detection, tier);

  // Run L2 content checks if requested
  if (level === "L2") {
    const requiredStages = TIER_STAGES[tier];
    const l2Result = checkL2Compliance(targetPath, requiredStages, tier);
    result.l2Score = l2Result.score;
    result.l2Result = l2Result;
    // L2 score < 50% means content is insufficient — mark as not passed
    if (l2Result.score < 50) {
      result.passed = false;
    }
  }

  // Output results
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.showScoreOnly) {
    displayScoreOnly(result, level);
  } else {
    displayResult(result, options.strict, level);
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
function displayResult(result: ComplianceResult, strict?: boolean, level: ComplianceLevel = "L2"): void {
  console.log();

  // L1 Score
  const l1Color = result.score >= 80 ? fmt.green : result.score >= 50 ? fmt.yellow : fmt.red;
  console.log(fmt.bold("L1 Structure: ") + l1Color(`${result.score}%`));

  // L2 Score (if available)
  if (level === "L2" && result.l2Score !== undefined) {
    const l2Color = result.l2Score >= 80 ? fmt.green : result.l2Score >= 50 ? fmt.yellow : fmt.red;
    console.log(fmt.bold("L2 Content:   ") + l2Color(`${result.l2Score}%`));
  }

  console.log(fmt.dim(`Tier: ${result.tier}`));
  console.log();

  // L1 Issues
  if (result.issues.length > 0) {
    console.log(fmt.bold("L1 Issues:"));
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      const colorFn = issue.severity === "error" ? fmt.red : fmt.yellow;
      console.log(`  ${icon} ${colorFn(issue.message)}`);
    }
    console.log();
  }

  // L2 Issues
  if (level === "L2" && result.l2Result && result.l2Result.issues.length > 0) {
    console.log(fmt.bold("L2 Issues:"));
    for (const issue of result.l2Result.issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      const colorFn = issue.severity === "error" ? fmt.red : fmt.yellow;
      console.log(`  ${icon} ${colorFn(issue.message)}`);
    }
    console.log();
  }

  // Summary
  const l1Errors = result.issues.filter((i) => i.severity === "error").length;
  const l2Failed = level === "L2" && result.l2Score !== undefined && result.l2Score < 50;

  if (result.passed) {
    console.log(fmt.success(t("compliance.passed")));
  } else if (l1Errors > 0) {
    console.log(fmt.error(t("compliance.failed", { count: String(l1Errors) })));

    if (!strict) {
      console.log();
      const hasInvalidConfig = result.issues.some((i) => i.type === "invalid_config");
      if (hasInvalidConfig) {
        console.log("Run " + fmt.cyan("endiorbot init --force") + " to migrate config to EndiorBot format.");
      } else {
        console.log("Run " + fmt.cyan("endiorbot init") + " to fix missing files and stages.");
      }
    }
  } else if (l2Failed) {
    const l2Issues = result.l2Result?.issues.length ?? 0;
    console.log(fmt.error(`L2 content check failed (${l2Issues} issues). Stage docs need real content.`));
  }
}

/**
 * Display score only.
 */
function displayScoreOnly(result: ComplianceResult, level: ComplianceLevel = "L2"): void {
  const l1Color = result.score >= 80 ? fmt.green : result.score >= 50 ? fmt.yellow : fmt.red;

  if (level === "L2" && result.l2Score !== undefined) {
    const l2Color = result.l2Score >= 80 ? fmt.green : result.l2Score >= 50 ? fmt.yellow : fmt.red;
    console.log(`L1: ${l1Color(String(result.score))}% (structure) | L2: ${l2Color(String(result.l2Score))}% (content)`);
  } else {
    console.log(t("compliance.score", { score: l1Color(String(result.score)) }));
  }

  if (result.passed) {
    console.log(fmt.success("✓ " + t("compliance.passed")));
  } else {
    const l1Errors = result.issues.filter((i) => i.severity === "error").length;
    if (l1Errors > 0) {
      console.log(fmt.error("✗ " + t("compliance.failed", { count: String(l1Errors) })));
    } else {
      console.log(fmt.error("✗ L2 content insufficient — stage docs need real content"));
    }
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
