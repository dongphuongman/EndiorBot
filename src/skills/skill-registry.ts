/**
 * Skill Registry
 *
 * Central registry for managing skills.
 * Provides lookup, enable/disable, and execution tracking.
 *
 * @module skills/skill-registry
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 5 Implementation
 * @authority ADR-005 Skills Architecture
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import type {
  Skill,
  SkillInfo,
  SkillStatus,
  SkillRegistryConfig,
  SkillSearchOptions,
  SkillExecutionContext,
  SkillExecutionResult,
} from "./types.js";
import { SkillLoader } from "./skill-loader.js";

// ============================================================================
// Skill Registry Class
// ============================================================================

/**
 * Central registry for skill management.
 */
export class SkillRegistry {
  private readonly skills: Map<string, Skill> = new Map();
  private readonly loader: SkillLoader;
  private readonly autoEnable: boolean;
  private loaded = false;

  constructor(config: SkillRegistryConfig) {
    this.loader = new SkillLoader(config.loader);
    this.autoEnable = config.autoEnable ?? false;
  }

  /**
   * Load all available skills.
   */
  load(): void {
    if (this.loaded) {
      return;
    }

    const results = this.loader.loadAllSkills();

    for (const [id, result] of results) {
      if (result.success && result.skill) {
        const skill = result.skill;

        // Auto-enable if configured
        if (this.autoEnable && skill.status === "available") {
          skill.status = "enabled";
        }

        this.skills.set(id, skill);
      }
    }

    this.loaded = true;
  }

  /**
   * Reload all skills (clear and load again).
   */
  reload(): void {
    this.skills.clear();
    this.loaded = false;
    this.load();
  }

  /**
   * Get a skill by ID.
   */
  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Check if a skill exists.
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * List all skills as SkillInfo.
   */
  list(options?: SkillSearchOptions): SkillInfo[] {
    const results: SkillInfo[] = [];

    for (const skill of this.skills.values()) {
      // Apply filters
      if (options?.status && skill.status !== options.status) {
        continue;
      }

      if (options?.category && skill.metadata.category !== options.category) {
        continue;
      }

      if (
        options?.tag &&
        (!skill.metadata.tags || !skill.metadata.tags.includes(options.tag))
      ) {
        continue;
      }

      if (options?.query) {
        const query = options.query.toLowerCase();
        const matchesName = skill.name.toLowerCase().includes(query);
        const matchesDesc = skill.description.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) {
          continue;
        }
      }

      const info: SkillInfo = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        status: skill.status,
      };
      if (skill.metadata.emoji !== undefined) {
        info.emoji = skill.metadata.emoji;
      }
      if (skill.metadata.category !== undefined) {
        info.category = skill.metadata.category;
      }
      results.push(info);
    }

    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }

  /**
   * Get all skill IDs.
   */
  getSkillIds(): string[] {
    return Array.from(this.skills.keys()).sort();
  }

  /**
   * Get skills by category.
   */
  getByCategory(): Map<string, SkillInfo[]> {
    const categories = new Map<string, SkillInfo[]>();

    for (const skill of this.skills.values()) {
      const category = skill.metadata.category ?? "uncategorized";

      if (!categories.has(category)) {
        categories.set(category, []);
      }

      const info: SkillInfo = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        status: skill.status,
      };
      if (skill.metadata.emoji !== undefined) {
        info.emoji = skill.metadata.emoji;
      }
      if (skill.metadata.category !== undefined) {
        info.category = skill.metadata.category;
      }
      const categoryList = categories.get(category);
      if (categoryList) {
        categoryList.push(info);
      }
    }

    return categories;
  }

  /**
   * Enable a skill.
   */
  enable(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return false;
    }

    if (skill.status === "error") {
      return false;
    }

    skill.status = "enabled";
    return true;
  }

  /**
   * Disable a skill.
   */
  disable(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return false;
    }

    skill.status = "disabled";
    return true;
  }

  /**
   * Get the prompt content for a skill.
   */
  getPrompt(skillId: string): string | undefined {
    const skill = this.skills.get(skillId);
    return skill?.prompt;
  }

  /**
   * Check if a skill is enabled.
   */
  isEnabled(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    return skill?.status === "enabled";
  }

  /**
   * Get enabled skills.
   */
  getEnabled(): Skill[] {
    return Array.from(this.skills.values()).filter(
      (s) => s.status === "enabled",
    );
  }

  /**
   * Execute a skill and track result.
   */
  async execute(
    skillId: string,
    context: SkillExecutionContext,
    executor: (prompt: string, ctx: SkillExecutionContext) => Promise<string>,
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    const skill = this.skills.get(skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill "${skillId}" not found`,
        durationMs: Date.now() - startTime,
      };
    }

    if (skill.status !== "enabled") {
      return {
        success: false,
        error: `Skill "${skillId}" is not enabled (status: ${skill.status})`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const output = await executor(skill.prompt, context);

      return {
        success: true,
        output,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get registry statistics.
   */
  getStats(): {
    total: number;
    byStatus: Record<SkillStatus, number>;
    byCategory: Record<string, number>;
  } {
    const byStatus: Record<SkillStatus, number> = {
      available: 0,
      installed: 0,
      enabled: 0,
      disabled: 0,
      error: 0,
    };

    const byCategory: Record<string, number> = {};

    for (const skill of this.skills.values()) {
      byStatus[skill.status]++;

      const category = skill.metadata.category ?? "uncategorized";
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    return {
      total: this.skills.size,
      byStatus,
      byCategory,
    };
  }

  /**
   * Register a skill manually (for runtime-created skills).
   */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Unregister a skill.
   */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /**
   * Clear all skills.
   */
  clear(): void {
    this.skills.clear();
    this.loaded = false;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: SkillRegistry | undefined;

export function getSkillRegistry(config?: SkillRegistryConfig): SkillRegistry {
  if (!globalRegistry && config) {
    globalRegistry = new SkillRegistry(config);
  }
  if (!globalRegistry) {
    throw new Error("SkillRegistry not initialized. Provide config first.");
  }
  return globalRegistry;
}

/**
 * Reset the global SkillRegistry instance.
 * Useful for testing or reconfiguration.
 */
export function resetSkillRegistry(): void {
  globalRegistry = undefined;
}
