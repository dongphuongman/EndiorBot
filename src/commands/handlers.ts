/**
 * Shared Command Handlers
 *
 * Channel-agnostic command implementations used by ALL channels (Web, Telegram, Zalo, CLI).
 * Moved from channels/telegram/telegram-commands.ts to commands/handlers.ts (Sprint 102).
 *
 * Sprint 76: 10 OTT commands (/gate, /compliance, /fix, /consult, /agents, /teams, etc.)
 * Sprint 82.5: 6 Bridge commands (/link, /launch, /sessions, /switch, /capture, /kill)
 *
 * @module commands/handlers
 * @version 3.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 102 (Unified Command Architecture)
 * @authority ADR-019 OTT Channel + ADR-024 Notification Bridge + ADR-030 Unified Commands
 */

import { resolve, join } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";


import type { AgentRole } from "../agents/types/handoff.js";
import type { TeamId } from "../agents/types/team.js";
import { getTeamRegistry } from "../agents/orchestrator/team-registry.js";
import { getAgentIcon } from "../channels/telegram/keyboards.js";
import { VALID_AGENT_TYPES, CAPTURE_LINE_LIMITS, type AgentProviderType, type SessionRiskMode, type BridgeAuditActor } from "../bridge/types.js";
import { getAgentLauncher } from "../bridge/agent-launcher.js";
import { isValidAgentRole, VALID_AGENT_ROLES } from "../bridge/intelligence/envelope.js";
import { getSessionRegistry } from "../bridge/session-registry.js";
import { getTmuxBridge } from "../bridge/tmux/tmux-bridge.js";
import { redactBridgeOutput } from "../bridge/security/output-redactor.js";
import { getBridgeAuditLogger } from "../bridge/security/bridge-audit.js";
import type { PermissionRequest } from "../bridge/types.js";
import { createPermissionKeyboard } from "../channels/telegram/keyboards.js";
import type { InlineKeyboardMarkup } from "../channels/telegram/keyboards.js";
import {
  buildTurnContext,
  loadTurnContextFromActive,
  incrementTurnCount,
  getTurnCount,
  shouldRefreshContext,
} from "../bridge/intelligence/turn-context.js";
import { serializeEnvelopeForInjection, buildFullEnvelope } from "../bridge/intelligence/envelope-builder.js";
import { evaluateOutput } from "../bridge/intelligence/output-evaluator.js";
import { appendEvaluation, generateEvaluationId } from "../bridge/intelligence/evaluation-store.js";
import { assessComplexity } from "../bridge/intelligence/complexity-gate.js";
import { TEAM_LEADER_ROLES } from "../bridge/intelligence/team-installer.js";
import { isValidTeamId } from "../agents/types/team.js";
import { getFeatureFlagWithEnvOverride } from "../config/feature-flags.js";
import { createComplexityGateKeyboard, createTeamCostKeyboard } from "../channels/telegram/keyboards.js";
import { randomBytes } from "node:crypto";
import { getTeamStatus, getTeamSessions, formatTeamDashboard } from "../bridge/teams/team-monitor.js";
import { getBridgePolicyManager } from "../bridge/security/bridge-policy.js";
import { createPricingRegistry } from "../budget/pricing-registry.js";

/**
 * Sanitize user input for safe echo in Telegram Markdown responses.
 * Strips Markdown special chars and limits length to prevent injection.
 */
export function sanitizeForEcho(input: string): string {
  return input
    .replace(/[*_`\[\]()~>#+|{}\\]/g, "")
    .slice(0, 80);
}

// ============================================================================
// Types
// ============================================================================

// PJM C2: Use canonical CommandResult from command-dispatcher (no duplicate)
import type { CommandResult } from "./command-dispatcher.js";
export type { CommandResult } from "./command-dispatcher.js";

// ============================================================================
// Agent & Team Icons
// ============================================================================

const TEAM_ICONS: Record<TeamId, string> = {
  fullstack: "🛠️",
  planning: "📋",
  design: "🎨",
  dev: "💻",
  qa: "🧪",
  ops: "🚀",
  executive: "👔",
};

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle /agents command — list all agents with icons.
 */
export function handleAgentsCommand(): CommandResult {
  const lines: string[] = ["🤖 *Available Agents*", ""];

  // SE4A Executors
  lines.push("*SE4A Executors:*");
  const se4a: AgentRole[] = ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack"];
  for (const agent of se4a) {
    lines.push(`  ${getAgentIcon(agent)} @${agent}`);
  }

  lines.push("");
  lines.push("*SE4H Advisors (STANDARD+):*");
  const se4h: AgentRole[] = ["ceo", "cpo", "cto"];
  for (const agent of se4h) {
    lines.push(`  ${getAgentIcon(agent)} @${agent}`);
  }

  lines.push("");
  lines.push("Usage: `@agent task` or `[@agent: task]`");

  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /teams command — list tier-appropriate teams with leaders.
 */
export function handleTeamsCommand(
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE",
): CommandResult {
  const registry = getTeamRegistry(tier);
  const lines: string[] = ["👥 *Available Teams*", ""];

  const allTeamIds: TeamId[] = ["fullstack", "planning", "design", "dev", "qa", "ops", "executive"];

  for (const teamId of allTeamIds) {
    const lookup = registry.getTeam(teamId);
    if (!lookup.found || !lookup.team.isActive) continue;

    const icon = TEAM_ICONS[teamId] ?? "🔹";
    lines.push(`  ${icon} @${teamId} → leader: @${lookup.team.leader}`);
  }

  lines.push("");
  lines.push(`Tier: ${registry.getTier()}`);
  lines.push("Usage: `@team task` (routes to leader with team context)");

  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /gate command — show gate status.
 */
export function handleGateCommand(args: string[]): CommandResult {
  const gateId = args[0];
  if (!gateId) {
    return {
      success: true,
      response: "📊 *Quality Gates*\n\nUsage: `/gate <gateId>`\nExample: `/gate G2`\n\nGates: G0.1, G1, G2, G3, G4",
    };
  }

  const safeGateId = sanitizeForEcho(gateId);
  return {
    success: true,
    response: `📊 Gate ${safeGateId}\n\nUse: \`@pm check gate ${safeGateId} status\` for full evaluation.`,
  };
}

/**
 * Handle /compliance command — show compliance score.
 */
export function handleComplianceCommand(args: string[]): CommandResult {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "score" || subCommand === "check") {
    return {
      success: true,
      response: "📋 *Compliance*\n\nUse: `@pm check compliance status` for full report.\n\nTo fix issues: `/fix --dry-run`",
    };
  }

  return {
    success: true,
    response: `📋 Compliance: unknown sub-command '${sanitizeForEcho(subCommand)}'\nUsage: /compliance [score|check]`,
  };
}

/**
 * Handle /fix command — Sprint 103 compliance fix on ALL channels (ADR-031).
 *
 * Strategy A (CTO C2):
 * - `/fix` → dry-run via ComplianceFixEngine (safe, read-only, <3s)
 * - `/fix --yes` → redirect to Bridge mode (avoids 60-180s OTT silence)
 * - `/fix --stage 01-planning` → filtered dry-run
 *
 * @see ADR-031 Channel × Command Feature Matrix
 */

// Sprint 104: Track per-workspace deprecation notice (once per workspace)
const fixDeprecationShown = new Set<string>();

