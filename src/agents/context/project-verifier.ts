/**
 * Project Verifier
 *
 * Verifies project state before agent invocation.
 * Checks path, SDLC config, Git status.
 *
 * Verification Flow:
 * 1. Check project path exists
 * 2. Check .sdlc-config.json present
 * 3. Get Git HEAD and branch
 * 4. Validate tier compatibility
 *
 * @module agents/context/project-verifier
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Project tier levels.
 */
export type ProjectTier = "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";

/**
 * SDLC configuration structure.
 */
export interface SDLCConfig {
  tier: ProjectTier;
  project?: {
    name?: string;
    description?: string;
  };
  sdlc?: {
    currentStage?: string;
    features?: string[];
  };
}

/**
 * Git status information.
 */
export interface GitStatus {
  /** Whether it's a git repo */
  isGitRepo: boolean;
  /** Current branch */
  branch?: string;
  /** HEAD commit hash */
  head?: string;
  /** HEAD commit message */
  headMessage?: string;
  /** Whether there are uncommitted changes */
  isDirty?: boolean;
}

/**
 * Verification result.
 */
export interface VerificationResult {
  /** Whether verification passed */
  valid: boolean;
  /** Project path */
  path: string;
  /** Project name */
  name: string;
  /** Project tier */
  tier: ProjectTier;
  /** SDLC config if found */
  sdlcConfig?: SDLCConfig;
  /** Git status */
  git: GitStatus;
  /** Verification errors */
  errors: string[];
  /** Verification warnings */
  warnings: string[];
  /** Verification timestamp */
  timestamp: Date;
}

/**
 * Verifier configuration.
 */
export interface VerifierConfig {
  /** Require SDLC config file */
  requireSDLCConfig: boolean;
  /** Require git repo */
  requireGitRepo: boolean;
  /** Check for uncommitted changes */
  checkDirtyState: boolean;
  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default verifier configuration.
 */
export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  requireSDLCConfig: false,
  requireGitRepo: false,
  checkDirtyState: true,
  verbose: false,
};

// ============================================================================
// Project Verifier Class
// ============================================================================

/**
 * Project Verifier validates project state.
 *
 * @example
 * ```typescript
 * const verifier = new ProjectVerifier();
 *
 * const result = await verifier.verify("/path/to/project");
 * if (!result.valid) {
 *   console.error("Project verification failed:", result.errors);
 * }
 *
 * // Quick check
 * const quick = await verifier.quickCheck("/path/to/project");
 * if (!quick.exists) {
 *   console.error("Project not found");
 * }
 * ```
 */
