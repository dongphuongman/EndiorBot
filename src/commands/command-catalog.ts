/**
 * Command Catalog — Unified Command Discovery (M0, Sprint 132)
 *
 * Single source of truth for `cmd.list` RPC, `commands` dispatcher handler,
 * and `endiorbot commands` CLI subcommand. All four surfaces (Web, Telegram,
 * Zalo, CLI) consume `buildCmdListResult()` — the thin-client invariant.
 *
 * Design authority: docs/02-design/14-Technical-Specs/M0-commands-list-design.md
 *
 * @module commands/command-catalog
 * @version 1.0.0
 * @sprint 132
 */

import { createHash } from "node:crypto";
import type { CommandDispatcher } from "./command-dispatcher.js";

// ============================================================================
// Public types
// ============================================================================

export interface CmdParamSpec {
  name: string;
  description: string;
  type: "string" | "number" | "enum" | "flag";
  required: boolean;
  choices?: string[];
}

export type SurfaceList = "all" | Array<"web" | "telegram" | "zalo" | "cli">;

export interface CmdEntry {
  /** Lowercase command name as registered in dispatcher. Primary key. */
  name: string;
  /** One-line human description. */
  description: string;
  /** Category label (workflow / sdlc / ai / bridge / remote / system). */
  category: string;
  /** Which surfaces expose this command. */
  surfaceAvailability: SurfaceList;
  /** Parameter definitions — empty array when command takes no positional args. */
  parameters: CmdParamSpec[];
  /** Authentication requirement — true means userId is required via Gateway. */
  sensitive: boolean;
  /** Whether the command requires a linked actor identity. */
  requiresLink: boolean;
  /** Optional SDLC stage hint. Empty string when unknown. */
  sdlcStage?: string;
}

export interface CmdListResultMeta {
  /** Total count BEFORE any surface filter. Drives the five-equal-numbers PoL. */
  total: number;
  /** Count AFTER surface filter. Equal to commands.length. */
  filteredCount: number;
  /** Surface that was requested (null when no filter). */
  surface: string | null;
  /** Dispatcher version — SHA-1 over sorted command names for cache invalidation. */
  dispatcherVersion: string;
  /** ISO-8601 timestamp of generation. */
  generatedAt: string;
}

export interface CmdListResult {
  commands: CmdEntry[];
  meta: CmdListResultMeta;
}

export interface CmdListParams {
  /** Optional surface filter. */
  surface?: "web" | "telegram" | "zalo" | "cli";
  /** Include per-command parameter schema. Default: true. */
  includeArgs?: boolean;
  /** Include sensitivity flag. Default: true. */
  includeSensitivity?: boolean;
}

// ============================================================================
// Metadata table — seeded from generateHelpMessage() hardcoded text
// Initial rollout: every command gets surfaceAvailability: "all"
// ============================================================================

interface CommandMeta {
  description: string;
  category: string;
  parameters: CmdParamSpec[];
  surfaceAvailability: SurfaceList;
  sdlcStage?: string;
}

