/**
 * Skill Loader
 *
 * Discovers and loads skills from skills/ directories.
 * Parses skill.md files with YAML frontmatter.
 *
 * Skill Format (skill.md):
 * ```
 * ---
 * name: Skill Name
 * description: What the skill does
 * metadata:
 *   emoji: 🔧
 *   requires:
 *     - name: binary-name
 *   category: development
 * ---
 *
 * Skill prompt content here...
 * ```
 *
 * @module skills/skill-loader
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 5 Implementation
 * @authority ADR-005 Skills Architecture
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type {
  Skill,
  SkillMetadata,
  SkillLoaderConfig,
  SkillLoadResult,
  BinaryRequirement,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default skill file name.
 */
const SKILL_FILE = "skill.md";

/**
 * YAML frontmatter delimiter.
 */
const FRONTMATTER_DELIMITER = "---";

// ============================================================================
// YAML Parser (Simple)
// ============================================================================

interface StackFrame {
  obj: Record<string, unknown>;
  indent: number;
  arrayKey?: string; // If set, this frame is for adding to an array at this key
}

/**
 * Simple YAML parser for skill frontmatter.
 * Handles basic key-value pairs, lists, and nested objects.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  const stack: StackFrame[] = [{ obj: result, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    // Calculate indentation
    const indent = line.search(/\S/);
    const content = line.trim();

    // Pop stack until we find parent with lower indentation
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top && top.indent >= indent) {
        stack.pop();
      } else {
        break;
      }
    }

    const currentFrame = stack[stack.length - 1];
    if (!currentFrame) {
      continue;
    }
    const current = currentFrame.obj;

    // List item
    if (content.startsWith("- ")) {
      const value = content.slice(2).trim();

      // Find the array - it should be at arrayKey in current object
      const arrayKey = currentFrame.arrayKey;
      if (arrayKey && Array.isArray(current[arrayKey])) {
        const arr = current[arrayKey] as unknown[];

        // Simple list item (no colon or colon in quoted string)
        if (!value.includes(":") || value.startsWith('"') || value.startsWith("'")) {
          arr.push(parseValue(value));
        } else {
          // Object in list (e.g., "- name: value")
          const obj: Record<string, unknown> = {};
          const colonIdx = value.indexOf(":");
          const key = value.slice(0, colonIdx).trim();
          const val = value.slice(colonIdx + 1).trim();
          if (key) {
            obj[key] = parseValue(val);
          }
          arr.push(obj);
          stack.push({ obj, indent });
        }
      }
      continue;
    }

    // Key-value pair
    const colonIndex = content.indexOf(":");
    if (colonIndex > 0) {
      const key = content.slice(0, colonIndex).trim();
      const value = content.slice(colonIndex + 1).trim();

      if (value === "") {
        // Nested object or list (value on next lines)
        // Check next non-empty line to determine if list or object
        let nextLine: string | undefined;
        for (let j = i + 1; j < lines.length; j++) {
          const candidate = lines[j];
          if (candidate && candidate.trim()) {
            nextLine = candidate;
            break;
          }
        }
        if (nextLine && nextLine.trim().startsWith("-")) {
          // It's an array
          current[key] = [];
          stack.push({ obj: current, indent, arrayKey: key });
        } else {
          // It's a nested object
          const nested: Record<string, unknown> = {};
          current[key] = nested;
          stack.push({ obj: nested, indent });
        }
      } else {
        current[key] = parseValue(value);
      }
    }
  }

  return result;
}

/**
 * Parse a YAML value to appropriate type.
 */
function parseValue(value: string): unknown {
  // Remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  // Null
  if (value === "null" || value === "~") return null;

  return value;
}

// ============================================================================
// Skill Loader Class
// ============================================================================

/**
 * Loads skills from file system.
 */
export class SkillLoader {
  private readonly config: SkillLoaderConfig;

  constructor(config: SkillLoaderConfig) {
    this.config = config;
  }

