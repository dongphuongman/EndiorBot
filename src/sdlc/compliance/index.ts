/**
 * Compliance Module
 *
 * Exports for SDLC compliance checking.
 *
 * @module sdlc/compliance
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 73
 * @sdlc SDLC Framework 6.1.1
 */

export {
  checkL2Compliance,
  checkStageContent,
  countContentLines,
  countPlaceholders,
  isPlaceholderLine,
  STAGE_CONTENT_REQUIREMENTS,
  type ContentIssue,
  type L2Result,
  type StageContentResult,
} from "./content-checker.js";