const COMMAND_METADATA: Record<string, CommandMeta> = {
  // ── Workflow ──
  approve: {
    description: "Approve pending request",
    category: "workflow",
    parameters: [{ name: "approvalId", description: "Approval request ID", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  reject: {
    description: "Reject pending request",
    category: "workflow",
    parameters: [
      { name: "approvalId", description: "Approval request ID", type: "string", required: true },
      { name: "reason", description: "Rejection reason", type: "string", required: false },
    ],
    surfaceAvailability: "all",
  },
  // ── SDLC ──
  gate: {
    description: "Quality gate status",
    category: "sdlc",
    parameters: [{ name: "gateId", description: "Gate identifier (G0, G1, G2, G3, G4)", type: "string", required: false }],
    surfaceAvailability: "all",
  },
  compliance: {
    description: "Compliance score / check / fix",
    category: "sdlc",
    parameters: [{ name: "subcommand", description: "score|check|fix", type: "enum", required: false, choices: ["score", "check", "fix"] }],
    surfaceAvailability: "all",
  },
  fix: {
    description: "Run compliance fix",
    category: "sdlc",
    parameters: [
      { name: "--dry-run", description: "Preview changes without applying", type: "flag", required: false },
      { name: "--stage", description: "Target stage", type: "string", required: false },
    ],
    surfaceAvailability: "all",
  },
  init: {
    description: "Project init status",
    category: "sdlc",
    parameters: [],
    surfaceAvailability: "all",
  },
  // ── AI ──
  consult: {
    description: "Multi-model consultation",
    category: "ai",
    parameters: [{ name: "query", description: "Consultation query", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  plan: {
    description: "Structured dev plan (saved to drafts/)",
    category: "ai",
    parameters: [{ name: "description", description: "Plan description", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  agents: {
    description: "List all agents",
    category: "ai",
    parameters: [],
    surfaceAvailability: "all",
  },
  teams: {
    description: "List tier teams",
    category: "ai",
    parameters: [],
    surfaceAvailability: "all",
  },
  audit: {
    description: "Show audit log",
    category: "ai",
    parameters: [],
    surfaceAvailability: "all",
  },
  // ── Bridge ──
  link: {
    description: "Link identity to EndiorBot",
    category: "bridge",
    parameters: [],
    surfaceAvailability: "all",
  },
  launch: {
    description: "Launch agent in tmux session",
    category: "bridge",
    parameters: [
      { name: "agent", description: "Agent name", type: "string", required: true },
      { name: "path", description: "Working directory path", type: "string", required: true },
      { name: "--as", description: "Role override", type: "string", required: false },
    ],
    surfaceAvailability: "all",
  },
  sessions: {
    description: "List active sessions",
    category: "bridge",
    parameters: [],
    surfaceAvailability: "all",
  },
  switch: {
    description: "Switch active session",
    category: "bridge",
    parameters: [{ name: "sessionId", description: "Session identifier", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  capture: {
    description: "Capture session output",
    category: "bridge",
    parameters: [{ name: "lines", description: "Number of lines to capture", type: "number", required: false }],
    surfaceAvailability: "all",
  },
  send: {
    description: "Send task to agent session",
    category: "bridge",
    parameters: [
      { name: "sessionId", description: "Session identifier", type: "string", required: true },
      { name: "message", description: "Task message", type: "string", required: true },
    ],
    surfaceAvailability: "all",
  },
  eval: {
    description: "Evaluate agent output quality",
    category: "bridge",
    parameters: [{ name: "sessionId", description: "Session identifier", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  kill: {
    description: "Kill a session",
    category: "bridge",
    parameters: [{ name: "sessionId", description: "Session identifier", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  // ── Team Monitoring ──
  "team-status": {
    description: "Team dashboard (health, cost)",
    category: "bridge",
    parameters: [{ name: "sessionId", description: "Session identifier", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  "kill-team": {
    description: "Kill entire team",
    category: "bridge",
    parameters: [{ name: "sessionId", description: "Session identifier", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  // ── Remote Shell ──
  repos: {
    description: "List / add / remove repos",
    category: "remote",
    parameters: [],
    surfaceAvailability: "all",
  },
  focus: {
    description: "Set repo focus for this chat",
    category: "remote",
    parameters: [{ name: "name", description: "Repo name", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  where: {
    description: "Show current repo focus",
    category: "remote",
    parameters: [],
    surfaceAvailability: "all",
  },
  cp: {
    description: "Copilot CLI suggest/explain/status",
    category: "remote",
    parameters: [{ name: "subcommand", description: "suggest|explain|status", type: "enum", required: true, choices: ["suggest", "explain", "status"] }],
    surfaceAvailability: "all",
  },
  sh: {
    description: "Read-only shell (allowlist)",
    category: "remote",
    parameters: [{ name: "cmd", description: "Shell command", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  attach: {
    description: "Capture shell output",
    category: "remote",
    parameters: [{ name: "lines", description: "Number of lines", type: "number", required: false }],
    surfaceAvailability: "all",
  },
  run: {
    description: "Run command (approval required)",
    category: "remote",
    parameters: [{ name: "cmd", description: "Command to run", type: "string", required: true }],
    surfaceAvailability: "all",
  },
  // ── System ──
  config: {
    description: "Project config",
    category: "system",
    parameters: [],
    surfaceAvailability: "all",
  },
  cost: {
    description: "Token usage and cost",
    category: "system",
    parameters: [{ name: "--period", description: "Time period (e.g. 7d)", type: "string", required: false }],
    surfaceAvailability: "all",
  },
  mode: {
    description: "Set invoke mode (read|patch)",
    category: "system",
    parameters: [{ name: "mode", description: "read|patch", type: "enum", required: false, choices: ["read", "patch"] }],
    surfaceAvailability: "all",
  },
  webhook: {
    description: "Toggle webhook (Telegram)",
    category: "system",
    parameters: [{ name: "state", description: "on|off", type: "enum", required: false, choices: ["on", "off"] }],
    surfaceAvailability: "all",
  },
  commands: {
    description: "List all available commands",
    category: "system",
    parameters: [
      { name: "--surface", description: "Filter by surface (web|telegram|zalo|cli)", type: "enum", required: false, choices: ["web", "telegram", "zalo", "cli"] },
    ],
    surfaceAvailability: "all",
  },
  help: {
    description: "Show help message",
    category: "system",
    parameters: [],
    surfaceAvailability: "all",
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute a deterministic version string from sorted command names.
 * Enables cache invalidation when commands are added/removed.
 */
function hashOf(names: string[]): string {
  const sorted = [...names].sort().join(",");
  return createHash("sha1").update(sorted).digest("hex").slice(0, 8);
}

/**
 * Fallback metadata for commands not in the table.
 * Logs a warning once so developers notice the gap.
 */
const warnedMissing = new Set<string>();
function fallbackMetadata(name: string): CommandMeta {
  if (!warnedMissing.has(name)) {
    warnedMissing.add(name);
    console.warn(`[command-catalog] WARNING: '${name}' missing from COMMAND_METADATA — using fallback.`);
  }
  return {
    description: "(undocumented)",
    category: "uncategorized",
    parameters: [],
    surfaceAvailability: "all",
  };
}

/**
 * Check whether a command's surfaceAvailability matches the requested surface.
 */
function surfaceMatches(availability: SurfaceList, surface: string): boolean {
  if (availability === "all") return true;
  return (availability as string[]).includes(surface);
}

// ============================================================================
// SSOT builder — the one function all four surfaces call
// ============================================================================

/**
 * Build a CmdListResult envelope from the live dispatcher state.
 *
 * All four surfaces (Web RPC, Telegram, Zalo, CLI) call this single function.
 * Thin-client invariant: no surface-specific logic here.
 *
 * @param dispatcher - The CommandDispatcher instance to enumerate.
 * @param params     - Optional filter/display parameters.
 */
export function buildCmdListResult(
  dispatcher: CommandDispatcher,
  params?: CmdListParams,
): CmdListResult {
  const names = dispatcher.getRegisteredCommands();
  const total = names.length;
  const includeArgs = params?.includeArgs !== false;

  const entries: CmdEntry[] = [];
  for (const name of names) {
    const meta = COMMAND_METADATA[name] ?? fallbackMetadata(name);

    if (params?.surface && !surfaceMatches(meta.surfaceAvailability, params.surface)) {
      continue;
    }

    const entry: CmdEntry = {
      name,
      description: meta.description,
      category: meta.category,
      surfaceAvailability: meta.surfaceAvailability,
      parameters: includeArgs ? meta.parameters : [],
      sensitive: dispatcher.isSensitive(name),
      requiresLink: dispatcher.requiresLink(name),
    };
    if (meta.sdlcStage !== undefined) {
      entry.sdlcStage = meta.sdlcStage;
    }

    entries.push(entry);
  }

  return {
    commands: entries,
    meta: {
      total,
      filteredCount: entries.length,
      surface: params?.surface ?? null,
      dispatcherVersion: hashOf(names),
      generatedAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Channel renderer — formats CmdListResult for OTT chat display
// ============================================================================

/**
 * Render a CmdListResult as a human-readable chat message.
 *
 * Groups commands by category, matching generateHelpMessage() ordering.
 * Used by the `commands` dispatcher handler for Telegram + Zalo.
 */
export function renderCmdListForChannel(result: CmdListResult, channel: string): string {
  const categoryOrder = ["workflow", "sdlc", "ai", "bridge", "remote", "system", "uncategorized"];

  const byCategory = new Map<string, CmdEntry[]>();
  for (const entry of result.commands) {
    const bucket = byCategory.get(entry.category) ?? [];
    bucket.push(entry);
    byCategory.set(entry.category, bucket);
  }

  const isTelegram = channel === "telegram";
  const lines: string[] = [];

  const header = isTelegram ? "*EndiorBot Commands*" : "EndiorBot Commands";
  lines.push(header);
  lines.push("");

  const allCategories = [...categoryOrder, ...byCategory.keys()].filter(
    (c, i, arr) => arr.indexOf(c) === i,
  );

  for (const cat of allCategories) {
    const cmds = byCategory.get(cat);
    if (!cmds || cmds.length === 0) continue;

    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(isTelegram ? `*${label}:*` : `${label}:`);
    for (const cmd of cmds) {
      lines.push(`  /${cmd.name} — ${cmd.description}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${result.meta.filteredCount} commands`);
  return lines.join("\n");
}
