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
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
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

    // Hint: @agent mentions → suggest /command instead
    if (input.startsWith("@")) {
      const agent = input.split(/\s+/)[0];
      console.log(`\n💡 Chat mode doesn't route to agents. Try instead:`);
      console.log(`   /compliance check    — SDLC compliance`);
      console.log(`   /gate status         — gate status`);
      console.log(`   Or exit chat and run: endiorbot agent ${agent} "${input.replace(agent!, '').trim()}"`);
      console.log("");
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
      if (msg.includes("not available") || msg.includes("API")) {
        console.error(`   Current provider: ${session.provider} (${session.model})`);
        console.error("   → /model ollama     — free, local (no API key needed)");
        console.error("   → /model gemini     — needs GOOGLE_API_KEY in .env");
        console.error("   → /model openai     — needs OPENAI_API_KEY in .env");
      } else {
        console.error("   → Try /model <provider> to switch, or check API keys.");
      }
      console.error("");
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

    case "read": {
      const filePath = parts.slice(1).join(" ");
      if (!filePath) {
        console.log("Usage: /read <file-path>");
        return true;
      }
      return handleToolRead("read", filePath, session);
    }

    case "grep": {
      const query = parts.slice(1).join(" ");
      if (!query) {
        console.log("Usage: /grep <pattern> [path]");
        return true;
      }
      return handleToolRead("grep", query, session);
    }

    case "glob": {
      const pattern = parts.slice(1).join(" ");
      if (!pattern) {
        console.log("Usage: /glob <pattern>");
        return true;
      }
      return handleToolRead("glob", pattern, session);
    }

    case "ls": {
      const dir = parts[1] ?? ".";
      return handleToolRead("ls", dir, session);
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
      console.log("Tool commands (read-only):");
      console.log("  /read <file>   — Read file and add to context");
      console.log("  /grep <pattern>— Search code (ripgrep)");
      console.log("  /glob <pattern>— Find files by pattern");
      console.log("  /ls [dir]      — List directory");
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
// Tool Reads — Phase 3 (Sprint 130): read-only file/code access in chat
// ============================================================================

const TOOL_READ_MAX_CHARS = 2000; // Cap output to ~500 tokens

function handleToolRead(tool: string, arg: string, session: ChatSessionData): boolean {
  const projectPath = session.projectPath;

  try {
    let output = "";
    let label = "";

    switch (tool) {
      case "read": {
        const fullPath = resolvePath(projectPath, arg);
        if (!fullPath.startsWith(resolvePath(projectPath))) {
          console.log("⚠️  Path traversal blocked.");
          return true;
        }
        if (!existsSync(fullPath)) {
          console.log(`❌ File not found: ${arg}`);
          return true;
        }
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        output = lines.length > 60
          ? lines.slice(0, 60).join("\n") + `\n... (${lines.length - 60} more lines)`
          : content;
        label = `/read ${arg} (${lines.length} lines)`;
        break;
      }

      case "grep": {
        const parts = arg.split(/\s+/);
        const pattern = parts[0] ?? "";
        const searchPath = parts[1] ?? ".";
        const result = execFileSync("rg", [
          "--no-heading", "--line-number", "--max-count", "20",
          "--max-columns", "200", pattern, searchPath,
        ], { cwd: projectPath, timeout: 10000, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        output = result.trim() || "(no matches)";
        label = `/grep ${pattern} (${output.split("\n").length} matches)`;
        break;
      }

      case "glob": {
        const result = execFileSync("find", [
          ".", "-path", `./${arg}`, "-type", "f",
        ], { cwd: projectPath, timeout: 5000, encoding: "utf-8" });
        const files = result.trim().split("\n").filter(Boolean);
        output = files.length > 0 ? files.slice(0, 30).join("\n") : "(no files matched)";
        if (files.length > 30) output += `\n... (${files.length - 30} more)`;
        label = `/glob ${arg} (${files.length} files)`;
        break;
      }

      case "ls": {
        const fullPath = resolvePath(projectPath, arg);
        if (!fullPath.startsWith(resolvePath(projectPath))) {
          console.log("⚠️  Path traversal blocked.");
          return true;
        }
        const entries = readdirSync(fullPath, { withFileTypes: true });
        output = entries
          .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
          .slice(0, 50)
          .join("\n");
        label = `/ls ${arg} (${entries.length} entries)`;
        break;
      }
    }

    // Truncate to token cap
    if (output.length > TOOL_READ_MAX_CHARS) {
      output = output.slice(0, TOOL_READ_MAX_CHARS) + "\n... (truncated)";
    }

    // Display to user
    console.log(`\n${output}\n`);

    // Add to history so AI can reference
    session.turns.push({
      role: "assistant",
      content: `[Tool: ${label}]\n${output}`,
      provider: "system",
      tokenUsage: { input: 0, output: 0 },
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") && msg.includes("rg")) {
      console.log("❌ ripgrep (rg) not found. Install: brew install ripgrep");
    } else if (msg.includes("timed out")) {
      console.log("⚠️  Search timed out. Try a more specific pattern.");
    } else {
      console.log(`❌ ${msg.split("\n")[0]}`);
    }
    return true;
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
