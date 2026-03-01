/**
 * Cross-Project Context Manager
 *
 * Manages context merging across multiple projects for agent workflows.
 * Enables agents to work across project boundaries while maintaining
 * proper context separation and token budgets.
 *
 * Features:
 * - Load context from multiple projects
 * - Merge project metadata
 * - Track token allocation per project
 * - Validate project compatibility
 *
 * @module agents/context/cross-project
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger, type Logger } from "../../logging/index.js";
import {
  getProjectVerifier,
  type VerificationResult,
  type ProjectTier,
} from "./project-verifier.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Project context summary.
 */
export interface ProjectContext {
  /** Project identifier */
  id: string;
  /** Project name */
  name: string;
  /** Project path */
  path: string;
  /** Project tier */
  tier: ProjectTier;
  /** Whether this is the primary project */
  isPrimary: boolean;
  /** Verification result */
  verification: VerificationResult;
  /** Token allocation */
  tokenAllocation: number;
  /** Project description */
  description?: string;
  /** Current SDLC stage */
  sdlcStage?: string;
}

/**
 * Cross-project context result.
 */
export interface CrossProjectContext {
  /** Primary project */
  primary: ProjectContext;
  /** Secondary projects */
  secondary: ProjectContext[];
  /** Combined project summaries for context injection */
  summaries: string[];
  /** Total tokens used */
  totalTokens: number;
  /** Token budget */
  tokenBudget: number;
  /** Warnings */
  warnings: string[];
}

/**
 * Cross-project options.
 */
export interface CrossProjectOptions {
  /** Primary project path */
  primaryPath: string;
  /** Secondary project paths or IDs */
  secondaryProjects: string[];
  /** Token budget for all projects */
  tokenBudget?: number;
  /** Maximum projects allowed */
  maxProjects?: number;
  /** Merge strategy */
  mergeStrategy?: "primary-first" | "even" | "weighted";
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TOKEN_BUDGET = 50000;
const DEFAULT_MAX_PROJECTS = 5;
const MIN_TOKENS_PER_PROJECT = 5000;
const TOKENS_PER_PROJECT_SUMMARY = 200;

// ============================================================================
// Cross-Project Manager
// ============================================================================

/**
 * Manages context across multiple projects.
 */
export class CrossProjectManager {
  private logger: Logger;
  private verifier = getProjectVerifier();

  constructor() {
    this.logger = createLogger("cross-project");
  }