export async function executeFixCommand(args: string[], workspace?: string): Promise<CommandResult> {
  const hasYes = args.includes("--yes");
  const stageIdx = args.indexOf("--stage");
  const stage = stageIdx >= 0 ? args[stageIdx + 1] : undefined;

  // No workspace → try active project fallback (PJM C1 pattern from handleInitCommand)
  if (!workspace) {
    const { loadActiveProject } = await import("../config/paths.js");
    const active = loadActiveProject();
    if (active?.path) {
      workspace = active.path;
    } else {
      return {
        success: false,
        response: "No workspace focused. Use `/focus <repo>` first, then `/fix`.",
      };
    }
  }

  // --yes on OTT → redirect to Bridge mode (CTO C2: avoid 60-180s latency)
  if (hasYes) {
    // Stage name inside code block — only strip dangerous chars, keep hyphens/digits
    const safeStage = stage ? stage.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) : "";
    const stageHint = safeStage ? ` --stage ${safeStage}` : "";
    return {
      success: true,
      response: [
        "⚠️ *Write operation — use Bridge mode*",
        "",
        "Compliance fix modifies files (60-180s, multi-stage).",
        "Use Bridge mode for live execution:",
        "",
        `1. \`/launch claude ${sanitizeForEcho(workspace.slice(0, 40))} --risk patch\``,
        `2. \`/send <session-id> compliance fix --yes${stageHint}\``,
        "   _(use `/sessions` to see session-id after step 1)_",
        "3. `/capture` to monitor progress",
      ].join("\n"),
    };
  }

  // Dry-run: execute directly (safe, read-only)
  const { detectProject } = await import("../sdlc/scaffold/project-detector.js");
  const detection = detectProject(resolve(workspace));
  const tier = detection.configTier ?? detection.structureTier ?? null;

  if (!tier) {
    return {
      success: false,
      response: "Cannot detect project tier. Ensure `.sdlc-config.json` exists or use `endiorbot init` first.",
    };
  }

  const { createComplianceFixEngine } = await import("../sdlc/compliance/fix-engine.js");

  const engineOpts: {
    projectPath: string;
    tier: typeof tier;
    dryRun: boolean;
    stage?: string;
  } = {
    projectPath: resolve(workspace),
    tier,
    dryRun: true,
  };
  if (stage) engineOpts.stage = stage;

  try {
    const engine = createComplianceFixEngine(engineOpts);
    const result = await engine.fix();
    let response = formatFixResult(result, workspace);

    // Sprint 104 (CPO C6): One-per-workspace deprecation note for /fix command
    if (!fixDeprecationShown.has(workspace)) {
      fixDeprecationShown.add(workspace);
      response += "\n\n💡 _Tip: use `/compliance fix` instead — `/fix` will be renamed in a future release._";
    }

    return { success: true, response };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, response: `Compliance fix failed: ${msg}` };
  }
}

/**
 * Format ComplianceFixResult as OTT-friendly Markdown summary.
 * CPO C2: bounded, clear per-stage summary.
 */
function formatFixResult(result: import("../sdlc/compliance/fix-types.js").ComplianceFixResult, workspace: string): string {
  const lines: string[] = [
    result.dryRun ? "📋 *Compliance Fix — Dry Run*" : "🔧 *Compliance Fix — Complete*",
    "",
  ];

  lines.push(`Workspace: \`${sanitizeForEcho(workspace.slice(0, 40))}\``);
  lines.push(`Score: ${result.scoreBefore}% → ${result.scoreAfter}%`);
  lines.push(`Issues: ${result.totalIssues} found, ${result.issuesFixed} fixed, ${result.issuesFailed} failed`);
  lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.taskResults.length > 0) {
    lines.push("");
    lines.push("*Per-stage results:*");
    for (const task of result.taskResults) {
      const icon = task.success ? "✅" : "❌";
      const actions = task.actionResults.map((a) => a.action.artifactType).join(", ");
      lines.push(`  ${icon} ${task.task.stage}: ${actions}`);
    }
  }

  if (result.dryRun && result.totalIssues > 0) {
    lines.push("");
    lines.push("To apply fixes, use Bridge mode:");
    lines.push("`/launch claude <path> --risk patch`");
    lines.push("`/send <session-id> compliance fix --yes`");
    lines.push("_(use `/sessions` to see session-id)_");
  }

  return lines.join("\n");
}

/**
 * Legacy alias — kept for backward compat during Sprint 103.
 * @deprecated Use executeFixCommand() instead.
 */
export function handleFixCommand(args: string[]): CommandResult {
  // Sync fallback for callers that haven't migrated to async
  const dryRun = !args.includes("--yes");
  const stageIdx = args.indexOf("--stage");
  const stage = stageIdx >= 0 ? args[stageIdx + 1] : undefined;

  const parts: string[] = ["🔧 *Compliance Fix*", ""];
  parts.push(dryRun ? "Mode: *dry-run* (preview only)" : "Mode: *live* (use Bridge mode)");
  if (stage) parts.push(`Stage: \`${sanitizeForEcho(stage)}\``);
  parts.push("");
  parts.push("Use: `@pm check and fix compliance issues` for full report.");
  parts.push("");
  parts.push("Options:");
  parts.push("  `/fix` — preview (dry-run)");
  parts.push("  `/fix --yes` — apply fixes (Bridge mode)");
  parts.push("  `/fix --stage 01-planning` — fix specific stage");

  return { success: true, response: parts.join("\n") };
}

/**
 * Handle /consult command — multi-model consultation.
 */
export function handleConsultCommand(args: string[]): CommandResult {
  const query = args.join(" ");
  if (!query) {
    return {
      success: true,
      response: "🧠 *Multi-Model Consultation*\n\nUsage: `/consult <query>`\nExample: `/consult Redis vs PostgreSQL for sessions?`",
    };
  }

  return {
    success: true,
    response: `🧠 *Consultation*\n\nQuery: "${sanitizeForEcho(query.slice(0, 200))}"\n\nUse: \`@researcher ${sanitizeForEcho(query.slice(0, 100))}\` for full multi-model response.`,
  };
}

/**
 * Handle /config command — show project configuration.
 */
export function handleConfigCommand(): CommandResult {
  return {
    success: true,
    response: "⚙️ *Project Config*\n\nUse: `@pm show project config` for full configuration.",
  };
}

// ============================================================================
// Shared Init Command (Sprint 102 — Unified Command Architecture)
// No console.log, no process.exit, no CLI-specific imports (CTO C4)
// ============================================================================

/** Options for the shared init command — used by both CLI and Gateway. */
export interface ExecuteInitOptions {
  projectName: string;
  tier: string;     // validated by caller, but we re-validate
  targetPath: string;
  force?: boolean;
  analyze?: boolean;       // dry-run preview
  skipAnalysis?: boolean;  // skip collectProjectContext
}

