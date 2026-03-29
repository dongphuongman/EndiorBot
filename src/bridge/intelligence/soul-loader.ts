/**
 * SoulLoader — Single Source of Truth for SOUL template loading.
 *
 * Sprint 84 (ADR-025): Unified loader used by both API Mode (channel-router)
 * and Bridge Mode (agent-launcher). Loads from filesystem first, falls back
 * to inline AGENT_SOULS strings.
 *
 * Content integrity: SOUL content is NOT sanitized (no metacharacter stripping).
 * Both injection strategies (--agent file, --append-system-prompt-file) use
 * file-based injection — content never passes through a shell interpreter.
 *
 * @module bridge/intelligence/soul-loader
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveTemplatesRoot } from "../../config/paths.js";

import type { AgentRole } from "./envelope.js";
import { isValidAgentRole, VALID_AGENT_ROLES } from "./envelope.js";

// ============================================================================
// Types
// ============================================================================

/** Result of loading a SOUL template */
export interface SoulLoadResult {
  /** true = content loaded from file, false = fallback used */
  loaded: boolean;
  /** SOUL template content (body, frontmatter stripped) */
  content: string;
  /** true = inline fallback string used */
  fallback: boolean;
  /** Resolved agent role name */
  agentRole: AgentRole;
  /** SHA256 hash of content */
  contentHash: string;
  /** Where the content was loaded from */
  source: "file" | "fallback-inline";
  /** File path if source === "file" */
  resolvedPath?: string;
}

// ============================================================================
// Fallback AGENT_SOULS (moved from channel-router.ts)
// ============================================================================

/** Inline fallback strings — used when SOUL template file is missing */
const AGENT_SOULS_FALLBACK: Record<AgentRole, string> = {
  pm: "You are the PM (Product Manager) agent for EndiorBot. You handle requirements, user stories, sprint planning, and stakeholder communication. Be concise and actionable. Respond in the same language as the user's message.",
  architect:
    "You are the Architect agent for EndiorBot. You handle system design, ADRs, API specifications, and technical decisions. Be precise and well-structured. Respond in the same language as the user's message.",
  coder: "You are the Coder agent for EndiorBot. You handle implementation, TDD, code generation, and technical tasks. Write clean, tested code. Respond in the same language as the user's message.",
  reviewer:
    "You are the Reviewer agent for EndiorBot. You handle code review, quality checks, and standards compliance. Be thorough but constructive. Respond in the same language as the user's message.",
  tester:
    "You are the Tester agent for EndiorBot. You handle testing strategy, test plans, QA processes, and bug verification. Respond in the same language as the user's message.",
  researcher:
    "You are the Researcher agent for EndiorBot. You handle discovery, user research, competitive analysis, and information gathering. Respond in the same language as the user's message.",
  devops:
    "You are the DevOps agent for EndiorBot. You handle deployment, CI/CD, infrastructure, monitoring, and operations. Respond in the same language as the user's message.",
  fullstack:
    "You are the Fullstack agent for EndiorBot. You handle all SDLC stages from planning to deployment as a solo developer tool. Respond in the same language as the user's message.",
  pjm: "You are the PJM (Project Manager) agent for EndiorBot. You handle sprint coordination, task tracking, and timeline management. Respond in the same language as the user's message.",
  ceo: "You are the CEO agent for EndiorBot. You provide strategic direction, prioritization, and executive decisions. Respond in the same language as the user's message.",
  cpo: "You are the CPO agent for EndiorBot. You handle product vision, feature prioritization, and product strategy. Respond in the same language as the user's message.",
  cto: "You are the CTO agent for EndiorBot. You handle technical standards, architecture review, and technology decisions. Respond in the same language as the user's message.",
  cso: "You are the CSO (Chief Security Officer) agent for EndiorBot. You handle security architecture review, threat modeling (STRIDE/PASTA), OWASP ASVS L2 compliance, AGPL containment verification, supply chain security (SBOM, CVE audit), and security gate approvals (G2, G3, G4). Respond in the same language as the user's message.",
  assistant:
    "You are the Assistant agent for EndiorBot. You handle message routing, delegation, and general assistance. Respond in the same language as the user's message.",
};

// ============================================================================
// SoulLoader
// ============================================================================

/** Logger function signature for SoulLoader */
export type SoulLogFn = (message: string) => void;

export class SoulLoader {
  /** Cache: agentRole → SoulLoadResult */
  private readonly cache = new Map<AgentRole, SoulLoadResult>();

  /** Optional override for templates root (for testing) */
  private readonly templatesRoot: string | undefined;

