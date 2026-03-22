/**
 * Memory Module Types
 *
 * Adapted from ClawVault structured memory system.
 * Types for observation scoring, structured facts, and session handoffs.
 *
 * @module memory/types
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 * @origin ClawVault v3.2.0 (src/types.ts)
 */

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Memory observation types relevant to SDLC agent workflow.
 * Adapted from ClawVault's 8-type taxonomy — trimmed to 7 types
 * relevant to EndiorBot's CEO Power Tool use case.
 *
 * Skipped from ClawVault: "feeling" (emotional tracking not relevant for SDLC)
 */
export type MemoryType =
  | "decision"      // Architecture/design choices with reasoning
  | "lesson"        // Insights from debugging, review, implementation
  | "fact"          // Technical facts (API versions, config values)
  | "commitment"    // Sprint goals, promises, deadlines
  | "preference"    // CEO workflow preferences, coding style
  | "blocker"       // Active blockers with resolution status
  | "project";      // Project context (repo, tier, tech stack)

// ============================================================================
// Scored Observation
// ============================================================================

/**
 * Scored observation from an agent session.
 * ClawVault's core primitive — a piece of information with quality metadata.
 *
 * Scoring dimensions:
 * - confidence: How certain is this observation (0=guess, 1=verified)
 * - importance: How critical to retain across sessions (0=ephemeral, 1=must-keep)
 */
export interface ScoredObservation {
  /** Unique observation ID (UUID v4). */
  id: string;

  /** Observation type — determines default importance scoring. */
  type: MemoryType;

  /** The observation content (natural language). */
  content: string;

  /** Confidence score: 0-1, how certain is this observation. */
  confidence: number;

  /** Importance score: 0-1, how critical to retain. */
  importance: number;

  /** Agent that produced this observation (e.g., "@architect"). */
  source: string;

  /** Session ID where this observation was created. */
  sessionId: string;

  /** ISO8601 timestamp of creation. */
  createdAt: string;

  /** Free-form tags for categorization. */
  tags: string[];
}

// ============================================================================
// Session Handoff
// ============================================================================

/**
 * Session handoff document — what to tell the next session.
 * Captures agent intent, not just state machine status.
 *
 * Adapted from ClawVault's HandoffDocument (src/types.ts:189-206).
 * EndiorBot's CheckpointScheduler stores state; handoff stores intent.
 */
export interface SessionHandoff {
  /** Session ID that created this handoff. */
  sessionId: string;

  /** ISO8601 timestamp. */
  createdAt: string;

  /** What the agent was actively working on. */
  workingOn: string[];

  /** Active blockers preventing progress. */
  blocked: string[];

  /** Recommended next steps for the next session. */
  nextSteps: string[];

  /** Decisions made during this session. */
  decisions: string[];

  /** Unresolved questions requiring CEO/human input. */
  openQuestions: string[];

  /** Agent that created this handoff (e.g., "@coder"). */
  agentSource: string;
}

// ============================================================================
// Structured Fact
// ============================================================================

/**
 * Structured fact with conflict resolution.
 * Entity-relation-value triple with temporal validity.
 *
 * Adapted from ClawVault's FactStore (src/lib/fact-store.ts).
 *
 * Example:
 * { entity: "EndiorBot", relation: "uses_framework", value: "SDLC 6.1.2" }
 * { entity: "paperclip", relation: "tier", value: "STANDARD" }
 *
 * Conflict resolution: same entity+relation → old fact gets validUntil set,
 * new fact becomes current. Append-only — no deletion.
 */
export interface StructuredFact {
  /** Unique fact ID (UUID v4). */
  id: string;

  /** Entity this fact is about (e.g., "EndiorBot", "paperclip"). */
  entity: string;

  /** Relation type (e.g., "uses_framework", "tier", "language"). */
  relation: string;

  /** Value of the relation (e.g., "SDLC 6.1.2", "STANDARD"). */
  value: string;

  /** Confidence score: 0-1. */
  confidence: number;

  /** ISO8601 timestamp when this fact became valid. */
  validFrom: string;

  /** ISO8601 timestamp when this fact was superseded. Undefined = still current. */
  validUntil?: string;

  /** Source that established this fact (e.g., "@architect", "config"). */
  source: string;
}

// ============================================================================
// Query Types
// ============================================================================

/** Filter for querying structured facts. */
export interface FactQueryFilter {
  /** Filter by entity name. */
  entity?: string;

  /** Filter by relation type. */
  relation?: string;
}