/** Structured result from the shared init command. */
export interface ExecuteInitResult {
  success: boolean;
  detection: Awaited<ReturnType<typeof import("../sdlc/scaffold/project-detector.js").detectProject>>;
  tier: string;
  tierSource: string;
  techStackSummary: string;
  /** Scaffold steps (if scaffolding was performed) */
  steps: Array<{ name: string; path: string; status: string; error?: string | undefined }>;
  /** Codebase snapshot (if analysis succeeded) */
  snapshot?: Awaited<ReturnType<typeof import("../sdlc/compliance/project-context-collector.js").collectProjectContext>>;
  /** Migration info */
  migrated?: { from: string };
  /** Backup path if --force was used */
  backupPath?: string;
  durationMs: number;
  /** Progress messages for callers to display */
  messages: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Shared init command logic — used by ALL channels (CLI, Web, Telegram, Zalo).
 *
 * Returns structured data. NO console output, NO process.exit (CTO C4).
 * Callers format the result for their channel (Markdown, spinners, JSON, etc.).
 */
export async function executeInitCommand(opts: ExecuteInitOptions): Promise<ExecuteInitResult> {
  const startTime = Date.now();
  const messages: string[] = [];

  // Lazy imports to avoid circular deps
  const { scaffoldProject } = await import("../sdlc/scaffold/structure-generator.js");
  const { detectProject } = await import("../sdlc/scaffold/project-detector.js");
  const { createBackup, migrateConfig, writeMigratedConfig } = await import("../sdlc/scaffold/index.js");

  const VALID_TIERS = ["LITE", "STANDARD", "PROFESSIONAL", "ENTERPRISE"];

  // Validate tier
  const normalizedTier = opts.tier.toUpperCase();
  const isValidTier = VALID_TIERS.includes(normalizedTier);

  // Step 1: Detect existing project state
  const detection = detectProject(opts.targetPath);
  const detectedTier = detection.configTier ?? detection.structureTier;

  // Step 2: Determine tier (priority: explicit > detected > default STANDARD)
  let tier: string;
  let tierSource: string;

  if (isValidTier) {
    tier = normalizedTier;
    tierSource = "explicit";
  } else if (detectedTier) {
    tier = detectedTier;
    tierSource = detection.configTier ? "config (.sdlc-config.json)" : "docs/ structure";
  } else {
    tier = "STANDARD";
    tierSource = "default (no config or docs/ detected)";
  }

  // Step 3: Codebase analysis for snapshot-aware templates (Sprint 79)
  let snapshot: Awaited<ReturnType<typeof import("../sdlc/compliance/project-context-collector.js").collectProjectContext>> | undefined;
  let techStackSummary = "";
  if (!opts.skipAnalysis && !opts.analyze) {
    try {
      const { collectProjectContext } = await import("../sdlc/compliance/project-context-collector.js");
      snapshot = await collectProjectContext(opts.targetPath, tier as any);
      const parts = [
        snapshot.techStack.language,
        snapshot.techStack.framework,
        snapshot.techStack.packageManager && `(${snapshot.techStack.packageManager})`,
        snapshot.techStack.desktop,
      ].filter(Boolean);
      if (parts.length > 0) {
        techStackSummary = `Tech stack: ${parts.join(", ")}`;
        messages.push(techStackSummary);
      }
    } catch {
      messages.push("Codebase analysis failed — using generic placeholders");
    }
  }

  const mkResult = (partial: Partial<ExecuteInitResult>): ExecuteInitResult => ({
    success: true,
    detection,
    tier,
    tierSource,
    techStackSummary,
    steps: [],
    messages,
    durationMs: Date.now() - startTime,
    ...partial,
  });

  // Step 4: Handle migration states (TINYSDLC, SDLC_ORCHESTRATOR)
  if (detection.state === "TINYSDLC" || detection.state === "SDLC_ORCHESTRATOR") {
    const source = detection.generator ?? detection.state.toLowerCase();
    messages.push(`Detected ${source} config — migrating to EndiorBot...`);

    const migrationOpts: Parameters<typeof migrateConfig>[1] = {
      createBackup: true,
      dryRun: opts.analyze ?? false,
    };
    if (isValidTier) migrationOpts.tier = normalizedTier as any;
    const migrationResult = await migrateConfig(detection, migrationOpts);

    if (!migrationResult.success || !migrationResult.config) {
      return mkResult({
        success: false,
        error: `Migration failed: ${migrationResult.error}`,
        migrated: { from: source },
      });
    }

    if (migrationResult.backupPath) {
      messages.push(`Backup created: ${migrationResult.backupPath}`);
    }

    // Write migrated config
    if (!opts.analyze && detection.configPath) {
      await writeMigratedConfig(detection.configPath, migrationResult.config);
      messages.push(`Config migrated from ${source}`);
    }

    // Scaffold remaining structure
    const migTier = (migrationResult.config.tier as string) ?? tier;
    const scaffoldConfig: Parameters<typeof scaffoldProject>[0] = {
      projectName: migrationResult.config.project?.name ?? opts.projectName,
      tier: migTier as any,
      targetPath: opts.targetPath,
      dryRun: opts.analyze ?? false,
      force: false,
      detection,
    };
    if (snapshot) scaffoldConfig.snapshot = snapshot;
    const result = await scaffoldProject(scaffoldConfig);

    const migPartial: Partial<ExecuteInitResult> = {
      tier: migTier,
      steps: result.steps.map((s) => {
        const step: { name: string; path: string; status: string; error?: string } = { name: s.name, path: s.path, status: s.status };
        if (s.error) step.error = s.error;
        return step;
      }),
      migrated: { from: source },
    };
    if (snapshot) migPartial.snapshot = snapshot;
    if (migrationResult.backupPath) migPartial.backupPath = migrationResult.backupPath;
    return mkResult(migPartial);
  }

  // Step 5: Handle already-initialized (ENDIORBOT) — complete missing files or skip
  if (detection.state === "ENDIORBOT" && !opts.force) {
    if (detection.missingFiles.length === 0) {
      messages.push("Project is up to date. No changes needed.");
      return mkResult({ steps: [] });
    }
    // Complete missing files
    messages.push(`Found ${detection.missingFiles.length} missing files. Completing...`);
    const completeOpts: Parameters<typeof scaffoldProject>[0] = {
      projectName: opts.projectName,
      tier: (detection.configTier ?? tier) as any,
      targetPath: opts.targetPath,
      dryRun: opts.analyze ?? false,
      force: false,
    };
    if (snapshot) completeOpts.snapshot = snapshot;
    const result = await scaffoldProject(completeOpts);
    const completePartial: Partial<ExecuteInitResult> = {
      tier: detection.configTier ?? tier,
      steps: result.steps.map((s) => {
        const step: { name: string; path: string; status: string; error?: string } = { name: s.name, path: s.path, status: s.status };
        if (s.error) step.error = s.error;
        return step;
      }),
    };
    if (snapshot) completePartial.snapshot = snapshot;
    return mkResult(completePartial);
  }

  // Step 6: Handle UNKNOWN state
  if (detection.state === "UNKNOWN" && !opts.force) {
    return mkResult({
      success: false,
      error: "Unknown config format detected. Use --force to overwrite with EndiorBot structure.",
    });
  }

  // Step 7: Backup before force on existing projects
  let backupPath: string | undefined;
  if (opts.force && detection.state !== "FRESH") {
    try {
      backupPath = await createBackup(opts.targetPath, detection.existingFiles);
      if (backupPath) messages.push(`Backup created: ${backupPath}`);
    } catch {
      messages.push("Backup failed — proceeding anyway");
    }
  }

  // Step 8: Scaffold (FRESH, PARTIAL, or force-overwrite)
  messages.push(detection.state === "FRESH"
    ? "Fresh project — creating full scaffold..."
    : detection.state === "PARTIAL"
      ? "Partial project — completing structure..."
      : `Force scaffolding (${detection.state})...`);

  const scaffoldOpts: Parameters<typeof scaffoldProject>[0] = {
    projectName: opts.projectName,
    tier: tier as any,
    targetPath: opts.targetPath,
    dryRun: opts.analyze ?? false,
    force: opts.force ?? false,
    detection,
  };
  if (snapshot) scaffoldOpts.snapshot = snapshot;
  const result = await scaffoldProject(scaffoldOpts);

  if (!result.success) {
    const errors = result.steps
      .filter((s) => s.status === "error")
      .map((s) => `${s.name}: ${s.error ?? "unknown"}`)
      .join("; ");
    return mkResult({
      success: false,
      error: `Scaffold failed: ${errors}`,
      steps: result.steps.map((s) => {
        const step: { name: string; path: string; status: string; error?: string } = { name: s.name, path: s.path, status: s.status };
        if (s.error) step.error = s.error;
        return step;
      }),
    });
  }

  const finalPartial: Partial<ExecuteInitResult> = {
    steps: result.steps.map((s) => {
      const step: { name: string; path: string; status: string; error?: string } = { name: s.name, path: s.path, status: s.status };
      if (s.error) step.error = s.error;
      return step;
    }),
  };
  if (snapshot) finalPartial.snapshot = snapshot;
  if (backupPath) finalPartial.backupPath = backupPath;
  return mkResult(finalPartial);
}

/**
 * Handle /init command — Gateway/OTT wrapper.
 *
 * Parses args → calls executeInitCommand() → formats Markdown response.
 * Sprint 102: Thin wrapper pattern (CTO F5).
 */
export async function handleInitCommand(args: string[], workspacePath?: string): Promise<CommandResult> {
  // PJM C1: fallback to active project when no workspace provided (Zalo/Telegram direct handlers)
  if (!workspacePath) {
    const { loadActiveProject } = await import("../config/paths.js");
    const active = loadActiveProject();
    if (active?.path) {
      workspacePath = active.path;
    } else {
      return {
        success: false,
        response: "No workspace focused. Use `/focus <repo>` first, then `/init [TIER]`.",
      };
    }
  }

  const { basename } = await import("node:path");

  // Parse args into shared options
  const force = args.includes("--force");
  const analyze = args.includes("--analyze");
  const skipAnalysis = args.includes("--skip-analysis");
  const nonFlagArgs = args.filter((a) => !a.startsWith("--"));
  const tierArg = nonFlagArgs[0] ?? "";
  const projectName = nonFlagArgs[1] ?? basename(workspacePath);

  const result = await executeInitCommand({
    projectName,
    tier: tierArg,
    targetPath: workspacePath,
    force,
    analyze,
    skipAnalysis,
  });

  // Format as Markdown for OTT/Web display
  if (!result.success) {
    return { success: false, response: `Init failed: ${result.error ?? "unknown error"}` };
  }

  const detectionLines: string[] = [];
  if (result.detection.state !== "FRESH") {
    detectionLines.push(`Detected: ${result.detection.state} project`);
    if (result.detection.configTier) detectionLines.push(`Config tier: ${result.detection.configTier}`);
    if (result.detection.structureTier) detectionLines.push(`Docs tier: ${result.detection.structureTier}`);
  } else {
    detectionLines.push("Detected: Fresh project (no SDLC files)");
  }
  detectionLines.push(`Selected tier: *${result.tier}* (${result.tierSource})`);
  if (result.techStackSummary) detectionLines.push(result.techStackSummary);
  if (result.migrated) detectionLines.push(`Migrated from: ${result.migrated.from}`);
  if (result.backupPath) detectionLines.push(`Backup: ${result.backupPath}`);

  const created = result.steps.filter((s) => s.status === "created").length;
  const updated = result.steps.filter((s) => s.status === "updated").length;
  const skipped = result.steps.filter((s) => s.status === "skipped" || s.status === "preserved").length;

  if (created === 0 && updated === 0 && result.steps.length === 0) {
    return {
      success: true,
      response: [
        `*Project Already Initialized* — ${projectName} (${result.tier})`,
        ``,
        ...detectionLines,
        ``,
        result.detection.missingFiles.length > 0
          ? `Missing: ${result.detection.missingFiles.join(", ")}\nUse \`/init ${result.tier} --force\` to re-scaffold.`
          : "All files up to date.",
      ].join("\n"),
    };
  }

  const details = result.steps
    .map((s) => `  ${s.status === "created" ? "+" : s.status === "updated" ? "~" : "-"} ${s.name}`)
    .join("\n");

  return {
    success: true,
    response: [
      analyze ? `*Init Preview (dry-run)* — ${projectName} (${result.tier})` : `*Init Complete* — ${projectName} (${result.tier})`,
      ``,
      ...detectionLines,
      ``,
      `Created: ${created} | Updated: ${updated} | Skipped: ${skipped}`,
      `Duration: ${result.durationMs}ms`,
      ``,
      details,
      ``,
      `Workspace: \`${workspacePath}\``,
    ].join("\n"),
  };
}

/**
 * Handle /mode command — mutate session risk mode (Sprint 104: GAP-004).
 *
 * CPO C4: session.riskMode in SessionInfo is the canonical SSOT.
 * CPO C5: Show transition "READ → PATCH (session X)" + scope.
 * Breaking change: requires linked actor (withLinkedActor in index.ts).
 * Unlinked users receive "No active session" instead of generic help text.
 */
export function handleModeCommand(
  args: string[],
  actorId: string,
): CommandResult {
  const registry = getSessionRegistry();
  const sessionId = activeSessionMap.get(actorId);
  const session = sessionId ? registry.get(sessionId) : null;

  if (!session) {
    return {
      success: false,
      response: "No active session. Use `/launch` first.\n\nUsage: /mode [read|patch]",
    };
  }

  const requestedMode = args[0]?.toLowerCase();

  if (!requestedMode) {
    return {
      success: true,
      response: `*Current Mode:* ${session.riskMode.toUpperCase()} (session \`${session.id}\`)\n\nUsage: /mode [read|patch]\n\n• READ — safe, read-only operations (default)\n• PATCH — file modifications (write-enabled)`,
    };
  }

  if (requestedMode !== "read" && requestedMode !== "patch") {
    return {
      success: false,
      response: `Unknown mode: ${sanitizeForEcho(requestedMode)}\nValid modes: read, patch`,
    };
  }

  const previousMode = session.riskMode;
  // CPO C4: mutate canonical field
  session.riskMode = requestedMode;

  // CPO C5: show transition + scope
  const icon = requestedMode === "patch" ? "🔓" : "🔒";
  return {
    success: true,
    response: `${icon} ${previousMode.toUpperCase()} → ${requestedMode.toUpperCase()} (session \`${session.id}\`)\nAffects this session only.`,
  };
}

/**
 * Handle /webhook command — toggle webhook mode (Telegram only).
 */
export function handleWebhookCommand(
  args: string[],
  isWebhookActive: boolean,
): CommandResult {
  const action = args[0]?.toLowerCase();

  if (!action) {
    return {
      success: true,
      response: `🔗 *Webhook Status:* ${isWebhookActive ? "ACTIVE" : "INACTIVE (polling)"}

Usage: /webhook [on|off]

• on — Enable webhook mode (requires HTTPS reverse proxy)
• off — Disable webhook, resume polling`,
    };
  }

  if (action === "on") {
    return {
      success: true,
      response: "🔗 Webhook activation requires HTTPS URL configuration.\nSet `ENDIORBOT_TELEGRAM_WEBHOOK_URL` environment variable first.\n\nExample:\n`export ENDIORBOT_TELEGRAM_WEBHOOK_URL=https://your-domain/webhook/telegram`",
    };
  }

  if (action === "off") {
    return {
      success: true,
      response: "🔗 Webhook will be disabled. Polling will resume.",
    };
  }

  return {
    success: false,
    response: `Unknown webhook action: ${sanitizeForEcho(action)}\nUsage: /webhook [on|off]`,
  };
}

// ============================================================================
// Bridge Commands (Sprint 82.5 — ADR-024)
// ============================================================================

/**
 * Agent short name → AgentProviderType mapping.
 */
const AGENT_SHORT_NAMES: Record<string, AgentProviderType> = {
  claude: "claude-code",
  "claude-code": "claude-code",
  cursor: "cursor",
  codex: "codex-cli",
  "codex-cli": "codex-cli",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
};

/**
 * In-memory identity binding: telegramUserId → actorId.
 * All linked users get "ceo@endiorbot" (single-user system).
 */
const identityMap = new Map<string, string>();

/**
 * In-memory active session per actorId.
 */
const activeSessionMap = new Map<string, string>();

// ============================================================================
// Sprint 90 — Pending Team Launch (complexity gate)
// ============================================================================

interface PendingTeamLaunch {
  agentType: AgentProviderType;
  projectPath: string;
  teamId: TeamId;
  actorId: string;
  task: string;
  createdAt: number;
}

const pendingTeamLaunches = new Map<string, PendingTeamLaunch>();
const pendingTeamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const TEAM_GATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Exported for testing */
export { pendingTeamLaunches, pendingTeamTimeouts, TEAM_GATE_TIMEOUT_MS };

/**
 * Handle /link command — bind channel identity to EndiorBot actorId.
 */
export function handleLinkCommand(
  userId: string,
  username?: string,
  channel?: string,
): CommandResult {
  const actorId = "ceo@endiorbot";
  identityMap.set(userId, actorId);

  const displayName = username ?? "unknown";
  const channelName: BridgeAuditActor = (channel as BridgeAuditActor) ?? "telegram";

  getBridgeAuditLogger().log({
    event: "identity_link",
    actorId,
    actor: channelName,
    details: { userId, username: displayName, channel: channelName },
  });

  return {
    success: true,
    response: `✅ Linked as *${actorId}* (${channelName}: ${sanitizeForEcho(displayName)})

Available bridge commands:
  /launch <agent> <path> [--as role] — Launch agent in tmux
  /sessions — List active sessions
  /switch <sessionId> — Switch session
  /capture [lines] — Capture output
  /kill <sessionId> — Kill session`,
  };
}

/**
 * Get linked actorId for a Telegram user.
 * Returns null if user has not called /link.
 */
export function getLinkedActorId(telegramUserId: string): string | null {
  return identityMap.get(telegramUserId) ?? null;
}

/**
 * Handle /launch command — launch an AI agent in tmux.
 *
 * Validates path (MF-2 path traversal protection):
 * - Must be absolute after resolve()
 * - Must be under $HOME or /tmp
 */
export async function handleLaunchCommand(
  args: string[],
  actorId: string,
  workspace?: string,
): Promise<CommandResult> {
  if (args.length === 0) {
    const agentList = VALID_AGENT_TYPES.map((t) => `  • ${t}`).join("\n");
    const roleList = VALID_AGENT_ROLES.join(", ");
    return {
      success: false,
      response: `Usage: /launch <agent> [path] [--as <role>] [--as-team <teamId>]

Agents:
${agentList}

Short names: claude, cursor, codex, gemini
Default path: current project directory

SOUL Roles (--as): ${roleList}
Teams (--as-team): dev, planning, design, qa, ops, executive
Example: /launch claude ~/project --as pm
Example: /launch claude ~/project --as-team dev "Refactor auth module"`,
    };
  }

  // Parse --as, --as-team, and --risk flags
  let agentRole: AgentRole | undefined;
  let teamId: TeamId | undefined;
  let riskMode: SessionRiskMode | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--as" && i + 1 < args.length) {
      const role = args[i + 1] ?? "";
      if (isValidAgentRole(role)) {
        agentRole = role;
      } else {
        return {
          success: false,
          response: `Unknown role: ${sanitizeForEcho(role)}\nValid roles: ${VALID_AGENT_ROLES.join(", ")}`,
        };
      }
      i++; // Skip the role value
    } else if (args[i] === "--as-team" && i + 1 < args.length) {
      // Sprint 90: Parse --as-team <teamId>
      const tid = args[i + 1] ?? "";
      if (isValidTeamId(tid)) {
        teamId = tid;
      } else {
        return {
          success: false,
          response: `Unknown team: ${sanitizeForEcho(tid)}\nValid teams: dev, planning, design, qa, ops, executive`,
        };
      }
      i++; // Skip the teamId value
    } else if (args[i] === "--risk" && i + 1 < args.length) {
      // Sprint 104: Parse --risk [read|patch] (GAP-002)
      const mode = (args[i + 1] ?? "").toLowerCase();
      if (mode === "read" || mode === "patch") {
        riskMode = mode as SessionRiskMode;
      } else {
        return {
          success: false,
          response: `Unknown risk mode: ${sanitizeForEcho(mode)}\nValid: read, patch`,
        };
      }
      i++; // Skip the mode value
    } else {
      filteredArgs.push(args[i] ?? "");
    }
  }

  // Mutual exclusion: --as and --as-team cannot coexist
  if (agentRole && teamId) {
    return {
      success: false,
      response: "Cannot use --as and --as-team together. Use --as for solo or --as-team for team mode.",
    };
  }

  // Sprint 90: Check AGENT_TEAMS flag when --as-team is used
  if (teamId && !getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return {
      success: false,
      response: "AGENT_TEAMS feature flag is disabled.\nSet ENDIORBOT_FF_AGENT_TEAMS=true to use team mode.",
    };
  }

  // Sprint 90: Derive agentRole from team leader (CTO MF-1: no registry in launcher)
  if (teamId) {
    const leaderRole = TEAM_LEADER_ROLES[teamId];
    if (leaderRole) {
      agentRole = leaderRole;
    }
  }

  // Resolve agent type
  const agentInput = (filteredArgs[0] ?? "").toLowerCase();
  const agentType = AGENT_SHORT_NAMES[agentInput];
  if (!agentType) {
    return {
      success: false,
      response: `Unknown agent: ${sanitizeForEcho(agentInput)}\nValid: ${VALID_AGENT_TYPES.join(", ")}`,
    };
  }

  // Resolve and validate path (MF-2: path traversal protection)
  // Sprint 99: Use workspace (from /focus) as default when no explicit path given (ADR-029 AD-6)
  const rawPath = filteredArgs[1] ?? workspace ?? process.cwd();
  const resolvedPath = resolve(rawPath);
  const homeDir = homedir();
  const tmpDir = tmpdir();

  if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith(tmpDir) && !resolvedPath.startsWith("/tmp")) {
    return {
      success: false,
      response: `Path must be under ${homeDir} or /tmp.\nGiven: ${sanitizeForEcho(resolvedPath.slice(0, 50))}`,
    };
  }

  // Collect remaining args as task string (for complexity gate)
  const taskString = filteredArgs.slice(2).join(" ");

  // Sprint 90: Complexity gate for team mode
  if (teamId) {
    const assessment = assessComplexity(taskString);
    if (assessment.level === "simple") {
      // Generate gate ID and store pending launch
      const gateId = randomBytes(8).toString("hex");
      pendingTeamLaunches.set(gateId, {
        agentType,
        projectPath: resolvedPath,
        teamId,
        actorId,
        task: taskString,
        createdAt: Date.now(),
      });

      // Set timeout: auto-solo on expiry (CTO MF-2: consume-once)
      const timer = setTimeout(() => {
        const pending = pendingTeamLaunches.get(gateId);
        if (pending) {
          pendingTeamLaunches.delete(gateId);
          pendingTeamTimeouts.delete(gateId);

          getBridgeAuditLogger().log({
            event: "team_launch_aborted",
            actorId: pending.actorId,
            actor: "system",
            details: {
              teamId: pending.teamId,
              reason: "timeout",
              task: pending.task.slice(0, 100),
            },
          });
        }
      }, TEAM_GATE_TIMEOUT_MS);
      pendingTeamTimeouts.set(gateId, timer);

      const taskPreview = taskString.length > 0
        ? `\nTask: "${sanitizeForEcho(taskString)}"`
        : "";

      return {
        success: true,
        response: `⚠️ *Complexity Gate*

This task may be too simple for team mode (est. 3x token cost).
Reason: ${assessment.reason}${taskPreview}`,
        replyMarkup: createComplexityGateKeyboard(gateId),
      };
    }
    // Complex task → proceed with team launch below
  }

  // Launch via AgentLauncher
  const launcher = getAgentLauncher();
  const launchOptions: Parameters<typeof launcher.launch>[0] = {
    agentType,
    projectPath: resolvedPath,
    actorId,
  };
  if (agentRole) {
    launchOptions.agentRole = agentRole;
  }
  if (teamId) {
    launchOptions.teamId = teamId;
  }
  if (riskMode) {
    // Sprint 104: GAP-002 — wire --risk flag to LaunchOptions (already supported in AgentLauncher)
    launchOptions.riskMode = riskMode;
  }
  const result = await launcher.launch(launchOptions);

  if (!result.success || !result.session) {
    return {
      success: false,
      response: `Launch failed: ${result.error ?? "unknown error"}`,
    };
  }

  const session = result.session;
  activeSessionMap.set(actorId, session.id);

  const roleLabel = session.agentRole ? `\nRole: @${session.agentRole}` : "";
  const teamLabel = session.teamId ? `\nTeam: ${session.teamId}-team` : "";

  return {
    success: true,
    response: `🚀 *Agent Launched*

Agent: ${session.agentType}${roleLabel}${teamLabel}
Session: \`${session.id}\`
tmux: \`${session.tmuxTarget}\`
Path: ${sanitizeForEcho(session.projectPath.slice(0, 50))}
Mode: ${session.riskMode}

Use /capture to see output, /kill to stop.`,
  };
}

