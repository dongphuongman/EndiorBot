/**
 * Brain Error Types
 *
 * Errors related to the Brain 4-layer memory system.
 *
 * @module errors/brain
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { EndiorBotError, type EndiorBotErrorOptions } from "./base.js";

// ============================================================================
// Brain Error Codes
// ============================================================================

/**
 * Brain-specific error codes.
 */
export type BrainErrorCode =
  | "BRAIN_NOT_INITIALIZED"
  | "BRAIN_LAYER_NOT_FOUND"
  | "BRAIN_STORAGE_ERROR"
  | "BRAIN_COMPRESSION_FAILED"
  | "BRAIN_RECALL_FAILED"
  | "BRAIN_INVALID_ENTRY"
  | "BRAIN_CAPACITY_EXCEEDED"
  | "BRAIN_CORRUPTION_DETECTED";

/**
 * Options for creating a BrainError.
 */
export interface BrainErrorOptions {
  code: BrainErrorCode;
  layer?: number;
  operation?: string;
  retryable?: boolean;
  cause?: Error;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Brain Error Class
// ============================================================================

/**
 * Error from the Brain memory system.
 */
export class BrainError extends EndiorBotError {
  /** Brain error code */
  public readonly brainCode: BrainErrorCode;

  /** Layer that failed (1-4) */
  public readonly layer?: number;

  /** Operation that failed */
  public readonly operation?: string;

  constructor(message: string, options: BrainErrorOptions) {
    const metadata: Record<string, unknown> = { ...options.metadata };
    if (options.layer !== undefined) {
      metadata.layer = options.layer;
    }
    if (options.operation !== undefined) {
      metadata.operation = options.operation;
    }

    const superOptions: EndiorBotErrorOptions = {
      code: options.code,
      category: "BRAIN",
      retryable: options.retryable ?? getDefaultRetryable(options.code),
      severity: getSeverity(options.code),
      metadata,
    };
    if (options.cause) {
      superOptions.cause = options.cause;
    }
    super(message, superOptions);

    this.name = "BrainError";
    this.brainCode = options.code;
    if (options.layer !== undefined) {
      this.layer = options.layer;
    }
    if (options.operation !== undefined) {
      this.operation = options.operation;
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultRetryable(code: BrainErrorCode): boolean {
  switch (code) {
    case "BRAIN_STORAGE_ERROR":
    case "BRAIN_COMPRESSION_FAILED":
    case "BRAIN_RECALL_FAILED":
      return true;
    case "BRAIN_NOT_INITIALIZED":
    case "BRAIN_LAYER_NOT_FOUND":
    case "BRAIN_INVALID_ENTRY":
    case "BRAIN_CAPACITY_EXCEEDED":
    case "BRAIN_CORRUPTION_DETECTED":
      return false;
    default:
      return false;
  }
}

function getSeverity(code: BrainErrorCode): "critical" | "error" | "warning" {
  switch (code) {
    case "BRAIN_CORRUPTION_DETECTED":
      return "critical";
    case "BRAIN_CAPACITY_EXCEEDED":
      return "warning";
    default:
      return "error";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a not initialized error.
 */
export function brainNotInitializedError(): BrainError {
  return new BrainError("Brain not initialized", {
    code: "BRAIN_NOT_INITIALIZED",
  });
}

/**
 * Create a layer not found error.
 */
export function layerNotFoundError(layer: number): BrainError {
  return new BrainError(`Brain layer ${layer} not found`, {
    code: "BRAIN_LAYER_NOT_FOUND",
    layer,
  });
}

/**
 * Create a storage error.
 */
export function brainStorageError(
  operation: string,
  cause?: Error
): BrainError {
  const options: BrainErrorOptions = {
    code: "BRAIN_STORAGE_ERROR",
    operation,
    retryable: true,
  };
  if (cause) {
    options.cause = cause;
  }
  return new BrainError(`Brain storage error during ${operation}`, options);
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a BrainError.
 */
export function isBrainError(error: unknown): error is BrainError {
  return error instanceof BrainError;
}
