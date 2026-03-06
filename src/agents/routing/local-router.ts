/**
 * Local Router Agent
 *
 * Routes CEO messages to the correct agent using a local Ollama model
 * (qwen3.5:9b) at zero cost. Falls back to Anthropic Haiku if Ollama
 * is unavailable (timeout 2s).
 *
 * @module agents/routing/local-router
 * @version 1.0.0
 * @date 2026-03-05
 * @status ACTIVE - Sprint 78
 * @authority ADR-021 Local Ollama Router Architecture
 * @stage 04 - BUILD
 */

import {
  createOllamaProvider,
  DEFAULT_ROUTER_MODEL,
} from "../../providers/ollama/index.js";
import { AnthropicProvider } from "../../providers/anthropic/index.js";
import type { AgentRole } from "../types/handoff.js";
import { isSE4ARole, isSE4HRole } from "../types/handoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a routing decision.
 */
export interface RouterDecision {
  /** Target agent role */
  agent: AgentRole;
  /** Confidence score 0-1 */
  confidence: number;
  /** Model that made the decision */
  routerModel: string;
  /** Latency in ms */
  latencyMs: number;
  /** Whether the Sonnet fallback was used */
  fallbackUsed: boolean;
}

/**
 * Optional context passed to the router.
 */
export interface RouterContext {
  /** Previous agent in conversation (avoids unnecessary re-routing) */
  previousAgent?: AgentRole;
  /** SDLC stage hint */
  stage?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Timeout for local Ollama routing (ms). Falls back to Sonnet if exceeded. */
const LOCAL_ROUTER_TIMEOUT_MS = 2000;

/** Fallback model (Haiku — fast + cheap for classification) */
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

/** System prompt — compact, classification-focused */
const ROUTER_SYSTEM_PROMPT = `You are an agent routing classifier for EndiorBot, a CEO power tool.
Given a user message, classify which agent should handle it.

Respond with JSON only (no markdown, no explanation):
{"agent":"<role>","confidence":<0.0-1.0>}

Agent roles and their responsibilities:
- researcher: Information gathering, analysis, research tasks
- pm: Project planning, requirements, sprint management, user stories
- pjm: Project management, timelines, resource coordination
- architect: System design, ADRs, technical decisions, architecture
- coder: Code writing, implementation, bug fixes, refactoring
- reviewer: Code review, quality checks, security audits
- tester: Test writing, QA, test plans, coverage
- devops: Deployment, CI/CD, infrastructure, Docker, cloud
- fullstack: Mixed frontend+backend tasks, general dev work
- ceo: Strategic decisions, business direction (route to ceo sparingly)
- cpo: Product vision, roadmap, feature prioritization
- cto: Technical standards, architecture decisions, tech debt

Default to "coder" for general development tasks.
Default to "pm" for planning and scheduling tasks.`;

// ============================================================================
// LocalRouterAgent
// ============================================================================

/**
 * Routes messages to agents using local Ollama (qwen3.5:9b).
 * Falls back to Anthropic Haiku within 2s if Ollama unavailable.
 */
export class LocalRouterAgent {
  private ollamaProvider = createOllamaProvider({
    defaultModel: DEFAULT_ROUTER_MODEL,
    timeoutMs: LOCAL_ROUTER_TIMEOUT_MS,
  });

  private fallbackProvider: AnthropicProvider | null = null;

  /**
   * Check if local Ollama is reachable and model is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await Promise.race([
        this.ollamaProvider.healthCheck(),
        new Promise<{ status: string }>((resolve) =>
          setTimeout(() => resolve({ status: "unhealthy" }), LOCAL_ROUTER_TIMEOUT_MS)
        ),
      ]);
      return health.status !== "unhealthy";
    } catch {
      return false;
    }
  }

  /**
   * Route a message to the appropriate agent.
   *
   * Uses local qwen3.5:9b for routing. Falls back to Anthropic Haiku
   * if Ollama is unreachable or returns invalid JSON.
   */
  async route(message: string, context?: RouterContext): Promise<RouterDecision> {
    const start = Date.now();

    // Try local first
    try {
      const localResult = await Promise.race([
        this.routeLocal(message, context),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCAL_ROUTER_TIMEOUT_MS)),
      ]);

