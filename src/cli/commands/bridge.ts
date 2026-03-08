/**
 * Bridge Command
 *
 * CLI command for managing Bridge infrastructure.
 *
 * Usage:
 *   endiorbot bridge install-agents <path>   - Install .claude/agents/*.md files
 *   endiorbot bridge install-agents <path> --force  - Overwrite existing files
 *
 * @module cli/commands/bridge
 * @version 1.0.0
 * @date 2026-03-07
 * @status ACTIVE - Sprint 84 (CTO MF-1)
 * @authority ADR-025 Session Intelligence Envelope
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import { installAgents } from "../../bridge/intelligence/agent-installer.js";
import { installHooks } from "../../bridge/hooks/hook-installer.js";
import { installTeams } from "../../bridge/intelligence/team-installer.js";

// ============================================================================
// Terminal Colors
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

// ============================================================================
// Command Actions
// ============================================================================

interface InstallAgentsOptions {
  force?: boolean;
}

/**
 * Install .claude/agents/*.md files in a target project.
 */
function installAgentsAction(projectPath: string, options: InstallAgentsOptions): void {
  const resolvedPath = resolve(projectPath);

  if (!existsSync(resolvedPath)) {
    console.error(red(`✗ Project path not found: ${resolvedPath}`));
    process.exit(1);
  }

  console.log("");
  console.log(dim(`Installing agent files in ${resolvedPath}...`));
  console.log("");

  const installOpts: { force?: boolean } = {};
  if (options.force) installOpts.force = options.force;
  const result = installAgents(resolvedPath, installOpts);

  // Show per-role details
  for (const detail of result.details) {
    if (detail.status === "created") {
      console.log(`  ${green("✓")} ${detail.role}.md ${green("created")}`);
    } else if (detail.status === "skipped") {
      console.log(`  ${yellow("○")} ${detail.role}.md ${yellow("skipped")} ${dim("(already exists)")}`);
    } else {
      console.log(`  ${red("✗")} ${detail.role}.md ${red("failed")}: ${detail.error ?? "unknown"}`);
    }
  }

  // Summary
  console.log("");
  console.log(`  Created: ${result.created}  Skipped: ${result.skipped}  Failed: ${result.failed}`);

  if (result.created > 0) {
    console.log("");
    console.log(dim("  Usage: claude --agent <role>  (e.g., claude --agent pm)"));
  }

  if (result.skipped > 0 && !options.force) {
    console.log(dim("  Use --force to overwrite existing files"));
  }

  console.log("");

  if (result.failed > 0) {
    process.exit(1);
  }
}

interface InstallHooksOptions {
  force?: boolean;
}

/**
 * Install Claude Code hooks in a target project.
 */
function installHooksAction(projectPath: string, options: InstallHooksOptions): void {
  const resolvedPath = resolve(projectPath);

  if (!existsSync(resolvedPath)) {
    console.error(red(`\u2717 Project path not found: ${resolvedPath}`));
    process.exit(1);
  }

  console.log("");
  console.log(dim(`Installing hooks in ${resolvedPath}...`));
  console.log("");

  const installOpts: { force?: boolean } = {};
  if (options.force) installOpts.force = options.force;
  const result = installHooks(resolvedPath, installOpts);

  // Show per-hook details
  for (const detail of result.details) {
    if (detail.status === "installed") {
      console.log(`  ${green("\u2713")} ${detail.hook} ${green("installed")}`);
    } else if (detail.status === "skipped") {
      console.log(`  ${yellow("\u25CB")} ${detail.hook} ${yellow("skipped")} ${dim("(already exists)")}`);
    } else {
      console.log(`  ${red("\u2717")} ${detail.hook} ${red("failed")}: ${detail.error ?? "unknown"}`);
    }
  }

  // Summary
  console.log("");
  console.log(`  Installed: ${result.installed}  Skipped: ${result.skipped}  Failed: ${result.failed}`);

  if (result.skipped > 0 && !options.force) {
    console.log(dim("  Use --force to overwrite existing hooks"));
  }

  console.log("");

  if (result.failed > 0) {
    process.exit(1);
  }
}

interface InstallTeamsOptions {
  force?: boolean;
  tier?: string;
}

/**
 * Generate .claude/agents/{teamId}-team.md files in a target project.
 * CA1: CLI output lists generated and skipped files with reasons.
 */
function installTeamsAction(projectPath: string, options: InstallTeamsOptions): void {
  const resolvedPath = resolve(projectPath);

  if (!existsSync(resolvedPath)) {
    console.error(red(`✗ Project path not found: ${resolvedPath}`));
    process.exit(1);
  }

  console.log("");
  console.log(dim(`Generating team files in ${resolvedPath}...`));
  console.log("");

  try {
    const installOpts: { force?: boolean; tier?: string } = {};
    if (options.force) installOpts.force = options.force;
    if (options.tier) installOpts.tier = options.tier;
    const result = installTeams(resolvedPath, installOpts);

    // Show per-team details (CA1)
    for (const detail of result.details) {
      if (detail.status === "created") {
        console.log(`  ${green("✓")} ${detail.teamId}-team.md ${green("created")}`);
      } else if (detail.status === "skipped") {
        console.log(`  ${yellow("○")} ${detail.teamId}-team.md ${yellow("skipped")} ${dim("(already exists)")}`);
      } else {
        console.log(`  ${dim("—")} ${detail.teamId}-team.md ${dim("excluded")} ${dim(`(${detail.reason ?? "unknown"})`)}`);
      }
    }

    // Summary
    console.log("");
    console.log(`  Created: ${result.created}  Skipped: ${result.skipped}  Excluded: ${result.excluded}`);

    if (result.created > 0) {
      console.log("");
      console.log(dim("  Usage: claude --agent <teamId>-team  (e.g., claude --agent dev-team)"));
    }

    if (result.skipped > 0 && !options.force) {
      console.log(dim("  Use --force to overwrite existing files"));
    }

    console.log("");
  } catch (err) {
    console.error(red(`✗ ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register bridge command.
 */
export function registerBridgeCommand(program: Command): void {
  const bridge = program
    .command("bridge")
    .description("Manage Bridge infrastructure (agents, sessions, hooks)");

  bridge
    .command("install-agents <path>")
    .description("Install .claude/agents/*.md files for all 13 agent roles")
    .option("--force", "Overwrite existing agent files")
    .action(installAgentsAction);

  bridge
    .command("install-hooks <path>")
    .description("Install Claude Code hooks (.claude/hooks/ + settings.json)")
    .option("--force", "Overwrite existing hook files")
    .action(installHooksAction);

  bridge
    .command("install-teams <path>")
    .description("Generate team leader agent files (.claude/agents/{teamId}-team.md)")
    .option("--force", "Overwrite existing team files")
    .option("--tier <tier>", "Project tier (LITE/STANDARD/PROFESSIONAL/ENTERPRISE)", "STANDARD")
    .action(installTeamsAction);
}
