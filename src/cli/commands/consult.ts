/**
 * Consult Command
 *
 * Query multiple AI models for expert consultation.
 * Consolidates responses and provides recommendations.
 *
 * Usage:
 *   endiorbot consult "design payment gateway integration"
 *   endiorbot consult "is Redis or PostgreSQL better for sessions?" --models claude,gpt
 *
 * @module cli/commands/consult
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Implementation
 * @authority ADR-001 Multi-Model Orchestrator
 * @pillar 3 - Agent Personas
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import type { Command } from "commander";
import {
  getOrchestrator,
  type ConsultationResult,
  type ModelQueryResult,
} from "../../agents/orchestrator/index.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format task type for display.
 */
function formatTaskType(taskType: string): string {
  const types: Record<string, string> = {
    architecture: "🏗️  Architecture",
    code_review: "👀 Code Review",
    security: "🔒 Security",
    research: "🔍 Research",
    general: "💬 General",
  };
  return types[taskType] ?? taskType;
}

/**
 * Format query status.
 */
function formatStatus(status: string): string {
  const statuses: Record<string, string> = {
    success: "✅",
    timeout: "⏱️",
    error: "❌",
    pending: "⏳",
  };
  return statuses[status] ?? "❓";
}

/**
 * Format provider name.
 */
function formatProvider(provider: string): string {
  const providers: Record<string, string> = {
    anthropic: "Claude",
    openai: "GPT",
    google: "Gemini",
    mistral: "Mistral",
  };
  return providers[provider] ?? provider;
}

/**
 * Display model response.
 */
function displayResponse(response: ModelQueryResult): void {
  const status = formatStatus(response.status);
  const provider = formatProvider(response.provider);
  const role = response.role === "primary" ? " (Primary)" : "";
  const latency = `${response.latencyMs}ms`;

  console.log(`│  ${status} ${provider}${role} - ${latency}`.padEnd(62) + "│");

  if (response.content) {
    // Wrap content to fit in box
    const lines = response.content.split("\n").slice(0, 4);
    for (const line of lines) {
      const truncated = line.slice(0, 55);
      console.log(`│     ${truncated.padEnd(55)}│`);
    }
    if (lines.length < response.content.split("\n").length) {
      console.log(`│     ...`.padEnd(62) + "│");
    }
  }

  if (response.error) {
    console.log(`│     Error: ${response.error.slice(0, 45)}`.padEnd(62) + "│");
  }

  console.log("│".padEnd(62) + "│");
}

/**
 * Display consultation result.
 */
function displayResult(result: ConsultationResult, verbose: boolean): void {
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🤖 Expert Consultation                                     │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  ID: ${result.taskId.padEnd(54)}│`);
  console.log(`│  Type: ${formatTaskType(result.taskType).padEnd(52)}│`);
  console.log(`│  Query: ${result.query.slice(0, 50).padEnd(51)}│`);
  console.log("├─────────────────────────────────────────────────────────────┤");

  // Show responses
  console.log(`│  📊 Responses (${result.modelsResponded}/${result.modelsQueried})`.padEnd(62) + "│");
  console.log("│".padEnd(62) + "│");

  if (verbose) {
    for (const response of result.responses) {
      displayResponse(response);
    }
  } else {
    // Just show summary
    for (const response of result.responses) {
      const status = formatStatus(response.status);
      const provider = formatProvider(response.provider);
      const role = response.role === "primary" ? " ★" : "";
      console.log(`│  ${status} ${provider}${role}`.padEnd(62) + "│");
    }
    console.log("│".padEnd(62) + "│");
  }

  // Show consensus
  console.log("├─────────────────────────────────────────────────────────────┤");
  if (result.consensus.hasConsensus) {
    const agreement = result.consensus.points[0]?.agreement ?? 0;
    console.log(
      `│  ✅ Consensus: ${Math.round(agreement * 100)}% agreement`.padEnd(62) + "│",
    );
    for (const point of result.consensus.points) {
      console.log(`│     • ${point.description.slice(0, 52)}`.padEnd(62) + "│");
    }
  } else {
    console.log("│  ⚠️  No clear consensus".padEnd(62) + "│");
  }

  // Show disagreements if any
  if (result.consensus.disagreements.length > 0) {
    console.log("│".padEnd(62) + "│");
    console.log("│  ⚖️  Disagreements:".padEnd(62) + "│");
    for (const d of result.consensus.disagreements) {
      console.log(`│     ${d.topic}:`.padEnd(62) + "│");
      for (const pos of d.positions) {
        console.log(
          `│       ${formatProvider(pos.provider)}: ${pos.position.slice(0, 40)}`.padEnd(62) + "│",
        );
      }
    }
  }

  // Show recommendation
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log("│  💡 Recommendation:".padEnd(62) + "│");
  const recLines = result.recommendation.match(/.{1,55}/g) ?? [];
  for (const line of recLines.slice(0, 3)) {
    console.log(`│     ${line.padEnd(55)}│`);
  }

  // Show SDLC compliance
  if (result.sdlcCompliance.notes.length > 0) {
    console.log("│".padEnd(62) + "│");
    console.log("│  📋 SDLC Notes:".padEnd(62) + "│");
    for (const note of result.sdlcCompliance.notes) {
      console.log(`│     • ${note.slice(0, 52)}`.padEnd(62) + "│");
    }
  }

  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  ⏱️  Total: ${result.totalLatencyMs}ms`.padEnd(62) + "│");
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");
}

// ============================================================================
// Command Action
// ============================================================================

/**
 * Consult command action.
 */
async function consultAction(
  query: string,
  options: { models?: string; verbose?: boolean },
): Promise<void> {
  console.log("");
  console.log("🔄 Consulting expert panel...");

  const orchestrator = getOrchestrator();

  try {
    const result = await orchestrator.consult(query);
    displayResult(result, options.verbose ?? false);

    // Show next actions
    console.log("📋 Actions:");
    console.log("   [A] Approve recommendation");
    console.log("   [D] Discuss further");
    console.log("   [R] Re-consult with different query");
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Consultation failed: ${message}`);
    process.exit(1);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register consult command.
 */
export function registerConsultCommand(program: Command): void {
  program
    .command("consult <query>")
    .description("Query multiple AI models for expert consultation")
    .option("-m, --models <models>", "Specific models to query (comma-separated)")
    .option("-v, --verbose", "Show detailed responses from each model")
    .action(consultAction);
}
