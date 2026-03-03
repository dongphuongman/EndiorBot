/**
 * Team Types & Schema
 *
 * Types for team-based agent routing. Teams resolve to leader agents
 * with enriched context (charter, teammates, delegation rules).
 *
 * Teams are NOT new AgentRole values — they resolve to existing agents.
 *
 * @module agents/types/team
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74
 * @authority ADR-017 Team Agent System
 */

import type { AgentRole } from "./handoff.js";

// ============================================================================
// Team Archetypes
// ============================================================================

/**
 * Team archetype identifiers.
 * Each archetype covers a set of SDLC stages.
 */
export type TeamArchetype =
  | "fullstack"   // Stages 00-07, LITE composite
  | "planning"    // Stages 00-01, requirements & research
  | "design"      // Stages 02-03, architecture & integration
  | "dev"         // Stage 04, implementation
  | "qa"          // Stage 05, testing & quality
  | "ops"         // Stages 06-07, deployment & operations
  | "executive";  // Advisory, all stages

/**
 * Team identifiers. Same as archetypes in v1 (1:1 mapping).
 */
export type TeamId =
  | "fullstack"
  | "planning"
  | "design"
  | "dev"
  | "qa"
  | "ops"
  | "executive";

// ============================================================================
// Team Config (from tier JSON)
// ============================================================================

/**
 * Team entry as stored in tier config JSON files.
 * This is the shape of `sdlc.teams[teamId]` in endiorbot-{TIER}.json.
 */
export interface TeamConfigEntry {
  /** Team archetype */
  archetype: string;
  /** Leader agent role */
  leader: string;
  /** Member agent roles */
  members: string[];
}

// ============================================================================
// Team Definition (runtime)
// ============================================================================

/**
 * SDLC metadata per team archetype.
 */
export interface TeamSDLCInfo {
  /** SDLC stages this team covers */
  stages: string[];
  /** Gates this team is responsible for */
  gates: string[];
}

/**
 * Fully resolved team definition.
 */
export interface TeamDefinition {
  /** Team identifier (e.g., "planning") */
  id: TeamId;
  /** Display name (e.g., "Planning Team") */
  name: string;
  /** Team archetype */
  archetype: TeamArchetype;
  /** Leader agent role */
  leader: AgentRole;
  /** Member agent roles (includes leader) */
  members: AgentRole[];
  /** SDLC stages this team covers */
  sdlcStages: string[];
  /** Gates this team is responsible for */
  sdlcGates: string[];
  /** Whether this team is active in current tier */
  isActive: boolean;
}

// ============================================================================
// Team Context (injected into SOUL)
// ============================================================================

/**
 * Teammate info for context injection.
 */
export interface TeammateInfo {
  /** Agent role */
  role: AgentRole;
  /** Agent description */
  description: string;
}

/**
 * Context injected into leader's SOUL template when routing via team.
 */
export interface TeamContext {
  /** Team identifier */
  teamId: TeamId;
  /** Team display name */
  teamName: string;
  /** Leader role */
  leader: AgentRole;
  /** Teammates (excluding leader) */
  teammates: TeammateInfo[];
  /** Delegation instruction text */
  delegationInstruction: string;
  /** Charter content (if loaded) */
  charter: string;
}

// ============================================================================
// Team Routing Results
// ============================================================================

/**
 * Result of looking up a team by ID.
 */
export type TeamLookupResult =
  | { found: true; team: TeamDefinition }
  | { found: false; reason: string };

/**
 * Result of resolving a team to a routing target.
 */
export interface TeamRoutingResult {
  /** Resolved leader agent */
  leader: AgentRole;
  /** Team definition */
  team: TeamDefinition;
  /** Context to inject into leader's SOUL */
  context: TeamContext;
}

/**
 * Outcome of team routing (success or error).
 */
export type TeamRoutingOutcome =
  | { success: true; result: TeamRoutingResult }
  | { success: false; error: TeamRoutingError };

/**
 * Team routing error.
 */
export interface TeamRoutingError {
  code:
    | "TEAM_NOT_FOUND"
    | "TEAM_INACTIVE"
    | "LEADER_NOT_FOUND"
    | "CHARTER_LOAD_FAILED";
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Team Transitions
// ============================================================================

/**
 * Allowed team-to-team transitions.
 * Defines which teams can escalate/delegate to which other teams.
 */
export const ALLOWED_TEAM_TRANSITIONS: Record<TeamId, readonly TeamId[]> = {
  fullstack: [] as const,                                     // Self-contained
  planning: ["design", "dev"] as const,                       // Plan → Design or Dev
  design: ["dev", "planning"] as const,                       // Design → Dev or back to Planning
  dev: ["qa", "planning"] as const,                           // Dev → QA or escalate to Planning
  qa: ["dev", "ops"] as const,                                // QA → Dev (fix) or Ops (deploy)
  ops: ["qa"] as const,                                       // Ops → QA (verify)
  executive: ["planning", "dev", "qa", "ops"] as const,       // Executive can direct any team
} as const;

// ============================================================================
// SDLC Metadata per Archetype
// ============================================================================

/**
 * Static SDLC info for each team archetype.
 * Stages and gates associated with each team type.
 */
export const TEAM_SDLC_INFO: Record<TeamArchetype, TeamSDLCInfo> = {
  fullstack: {
    stages: ["00", "01", "02", "04", "05", "06"],
    gates: ["G0.1", "G0.2", "G1", "G2", "G-Sprint", "G3", "G4"],
  },
  planning: {
    stages: ["00", "01"],
    gates: ["G0.1", "G0.2", "G1"],
  },
  design: {
    stages: ["02", "03"],
    gates: ["G2"],
  },
  dev: {
    stages: ["04"],
    gates: ["G-Sprint"],
  },
  qa: {
    stages: ["05"],
    gates: ["G3"],
  },
  ops: {
    stages: ["06", "07"],
    gates: ["G4"],
  },
  executive: {
    stages: [],
    gates: ["G0.1", "G1", "G2", "G3", "G4"],
  },
};

// ============================================================================
// Team Display Names
// ============================================================================

/**
 * Display names for each team.
 */
export const TEAM_DISPLAY_NAMES: Record<TeamId, string> = {
  fullstack: "Full Stack Team",
  planning: "Planning Team",
  design: "Design Team",
  dev: "Development Team",
  qa: "Quality Assurance Team",
  ops: "Operations Team",
  executive: "Executive Team",
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * All valid team IDs.
 */
const VALID_TEAM_IDS: readonly string[] = [
  "fullstack", "planning", "design", "dev", "qa", "ops", "executive",
];

/**
 * Check if a string is a valid team ID.
 */
export function isValidTeamId(id: string): id is TeamId {
  return VALID_TEAM_IDS.includes(id);
}

/**
 * Check if a string is a valid team archetype.
 */
export function isValidTeamArchetype(archetype: string): archetype is TeamArchetype {
  return VALID_TEAM_IDS.includes(archetype); // Same set in v1
}

/**
 * Check if a team-to-team transition is allowed.
 */
export function isAllowedTeamTransition(from: TeamId, to: TeamId): boolean {
  const allowed = ALLOWED_TEAM_TRANSITIONS[from];
  return allowed.includes(to);
}
