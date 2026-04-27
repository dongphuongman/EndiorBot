/**
 * Mention Parser
 *
 * Parses @agent and @team mentions from CLI and OTT formats.
 * Based on tinysdlc routing patterns.
 *
 * Supported formats:
 * - CLI: `endiorbot @pm "plan payment gateway"`
 * - CLI: `endiorbot @pm plan payment gateway`
 * - OTT: `[@pm: plan payment gateway]`
 * - Multi: `[@pm,architect: design the system]`
 * - Team: `@planning "design auth system"` (resolves via TeamRegistry)
 *
 * Namespace resolution order: agent first, team second.
 * @pm always routes to PM directly. @planning routes via team.
 *
 * @module agents/orchestrator/mention-parser
 * @version 2.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 74 (Team Agent System)
 * @authority ADR-017 Team Agent System
 */

import {
  type AgentRole,
  isValidRole,
  isSE4ARole,
} from "../types/handoff.js";
import type { TeamId } from "../types/team.js";
import type { TeamRegistry } from "./team-registry.js";
import type { CrossSystemRoute } from "../../mcp-gateway/types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed mention result.
 */
export interface ParsedMention {
  /** Target agent role(s) */
  agents: AgentRole[];
  /** Message/task for the agent(s) */
  message: string;
  /** Original input */
  originalInput: string;
  /** Whether this is a team mention (derived from teamId presence) */
  isTeam: boolean;
  /** Team ID if this is a team mention. isTeam === (teamId !== undefined). */
  teamId?: TeamId;
  /** Parse warnings (non-fatal) */
  warnings: string[];
  /** Cross-system route (Sprint 113, ADR-034). When set, agents is empty. */
  crossSystem?: CrossSystemRoute;
}

/**
 * Parse error result.
 */
export interface ParseError {
  /** Error code */
  code: "INVALID_AGENT" | "EMPTY_MESSAGE" | "INVALID_FORMAT" | "NO_MENTION";
  /** Error message */
  message: string;
  /** Original input */
  originalInput: string;
}

/**
 * Parse result - either success or error.
 */
export type ParseResult =
  | { success: true; data: ParsedMention }
  | { success: false; error: ParseError };

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * CLI format: @agent "message" or @agent message
 */
const CLI_PATTERN = /^@(\S+)\s+(?:"([^"]+)"|(.+))$/;

/**
 * OTT format: [@agent: message]
 */
const OTT_PATTERN = /\[@(\S+?):\s*([\s\S]*?)\]/g;

/**
 * Simple @agent at start of message
 */
const SIMPLE_MENTION_PATTERN = /^@(\S+)\s+([\s\S]*)$/;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse a CLI-format mention.
 *
 * @example
 * parseCLIMention('@pm "plan payment gateway"')
 * // { success: true, data: { agents: ['pm'], message: 'plan payment gateway', ... } }
 *
 * @example
 * parseCLIMention('@pm plan payment gateway')
 * // { success: true, data: { agents: ['pm'], message: 'plan payment gateway', ... } }
 */
export function parseCLIMention(input: string, teamRegistry?: TeamRegistry): ParseResult {
  const trimmed = input.trim();

  if (!trimmed.startsWith("@")) {
    return {
      success: false,
      error: {
        code: "NO_MENTION",
        message: "Input does not start with @agent mention",
        originalInput: input,
      },
    };
  }

  // Try quoted format first: @agent "message"
  const cliMatch = trimmed.match(CLI_PATTERN);
  if (cliMatch && cliMatch[1]) {
    const agentPart = cliMatch[1].toLowerCase();
    const message = cliMatch[2] ?? cliMatch[3] ?? ""; // Quoted or unquoted

    return parseAgentPart(agentPart, message.trim(), input, teamRegistry);
  }

  // Try simple format: @agent message
  const simpleMatch = trimmed.match(SIMPLE_MENTION_PATTERN);
  if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
    const agentPart = simpleMatch[1].toLowerCase();
    const message = simpleMatch[2].trim();

    return parseAgentPart(agentPart, message, input, teamRegistry);
  }

  return {
    success: false,
    error: {
      code: "INVALID_FORMAT",
      message: "Could not parse @agent mention format",
      originalInput: input,
    },
  };
}

