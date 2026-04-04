# ADR-043: Chat Mode — Interactive Agent Session

**Status:** ACCEPTED
**Date:** 2026-04-03
**Sprint:** 127 (planned)
**Authority:** PM + Architect — CTO assessed 16-20h (2 sprints)
**SDLC Framework:** 6.2.1
**Traces:** ADR-042 (Execution Engine), ADR-001 (Multi-Model Consultation), Sprint 124b

---

## Context

CEO wants EndiorBot to have a continuous interactive session (chat-mode) — like Claude Code but with non-Claude models (OpenAI, Gemini, Ollama) + SDLC context. Currently EndiorBot requires single commands or tmux bridge for AI interaction.

**CTO assessment:** 16-20h across 2 sprints. Depends on Sprint 124b (execution engine, now complete) and Sprint 126 (prompt caching for acceptable token costs).

**Use cases (CTO validated):**
1. SSH/headless environments (no VSCode/Claude Code available)
2. Non-Claude model consultation with project context (OpenAI, Gemini, Ollama)
3. Local Ollama for privacy-sensitive work (nothing leaves machine)

---

## Decision

### New `endiorbot chat` command

Interactive REPL session with AI provider, project context, and conversation history.

```bash
endiorbot chat                       # Start with default provider (OpenAI)
endiorbot chat --model ollama        # Use local Ollama
endiorbot chat --model gemini        # Use Gemini
endiorbot chat --resume <session-id> # Resume previous conversation
```

### Architecture

```
endiorbot chat [--model <provider>]
  ↓
  Session init: load project context (IDENTITY, workspace), select provider
  ↓
  REPL loop (readline):
  ├── "/" prefix → CommandDispatcher (existing 30+ commands work in chat)
  └── plain text → AI conversation turn:
      ├── Load history from FileSessionStore
      ├── Inject project context (IDENTITY, workspace, SOUL)
      ├── Call single provider (selected model)
      ├── Display full response
      ├── Accumulate history
      ├── Auto-save every 5 turns
      └── Context compaction after 30 turns
```

### Single Provider Per Session (CTO condition)

NOT 3-model consultation per turn. One provider selected at session start, switchable via `/model`:

| Command | Effect |
|---------|--------|
| `endiorbot chat` | Default provider (OpenAI gpt-5.4) |
| `endiorbot chat --model ollama` | Local Ollama |
| `/model gemini` | Switch mid-session to Gemini |
| `/model ollama` | Switch to local (privacy mode) |

### Provider Priority

```
1. OpenAI (gpt-5.4) — default
2. Gemini (gemini-2.5-pro) — research
3. Ollama (local) — offline, privacy
4. Anthropic API — backup only
```

### ChatSessionData Type (CTO C1 — separate from SDLC Session)

```typescript
/** Chat-specific session — separate from SDLC Session (no gates/stages fields) */
interface ChatSessionData {
  sessionId: string;         // "chat-<uuid>" prefix distinguishes from SDLC sessions
  provider: string;          // "openai" | "gemini" | "ollama"
  model: string;             // "gpt-5.4" | "gemini-2.5-pro" | etc.
  projectPath: string;
  projectName: string;
  turns: ChatTurn[];
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
  startedAt: string;
  lastActiveAt: string;
}
```

Adapter for `FileSessionStore`: chat sessions saved with `chat-` prefix in session ID. Same store, different type — no SDLC fields (gates, stages) polluted.

### History Management

- **In-memory:** `ChatTurn[]` accumulated per session
- **Phase 1 hard cap (CTO C2):** Max 40 turns in context window. Keep system prompt + last 30 user/assistant pairs. Warn at turn 35: "⚠️ Approaching history limit (35/40). Use /clear to reset."
- **Hard-drop beyond 40:** Oldest turns silently removed from context (still saved to disk for replay)
- **Persistent:** Auto-save to `FileSessionStore` every 5 turns + on `/exit`
- **Compaction (Phase 2):** Summarize old turns instead of dropping
- **Resume (Phase 2):** `--resume <id>` loads prior session from disk

