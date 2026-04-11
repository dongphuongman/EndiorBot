/**
 * Allowlist Pattern Matcher
 *
 * Glob-style pattern matcher for exec-policy command allowlists.
 * Ported semantics from openclaw/src/infra/exec-allowlist-pattern.ts,
 * simplified to use the placeholder-style approach (Sprint 68 glob code).
 *
 * Pattern semantics:
 *   - Exact strings match literally (case-sensitive on POSIX)
 *   - Single '*' matches any non-whitespace boundary within a token
 *   - Patterns are matched against full normalized command string
 *   - Hard-deny wins over allow (enforced in check.ts, not here)
 *
 * @module security/exec-approvals/allowlist-pattern
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL §5, M1-exec-policy-design.md §2.1
 * @sprint 132
 */

const GLOB_REGEX_CACHE_LIMIT = 512;
const globRegexCache = new Map<string, RegExp>();

/**
 * Normalize command string: collapse whitespace, trim.
 */
export function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, " ");
}

/**
 * Escape all RegExp special characters except those we convert.
 */
function escapeRegExpLiteral(input: string): string {
  return input.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a glob pattern to a RegExp.
 *
 * Uses a small regex compiler (no minimatch dependency):
 *   '*' → matches any sequence of characters (greedy, including spaces for command args)
 *   All other regex special chars are escaped.
 *
 * Results are cached up to GLOB_REGEX_CACHE_LIMIT.
 */
function compilePatternRegex(pattern: string): RegExp {
  const cached = globRegexCache.get(pattern);
  if (cached) {
    return cached;
  }

  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? "";
    if (ch === "*") {
      // * matches anything (including spaces — command args can have spaces)
      regex += ".*";
      i += 1;
      continue;
    }
    regex += escapeRegExpLiteral(ch);
    i += 1;
  }
  regex += "$";

  const compiled = new RegExp(regex);
  if (globRegexCache.size >= GLOB_REGEX_CACHE_LIMIT) {
    globRegexCache.clear();
  }
  globRegexCache.set(pattern, compiled);
  return compiled;
}

/**
 * Test whether a single pattern matches a normalized command string.
 *
 * @param pattern - Allowlist or hard-deny pattern (may contain *)
 * @param command - Normalized command to test against
 * @returns true if the pattern matches
 */
export function matchesPattern(pattern: string, command: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return false;
  }
  const normalizedCmd = normalizeCommand(command);
  return compilePatternRegex(trimmed).test(normalizedCmd);
}

/**
 * Find the first pattern in a list that matches the command.
 *
 * @returns The matched pattern string, or null if none match.
 */
export function findMatchingPattern(patterns: string[], command: string): string | null {
  const normalizedCmd = normalizeCommand(command);
  for (const pattern of patterns) {
    if (matchesPattern(pattern, normalizedCmd)) {
      return pattern;
    }
  }
  return null;
}