/**
 * Handle complexity gate callback — CEO approves team or switches to solo.
 * CTO MF-2: Consume-once semantics with timeout cleanup.
 */
export async function handleComplexityGateCallback(
  action: string, // "team" or "solo"
  gateId: string,
  actorId: string,
): Promise<CommandResult> {
  // Consume-once: retrieve and delete pending entry
  const pending = pendingTeamLaunches.get(gateId);
  if (!pending) {
    return { success: false, response: "Gate expired or already resolved." };
  }
  pendingTeamLaunches.delete(gateId);
  const timer = pendingTeamTimeouts.get(gateId);
  if (timer) clearTimeout(timer);
  pendingTeamTimeouts.delete(gateId);

  const audit = getBridgeAuditLogger();

  // Audit: gate decision
  audit.log({
    event: "complexity_gate_decision",
    actorId,
    actor: "telegram",
    details: {
      gateId,
      teamId: pending.teamId,
      decision: action,
      task: pending.task.slice(0, 100),
    },
  });

  // Launch with team or solo
  const launcher = getAgentLauncher();
  const launchOptions: Parameters<typeof launcher.launch>[0] = {
    agentType: pending.agentType,
    projectPath: pending.projectPath,
    actorId: pending.actorId,
  };

  if (action === "team") {
    // Team launch: set both teamId and derived leader role
    const leaderRole = TEAM_LEADER_ROLES[pending.teamId];
    if (leaderRole) launchOptions.agentRole = leaderRole;
    launchOptions.teamId = pending.teamId;
  } else {
    // Solo launch: use leader role without team
    const leaderRole = TEAM_LEADER_ROLES[pending.teamId];
    if (leaderRole) launchOptions.agentRole = leaderRole;
  }

  const result = await launcher.launch(launchOptions);

  if (!result.success || !result.session) {
    return {
      success: false,
      response: `Launch failed: ${result.error ?? "unknown error"}`,
    };
  }

  const session = result.session;
  activeSessionMap.set(actorId, session.id);

  const modeLabel = action === "team" ? "team" : "solo";
  const roleLabel = session.agentRole ? `\nRole: @${session.agentRole}` : "";
  const teamLabel = session.teamId ? `\nTeam: ${session.teamId}-team` : "";

  return {
    success: true,
    response: `🚀 *Agent Launched* (${modeLabel})

Agent: ${session.agentType}${roleLabel}${teamLabel}
Session: \`${session.id}\`
tmux: \`${session.tmuxTarget}\`
Path: ${sanitizeForEcho(session.projectPath.slice(0, 50))}
Mode: ${session.riskMode}

Use /capture to see output, /kill to stop.`,
  };
}