  /**
   * Load and merge context from multiple projects.
   */
  async loadCrossProjectContext(
    options: CrossProjectOptions
  ): Promise<CrossProjectContext> {
    const {
      primaryPath,
      secondaryProjects,
      tokenBudget = DEFAULT_TOKEN_BUDGET,
      maxProjects = DEFAULT_MAX_PROJECTS,
      mergeStrategy = "primary-first",
    } = options;

    const warnings: string[] = [];

    // Validate project count
    const totalProjects = 1 + secondaryProjects.length;
    if (totalProjects > maxProjects) {
      warnings.push(
        `Too many projects (${totalProjects}). Limited to ${maxProjects}.`
      );
    }

    const limitedSecondary = secondaryProjects.slice(0, maxProjects - 1);

    // Verify primary project
    const primaryVerification = this.verifier.verify(primaryPath);
    if (!primaryVerification.valid) {
      throw new Error(
        `Primary project verification failed: ${primaryVerification.errors.join(", ")}`
      );
    }

    // Load primary project context
    const primaryContext = this.loadProjectContext(
      primaryPath,
      true,
      primaryVerification
    );

    // Verify and load secondary projects
    const secondaryContexts: ProjectContext[] = [];
    for (const projectRef of limitedSecondary) {
      try {
        const projectPath = this.resolveProjectPath(projectRef);
        const verification = this.verifier.verify(projectPath);

        if (!verification.valid) {
          warnings.push(
            `Skipping ${projectRef}: ${verification.errors.join(", ")}`
          );
          continue;
        }

        // Check tier compatibility
        if (!this.isTierCompatible(primaryContext.tier, verification.tier)) {
          warnings.push(
            `Skipping ${projectRef}: Tier mismatch (${verification.tier} vs ${primaryContext.tier})`
          );
          continue;
        }

        const context = this.loadProjectContext(
          projectPath,
          false,
          verification
        );
        secondaryContexts.push(context);
      } catch (error) {
        warnings.push(
          `Failed to load ${projectRef}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Allocate tokens based on strategy
    const allocations = this.allocateTokens(
      primaryContext,
      secondaryContexts,
      tokenBudget,
      mergeStrategy
    );

    primaryContext.tokenAllocation = allocations.primary;
    secondaryContexts.forEach((ctx, i) => {
      ctx.tokenAllocation = allocations.secondary[i] ?? 0;
    });

    // Build project summaries for context injection
    const summaries = this.buildProjectSummaries(primaryContext, secondaryContexts);

    const totalTokens = summaries.length * TOKENS_PER_PROJECT_SUMMARY;

    this.logger.info("Cross-project context loaded", {
      primary: primaryContext.name,
      secondaryCount: secondaryContexts.length,
      totalTokens,
      tokenBudget,
      warnings: warnings.length,
    });

    return {
      primary: primaryContext,
      secondary: secondaryContexts,
      summaries,
      totalTokens,
      tokenBudget,
      warnings,
    };
  }

  /**
   * Resolve project path from ID or path.
   */
  private resolveProjectPath(projectRef: string): string {
    // If it's an absolute path, use as-is
    if (projectRef.startsWith("/")) {
      return projectRef;
    }

    // If it looks like a relative path
    if (projectRef.includes("/") || projectRef.includes("\\")) {
      return resolve(projectRef);
    }

    // Treat as project ID - look in common locations
    // Configurable via ENDIORBOT_PROJECT_PATHS environment variable (colon-separated)
    const homeDir = process.env.HOME ?? "";
    const customPaths = process.env.ENDIORBOT_PROJECT_PATHS?.split(":") ?? [];
    const locations = [
      ...customPaths.map((p) => join(p, projectRef)),
      join(homeDir, "Projects", projectRef),
      join(homeDir, "Documents", projectRef),
      join(process.cwd(), "..", projectRef),
    ];

    for (const loc of locations) {
      if (existsSync(loc)) {
        return loc;
      }
    }

    throw new Error(`Project not found: ${projectRef}`);
  }

  /**
   * Load context for a single project.
   */
  private loadProjectContext(
    projectPath: string,
    isPrimary: boolean,
    verification: VerificationResult
  ): ProjectContext {
    // Try to load SDLC config for description
    let description: string | undefined;
    let sdlcStage: string | undefined;

    const sdlcConfigPath = join(projectPath, ".sdlc-config.json");
    if (existsSync(sdlcConfigPath)) {
      try {
        const content = readFileSync(sdlcConfigPath, "utf-8");
        const config = JSON.parse(content) as {
          project?: { description?: string };
          sdlc?: { currentStage?: string };
        };
        description = config.project?.description;
        sdlcStage = config.sdlc?.currentStage;
      } catch {
        // Ignore parse errors
      }
    }

    const context: ProjectContext = {
      id: verification.name.toLowerCase().replace(/\s+/g, "-"),
      name: verification.name,
      path: projectPath,
      tier: verification.tier,
      isPrimary,
      verification,
      tokenAllocation: 0,
    };

    if (description !== undefined) {
      context.description = description;
    }
    if (sdlcStage !== undefined) {
      context.sdlcStage = sdlcStage;
    }

    return context;
  }

  /**
   * Check if tiers are compatible for cross-project work.
   */
  private isTierCompatible(
    primaryTier: ProjectTier,
    secondaryTier: ProjectTier
  ): boolean {
    const tierOrder: Record<ProjectTier, number> = {
      LITE: 1,
      STANDARD: 2,
      PROFESSIONAL: 3,
      ENTERPRISE: 4,
    };

    // Secondary project tier must be <= primary tier
    return tierOrder[secondaryTier] <= tierOrder[primaryTier];
  }

  /**
   * Allocate tokens across projects.
   */
  private allocateTokens(
    primary: ProjectContext,
    secondary: ProjectContext[],
    budget: number,
    strategy: "primary-first" | "even" | "weighted"
  ): { primary: number; secondary: number[] } {
    const totalProjects = 1 + secondary.length;

    switch (strategy) {
      case "primary-first": {
        // Primary gets 60%, rest split evenly
        const primaryAlloc = Math.floor(budget * 0.6);
        const remainingBudget = budget - primaryAlloc;
        const secondaryAlloc = secondary.length > 0
          ? Math.floor(remainingBudget / secondary.length)
          : 0;

        return {
          primary: primaryAlloc,
          secondary: secondary.map(() =>
            Math.max(secondaryAlloc, MIN_TOKENS_PER_PROJECT)
          ),
        };
      }

      case "even": {
        // Split evenly
        const perProject = Math.floor(budget / totalProjects);
        return {
          primary: perProject,
          secondary: secondary.map(() => perProject),
        };
      }

      case "weighted": {
        // Weight by tier
        const tierWeight: Record<ProjectTier, number> = {
          LITE: 1,
          STANDARD: 2,
          PROFESSIONAL: 3,
          ENTERPRISE: 4,
        };

        const primaryWeight = tierWeight[primary.tier] * 2; // Primary gets 2x weight
        const secondaryWeights = secondary.map((ctx) => tierWeight[ctx.tier]);
        const totalWeight = primaryWeight + secondaryWeights.reduce((a, b) => a + b, 0);

        return {
          primary: Math.floor((primaryWeight / totalWeight) * budget),
          secondary: secondaryWeights.map((w) =>
            Math.floor((w / totalWeight) * budget)
          ),
        };
      }
    }
  }

  /**
   * Build project summaries for context injection.
   */
  private buildProjectSummaries(
    primary: ProjectContext,
    secondary: ProjectContext[]
  ): string[] {
    const summaries: string[] = [];

    // Primary project summary
    summaries.push(this.formatProjectSummary(primary, true));

    // Secondary project summaries
    for (const ctx of secondary) {
      summaries.push(this.formatProjectSummary(ctx, false));
    }

    return summaries;
  }

  /**
   * Format a single project summary.
   */
  private formatProjectSummary(ctx: ProjectContext, isPrimary: boolean): string {
    const lines = [
      `### ${isPrimary ? "Primary" : "Secondary"}: ${ctx.name}`,
      `- **Path**: ${ctx.path}`,
      `- **Tier**: ${ctx.tier}`,
    ];

    if (ctx.description) {
      lines.push(`- **Description**: ${ctx.description}`);
    }

    if (ctx.sdlcStage) {
      lines.push(`- **SDLC Stage**: ${ctx.sdlcStage}`);
    }

    if (ctx.verification.git.branch) {
      lines.push(`- **Git Branch**: ${ctx.verification.git.branch}`);
    }

    return lines.join("\n");
  }

  /**
   * Format cross-project context for logging.
   */
  formatContext(context: CrossProjectContext): string {
    const lines: string[] = [
      "Cross-Project Context:",
      `  Primary: ${context.primary.name} (${context.primary.tier})`,
      `  Path: ${context.primary.path}`,
    ];

    if (context.secondary.length > 0) {
      lines.push("  Secondary Projects:");
      for (const sec of context.secondary) {
        lines.push(`    - ${sec.name}: ${sec.tokenAllocation} tokens`);
      }
    }

    lines.push("");
    lines.push(
      `  Tokens: ${context.totalTokens}/${context.tokenBudget} (${Math.round((context.totalTokens / context.tokenBudget) * 100)}%)`
    );

    if (context.warnings.length > 0) {
      lines.push("");
      lines.push("  Warnings:");
      for (const warn of context.warnings) {
        lines.push(`    - ${warn}`);
      }
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: CrossProjectManager | undefined;

/**
 * Get the cross-project manager singleton.
 */
export function getCrossProjectManager(): CrossProjectManager {
  if (!instance) {
    instance = new CrossProjectManager();
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetCrossProjectManager(): void {
  instance = undefined;
}
