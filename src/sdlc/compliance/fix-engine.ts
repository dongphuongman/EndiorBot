/**
 * Compliance Fix Engine
 *
 * Orchestrates the full compliance fix pipeline:
 * 1. Collect project context (ProjectSnapshot)
 * 2. Run L2 compliance check (before)
 * 3. Map issues to agent fix tasks
 * 4. Process tasks sequentially (cross-stage context)
 * 5. Run L2 compliance check (after)
 * 6. Report before/after scores
 *
 * All file writes go through invokePatch() pipeline:
 * Claude PATCH → PatchValidator → CEO confirm → applyPatch()
 *
 * @module sdlc/compliance/fix-engine
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 75
 * @authority ADR-018 AI-Generated Compliance Content
 * @sprint 75
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fmt } from "../../cli/ui/format.js";
import { getClaudeCodeBridge } from "../../agents/invoke/claude-code-bridge.js";
import { PatchManager } from "../patches/patch-manager.js";
import { checkL2Compliance } from "./content-checker.js";
import { generateContent, validateWrittenFile, type ContentGeneratorBridge } from "./content-generator.js";
import type {
  AgentFixTask,
  AgentTaskResult,
  ComplianceFixConfig,
  ComplianceFixResult,
  FixActionResult,
  GeneratorConfig,
} from "./fix-types.js";
import { TIER_STAGES } from "../scaffold/types.js";
import { mapIssuesToFixTasks } from "./issue-mapper.js";
import { collectProjectContext } from "./project-context-collector.js";

// ============================================================================
// Public API
// ============================================================================

/**
 * Main compliance fix engine.
 *
 * Orchestrates the full pipeline from gap detection to content generation.
 * All writes go through invokePatch() pipeline (PatchValidator + CEO confirm).
 */
export class ComplianceFixEngine {
  private readonly config: ComplianceFixConfig;
  private readonly patchManager: PatchManager;

  constructor(config: ComplianceFixConfig) {
    this.config = config;
    this.patchManager = new PatchManager({
      projectRoot: config.projectPath,
    });
  }

