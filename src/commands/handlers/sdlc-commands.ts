/**
 * SDLC Command Handlers
 *
 * Handlers for SDLC-related commands: /gate, /compliance, /fix, /consult, /init.
 *
 * @module commands/handlers/sdlc-commands
 * @version 1.0.0
 * @date 2026-03-22
 * @status ACTIVE - Split from handlers.ts (Sprint 115)
 * @authority ADR-019 OTT Channel + ADR-030 Unified Commands
 */

import { resolve } from "node:path";

import type { CommandResult } from "../command-dispatcher.js";

import { sanitizeForEcho } from "./shared.js";

export type { CommandResult } from "../command-dispatcher.js";

// ============================================================================
// Gate Command
// ============================================================================

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

// ============================================================================
// Compliance Command
// ============================================================================

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

// ============================================================================
// Fix Command
// ============================================================================

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
    const { loadActiveProject } = await import("../../config/paths.js");
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
  const { detectProject } = await import("../../sdlc/scaffold/project-detector.js");
  const detection = detectProject(resolve(workspace));
  const tier = detection.configTier ?? detection.structureTier ?? null;

  if (!tier) {
    return {
      success: false,
      response: "Cannot detect project tier. Ensure `.sdlc-config.json` exists or use `endiorbot init` first.",
    };
  }

  const { createComplianceFixEngine } = await import("../../sdlc/compliance/fix-engine.js");

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
function formatFixResult(result: import("../../sdlc/compliance/fix-types.js").ComplianceFixResult, workspace: string): string {
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

// ============================================================================
// Consult Command
// ============================================================================

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

// ============================================================================
// Init Command
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
  detection: Awaited<ReturnType<typeof import("../../sdlc/scaffold/project-detector.js").detectProject>>;
  tier: string;
  tierSource: string;
  techStackSummary: string;
  /** Scaffold steps (if scaffolding was performed) */
  steps: Array<{ name: string; path: string; status: string; error?: string | undefined }>;
  /** Codebase snapshot (if analysis succeeded) */
  snapshot?: Awaited<ReturnType<typeof import("../../sdlc/compliance/project-context-collector.js").collectProjectContext>>;
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
  const { scaffoldProject } = await import("../../sdlc/scaffold/structure-generator.js");
  const { detectProject } = await import("../../sdlc/scaffold/project-detector.js");
  const { createBackup, migrateConfig, writeMigratedConfig } = await import("../../sdlc/scaffold/index.js");

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
  let snapshot: Awaited<ReturnType<typeof import("../../sdlc/compliance/project-context-collector.js").collectProjectContext>> | undefined;
  let techStackSummary = "";
  if (!opts.skipAnalysis && !opts.analyze) {
    try {
      const { collectProjectContext } = await import("../../sdlc/compliance/project-context-collector.js");
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
    const { loadActiveProject } = await import("../../config/paths.js");
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
