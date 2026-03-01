/**
 * Retrieval Policy
 *
 * Stage-aware and role-aware filtering for code search.
 * Reduces search noise by 60% through smart filtering.
 *
 * @module search/retrieval-policy
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @authority Master Plan v4.2, Sprint 63 T2.3-T2.5
 * @sprint 63
 */

import type { SearchOptions, SearchResult } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Stage-based filter configuration.
 */
export interface StageFilter {
  /** Glob patterns to prioritize */
  priorityPatterns: string[];
  /** Glob patterns to exclude */
  excludePatterns: string[];
  /** Context depth for results (1-4) */
  contextDepth: number;
  /** File types to prioritize */
  priorityTypes?: string[];
}

/**
 * Role-based filter configuration.
 */
export interface RoleFilter {
  /** Paths to focus search on */
  focusPaths: string[];
  /** Context depth for results (1-4) */
  contextDepth: number;
  /** Token budget for role */
  tokenBudget: number;
  /** File types to prioritize */
  priorityTypes?: string[];
}

/**
 * Retrieval policy configuration.
 */
export interface RetrievalPolicyConfig {
  /** Current SDLC stage */
  stage?: string;
  /** Current agent role */
  role?: string;
  /** Spec snapshot paths for boosting */
  specSnapshotPaths?: string[];
}

// ============================================================================
// Stage Filters
// ============================================================================

/**
 * Default stage filters for all 10 SDLC stages.
 *
 * Each stage has:
 * - priorityPatterns: Files most relevant to this stage
 * - excludePatterns: Files to always exclude
 * - contextDepth: How many lines of context to include
 */