      if (localResult) {
        return {
          ...localResult,
          latencyMs: Date.now() - start,
          fallbackUsed: false,
        };
      }
    } catch {
      // Local failed — fall through to Sonnet
    }

    // Fallback to Anthropic Haiku
    const fallbackResult = await this.routeWithFallback(message, context);
    return {
      ...fallbackResult,
      latencyMs: Date.now() - start,
      fallbackUsed: true,
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private async routeLocal(
    message: string,
    context?: RouterContext,
  ): Promise<Omit<RouterDecision, "latencyMs" | "fallbackUsed">> {
    const response = await this.ollamaProvider.chat({
      model: DEFAULT_ROUTER_MODEL,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: this.buildUserPrompt(message, context) },
      ],
      maxTokens: 64,
      temperature: 0.1,
      metadata: { think: false },
    });

    const text = response.content.trim();
    return this.parseRoutingResponse(text, DEFAULT_ROUTER_MODEL);
  }

  private async routeWithFallback(
    message: string,
    context?: RouterContext,
  ): Promise<Omit<RouterDecision, "latencyMs" | "fallbackUsed">> {
    if (!this.fallbackProvider) {
      this.fallbackProvider = new AnthropicProvider();
      await this.fallbackProvider.initialize({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      });
    }

    const response = await this.fallbackProvider.chat({
      model: FALLBACK_MODEL,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: this.buildUserPrompt(message, context) },
      ],
      maxTokens: 64,
      temperature: 0.1,
    });

    const text = response.content.trim();
    return this.parseRoutingResponse(text, FALLBACK_MODEL);
  }

  private buildUserPrompt(message: string, context?: RouterContext): string {
    let prompt = `Message: "${message.slice(0, 500)}"`;
    if (context?.previousAgent) {
      prompt += `\nPrevious agent: ${context.previousAgent}`;
    }
    if (context?.stage) {
      prompt += `\nSDLC stage: ${context.stage}`;
    }
    return prompt;
  }

  private parseRoutingResponse(
    text: string,
    routerModel: string,
  ): Omit<RouterDecision, "latencyMs" | "fallbackUsed"> {
    // Strip markdown fences if present
    const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();

    // Find JSON object
    const match = cleaned.match(/\{[^}]+\}/);
    if (!match) {
      return this.defaultDecision(routerModel, "parse_error");
    }

    try {
      const parsed = JSON.parse(match[0]) as { agent?: unknown; confidence?: unknown };
      const agent = String(parsed.agent ?? "coder");
      const confidence = Number(parsed.confidence ?? 0.7);

      if (!this.isValidAgentRole(agent)) {
        return this.defaultDecision(routerModel, "invalid_role");
      }

      return {
        agent: agent as AgentRole,
        confidence: Math.min(1, Math.max(0, confidence)),
        routerModel,
      };
    } catch {
      return this.defaultDecision(routerModel, "json_error");
    }
  }

  private isValidAgentRole(role: string): role is AgentRole {
    return isSE4ARole(role) || isSE4HRole(role);
  }

  private defaultDecision(
    routerModel: string,
    _reason: string,
  ): Omit<RouterDecision, "latencyMs" | "fallbackUsed"> {
    return { agent: "coder", confidence: 0.5, routerModel };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _instance: LocalRouterAgent | null = null;

/**
 * Get the shared LocalRouterAgent instance.
 */
export function getLocalRouter(): LocalRouterAgent {
  if (!_instance) {
    _instance = new LocalRouterAgent();
  }
  return _instance;
}

/**
 * Reset singleton (for testing).
 */
export function resetLocalRouter(): void {
  _instance = null;
}
