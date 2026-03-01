/**
 * Handoff Module - Barrel Export
 *
 * Handoff detection and validation.
 *
 * @module agents/handoff
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

export {
  HandoffDetector,
  getHandoffDetector,
  resetHandoffDetector,
  createHandoffDetector,
  detectHandoff,
  type DetectionResult,
  type ValidationResult,
  type DetectorConfig,
  DEFAULT_DETECTOR_CONFIG,
} from "./handoff-detector.js";
