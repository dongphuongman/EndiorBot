/**
 * Self-Correction Module Index
 *
 * Exports for the Self-Correction Engine (Phase 3).
 *
 * @module src/self-correction
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 */

// Types
export type {
  ErrorCategory,
  ErrorSeverity,
  FixConfidence,
  FixStatus,
  ParsedError,
  BuildError,
  LintError,
  TypeScriptError,
  TestError,
  ClassifiedError,
  ProposedFix,
  FixType,
  FixResult,
  StrikeRecord,
  FixLogEntry,
  SelfCorrectionStats,
  SelfCorrectionConfig,
  FixAttempt,
  CorrectionResult,
  EscalationInfo,
} from "./types.js";

export {
  AUTO_FIX_TARGETS,
  MAX_STRIKES,
  DEFAULT_SELF_CORRECTION_CONFIG,
} from "./types.js";

// Error Classifier
export {
  ErrorClassifier,
  createErrorClassifier,
  parseErrors,
  classifyError,
  isDeterministicCategory,
  getTargetFixRate,
} from "./error-classifier.js";

// Deterministic Fixer
export {
  DeterministicFixer,
  createDeterministicFixer,
  proposeFix,
  isAutoFixable,
  getFixConfidence,
} from "./deterministic-fixer.js";

// Fix Logger
export type { FixLoggerConfig, FixLogFile } from "./fix-logger.js";
export {
  FixLogger,
  createFixLogger,
  getDefaultLogPath,
} from "./fix-logger.js";

// Verifier
export type { VerificationResult, VerifierConfig } from "./verifier.js";
export {
  Verifier,
  createVerifier,
  verifyFix,
  verifyFixes,
  DEFAULT_VERIFIER_CONFIG,
} from "./verifier.js";

// Self-Correction Engine (Orchestrator)
export type { CorrectionEvent, CorrectionEventListener } from "./self-correction-engine.js";
export {
  SelfCorrectionEngine,
  createSelfCorrectionEngine,
  correctErrors,
  fixFileErrors,
  VERIFICATION_COSTS,
} from "./self-correction-engine.js";

// AI-Assisted Fixer (Sprint 37 Day 3-4)
export type {
  AIAssistedFixerConfig,
  AIConsultationRequest,
  AIConsultationResponse,
  BudgetCheckResult,
} from "./ai-assisted-fixer.js";
export {
  AIAssistedFixer,
  createAIAssistedFixer,
  requiresAIAssistance,
  getExperimentalConfidence,
  DEFAULT_AI_FIXER_CONFIG,
} from "./ai-assisted-fixer.js";
