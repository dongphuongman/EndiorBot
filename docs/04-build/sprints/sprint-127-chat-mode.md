# Sprint 127 — Chat Mode (Phase 1: Core REPL)

**Date:** 2026-04-03
**Status:** PLANNED
**Prerequisite:** Sprint 126 COMPLETE (prompt caching), Sprint 124b COMPLETE (execution engine)
**Framework:** SDLC 6.2.1
**Authority:** PM + Architect — CTO 8/10 APPROVED with 3 conditions
**ADR:** ADR-043

---

## CTO Conditions (binding)

1. **C1 — Separate ChatSessionData type:** `chat-<uuid>` prefix, no SDLC Session fields (gates/stages)
2. **C2 — Phase 1 history cap:** Hard-drop beyond 40 turns (system + last 30 pairs). Warn at 35.
3. **C3 — Prompt caching integration:** Project context as `SystemBlock[]` with `cache_control` per Sprint 126

## CTO Recommendations (non-blocking)

4. `/model` switch re-injects system prompt on next turn
5. `/status` shows per-provider token breakdown (Ollama free vs paid)
6. `/<command>` routing uses `executeSubcommand()` pattern from `shell.ts`

---

## Context

CEO wants interactive chat-mode with non-Claude models + SDLC context. Sprint 124b wired the execution engine, Sprint 126 added prompt caching. Chat mode can now build on both.

CTO assessed 16-20h across 2 phases. This sprint = Phase 1 (core REPL, 8-10h).

---

## Scope

| Track | What | Est. |
|-------|------|------|
| T1 | Chat REPL command (`endiorbot chat`) | 3-4h |
| T2 | Chat session handler (shared logic, OTT-compatible) | 3-4h |
| T3 | Session commands (`/model`, `/clear`, `/status`, `/exit`) | 2h |

**Total Phase 1: 8-10h**

### OUT OF SCOPE (Phase 2 — Sprint 128)

- `--resume <session-id>` session loading
- Context compaction (30-turn summarization)
- Tool-like actions (read, grep within chat)
- Streaming responses

---

## Track 1: Chat REPL Command

```bash
endiorbot chat                    # Default: OpenAI gpt-5.4
endiorbot chat --model ollama     # Local Ollama
endiorbot chat --model gemini     # Gemini
```

### UX

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 EndiorBot Chat                                          │
│  Project: Glass (Rust)                                      │
│  Model: OpenAI (gpt-5.4)                                   │
│  /help for commands, /model to switch, /exit to quit        │
└─────────────────────────────────────────────────────────────┘

You: What is the architecture of this project?

🤖 Based on the project context (Glass — Rust monorepo)...

You: /model ollama
✅ Switched to Ollama (qwen3.5:9b)

You: Analyze this code privately
🤖 [Local response — nothing leaves machine]

You: /exit
💾 Session saved (12 turns, $0.04)
```

### Files

| Action | File |
|--------|------|
| CREATE | `src/cli/commands/chat.ts` |
| MODIFY | `src/cli/commands/register-all.ts` |
| MODIFY | `src/cli/commands/index.ts` |

---

## Track 2: Chat Session Handler

Shared logic used by CLI chat + future OTT `/chat` command.

```typescript
interface ChatSessionConfig {
  provider: string;           // "openai" | "gemini" | "ollama"
  model?: string;             // Override model name
  projectPath: string;
  sessionId: string;
}

interface ChatTurnResult {
  response: string;
  provider: string;
  model: string;
  tokenUsage: { input: number; output: number };
  turnNumber: number;
}

// Core turn processing
async function processChatTurn(
  session: ChatSession,
  userInput: string,
): Promise<ChatTurnResult>;

// Provider switching
function switchProvider(session: ChatSession, provider: string): void;

// Session save/load
async function saveSession(session: ChatSession): Promise<string>;
```

### Files

| Action | File |
|--------|------|
| CREATE | `src/commands/handlers/chat-session-handler.ts` |

---

## Track 3: Session Commands

In-chat commands (all prefixed with `/`):

| Command | Action |
|---------|--------|
| `/model <name>` | Switch provider (openai, gemini, ollama) |
| `/clear` | Clear conversation history |
| `/status` | Show session info (turns, tokens, cost) |
| `/exit` | Save session + quit |
| `/help` | Show available commands |
| `/<any other>` | Route to existing CommandDispatcher |

---

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | `endiorbot chat` starts interactive REPL | Command launches, shows header |
| AC2 | Plain text sent to AI provider with project context | Response includes project-aware content |
| AC3 | `/model ollama` switches to local Ollama | Provider confirmed in status |
| AC4 | `/exit` saves session to disk | File exists in `~/.endiorbot/sessions/` |
| AC5 | `/gate status` works within chat | Existing command output displayed |
| AC6 | Conversation history accumulated across turns | Turn 3+ references prior context |
| AC7 | Auto-save every 5 turns | Session file updated without `/exit` |
| AC8 | Token usage tracked per session | `/status` shows total tokens + cost |

---

## Verification

```bash
# Start chat with default provider
endiorbot chat
# → Type "What is this project?" → Get project-aware response
# → Type /model ollama → Switch confirmed
# → Type /exit → Session saved

# Start with specific model
endiorbot chat --model gemini
# → Gemini responds

# Commands within chat
endiorbot chat
# → /gate status → gates displayed
# → /plan add feature X → plan generated
# → Continue chatting

# Full test suite
pnpm build && pnpm test  # 7,568+ tests
```
