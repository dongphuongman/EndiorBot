/**
 * Memory Module — Barrel Export
 *
 * Structured memory system adapted from ClawVault.
 * Foundation for persistent facts, observation scoring, and session handoffs.
 *
 * @module memory
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 * @standalone C5: No imports from/to existing EndiorBot systems
 */

// Types
export type {
  MemoryType,
  ScoredObservation,
  SessionHandoff,
  StructuredFact,
  FactQueryFilter,
} from "./types.js";

// Observation Scorer
export {
  scoreObservation,
  filterByImportance,
  getTypeImportance,
  getTypeConfidence,
  IMPORTANCE_THRESHOLDS,
} from "./observation-scorer.js";

// Fact Store
export { FactStore } from "./fact-store.js";

// Session Handoff
export {
  createHandoff,
  saveHandoff,
  loadLatestHandoff,
  loadAllHandoffs,
} from "./session-handoff.js";
