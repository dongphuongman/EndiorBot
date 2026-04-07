/**
 * SessionIntelligenceEnvelope — Sprint 84 (ADR-025)
 *
 * The contract ALL intelligence systems plug into for Bridge sessions.
 * Sprint 84 populates `persona` only. Sprint 87+ extends with brain,
 * context, skills, guardrails.
 *
 * 3-Layer Context Model:
 * - Launch-time (immutable, 7K ceiling): SOUL, role, guardrails — via CLI flag
 * - Turn-time (mutable, 2K per task): sprint goals, blockers — via sendKeys (Sprint 86)
 * - Post-turn (derived, 0 agent tokens): evaluator score, vibecoding — capture → store (Sprint 88)
 */

/** Valid agent roles — the 14 EndiorBot personas */
export type AgentRole =
  | "pm"
  | "architect"
  | "coder"
  | "reviewer"
  | "tester"
  | "researcher"
  | "devops"
  | "fullstack"
  | "pjm"
  | "ceo"
  | "cpo"
  | "cto"
  | "cso"
  | "assistant";

/** All valid agent roles as array for runtime validation */
export const VALID_AGENT_ROLES: readonly AgentRole[] = [
  "pm",
  "architect",
  "coder",
  "reviewer",
  "tester",
  "researcher",
  "devops",
  "fullstack",
  "pjm",
  "ceo",
  "cpo",
  "cto",
  "cso",
  "assistant",
] as const;

/** Persona layer — populated at session launch (Sprint 84) */
export interface PersonaEnvelope {
  /** Resolved agent role name */
  agentRole: AgentRole;
  /** SOUL template content (body, frontmatter stripped) */
  soulContent: string;
  /** SHA256 hash of soulContent for version tracking */
  soulContentHash: string;
}

/** Brain L4 layer — mental models injected at session launch (Sprint 87) */
export interface BrainEnvelope {
  /** Formatted L4 mental model rules */
  content: string;
  /** SHA256 hash of content */
  contentHash: string;
  /** Number of mental models loaded */
  modelCount: number;
  /** Source identifier (e.g. "mental-models.json") */
  source: string;
}

/** Context layer — project context injected at session launch (Sprint 87) */
export interface ContextEnvelope {
  /** Project/sprint name from active project */
  sprintName: string;
  /** Project tier (LITE/STANDARD/PROFESSIONAL/ENTERPRISE) */
  tier: string;
  /** Project filesystem path */
  projectPath: string;
  /** Formatted context text for injection */
  content: string;
  /** SHA256 hash of content */
  contentHash: string;
  /** Number of ClawVault facts injected into context (Sprint 124a) */
  injectedFactsCount?: number;
  /** IDs of injected facts for traceability (Sprint 124a) */
  factIdsUsed?: string[];
  /** CRG graph context — blast radius / architecture (Sprint 131, ADR-045) */
  graphContext?: string;
}

/** Signal breakdown for vibecoding index (Sprint 88) */
export interface EvaluatorSignals {
  /** Test patterns relative to implementation lines (weight: 25%) */
  codeTestRatio: number;
  /** JSDoc/inline comment coverage (weight: 15%) */
  commentDensity: number;
  /** Presence of anti-patterns: any, console.error, TODO, FIXME (weight: 25%) */
  errorPatterns: number;
  /** Cyclomatic complexity estimate from control-flow keywords (weight: 20%) */
  complexity: number;
  /** Lint error/warning count in captured output (weight: 15%) */
  lintCompliance: number;
}

/** Evaluator layer — post-turn quality scores (Sprint 88) */
export interface EvaluatorEnvelope {
  /** Turn number this evaluation covers */
  turnNumber: number;
  /** ISO 8601 timestamp of evaluation */
  evaluatedAt: string;
  /** Vibecoding index score (0-100, weighted average of 5 signals) */
  score: number;
  /** Per-signal breakdown */
  signals: EvaluatorSignals;
  /** Human-readable summary (PASS/WARN + top weaknesses) */
  summary: string;
  /** SHA256 hash of captured output used for scoring */
  captureHash: string;
}

/**
 * SessionIntelligenceEnvelope
 *
 * The extensible container for all intelligence injected into a Bridge session.
 * Sprint 84: `persona` layer.
 * Sprint 87: `brain` (L4 mental models) + `context` (project state).
 * Sprint 88: `evaluator` (post-turn vibecoding scores).
 */
export interface SessionIntelligenceEnvelope {
  /** Agent persona — SOUL template content + metadata */
  persona: PersonaEnvelope;
  /** Brain L4 mental models — immutable per session (Sprint 87) */
  brain?: BrainEnvelope;
  /** Project context — refreshable via /send (Sprint 87) */
  context?: ContextEnvelope;
  /** Post-turn evaluator scores — derived, 0 agent tokens (Sprint 88) */
  evaluator?: EvaluatorEnvelope;
}

/** Check if a string is a valid AgentRole */
export function isValidAgentRole(role: string): role is AgentRole {
  return VALID_AGENT_ROLES.includes(role as AgentRole);
}
