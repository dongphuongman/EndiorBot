/**
 * Stage Contract Engine
 *
 * Evaluates stage contracts and enforces SDLC compliance.
 *
 * @module sdlc/contracts/stage-contract-engine
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2, Sprint 68 T1.2, T1.4
 * @sprint 68
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger, type Logger } from "../../logging/index.js";
import {
  type SDLCStage,
  type StageContract,
  type StageContractEngineConfig,
  type ContractEvaluation,
  type ArtifactEvaluation,
  type ValidationResult,
  type ArtifactRequirement,
  type ValidationRule,
  SDLC_STAGES,
  isValidStage,
} from "./types.js";
import { getStageContract } from "./defaults.js";

// ============================================================================
// Glob Matching (Simple Implementation)
// ============================================================================

/**
 * Simple glob pattern matching.
 * Supports: *, **, ?, {a,b,c}
 */
function matchGlob(pattern: string, filePath: string): boolean {
  // Step 1: Use placeholders for complex patterns
  let regex = pattern
    .replace(/\{([^}]+)\}/g, (_, alts: string) => `<<ALT:${alts}>>`)
    .replace(/\*\*\//g, "<<GLOBSTAR_SLASH>>")
    .replace(/\*\*/g, "<<GLOBSTAR>>");

  // Step 2: Escape dots
  regex = regex.replace(/\./g, "\\.");

  // Step 3: Convert simple glob patterns
  regex = regex
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");

  // Step 4: Restore placeholders
  regex = regex
    .replace(/<<GLOBSTAR_SLASH>>/g, "(?:.*/)?")
    .replace(/<<GLOBSTAR>>/g, ".*")
    .replace(/<<ALT:([^>]+)>>/g, (_, alts: string) => `(${alts.split(",").join("|")})`);

  try {
    const re = new RegExp(`^${regex}$`);
    return re.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Find files matching a glob pattern.
 */
async function findFiles(
  rootDir: string,
  pattern: string,
  maxDepth: number = 10
): Promise<string[]> {
  const matches: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip common non-relevant directories
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === ".git" ||
          entry.name.startsWith(".")
        ) {
          continue;
        }

        const fullPath = join(dir, entry.name);
        const relativePath = fullPath.slice(rootDir.length + 1);

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (matchGlob(pattern, relativePath)) {
            matches.push(relativePath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  await walk(rootDir, 0);
  return matches;
}

// ============================================================================
// Stage Contract Engine
// ============================================================================

/**
 * Engine for evaluating stage contracts.
 *
 * @example
 * ```typescript
 * const engine = new StageContractEngine({
 *   projectRoot: '/path/to/project',
 * });
 *
 * const evaluation = await engine.evaluate('04-BUILD');
 * console.log(evaluation.status); // 'pass' | 'warning' | 'fail'
 * ```
 */
export class StageContractEngine {
  private readonly config: StageContractEngineConfig;
  private readonly log: Logger;
  private contracts: Map<SDLCStage, StageContract>;

  constructor(config: StageContractEngineConfig) {
    this.config = {
      strictMode: false,
      verbose: false,
      ...config,
    };
    this.log = createLogger("StageContractEngine");
    this.contracts = new Map();

    // Load default contracts
    this.loadDefaultContracts();

    // Apply custom contracts
    if (config.customContracts) {
      this.applyCustomContracts(config.customContracts);
    }
  }

  /**
   * Load default contracts for all stages.
   */
  private loadDefaultContracts(): void {
    for (const stage of SDLC_STAGES) {
      this.contracts.set(stage, getStageContract(stage));
    }
  }

  /**
   * Apply custom contract overrides.
   */
  private applyCustomContracts(
    customContracts: Partial<Record<SDLCStage, Partial<StageContract>>>
  ): void {
    for (const [stage, custom] of Object.entries(customContracts)) {
      if (isValidStage(stage)) {
        const existing = this.contracts.get(stage);
        if (existing && custom) {
          this.contracts.set(stage, { ...existing, ...custom });
        }
      }
    }
  }

  /**
   * Get the contract for a stage.
   */
  getContract(stage: SDLCStage): StageContract | undefined {
    return this.contracts.get(stage);
  }

  /**
   * Get all contracts.
   */
  getAllContracts(): StageContract[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Evaluate a stage contract.
   */
  async evaluate(stage: SDLCStage): Promise<ContractEvaluation> {
    const startTime = Date.now();

    const contract = this.contracts.get(stage);
    if (!contract) {
      throw new Error(`No contract found for stage: ${stage}`);
    }

    if (this.config.verbose) {
      this.log.info(`Evaluating contract for stage: ${stage}`);
    }

    // Evaluate artifacts
    const artifactResults = await this.evaluateArtifacts(contract.required);

    // Evaluate validations
    const validationResults = await this.evaluateValidations(
      contract.validation
    );

    // Calculate status and score
    const { status, score, missingArtifacts, warnings, errors } =
      this.calculateStatus(artifactResults, validationResults);

    const evaluation: ContractEvaluation = {
      stage,
      contract,
      status,
      score,
      artifacts: artifactResults,
      validations: validationResults,
      missingArtifacts,
      warnings,
      errors,
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    if (this.config.verbose) {
      this.log.info(`Evaluation complete: ${status} (${score}%)`, {
        stage,
        durationMs: evaluation.durationMs,
      });
    }

    return evaluation;
  }

  /**
   * Evaluate all stages.
   */
  async evaluateAll(): Promise<ContractEvaluation[]> {
    const evaluations: ContractEvaluation[] = [];

    for (const stage of SDLC_STAGES) {
      try {
        const evaluation = await this.evaluate(stage);
        evaluations.push(evaluation);
      } catch (error) {
        this.log.warn(`Failed to evaluate stage: ${stage}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return evaluations;
  }

  /**
   * Check if a stage transition is allowed.
   */
  async canTransition(
    fromStage: SDLCStage,
    _toStage: SDLCStage
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Evaluate current stage
    const evaluation = await this.evaluate(fromStage);

    // In strict mode, only 'pass' allows transition
    if (this.config.strictMode && evaluation.status !== "pass") {
      return {
        allowed: false,
        reason: `Stage ${fromStage} has status '${evaluation.status}'. Fix issues before transitioning.`,
      };
    }

    // In non-strict mode, 'fail' blocks transition
    if (evaluation.status === "fail") {
      return {
        allowed: false,
        reason: `Stage ${fromStage} has failed. Errors: ${evaluation.errors.join(", ")}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Evaluate artifact requirements.
   */
  private async evaluateArtifacts(
    requirements: ArtifactRequirement[]
  ): Promise<ArtifactEvaluation[]> {
    const results: ArtifactEvaluation[] = [];

    for (const req of requirements) {
      const matchedFiles = await findFiles(this.config.projectRoot, req.pattern);
      const satisfied =
        req.optional || matchedFiles.length >= req.minCount;

      // Build result object (exactOptionalPropertyTypes compliant)
      const evaluation: ArtifactEvaluation = {
        requirement: req,
        satisfied,
        matchedFiles,
        matchCount: matchedFiles.length,
      };
      if (!satisfied) {
        evaluation.reason = `Expected at least ${req.minCount} file(s) matching '${req.pattern}', found ${matchedFiles.length}`;
      }
      results.push(evaluation);
    }

    return results;
  }

  /**
   * Evaluate validation rules.
   */
  private async evaluateValidations(
    rules: ValidationRule[]
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateRule(rule);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single validation rule.
   */
  private async evaluateRule(rule: ValidationRule): Promise<ValidationResult> {
    switch (rule.type) {
      case "file_exists": {
        const files = await findFiles(this.config.projectRoot, rule.pattern);
        const passed = files.length > 0;
        return {
          rule,
          passed,
          actualValue: files.length,
          message: passed
            ? `Found ${files.length} file(s) matching '${rule.pattern}'`
            : rule.message,
        };
      }

      case "min_count": {
        const files = await findFiles(this.config.projectRoot, rule.pattern);
        const threshold = rule.threshold ?? 1;
        const passed = files.length >= threshold;
        return {
          rule,
          passed,
          actualValue: files.length,
          expectedValue: threshold,
          message: passed
            ? `Found ${files.length} file(s), minimum is ${threshold}`
            : rule.message,
        };
      }

      case "content_match":
      case "dependency_check":
      case "coverage_threshold":
      case "custom":
      default:
        // Not implemented yet
        return {
          rule,
          passed: true,
          message: `Validation type '${rule.type}' not yet implemented`,
        };
    }
  }

  /**
   * Calculate overall status and score from results.
   */
  private calculateStatus(
    artifacts: ArtifactEvaluation[],
    validations: ValidationResult[]
  ): {
    status: "pass" | "warning" | "fail";
    score: number;
    missingArtifacts: string[];
    warnings: string[];
    errors: string[];
  } {
    const missingArtifacts: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check artifacts
    for (const artifact of artifacts) {
      if (!artifact.satisfied) {
        if (artifact.requirement.optional) {
          warnings.push(
            `Optional artifact missing: ${artifact.requirement.pattern}`
          );
        } else {
          errors.push(
            `Required artifact missing: ${artifact.requirement.pattern}`
          );
          missingArtifacts.push(artifact.requirement.pattern);
        }
      }
    }

    // Check validations
    for (const validation of validations) {
      if (!validation.passed) {
        if (validation.rule.severity === "error") {
          errors.push(validation.message);
        } else if (validation.rule.severity === "warning") {
          warnings.push(validation.message);
        }
      }
    }

    // Calculate score
    const totalChecks = artifacts.length + validations.length;
    if (totalChecks === 0) {
      return {
        status: "pass",
        score: 100,
        missingArtifacts,
        warnings,
        errors,
      };
    }

    const passedArtifacts = artifacts.filter((a) => a.satisfied).length;
    const passedValidations = validations.filter((v) => v.passed).length;
    const score = Math.round(
      ((passedArtifacts + passedValidations) / totalChecks) * 100
    );

    // Determine status
    let status: "pass" | "warning" | "fail";
    if (errors.length > 0) {
      status = "fail";
    } else if (warnings.length > 0) {
      status = "warning";
    } else {
      status = "pass";
    }

    return { status, score, missingArtifacts, warnings, errors };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: StageContractEngine | null = null;

/**
 * Get the singleton StageContractEngine instance.
 */
export function getStageContractEngine(
  config?: StageContractEngineConfig
): StageContractEngine {
  if (!engineInstance && config) {
    engineInstance = new StageContractEngine(config);
  }
  if (!engineInstance) {
    throw new Error(
      "StageContractEngine not initialized. Call with config first."
    );
  }
  return engineInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetStageContractEngine(): void {
  engineInstance = null;
}
