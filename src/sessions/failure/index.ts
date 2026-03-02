/**
 * Failure Module
 *
 * Failure classification for recovery decisions.
 *
 * @module sessions/failure
 * @version 1.0.0
 * @date 2026-03-02
 * @status ACTIVE - Sprint 69-71
 * @sprint 69-71
 */

export {
  // Types
  FailureType,
  type EvidenceType,
  type FailureEvidence,
  type ClassificationResult,
  type FailureClassifierConfig,
  // Classifier
  FailureClassifier,
  getFailureClassifier,
  resetFailureClassifier,
  createFailureClassifier,
} from "./classifier.js";
