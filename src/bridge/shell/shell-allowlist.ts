/**
 * Shell Allowlist
 *
 * Read-only command allowlist for /sh. Positive allowlist — only commands
 * matching patterns are permitted. Everything else is blocked.
 *
 * @module bridge/shell/shell-allowlist
 * @version 1.0.0
 * @authority ADR-024 D4, Sprint 83
 */

// ============================================================================
// Blocked Patterns (checked first — override allowlist)
// ============================================================================

/**
 * Commands that are ALWAYS blocked regardless of base command.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Privilege escalation
  /\bsudo\b/,
  /\bsu\b/,
  /\bdoas\b/,

  // Destructive operations
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bmkdir\b/,
  /\brmdir\b/,
  /\btouch\b/,

  // Network operations
  /\bcurl\b/,
  /\bwget\b/,
  /\bnc\b/,
  /\bssh\b/,
  /\bscp\b/,

  // Code execution
  /\bpython\b.*\s-[ce]\b/,
  /\bpython3\b.*\s-[ce]\b/,
  /\bnode\b.*\s-e\b/,
  /\bruby\b.*\s-e\b/,
  /\bperl\b.*\s-e\b/,
  /\bbash\b/,
  /\bsh\b\s+-c\b/,
  /\bzsh\b/,
  /\beval\b/,

  // Package management (write)
  /\bnpm\s+install\b/,
  /\bnpm\s+i\b/,
  /\bpnpm\s+install\b/,
  /\bpnpm\s+add\b/,
  /\bpnpm\s+remove\b/,
  /\byarn\s+add\b/,
  /\byarn\s+remove\b/,

  // Git write operations
  /\bgit\s+push\b/,
  /\bgit\s+commit\b/,
  /\bgit\s+reset\b/,
  /\bgit\s+checkout\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+stash\b/,
  /\bgit\s+clean\b/,
  /\bgit\s+rm\b/,

  // Editors
  /\bvi\b/,
  /\bvim\b/,
  /\bnano\b/,
  /\bemacs\b/,

  // Dangerous flags for otherwise-allowed commands
  /\bfind\b.*\s-exec\b/,
  /\bfind\b.*\s-execdir\b/,
  /\bfind\b.*\s-delete\b/,
  /\bfind\b.*\s-ok\b/,
  /\bgit\s+diff\b.*--no-index\b/,
];

// ============================================================================
// Allowed Base Commands
// ============================================================================

/**
 * Base commands that are allowed (if not caught by BLOCKED_PATTERNS).
 */
const ALLOWED_BASE_COMMANDS = new Set([
  // Git (read)
  "git",

  // File inspection
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "file",

  // Search
  "find",
  "rg",
  "grep",

  // Version checks
  "node",
  "pnpm",
  "npm",
  "tsc",

  // Env inspection
  "env",
]);

/**
 * Git subcommands that are read-only.
 */
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "branch",
  "show",
  "remote",
  "tag",
  "shortlog",
  "describe",
  "rev-parse",
  "ls-files",
  "ls-tree",
]);

// ============================================================================
// Path Checks
// ============================================================================

/**
 * Detect paths outside the repo workdir (e.g. ~/.ssh/id_rsa, /etc/passwd).
 * Blocks absolute paths and home-relative paths.
 */
function hasUnsafePath(cmd: string): boolean {
  // Detect absolute paths to sensitive locations
  if (/\/etc\//.test(cmd)) return true;
  if (/\/proc\//.test(cmd)) return true;
  if (/\/sys\//.test(cmd)) return true;
  if (/~\/\.ssh\b/.test(cmd)) return true;
  if (/~\/\.gnupg\b/.test(cmd)) return true;
  if (/~\/\.aws\b/.test(cmd)) return true;
  if (/~\/\.kube\b/.test(cmd)) return true;
  if (/~\/\.env\b/.test(cmd)) return true;

  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a command is in the read-only allowlist.
 *
 * Returns true ONLY if:
 * 1. No BLOCKED_PATTERNS match
 * 2. Base command is in ALLOWED_BASE_COMMANDS
 * 3. Git commands use read-only subcommands
 * 4. No unsafe paths detected
 */
export function isAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return false;

  // 0. Block shell metacharacters — command substitution, chaining, redirection
  if (/\$\(/.test(trimmed)) return false;       // $(...)
  if (/`/.test(trimmed)) return false;           // backtick substitution
  if (/;/.test(trimmed)) return false;           // command chaining
  if (/&&/.test(trimmed)) return false;          // AND chaining
  if (/\|\|/.test(trimmed)) return false;        // OR chaining
  if (/>/.test(trimmed)) return false;           // output redirection
  if (/</.test(trimmed)) return false;           // input redirection

  // 1. Check blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // 2. Check unsafe paths
  if (hasUnsafePath(trimmed)) return false;

  // 3. Validate all pipe segments (not just first)
  const pipeSegments = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
  for (const segment of pipeSegments) {
    const segParts = segment.split(/\s+/);
    const segBase = segParts[0] ?? "";
    if (!ALLOWED_BASE_COMMANDS.has(segBase)) return false;
    // Check blocked patterns for each segment
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(segment)) return false;
    }
    if (hasUnsafePath(segment)) return false;
  }

  // 4. Extract base command from first segment for detailed validation
  const firstCmd = pipeSegments[0] ?? "";
  const parts = firstCmd.split(/\s+/);
  const baseCmd = parts[0] ?? "";

  if (!ALLOWED_BASE_COMMANDS.has(baseCmd)) return false;

  // 4. Git: validate subcommand is read-only
  if (baseCmd === "git") {
    const subCmd = parts[1];
    if (!subCmd || !ALLOWED_GIT_SUBCOMMANDS.has(subCmd)) return false;
  }

  // 5. node/npm/pnpm: only version checks and safe operations
  if (baseCmd === "node" && !parts.includes("-v") && !parts.includes("--version")) return false;
  if (baseCmd === "npm" && !parts.includes("-v") && !parts.includes("--version")) return false;
  if (baseCmd === "tsc" && !parts.includes("--version")) return false;
  if (baseCmd === "pnpm") {
    const subCmd = parts[1];
    if (subCmd === "-v" || subCmd === "--version") return true;
    if (subCmd === "test" && parts.includes("--listTests")) return true;
    if (subCmd === "build" && parts.includes("--dry-run")) return true;
    return false;
  }

  // 6. env: only with grep filter
  if (baseCmd === "env") {
    // Must be piped to grep
    if (!trimmed.includes("|") || !trimmed.includes("grep")) return false;
  }

  return true;
}