  /** Logger for fallback events (injectable to avoid hard coupling) */
  private readonly logWarn: SoulLogFn;

  constructor(options?: SoulLoaderOptions) {
    this.templatesRoot = options?.templatesRoot;
    this.logWarn = options?.logWarn ?? console.warn;
  }

  /**
   * Load SOUL template for an agent role.
   *
   * 1. Validate agentRole (strict allowlist)
   * 2. Resolve path: docs/reference/templates/souls/SOUL-{role}.md
   * 3. Path traversal guard
   * 4. Read file + strip YAML frontmatter + cache
   * 5. If file missing → fallback to inline string
   * 6. Return SoulLoadResult (never throws)
   */
  load(agentRole: string): SoulLoadResult {
    // 1. Validate agentRole: strict allowlist
    if (!isValidAgentRole(agentRole)) {
      // Return fallback for invalid roles — never throw
      return this.buildFallbackResult("assistant", true);
    }

    const validRole = agentRole as AgentRole;

    // Check cache
    const cached = this.cache.get(validRole);
    if (cached) {
      return cached;
    }

    // 2. Resolve path
    const soulsDir = join(this.getTemplatesRoot(), "souls");
    const soulPath = join(soulsDir, `SOUL-${validRole}.md`);

    // 3. Path traversal guard: resolved path MUST be within souls/ dir
    const resolvedSoulPath = resolve(soulPath);
    const resolvedSoulsDir = resolve(soulsDir);
    if (!resolvedSoulPath.startsWith(resolvedSoulsDir)) {
      return this.buildFallbackResult(validRole, true);
    }

    // 4. Read file + strip YAML frontmatter
    if (existsSync(resolvedSoulPath)) {
      try {
        const rawContent = readFileSync(resolvedSoulPath, "utf-8");
        const content = this.stripFrontmatter(rawContent);
        const contentHash = this.computeHash(content);

        const result: SoulLoadResult = {
          loaded: true,
          content,
          fallback: false,
          agentRole: validRole,
          contentHash,
          source: "file",
          resolvedPath: resolvedSoulPath,
        };

        this.cache.set(validRole, result);
        return result;
      } catch {
        // File read error → fallback
        return this.buildFallbackResult(validRole, true);
      }
    }

    // 6. File missing → fallback to inline string
    return this.buildFallbackResult(validRole, true);
  }

  /** Get all valid agent roles */
  getValidRoles(): readonly AgentRole[] {
    return VALID_AGENT_ROLES;
  }

  /** Clear the cache (for testing or manual reload) */
  clearCache(): void {
    this.cache.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /** Strip YAML frontmatter from SOUL template content */
  private stripFrontmatter(content: string): string {
    const match = content.match(/^---\n[\s\S]*?\n---\n/);
    if (match) {
      return content.slice(match[0].length);
    }
    return content;
  }

  /** Compute SHA256 hash of content */
  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /** Build a fallback result from inline AGENT_SOULS */
  private buildFallbackResult(
    agentRole: AgentRole,
    shouldLog: boolean,
  ): SoulLoadResult {
    const content =
      AGENT_SOULS_FALLBACK[agentRole] ?? AGENT_SOULS_FALLBACK.assistant;
    const contentHash = this.computeHash(content);

    const result: SoulLoadResult = {
      loaded: false,
      content,
      fallback: true,
      agentRole,
      contentHash,
      source: "fallback-inline",
    };

    if (shouldLog) {
      this.logWarn(
        `[SoulLoader] Fallback used for role "${agentRole}" — SOUL template file not found`,
      );
    }

    this.cache.set(agentRole, result);
    return result;
  }

  /** Get templates root — injectable for testing */
  private getTemplatesRoot(): string {
    return this.templatesRoot ?? resolveTemplatesRoot();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalSoulLoader: SoulLoader | undefined;

/** Options for SoulLoader construction */
export interface SoulLoaderOptions {
  templatesRoot?: string;
  logWarn?: SoulLogFn;
}

/** Get the global SoulLoader instance */
export function getSoulLoader(options?: SoulLoaderOptions): SoulLoader {
  if (!globalSoulLoader) {
    globalSoulLoader = new SoulLoader(options);
  }
  return globalSoulLoader;
}

/** Reset the global SoulLoader (for testing) */
export function resetSoulLoader(): void {
  globalSoulLoader = undefined;
}

/** Create a new SoulLoader without affecting the global instance */
export function createSoulLoader(options?: SoulLoaderOptions): SoulLoader {
  return new SoulLoader(options);
}
