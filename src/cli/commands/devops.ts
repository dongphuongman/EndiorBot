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
 * @sdlc SDLC Framework 6.1.1
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Command } from "commander";
import { loadActiveProject, resolveActiveProjectDir } from "../../config/paths.js";
import { isGateConfirmed, type GateId } from "../../sdlc/index.js";

// ============================================================================
// Types
// ============================================================================

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface ProjectBuildInfo {
  packageManager: PackageManager;
  hasInstalled: boolean;
  buildScript?: string;
  startScript?: string;
  devScript?: string;
  projectPath: string;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect package manager from lock files.
 */
function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) return "bun";
  return "npm";
}

/**
 * Detect project build info from package.json.
 */
function detectBuildInfo(projectPath: string): ProjectBuildInfo {
  const pm = detectPackageManager(projectPath);
  const hasNodeModules = existsSync(join(projectPath, "node_modules"));

  const info: ProjectBuildInfo = {
    packageManager: pm,
    hasInstalled: hasNodeModules,
    projectPath,
  };

  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      if (scripts.build) info.buildScript = "build";
      if (scripts.start) info.startScript = "start";
      if (scripts.dev) info.devScript = "dev";
    } catch {
      // Ignore parse errors
    }
  }

  return info;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Run a command in the project directory with live output.
 */
function runCommand(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    console.log(`  $ ${cmd} ${args.join(" ")}`);
    console.log("");

    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: true,
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

async function devopsBuildAction(options: { path?: string; skipGateCheck?: boolean }): Promise<void> {
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

  const info = detectBuildInfo(projectPath);
  const pm = info.packageManager;

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🔧 DevOps Build                                            │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Project: ${projectPath.slice(-49).padEnd(49)}│`);
  console.log(`│  Package Manager: ${pm.padEnd(41)}│`);
  console.log(`│  Build Script: ${(info.buildScript ?? "none").padEnd(44)}│`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Step 1: Install dependencies
  if (!info.hasInstalled) {
    console.log("📦 Installing dependencies...");
    const installCode = await runCommand(pm, ["install"], projectPath);
    if (installCode !== 0) {
      console.error("❌ Dependency installation failed.");
      process.exit(1);
    }
    console.log("✅ Dependencies installed.");
    console.log("");
  } else {
    console.log("📦 Dependencies already installed (node_modules exists).");
    console.log("");
  }

  // Step 2: Build
  if (info.buildScript) {
    console.log("🔨 Building project...");
    const buildCode = await runCommand(pm, ["run", info.buildScript], projectPath);
    if (buildCode !== 0) {
      console.error("❌ Build failed.");
      process.exit(1);
    }
    console.log("");
    console.log("✅ Build complete.");
  } else {
    console.log("ℹ️  No build script found in package.json. Skipping build step.");
  }
  console.log("");
}

async function devopsRunAction(options: { path?: string; skipGateCheck?: boolean; dev?: boolean }): Promise<void> {
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

  const info = detectBuildInfo(projectPath);
  const pm = info.packageManager;

  // Determine which script to run
  const scriptName = options.dev
    ? (info.devScript ?? info.startScript)
    : (info.startScript ?? info.devScript);

  if (!scriptName) {
    console.error("❌ No start or dev script found in package.json.");
    process.exit(1);
  }

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🚀 DevOps Run                                              │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Project: ${projectPath.slice(-49).padEnd(49)}│`);
  console.log(`│  Command: ${pm} ${scriptName}`.padEnd(61) + "│");
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Install if needed
  if (!info.hasInstalled) {
    console.log("📦 Installing dependencies first...");
    const installCode = await runCommand(pm, ["install"], projectPath);
    if (installCode !== 0) {
      console.error("❌ Dependency installation failed.");
      process.exit(1);
    }
    console.log("");
  }

  // Run
  console.log(`🚀 Running: ${pm} ${scriptName}`);
  console.log("");
  const code = await runCommand(pm, [scriptName], projectPath);
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
    .action(devopsBuildAction);

  devops
    .command("run")
    .description("Run the project (start or dev script)")
    .option("--path <path>", "Project directory")
    .option("--skip-gate-check", "Skip G3 gate verification")
    .option("--dev", "Use dev script instead of start")
    .action(devopsRunAction);

  devops
    .command("build-run")
    .description("Build then run the project")
    .option("--path <path>", "Project directory")
    .option("--skip-gate-check", "Skip G3 gate verification")
    .option("--dev", "Use dev script instead of start")
    .action(devopsBuildRunAction);
}
