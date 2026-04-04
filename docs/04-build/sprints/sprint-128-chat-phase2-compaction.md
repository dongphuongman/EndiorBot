# Sprint 128 — Chat Phase 2 + Context Compaction

**Date:** 2026-04-03
**Status:** PLANNED
**Prerequisite:** Sprint 127 COMPLETE (chat mode Phase 1)
**Framework:** SDLC 6.2.1
**Authority:** PM + Architect — CTO 7.5/10 APPROVED (T4 deferred, T2 reduced)
**ADRs:** ADR-043 (Chat Mode Phase 2), ADR-040 (Prompt Caching)

---

## Context

Sprint 127 delivered chat mode Phase 1: core REPL, multi-provider, history cap (hard-drop at 40 turns), auto-save. Phase 2 completes the chat experience with:

1. **Session resume** — continue previous conversations
2. **Context compaction** — summarize old turns instead of hard-drop
3. **Tool-like actions** — read/grep within chat (read-only)
4. **CLI command routing** — `/gate`, `/plan`, `/audit` work inside chat

**Goal:** Chat mode feels like a complete AI development assistant, not just a Q&A REPL.

**Baseline:** 7,582 tests passing, fully green.

---

## Scope

## CTO Conditions (binding)

1. **C1 — T2: Reuse HistoryCompactor** — do NOT create `chat-compactor.ts`. Wire with provider-backed summarizer + `ChatTurn[]↔Message[]` adapter
2. **C2 — T1: Project mismatch guard** — warn if `session.projectPath !== resolveActiveProjectDir()`
3. **C3 — T1: Provider validation on resume** — check available, offer switch if not
4. **C4 — T3: Use `CommandDispatcher.dispatch()`** — not `commander.parseAsync()`
5. **C5 — T3: Add command output to history** as system-role turns (AI can reference)
6. **C6 — T4: Deferred to Sprint 129** — bundle with write tools + security boundary
7. **C7 — Track compaction token cost** — update `totalTokens` + `totalCostUsd`

## CPO Conditions (binding)

1. **C-CPO-1 — Summary schema:** Use `role: "assistant"` with `[Conversation Summary]` prefix (NOT `role: "system"` — ChatTurn only allows user/assistant)
2. **C-CPO-2 — T4 deferred:** Resolved by CTO C6
3. **C-CPO-3 — T3 command allowlist:** Only dispatch safe commands: `gate`, `plan`, `audit`, `status`, `help`, `compliance`, `agents`, `teams`. Deny-by-default for `sh`, `run`, `kill`, `launch`, `send`.

---

## Scope (Revised — CTO rescoped)

| Track | What | Est. |
|-------|------|------|
| T1 | Session resume (`--resume <id>`, `/resume`) + project/provider guards | 2h |
| T2 | Context compaction (reuse HistoryCompactor + adapter) | 2h |
| T3 | CLI command routing with allowlist (`/gate`, `/plan`, `/audit`, etc.) | 2.5h |
| Tests | T1-T3 coverage | 1.5h |

**Total: ~8h** (T4 deferred to Sprint 129)

---

## Track 1: Session Resume (2h)

### `--resume <session-id>`

```bash
endiorbot chat --resume chat-abc12345
# → Loads prior conversation, displays summary, continues
```

### `/resume` command in chat

```
/resume
→ Recent sessions:
  1. chat-abc12 (Glass, 12 turns, 2h ago)
  2. chat-def34 (EndiorBot, 28 turns, yesterday)

/resume chat-abc12
→ ✅ Resumed session (12 turns loaded)
→ Last topic: "Architecture of auth module"
```

### Implementation

- Load `ChatSessionData` from `~/.endiorbot/sessions/chat-<id>.json`
- Refresh workspace context (branch may have changed)
- Display last 3 turns as recap
- Continue accumulating from loaded state

### Files

| Action | File |
|--------|------|
| MODIFY | `src/commands/handlers/chat-session-handler.ts` — add `loadSession()`, `listRecentSessions()` |
| MODIFY | `src/cli/commands/chat.ts` — add `--resume` flag + `/resume` command |

---

## Track 2: Context Compaction (3-4h)

### Problem

Phase 1 hard-drops turns beyond 40. This loses valuable context. Phase 2 summarizes old turns instead.

### Compaction Strategy

```
Turns 1-30: Summarized into 1 compact block (~200 tokens)
  "Previous discussion covered: auth module architecture,
   decided on JWT over sessions, identified CORS issue..."

Turns 31-40: Kept verbatim (recent context preserved)
```

### Trigger

- Automatic when `turns.length > 60` (30 pairs)
- Uses existing `HistoryCompactor` (CTO C1) with `ChatTurn[]↔Message[]` adapter
- Summary stored as `role: "assistant"` with `[Conversation Summary]` prefix (CPO C-CPO-1)
- Compaction call cost tracked in `session.totalTokens` + `session.totalCostUsd` (CTO C7)

### Implementation