/**
 * Handle /sessions command — list active bridge sessions.
 */
export function handleSessionsCommand(): CommandResult {
  const registry = getSessionRegistry();
  const sessions = registry.getActive();

  if (sessions.length === 0) {
    return {
      success: true,
      response: "📋 *Sessions*\n\nNo active sessions.\nUse /launch to start one.",
    };
  }

  const lines: string[] = ["📋 *Active Sessions*", ""];
  for (const s of sessions) {
    lines.push(`• \`${s.id}\``);
    lines.push(`  Agent: ${s.agentType} | Mode: ${s.riskMode}`);
    if (s.teamId) {
      lines.push(`  Team: ${s.teamId}-team (leader: @${s.agentRole ?? "unknown"})`);
    } else if (s.agentRole) {
      lines.push(`  Role: @${s.agentRole}`);
    }
    lines.push(`  tmux: \`${s.tmuxTarget}\``);
    lines.push("");
  }

  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /switch command — switch active session context.
 */
export function handleSwitchCommand(
  args: string[],
  actorId: string,
): CommandResult {
  if (args.length === 0) {
    const current = activeSessionMap.get(actorId);
    if (!current) {
      return {
        success: true,
        response: "No active session.\n\nUsage: /switch <sessionId>",
      };
    }
    return {
      success: true,
      response: `Current session: \`${current}\`\n\nUsage: /switch <sessionId>`,
    };
  }

  const switchTarget = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(switchTarget);

  if (!session) {
    return {
      success: false,
      response: `Session not found: \`${sanitizeForEcho(switchTarget.slice(0, 40))}\``,
    };
  }

  activeSessionMap.set(actorId, switchTarget);
  return {
    success: true,
    response: `Switched to session \`${session.id}\` (${session.agentType})`,
  };
}

/**
 * Handle /capture command — capture output from active session's tmux pane.
 */
export async function handleCaptureCommand(
  args: string[],
  actorId: string,
  _telegramUserId: string,
): Promise<CommandResult> {
  const sessionId = activeSessionMap.get(actorId);
  if (!sessionId) {
    return {
      success: false,
      response: "No active session. Use /launch first or /switch to select one.",
    };
  }

  const registry = getSessionRegistry();
  const session = registry.get(sessionId);
  if (!session || session.status !== "active") {
    activeSessionMap.delete(actorId);
    return {
      success: false,
      response: "No active session. Previous session may have ended.",
    };
  }

  const lineCount = args[0] ? parseInt(args[0], 10) : undefined;
  const tmux = getTmuxBridge();

  try {
    const raw = await tmux.capturePane(session.tmuxTarget, lineCount);
    const redacted = redactBridgeOutput(raw, session.riskMode);

    if (redacted.blocked) {
      return {
        success: false,
        response: `Capture blocked: ${redacted.reason ?? "sensitive content detected"}`,
      };
    }

    getBridgeAuditLogger().log({
      event: "capture",
      actorId,
      actor: "telegram",
      sessionId: session.id,
      agentType: session.agentType,
      details: { lines: lineCount, violations: redacted.violations },
    });

    return {
      success: true,
      response: `📸 *Capture* (\`${session.id}\`${session.teamId ? ` — ${session.teamId}-team` : ""})\n\n\`\`\`\n${redacted.content}\n\`\`\``,
    };
  } catch (err) {
    return {
      success: false,
      response: `Capture failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

/**
 * Handle /kill command — kill a bridge session.
 */
export async function handleKillCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /kill <sessionId>\n\nUse /sessions to list active sessions.",
    };
  }

  const killTarget = args[0] ?? "";
  const launcher = getAgentLauncher();
  const result = await launcher.kill(killTarget, actorId);

  if (!result.success) {
    return {
      success: false,
      response: `Kill failed: ${result.error ?? "Session not found"}`,
    };
  }

  // Clear from active session if it was the current one
  if (activeSessionMap.get(actorId) === killTarget) {
    activeSessionMap.delete(actorId);
  }

  return {
    success: true,
    response: `💀 Session \`${sanitizeForEcho(killTarget.slice(0, 40))}\` killed.`,
  };
}

// ============================================================================
// /send Command (Sprint 86 — ADR-024 §8.5)
// ============================================================================

/** CTO A2: Maximum payload length for sendKeys */
const SEND_MAX_CHARS = 4096;

/**
 * Handle /send command — send task instruction to a running agent session.
 *
 * Usage: /send <sessionId> <message>
 *
 * Prepends turn-time context prefix (sprint, blockers, task) to the message
 * before sending via tmux sendKeys. Only allowed for PATCH/INTERACTIVE sessions.
 *
 * CTO A2: Payload (context + message) capped at 4096 chars.
 * CTO W3: sendKeys uses tmux load-buffer + paste-buffer, so shell metacharacters
 * in the message are NOT interpreted — no sanitization needed here.
 */
export async function handleSendCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  const sessionId = args[0];
  if (!sessionId) {
    return {
      success: false,
      response: `Usage: /send <sessionId> <message>

Example: /send bridge_123_abc fix the auth bug

Use /sessions to list active sessions.`,
    };
  }

  const messageParts = args.slice(1);
  if (messageParts.length === 0) {
    return {
      success: false,
      response: "Missing message. Usage: /send <sessionId> <message>",
    };
  }

  const message = messageParts.join(" ");

  // Look up session
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session || session.status !== "active") {
    return {
      success: false,
      response: `Session not found or inactive: \`${sanitizeForEcho(sessionId.slice(0, 40))}\`\n\nUse /sessions to list active sessions.`,
    };
  }

  // RiskMode enforcement: /send only allowed in PATCH/INTERACTIVE
  if (session.riskMode === "read") {
    return {
      success: false,
      // CPO C5: show current mode + actionable fix options (Sprint 104)
      response: `Cannot /send to READ mode session (\`${session.id}\`).\n\nCurrent mode: READ\nUse \`/mode patch\` to change, or relaunch with \`--risk patch\`.`,
    };
  }

  // Sprint 87: Increment turn counter for this session
  const turnCount = incrementTurnCount(session.id);

  // Sprint 88: Pre-send auto-evaluation — evaluate previous turn before sending next
  let evalSummary = "";
  if (turnCount > 1) {
    try {
      const summary = await runEvaluation(
        session.id,
        session.tmuxTarget,
        session.riskMode,
        turnCount - 1,
        actorId,
        session.agentType,
      );
      if (summary) evalSummary = summary;
    } catch {
      // Evaluation failure is non-fatal — proceed with send
    }
  }

  // Build turn-time context prefix
  const contextData = loadTurnContextFromActive();
  let contextPrefix = buildTurnContext(contextData);

  // Sprint 87 (CTO MF-2): On refresh turns (every 10th), prepend richer
  // context from envelope builder. Refresh logic lives here (orchestrator),
  // not in turn-context.ts (which stays standalone).
  if (shouldRefreshContext(session.id)) {
    try {
      const dummyPersona = { agentRole: "assistant" as const, soulContent: "", soulContentHash: "" };
      const envelope = buildFullEnvelope(dummyPersona);
      const serialized = serializeEnvelopeForInjection(envelope);
      if (serialized) {
        contextPrefix = serialized + "\n" + contextPrefix;
      }
    } catch {
      // Refresh failure is non-fatal — use basic context
    }
  }

  // Compose full payload
  const payload = contextPrefix ? contextPrefix + message : message;

  // CTO A2: sendKeys MAX 4096 chars
  if (payload.length > SEND_MAX_CHARS) {
    return {
      success: false,
      response: `Message too long (${payload.length} chars). Maximum is ${SEND_MAX_CHARS} chars (including context prefix of ${contextPrefix.length} chars).`,
    };
  }

  // Send to tmux
  const tmux = getTmuxBridge();
  await tmux.sendKeys(session.tmuxTarget, payload);
  await tmux.sendEnter(session.tmuxTarget);

  // Audit log
  getBridgeAuditLogger().log({
    event: "send_command",
    actorId,
    actor: "telegram",
    sessionId: session.id,
    agentType: session.agentType,
    details: {
      messageLength: message.length,
      contextPrefixLength: contextPrefix.length,
      fullPayloadLength: payload.length,
      turnCount,
    },
  });

  const contextInfo = contextPrefix ? " (with context)" : "";
  const evalInfo = evalSummary ? `\n\n📊 *Turn ${turnCount - 1} eval:*\n${evalSummary}` : "";
  return {
    success: true,
    response: `📤 *Sent${contextInfo}*\n\nSession: \`${session.id}\`\nLength: ${payload.length} chars${evalInfo}`,
  };
}