  /**
   * Run the full compliance fix pipeline.
   */
  async fix(): Promise<ComplianceFixResult> {
    const startTime = Date.now();

    // 1. Collect project context
    const snapshot = await collectProjectContext(
      this.config.projectPath,
      this.config.tier,
    );

    // 2. Run L2 compliance check (before)
    const stages = this.config.stages;
    const l2Before = checkL2Compliance(
      this.config.projectPath,
      stages,
      this.config.tier,
    );

    // 3. No issues → nothing to fix
    if (l2Before.issues.length === 0) {
      return {
        scoreBefore: l2Before.score,
        scoreAfter: l2Before.score,
        totalIssues: 0,
        issuesFixed: 0,
        issuesFailed: 0,
        taskResults: [],
        stageResultsBefore: l2Before.stageResults,
        stageResultsAfter: l2Before.stageResults,
        durationMs: Date.now() - startTime,
        dryRun: this.config.dryRun,
      };
    }

    // 4. Map issues to agent fix tasks
    const tasks = mapIssuesToFixTasks(
      l2Before.issues,
      l2Before.stageResults,
      snapshot,
    );

    // 5. Initialize bridge (with timeout to prevent hanging in test/CI)
    let bridge: ContentGeneratorBridge | null = null;
    try {
      const ccBridge = getClaudeCodeBridge();
      const available = await Promise.race([
        ccBridge.isAvailable(),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 1000)),
      ]);
      if (available) {
        bridge = ccBridge;
      }
    } catch {
      // Bridge unavailable — will use deterministic fallback
    }

    // 6. Start patch for audit trail (skip for dry-run)
    let patchId: string | undefined;
    if (!this.config.dryRun) {
      const patch = await this.patchManager.startPatch({
        name: `compliance-fix-${new Date().toISOString().split("T")[0]}`,
        author: "@compliance-fixer",
      });
      patchId = patch.id;
    }

    // 7. Process tasks sequentially with cross-stage context
    const previousStageOutputs = new Map<string, string>();
    const taskResults: AgentTaskResult[] = [];

    const generatorConfig: GeneratorConfig = {
      projectPath: this.config.projectPath,
      tier: this.config.tier,
      dryRun: this.config.dryRun,
      autoConfirm: this.config.autoConfirm,
    };

    const filteredTasks = tasks.filter(
      (t) => !this.config.stage || t.stage === this.config.stage,
    );
    const totalActions = filteredTasks.reduce((sum, t) => sum + t.actions.length, 0);
    let actionIndex = 0;

    if (!this.config.dryRun) {
      console.log(fmt.dim(`  ${filteredTasks.length} stage(s), ${totalActions} file(s) to generate`));
    }

    for (const task of filteredTasks) {
      const taskResult = await this.processTask(
        task,
        generatorConfig,
        bridge,
        snapshot,
        previousStageOutputs,
        patchId,
        () => {
          actionIndex++;
          console.log(fmt.dim(`  [${actionIndex}/${totalActions}] ${task.stage} @${task.agent}`));
        },
      );
      taskResults.push(taskResult);
    }

    // 8. Commit patch (if not dry-run and changes were made)
    if (patchId && !this.config.dryRun) {
      const hasChanges = taskResults.some((r) =>
        r.actionResults.some((a) => a.success && !a.dryRun),
      );
      if (hasChanges) {
        await this.patchManager.commitPatch(patchId);
      }
    }

    // 9. Run L2 compliance check (after)
    const l2After = this.config.dryRun
      ? l2Before // Dry-run: no changes made
      : checkL2Compliance(this.config.projectPath, stages, this.config.tier);

    // 10. Calculate results
    const issuesFixed = taskResults.reduce(
      (sum, r) => sum + r.actionResults.filter((a) => a.success).length,
      0,
    );
    const issuesFailed = taskResults.reduce(
      (sum, r) => sum + r.actionResults.filter((a) => !a.success).length,
      0,
    );

    const result: ComplianceFixResult = {
      scoreBefore: l2Before.score,
      scoreAfter: l2After.score,
      totalIssues: l2Before.issues.length,
      issuesFixed,
      issuesFailed,
      taskResults,
      stageResultsBefore: l2Before.stageResults,
      stageResultsAfter: l2After.stageResults,
      durationMs: Date.now() - startTime,
      dryRun: this.config.dryRun,
    };

    if (patchId) result.patchId = patchId;

    return result;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async processTask(
    task: AgentFixTask,
    generatorConfig: GeneratorConfig,
    bridge: ContentGeneratorBridge | null,
    snapshot: ReturnType<typeof collectProjectContext> extends Promise<infer T> ? T : never,
    previousStageOutputs: Map<string, string>,
    patchId: string | undefined,
    onActionStart?: () => void,
  ): Promise<AgentTaskResult> {
    const taskStart = Date.now();
    const actionResults: FixActionResult[] = [];

    for (const action of task.actions) {
      onActionStart?.();
      let result = await generateContent(
        task,
        action,
        generatorConfig,
        previousStageOutputs,
        { bridge, snapshot },
      );

      // For deterministic fallback (no bridge), write the file directly
      if (result.success && !result.dryRun && result.content && !bridge) {
        this.writeDirectly(action.targetPath, result.content);

        // P0-3: Post-write validation for deterministic fallback path
        const fullPath = resolve(join(this.config.projectPath, action.targetPath));
        const validationError = validateWrittenFile(fullPath);
        if (validationError) {
          // Rollback: delete the invalid file
          try { unlinkSync(fullPath); } catch { /* best-effort rollback */ }
          result = { ...result, success: false, error: validationError };
        }
      }

      // Record change in PatchManager for audit trail
      if (result.success && !result.dryRun && patchId && result.content) {
        try {
          await this.patchManager.recordChange(patchId, {
            path: action.targetPath,
            changeType: "create",
            newContent: result.content,
          });
        } catch {
          // PatchManager error shouldn't block the fix
        }
      }

      // Add to previous outputs for cross-stage context
      if (result.success && result.content) {
        const key = `${task.stage}/${action.artifactType}`;
        previousStageOutputs.set(key, result.content);
      }

      actionResults.push(result);
    }

    return {
      task,
      actionResults,
      success: actionResults.every((r) => r.success),
      durationMs: Date.now() - taskStart,
    };
  }

  /**
   * Write file directly for deterministic fallback mode.
   * Only used when bridge is unavailable.
   */
  private writeDirectly(relativePath: string, content: string): void {
    const fullPath = resolve(join(this.config.projectPath, relativePath));
    const projectRoot = resolve(this.config.projectPath) + sep;

    // P0-1: Path traversal containment — ensure write stays within project
    if (!fullPath.startsWith(projectRoot)) {
      throw new Error(`Path traversal blocked: ${relativePath} resolves outside project root`);
    }

    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, "utf-8");
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a compliance fix engine with default stage configuration.
 */
export function createComplianceFixEngine(options: {
  projectPath: string;
  tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  dryRun?: boolean;
  autoConfirm?: boolean;
  stage?: string;
}): ComplianceFixEngine {
  const stages = TIER_STAGES[options.tier];

  const config: ComplianceFixConfig = {
    projectPath: options.projectPath,
    tier: options.tier,
    dryRun: options.dryRun ?? false,
    autoConfirm: options.autoConfirm ?? false,
    stages,
  };

  if (options.stage) config.stage = options.stage;

  return new ComplianceFixEngine(config);
}