/**
 * Parse an OTT-format mention.
 * Extracts all [@agent: message] tags from text.
 *
 * @example
 * parseOTTMention('Hello [@pm: plan payment gateway]')
 * // { success: true, data: { agents: ['pm'], message: 'plan payment gateway', ... } }
 */
export function parseOTTMention(input: string): ParseResult {
  const matches: Array<{ agents: string[]; message: string }> = [];

  OTT_PATTERN.lastIndex = 0; // Reset regex state
  let match: RegExpExecArray | null;

  while ((match = OTT_PATTERN.exec(input)) !== null) {
    if (!match[1] || !match[2]) continue;
    const agentPart = match[1].toLowerCase();
    const message = match[2].trim();

    // Support comma-separated: [@pm,architect: message]
    const agents = agentPart.split(",").map((a) => a.trim()).filter(Boolean);

    matches.push({ agents, message });
  }

  if (matches.length === 0) {
    return {
      success: false,
      error: {
        code: "NO_MENTION",
        message: "No [@agent: message] tags found",
        originalInput: input,
      },
    };
  }

  // Combine all matches
  const allAgents: AgentRole[] = [];
  const allMessages: string[] = [];
  const warnings: string[] = [];

  for (const m of matches) {
    for (const agent of m.agents) {
      // Cross-system detection: [@mtclaw.<agent>: message] (Sprint 113, ADR-034)
      if (agent.startsWith("mtclaw.")) {
        const remoteAgent = agent.slice(7);
        if (remoteAgent.length > 0) {
          const result: ParsedMention = {
            agents: [],
            message: m.message,
            originalInput: input,
            isTeam: false,
            warnings: [],
          };
          result.crossSystem = { system: "mtclaw", agent: remoteAgent, task: m.message };
          return { success: true, data: result };
        }
      }

      if (isValidRole(agent)) {
        if (!allAgents.includes(agent as AgentRole)) {
          allAgents.push(agent as AgentRole);
        }
      } else {
        warnings.push(`Unknown agent: @${agent}`);
      }
    }
    if (m.message) {
      allMessages.push(m.message);
    }
  }

  if (allAgents.length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_AGENT",
        message: `No valid agents found. ${warnings.join("; ")}`,
        originalInput: input,
      },
    };
  }

  // Get shared context (text outside tags)
  const sharedContext = input.replace(OTT_PATTERN, "").trim();
  const fullMessage = sharedContext
    ? `${sharedContext}\n\n---\n\n${allMessages.join("\n\n")}`
    : allMessages.join("\n\n");

  return {
    success: true,
    data: {
      agents: allAgents,
      message: fullMessage,
      originalInput: input,
      isTeam: false,
      warnings,
    },
  };
}

/**
 * Parse agent mention from any format (auto-detect).
 *
 * When a TeamRegistry is provided, team names are also resolved.
 * Namespace resolution order: agent first, team second.
 *
 * @param input - The input string to parse
 * @param teamRegistry - Optional TeamRegistry for team detection
 */