// ============================================================================
// Evaluator (Sprint 88 — ADR-025 Post-turn)
// ============================================================================

/**
 * Run evaluation on a session's tmux output.
 * Captures output, evaluates, stores, and logs audit event.
 * Returns formatted summary or null on failure.
 */
async function runEvaluation(
  sessionId: string,
  tmuxTarget: string,
  riskMode: string,
  turnNumber: number,
  actorId: string,
  agentType?: string,
): Promise<string | null> {
  const captureLines = CAPTURE_LINE_LIMITS[riskMode as keyof typeof CAPTURE_LINE_LIMITS] ?? 50;
  const tmux = getTmuxBridge();
  const raw = await tmux.capturePane(tmuxTarget, captureLines);

  const evalResult = evaluateOutput(raw, turnNumber);
  if (!evalResult) return null;

  const record = {
    id: generateEvaluationId(),
    ts: new Date().toISOString(),
    turnNumber,
    score: evalResult.score,
    signals: evalResult.signals,
    summary: evalResult.summary,
    captureHash: evalResult.captureHash,
    captureLines: raw.split("\n").length,
  };

  appendEvaluation(sessionId, record);

  const auditEntry: { event: "evaluation_recorded"; actorId: string; actor: "telegram"; sessionId: string; agentType?: string; details: Record<string, unknown> } = {
    event: "evaluation_recorded",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      turnNumber,
      score: evalResult.score,
      captureLines: record.captureLines,
    },
  };
  if (agentType) auditEntry.agentType = agentType;
  getBridgeAuditLogger().log(auditEntry);

  const badge = evalResult.score >= 60 ? "✅ PASS" : "⚠️ WARN";
  return `${badge} Score: ${evalResult.score}/100\n${evalResult.summary}`;
}

