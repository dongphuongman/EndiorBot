#!/usr/bin/env node
/**
 * Telegram Polling Script — OTT Agent Channel
 *
 * Architecture (per CEO directive):
 * - ROUTER: Local Ollama qwen3.5:9b (think:false, ~2s, zero cost)
 *   → Parses mentions, classifies intent, extracts task
 * - PRIMARY: Claude Code Bridge (Max 200 Plan subscription)
 *   → High quality SDLC agent responses via `claude` CLI + OAuth
 * - FALLBACK: Gemini/OpenAI (when Claude Code unavailable)
 * - LAST FALLBACK: Local Ollama qwen3.5:9b (when all cloud APIs fail)
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

// ============================================================================
// Constants
// ============================================================================

// Local Ollama (router only)
const OLLAMA_LOCAL_URL = process.env.OLLAMA_LOCAL_URL || "http://localhost:11434";
const OLLAMA_ROUTER_MODEL = "qwen3.5:9b";
const OLLAMA_ROUTER_TIMEOUT_MS = 30000;

// Remote AI-Platform Ollama (last fallback)
const OLLAMA_REMOTE_URL = process.env.OLLAMA_REMOTE_URL || "https://api.nqh-internal.example";
const OLLAMA_REMOTE_API_KEY = process.env.OLLAMA_REMOTE_API_KEY || "";
const OLLAMA_REMOTE_MODEL = process.env.OLLAMA_REMOTE_MODEL || "qwen3-coder:30b";
const OLLAMA_REMOTE_TIMEOUT_MS = 120000;

const VALID_AGENTS = [
  "pm", "architect", "coder", "reviewer", "tester", "researcher",
  "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "assistant",
];

// ============================================================================
// Initialize
// ============================================================================

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

// Test local Ollama router
let ollamaRouterReady = false;
try {
  const res = await fetch(`${OLLAMA_LOCAL_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (res.ok) {
    const data = await res.json();
    const hasModel = data.models?.some((m) => m.name === OLLAMA_ROUTER_MODEL);
    ollamaRouterReady = hasModel;
    console.log(`[Telegram] Local Ollama Router (${OLLAMA_ROUTER_MODEL}): ${hasModel ? "✓ READY" : "✗ model not found"}`);
  }
} catch (e) {
  console.warn(`[Telegram] Local Ollama not available: ${e.message}`);
}

// ============================================================================
// Agent SOUL descriptions
// ============================================================================

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

// ============================================================================
// Router — Local Ollama qwen3.5:9b (think:false, ~2s)
// ============================================================================

/**
 * Route message via local Ollama qwen3.5:9b.
 * Extracts agents + task from free-form text.
 * Returns null if router unavailable (falls back to regex parseMention).
 */
async function routeViaOllama(text) {
  if (!ollamaRouterReady) return null;

  try {
    const startTime = Date.now();
    const res = await fetch(`${OLLAMA_LOCAL_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_ROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a message router for EndiorBot. Extract agent mentions and the task from user messages.
Valid agents: ${VALID_AGENTS.join(", ")}
Reply ONLY with JSON (no explanation): {"agents":["agent1","agent2"], "task":"the task description"}
If no valid agent is mentioned, reply: {"agents":[], "task":""}`,
          },
          { role: "user", content: text },
        ],
        stream: false,
        think: false,
        options: { temperature: 0.1, num_predict: 256 },
      }),
      signal: AbortSignal.timeout(OLLAMA_ROUTER_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.message?.content?.trim();
    const durationMs = Date.now() - startTime;

    if (!content) return null;

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    // Validate
    if (!Array.isArray(parsed.agents) || typeof parsed.task !== "string") return null;
    const validAgents = parsed.agents.filter((a) => VALID_AGENTS.includes(a));

    if (validAgents.length === 0) return null;

    console.log(`[Router] Ollama parsed in ${durationMs}ms: agents=${validAgents.join(",")} task="${parsed.task.slice(0, 80)}"`);
    return { agents: validAgents, task: parsed.task };
  } catch (e) {
    console.warn(`[Router] Ollama failed: ${e.message}`);
    return null;
  }
}

// ============================================================================
// AI Providers
// ============================================================================

function stripSanitizerWrapper(text) {
  const match = text.match(/\[EXTERNAL_INPUT[^\]]*\]\n([\s\S]*?)\n\[\/EXTERNAL_INPUT\]/);
  return match ? match[1] : text;
}

/**
 * PRIMARY: Claude Code Bridge (Max 200 Plan).
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
      return { content: response.output, provider: "claude-code", durationMs: response.durationMs };
    }

    console.warn(`[Telegram] Claude Bridge error: ${response.error}`);
    return null;
  } catch (e) {
    console.warn(`[Telegram] Claude Bridge failed: ${e.message}`);
    claudeAvailable = false;
    console.warn("[Telegram] Claude Bridge marked unavailable — switching to fallback");
    return null;
  }
}

/**
 * FALLBACK: Gemini/OpenAI via provider registry.
 */
async function callCloudFallback(agent, task) {
  const provider = registry.getDefault();
  if (!provider) return null;

  const systemPrompt = AGENT_SOULS[agent] || `You are the @${agent} agent for EndiorBot. Respond helpfully.`;

  try {
    const startTime = Date.now();
    const response = await provider.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: task },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    });
    return { content: response.content, provider: provider.name || "cloud", durationMs: Date.now() - startTime };
  } catch (e) {
    console.warn(`[Telegram] Cloud fallback failed: ${e.message}`);
    return null;
  }
}

