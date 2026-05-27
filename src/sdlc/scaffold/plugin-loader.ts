/**
 * Plugin Loader — Discovers and loads skill files from skills/ directory.
 *
 * Supports two layouts:
 *   - Anthropic standard: skills/<skill-name>/SKILL.md (folder-per-skill)
 *   - Flat fallback: skills/<skill-name>.md
 *
 * Sprint 152, Plan U3.
 *
 * @module sdlc/scaffold/plugin-loader
 * @sdlc SDLC Framework 6.3.1
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { createLogger } from "../../logging/index.js";

const logger = createLogger("plugin-loader");

// ============================================================================
// Types
// ============================================================================

/** Parsed skill from SKILL.md frontmatter. */
export interface DiscoveredSkill {
  /** Skill name (from frontmatter `name` field) */
  name: string;
  /** Skill description (from frontmatter `description` field) */
  description: string;
  /** Optional argument hint */
  argumentHint?: string;
  /** Full content (body after frontmatter) */
  content: string;
  /** Resolved file path */
  filePath: string;
  /** Discovery source: folder-per-skill or flat file */
  source: "folder" | "flat";
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Discover all skills in a project's skills/ directory.
 * Scans recursively for SKILL.md (folder pattern) and *.md (flat fallback).
 */
export function discoverSkills(projectPath: string): DiscoveredSkill[] {
  const skillsDir = join(projectPath, "skills");
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    logger.debug("No skills/ directory found", { projectPath });
    return [];
  }

  const skills: DiscoveredSkill[] = [];
  const seen = new Set<string>(); // dedup by name

  // Pass 1: folder-per-skill pattern (skills/<name>/SKILL.md) — priority
  try {
    for (const entry of readdirSync(skillsDir)) {
      const entryPath = join(skillsDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;

      const skillFile = join(entryPath, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const skill = loadSkill(skillFile, "folder");
      if (skill && !seen.has(skill.name)) {
        skills.push(skill);
        seen.add(skill.name);
      }
    }
  } catch {
    logger.debug("Error scanning skills/ subdirectories", { skillsDir });
  }

  // Pass 2: flat pattern (skills/*.md, excluding README.md) — fallback
  try {
    for (const entry of readdirSync(skillsDir)) {
      const entryPath = join(skillsDir, entry);
      if (
        statSync(entryPath).isFile() &&
        extname(entry).toLowerCase() === ".md" &&
        entry.toUpperCase() !== "README.MD"
      ) {
        const skill = loadSkill(entryPath, "flat");
        if (skill && !seen.has(skill.name)) {
          skills.push(skill);
          seen.add(skill.name);
        }
      }
    }
  } catch {
    logger.debug("Error scanning flat skills/ files", { skillsDir });
  }

  // Sort alphabetically by name (deterministic order for conflict resolution)
  skills.sort((a, b) => a.name.localeCompare(b.name));

  logger.debug("Skills discovered", {
    count: skills.length,
    names: skills.map((s) => s.name),
  });
  return skills;
}

/**
 * Load and parse a single SKILL.md file.
 */
export function loadSkill(
  filePath: string,
  source: "folder" | "flat"
): DiscoveredSkill | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);

    if (!frontmatter.name) {
      logger.debug("Skill missing 'name' in frontmatter, skipping", {
        filePath,
      });
      return null;
    }

    const result: DiscoveredSkill = {
      name: frontmatter.name,
      description: frontmatter.description ?? "",
      content: body,
      filePath,
      source,
    };

    // exactOptionalPropertyTypes: only set if present
    if (frontmatter["argument-hint"]) {
      result.argumentHint = frontmatter["argument-hint"];
    }

    return result;
  } catch (error) {
    logger.debug("Failed to load skill", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================================================
// Frontmatter Parser (lightweight, no external deps)
// ============================================================================

interface ParsedFrontmatter {
  frontmatter: Record<string, string>;
  body: string;
}

/**
 * Parse YAML-like frontmatter from markdown.
 * Handles simple key: value pairs (no nested YAML).
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const fmText = match[1];
  const bodyText = match[2];
  if (fmText === undefined || bodyText === undefined) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  const lines = fmText.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line
        .slice(colonIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && value) {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, body: bodyText };
}