/**
 * Handle /eval command — evaluate output from an agent session.
 *
 * Usage: /eval <sessionId>
 *
 * Captures tmux output, runs 5-signal vibecoding analysis,
 * stores evaluation, and returns formatted score card.
 *
 * @authority ADR-025 Sprint 88
 */
export async function handleEvalCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  const sessionId = args[0];
  if (!sessionId) {
    return {
      success: false,
      response: `Usage: /eval <sessionId>\n\nEvaluate agent output quality (5-signal vibecoding index).\nUse /sessions to list active sessions.`,
    };
  }

  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session || session.status !== "active") {
    return {
      success: false,
      response: `Session not found or inactive: \`${sanitizeForEcho(sessionId.slice(0, 40))}\`\n\nUse /sessions to list active sessions.`,
    };
  }

  try {
    const turnNumber = getTurnCount(session.id) || 1;
    const summary = await runEvaluation(
      session.id,
      session.tmuxTarget,
      session.riskMode,
      turnNumber,
      actorId,
      session.agentType,
    );

    if (!summary) {
      return {
        success: false,
        response: `No evaluatable output captured from session \`${session.id}\`.\n\nThe agent may not have produced enough output yet.`,
      };
    }

    return {
      success: true,
      response: `📊 *Evaluation* — \`${session.id}\`\n\n${summary}`,
    };
  } catch (err) {
    return {
      success: false,
      response: `Evaluation failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

// ============================================================================
// Permission Approval (Sprint 85 — ADR-024 §8.4)
// ============================================================================

/**
 * Format a permission request as a Telegram message with inline keyboard.
 *
 * Returns the message text and InlineKeyboardMarkup for the bot to send.
 */
export function formatPermissionMessage(
  request: PermissionRequest,
): { text: string; keyboard: InlineKeyboardMarkup } {
  const fileInfo = request.filePath
    ? `\nFile: \`${sanitizeForEcho(request.filePath.slice(0, 60))}\``
    : "";

  const text = `🔐 *Permission Request*

Session: \`${request.sessionId}\`
Tool: *${sanitizeForEcho(request.toolName)}*${fileInfo}
Mode: ${request.riskMode}
Expires: 5 minutes

Approve or deny this operation:`;

  return {
    text,
    keyboard: createPermissionKeyboard(request.id),
  };
}

/**
 * Format a permission decision confirmation message.
 */
export function formatPermissionDecisionMessage(
  permissionId: string,
  decision: string,
  toolName: string,
): string {
  const icon = decision === "approve" ? "✅" : decision === "deny" ? "❌" : "⏰";
  const label = decision === "approve" ? "Approved" : decision === "deny" ? "Denied" : "Timed out";
  return `${icon} Permission *${label}*\n\nTool: ${sanitizeForEcho(toolName)}\nID: \`${permissionId}\``;
}

/**
 * Format a permission timeout notification.
 */
export function formatPermissionTimeoutMessage(
  request: PermissionRequest,
): string {
  return `⏰ Permission *timed out* (auto-denied)

Tool: ${sanitizeForEcho(request.toolName)}
Session: \`${request.sessionId}\``;
}

// ============================================================================
// Team Monitoring (Sprint 91 — ADR-026)
// ============================================================================

/** In-memory cost threshold overrides (teamId → adjusted threshold USD). */
const costThresholdOverrides = new Map<string, number>();

export { costThresholdOverrides };

/**
 * Handle /team-status command — show team dashboard with health + cost.
 */
export async function handleTeamStatusCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /team-status <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /sessions to check." };
  }

  const tmux = getTmuxBridge();
  const policy = getBridgePolicyManager().getPolicy();
  const pricingRegistry = createPricingRegistry();
  const override = costThresholdOverrides.get(session.teamId);

  const deps: import("../bridge/teams/team-monitor.js").TeamStatusDeps = {
    registry,
    tmux,
    policy,
    pricingRegistry,
  };
  if (override !== undefined) deps.thresholdOverride = override;

  const status = await getTeamStatus(session.teamId, deps);

  const dashboard = formatTeamDashboard(status);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_status_checked",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId: session.teamId,
      memberCount: status.members.length,
      totalCostUsd: status.totalCostUsd,
      thresholdExceeded: status.thresholdExceeded,
    },
  });

  // If threshold exceeded, include cost keyboard
  const result: CommandResult = { success: true, response: dashboard };
  if (status.thresholdExceeded) {
    result.replyMarkup = createTeamCostKeyboard(session.teamId);
  }
  return result;
}

/**
 * Handle /kill-team command — kill all sessions in a team.
 */
export async function handleKillTeamCommand(
  args: string[],
  actorId: string,
): Promise<CommandResult> {
  if (!getFeatureFlagWithEnvOverride("AGENT_TEAMS")) {
    return { success: false, response: "AGENT_TEAMS feature flag is disabled." };
  }

  if (args.length === 0) {
    return {
      success: false,
      response: "Usage: /kill-team <sessionId>\n\nUse /sessions to find team session IDs.",
    };
  }

  const sessionId = args[0] ?? "";
  const registry = getSessionRegistry();
  const session = registry.get(sessionId);

  if (!session) {
    return { success: false, response: `Session not found: \`${sanitizeForEcho(sessionId)}\`` };
  }

  if (!session.teamId) {
    return { success: false, response: "This session is not part of a team. Use /kill for solo sessions." };
  }

  const teamId = session.teamId;
  const teamSessions = getTeamSessions(teamId, registry);

  if (teamSessions.length === 0) {
    return { success: true, response: `Team ${teamId}-team already stopped.` };
  }

  const launcher = getAgentLauncher();
  const killedIds: string[] = [];

  for (const ts of teamSessions) {
    const killResult = await launcher.kill(ts.id, actorId);
    if (killResult.success) {
      killedIds.push(ts.id);
    }
    // Clear from active session if it was the current one
    if (activeSessionMap.get(actorId) === ts.id) {
      activeSessionMap.delete(actorId);
    }
  }

  // Clear cost override for this team
  costThresholdOverrides.delete(teamId);

  // Audit
  const audit = getBridgeAuditLogger();
  audit.log({
    event: "team_killed",
    actorId,
    actor: "telegram",
    sessionId,
    details: {
      teamId,
      memberCount: killedIds.length,
      sessionIds: killedIds,
    },
  });

  return {
    success: true,
    response: `💀 Team ${teamId}-team killed (${killedIds.length} members stopped).`,
  };
}