export class ProjectVerifier {
  private config: VerifierConfig;
  private log: Logger;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
    this.log = createLogger("project-verifier");
  }

  // ==========================================================================
  // Main Verification
  // ==========================================================================

  /**
   * Fully verify a project.
   */
  verify(projectPath: string): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const timestamp = new Date();

    // 1. Check path exists
    if (!existsSync(projectPath)) {
      return {
        valid: false,
        path: projectPath,
        name: basename(projectPath),
        tier: "STANDARD",
        git: { isGitRepo: false },
        errors: [`Project path does not exist: ${projectPath}`],
        warnings: [],
        timestamp,
      };
    }

    // 2. Load SDLC config
    const sdlcResult = this.loadSDLCConfig(projectPath);
    if (!sdlcResult.found && this.config.requireSDLCConfig) {
      errors.push("SDLC config file (.sdlc-config.json) not found");
    } else if (!sdlcResult.found) {
      warnings.push("No .sdlc-config.json found, using defaults");
    }

    // 3. Get Git status
    const git = this.getGitStatus(projectPath);
    if (!git.isGitRepo && this.config.requireGitRepo) {
      errors.push("Not a Git repository");
    }
    if (git.isDirty && this.config.checkDirtyState) {
      warnings.push("Working directory has uncommitted changes");
    }

    // 4. Validate tier
    const tier = sdlcResult.config?.tier ?? "STANDARD";
    if (!this.isValidTier(tier)) {
      errors.push(`Invalid tier: ${tier}`);
    }

    // 5. Build result
    const valid = errors.length === 0;
    const name = sdlcResult.config?.project?.name ?? basename(projectPath);

    if (this.config.verbose) {
      this.log.info("Project verification", {
        path: projectPath,
        valid,
        errors: errors.length,
        warnings: warnings.length,
        tier,
        git: git.isGitRepo ? `${git.branch}@${git.head?.slice(0, 7)}` : "none",
      });
    }

    return {
      valid,
      path: projectPath,
      name,
      tier: tier as ProjectTier,
      ...(sdlcResult.found ? { sdlcConfig: sdlcResult.config } : {}),
      git,
      errors,
      warnings,
      timestamp,
    };
  }

  /**
   * Quick check - minimal verification.
   */
  quickCheck(projectPath: string): {
    exists: boolean;
    hasSDLCConfig: boolean;
    isGitRepo: boolean;
    tier: ProjectTier;
  } {
    const exists = existsSync(projectPath);
    if (!exists) {
      return {
        exists: false,
        hasSDLCConfig: false,
        isGitRepo: false,
        tier: "STANDARD",
      };
    }

    const hasSDLCConfig = existsSync(join(projectPath, ".sdlc-config.json"));
    const isGitRepo = existsSync(join(projectPath, ".git"));

    let tier: ProjectTier = "STANDARD";
    if (hasSDLCConfig) {
      try {
        const content = readFileSync(
          join(projectPath, ".sdlc-config.json"),
          "utf-8"
        );
        const config = JSON.parse(content);
        tier = (config.tier as ProjectTier) ?? "STANDARD";
      } catch {
        // Use default
      }
    }

    return { exists, hasSDLCConfig, isGitRepo, tier };
  }

  // ==========================================================================
  // SDLC Config
  // ==========================================================================

  /**
   * Load SDLC configuration from project.
   */
  private loadSDLCConfig(projectPath: string): {
    found: boolean;
    config?: SDLCConfig;
  } {
    const configPath = join(projectPath, ".sdlc-config.json");

    if (!existsSync(configPath)) {
      return { found: false };
    }

    try {
      const content = readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as SDLCConfig;

      // Normalize tier
      if (!config.tier || !this.isValidTier(config.tier)) {
        config.tier = "STANDARD";
      }

      return { found: true, config };
    } catch (err) {
      this.log.warn("Failed to parse SDLC config", { error: err });
      return { found: false };
    }
  }

  /**
   * Validate tier value.
   */
  private isValidTier(tier: string): tier is ProjectTier {
    return ["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"].includes(tier);
  }

  // ==========================================================================
  // Git Status
  // ==========================================================================

  /**
   * Get Git repository status.
   */
  private getGitStatus(projectPath: string): GitStatus {
    // Check if it's a git repo
    if (!existsSync(join(projectPath, ".git"))) {
      return { isGitRepo: false };
    }

    try {
      // Get current branch
      const branch = this.execGit(projectPath, "rev-parse --abbrev-ref HEAD");

      // Get HEAD commit
      const head = this.execGit(projectPath, "rev-parse HEAD");

      // Get HEAD commit message
      const headMessage = this.execGit(
        projectPath,
        "log -1 --format=%s"
      );

      // Check for uncommitted changes
      const statusOutput = this.execGit(projectPath, "status --porcelain");
      const isDirty = statusOutput.length > 0;

      return {
        isGitRepo: true,
        branch,
        head,
        headMessage,
        isDirty,
      };
    } catch (err) {
      this.log.warn("Failed to get Git status", { error: err });
      return { isGitRepo: true }; // It's a git repo but we couldn't get details
    }
  }

  /**
   * Execute git command safely.
   */
  private execGit(cwd: string, args: string): string {
    try {
      return execSync(`git ${args}`, {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "";
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Format verification result for display.
   */
  formatResult(result: VerificationResult): string {
    const lines: string[] = [];

    const statusIcon = result.valid ? "✅" : "❌";
    lines.push(`${statusIcon} Project: ${result.name}`);
    lines.push(`   Path: ${result.path}`);
    lines.push(`   Tier: ${result.tier}`);

    if (result.git.isGitRepo) {
      const gitInfo = result.git.isDirty ? "(dirty)" : "(clean)";
      lines.push(
        `   Git: ${result.git.branch}@${result.git.head?.slice(0, 7)} ${gitInfo}`
      );
    } else {
      lines.push(`   Git: Not a repository`);
    }

    if (result.errors.length > 0) {
      lines.push(`   Errors:`);
      for (const err of result.errors) {
        lines.push(`     ❌ ${err}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`   Warnings:`);
      for (const warn of result.warnings) {
        lines.push(`     ⚠️  ${warn}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get verification summary for audit logging.
   */
  getAuditSummary(result: VerificationResult): Record<string, unknown> {
    return {
      valid: result.valid,
      path: result.path,
      name: result.name,
      tier: result.tier,
      hasSDLCConfig: result.sdlcConfig !== undefined,
      isGitRepo: result.git.isGitRepo,
      branch: result.git.branch,
      head: result.git.head?.slice(0, 7),
      isDirty: result.git.isDirty,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      timestamp: result.timestamp.toISOString(),
    };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<VerifierConfig>): void {
    Object.assign(this.config, config);
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalVerifier: ProjectVerifier | undefined;

/**
 * Get global project verifier.
 */
export function getProjectVerifier(
  config?: Partial<VerifierConfig>
): ProjectVerifier {
  if (!globalVerifier) {
    globalVerifier = new ProjectVerifier(config);
  }
  return globalVerifier;
}

/**
 * Reset global project verifier.
 */
export function resetProjectVerifier(): void {
  globalVerifier = undefined;
}

/**
 * Create a new project verifier.
 */
export function createProjectVerifier(
  config?: Partial<VerifierConfig>
): ProjectVerifier {
  return new ProjectVerifier(config);
}

/**
 * Quick verify function.
 */
export function verifyProject(projectPath: string): VerificationResult {
  return getProjectVerifier().verify(projectPath);
}
