/**
 * Chat Command — Interactive AI Session (ADR-043)
 *
 * Multi-provider chat REPL with project context, history, and /commands.
 * Phase 1: Core REPL + provider switching + auto-save.
 *
 * @module cli/commands/chat
 * @version 1.0.0
 * @date 2026-04-03
 * @status ACTIVE — Sprint 127
 * @authority ADR-043 Chat Mode
 * @sdlc SDLC Framework 6.2.1
 */

import { createInterface } from "node:readline";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Command } from "commander";
import { resolveActiveProjectDir } from "../../config/paths.js";
import {
  createChatSession,
  processChatTurn,
  switchProvider,
  formatSessionStatus,
  getTurnWarning,
  type ChatSessionData,
  loadChatSession,
  listRecentChatSessions,
  compactChatHistory,
  isSafeChatCommand,
} from "../../commands/handlers/chat-session-handler.js";
import { createCommandDispatcher } from "../../commands/index.js";

// ============================================================================
// CLI Action
// ============================================================================

async function chatAction(options: { model?: string; resume?: string }): Promise<void> {
  const projectPath = resolveActiveProjectDir();
  const provider = options.model ?? "openai";

  // T1: Resume existing session or create new
  let session: ChatSessionData;
  if (options.resume) {
    const loaded = loadChatSession(options.resume, projectPath);
    session = loaded.session;
    for (const w of loaded.warnings) console.log(w);
    console.log(`Resumed session ${session.sessionId} (${Math.ceil(session.turns.length / 2)} turns)`);
  } else {
    session = createChatSession({ provider, projectPath });
  }

  // Display header
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  🤖 EndiorBot Chat                                          │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Project: ${session.projectName.slice(0, 49).padEnd(49)}│`);
  console.log(`│  Model: ${`${session.provider} (${session.model})`.slice(0, 51).padEnd(51)}│`);
  console.log("│  /help for commands, /model to switch, /exit to quit        │");
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // REPL loop (CTO recommendation #6: uses readline like shell.ts)
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You: ",
  });

  let turnsSinceSave = 0;
  let isBusy = false; // CTO blocker #1: busy guard against race conditions

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // CTO blocker #1: Busy guard — prevent race condition on session state
    if (isBusy) {
      console.log("⏳ Processing previous message... please wait.");
      return;
    }

    // Handle session commands
    if (input.startsWith("/")) {
      const handled = handleSessionCommand(input, session, rl);
      if (handled === "exit") {
        saveSession(session);
        console.log(`\n💾 Session saved: ${session.sessionId} (${Math.ceil(session.turns.length / 2)} turns)`);
        rl.close();
        return;
      }
      if (handled) {
        rl.prompt();
        return;
      }
      // T3: Route safe commands via CommandDispatcher (CPO C-CPO-3: allowlist)
      const cmdParts = input.slice(1).split(/\s+/);
      const cmdName = cmdParts[0]?.toLowerCase() ?? "";
      if (isSafeChatCommand(cmdName)) {
        try {
          const dispatcher = createCommandDispatcher();
          const result = await dispatcher.dispatch(cmdName, {
            args: cmdParts.slice(1),
            userId: "chat-user",
            username: "chat",
            channel: "cli" as never,
            workspace: session.projectPath,
          });
          if (result) {
            console.log(result.response);
            // CTO C5: Add command output to history so AI can reference
            session.turns.push({
              role: "assistant",
              content: `[Command /${cmdName}]\n${result.response.slice(0, 500)}`,
            provider: "system",
            tokenUsage: { input: 0, output: 0 },
            timestamp: new Date().toISOString(),
          });
          }
        } catch (err) {
          console.error(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log(`Command /${cmdName} not available in chat. Use: gate, plan, audit, status, compliance, agents, teams`);
      }
      rl.prompt();
      return;
    }

    // AI conversation turn (busy-guarded)
    isBusy = true;
    try {
      const result = await processChatTurn(session, input);
      console.log("");
      console.log(`🤖 ${result.response}`);
      console.log("");

      // CTO C2: Turn warning
      const warning = getTurnWarning(session);
      if (warning) console.log(warning);

      // T2: Auto-compact if needed (Sprint 128)
      const compacted = await compactChatHistory(session);
      if (compacted) console.log("📦 Conversation compacted (old turns summarized).");

      turnsSinceSave++;

      // Auto-save every 5 turns
      if (turnsSinceSave >= 5) {
        saveSession(session);
        turnsSinceSave = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ ${msg}`);
      console.error("   → Try /model <provider> to switch, or check API keys.\n");
    } finally {
      isBusy = false;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    saveSession(session);
    process.exit(0);
  });
}

// ============================================================================
// Session Commands (T3)
// ============================================================================

function handleSessionCommand(
  input: string,
  session: ChatSessionData,
  _rl: ReturnType<typeof createInterface>,
): string | boolean {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case "exit":
    case "quit":
    case "q":
      return "exit";

    case "model": {
      const provider = parts[1];
      if (!provider) {
        console.log("Usage: /model <openai|gemini|ollama>");
        console.log(`Current: ${session.provider} (${session.model})`);
        return true;
      }
      switchProvider(session, provider, parts[2]);
      console.log(`Switched to ${session.provider} (${session.model})`);
      return true;
    }

    case "clear":
      session.turns = [];
      console.log("✅ Conversation cleared.");
      return true;

    case "status":
      console.log("");
      console.log(formatSessionStatus(session));
      console.log("");
      return true;

    case "resume": {
      const sessions = listRecentChatSessions(5);
      if (sessions.length === 0) {
        console.log("No saved chat sessions found.");
        return true;
      }
      console.log("\nRecent sessions:");
      for (const s of sessions) {
        console.log(`  ${s.id} — ${s.project} (${s.turns} turns, ${s.age})`);
      }
      console.log("\nUse: endiorbot chat --resume <session-id>");
      console.log("");
      return true;
    }

    case "help":
      console.log("");
      console.log("Chat commands:");
      console.log("  /model <name>  — Switch provider (openai, gemini, ollama)");
      console.log("  /clear         — Clear conversation history");
      console.log("  /status        — Show session info (turns, tokens, cost)");
      console.log("  /resume        — List saved sessions");
      console.log("  /exit          — Save session and quit");
      console.log("  /help          — Show this help");
      console.log("");
      console.log("SDLC commands: /gate, /plan, /audit, /compliance, /agents, /teams");
      console.log("Or just type to chat with AI.");
      console.log("");
      return true;

    default:
      return false; // Not a session command
  }
}

// ============================================================================
// Session Persistence
// ============================================================================

function saveSession(session: ChatSessionData): void {
  try {
    const sessionsDir = join(homedir(), ".endiorbot", "sessions");
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }
    const filePath = join(sessionsDir, `${session.sessionId}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  } catch {
    // Silent failure — don't break chat for persistence
  }
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Interactive AI chat session with project context (OpenAI/Gemini/Ollama)")
    .option("--model <provider>", "AI provider: openai, gemini, ollama (default: openai)")
    .option("--resume <sessionId>", "Resume a saved chat session")
    .action(chatAction);
}