/**
 * Handle team cost threshold callback (Sprint 91).
 *
 * action: "extend" → add $2 to cost override
 * action: "stop" → kill team
 */
export async function handleTeamCostCallback(
  action: string,
  teamId: string,
  actorId: string,
): Promise<CommandResult> {
  const audit = getBridgeAuditLogger();

  if (action === "extend") {
    const policy = getBridgePolicyManager().getPolicy();
    const current = costThresholdOverrides.get(teamId) ?? policy.teamCostThresholdUsd;
    const newThreshold = current + 2.0;
    costThresholdOverrides.set(teamId, newThreshold);

    audit.log({
      event: "team_cost_extended",
      actorId,
      actor: "telegram",
      details: { teamId, previousThreshold: current, newThreshold },
    });

    return {
      success: true,
      response: `✅ Cost limit extended to $${newThreshold.toFixed(2)} for ${teamId}-team.`,
    };
  }

  if (action === "stop") {
    // Find any active session for this team to get a sessionId
    const registry = getSessionRegistry();
    const teamSessions = getTeamSessions(teamId, registry);
    if (teamSessions.length === 0) {
      return { success: true, response: `Team ${teamId}-team already stopped.` };
    }
    return handleKillTeamCommand([teamSessions[0]!.id], actorId);
  }

  return { success: false, response: `Unknown cost action: ${action}` };
}

// ============================================================================
// Cost Command (Sprint 114)
// ============================================================================

/**
 * Handle /cost command — show token usage and estimated cost.
 * Reads from RL training JSONL files to aggregate token_usage fields.
 */
export function handleCostCommand(args: string[]): CommandResult {
  const rlDir = join(homedir(), ".endiorbot", "rl-training-data");

  if (!existsSync(rlDir)) {
    return { success: true, response: "No usage data available yet." };
  }

  // Parse period: default 24h, optional --period 7d
  let periodHours = 24;
  const periodIdx = args.indexOf("--period");
  if (periodIdx >= 0 && args[periodIdx + 1]) {
    const val = args[periodIdx + 1]!;
    if (val.endsWith("d")) periodHours = parseInt(val, 10) * 24;
    else if (val.endsWith("h")) periodHours = parseInt(val, 10);
  }
  const cutoff = Date.now() - periodHours * 60 * 60 * 1000;

  // C5 fix: Build set of date strings within the period to filter filenames
  const relevantDates = new Set<string>();
  for (let d = new Date(cutoff); d <= new Date(); d = new Date(d.getTime() + 86_400_000)) {
    relevantDates.add(d.toISOString().slice(0, 10));
  }

  // Read JSONL files
  let totalInput = 0;
  let totalOutput = 0;
  let totalRecords = 0;
  let recordsWithTokens = 0;
  const providerTokens = new Map<string, { input: number; output: number }>();

  try {
    const files = readdirSync(rlDir).filter((f: string) => {
      if (!f.endsWith(".jsonl")) return false;
      // C5 fix: Only read files whose date matches the period
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) return relevantDates.has(dateMatch[1]!);
      return true; // non-dated files: read anyway
    });
    for (const file of files) {
      const content = readFileSync(join(rlDir, file), "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as {
            timestamp?: number;
            provider?: string;
            token_usage?: { input?: number; output?: number; total?: number };
          };
          if (rec.timestamp && rec.timestamp < cutoff) continue;

          totalRecords++;
          const tu = rec.token_usage;
          if (tu) {
            recordsWithTokens++;
            const inp = tu.input ?? 0;
            const out = tu.output ?? 0;
            totalInput += inp;
            totalOutput += out;

            const provider = rec.provider ?? "unknown";
            const existing = providerTokens.get(provider) ?? { input: 0, output: 0 };
            existing.input += inp;
            existing.output += out;
            providerTokens.set(provider, existing);
          }
        } catch { /* skip malformed line */ }
      }
    }
  } catch {
    return { success: true, response: "Unable to read usage data." };
  }

  if (totalRecords === 0) {
    return { success: true, response: `No usage data in the last ${periodHours}h.` };
  }

  const totalTokens = totalInput + totalOutput;

  // Cost estimation
  const registry = createPricingRegistry();
  let totalCost = 0;
  const providerLines: string[] = [];

  for (const [provider, tokens] of providerTokens) {
    const cost = registry.calculateCost(provider, tokens.input, tokens.output);
    totalCost += cost;
    const providerTotal = tokens.input + tokens.output;
    providerLines.push(`  ${provider}: $${cost.toFixed(4)} (${providerTotal.toLocaleString()} tokens)`);
  }

  // C6 fix: Show records with/without token data for clarity
  const recordsLabel = recordsWithTokens < totalRecords
    ? `Records: ${totalRecords} (${recordsWithTokens} with token data)`
    : `Records: ${totalRecords}`;

  const periodLabel = periodHours >= 24 ? `${periodHours / 24}d` : `${periodHours}h`;
  const lines = [
    `Token Usage (last ${periodLabel}):`,
    `  Input:  ${totalInput.toLocaleString()} tokens`,
    `  Output: ${totalOutput.toLocaleString()} tokens`,
    `  Total:  ${totalTokens.toLocaleString()} tokens`,
    `  ${recordsLabel}`,
    "",
    `Estimated Cost: ~$${totalCost.toFixed(4)}`,
    ...providerLines,
  ];

  return { success: true, response: lines.join("\n") };
}

// ============================================================================
// Help Message
// ============================================================================

/**
 * Generate the full dynamic help message.
 * Lists all commands grouped by category + agent/team format.
 */
export function generateHelpMessage(): string {
  return `🤖 *EndiorBot Commands*

*Workflow:*
  /approve <id> — Approve pending request
  /reject <id> [reason] — Reject pending request
  /status — Show pending approvals

*SDLC:*
  /gate [gateId] — Quality gate status
  /compliance [score|check] — Compliance score
  /fix [--dry-run] [--stage <stage>] — Compliance fix
  /init — Project init status

*AI:*
  /consult <query> — Multi-model consultation
  /agents — List all agents
  /teams — List tier teams

*Bridge (ADR-024):*
  /link — Link Telegram to EndiorBot identity
  /launch <agent> <path> [--as role] — Launch agent in tmux
  /sessions — List active sessions
  /switch <sessionId> — Switch active session
  /capture [lines] — Capture session output
  /send <sessionId> <message> — Send task to agent
  /eval <sessionId> — Evaluate agent output quality
  /kill <sessionId> — Kill a session

*Team Monitoring (Sprint 91):*
  /team-status <sessionId> — Team dashboard (health, cost)
  /kill-team <sessionId> — Kill entire team

*Remote Shell (ADR-024 D4):*
  /repos — List/add/remove repos
  /focus <name> — Set repo for this chat
  /where — Show current focus
  /cp suggest <task> — Copilot CLI suggest
  /cp explain <cmd> — Copilot CLI explain
  /cp status — Copilot CLI status
  /sh <cmd> — Read-only shell (allowlist)
  /attach [lines] — Capture shell output
  /run <cmd> — Run command (approval required)

*System:*
  /config — Project config
  /cost [--period 7d] — Token usage & cost
  /mode [read|patch] — Set invoke mode
  /webhook [on|off] — Toggle webhook (Telegram)
  /clear — Clear conversation history
  /help — This message

*Agent mention:*
  \`@agent task\` or \`[@agent: task]\`
  Example: \`@pm plan payment gateway\`

*Team mention:*
  \`@team task\` (routes to leader)
  Example: \`@planning review sprint goals\``;
}

