/**
 * Agent Router
 *
 * Routes @agent mentions to existing agents, loads SOUL templates,
 * and validates transitions using the ALLOWED_TRANSITIONS map.
 *
 * Integration:
 * - Uses existing SOUL templates from docs/reference/templates/souls/
 * - Uses existing tier configs from docs/reference/templates/configs/
 * - Validates transitions via handoff.ts ALLOWED_TRANSITIONS
 *
 * @module agents/orchestrator/agent-router
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  type AgentRole,
  type HandoffPriority,
  type ParsedHandoff,
  ALLOWED_TRANSITIONS,
  isValidRole,
  isSE4ARole,
  isAllowedTransition,
} from "../types/handoff.js";
import {
  type ParsedMention,
  parseMention,
} from "./mention-parser.js";
import { getTaskClassifier, type TaskClassifier } from "./task-classifier.js";
import type { TaskType, TaskComplexity, ModelTier } from "../types.js";
import { resolveTemplatesRoot } from "../../config/paths.js";

// ============================================================================
// Types
// ============================================================================

/**
 * SOUL template metadata from frontmatter.
 */
export interface SoulMetadata {
  role: AgentRole;
  category: "executor" | "advisor" | "router";
  version: string;
  sdlcStages: string[];
  sdlcGates: string[];
  created: string;
}

/**
 * Loaded SOUL template.
 */
export interface SoulTemplate {
  metadata: SoulMetadata;
  content: string;
  path: string;
}

/**
 * Tier configuration.
 */
export interface TierConfig {
  meta: {
    template: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
    version: string;
    description: string;
  };
  agents: {
    defaults: Record<string, unknown>;
    list: Array<{
      id: string;
      role: AgentRole;
      default?: boolean;
      description: string;
    }>;
  };
  sdlc: {
    enabled: boolean;
    tier: string;
    teams: Record<string, unknown>;
    gates: Record<string, unknown>;
    workflow: Record<string, unknown>;
  };
}

/**
 * Routing decision result.
 */
export interface RoutingDecision {
  /** Target agent role */
  agent: AgentRole;
  /** Loaded SOUL template */
  soul: SoulTemplate;
  /** Message/task for the agent */
  message: string;
  /** Task classification */
  classification: {
    taskType: TaskType;
    complexity: TaskComplexity;
    minModelTier: ModelTier;
    complexityScore: number;
  };
  /** Active tier */
  tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  /** Is agent active in current tier? */
  isActiveInTier: boolean;
  /** Warnings (non-fatal) */
  warnings: string[];
}

/**
 * Routing error result.
 */
export interface RoutingError {
  code:
    | "AGENT_NOT_FOUND"
    | "SOUL_NOT_FOUND"
    | "TRANSITION_BLOCKED"
    | "AGENT_INACTIVE"
    | "INVALID_MENTION";
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Routing result - either success or error.
 */
export type RoutingResult =
  | { success: true; decision: RoutingDecision }
  | { success: false; error: RoutingError };

/**
 * Router configuration.
 */
export interface RouterConfig {
  /** Root directory for templates */
  templatesRoot: string;
  /** Current project tier */
  tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  /** Allow inactive agents (with warning) */
  allowInactiveAgents: boolean;
}

// ============================================================================
// AgentRouter Class
// ============================================================================

/**
 * Routes @agent mentions to appropriate agents.
 *
 * Features:
 * - Loads SOUL templates from filesystem
 * - Validates transitions using ALLOWED_TRANSITIONS
 * - Checks agent availability per tier
 * - Integrates with TaskClassifier for complexity
 */
export class AgentRouter {
  private readonly config: RouterConfig;
  private readonly classifier: TaskClassifier;
  private readonly soulCache: Map<AgentRole, SoulTemplate> = new Map();
  private tierConfig: TierConfig | undefined;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      templatesRoot: config.templatesRoot ?? "docs/reference/templates",
      tier: config.tier ?? "LITE",
      allowInactiveAgents: config.allowInactiveAgents ?? true,
    };
    this.classifier = getTaskClassifier();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Route a mention to the appropriate agent.
   *
   * @example
   * const result = await router.route('@pm "plan payment gateway"');
   * if (result.success) {
   *   console.log(result.decision.agent); // 'pm'
   *   console.log(result.decision.soul.content); // SOUL template content
   * }
   */
  async route(input: string | ParsedMention): Promise<RoutingResult> {
    // Parse mention if needed
    let mention: ParsedMention;
    if (typeof input === "string") {
      const parseResult = parseMention(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: {
            code: "INVALID_MENTION",
            message: parseResult.error.message,
            details: { originalInput: parseResult.error.originalInput },
          },
        };
      }
      mention = parseResult.data;
    } else {
      mention = input;
    }