/**
 * LAST FALLBACK: NQH AI-Platform Ollama (remote, qwen3-coder:30b).
 */
async function callRemoteOllama(agent, task) {
  if (!OLLAMA_REMOTE_URL) return null;

  const systemPrompt = AGENT_SOULS[agent] || `You are the @${agent} agent for EndiorBot. Respond helpfully.`;
  const headers = { "Content-Type": "application/json" };
  if (OLLAMA_REMOTE_API_KEY) {
    headers["Authorization"] = `Bearer ${OLLAMA_REMOTE_API_KEY}`;
  }

  try {
    const startTime = Date.now();
    const res = await fetch(`${OLLAMA_REMOTE_URL}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: OLLAMA_REMOTE_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: task },
        ],
        stream: false,
        options: { temperature: 0.7, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(OLLAMA_REMOTE_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.message?.content?.trim();
    if (!content) return null;

    return { content, provider: "ai-platform", durationMs: Date.now() - startTime };
  } catch (e) {
    console.warn(`[Telegram] AI-Platform Ollama failed: ${e.message}`);
    return null;
  }
}

/**
 * Call AI with full fallback chain:
 * Claude Code Bridge → Gemini/OpenAI → Local Ollama
 */
async function callAI(agent, task) {
  // 1. PRIMARY: Claude Code Bridge (Max 200 Plan)
  const bridgeResult = await callClaudeBridge(agent, task);
  if (bridgeResult) return bridgeResult;

  // 2. FALLBACK: Gemini/OpenAI
  console.log(`[Telegram] Trying cloud fallback for @${agent}...`);
  const cloudResult = await callCloudFallback(agent, task);
  if (cloudResult) return cloudResult;

  // 3. LAST FALLBACK: NQH AI-Platform (remote Ollama)
  console.log(`[Telegram] Trying AI-Platform for @${agent}...`);
  const remoteResult = await callRemoteOllama(agent, task);
  if (remoteResult) return remoteResult;

  throw new Error("All providers failed (Claude Code, Cloud APIs, AI-Platform)");
}

/**
 * Format agent response for Telegram.
 */
function formatResponse(agent, result) {
  const maxLen = 3500;
  const truncated = result.content.length > maxLen
    ? result.content.slice(0, maxLen) + "\n\n[...truncated]"
    : result.content;
  const icons = { "claude-code": "⚡", "ai-platform": "🏢" };
  const icon = icons[result.provider] || "🔄";
  return `${icon} @${agent}\n\n${truncated}`;
}

// ============================================================================
// Message Handler
// ============================================================================

channel.onMessage(async (msg) => {
  const rawText = stripSanitizerWrapper(msg.content);
  console.log(`[Telegram] IN: ${rawText.slice(0, 120)}`);

  // Step 1: Route via local Ollama (fast, ~2s)
  let routeResult = await routeViaOllama(rawText);

  // Step 2: Fallback to regex parseMention if Ollama router unavailable
  if (!routeResult) {
    const parseResult = parseMention(rawText);
    if (parseResult.success) {
      routeResult = { agents: parseResult.data.agents, task: parseResult.data.message };
    }
  }

  if (!routeResult || routeResult.agents.length === 0) {
    await channel.send(
      "Dùng @agent hoặc [@agent: task] để gọi agent.\n" +
      "Ví dụ: @pm plan next sprint\n\n" +
      "Agents: pm, architect, coder, reviewer, tester, devops, researcher, pjm, fullstack\n" +
      "Executive: ceo, cpo, cto\n" +
      "Teams: planning, design, dev, qa, ops, executive\n\n" +
      `Router: ${ollamaRouterReady ? "🏠 Local Ollama" : "📝 Regex"} | ` +
      `AI: ${claudeAvailable ? "⚡ Claude Code" : "🔄 Fallback"}`
    );
    return;
  }

  const { agents, task } = routeResult;
  const primaryAgent = agents[0];

  // Send processing indicator
  const modeLabel = claudeAvailable ? "Claude Code ⚡" : "Fallback 🔄";
  await channel.send(`Processing @${primaryAgent} via ${modeLabel}...`);

  try {
    const result = await callAI(primaryAgent, task);
    console.log(`[Telegram] @${primaryAgent} via ${result.provider} in ${result.durationMs}ms (${result.content.length} chars)`);
    await channel.send(formatResponse(primaryAgent, result));

    // Process additional agents
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

// ============================================================================
// Start
// ============================================================================

channel.startPolling();
console.log("[Telegram] Polling started. Ctrl+C to stop.");
console.log(`[Telegram] Router: ${ollamaRouterReady ? `🏠 Local Ollama (${OLLAMA_ROUTER_MODEL})` : "📝 Regex fallback"}`);
console.log(`[Telegram] Primary: ${claudeAvailable ? "⚡ Claude Code Bridge (Max 200)" : "UNAVAILABLE"}`);
console.log(`[Telegram] Fallback: 🔄 Gemini/OpenAI (${providerCount} providers)`);
console.log(`[Telegram] Last: ${OLLAMA_REMOTE_URL ? `🏢 AI-Platform (${OLLAMA_REMOTE_MODEL})` : "UNAVAILABLE"}`);

process.on("SIGINT", () => {
  console.log("\n[Telegram] Stopping...");
  channel.stopPolling();
  process.exit(0);
});
