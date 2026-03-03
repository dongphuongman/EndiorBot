/**
 * Team Registry
 *
 * Manages team definitions loaded from tier config JSON files.
 * Provides team lookup, resolution to leader agents, and charter loading.
 *
 * Integration:
 * - Reads teams from tier config's `sdlc.teams` (same JSON files as AgentRouter)
 * - Loads charter templates from docs/reference/templates/teams/
 * - Produces TeamContext for injection into leader's SOUL template
 *
 * @module agents/orchestrator/team-registry
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74
 * @authority ADR-017 Team Agent System
 */

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole } from "../types/handoff.js";
import { isValidRole } from "../types/handoff.js";
import {
  type TeamId,
  type TeamArchetype,
  type TeamConfigEntry,
  type TeamDefinition,
  type TeamContext,
  type TeamLookupResult,
  type TeamRoutingOutcome,
  type TeammateInfo,
  TEAM_SDLC_INFO,
  TEAM_DISPLAY_NAMES,
  isValidTeamId,
  isValidTeamArchetype,
} from "../types/team.js";
import { resolveTemplatesRoot } from "../../config/paths.js";

// ============================================================================
// Agent Descriptions (for teammate context)
// ============================================================================

/**
 * Brief descriptions for each agent role.
 * Used when injecting teammate context into leader's SOUL.
 */
const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  researcher: "Discovery and user research",
  pm: "Requirements and user stories",
  pjm: "Sprint coordination and task tracking",
  architect: "System design and ADRs",
  coder: "Implementation and TDD",
  reviewer: "Code review and standards",
  tester: "Testing and quality assurance",
  devops: "Deployment and operations",
  fullstack: "Full-stack development (all stages)",
  ceo: "Strategic direction",
  cpo: "Product vision and prioritization",
  cto: "Technical standards and architecture review",
  assistant: "Message routing and delegation",
};

// ============================================================================
// TeamRegistry Class
// ============================================================================

/**
 * Registry for team definitions.
 *
 * Features:
 * - Loads teams from tier config JSON files
 * - Resolves team ID to leader agent with context
 * - Loads team charter templates
 * - Caches loaded charters
 */
export class TeamRegistry {
  private teams: Map<TeamId, TeamDefinition> = new Map();
  private charterCache: Map<TeamId, string> = new Map();
  private tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  private loaded = false;