    // Get primary agent (first in list)
    const agent = mention.agents[0];
    if (!agent || !isValidRole(agent)) {
      return {
        success: false,
        error: {
          code: "AGENT_NOT_FOUND",
          message: `Invalid agent role: ${agent}`,
          details: { agents: mention.agents },
        },
      };
    }

    // Load SOUL template
    const soul = await this.loadSoul(agent);
    if (!soul) {
      return {
        success: false,
        error: {
          code: "SOUL_NOT_FOUND",
          message: `SOUL template not found for agent: ${agent}`,
          details: { agent, path: this.getSoulPath(agent) },
        },
      };
    }

    // Load tier config
    await this.ensureTierConfig();

    // Check if agent is active in current tier
    const isActiveInTier = this.isAgentActiveInTier(agent);
    const warnings: string[] = [...mention.warnings];

    if (!isActiveInTier) {
      if (!this.config.allowInactiveAgents) {
        return {
          success: false,
          error: {
            code: "AGENT_INACTIVE",
            message: `Agent @${agent} is not active in ${this.config.tier} tier`,
            details: { agent, tier: this.config.tier },
          },
        };
      }
      warnings.push(
        `Agent @${agent} is not in ${this.config.tier} tier - proceeding with fallback`
      );
    }

    // Classify task
    const classification = this.classifier.classify(mention.message);

