/**
 * Consult Command
 *
 * Query multiple AI models for expert consultation.
 * Consolidates responses and provides recommendations.
 *
 * Usage:
 *   endiorbot consult "design payment gateway integration"
 *   endiorbot consult --openai o3 --gemini gemini-2.5-pro "complex design question"
 *   endiorbot consult --full "should we use Redis or PostgreSQL?"
 *
 * Model Selection (same as chatgpt.com/gemini.com):
 *   --openai <model>  - OpenAI model: o3, o3-mini, o1, o1-mini, gpt-4o
 *   --gemini <model>  - Gemini model: gemini-2.5-pro, gemini-2.0-flash-thinking
 *
 * @module cli/commands/consult
 * @version 2.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 54 Implementation
 * @authority ADR-001 3-Model Consultation
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
import {
  getChatHandler,
  type ChatHandlerRequest,
} from "../../gateway/chat-handler.js";
import { initializeProvidersFromEnv } from "../../providers/init.js";

// ============================================================================
// Constants - Available Models (per ADR-001)
// ============================================================================

/**
 * Available models for CEO selection.
 * Same experience as chatgpt.com/gemini.com.
 */
export const AVAILABLE_MODELS = {
  openai: ["o3", "o3-mini", "o1", "o1-mini", "gpt-4o", "gpt-4o-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.0-flash-thinking", "gemini-1.5-pro", "gemini-2.0-flash"],
  anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
} as const;

/**
 * Default models (per ADR-001).
 */
const DEFAULT_MODELS = {
  openai: "o3-mini",
  gemini: "gemini-2.0-flash-thinking",
} as const;

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
 * Consult options with model selection.
 */
interface ConsultOptions {
  models?: string;
  openai?: string;
  gemini?: string;
  full?: boolean;
  verbose?: boolean;
}

/**
 * Validate model selection.
 */
function validateModel(
  provider: "openai" | "gemini",
  model: string,
): boolean {
  const available = AVAILABLE_MODELS[provider] as readonly string[];
  return available.includes(model);
}

/**
 * Consult command action.
 */
async function consultAction(
  query: string,
  options: ConsultOptions,
): Promise<void> {
  console.log("");
  console.log("🔄 Consulting expert panel...");

  // Initialize providers from environment variables
  await initializeProvidersFromEnv();

  // Validate model selections if provided
  if (options.openai && !validateModel("openai", options.openai)) {
    console.error(`❌ Invalid OpenAI model: ${options.openai}`);
    console.log(`   Available: ${AVAILABLE_MODELS.openai.join(", ")}`);
    process.exit(1);
  }

  if (options.gemini && !validateModel("gemini", options.gemini)) {
    console.error(`❌ Invalid Gemini model: ${options.gemini}`);
    console.log(`   Available: ${AVAILABLE_MODELS.gemini.join(", ")}`);
    process.exit(1);
  }

  // Show selected models
  const openaiModel = options.openai ?? DEFAULT_MODELS.openai;
  const geminiModel = options.gemini ?? DEFAULT_MODELS.gemini;
  console.log(`   Claude (Primary) + ${openaiModel} + ${geminiModel}`);
  console.log("");

  try {
    // Use ChatHandler for Sprint 54 3-model consultation
    const chatHandler = getChatHandler();

    // Build request with only defined properties
    const request: ChatHandlerRequest = {
      message: query,
      channel: "cli",
      clientId: "cli-consult",
    };

    // Add optional model selections if provided
    if (options.openai) {
      request.openaiModel = options.openai;
    }
    if (options.gemini) {
      request.geminiModel = options.gemini;
    }
    if (options.full) {
      request.forceConsultation = options.full;
    }

    const response = await chatHandler.consult(request);

    // Display using new format for ChatHandler response
    displayChatResponse(response, options.verbose ?? false);

    // Show next actions
    console.log("📋 Actions:");
    console.log("   [A] Approve recommendation");
    console.log("   [D] Discuss further");
    console.log("   [R] Re-consult with different query");
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Fallback to orchestrator if ChatHandler not available
    if (message.includes("not available") || message.includes("not initialized")) {
      console.log("⚠️  ChatHandler not available, using orchestrator fallback...");
      console.log("");

      const orchestrator = getOrchestrator();
      const result = await orchestrator.consult(query);
      displayResult(result, options.verbose ?? false);
    } else {
      console.error(`❌ Consultation failed: ${message}`);
      process.exit(1);
    }
  }
}

