/**
 * Fix Logging Schema
 *
 * Zod schemas for fix log validation.
 *
 * @module agents/fix-logging/schema
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 41 Fix Logging
 */

import { z } from "zod";
import {
  FIX_LOG_SCHEMA_VERSION,
  PATTERN_SCHEMA_VERSION,
} from "./types.js";

// ============================================================================
// Base Schemas
// ============================================================================

export const ErrorCategorySchema = z.enum(["BUILD", "LINT", "TYPE", "TEST"]);

export const ErrorSeveritySchema = z.enum(["error", "warning", "info"]);

export const FixTypeSchema = z.enum([
  "add_import",
  "add_type",
  "add_property",
  "remove_unused",
  "fix_typo",
  "fix_syntax",
  "fix_null_check",
  "add_return",
  "fix_async",
  "fix_lint_rule",
  "fix_format",
  "experimental",
  "manual",
]);

export const FixConfidenceSchema = z.enum(["high", "medium", "low", "experimental"]);

export const FixStatusSchema = z.enum([
  "success",
  "failed",
  "partial",
  "skipped",
  "escalated",
]);

export const PatternStatusSchema = z.enum([
  "active",
  "deprecated",
  "experimental",
  "disabled",
]);

// ============================================================================
// Fix Log Entry Schemas
// ============================================================================

export const FixLogErrorSchema = z.object({
  category: ErrorCategorySchema,
  code: z.string().min(1),
  message: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  severity: ErrorSeveritySchema,
  tool: z.string().optional(),
});

export const FixDiffSchema = z.object({
  before: z.string(),
  after: z.string(),
  linesChanged: z.number().int().nonnegative(),
});

export const FixLogFixSchema = z.object({
  patternId: z.string().min(1),
  type: FixTypeSchema,
  description: z.string(),
  confidence: FixConfidenceSchema,
  filesModified: z.array(z.string()),
  diff: FixDiffSchema.optional(),
  isAiAssisted: z.boolean(),
});

export const FixLogOutcomeSchema = z.object({
  status: FixStatusSchema,
  verified: z.boolean(),
  durationMs: z.number().nonnegative(),
  strikesUsed: z.number().int().nonnegative(),
  escalated: z.boolean(),
  antiCheatViolation: z.boolean(),
  newErrorsCount: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
});

export const FixLogContextSchema = z.object({
  fileExtension: z.string().optional(),
  isTestFile: z.boolean().optional(),
  relatedErrorCodes: z.array(z.string()).optional(),
  previousAttempts: z.number().int().nonnegative().optional(),
  budgetPercent: z.number().min(0).max(100).optional(),
});

export const EnhancedFixLogEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  sessionId: z.string().min(1),
  trackId: z.string().optional(),
  projectId: z.string().optional(),
  error: FixLogErrorSchema,
  fix: FixLogFixSchema,
  outcome: FixLogOutcomeSchema,
  context: FixLogContextSchema.optional(),
});

// ============================================================================
// Pattern Schemas
// ============================================================================

export const PatternMetadataSchema = z.object({
  appliedCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  escalationCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgDurationMs: z.number().nonnegative(),
  lastUsedAt: z.string().datetime().optional(),
  source: z.enum(["manual", "extracted", "default"]),
});

export const ErrorPatternSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  category: ErrorCategorySchema,
  errorCode: z.string().min(1),
  fixType: FixTypeSchema,
  confidence: FixConfidenceSchema,
  status: PatternStatusSchema,
  metadata: PatternMetadataSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// Storage Schemas
// ============================================================================

export const FixLogStorageSchema = z.object({
  schemaVersion: z.string(),
  lastUpdated: z.string().datetime(),
  entries: z.array(EnhancedFixLogEntrySchema),
  metadata: z.object({
    totalRecorded: z.number().int().nonnegative(),
    rotatedCount: z.number().int().nonnegative(),
    lastRotation: z.string().datetime().optional(),
  }),
});

export const PatternStorageSchema = z.object({
  schemaVersion: z.string(),
  lastUpdated: z.string().datetime(),
  patterns: z.array(ErrorPatternSchema),
  metadata: z.object({
    source: z.string(),
    importedAt: z.string().datetime().optional(),
  }),
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a fix log entry.
 */
export function validateFixLogEntry(
  data: unknown
): z.SafeParseReturnType<unknown, z.infer<typeof EnhancedFixLogEntrySchema>> {
  return EnhancedFixLogEntrySchema.safeParse(data);
}

/**
 * Validate fix log storage.
 */
export function validateFixLogStorage(
  data: unknown
): z.SafeParseReturnType<unknown, z.infer<typeof FixLogStorageSchema>> {
  return FixLogStorageSchema.safeParse(data);
}

/**
 * Validate an error pattern.
 */
export function validateErrorPattern(
  data: unknown
): z.SafeParseReturnType<unknown, z.infer<typeof ErrorPatternSchema>> {
  return ErrorPatternSchema.safeParse(data);
}

/**
 * Validate pattern storage.
 */
export function validatePatternStorage(
  data: unknown
): z.SafeParseReturnType<unknown, z.infer<typeof PatternStorageSchema>> {
  return PatternStorageSchema.safeParse(data);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create empty fix log storage.
 */
export function createEmptyFixLogStorage(): z.infer<typeof FixLogStorageSchema> {
  return {
    schemaVersion: FIX_LOG_SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    entries: [],
    metadata: {
      totalRecorded: 0,
      rotatedCount: 0,
    },
  };
}

/**
 * Create empty pattern storage.
 */
export function createEmptyPatternStorage(): z.infer<typeof PatternStorageSchema> {
  return {
    schemaVersion: PATTERN_SCHEMA_VERSION,
    lastUpdated: new Date().toISOString(),
    patterns: [],
    metadata: {
      source: "manual",
    },
  };
}

/**
 * Generate pattern ID from error.
 */
export function generatePatternId(
  category: string,
  errorCode: string,
  fixType: string
): string {
  return `${category}:${errorCode}:${fixType}`;
}

// ============================================================================
// Type Exports
// ============================================================================

export type ValidatedFixLogEntry = z.infer<typeof EnhancedFixLogEntrySchema>;
export type ValidatedFixLogStorage = z.infer<typeof FixLogStorageSchema>;
export type ValidatedErrorPattern = z.infer<typeof ErrorPatternSchema>;
export type ValidatedPatternStorage = z.infer<typeof PatternStorageSchema>;
