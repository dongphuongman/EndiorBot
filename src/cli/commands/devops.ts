/**
 * DevOps Command
 *
 * Build, run, and deploy projects after G3 gate confirmation.
 * Auto-detects package manager and build system.
 *
 * Usage:
 *   endiorbot devops build         # Install deps + build
 *   endiorbot devops run           # Run the project
 *   endiorbot devops build-run     # Build then run
 *
 * @module cli/commands/devops
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE
 * @authority SOUL-devops (SE4A Executor, Stage 06-07, Gate G4)
 * @stage 06 - DEPLOY
 * @sdlc SDLC Framework 6.2.0
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Command } from "commander";
import { loadActiveProject, resolveActiveProjectDir } from "../../config/paths.js";
import { isGateConfirmed, type GateId } from "../../sdlc/index.js";
import {
  detectEcosystem,
  getEcosystemCommands,
  checkToolchain,
  detectPythonVenv,
  type EcosystemDetectResult,
} from "./ecosystem-detector.js";

// ============================================================================
// Execution (A8: shell safety — spawn with argv, no shell: true)
// ============================================================================

/**
 * Run a command in the project directory with live output.
 * Uses spawn with argv array — NO shell: true (security: A8).
 */
function runCommand(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    console.log(`  $ ${cmd} ${args.join(" ")}`);
    console.log("");

    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });
}

// ============================================================================
// Command Actions
// ============================================================================

