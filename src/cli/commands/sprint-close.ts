/**
 * Sprint Close Command
 *
 * Automates sprint closure: build → test → update sprint docs → commit → (optional push).
 * Thin client: thin Commander registration, all logic inline (no external SDLC coupling).
 *
 * Workflow:
 *   1. pnpm build  → abort on failure
 *   2. pnpm test   → abort on failure
 *   3. Detect active sprint from CURRENT-SPRINT.md
 *   4. Update sprint-{N}.md: Status → COMPLETE, append CTO score if --score given
 *   5. Update SPRINT-INDEX.md: move active sprint to completed, update Last Updated
 *   6. git add + git commit
 *   7. If --push: git push origin main (only after steps 1–6 succeed)
 *   Default: commit locally, print push reminder
 *
 * Usage:
 *   ./endiorbot.mjs sprint close
 *   ./endiorbot.mjs sprint close --sprint 109 --score "9/10" --push
 *
 * @module cli/commands/sprint-close
 * @version 1.0.0
 * @date 2026-03-15
 * @status ACTIVE - Sprint 109
 * @authority gstack best practices adoption (ADR-033 pending)
 * @sprint 109
 */

import type { Command } from "commander";
import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Project root = 3 levels up from src/cli/commands/
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const SPRINTS_DIR = join(PROJECT_ROOT, "docs", "04-build", "sprints");
const CURRENT_SPRINT_PATH = join(SPRINTS_DIR, "CURRENT-SPRINT.md");
const SPRINT_INDEX_PATH = join(SPRINTS_DIR, "SPRINT-INDEX.md");

// ============================================================================
// Types
// ============================================================================