  constructor(tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE" = "LITE") {
    this.tier = tier;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Check if an identifier is a known team.
   */
  isTeam(id: string): boolean {
    this.ensureLoaded();
    return this.teams.has(id as TeamId);
  }

  /**
   * Look up a team by ID.
   */
  getTeam(id: string): TeamLookupResult {
    this.ensureLoaded();

    if (!isValidTeamId(id)) {
      return { found: false, reason: `'${id}' is not a valid team identifier` };
    }

    const team = this.teams.get(id);
    if (!team) {
      return { found: false, reason: `Team '${id}' is not available in ${this.tier} tier` };
    }

    return { found: true, team };
  }

  /**
   * Get all teams available in current tier.
   */
  getAvailableTeams(): TeamDefinition[] {
    this.ensureLoaded();
    return Array.from(this.teams.values()).filter((t) => t.isActive);
  }

  /**
   * Get all teams that include a specific agent as member.
   */
  getTeamsForAgent(agent: AgentRole): TeamDefinition[] {
    this.ensureLoaded();
    return Array.from(this.teams.values()).filter(
      (t) => t.isActive && t.members.includes(agent),
    );
  }

  /**
   * Load a team charter from filesystem.
   */
  async loadCharter(teamId: TeamId): Promise<string | undefined> {
    // Check cache
    if (this.charterCache.has(teamId)) {
      return this.charterCache.get(teamId);
    }

    const charterPath = this.getCharterPath(teamId);
    if (!existsSync(charterPath)) {
      return undefined;
    }

    try {
      const content = await readFile(charterPath, "utf-8");
      // Strip frontmatter if present
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch ? (bodyMatch[1] ?? content) : content;
      this.charterCache.set(teamId, body);
      return body;
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve a team to its routing target (leader + context).
   */
  async resolveTeam(teamId: string): Promise<TeamRoutingOutcome> {
    const lookup = this.getTeam(teamId);
    if (!lookup.found) {
      return {
        success: false,
        error: {
          code: "TEAM_NOT_FOUND",
          message: lookup.reason,
          details: { teamId },
        },
      };
    }

    const { team } = lookup;

    if (!team.isActive) {
      return {
        success: false,
        error: {
          code: "TEAM_INACTIVE",
          message: `Team '${teamId}' is not active in ${this.tier} tier`,
          details: { teamId, tier: this.tier },
        },
      };
    }

    // Load charter (optional, non-blocking)
    const charter = await this.loadCharter(team.id);

    // Build teammate info (exclude leader)
    const teammates: TeammateInfo[] = team.members
      .filter((m) => m !== team.leader)
      .map((role) => ({
        role,
        description: AGENT_DESCRIPTIONS[role],
      }));

    // Build delegation instruction
    const delegationInstruction = this.buildDelegationInstruction(team, teammates);

    const context: TeamContext = {
      teamId: team.id,
      teamName: team.name,
      leader: team.leader,
      teammates,
      delegationInstruction,
      charter: charter ?? "",
    };

    return {
      success: true,
      result: {
        leader: team.leader,
        team,
        context,
      },
    };
  }

  /**
   * Update the tier and reload teams.
   */
  setTier(tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE"): void {
    this.tier = tier;
    this.teams.clear();
    this.charterCache.clear();
    this.loaded = false;
  }

  /**
   * Get current tier.
   */
  getTier(): string {
    return this.tier;
  }

  /**
   * Get all valid team IDs (regardless of tier).
   */
  getAllTeamIds(): TeamId[] {
    return ["fullstack", "planning", "design", "dev", "qa", "ops", "executive"];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Ensure teams are loaded from tier config.
   */
  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loadFromTierConfig();
    this.loaded = true;
  }

  /**
   * Load team definitions from tier config JSON.
   */
  private loadFromTierConfig(): void {
    const configPath = join(
      resolveTemplatesRoot(),
      "configs",
      `endiorbot-${this.tier}.json`,
    );

    if (!existsSync(configPath)) {
      return;
    }

    try {
      // Synchronous read for initial load (same pattern as tier config in AgentRouter)
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as {
        sdlc?: { teams?: Record<string, TeamConfigEntry> };
      };

      const teamsConfig = config.sdlc?.teams;
      if (!teamsConfig) return;

      for (const [id, entry] of Object.entries(teamsConfig)) {
        if (!isValidTeamId(id)) continue;

        const archetype = isValidTeamArchetype(entry.archetype)
          ? entry.archetype
          : (id as TeamArchetype);

        const leader = isValidRole(entry.leader) ? (entry.leader as AgentRole) : undefined;
        if (!leader) continue;

        const members = entry.members
          .filter((m): m is string => typeof m === "string" && isValidRole(m))
          .map((m) => m as AgentRole);

        // Ensure leader is in members
        if (!members.includes(leader)) {
          members.unshift(leader);
        }

        const sdlcInfo = TEAM_SDLC_INFO[archetype];

        const team: TeamDefinition = {
          id,
          name: TEAM_DISPLAY_NAMES[id],
          archetype,
          leader,
          members,
          sdlcStages: sdlcInfo.stages,
          sdlcGates: sdlcInfo.gates,
          isActive: true,
        };

        this.teams.set(id, team);
      }
    } catch {
      // Config load failed — no teams available
    }
  }

  /**
   * Get charter template path for a team.
   */
  private getCharterPath(teamId: TeamId): string {
    return join(
      resolveTemplatesRoot(),
      "teams",
      `TEAM-${teamId}.md`,
    );
  }

  /**
   * Build delegation instruction text for team context.
   */
  private buildDelegationInstruction(
    _team: TeamDefinition,
    teammates: TeammateInfo[],
  ): string {
    if (teammates.length === 0) {
      return "You are the sole member of this team. Handle all tasks directly.";
    }

    const lines: string[] = [
      "You can delegate tasks to your teammates using: [@agent: task description]",
      "Only delegate to agents listed in your team:",
    ];

    for (const t of teammates) {
      lines.push(`- @${t.role} — ${t.description}`);
    }

    lines.push("");
    lines.push("Delegation guidelines:");
    lines.push("- Break complex tasks into focused subtasks for each teammate");
    lines.push("- Provide clear context and acceptance criteria when delegating");
    lines.push("- Coordinate results from teammates before reporting back");

    return lines.join("\n");
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalRegistry: TeamRegistry | undefined;

/**
 * Get the global TeamRegistry instance.
 */
export function getTeamRegistry(
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE",
): TeamRegistry {
  if (!globalRegistry) {
    globalRegistry = new TeamRegistry(tier);
  }
  return globalRegistry;
}

/**
 * Reset the global TeamRegistry (for testing).
 */
export function resetTeamRegistry(): void {
  globalRegistry = undefined;
}

/**
 * Create a new TeamRegistry instance.
 */
export function createTeamRegistry(
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE",
): TeamRegistry {
  return new TeamRegistry(tier);
}