async function devopsBuildAction(options: { path?: string; skipGateCheck?: boolean; ecosystem?: string }): Promise<void> {
  const project = loadActiveProject();
  const projectPath = options.path ?? resolveActiveProjectDir();
  const projectId = project?.name ?? "unknown";

  if (!existsSync(projectPath)) {
    console.error(`❌ Project path not found: ${projectPath}`);
    process.exit(1);
  }

  // Gate check
  if (!options.skipGateCheck) {
    const g3Confirmed = isGateConfirmed(projectId, "G3" as GateId);
    if (!g3Confirmed) {
      console.log("");
      console.log("⚠️  G3 (Build Complete) gate not confirmed.");
      console.log("   Run 'endiorbot gate confirm G3 --confirm' first.");
      console.log("   Or use --skip-gate-check to bypass.");
      console.log("");
      process.exit(1);
    }
  }

  // Ecosystem detection (CTO C1: SSOT)
  const eco = detectEcosystem(projectPath, options.ecosystem as EcosystemDetectResult["ecosystem"] | undefined);

  if (eco.support === "detect-only") {
    console.error(`❌ ${eco.language} detected but not yet supported for build/run.`);
    console.error(`   → ${eco.language} support coming soon. Use native tools: ${eco.packageManager}`);
    process.exit(1);
  }

  // Toolchain pre-check (CTO C3)
  const toolchain = await checkToolchain(eco.ecosystem);
  if (!toolchain.available) {
    console.error(`❌ ${toolchain.command} not found.`);
    console.error(`   → Install from ${toolchain.installUrl}`);
    process.exit(1);
  }

  // Python venv warning (CTO C4)
  if (eco.ecosystem === "python") {
    const venv = detectPythonVenv(projectPath);
    if (!venv.hasVenv) {
      console.log("⚠️  No virtual environment found. Consider: python3 -m venv .venv");
      console.log("");
    }
  }

  const cmds = getEcosystemCommands(eco, projectPath);
  if (!cmds) {
    console.error("❌ Could not determine build commands.");
    process.exit(1);
  }

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🔧 DevOps Build                                            │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Project: ${projectPath.slice(-49).padEnd(49)}│`);
  console.log(`│  Ecosystem: ${`${eco.language} (${eco.packageManager})`.padEnd(47)}│`);
  console.log(`│  Toolchain: ${(toolchain.version ?? toolchain.command).slice(0, 47).padEnd(47)}│`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Step 1: Install dependencies
  if (cmds.install) {
    console.log("📦 Installing dependencies...");
    const installCode = await runCommand(cmds.install[0]!, cmds.install.slice(1), projectPath);
    if (installCode !== 0) {
      console.error("❌ Dependency installation failed.");
      console.error("   → Check the output above for missing packages or permissions.");
      process.exit(1);
    }
    console.log("✅ Dependencies installed.");
    console.log("");
  }

  // Step 2: Build
  if (cmds.build) {
    console.log("🔨 Building project...");
    const buildCode = await runCommand(cmds.build[0]!, cmds.build.slice(1), projectPath);
    if (buildCode !== 0) {
      console.error("❌ Build failed.");
      console.error("   → Check build output above. Common: missing dependencies or wrong toolchain version.");
      process.exit(1);
    }
    console.log("");
    console.log("✅ Build complete.");
  } else {
    console.log("ℹ️  No build step for this ecosystem. Skipping.");
  }
  console.log("");
}

async function devopsRunAction(options: { path?: string; skipGateCheck?: boolean; dev?: boolean; ecosystem?: string }): Promise<void> {
  const project = loadActiveProject();
  const projectPath = options.path ?? resolveActiveProjectDir();
  const projectId = project?.name ?? "unknown";

  if (!existsSync(projectPath)) {
    console.error(`❌ Project path not found: ${projectPath}`);
    process.exit(1);
  }

  // Gate check
  if (!options.skipGateCheck) {
    const g3Confirmed = isGateConfirmed(projectId, "G3" as GateId);
    if (!g3Confirmed) {
      console.log("");
      console.log("⚠️  G3 (Build Complete) gate not confirmed.");
      console.log("   Run 'endiorbot gate confirm G3 --confirm' first.");
      console.log("   Or use --skip-gate-check to bypass.");
      console.log("");
      process.exit(1);
    }
  }

  // Ecosystem detection (CTO C1: SSOT)
  const eco = detectEcosystem(projectPath, options.ecosystem as EcosystemDetectResult["ecosystem"] | undefined);

  if (eco.support === "detect-only") {
    console.error(`❌ ${eco.language} detected but not yet supported for run.`);
    console.error(`   → Use native tools: ${eco.packageManager}`);
    process.exit(1);
  }

  const cmds = getEcosystemCommands(eco, projectPath);
  if (!cmds) {
    console.error("❌ Could not determine run commands.");
    process.exit(1);
  }

  const runArgs = options.dev ? cmds.dev : cmds.run;
  const cmdDisplay = runArgs.join(" ");

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🚀 DevOps Run                                              │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Project: ${projectPath.slice(-49).padEnd(49)}│`);
  console.log(`│  Command: ${cmdDisplay.slice(0, 49).padEnd(49)}│`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Install if needed
  if (cmds.install) {
    console.log("📦 Installing dependencies first...");
    const installCode = await runCommand(cmds.install[0]!, cmds.install.slice(1), projectPath);
    if (installCode !== 0) {
      console.error("❌ Dependency installation failed.");
      process.exit(1);
    }
    console.log("");
  }

  // Run
  console.log(`🚀 Running: ${cmdDisplay}`);
  console.log("");
  const code = await runCommand(runArgs[0]!, runArgs.slice(1), projectPath);
  process.exit(code);
}

async function devopsBuildRunAction(options: { path?: string; skipGateCheck?: boolean; dev?: boolean }): Promise<void> {
  await devopsBuildAction(options);
  await devopsRunAction(options);
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerDevopsCommand(program: Command): void {
  const devops = program
    .command("ops")
    .description("DevOps operations: build, run, deploy (Stage 06-07)");

  devops
    .command("build")
    .description("Install dependencies and build project")
    .option("--path <path>", "Project directory")
    .option("--skip-gate-check", "Skip G3 gate verification")
    .option("--ecosystem <name>", "Override ecosystem detection (node, rust, python)")
    .action(devopsBuildAction);

  devops
    .command("run")
    .description("Run the project (start or dev script)")
    .option("--path <path>", "Project directory")
    .option("--skip-gate-check", "Skip G3 gate verification")
    .option("--dev", "Use dev script instead of start")
    .option("--ecosystem <name>", "Override ecosystem detection (node, rust, python)")
    .action(devopsRunAction);

  devops
    .command("build-run")
    .description("Build then run the project")
    .option("--path <path>", "Project directory")
    .option("--skip-gate-check", "Skip G3 gate verification")
    .option("--dev", "Use dev script instead of start")
    .option("--ecosystem <name>", "Override ecosystem detection (node, rust, python)")
    .action(devopsBuildRunAction);
}