    return {
      success: true,
      decision: {
        agent,
        soul,
        message: mention.message,
        classification: {
          taskType: classification.taskType,
          complexity: classification.complexity,
          minModelTier: classification.minModelTier,
          complexityScore: classification.complexityScore,
        },
        tier: this.config.tier,
        isActiveInTier,
        warnings,
      },
    };
  }

  /**
   * Validate a handoff transition.
   *
   * @example
   * const result = router.validateTransition('pm', 'architect');
   * // { allowed: true, from: 'pm', to: 'architect' }
   *
   * const blocked = router.validateTransition('pm', 'devops');
   * // { allowed: false, from: 'pm', to: 'devops', reason: 'PM cannot hand off to DevOps directly' }
   */
  validateTransition(
    from: AgentRole,
    to: AgentRole
  ): { allowed: boolean; from: AgentRole; to: AgentRole; reason?: string } {
    if (!isValidRole(from) || !isValidRole(to)) {
      return {
        allowed: false,
        from,
        to,
        reason: `Invalid role: ${!isValidRole(from) ? from : to}`,
      };
    }

    const allowed = isAllowedTransition(from, to);
    if (allowed) {
      return { allowed: true, from, to };
    }

    // Build helpful reason
    const allowedTargets = ALLOWED_TRANSITIONS[from];
    const reason =
      allowedTargets.length === 0
        ? `${from} cannot delegate to other agents`
        : `${from} can only hand off to: ${allowedTargets.join(", ")}`;

    return { allowed: false, from, to, reason };
  }

  /**
   * Create a parsed handoff from a routing decision and target.
   */
  createHandoff(
    decision: RoutingDecision,
    target: AgentRole,
    intent: string,
    priority: HandoffPriority = "P1"
  ): ParsedHandoff | RoutingError {
    const validation = this.validateTransition(decision.agent, target);
    if (!validation.allowed) {
      return {
        code: "TRANSITION_BLOCKED",
        message: validation.reason ?? "Transition not allowed",
        details: { from: decision.agent, to: target },
      };
    }

    return {
      from: decision.agent,
      to: target,
      intent,
      priority,
      inputs: { originalMessage: decision.message },
      reason: `Handoff from ${decision.agent} to ${target}`,
      depth: 1, // Will be updated by workflow engine
      timestamp: new Date(),
      correlationId: `hf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  /**
   * Get available agents for current tier.
   */
  async getAvailableAgents(): Promise<AgentRole[]> {
    await this.ensureTierConfig();
    if (!this.tierConfig) {
      // Return all SE4A agents as fallback
      return [
        "researcher",
        "pm",
        "pjm",
        "architect",
        "coder",
        "reviewer",
        "tester",
        "devops",
        "fullstack",
        "assistant",
      ];
    }
    return this.tierConfig.agents.list.map((a) => a.role);
  }

  /**
   * Get allowed handoff targets for an agent.
   */
  getAllowedTargets(agent: AgentRole): readonly AgentRole[] {
    return ALLOWED_TRANSITIONS[agent] ?? [];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Load a SOUL template from filesystem.
   */
  private async loadSoul(agent: AgentRole): Promise<SoulTemplate | undefined> {
    // Check cache
    if (this.soulCache.has(agent)) {
      return this.soulCache.get(agent);
    }

    const soulPath = this.getSoulPath(agent);
    if (!existsSync(soulPath)) {
      return undefined;
    }

    try {
      const content = await readFile(soulPath, "utf-8");
      const template = this.parseSoulTemplate(content, soulPath);
      this.soulCache.set(agent, template);
      return template;
    } catch {
      return undefined;
    }
  }

  /**
   * Parse SOUL template with YAML frontmatter.
   */
  private parseSoulTemplate(content: string, path: string): SoulTemplate {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

    const today = new Date().toISOString().split("T")[0] ?? "1970-01-01";

    if (!frontmatterMatch || !frontmatterMatch[1]) {
      // No frontmatter, use defaults
      return {
        metadata: {
          role: "assistant" as AgentRole,
          category: "router",
          version: "1.0.0",
          sdlcStages: [],
          sdlcGates: [],
          created: today,
        },
        content,
        path,
      };
    }

    const frontmatter = frontmatterMatch[1];
    const bodyContent = content.slice(frontmatterMatch[0].length);

    // Simple YAML parsing for our frontmatter
    const metadata: SoulMetadata = {
      role: "assistant" as AgentRole,
      category: "router",
      version: "1.0.0",
      sdlcStages: [],
      sdlcGates: [],
      created: today,
    };

    for (const line of frontmatter.split("\n")) {
      const [key, ...valueParts] = line.split(":");
      if (!key || valueParts.length === 0) continue;

      const value = valueParts.join(":").trim();

      switch (key.trim()) {
        case "role":
          if (isValidRole(value)) {
            metadata.role = value as AgentRole;
          }
          break;
        case "category":
          if (value === "executor" || value === "advisor" || value === "router") {
            metadata.category = value;
          }
          break;
        case "version":
          metadata.version = value;
          break;
        case "sdlc_stages":
          // Parse JSON array
          try {
            const stages = JSON.parse(value);
            if (Array.isArray(stages)) {
              metadata.sdlcStages = stages;
            }
          } catch {
            // Ignore parse errors
          }
          break;
        case "sdlc_gates":
          try {
            const gates = JSON.parse(value);
            if (Array.isArray(gates)) {
              metadata.sdlcGates = gates;
            }
          } catch {
            // Ignore parse errors
          }
          break;
        case "created":
          metadata.created = value;
          break;
      }
    }

    return { metadata, content: bodyContent, path };
  }

  /**
   * Get SOUL template path for an agent.
   * Resolves from EndiorBot's package directory, not process.cwd().
   */
  private getSoulPath(agent: AgentRole): string {
    return join(
      resolveTemplatesRoot(),
      "souls",
      `SOUL-${agent}.md`
    );
  }

  /**
   * Load tier configuration.
   * Resolves from EndiorBot's package directory, not process.cwd().
   */
  private async ensureTierConfig(): Promise<void> {
    if (this.tierConfig) return;

    const configPath = join(
      resolveTemplatesRoot(),
      "configs",
      `endiorbot-${this.config.tier}.json`
    );

    if (!existsSync(configPath)) {
      return;
    }

    try {
      const content = await readFile(configPath, "utf-8");
      this.tierConfig = JSON.parse(content) as TierConfig;
    } catch {
      // Ignore parse errors
    }
  }

  /**
   * Check if an agent is active in current tier.
   */
  private isAgentActiveInTier(agent: AgentRole): boolean {
    if (!this.tierConfig) {
      // No config - assume all SE4A agents are available
      return isSE4ARole(agent) || agent === "assistant";
    }

    return this.tierConfig.agents.list.some((a) => a.role === agent);
  }

  /**
   * Update router tier.
   */
  setTier(tier: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE"): void {
    this.config.tier = tier;
    this.tierConfig = undefined; // Force reload
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalRouter: AgentRouter | undefined;

/**
 * Get the global AgentRouter instance.
 */
export function getAgentRouter(config?: Partial<RouterConfig>): AgentRouter {
  if (!globalRouter) {
    globalRouter = new AgentRouter(config);
  }
  return globalRouter;
}

/**
 * Reset the global AgentRouter (for testing).
 */
export function resetAgentRouter(): void {
  globalRouter = undefined;
}

/**
 * Create a new AgentRouter instance.
 */
export function createAgentRouter(config?: Partial<RouterConfig>): AgentRouter {
  return new AgentRouter(config);
}
