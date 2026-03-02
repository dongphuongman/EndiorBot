/**
 * Dashboard Module
 *
 * Exports for SDLC compliance dashboard and reporting.
 *
 * @module sdlc/dashboard
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

// Types
export {
  type ComplianceStatus,
  type IssueSeverity,
  type ComplianceIssue,
  type StageCompliance,
  type GateResult,
  type ComplianceDashboard,
  type ReportFormat,
  type ReportOptions,
  type ComplianceReport,
  type DashboardConfig,
} from "./types.js";

// Dashboard Engine
export {
  ComplianceDashboardEngine,
  getComplianceDashboard,
  resetComplianceDashboard,
} from "./compliance-dashboard.js";

// Report Generator
export { ReportGenerator } from "./report-generator.js";
