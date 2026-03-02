/**
 * Compliance Dashboard Types
 *
 * Type definitions for SDLC compliance dashboard and reporting.
 *
 * @module sdlc/dashboard/types
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @authority Master Plan v4.2, Sprint 68 T3.1
 * @sprint 68
 */

import type { SDLCStage, ContractEvaluation } from "../contracts/types.js";
import type { Patch } from "../patches/types.js";
import type { GateId } from "../gates/index.js";

// ============================================================================
// Status Types
// ============================================================================

/**
 * Overall compliance status.
 */
export type ComplianceStatus = "compliant" | "warning" | "non-compliant";

/**
 * Issue severity levels.
 */
export type IssueSeverity = "error" | "warning" | "info";

// ============================================================================
// Dashboard Types
// ============================================================================

/**
 * Compliance issue detected during evaluation.
 */
export interface ComplianceIssue {
  /**
   * Unique issue identifier.
   */
  id: string;

  /**
   * Related SDLC stage.
   */
  stage: SDLCStage;

  /**
   * Issue severity.
   */
  severity: IssueSeverity;

  /**
   * Issue description.
   */
  message: string;

  /**
   * Suggested remediation.
   */
  suggestion?: string;

  /**
   * Related artifact path.
   */
  artifactPath?: string;

  /**
   * When the issue was detected.
   */
  detectedAt: string;
}

/**
 * Compliance status for a single stage.
 */
export interface StageCompliance {
  /**
   * SDLC stage identifier.
   */
  stage: SDLCStage;

  /**
   * Stage name.
   */
  name: string;

  /**
   * Compliance score (0-100).
   */
  score: number;

  /**
   * Stage status.
   */
  status: "pass" | "warning" | "fail";

  /**
   * Missing required artifacts.
   */
  missingArtifacts: string[];

  /**
   * Issues for this stage.
   */
  issues: ComplianceIssue[];

  /**
   * Detailed contract evaluation.
   */
  evaluation?: ContractEvaluation;
}

/**
 * Gate result summary.
 */
export interface GateResult {
  /**
   * Gate identifier.
   */
  gateId: GateId;

  /**
   * Gate result.
   */
  result: "PASS" | "FAIL" | "PENDING";

  /**
   * Evaluation timestamp.
   */
  evaluatedAt: string;

  /**
   * Summary of checklist items.
   */
  summary: {
    passed: number;
    failed: number;
    pending: number;
  };
}

/**
 * Full compliance dashboard data.
 */
export interface ComplianceDashboard {
  /**
   * Overall compliance score (0-100).
   */
  overallScore: number;

  /**
   * Overall status.
   */
  status: ComplianceStatus;

  /**
   * Compliance breakdown by stage.
   */
  stages: StageCompliance[];

  /**
   * Recent patches.
   */
  recentPatches: Patch[];

  /**
   * Recent gate check results.
   */
  recentGateChecks: GateResult[];

  /**
   * All active issues.
   */
  issues: ComplianceIssue[];

  /**
   * When the dashboard was last refreshed.
   */
  refreshedAt: string;

  /**
   * Dashboard generation duration in ms.
   */
  durationMs: number;
}

// ============================================================================
// Report Types
// ============================================================================

/**
 * Report output format.
 */
export type ReportFormat = "markdown" | "json" | "html";

/**
 * Report configuration options.
 */
export interface ReportOptions {
  /**
   * Report title.
   */
  title?: string;

  /**
   * Output format.
   */
  format: ReportFormat;

  /**
   * Include detailed stage breakdowns.
   */
  includeStageDetails?: boolean;

  /**
   * Include patch history.
   */
  includePatchHistory?: boolean;

  /**
   * Include gate results.
   */
  includeGateResults?: boolean;

  /**
   * Include remediation suggestions.
   */
  includeSuggestions?: boolean;

  /**
   * Maximum number of issues to include.
   */
  maxIssues?: number;

  /**
   * Maximum number of patches to include.
   */
  maxPatches?: number;
}

/**
 * Generated compliance report.
 */
export interface ComplianceReport {
  /**
   * Report title.
   */
  title: string;

  /**
   * Report format.
   */
  format: ReportFormat;

  /**
   * Report content.
   */
  content: string;

  /**
   * Source dashboard data.
   */
  dashboard: ComplianceDashboard;

  /**
   * Generation timestamp.
   */
  generatedAt: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Dashboard engine configuration.
 */
export interface DashboardConfig {
  /**
   * Project root directory.
   */
  projectRoot: string;

  /**
   * Project tier for contract filtering.
   */
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";

  /**
   * Whether to cache dashboard data.
   */
  enableCache?: boolean;

  /**
   * Cache TTL in milliseconds.
   */
  cacheTtl?: number;

  /**
   * Maximum patches to include in dashboard.
   */
  maxRecentPatches?: number;

  /**
   * Maximum gate results to include.
   */
  maxGateResults?: number;
}
