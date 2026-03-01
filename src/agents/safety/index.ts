/**
 * Safety Module - Barrel Export
 *
 * Risk classification and audit logging for agent safety.
 *
 * @module agents/safety
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

// Risk Classifier
export {
  RiskClassifier,
  getRiskClassifier,
  resetRiskClassifier,
  createRiskClassifier,
  classifyRisk,
  type RiskLevel,
  type ActionCategory,
  type ConfirmationType,
  type RiskClassification,
  type RiskFactor,
  type RiskConfig,
  DEFAULT_RISK_CONFIG,
} from "./risk-classifier.js";

// Audit Logger
export {
  AuditLogger,
  getAuditLogger,
  resetAuditLogger,
  createAuditLogger,
  auditLog,
  type AuditEntry,
  type AuditConfig,
  DEFAULT_AUDIT_CONFIG,
} from "./audit-logger.js";
