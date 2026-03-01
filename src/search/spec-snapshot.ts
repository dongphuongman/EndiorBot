/**
 * Spec Snapshot Manager
 *
 * Manages spec snapshot sources for search ranking boost.
 * Sprint 64: T4.2 - Spec Snapshot file marking.
 *
 * Spec snapshots are files that represent the "source of truth" for
 * requirements, specifications, and architecture decisions. Files
 * matching spec snapshot sources receive a ranking boost in search results.
 *
 * @module search/spec-snapshot
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @authority Master Plan v4.2, Sprint 64 T4.2
 * @sprint 64
 */

import { createLogger, type Logger } from "../logging/index.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Spec snapshot configuration.
 */
export interface SpecSnapshotConfig {
  /** Unique identifier (SHA hash) */
  id?: string;
  /** Source file paths or glob patterns */
  sources: string[];
  /** Drift detection policy */
  policy?: {
    /** Enable drift detection */
    enabled?: boolean;
    /** Drift threshold before warning */
    threshold?: number;
    /** Action on drift: "warn" | "block" | "ignore" */
    action?: "warn" | "block" | "ignore";
  };
}

/**
 * Spec snapshot state.
 */
export interface SpecSnapshotState {
  /** Configuration */
  config: SpecSnapshotConfig;
  /** Last loaded timestamp */
  loadedAt: Date;
  /** Resolved file paths */
  resolvedPaths: string[];
}

// ============================================================================
// Default Spec Sources
// ============================================================================

/**
 * Default spec snapshot source patterns.
 *
 * These patterns identify files that are typically "source of truth"
 * for requirements and specifications.
 */
export const DEFAULT_SPEC_SOURCES: string[] = [
  // Planning documents
  "docs/01-planning/**/*.md",
  // Design documents
  "docs/02-design/**/*.md",
  // ADRs
  "ADR-*.md",
  "docs/**/ADR-*.md",
  // Requirements
  "**/requirements.md",
  "**/requirements*.md",
  // Specs
  "**/spec*.md",
  "**/*-spec.md",
  // API definitions
  "**/api.yaml",
  "**/api.json",
  "**/openapi.yaml",
  "**/openapi.json",
  // Proto definitions
  "**/*.proto",
  // Core type definitions
  "src/types.ts",
  "src/**/types.ts",
  "src/types/*.ts",
];

/**
 * Default config file names to look for.
 */
const CONFIG_FILES = [
  "spec_snapshot.yaml",
  "spec_snapshot.yml",
  "spec-snapshot.yaml",
  "spec-snapshot.yml",
  ".spec-snapshot.yaml",
  ".spec-snapshot.yml",
];

// ============================================================================
// SpecSnapshotManager
// ============================================================================

/**
 * Spec Snapshot Manager.
 *
 * Discovers and tracks spec snapshot sources for search ranking.
 *
 * @example
 * ```typescript
 * const manager = new SpecSnapshotManager("/path/to/project");
 *
 * // Load from config file or use defaults
 * await manager.load();
 *
 * // Get source paths for ranking
 * const paths = manager.getSourcePaths();
 *
 * // Check if a file is a spec source
 * const isSpec = manager.isSpecSource("docs/01-planning/requirements.md");
 * ```
 */