/**
 * Display ChatHandler response in CLI format.
 */
function displayChatResponse(
  response: Awaited<ReturnType<ReturnType<typeof getChatHandler>["consult"]>>,
  verbose: boolean,
): void {
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🤖 3-Model Consultation (Sprint 54 MVP)                    │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Primary: ${response.model.padEnd(49)}│`);
  console.log(`│  Provider: ${response.provider.padEnd(48)}│`);

  if (response.agreement) {
    const agreementEmoji: Record<string, string> = {
      full: "✅",
      partial: "⚠️",
      divergent: "🔀",
    };
    console.log(
      `│  Agreement: ${agreementEmoji[response.agreement]} ${response.agreement.padEnd(45)}│`,
    );
  }

  console.log("├─────────────────────────────────────────────────────────────┤");

  // Show primary response
  console.log("│  📝 Response:".padEnd(62) + "│");
  const lines = response.text.split("\n").slice(0, verbose ? 20 : 5);
  for (const line of lines) {
    const truncated = line.slice(0, 55);
    console.log(`│     ${truncated.padEnd(55)}│`);
  }
  if (lines.length < response.text.split("\n").length) {
    console.log(`│     ...`.padEnd(62) + "│");
  }

  // Show notes/critiques if available
  if (response.notes) {
    console.log("├─────────────────────────────────────────────────────────────┤");
    console.log("│  📋 Alternative Views:".padEnd(62) + "│");
    const noteLines = response.notes.split("\n").slice(0, 5);
    for (const line of noteLines) {
      const truncated = line.slice(0, 55);
      console.log(`│     ${truncated.padEnd(55)}│`);
    }
  }

  // Show token usage
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(
    `│  📊 Tokens: ${response.tokenUsage.input} in / ${response.tokenUsage.output} out (budget: ${response.tokenUsage.budget})`.padEnd(62) + "│",
  );
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register consult command.
 *
 * Per ADR-001 3-Model Consultation:
 * - Claude (Primary) for coding/docs
 * - OpenAI (Critique) - CEO can select: o3, o3-mini, o1, gpt-4o
 * - Gemini (Critique) - CEO can select: gemini-2.5-pro, gemini-2.0-flash-thinking
 */
export function registerConsultCommand(program: Command): void {
  program
    .command("consult <query>")
    .description("Query 3 AI models for expert consultation (Claude + OpenAI + Gemini)")
    .option("--openai <model>", `OpenAI model (${AVAILABLE_MODELS.openai.join(", ")})`, DEFAULT_MODELS.openai)
    .option("--gemini <model>", `Gemini model (${AVAILABLE_MODELS.gemini.join(", ")})`, DEFAULT_MODELS.gemini)
    .option("--full", "Force full 3-model consultation regardless of task type")
    .option("-v, --verbose", "Show detailed responses from each model")
    .option("-m, --models <models>", "Legacy: Specific models to query (comma-separated)")
    .action(consultAction);

  // Also add 'models' command to list available models
  program
    .command("models")
    .description("List available AI models for consultation")
    .action(() => {
      console.log("");
      console.log("┌─────────────────────────────────────────────────────────────┐");
      console.log("│  🤖 Available Models for Consultation                       │");
      console.log("├─────────────────────────────────────────────────────────────┤");
      console.log("│  OpenAI:".padEnd(62) + "│");
      for (const model of AVAILABLE_MODELS.openai) {
        const isDefault = model === DEFAULT_MODELS.openai ? " (default)" : "";
        console.log(`│     • ${model}${isDefault}`.padEnd(62) + "│");
      }
      console.log("│".padEnd(62) + "│");
      console.log("│  Gemini:".padEnd(62) + "│");
      for (const model of AVAILABLE_MODELS.gemini) {
        const isDefault = model === DEFAULT_MODELS.gemini ? " (default)" : "";
        console.log(`│     • ${model}${isDefault}`.padEnd(62) + "│");
      }
      console.log("│".padEnd(62) + "│");
      console.log("│  Claude (Primary):".padEnd(62) + "│");
      for (const model of AVAILABLE_MODELS.anthropic) {
        console.log(`│     • ${model}`.padEnd(62) + "│");
      }
      console.log("└─────────────────────────────────────────────────────────────┘");
      console.log("");
      console.log("Usage:");
      console.log("  endiorbot consult --openai o3 --gemini gemini-2.5-pro \"your question\"");
      console.log("");
    });
}
