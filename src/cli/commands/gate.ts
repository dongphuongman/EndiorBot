/**
 * Gate Command
 *
 * SDLC gate operations: status, propose, approve.
 * Integrates with the gate engine for evaluation.
 *
 * Usage:
 *   endiorbot gate status
 *   endiorbot gate propose G2 --feature AR-457
 *   endiorbot gate approve G2 --feature AR-457
 *
 * @module cli/commands/gate
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Implementation
 * @authority ADR-004 SDLC Gate Engine
 * @pillar 2 - Sprint Governance
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { STATE_DIR } from "../../config/paths.js";
import {
  GateEngine,
  getChecklist,
  getGatesInOrder,
  type GateId,
  type ProjectTier,
  type ChecklistItem,
} from "../../sdlc/index.js";

// ============================================================================
// Types
// ============================================================================

interface ProjectContext {
  id: string;
  name: string;
  path: string;
  tier: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get current project from state.
 */
function getCurrentProject(): ProjectContext | undefined {
  const statePath = join(STATE_DIR, "projects.json");

  if (!existsSync(statePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    const state = JSON.parse(content);
    if (state.currentProject && state.projects[state.currentProject]) {
      return state.projects[state.currentProject] as ProjectContext;
    }
  } catch {
    // Ignore
  }

  return undefined;
}

/**
 * Format checklist item status.
 */
function formatItemStatus(item: ChecklistItem): string {
  switch (item.status) {
    case "pass":
      return "✅";
    case "fail":
      return "❌";
    case "skipped":
      return "⏭️";
    default:
      return "⬜";
  }
}

/**
 * Format gate ID for display.
 */
function formatGateId(gateId: GateId): string {
  const names: Record<GateId, string> = {
    G0: "G0 - Problem Validation",
    "G0.1": "G0.1 - Opportunity Assessment",
    G1: "G1 - Requirements Lock",
    G2: "G2 - Design Approval",
    G3: "G3 - Build Complete",
    G4: "G4 - Release Ready",
    "G-Sprint": "G-Sprint - Sprint Close",
  };
  return names[gateId] ?? gateId;
}

// ============================================================================
// Command Actions
// ============================================================================

/**
 * Gate status action - show all gates and their checklists.
 */
async function gateStatusAction(options: { gate?: string }): Promise<void> {
  const project = getCurrentProject();

  if (!project) {
    console.log("⚠️  No active project. Use 'endiorbot start <project>' first.");
    return;
  }

  const tier = (project.tier as ProjectTier) ?? "STANDARD";

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🚪 SDLC Gates - ${project.name.slice(0, 42).padEnd(42)}│`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Tier: ${tier.padEnd(52)}│`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Show specific gate or all gates
  const gatesToShow = options.gate
    ? [options.gate as GateId]
    : getGatesInOrder();

  for (const gateId of gatesToShow) {
    const checklist = getChecklist(gateId, tier);

    console.log(`📋 ${formatGateId(gateId)}`);
    console.log("─".repeat(60));

    for (const item of checklist.items) {
      const status = formatItemStatus(item);
      const autoTag = item.autoCheck ? " [auto]" : "";
      console.log(`   ${status} ${item.description}${autoTag}`);
    }

    console.log("");
  }
}

/**
 * Gate propose action - evaluate a gate for a feature.
 */
async function gateProposeAction(
  gateId: string,
  options: { feature?: string },
): Promise<void> {
  const project = getCurrentProject();

  if (!project) {
    console.log("⚠️  No active project. Use 'endiorbot start <project>' first.");
    return;
  }

  if (!existsSync(project.path)) {
    console.error(`❌ Project path not found: ${project.path}`);
    process.exit(1);
  }

  const featureId = options.feature ?? "default";
  const tier = (project.tier as ProjectTier) ?? "STANDARD";

  console.log("");
  console.log(`🔍 Evaluating ${gateId} for ${featureId}...`);
  console.log("");

  // Create gate engine and evaluate
  const engine = new GateEngine({ projectRoot: project.path, tier });

  try {
    const evaluation = await engine.evaluate(
      gateId as GateId,
      featureId,
      project.id,
    );

    // Display results
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log(`│  📋 ${formatGateId(gateId as GateId).padEnd(55)}│`);
    console.log("├─────────────────────────────────────────────────────────────┤");

    // Show checklist results
    for (const item of evaluation.checklist) {
      const status = formatItemStatus(item);
      console.log(`│  ${status} ${item.description.slice(0, 55).padEnd(55)}│`);
    }

    console.log("├─────────────────────────────────────────────────────────────┤");

    // Show vibecoding if available
    if (evaluation.vibecodingIndex) {
      const zone = evaluation.vibecodingIndex.zone;
      const zoneEmoji: Record<string, string> = {
        green: "🟢",
        yellow: "🟡",
        orange: "🟠",
        red: "🔴",
      };
      console.log(
        `│  Vibecoding: ${zoneEmoji[zone] ?? "⚪"} ${evaluation.vibecodingIndex.score}/100 (${zone})`.padEnd(62) + "│",
      );
    }

    // Show result
    const resultEmoji = evaluation.result === "PASS" ? "✅" : "❌";
    console.log(`│  Result: ${resultEmoji} ${evaluation.result}`.padEnd(62) + "│");
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log("");

    if (evaluation.result === "PASS") {
      console.log("🎉 Gate evaluation passed!");
      console.log(`   Run 'endiorbot gate approve ${gateId} --feature ${featureId}' to approve.`);
    } else {
      console.log("⚠️  Gate evaluation failed. Address the issues above.");
    }
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Evaluation failed: ${message}`);
    process.exit(1);
  }
}

/**
 * Gate approve action - approve a gate (CEO action).
 */
async function gateApproveAction(
  gateId: string,
  options: { feature?: string; force?: boolean },
): Promise<void> {
  const project = getCurrentProject();

  if (!project) {
    console.log("⚠️  No active project. Use 'endiorbot start <project>' first.");
    return;
  }

  const featureId = options.feature ?? "default";
  const tier = (project.tier as ProjectTier) ?? "STANDARD";

  console.log("");
  console.log(`🔐 Approving ${gateId} for ${featureId}...`);

  // Create gate engine
  const engine = new GateEngine({ projectRoot: project.path, tier });

  try {
    // First evaluate
    const evaluation = await engine.evaluate(
      gateId as GateId,
      featureId,
      project.id,
    );

    if (evaluation.result !== "PASS" && !options.force) {
      console.log("");
      console.log("❌ Cannot approve - gate evaluation failed.");
      console.log("   Use --force to override (CEO only).");
      console.log("");
      process.exit(1);
    }

    if (evaluation.result !== "PASS" && options.force) {
      // Apply manual override
      engine.applyOverride(
        gateId as GateId,
        featureId,
        project.id,
        "CEO",
        "Manual override by CEO",
      );
      console.log("⚠️  Override applied by CEO.");
    }

    console.log("");
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log(`│  ✅ ${gateId} APPROVED                                       │`);
    console.log("├─────────────────────────────────────────────────────────────┤");
    console.log(`│  Feature: ${featureId.padEnd(49)}│`);
    console.log(`│  Project: ${project.name.slice(0, 49).padEnd(49)}│`);
    console.log(`│  Approved: ${new Date().toISOString().slice(0, 19).padEnd(48)}│`);
    console.log("└─────────────────────────────────────────────────────────────┘");
    console.log("");

    // TODO: Create git tag, save evidence
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Approval failed: ${message}`);
    process.exit(1);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register gate command.
 */
export function registerGateCommand(program: Command): void {
  const gate = program
    .command("gate")
    .description("SDLC gate operations");

  gate
    .command("status")
    .description("Show gate checklists")
    .option("-g, --gate <gateId>", "Show specific gate (G0, G1, G2, G3, G4)")
    .action(gateStatusAction);

  gate
    .command("propose <gateId>")
    .description("Evaluate a gate for approval")
    .option("-f, --feature <featureId>", "Feature ID", "default")
    .action(gateProposeAction);

  gate
    .command("approve <gateId>")
    .description("Approve a gate (CEO action)")
    .option("-f, --feature <featureId>", "Feature ID", "default")
    .option("--force", "Force approval even if checks fail")
    .action(gateApproveAction);
}