### Prompt Caching Integration (CTO C3)

Project context injected as system message with `cache_control` per Sprint 126 `SystemBlock` pattern:

```typescript
// For Anthropic provider: structured blocks with caching
const systemBlocks: SystemBlock[] = [
  { type: "text", text: soulContent, cache_control: { type: "ephemeral" } },
  { type: "text", text: projectContext, cache_control: { type: "ephemeral" } },
];
// For other providers: flatten to string (Sprint 126 backward compat)
```

**On `/model` switch:** Re-inject system prompt on next turn to ensure new provider gets full context.

### Tool-Like Actions (Read-Only MVP)

```
You: read src/main.ts       → file contents displayed
You: /grep "TODO" src/       → grep results
You: /gate status            → SDLC gates
You: /plan add feature X     → plan generated
```

Write tools (Edit, Bash execution) deferred to follow-up sprint.

---

## Alternatives Considered

### A: Extend `endiorbot shell` (rejected)
- Shell dispatches CLI commands, not AI conversation
- Different UX and lifecycle — would pollute shell's command-first design
- CTO: "chat is for AI conversation, shell is for CLI dispatch"

### B: Bridge through Claude Code (current state)
- Works but requires tmux + Claude Code installed
- No non-Claude model support
- CEO already has CC — EndiorBot chat adds value for non-Claude + headless

### C: WebSocket chat via gateway (deferred)
- Web UI already has chat — could reuse
- Too complex for CLI-first MVP — gateway adds latency + complexity

---

## Consequences

### Positive
- CEO can interact with any AI model (OpenAI/Gemini/Ollama) with project context
- Works in SSH/headless — no VSCode needed
- Ollama support for privacy-sensitive work
- Commands work within chat — seamless SDLC integration

### Negative
- 16-20h investment (2 sprints)
- Duplicates some Claude Code UX (but for non-Claude models)
- Token costs for multi-turn conversations (mitigated by prompt caching from Sprint 126)

### Risks
- History accumulation → context window overflow → mitigated by 30-turn compaction
- Provider switching mid-session → context format differences → mitigated by unified Message type
- Session resume → stale context → mitigated by workspace refresh on resume

---

## Dependencies

| Dependency | Status | Required For |
|------------|--------|-------------|
| Sprint 124b (execution engine) | ✅ COMPLETE | Provider calling infrastructure |
| Sprint 126 (prompt caching) | ✅ COMPLETE | Acceptable token costs |
| ConversationStore | ✅ EXISTS | History management |
| FileSessionStore | ✅ EXISTS | Session persistence |
| ChatHandler | ✅ EXISTS | AI query with context |

---

## Implementation Phases

### Phase 1 (Sprint 127): Core Chat REPL (8-10h)
- `chat.ts` command with readline REPL
- `chat-session-handler.ts` shared logic
- Single provider per session + `/model` switching
- History accumulation + auto-save
- `/exit`, `/clear`, `/model`, `/status` session commands

### Phase 2 (Sprint 128): Polish + Resume (6-8h)
- `--resume <id>` session loading
- Context compaction (summarize old turns)
- Tool-like actions (read, grep within chat)
- Streaming responses (progressive output)

---

## Files (Phase 1)

| Action | File |
|--------|------|
| CREATE | `src/cli/commands/chat.ts` — Chat REPL command |
| CREATE | `src/commands/handlers/chat-session-handler.ts` — Shared session logic |
| MODIFY | `src/cli/commands/register-all.ts` — Register chat command |
| MODIFY | `src/cli/commands/index.ts` — Export |

---

## References

- CTO assessment: "16-20h, 2 sprints. Use cases: SSH/headless, non-Claude models"
- ADR-042: Execution engine (provider calling infrastructure)
- ADR-001: Multi-model consultation (provider priority chain)
- claw-code: Turn loop pattern (runtime.py — research reference, no code copied)
