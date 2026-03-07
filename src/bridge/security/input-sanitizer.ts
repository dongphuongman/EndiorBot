/**
 * Bridge Input Sanitizer
 *
 * Wraps ShellGuard.checkCommand() (CTO C1) + adds bridge-specific:
 * - Control character stripping
 * - ANSI escape removal
 * - RiskMode positive allowlist (ADR-024 D2)
 * - Length limit
 *
 * @module bridge/security/input-sanitizer
 * @version 1.0.0
 * @authority ADR-024 D1, D2, CTO C1
 * @stage 04 - BUILD (Sprint 82)
 */

import { checkCommand } from "../../security/shell-guard.js";
import type { SessionRiskMode } from "../types.js";

// ============================================================================
// Universal Blocklist (ADR-024 D1)
// ============================================================================

/**
 * Commands blocked in ALL risk modes.
 * Matches at line start (multiline) to catch each line of input.
 */
const UNIVERSAL_BLOCKED = /^!|^sudo\s|^ssh\s|^curl\s|^wget\s|^python\s+-c|^node\s+-e|^docker\s|^kubectl\s|^chmod\s|^rm\s/m;

/**
 * Additional command patterns blocked in `read` mode.
 * Read mode allows ONLY plain text prompts.
 */
const READ_MODE_BLOCKED = /^git\s|^pnpm\s|^npm\s|^npx\s|^yarn\s|^make\s|^cargo\s|^go\s+(?:build|run|test)/m;

/**
 * Shell injection patterns blocked in all modes.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /;\s*rm\s/,
  /\$\(/,
  /`[^`]+`/,
  /\|\s*(?:bash|sh|zsh)\b/,
  />\s*\//,
  /&&\s*curl/,
  /\|\|.*rm/,
];

// ============================================================================
// Sanitizer
// ============================================================================

export interface SanitizeOptions {
  /** Maximum input length */
  maxLength: number;
}

const DEFAULT_OPTIONS: SanitizeOptions = {
  maxLength: 500,
};

/**
 * Sanitize input for bridge sendKeys.
 *
 * Processing order:
 * 1. ShellGuard.checkCommand() (8 deny patterns — CTO C1)
 * 2. Strip control characters (except \n)
 * 3. Strip ANSI escape sequences
 * 4. Universal blocklist (ADR-024 D1)
 * 5. RiskMode-specific blocklist (ADR-024 D2)
 * 6. Shell injection patterns
 * 7. Length limit
 *
 * @throws Error if input is blocked by any check
 */
export function sanitizeBridgeInput(
  input: string,
  riskMode: SessionRiskMode,
  options: SanitizeOptions = DEFAULT_OPTIONS
): string {
  // 0. Empty check
  if (!input || input.trim().length === 0) {
    throw new Error("Empty input");
  }

  // 1. Length limit (check raw first to avoid processing huge strings)
  if (input.length > options.maxLength) {
    throw new Error(`Input too long (${input.length}/${options.maxLength} chars)`);
  }

  // 2. ShellGuard base check (CTO C1 — reuse existing 8 deny patterns)
  const shellCheck = checkCommand(input);
  if (!shellCheck.allowed) {
    throw new Error(`ShellGuard: ${shellCheck.reason}`);
  }

  // 3. Strip control characters (keep \n \r \t)
  let cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 4. Strip ANSI escape sequences
  cleaned = cleaned.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
  cleaned = cleaned.replace(/\x1B\].*?\x07/g, ""); // OSC sequences

  // 5. Universal blocklist (ADR-024 D1)
  if (UNIVERSAL_BLOCKED.test(cleaned)) {
    throw new Error("Blocked: dangerous command (universal blocklist)");
  }

  // 6. RiskMode-specific validation (ADR-024 D2)
  if (riskMode === "read") {
    if (READ_MODE_BLOCKED.test(cleaned)) {
      throw new Error("Blocked: commands not allowed in read mode");
    }
  }

  // 7. Shell injection patterns (all modes)
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      throw new Error("Blocked: shell injection pattern detected");
    }
  }

  return cleaned;
}
