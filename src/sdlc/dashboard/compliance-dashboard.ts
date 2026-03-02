/**
 * Compliance Dashboard
 *
 * Aggregates SDLC compliance data for real-time monitoring.
 *
 * Features:
 *   - Stage contract evaluation aggregation
 *   - Issue tracking and severity classification
 *   - Patch history integration
 *   - Gate result tracking
 *
 * @module sdlc/dashboard/compliance-dashboard
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2, Sprint 68 T3.1-T3.3
 * @sprint 68
 */

import { createLogger, type Logger } from "../../logging/index.js";
import {
  StageContractEngine,
  SDLC_STAGES,
  type SDLCStage,
  type ContractEvaluation,
} from "../contracts/index.js";
import { PatchManager, type Patch } from "../patches/index.js";
import {
  type ComplianceDashboard,
  type StageCompliance,
  type ComplianceIssue,
  type ComplianceStatus,
  type DashboardConfig,
  type IssueSeverity,
} from "./types.js";

// ============================================================================
// Dashboard Engine
// ============================================================================

/**
 * Compliance Dashboard Engine.
 *
 * Aggregates compliance data from multiple sources:
 * - Stage Contract evaluations
 * - Patch history
 * - Gate evaluations
 *
 * @example
 * ```typescript
 * const dashboard = new ComplianceDashboardEngine({
 *   projectRoot: '/path/to/project',
 * });
 *
 * const data = await dashboard.refresh();
 * console.log(`Score: ${data.overallScore}%`);
 * console.log(`Status: ${data.status}`);
 * ```
 */
export class ComplianceDashboardEngine {
  private readonly config: Required<DashboardConfig>;
  private readonly log: Logger;
  private contractEngine: StageContractEngine;
  private patchManager: PatchManager | null = null;
  private cachedDashboard: ComplianceDashboard | null = null;
  private cacheExpiry: number = 0;

  constructor(config: DashboardConfig) {
    this.config = {
      tier: "STANDARD",
      enableCache: true,
      cacheTtl: 5000, // 5 seconds
      maxRecentPatches: 10,
      maxGateResults: 10,
      ...config,
    };
    this.log = createLogger("ComplianceDashboard");

    // Initialize contract engine
    this.contractEngine = new StageContractEngine({
      projectRoot: this.config.projectRoot,
    });
  }

  // ============================================================================
  // Dashboard Refresh
  // ============================================================================