  /**
   * Discover all skill directories.
   */
  discoverSkills(): string[] {
    const skillIds: string[] = [];

    for (const dir of this.config.skillDirs) {
      if (!existsSync(dir)) {
        continue;
      }

      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);

        // Skip non-directories
        if (!statSync(entryPath).isDirectory()) {
          continue;
        }

        // Check for skill.md
        const skillFile = join(entryPath, SKILL_FILE);
        if (existsSync(skillFile)) {
          skillIds.push(entry);
        }
      }
    }

    return skillIds;
  }

  /**
   * Load a skill by ID.
   */
  loadSkill(skillId: string): SkillLoadResult {
    // Find skill directory
    let skillPath: string | undefined;
    for (const dir of this.config.skillDirs) {
      const candidate = join(dir, skillId);
      if (existsSync(join(candidate, SKILL_FILE))) {
        skillPath = candidate;
        break;
      }
    }

    if (!skillPath) {
      return {
        success: false,
        error: `Skill "${skillId}" not found`,
      };
    }

    try {
      // Read skill.md
      const skillFile = join(skillPath, SKILL_FILE);
      const content = readFileSync(skillFile, "utf-8");

      // Parse frontmatter
      const { frontmatter, body } = this.parseFrontmatter(content);

      // Validate required fields
      if (!frontmatter.name) {
        return {
          success: false,
          error: `Skill "${skillId}" missing required field: name`,
        };
      }

      // Parse metadata
      const metadata = this.parseMetadata(
        frontmatter.metadata as Record<string, unknown> | undefined,
      );

      // Check requirements if enabled
      if (this.config.validateRequirements && metadata.requires) {
        const missingBins = this.checkRequirements(metadata.requires);
        if (missingBins.length > 0) {
          return {
            success: false,
            error: `Missing required binaries: ${missingBins.join(", ")}`,
          };
        }
      }

      // Check if disabled
      if (!this.config.loadDisabled && metadata.enabled === false) {
        return {
          success: false,
          error: `Skill "${skillId}" is disabled`,
        };
      }

      const skill: Skill = {
        id: skillId,
        name: String(frontmatter.name),
        description: String(frontmatter.description ?? ""),
        metadata,
        path: skillPath,
        prompt: body.trim(),
        status: metadata.enabled === false ? "disabled" : "available",
        loadedAt: new Date().toISOString(),
      };

      return { success: true, skill };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to load skill "${skillId}": ${message}`,
      };
    }
  }

  /**
   * Load all discovered skills.
   */
  loadAllSkills(): Map<string, SkillLoadResult> {
    const results = new Map<string, SkillLoadResult>();
    const skillIds = this.discoverSkills();

    for (const id of skillIds) {
      results.set(id, this.loadSkill(id));
    }

    return results;
  }

  /**
   * Parse YAML frontmatter from markdown content.
   */
  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const lines = content.split("\n");

    // Check for opening delimiter
    if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
      return { frontmatter: {}, body: content };
    }

    // Find closing delimiter
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === FRONTMATTER_DELIMITER) {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) {
      return { frontmatter: {}, body: content };
    }

    const yamlContent = lines.slice(1, endIndex).join("\n");
    const body = lines.slice(endIndex + 1).join("\n");

    return {
      frontmatter: parseYaml(yamlContent),
      body,
    };
  }

  /**
   * Parse metadata from frontmatter.
   */
  private parseMetadata(raw: Record<string, unknown> | undefined): SkillMetadata {
    if (!raw) {
      return {};
    }

    const metadata: SkillMetadata = {};

    if (typeof raw.emoji === "string") {
      metadata.emoji = raw.emoji;
    }

    if (typeof raw.category === "string") {
      metadata.category = raw.category;
    }

    if (typeof raw.author === "string") {
      metadata.author = raw.author;
    }

    if (typeof raw.version === "string") {
      metadata.version = raw.version;
    }

    if (typeof raw.enabled === "boolean") {
      metadata.enabled = raw.enabled;
    }

    // Parse tags
    if (Array.isArray(raw.tags)) {
      metadata.tags = raw.tags.filter((t): t is string => typeof t === "string");
    }

    // Parse requires
    if (Array.isArray(raw.requires)) {
      metadata.requires = raw.requires.map((req) => {
        if (typeof req === "string") {
          return { name: req };
        }
        if (typeof req === "object" && req !== null) {
          const r = req as Record<string, unknown>;
          const result: BinaryRequirement = {
            name: String(r.name ?? ""),
          };
          if (typeof r.version === "string") {
            result.version = r.version;
          }
          if (typeof r.installCommand === "string") {
            result.installCommand = r.installCommand;
          }
          return result;
        }
        return { name: "" };
      }).filter((r) => r.name !== "");
    }

    // Parse install
    if (typeof raw.install === "object" && raw.install !== null) {
      const install = raw.install as Record<string, unknown>;
      metadata.install = {};

      if (Array.isArray(install.npm)) {
        metadata.install.npm = install.npm.filter(
          (p): p is string => typeof p === "string",
        );
      }

      if (Array.isArray(install.shell)) {
        metadata.install.shell = install.shell.filter(
          (c): c is string => typeof c === "string",
        );
      }

      if (typeof install.env === "object" && install.env !== null) {
        metadata.install.env = {};
        for (const [key, value] of Object.entries(install.env)) {
          if (typeof value === "string") {
            metadata.install.env[key] = value;
          }
        }
      }
    }

    return metadata;
  }

  /**
   * Check if required binaries are available.
   */
  private checkRequirements(requires: BinaryRequirement[]): string[] {
    const missing: string[] = [];

    for (const req of requires) {
      try {
        execSync(`which ${req.name}`, { stdio: "ignore" });
      } catch {
        missing.push(req.name);
      }
    }

    return missing;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLoader: SkillLoader | undefined;

export function getSkillLoader(config?: SkillLoaderConfig): SkillLoader {
  if (!globalLoader && config) {
    globalLoader = new SkillLoader(config);
  }
  if (!globalLoader) {
    throw new Error("SkillLoader not initialized. Provide config first.");
  }
  return globalLoader;
}

/**
 * Reset the global SkillLoader instance.
 * Useful for testing or reconfiguration.
 */
export function resetSkillLoader(): void {
  globalLoader = undefined;
}