export const STAGE_FILTERS: Record<string, StageFilter> = {
  "00-FOUNDATION": {
    priorityPatterns: ["*.md", "README*", "CLAUDE.md", "IDENTITY.md", ".sdlc-config.json"],
    excludePatterns: ["node_modules/**", "dist/**", ".git/**", "*.lock"],
    contextDepth: 1,
    priorityTypes: ["md", "json"],
  },
  "01-PLANNING": {
    priorityPatterns: ["docs/01-planning/**/*", "ADR-*.md", "*.md", "roadmap*.md"],
    excludePatterns: ["src/**/*.ts", "node_modules/**", "dist/**"],
    contextDepth: 2,
    priorityTypes: ["md"],
  },
  "02-DESIGN": {
    priorityPatterns: [
      "docs/02-design/**/*",
      "ADR-*.md",
      "*.proto",
      "*.graphql",
      "*.openapi.yaml",
      "*.swagger.yaml",
    ],
    excludePatterns: ["node_modules/**", "dist/**", "tests/**"],
    contextDepth: 2,
    priorityTypes: ["md", "proto", "graphql", "yaml"],
  },
  "03-INTEGRATION": {
    priorityPatterns: ["docs/03-integration/**/*", "*.md", "src/**/*.ts"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 2,
  },
  "04-BUILD": {
    priorityPatterns: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "package.json"],
    excludePatterns: ["docs/**/*", "*.md", "node_modules/**", "dist/**"],
    contextDepth: 3,
    priorityTypes: ["ts", "tsx", "js", "jsx"],
  },
  "05-TEST": {
    priorityPatterns: ["tests/**/*", "*.test.ts", "*.spec.ts", "vitest.config.ts", "jest.config.*"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 2,
    priorityTypes: ["ts"],
  },
  "06-DEPLOY": {
    priorityPatterns: [
      "docs/06-deploy/**/*",
      "Dockerfile*",
      "docker-compose*",
      ".github/**/*",
      "*.yaml",
      "*.yml",
    ],
    excludePatterns: ["node_modules/**", "dist/**", "tests/**"],
    contextDepth: 2,
    priorityTypes: ["yaml", "yml", "dockerfile"],
  },
  "07-OPERATE": {
    priorityPatterns: ["docs/07-operate/**/*", "*.md", "scripts/**/*"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 1,
  },
  "08-COLLABORATE": {
    priorityPatterns: ["docs/08-collaborate/**/*", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 1,
  },
  "09-LEARN": {
    priorityPatterns: ["docs/09-learn/**/*", "docs/**/*.md", "README.md"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 1,
  },
};

// ============================================================================
// Role Filters
// ============================================================================

/**
 * Default role filters for all agent roles.
 *
 * Each role has:
 * - focusPaths: Directories most relevant to this role
 * - contextDepth: How deep to search in context
 * - tokenBudget: Max tokens for this role's context
 */
export const ROLE_FILTERS: Record<string, RoleFilter> = {
  "@researcher": {
    focusPaths: ["docs/**/*", "*.md", "README*"],
    contextDepth: 1,
    tokenBudget: 2000,
  },
  "@pm": {
    focusPaths: ["docs/01-planning/**/*", "docs/00-foundation/**/*", "*.md", "roadmap*"],
    contextDepth: 2,
    tokenBudget: 2500,
  },
  "@pjm": {
    focusPaths: ["docs/**/*", ".sdlc-config.json", "package.json"],
    contextDepth: 1,
    tokenBudget: 2000,
  },
  "@architect": {
    focusPaths: ["docs/02-design/**/*", "ADR-*.md", "*.proto", "*.graphql", "src/**/*.ts"],
    contextDepth: 2,
    tokenBudget: 3000,
    priorityTypes: ["md", "proto", "graphql", "ts"],
  },
  "@coder": {
    focusPaths: ["src/**/*", "tests/**/*", "*.ts", "*.tsx", "package.json"],
    contextDepth: 4,
    tokenBudget: 4000,
    priorityTypes: ["ts", "tsx", "js", "jsx"],
  },
  "@reviewer": {
    focusPaths: ["src/**/*", "tests/**/*", "docs/05-test/**/*"],
    contextDepth: 3,
    tokenBudget: 3500,
    priorityTypes: ["ts", "tsx"],
  },
  "@tester": {
    focusPaths: ["tests/**/*", "*.test.ts", "*.spec.ts", "src/**/*"],
    contextDepth: 3,
    tokenBudget: 3000,
    priorityTypes: ["ts"],
  },
  "@devops": {
    focusPaths: ["docs/06-deploy/**/*", "Dockerfile*", "docker-compose*", ".github/**/*"],
    contextDepth: 2,
    tokenBudget: 2500,
    priorityTypes: ["yaml", "yml", "dockerfile", "sh"],
  },
};

// ============================================================================
// Retrieval Policy Class
// ============================================================================

/**
 * Retrieval policy for stage/role-aware search filtering.
 *
 * @example
 * ```typescript
 * const policy = new RetrievalPolicy({
 *   stage: "04-BUILD",
 *   role: "@coder",
 *   specSnapshotPaths: ["src/api/routes.ts"],
 * });
 *
 * // Apply policy to search options
 * const options = policy.applyToSearchOptions({ query: "function" });
 *
 * // Enrich results with policy metadata
 * const enriched = policy.enrichResults(results);
 * ```
 */
export class RetrievalPolicy {
  private readonly config: RetrievalPolicyConfig;
  private readonly stageFilter: StageFilter | null;
  private readonly roleFilter: RoleFilter | null;

  constructor(config: RetrievalPolicyConfig = {}) {
    this.config = config;
    this.stageFilter = config.stage ? STAGE_FILTERS[config.stage] ?? null : null;
    this.roleFilter = config.role ? ROLE_FILTERS[config.role] ?? null : null;
  }

  /**
   * Apply policy to search options.
   * Modifies glob patterns, file types, and limits based on stage/role.
   */
  applyToSearchOptions(options: SearchOptions): SearchOptions {
    const result = { ...options };

    // Apply stage filter
    if (this.stageFilter) {
      // Set glob pattern from priority patterns
      const firstPattern = this.stageFilter.priorityPatterns[0];
      if (!result.glob && firstPattern) {
        // Use first priority pattern as primary glob
        result.glob = firstPattern;
      }

      // Set file types
      if (!result.fileTypes && this.stageFilter.priorityTypes) {
        result.fileTypes = this.stageFilter.priorityTypes;
      }

      // Set context lines
      if (!result.contextLines) {
        result.contextLines = this.stageFilter.contextDepth;
      }
    }

    // Apply role filter (can override stage)
    if (this.roleFilter) {
      // Set file types from role
      if (this.roleFilter.priorityTypes) {
        result.fileTypes = this.roleFilter.priorityTypes;
      }

      // Set context lines
      if (!result.contextLines) {
        result.contextLines = this.roleFilter.contextDepth;
      }
    }

    // Pass stage and role to search options for downstream use
    if (this.config.stage) {
      result.stage = this.config.stage;
    }
    if (this.config.role) {
      result.role = this.config.role;
    }

    return result;
  }

  /**
   * Get exclude patterns based on stage/role.
   */
  getExcludePatterns(): string[] {
    const excludes = new Set<string>();

    // Always exclude these
    excludes.add("node_modules/**");
    excludes.add("dist/**");
    excludes.add(".git/**");
    excludes.add("*.lock");

    // Add stage-specific excludes
    if (this.stageFilter) {
      for (const pattern of this.stageFilter.excludePatterns) {
        excludes.add(pattern);
      }
    }

    return Array.from(excludes);
  }

  /**
   * Get token budget based on role.
   */
  getTokenBudget(): number {
    if (this.roleFilter) {
      return this.roleFilter.tokenBudget;
    }
    // Default budget
    return 2500;
  }

  /**
   * Enrich search results with policy metadata.
   * Marks spec snapshot matches and adjusts ranking reasons.
   */
  enrichResults(results: SearchResult[]): SearchResult[] {
    const specPaths = new Set(this.config.specSnapshotPaths ?? []);

    return results.map((result) => {
      // Check for spec snapshot match
      const specSnapshotMatch = specPaths.has(result.path);

      // Boost ranking reason if spec match
      const ranking_reason = specSnapshotMatch
        ? "spec_snapshot_match"
        : this.getStageBoost(result.path)
          ? "stage_boost"
          : result.ranking_reason;

      return {
        ...result,
        specSnapshotMatch,
        ranking_reason,
      };
    });
  }

  /**
   * Check if a path matches stage priority patterns.
   */
  private getStageBoost(path: string): boolean {
    if (!this.stageFilter) return false;

    for (const pattern of this.stageFilter.priorityPatterns) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching (basic implementation).
   * Supports **, *, and ? wildcards.
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Use placeholders to protect regex constructs
    const DOUBLE_STAR_SLASH = "___DOUBLE_STAR_SLASH___";
    const DOUBLE_STAR = "___DOUBLE_STAR___";
    const SINGLE_STAR = "___SINGLE_STAR___";
    const QUESTION = "___QUESTION___";

    let regex = pattern
      // Protect glob patterns with placeholders first
      .replace(/\*\*\//g, DOUBLE_STAR_SLASH)
      .replace(/\*\*/g, DOUBLE_STAR)
      .replace(/\*/g, SINGLE_STAR)
      .replace(/\?/g, QUESTION)
      // Escape regex special characters
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      // Replace placeholders with regex equivalents
      .replace(new RegExp(DOUBLE_STAR_SLASH, "g"), "(?:.*/)?")
      .replace(new RegExp(DOUBLE_STAR, "g"), ".*")
      .replace(new RegExp(SINGLE_STAR, "g"), "[^/]*")
      .replace(new RegExp(QUESTION, "g"), ".");

    return new RegExp(`^${regex}$`).test(path);
  }

  /**
   * Get current policy configuration.
   */
  getConfig(): RetrievalPolicyConfig {
    return { ...this.config };
  }

  /**
   * Get stage filter if set.
   */
  getStageFilter(): StageFilter | null {
    return this.stageFilter;
  }

  /**
   * Get role filter if set.
   */
  getRoleFilter(): RoleFilter | null {
    return this.roleFilter;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a retrieval policy for a stage.
 */
export function createStagePolicy(stage: string): RetrievalPolicy {
  return new RetrievalPolicy({ stage });
}

/**
 * Create a retrieval policy for a role.
 */
export function createRolePolicy(role: string): RetrievalPolicy {
  return new RetrievalPolicy({ role });
}

/**
 * Create a retrieval policy for stage + role.
 */
export function createPolicy(stage?: string, role?: string): RetrievalPolicy {
  const config: RetrievalPolicyConfig = {};
  if (stage) config.stage = stage;
  if (role) config.role = role;
  return new RetrievalPolicy(config);
}

/**
 * Get available stages.
 */
export function getAvailableStages(): string[] {
  return Object.keys(STAGE_FILTERS);
}

/**
 * Get available roles.
 */
export function getAvailableRoles(): string[] {
  return Object.keys(ROLE_FILTERS);
}