  /**
   * Refresh the compliance dashboard.
   */
  async refresh(force: boolean = false): Promise<ComplianceDashboard> {
    const startTime = Date.now();

    // Check cache
    if (!force && this.config.enableCache && this.cachedDashboard) {
      if (Date.now() < this.cacheExpiry) {
        return this.cachedDashboard;
      }
    }

    this.log.debug("Refreshing compliance dashboard");

    // Evaluate all stage contracts
    const stageCompliances = await this.evaluateAllStages();

    // Get recent patches
    const recentPatches = await this.getRecentPatches();

    // Calculate overall score and status
    const { overallScore, status, allIssues } =
      this.calculateOverallCompliance(stageCompliances);

    // Build dashboard
    const dashboard: ComplianceDashboard = {
      overallScore,
      status,
      stages: stageCompliances,
      recentPatches,
      recentGateChecks: [], // Gate checks would be integrated here
      issues: allIssues,
      refreshedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    // Update cache
    if (this.config.enableCache) {
      this.cachedDashboard = dashboard;
      this.cacheExpiry = Date.now() + this.config.cacheTtl;
    }

    this.log.info("Dashboard refreshed", {
      score: overallScore,
      status,
      durationMs: dashboard.durationMs,
    });

    return dashboard;
  }

  // ============================================================================
  // Stage Evaluation
  // ============================================================================

  /**
   * Evaluate all SDLC stages.
   */
  private async evaluateAllStages(): Promise<StageCompliance[]> {
    const compliances: StageCompliance[] = [];

    for (const stage of SDLC_STAGES) {
      try {
        const evaluation = await this.contractEngine.evaluate(stage);
        const compliance = this.evaluationToCompliance(stage, evaluation);
        compliances.push(compliance);
      } catch (error) {
        this.log.warn(`Failed to evaluate stage: ${stage}`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Add failed stage with error
        compliances.push({
          stage,
          name: this.getStageName(stage),
          score: 0,
          status: "fail",
          missingArtifacts: [],
          issues: [
            {
              id: `${stage}-evaluation-error`,
              stage,
              severity: "error",
              message: `Failed to evaluate stage: ${error instanceof Error ? error.message : String(error)}`,
              detectedAt: new Date().toISOString(),
            },
          ],
        });
      }
    }

    return compliances;
  }

  /**
   * Convert contract evaluation to stage compliance.
   */
  private evaluationToCompliance(
    stage: SDLCStage,
    evaluation: ContractEvaluation
  ): StageCompliance {
    const issues: ComplianceIssue[] = [];
    let issueId = 0;

    // Convert errors to issues
    for (const error of evaluation.errors) {
      issues.push({
        id: `${stage}-error-${++issueId}`,
        stage,
        severity: "error",
        message: error,
        detectedAt: new Date().toISOString(),
      });
    }

    // Convert warnings to issues
    for (const warning of evaluation.warnings) {
      issues.push({
        id: `${stage}-warning-${++issueId}`,
        stage,
        severity: "warning",
        message: warning,
        detectedAt: new Date().toISOString(),
      });
    }

    // Add suggestions for missing artifacts
    for (const artifact of evaluation.missingArtifacts) {
      const existingIssue = issues.find(
        (i) => i.artifactPath === artifact
      );
      if (!existingIssue) {
        issues.push({
          id: `${stage}-missing-${++issueId}`,
          stage,
          severity: "error",
          message: `Missing required artifact: ${artifact}`,
          artifactPath: artifact,
          suggestion: `Create the required file matching pattern: ${artifact}`,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      stage,
      name: evaluation.contract.name,
      score: evaluation.score,
      status: evaluation.status,
      missingArtifacts: evaluation.missingArtifacts,
      issues,
      evaluation,
    };
  }

  // ============================================================================
  // Patch Integration
  // ============================================================================

  /**
   * Get recent patches.
   */
  private async getRecentPatches(): Promise<Patch[]> {
    try {
      // Lazily initialize patch manager
      if (!this.patchManager) {
        this.patchManager = new PatchManager({
          projectRoot: this.config.projectRoot,
        });
      }

      return await this.patchManager.getHistory({
        limit: this.config.maxRecentPatches,
      });
    } catch (error) {
      this.log.warn("Failed to get recent patches", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ============================================================================
  // Score Calculation
  // ============================================================================

  /**
   * Calculate overall compliance score and status.
   */
  private calculateOverallCompliance(stages: StageCompliance[]): {
    overallScore: number;
    status: ComplianceStatus;
    allIssues: ComplianceIssue[];
  } {
    if (stages.length === 0) {
      return {
        overallScore: 0,
        status: "non-compliant",
        allIssues: [],
      };
    }

    // Calculate average score
    const totalScore = stages.reduce((sum, s) => sum + s.score, 0);
    const overallScore = Math.round(totalScore / stages.length);

    // Aggregate all issues
    const allIssues: ComplianceIssue[] = [];
    for (const stage of stages) {
      allIssues.push(...stage.issues);
    }

    // Sort issues by severity
    allIssues.sort((a, b) => {
      const severityOrder: Record<IssueSeverity, number> = {
        error: 0,
        warning: 1,
        info: 2,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Determine overall status
    let status: ComplianceStatus;
    const hasErrors = stages.some((s) => s.status === "fail");
    const hasWarnings = stages.some((s) => s.status === "warning");

    if (hasErrors || overallScore < 50) {
      status = "non-compliant";
    } else if (hasWarnings || overallScore < 80) {
      status = "warning";
    } else {
      status = "compliant";
    }

    return { overallScore, status, allIssues };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Get human-readable stage name.
   */
  private getStageName(stage: SDLCStage): string {
    const names: Record<SDLCStage, string> = {
      "00-FOUNDATION": "Foundation",
      "01-PLANNING": "Planning",
      "02-DESIGN": "Design",
      "03-INTEGRATE": "Integrate",
      "04-BUILD": "Build",
      "05-TEST": "Test",
      "06-DEPLOY": "Deploy",
      "07-OPERATE": "Operate",
      "08-COLLABORATE": "Collaborate",
      "09-ARCHIVE": "Archive",
    };
    return names[stage] ?? stage;
  }

  /**
   * Get specific stage compliance.
   */
  async getStageCompliance(stage: SDLCStage): Promise<StageCompliance> {
    const evaluation = await this.contractEngine.evaluate(stage);
    return this.evaluationToCompliance(stage, evaluation);
  }

  /**
   * Get all issues.
   */
  async getIssues(): Promise<ComplianceIssue[]> {
    const dashboard = await this.refresh();
    return dashboard.issues;
  }

  /**
   * Get issues by severity.
   */
  async getIssuesBySeverity(
    severity: IssueSeverity
  ): Promise<ComplianceIssue[]> {
    const issues = await this.getIssues();
    return issues.filter((i) => i.severity === severity);
  }

  /**
   * Clear the dashboard cache.
   */
  clearCache(): void {
    this.cachedDashboard = null;
    this.cacheExpiry = 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: ComplianceDashboardEngine | null = null;

/**
 * Get the singleton ComplianceDashboardEngine instance.
 */
export function getComplianceDashboard(
  config?: DashboardConfig
): ComplianceDashboardEngine {
  if (!engineInstance && config) {
    engineInstance = new ComplianceDashboardEngine(config);
  }
  if (!engineInstance) {
    throw new Error(
      "ComplianceDashboardEngine not initialized. Call with config first."
    );
  }
  return engineInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetComplianceDashboard(): void {
  engineInstance = null;
}
