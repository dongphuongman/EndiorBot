#!/usr/bin/env node
/**
 * Telegram Polling Script — OTT Agent Channel
 *
 * Architecture (per CEO directive):
 * - PRIMARY: Claude Code Bridge (Max 200 Plan subscription)
 *   → High quality SDLC agent responses via `claude` CLI + OAuth
 * - FALLBACK: Gemini/OpenAI (when Claude Code unavailable)
 * - CONSULT: Multi-model via Gemini/OpenAI for @consult tasks
 */

import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load env
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: true });

// Import from dist
const { createTelegramChannelFromEnv } = await import(join(root, "dist/channels/telegram/telegram-channel.js"));
const { parseMention } = await import(join(root, "dist/agents/orchestrator/mention-parser.js"));
const { initializeProvidersFromEnv } = await import(join(root, "dist/providers/init.js"));
const { getProviderRegistry } = await import(join(root, "dist/providers/provider-registry.js"));
const { getClaudeCodeBridge } = await import(join(root, "dist/agents/invoke/index.js"));

// Initialize Telegram channel
const channel = createTelegramChannelFromEnv();
if (!channel) {
  console.error("[Telegram] Not configured. Check ENDIORBOT_TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}

// Init AI providers (for fallback + consult)
console.log("[Telegram] Initializing AI providers (fallback + consult)...");
const providerCount = await initializeProvidersFromEnv();
console.log(`[Telegram] ${providerCount} fallback providers ready`);
const registry = getProviderRegistry();

// Init Claude Code Bridge (primary)
const bridge = getClaudeCodeBridge({ defaultTimeout: 120, verbose: false });
let claudeAvailable = false;
try {
  claudeAvailable = await bridge.isAvailable();
  console.log(`[Telegram] Claude Code Bridge: ${claudeAvailable ? "✓ READY (Max 200 Plan)" : "✗ NOT AVAILABLE"}`);
} catch (e) {
  console.warn(`[Telegram] Claude Code Bridge check failed: ${e.message}`);
}

// Agent SOUL descriptions
const AGENT_SOULS = {
  pm: "You are the PM (Product Manager) agent for EndiorBot. You handle requirements, user stories, sprint planning, and stakeholder communication. Be concise and actionable. Respond in the same language as the user's message.",
  architect: "You are the Architect agent for EndiorBot. You handle system design, ADRs, API specifications, and technical decisions. Be precise and well-structured. Respond in the same language as the user's message.",
  coder: "You are the Coder agent for EndiorBot. You handle implementation, TDD, code generation, and technical tasks. Write clean, tested code. Respond in the same language as the user's message.",
  reviewer: "You are the Reviewer agent for EndiorBot. You handle code review, quality checks, and standards compliance. Be thorough but constructive. Respond in the same language as the user's message.",
  tester: "You are the Tester agent for EndiorBot. You handle testing strategy, test plans, QA processes, and bug verification. Respond in the same language as the user's message.",
  researcher: "You are the Researcher agent for EndiorBot. You handle discovery, user research, competitive analysis, and information gathering. Respond in the same language as the user's message.",
  devops: "You are the DevOps agent for EndiorBot. You handle deployment, CI/CD, infrastructure, monitoring, and operations. Respond in the same language as the user's message.",
  fullstack: "You are the Fullstack agent for EndiorBot. You handle all SDLC stages from planning to deployment as a solo developer tool. Respond in the same language as the user's message.",
  pjm: "You are the PJM (Project Manager) agent for EndiorBot. You handle sprint coordination, task tracking, and timeline management. Respond in the same language as the user's message.",
  ceo: "You are the CEO agent for EndiorBot. You provide strategic direction, prioritization, and executive decisions. Respond in the same language as the user's message.",
  cpo: "You are the CPO agent for EndiorBot. You handle product vision, feature prioritization, and product strategy. Respond in the same language as the user's message.",
  cto: "You are the CTO agent for EndiorBot. You handle technical standards, architecture review, and technology decisions. Respond in the same language as the user's message.",
  assistant: "You are the Assistant agent for EndiorBot. You handle message routing, delegation, and general assistance. Respond in the same language as the user's message.",
};

/**
 * Strip EXTERNAL_INPUT wrapper tags from sanitized content.
 */
function stripSanitizerWrapper(text) {
  const match = text.match(/\[EXTERNAL_INPUT[^\]]*\]\n([\s\S]*?)\n\[\/EXTERNAL_INPUT\]/);
  return match ? match[1] : text;
}

/**
 * Call AI via Claude Code Bridge (primary — Max 200 Plan).
 * Uses `claude` CLI subprocess with OAuth authentication.
 * Returns null if bridge unavailable (caller should fallback).
 */
async function callClaudeBridge(agent, task) {
  if (!claudeAvailable) return null;

  const systemPrompt = AGENT_SOULS[agent] || `You are the @${agent} agent for EndiorBot. Respond helpfully.`;

  try {
    const response = await bridge.invokeRead({
      systemPrompt,
      userPrompt: task,
      workspace: root,
      agent,
      timeout: 120,
      maxTokens: 4000,
    });

    if (response.success && response.output) {
      return {
        content: response.output,
        provider: "claude-code",
        durationMs: response.durationMs,
      };
    }

    console.warn(`[Telegram] Claude Bridge returned error: ${response.error}`);
    return null;
  } catch (e) {
    console.warn(`[Telegram] Claude Bridge failed: ${e.message}`);
    // Mark as unavailable to avoid repeated failures
    claudeAvailable = false;
    console.warn("[Telegram] Claude Bridge marked unavailable — switching to fallback providers");
    return null;
  }
}

/**
 * Call AI via fallback provider (Gemini/OpenAI).
 */
async function callFallbackAI(agent, task) {
  const provider = registry.getDefault();
  if (!provider) throw new Error("No AI provider available");

  const systemPrompt = AGENT_SOULS[agent] || `You are the @${agent} agent for EndiorBot. Respond helpfully.`;

  const startTime = Date.now();
  const response = await provider.chat({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: task },
    ],
    temperature: 0.7,
    maxTokens: 2000,
  });

  return {
    content: response.content,
    provider: provider.name || "fallback",
    durationMs: Date.now() - startTime,
  };
}