```typescript
// Adapter: ChatTurn[] → Message[] for HistoryCompactor
function chatTurnsToMessages(turns: ChatTurn[]): Array<{ role: string; content: string }> {
  return turns.map(t => ({ role: t.role, content: t.content }));
}

// Wire HistoryCompactor with summarizer callback
async function compactChatHistory(session: ChatSessionData): Promise<void> {
  if (session.turns.length <= 60) return;

  const recentTurns = session.turns.slice(-20); // Keep last 10 pairs
  const oldTurns = session.turns.slice(0, -20);

  // Summarize via current provider (cost tracked — CTO C7)
  const summary = await summarizeViaProvider(session, oldTurns);

  // CPO C-CPO-1: Use role: "assistant" (ChatTurn only allows user/assistant)
  const summaryTurn: ChatTurn = {
    role: "assistant",
    content: `[Conversation Summary]\n${summary}`,
    provider: session.provider,
    tokenUsage: { input: 0, output: 0 }, // updated by summarizer
    timestamp: new Date().toISOString(),
  };

  session.turns = [summaryTurn, ...recentTurns];
}
```

### Files

| Action | File |
|--------|------|
| CREATE | `src/sessions/compaction/chat-compactor.ts` — compaction logic |
| MODIFY | `src/commands/handlers/chat-session-handler.ts` — trigger compaction in processChatTurn |

---

## Track 3: CLI Command Routing in Chat (2h)

### Problem

Phase 1 chat handles `/model`, `/clear`, `/status`, `/exit`, `/help`. All other `/commands` show "Unknown command." CEO expects `/gate status`, `/plan "X"`, `/audit permissions` to work.

### Implementation

Route allowed `/commands` to `CommandDispatcher` with explicit allowlist (CPO C-CPO-3):

```typescript
// Safe commands allowed in chat (deny-by-default)
const CHAT_SAFE_COMMANDS = new Set([
  "gate", "plan", "audit", "status", "help",
  "compliance", "agents", "teams", "init", "config",
]);

// In handleSessionCommand(), after checking session commands:
if (!handled && CHAT_SAFE_COMMANDS.has(cmd)) {
  const dispatcher = getCommandDispatcher();
  const result = await dispatcher.dispatch(cmd, {
    args: parts.slice(1),
    userId: "chat-user",
    channel: "cli",
    workspace: session.projectPath,
  });
  if (result.success) {
    console.log(result.response);
    // CTO C5: Add output to history so AI can reference
    session.turns.push({
      role: "assistant",
      content: `[Command /${cmd}]\n${result.response.slice(0, 500)}`,
      provider: "system",
      tokenUsage: { input: 0, output: 0 },
      timestamp: new Date().toISOString(),
    });
    return true;
  }
} else if (!handled) {
  console.log(`Command /${cmd} not available in chat. Safe commands: ${[...CHAT_SAFE_COMMANDS].join(", ")}`);
  return true;
}
```

### Files

| Action | File |
|--------|------|
| MODIFY | `src/cli/commands/chat.ts` — import CommandDispatcher, route unhandled commands |

---

## ~~Track 4: Tool-Like Read Actions~~ — DEFERRED to Sprint 129

Per CTO C6: Bundle with write tools where security boundary (path traversal guard, secret denylist, token cap) can be designed holistically.

---

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | `--resume <id>` loads prior session | Resume → prior turns visible |
| AC2 | `/resume` lists recent `chat-*` sessions | Shows metadata (turns, project, age) |
| AC3 | Resume warns on project mismatch (CTO C2) | Different cwd → warning shown |
| AC4 | Resume validates provider available (CTO C3) | Missing provider → offer switch |
| AC5 | Compaction triggers at 30+ pairs | Fill 35 turns → turns reduced |
| AC6 | Summary uses `role: "assistant"` (CPO C-CPO-1) | Not "system" role |
| AC7 | Compaction cost tracked (CTO C7) | `totalTokens` + `totalCostUsd` updated |
| AC8 | `/gate status` works in chat | Output displayed + added to history |
| AC9 | Unsafe commands denied (`/sh`, `/run`) (CPO C-CPO-3) | Error message + safe list shown |
| AC10 | Command output added to history (CTO C5) | AI can reference `/gate` results |

---

## Execution Order

```
Sprint 128 (8-10h):
├── T1: Session resume (--resume + /resume)                  [2h]
├── T3: CLI command routing (/gate, /plan, /audit in chat)   [2h]
├── T2: Context compaction (summarize old turns)             [3-4h]
├── T4: Tool-like read actions (read/show <file>)            [1-2h]
├── Tests for all tracks
└── Build + full test suite
```

---

## Verification

```bash
# T1: Resume
endiorbot chat
# → chat a few turns → /exit
endiorbot chat --resume <session-id-from-above>
# → Prior turns loaded, continue conversation

# T2: Compaction
# In chat: send 35+ turns → compaction triggers → /status shows reduced count

# T3: CLI commands in chat
endiorbot chat
# → /gate status → gates displayed
# → /plan add auth → plan generated
# → /audit permissions → audit shown

# T4: Read files
endiorbot chat
# → read src/main.ts → file displayed
# → "What does this file do?" → AI references the file

# Full suite
pnpm build && pnpm test  # 7,582+ tests
```

---

## Out of Scope (Future)

| Item | When |
|------|------|
| Streaming responses | Sprint 129+ |
| Write tools (Edit, Bash execution) | Sprint 129+ (needs Gate C) |
| Multi-agent within chat | Sprint 129+ (coordinator mode) |
| OTT `/chat` command (Telegram/Zalo) | Sprint 129+ |
