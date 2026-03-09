/**
 * Cross-Session Context Transfer — Sprint 96/97
 *
 * Barrel export for the context transfer sub-module.
 * Sprint 97: Added ContextInjector, RetentionTracker, ContextLifecycleManager.
 *
 * @module context/transfer
 * @version 2.0.0
 * @sprint 97
 */

// ============================================================================
// Types (ADR-002: ZERO imports from src/)
// ============================================================================

export type {
  ContextQualityScore,
  QualityWeights,
  TransferContextType,
  TransferableContext,
  RecencyDecayConfig,
  QualityGateThresholds,
  ContextTransferConfig,
  ContextSelectionResult,
  ContextQualityGateResult,
  QualityViolation,
  TransferStoreStats,
  // Sprint 97: T3 types
  RetentionLevel,
  RetentionMetrics,
  ContextCheckpointState,
  ContextRefreshConfig,
} from "./types.js";

export {
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_TRANSFER_CONFIG,
  ALL_TRANSFER_CONTEXT_TYPES,
  // Sprint 97: T3 constants
  RETENTION_THRESHOLDS,
  DEFAULT_REFRESH_CONFIG,
} from "./types.js";

// ============================================================================
// Quality Scorer
// ============================================================================

export {
  ContextQualityScorer,
  getContextQualityScorer,
  resetContextQualityScorer,
} from "./quality-scorer.js";

// ============================================================================
// Quality Gate
// ============================================================================

export {
  ContextQualityGate,
  getContextQualityGate,
  resetContextQualityGate,
} from "./quality-gate.js";

export type { ContextQualityGateOptions } from "./quality-gate.js";

// ============================================================================
// Store
// ============================================================================

export {
  ContextTransferStore,
  getContextTransferStore,
  resetContextTransferStore,
} from "./context-transfer-store.js";

export type {
  ContextTransferStoreOptions,
  ListOptions,
} from "./context-transfer-store.js";

// ============================================================================
// Extractor
// ============================================================================

export { SessionContextExtractor } from "./session-context-extractor.js";

// ============================================================================
// Selector
// ============================================================================

export {
  ContextSelector,
  getContextSelector,
  resetContextSelector,
} from "./context-selector.js";

export type { ContextSelectorOptions } from "./context-selector.js";

// ============================================================================
// Injector (Sprint 97)
// ============================================================================

export {
  ContextInjector,
  getContextInjector,
  resetContextInjector,
} from "./context-injector.js";

// ============================================================================
// Retention Tracker (Sprint 97)
// ============================================================================

export {
  RetentionTracker,
  getRetentionTracker,
  resetRetentionTracker,
} from "./retention-tracker.js";

// ============================================================================
// Lifecycle Manager (Sprint 97)
// ============================================================================

export {
  ContextLifecycleManager,
  getContextLifecycleManager,
  resetContextLifecycleManager,
} from "./context-lifecycle.js";

export type {
  ContextLifecycleOptions,
  LifecycleStatus,
} from "./context-lifecycle.js";