/**
 * Call AI — tries Claude Code Bridge first, falls back to Gemini/OpenAI.
 */
async function callAI(agent, task) {
  // Primary: Claude Code Bridge (Max 200 Plan)
  const bridgeResult = await callClaudeBridge(agent, task);
  if (bridgeResult) return bridgeResult;

  // Fallback: Gemini/OpenAI
  console.log(`[Telegram] Using fallback provider for @${agent}`);
  return await callFallbackAI(agent, task);
}

/**
 * Format agent response for Telegram.
 */
function formatResponse(agent, result) {
  const maxLen = 3500; // Telegram limit ~4096
  const truncated = result.content.length > maxLen
    ? result.content.slice(0, maxLen) + "\n\n[...truncated]"
    : result.content;
  const providerTag = result.provider === "claude-code" ? "⚡" : "🔄";
  return `${providerTag} @${agent}\n\n${truncated}`;
}

// Set message handler
channel.onMessage(async (msg) => {
  const rawText = stripSanitizerWrapper(msg.content);
  console.log(`[Telegram] IN: ${rawText.slice(0, 120)}`);

  // Check for agent mention
  const parseResult = parseMention(rawText);

  if (!parseResult.success) {
    // No mention — show help
    await channel.send(
      "Dùng @agent hoặc [@agent: task] để gọi agent.\n" +
      "Ví dụ: @pm plan next sprint\n\n" +
      "Agents: pm, architect, coder, reviewer, tester, devops, researcher, pjm, fullstack\n" +
      "Executive: ceo, cpo, cto\n" +
      "Teams: planning, design, dev, qa, ops, executive\n\n" +
      `Mode: ${claudeAvailable ? "⚡ Claude Code (Max 200)" : "🔄 Fallback (Gemini/OpenAI)"}`
    );
    return;
  }

  const { agents, message: task } = parseResult.data;
  const primaryAgent = agents[0];

  if (!primaryAgent) {
    await channel.send("No valid agent found in mention.");
    return;
  }

  // Send processing indicator with provider info
  const modeLabel = claudeAvailable ? "Claude Code ⚡" : "Fallback 🔄";
  await channel.send(`Processing @${primaryAgent} via ${modeLabel}...`);

  try {
    const result = await callAI(primaryAgent, task);
    console.log(`[Telegram] @${primaryAgent} via ${result.provider} in ${result.durationMs}ms (${result.content.length} chars)`);

    const formatted = formatResponse(primaryAgent, result);
    await channel.send(formatted);

    // If multiple agents mentioned, process others too
    for (let i = 1; i < agents.length; i++) {
      const agent = agents[i];
      await channel.send(`Processing @${agent} via ${modeLabel}...`);
      try {
        const out = await callAI(agent, task);
        console.log(`[Telegram] @${agent} via ${out.provider} in ${out.durationMs}ms`);
        await channel.send(formatResponse(agent, out));
      } catch (e) {
        await channel.send(`@${agent} error: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`[Telegram] AI error:`, e.message);
    await channel.send(`Error calling @${primaryAgent}: ${e.message}`);
  }
});

channel.startPolling();
console.log("[Telegram] Polling started. Ctrl+C to stop.");
console.log(`[Telegram] Primary: ${claudeAvailable ? "Claude Code Bridge (Max 200)" : "UNAVAILABLE"}`);
console.log(`[Telegram] Fallback: Gemini/OpenAI (${providerCount} providers)`);

process.on("SIGINT", () => {
  console.log("\n[Telegram] Stopping...");
  channel.stopPolling();
  process.exit(0);
});
