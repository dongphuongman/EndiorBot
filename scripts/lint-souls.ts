/**
 * SOUL Frontmatter Schema Validator
 *
 * Sprint 109 (gstack best practices adoption):
 * Validates that all SOUL-*.md files in docs/reference/templates/souls/
 * have valid YAML frontmatter with required fields and known tool names.
 *
 * Usage:
 *   pnpm lint:souls
 *
 * Exit codes:
 *   0 — all SOUL files pass
 *   1 — one or more validation errors
 *
 * @module scripts/lint-souls
 * @sprint 109
 */

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOULS_DIR =
  process.env["SOULS_DIR_OVERRIDE"] ??
  join(__dirname, "..", "docs", "reference", "templates", "souls");

// ============================================================================
// Valid Claude Code tool names (as of Claude Code v1.x)
// ============================================================================

const VALID_TOOLS = new Set([
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "Agent",
  "AskUserQuestion",
]);

const VALID_CATEGORIES = new Set(["executor", "advisor", "router"]);

const REQUIRED_FIELDS = ["role", "category", "version", "allowed-tools"] as const;

// ============================================================================
// Frontmatter parser
// ============================================================================

interface Frontmatter {
  role?: string;
  category?: string;
  version?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

/**
 * Extract YAML frontmatter from a Markdown file.
 * Returns null if no frontmatter found.
 */
function parseFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Frontmatter = {};

  for (const line of yaml.split("\n")) {
    // Skip blank lines and comment lines
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // List item under allowed-tools
    if (line.startsWith("  - ")) {
      const value = line.slice(4).trim();
      if (!result["allowed-tools"]) result["allowed-tools"] = [];
      (result["allowed-tools"] as string[]).push(value);
      continue;
    }

    // Key: value
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Skip allowed-tools key line (list follows)
    if (key === "allowed-tools") {
      result["allowed-tools"] = result["allowed-tools"] ?? [];
      continue;
    }

    if (value) result[key] = value;
  }

  return result;
}

// ============================================================================
// Validation
// ============================================================================

interface ValidationResult {
  file: string;
  errors: string[];
}

function validateSoul(filePath: string): ValidationResult {
  const fileName = filePath.split("/").pop() ?? filePath;
  const errors: string[] = [];

  const content = readFileSync(filePath, "utf-8");
  const fm = parseFrontmatter(content);

  if (!fm) {
    errors.push("missing YAML frontmatter (expected --- ... --- block at top of file)");
    return { file: fileName, errors };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === null || fm[field] === "") {
      errors.push(`missing required field: ${field}`);
    }
  }

  // Validate category
  if (fm.category && !VALID_CATEGORIES.has(fm.category as string)) {
    errors.push(
      `invalid category: "${fm.category}" (must be one of: ${[...VALID_CATEGORIES].join(", ")})`
    );
  }

  // Validate allowed-tools entries
  if (Array.isArray(fm["allowed-tools"])) {
    if (fm["allowed-tools"].length === 0) {
      errors.push('allowed-tools list is empty (must have at least one tool)');
    }
    for (const tool of fm["allowed-tools"]) {
      if (!VALID_TOOLS.has(tool)) {
        // Suggest closest match
        const suggestion = [...VALID_TOOLS].find(
          (t) => t.toLowerCase() === tool.toLowerCase()
        );
        const hint = suggestion ? ` (did you mean "${suggestion}"?)` : "";
        errors.push(`unknown tool: "${tool}"${hint} — valid tools: ${[...VALID_TOOLS].join(", ")}`);
      }
    }
  }

  return { file: fileName, errors };
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const files = readdirSync(SOULS_DIR)
    .filter((f) => f.startsWith("SOUL-") && f.endsWith(".md"))
    .sort()
    .map((f) => join(SOULS_DIR, f));

  if (files.length === 0) {
    console.error(`❌ No SOUL-*.md files found in ${SOULS_DIR}`);
    process.exit(1);
  }

  const results = files.map(validateSoul);
  const failures = results.filter((r) => r.errors.length > 0);

  for (const result of results) {
    if (result.errors.length === 0) {
      console.log(`✅ ${result.file} — OK`);
    } else {
      for (const err of result.errors) {
        console.error(`❌ ${result.file} — ${err}`);
      }
    }
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`✅ ${files.length} SOUL files checked — all OK`);
  } else {
    console.error(`Errors: ${failures.length} file(s) failed validation`);
    process.exit(1);
  }
}

main();