export function parseMention(input: string, teamRegistry?: TeamRegistry): ParseResult {
  const trimmed = input.trim();

  // Check for OTT format first (has brackets)
  if (trimmed.includes("[@") && trimmed.includes("]")) {
    return parseOTTMention(trimmed);
  }

  // Check for CLI format
  if (trimmed.startsWith("@")) {
    return parseCLIMention(trimmed, teamRegistry);
  }

  return {
    success: false,
    error: {
      code: "NO_MENTION",
      message: "No agent mention found. Use @agent or [@agent: message] format.",
      originalInput: input,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse agent part (handles comma-separated, team detection, and validation).
 *
 * Namespace resolution order (per ADR-017):
 * 1. Check isValidRole(candidate) → agent route
 * 2. Check teamRegistry?.isTeam(candidate) → team route (resolve to leader)
 * 3. Unknown → warning
 */
function parseAgentPart(
  agentPart: string,
  message: string,
  originalInput: string,
  teamRegistry?: TeamRegistry,
): ParseResult {
  // Validate message
  if (!message || message.length === 0) {
    return {
      success: false,
      error: {
        code: "EMPTY_MESSAGE",
        message: "Message cannot be empty",
        originalInput,
      },
    };
  }

  // Support comma-separated: @pm,architect
  const agentCandidates = agentPart.split(",").map((a) => a.trim()).filter(Boolean);
  const validAgents: AgentRole[] = [];
  const warnings: string[] = [];
  let detectedTeamId: TeamId | undefined;

  for (const candidate of agentCandidates) {
    // 1. Agent-first resolution
    if (isValidRole(candidate)) {
      validAgents.push(candidate as AgentRole);
      continue;
    }

    // 2. Team detection (if registry provided)
    if (teamRegistry && teamRegistry.isTeam(candidate)) {
      const lookup = teamRegistry.getTeam(candidate);
      if (lookup.found) {
        detectedTeamId = lookup.team.id;
        validAgents.push(lookup.team.leader);
        continue;
      }
    }

    // 2.5 Cross-system detection: @mtclaw.<agent> (Sprint 113, ADR-034)
    //     Returns immediately — cross-system is single-route, no multi-agent mixing.
    //     agents: [] → decomposer bypass (CPO C3). (CTO C4: exactOptionalPropertyTypes)
    if (candidate.startsWith("mtclaw.")) {
      const remoteAgent = candidate.slice(7);
      if (remoteAgent.length > 0) {
        const result: ParsedMention = {
          agents: [],
          message,
          originalInput,
          isTeam: false,
          warnings: [],
        };
        result.crossSystem = { system: "mtclaw", agent: remoteAgent, task: message };
        return { success: true, data: result };
      }
    }

    // 3. Unknown
    warnings.push(`Unknown agent: @${candidate}`);
  }

  if (validAgents.length === 0) {
    return {
      success: false,
      error: {
        code: "INVALID_AGENT",
        message: `No valid agents or teams found. Valid agents: researcher, pm, pjm, architect, coder, reviewer, tester, devops, fullstack, assistant. Valid teams: planning, design, dev, qa, ops, fullstack, executive`,
        originalInput,
      },
    };
  }

  // B3: isTeam derived from teamId presence (not set independently)
  const isTeam = detectedTeamId !== undefined;

  const result: ParsedMention = {
    agents: validAgents,
    message,
    originalInput,
    isTeam,
    warnings,
  };

  // exactOptionalPropertyTypes: only set teamId if defined
  if (detectedTeamId !== undefined) {
    result.teamId = detectedTeamId;
  }

  return {
    success: true,
    data: result,
  };
}

/**
 * Extract first agent from a parsed mention (for single-agent routing).
 */
export function getFirstAgent(result: ParseResult): AgentRole | null {
  if (!result.success) return null;
  return result.data.agents[0] ?? null;
}

/**
 * Check if a string contains any agent mention.
 */
export function hasMention(input: string, teamRegistry?: TeamRegistry): boolean {
  const result = parseMention(input, teamRegistry);
  return result.success;
}

/**
 * Get all SE4A (executor) agents from a parsed mention.
 */
export function getExecutorAgents(result: ParseResult): AgentRole[] {
  if (!result.success) return [];
  return result.data.agents.filter(isSE4ARole);
}

/**
 * Format an agent mention for display.
 */
export function formatMention(agent: AgentRole, message: string): string {
  return `[@${agent}: ${message}]`;
}

