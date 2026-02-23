/**
 * Fix Logging Module Index
 *
 * Provides fix logging and pattern management for learning engine.
 *
 * @module agents/fix-logging
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 41 Fix Logging
 */

// Types
export type {
  EnhancedFixLogEntry,
  FixLogError,
  FixLogFix,
  FixLogOutcome,
  FixLogContext,
  FixDiff,
  ErrorPattern,
  PatternStatus,
  PatternMetadata,
  WeeklySummary,
  CategorySummary,
  PatternSummary,
  FixLogStorage,
  PatternStorage,
  FixLogQueryOptions,
  PatternQueryOptions,
  ErrorCategory,
  ErrorSeverity,
  FixType,
  FixConfidence,
  FixStatus,
} from "./types.js";

export {
  FIX_LOG_SCHEMA_VERSION,
  PATTERN_SCHEMA_VERSION,
  MAX_LOG_ENTRIES,
  ROTATION_KEEP_PERCENT,
  DEFAULT_STORAGE_DIR,
  FIX_LOG_FILENAME,
  PATTERNS_FILENAME,
} from "./types.js";

// Schema
export {
  validateFixLogEntry,
  validateFixLogStorage,
  validateErrorPattern,
  validatePatternStorage,
  createEmptyFixLogStorage,
  createEmptyPatternStorage,
  generatePatternId,
  type ValidatedFixLogEntry,
  type ValidatedFixLogStorage,
  type ValidatedErrorPattern,
  type ValidatedPatternStorage,
} from "./schema.js";

// Fix Log Writer
export {
  FixLogWriter,
  createFixLogWriter,
  getFixLogWriter,
  resetFixLogWriter,
  type FixLogWriterConfig,
  type WriteResult,
} from "./fix-log-writer.js";

// Fix Logger
export {
  FixLogger,
  createFixLogger,
  getFixLogger,
  resetFixLogger,
  type LogFixParams,
  type FixLoggerConfig,
} from "./fix-logger.js";

// Pattern Manager
export {
  PatternManager,
  createPatternManager,
  getPatternManager,
  resetPatternManager,
  type PatternManagerConfig,
  type CreatePatternParams,
} from "./pattern-manager.js";