interface SprintCloseOptions {
  sprint?: string;
  score?: string;
  push: boolean;
  skipTests?: boolean;
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register sprint subcommand with close action.
 */
export function registerSprintCloseCommand(program: Command): void {
  const sprint = program.command("sprint").description("Sprint management commands");

  sprint
    .command("close")
    .description("Close the current sprint: build → test → update docs → commit")
    .option("--sprint <n>", "Sprint number to close (auto-detected from CURRENT-SPRINT.md if omitted)")
    .option("--score <score>", "CTO approval score to record (e.g. '9/10')")
    .option("--push", "Push to origin/main after committing (default: local commit only)", false)
    .option("--skip-tests", "Skip pnpm test step (use when tests pre-validated, e.g. flaky gateway suite)", false)
    .action(async (options: SprintCloseOptions) => {
      await executeSprintClose(options);
    });
}

// ============================================================================
// Core Logic
// ============================================================================

async function executeSprintClose(options: SprintCloseOptions): Promise<void> {
  log("Sprint Close — starting");

  // Step 1: Build
  log("Step 1/6: pnpm build...");
  try {
    execSync("pnpm build", { cwd: PROJECT_ROOT, stdio: "inherit" });
    ok("Build passed");
  } catch {
    fail("Build failed — aborting sprint close. Fix build errors first.");
  }

  // Step 2: Test
  if (options.skipTests) {
    ok("Tests skipped (--skip-tests flag set — pre-validated)");
  } else {
    log("Step 2/6: pnpm test...");
    try {
      execSync("pnpm test", { cwd: PROJECT_ROOT, stdio: "inherit" });
      ok("Tests passed");
    } catch {
      fail("Tests failed — aborting sprint close. Fix failing tests first.");
    }
  }

  // Step 3: Detect sprint number
  log("Step 3/6: Detecting sprint number...");
  const sprintNum = options.sprint ? parseInt(options.sprint, 10) : detectSprintNumber();
  if (isNaN(sprintNum) || sprintNum <= 0) {
    fail(`Invalid sprint number: ${options.sprint ?? "(auto-detected)"}`);
  }
  ok(`Sprint ${sprintNum} detected`);

  // Step 4: Update sprint-{N}.md
  log(`Step 4/6: Updating sprint-${sprintNum}.md...`);
  updateSprintFile(sprintNum, options.score);
  ok(`sprint-${sprintNum}.md updated → COMPLETE`);

  // Step 5: Update SPRINT-INDEX.md
  log("Step 5/6: Updating SPRINT-INDEX.md...");
  updateSprintIndex(sprintNum);
  ok("SPRINT-INDEX.md updated");

  // Step 6: Git commit
  log("Step 6/6: Creating git commit...");
  const scoreNote = options.score ? ` (CTO ${options.score})` : "";
  const commitMsg = `docs(sprint-${sprintNum}): close sprint ${sprintNum}${scoreNote}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`;
  try {
    execFileSync("git", ["add", "docs/04-build/sprints/"], { cwd: PROJECT_ROOT, stdio: "inherit" });
    execFileSync("git", ["commit", "-m", commitMsg], { cwd: PROJECT_ROOT, stdio: "inherit" });
    ok("Committed locally");
  } catch (e) {
    fail(`Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 7: Optionally push
  if (options.push) {
    log("Pushing to origin/main...");
    try {
      execSync("git push origin main", { cwd: PROJECT_ROOT, stdio: "inherit" });
      ok("Pushed to origin/main");
    } catch (e) {
      fail(`git push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    console.log("\n  Tip: run with --push to push to origin/main");
  }

  console.log(`\n✅ Sprint ${sprintNum} closed successfully`);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect sprint number from CURRENT-SPRINT.md first line.
 * Expects: "# Current Sprint: Sprint NNN — ..."
 */
function detectSprintNumber(): number {
  const content = readFileSync(CURRENT_SPRINT_PATH, "utf-8");
  const match = content.match(/^#\s+Current Sprint:\s+Sprint\s+(\d+)/m);
  if (!match) {
    fail(`Cannot detect sprint number from ${CURRENT_SPRINT_PATH}\nExpected: "# Current Sprint: Sprint NNN — ..."`);
  }
  return parseInt(match![1] as string, 10);
}

/**
 * Update sprint-{N}.md: replace "Status**: PLANNED/IN PROGRESS" with COMPLETE.
 * Appends CTO score line if --score given and not already present.
 */
function updateSprintFile(sprintNum: number, score?: string): void {
  const sprintFile = findSprintFile(sprintNum);

  let content = readFileSync(sprintFile, "utf-8");

  // Replace Status line
  content = content.replace(
    /\*\*Status\*\*:\s*(PLANNED|IN PROGRESS|IN_PROGRESS|🚧[^\n]*)/i,
    "**Status**: ✅ COMPLETE"
  );

  // Append CTO score if provided and not already present
  if (score && !content.includes("**CTO Review**:")) {
    const scoreDate = new Date().toISOString().slice(0, 10);
    content += `\n---\n\n**CTO Review**: ${score} APPROVED — ${scoreDate}\n`;
  }

  writeFileSync(sprintFile, content, "utf-8");
}

/**
 * Update SPRINT-INDEX.md:
 * - Replace sprint status emoji from 🚧 to ✅ for the given sprint number
 * - Update "Last Updated" line at top
 */
function updateSprintIndex(sprintNum: number): void {
  let content = readFileSync(SPRINT_INDEX_PATH, "utf-8");

  // Update "Last Updated" line
  const today = new Date().toISOString().slice(0, 10);
  content = content.replace(
    /\*\*Last Updated\*\*:.*$/m,
    `**Last Updated**: ${today} (Sprint ${sprintNum} COMPLETE)`
  );

  // Replace 🚧 PLANNED or 🚧 IN PROGRESS with ✅ COMPLETE for this sprint row
  content = content.replace(
    new RegExp(`(Sprint ${sprintNum}[^|]*\\|[^|]*\\|[^|]*\\|)\\s*🚧[^|]*\\|`),
    `$1 ✅ COMPLETE |`
  );

  writeFileSync(SPRINT_INDEX_PATH, content, "utf-8");
}

/**
 * Find sprint file by number. Tries common filename patterns.
 */
function findSprintFile(sprintNum: number): string {
  const files = readdirSync(SPRINTS_DIR);
  const pattern = new RegExp(`^sprint-0*${sprintNum}-`);
  const match = files.find((f) => pattern.test(f) && f.endsWith(".md"));
  if (!match) {
    fail(`Sprint file not found for sprint ${sprintNum} in ${SPRINTS_DIR}\nExpected pattern: sprint-${sprintNum}-*.md`);
  }
  return join(SPRINTS_DIR, match);
}

// ============================================================================
// Output helpers
// ============================================================================

function log(msg: string): void {
  console.log(`  ${msg}`);
}

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`);
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}