export class SpecSnapshotManager {
  private readonly logger: Logger;
  private readonly projectRoot: string;
  private state: SpecSnapshotState | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.logger = createLogger("SpecSnapshotManager");
    this.projectRoot = projectRoot;
  }

  // =========================================================================
  // Loading
  // =========================================================================

  /**
   * Load spec snapshot configuration.
   *
   * Tries to load from config file, falls back to defaults.
   */
  async load(): Promise<SpecSnapshotConfig> {
    // Try to find config file
    const configPath = await this.findConfigFile();

    if (configPath) {
      const config = await this.loadConfigFile(configPath);
      this.state = {
        config,
        loadedAt: new Date(),
        resolvedPaths: await this.resolvePaths(config.sources),
      };
      this.logger.info("Loaded spec snapshot config", { path: configPath });
      return config;
    }

    // Use defaults
    const config: SpecSnapshotConfig = {
      sources: DEFAULT_SPEC_SOURCES,
    };
    this.state = {
      config,
      loadedAt: new Date(),
      resolvedPaths: await this.resolvePaths(config.sources),
    };
    this.logger.debug("Using default spec snapshot sources");
    return config;
  }

  /**
   * Find config file in project root.
   */
  private async findConfigFile(): Promise<string | null> {
    for (const filename of CONFIG_FILES) {
      const filepath = path.join(this.projectRoot, filename);
      try {
        await fs.access(filepath);
        return filepath;
      } catch {
        // File doesn't exist, try next
      }
    }
    return null;
  }

  /**
   * Load and parse config file.
   */
  private async loadConfigFile(filepath: string): Promise<SpecSnapshotConfig> {
    const content = await fs.readFile(filepath, "utf-8");

    // Parse YAML (simple parser for our format)
    const config = this.parseYaml(content);

    // Extract and validate sources
    const sources = Array.isArray(config.sources)
      ? (config.sources as string[])
      : DEFAULT_SPEC_SOURCES;

    // Build result with proper types
    const result: SpecSnapshotConfig = { sources };

    // Add optional id if present
    if (typeof config.id === "string") {
      result.id = config.id;
    }

    // Add optional policy if present (exactOptionalPropertyTypes compliant)
    if (config.policy && typeof config.policy === "object") {
      const policy = config.policy as Record<string, unknown>;
      const policyObj: NonNullable<SpecSnapshotConfig["policy"]> = {};

      if (typeof policy.enabled === "boolean") {
        policyObj.enabled = policy.enabled;
      }
      if (typeof policy.threshold === "number") {
        policyObj.threshold = policy.threshold;
      }
      if (["warn", "block", "ignore"].includes(policy.action as string)) {
        policyObj.action = policy.action as "warn" | "block" | "ignore";
      }

      result.policy = policyObj;
    }

    return result;
  }

  /**
   * Simple YAML parser for our config format.
   */
  private parseYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split("\n");

    let currentKey = "";
    let currentArray: string[] = [];
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith("#") || trimmed === "") {
        continue;
      }

      // Array item
      if (trimmed.startsWith("- ")) {
        if (inArray) {
          currentArray.push(trimmed.slice(2).replace(/^["']|["']$/g, ""));
        }
        continue;
      }

      // Key-value pair
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        // Save previous array if any
        if (inArray && currentKey) {
          result[currentKey] = currentArray;
          currentArray = [];
          inArray = false;
        }

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value === "") {
          // Start of array or nested object
          currentKey = key;
          inArray = true;
          currentArray = [];
        } else {
          // Simple value
          result[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    }

    // Save last array if any
    if (inArray && currentKey) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  /**
   * Resolve glob patterns to file paths.
   */
  private async resolvePaths(patterns: string[]): Promise<string[]> {
    const resolved = new Set<string>();

    for (const pattern of patterns) {
      // For now, add patterns as-is (full glob resolution in search providers)
      // This allows both exact paths and glob patterns
      resolved.add(pattern);

      // Also check if pattern is an exact file
      try {
        const fullPath = path.join(this.projectRoot, pattern);
        await fs.access(fullPath);
        resolved.add(pattern);
      } catch {
        // Not a file, keep pattern for glob matching
      }
    }

    return Array.from(resolved);
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get source paths for ranking.
   *
   * Returns both exact file paths and glob patterns.
   */
  getSourcePaths(): string[] {
    if (!this.state) {
      return DEFAULT_SPEC_SOURCES;
    }
    return this.state.resolvedPaths;
  }

  /**
   * Get source patterns for ranking.
   *
   * Returns glob patterns from configuration.
   */
  getSourcePatterns(): string[] {
    if (!this.state) {
      return DEFAULT_SPEC_SOURCES;
    }
    return this.state.config.sources;
  }

  /**
   * Check if a file path is a spec source.
   *
   * Uses glob pattern matching.
   */
  isSpecSource(filepath: string): boolean {
    const patterns = this.getSourcePatterns();

    for (const pattern of patterns) {
      if (this.matchGlob(filepath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if state is loaded.
   */
  isLoaded(): boolean {
    return this.state !== null;
  }

  /**
   * Get current state.
   */
  getState(): SpecSnapshotState | null {
    return this.state;
  }

  /**
   * Simple glob matching.
   */
  private matchGlob(filepath: string, pattern: string): boolean {
    // Use placeholders to protect regex constructs
    const DOUBLE_STAR_SLASH = "___DOUBLE_STAR_SLASH___";
    const DOUBLE_STAR = "___DOUBLE_STAR___";
    const SINGLE_STAR = "___SINGLE_STAR___";
    const QUESTION = "___QUESTION___";

    let regex = pattern
      .replace(/\*\*\//g, DOUBLE_STAR_SLASH)
      .replace(/\*\*/g, DOUBLE_STAR)
      .replace(/\*/g, SINGLE_STAR)
      .replace(/\?/g, QUESTION)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(new RegExp(DOUBLE_STAR_SLASH, "g"), "(?:.*/)?")
      .replace(new RegExp(DOUBLE_STAR, "g"), ".*")
      .replace(new RegExp(SINGLE_STAR, "g"), "[^/]*")
      .replace(new RegExp(QUESTION, "g"), ".");

    return new RegExp(`^${regex}$`).test(filepath);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: SpecSnapshotManager | null = null;

/**
 * Get the default spec snapshot manager.
 */
export function getSpecSnapshotManager(
  projectRoot?: string
): SpecSnapshotManager {
  if (!defaultManager || (projectRoot && projectRoot !== process.cwd())) {
    defaultManager = new SpecSnapshotManager(projectRoot);
  }
  return defaultManager;
}

/**
 * Reset the default manager.
 */
export function resetSpecSnapshotManager(): void {
  defaultManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Load and get spec snapshot source paths.
 *
 * Convenience function for quick access to spec sources.
 */
export async function loadSpecSnapshotPaths(
  projectRoot?: string
): Promise<string[]> {
  const manager = getSpecSnapshotManager(projectRoot);
  await manager.load();
  return manager.getSourcePaths();
}

/**
 * Check if a file is a spec source.
 *
 * Uses default patterns if manager not loaded.
 */
export function isSpecSourceFile(
  filepath: string,
  projectRoot?: string
): boolean {
  const manager = getSpecSnapshotManager(projectRoot);
  return manager.isSpecSource(filepath);
}
