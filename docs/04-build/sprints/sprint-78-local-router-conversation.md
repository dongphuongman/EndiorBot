# Sprint 78: Local Ollama Router + Conversation Persistence

**Status**: IN PROGRESS
**Date**: 2026-03-05
**Authority**: ADR-021
**Total Effort**: ~18h

---

## Goal

**CEO Power Tool** — 2 improvements to reduce cost and improve UX:

1. **Track A**: Replace Sonnet routing ($0.003/req) with local `qwen3.5:9b` ($0/req)
2. **Track B**: Add conversation persistence to Telegram/Zalo (CEO no longer repeats context)
3. **Track C**: SDLC docs

---

## Track A: Local Ollama Router (10h)

### Problem
Every agent routing decision currently calls Sonnet API (~800ms, ~$0.003).
With 100+ routing calls/day → ~$9/month wasted on classification tasks.

### Solution
`LocalRouterAgent` wraps `OllamaProvider(qwen3.5:9b)` for routing.
- `metadata: { think: false }` → disable chain-of-thought, fast classification
- 2s timeout → fallback to Sonnet if Ollama unreachable
- Transparent: `RoutingDecision` includes `routerModel` field

### Tasks

#### A1 — Finalize Ollama provider changes (1h)
**File**: `src/providers/ollama/index.ts`, `src/providers/types.ts`

Changes already uncommitted:
- Added `qwen3.5:9b` to `OLLAMA_MODELS[]`
- Added `DEFAULT_ROUTER_MODEL = "qwen3.5:9b"`
- Changed `DEFAULT_FALLBACK_MODEL` → `"qwen3.5:9b"`
- Added `metadata?: Record<string, unknown>` to `ChatRequest`

Remaining: wire `metadata` into Ollama request body (pass `think: false` when metadata has it).

**Acceptance**: `OllamaProvider.chat({ metadata: { think: false } })` omits thinking tokens.

---

#### A2 — LocalRouterAgent (3h)
**File**: `src/agents/routing/local-router.ts` (NEW)

```typescript
export interface RouterDecision {
  agent: AgentRole;
  confidence: number;     // 0-1
  routerModel: string;    // "qwen3.5:9b" | "claude-sonnet-4-6"
  latencyMs: number;
  fallbackUsed: boolean;
}

export class LocalRouterAgent {
  async route(message: string, context?: RouterContext): Promise<RouterDecision>
  async isAvailable(): Promise<boolean>   // Ollama reachable + model loaded?
}
```

**Logic**:
1. Check `isAvailable()` with 2s timeout
2. If available → call `OllamaProvider` with `DEFAULT_ROUTER_MODEL`, `metadata: { think: false }`
3. Parse JSON response `{ agent, confidence }`
4. If unavailable / parse error → call Sonnet fallback
5. Return `RouterDecision` with `routerModel` + `fallbackUsed`

**System prompt** (compact, classification-focused):
```
You are a routing classifier. Given a user message, respond with JSON only:
{"agent":"<role>","confidence":<0-1>}
Valid agents: researcher|pm|architect|coder|reviewer|tester|devops|ceo|cto
```

**Acceptance**: Routes "write a function to sort" → `coder`, "plan the sprint" → `pm`

---

#### A3 — Wire metadata.think into OllamaProvider (1h)
**File**: `src/providers/ollama/index.ts`

In `chat()` method, after building `body`:
```typescript
if (request.metadata?.think === false) {
  body.think = false;
}
```

**Acceptance**: Request body includes `think: false` when metadata set.

---

#### A4 — Fallback chain (2h)
**File**: `src/agents/routing/local-router.ts`

```typescript
private async routeWithFallback(message: string): Promise<RouterDecision> {
  // 1. Try local with 2s timeout
  const localResult = await Promise.race([
    this.routeLocal(message),
    timeout(2000).then(() => null),
  ]);
  if (localResult) return { ...localResult, fallbackUsed: false };

  // 2. Fallback to Sonnet
  const sonnetResult = await this.routeSonnet(message);
  return { ...sonnetResult, fallbackUsed: true };
}
```

**Acceptance**: When `OllamaProvider` throws / times out, Sonnet result returned with `fallbackUsed: true`.

---

#### A5 — Tests + benchmark (3h)
**File**: `tests/agents/routing/local-router.test.ts` (NEW, target 30+ tests)

Test groups:
- `isAvailable()`: returns true when mock Ollama up, false when down
- `route()`: correct agent classification for 10+ sample messages
- `metadata.think:false`: request body contains `think: false`
- Fallback: Sonnet called when Ollama times out (mock)
- `routerModel`: populated correctly in both paths
- `latencyMs`: non-zero, reasonable
- Vietnamese messages: correctly classified (CEO use case)

---

## Track B: OTT Conversation Persistence (6h)

### Problem
Every Telegram/Zalo message is stateless. CEO must repeat:
> "@coder tiếp tục việc refactor hôm qua"
→ Agent has no memory of "việc refactor hôm qua"

### Solution
`ConversationStore` keyed by `chatId`. Stores last N (default 10) turn pairs.
Injected into agent `InvokeRequest` as conversation history.

### Tasks

#### B1 — ConversationStore (2h)
**File**: `src/channels/conversation/store.ts` (NEW)

```typescript
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export class ConversationStore {
  constructor(private maxTurns = 10) {}

  add(chatId: string, role: "user" | "assistant", content: string): void
  get(chatId: string): ConversationTurn[]    // newest-first slice
  clear(chatId: string): void
  clearAll(): void
  size(chatId: string): number
}
```

Storage: in-memory `Map<string, ConversationTurn[]>` (resets on restart — acceptable for CEO tool).

**Acceptance**:
- `add()` + `get()` round-trip correct
- Max 10 turns enforced (oldest evicted)
- `clear()` empties specific chat
- Thread-safe (single-process, no locking needed)

---

#### B2 — Wire into Zalo agent-handler (2h)
**File**: `src/channels/zalo/agent-handler.ts`

```typescript
import { getConversationStore } from "../conversation/store.js";

// In createZaloAgentHandler():
const store = getConversationStore();

// Before invokeZaloAgent():
store.add(chatId, "user", rawContent);

// After response received:
store.add(chatId, "assistant", result.response);

// Pass history to InvokeRequest:
const invokeRequest: InvokeRequest = {
  ...existing,
  conversationHistory: store.get(chatId),
};
```

Also wire into **Telegram** `telegram-channel.ts` using same pattern.

**Acceptance**: 2nd message in same chat has `conversationHistory.length > 0`

---

#### B3 — /clear command (1h)
**File**: `src/channels/zalo/zalo-commands.ts` + `src/channels/telegram/telegram-commands.ts`

Add `/clear` to both channels:
```typescript
case "/clear": {
  store.clear(chatId);
  await sendFn("🗑 Conversation cleared.");
  return true;
}
```

Update help messages to include `/clear`.

**Acceptance**: After `/clear`, next message has empty `conversationHistory`

---

#### B4 — Tests (1h)
**File**: `tests/channels/conversation/store.test.ts` (NEW, target 25+ tests)

Test groups:
- `add()` + `get()`: correct order, correct content
- Max turns: 11th turn evicts oldest
- `clear()`: empties chat, leaves others intact
- `clearAll()`: empties all
- `size()`: accurate count
- Empty chatId: returns `[]`
- Integration: Zalo handler populates history

---

## Track C: Docs (2h) ✅ DONE

| Artifact | Status |
|----------|--------|
| ADR-021 Local Router Architecture | ✅ |
| Sprint 78 plan (this file) | ✅ |
| SPRINT-INDEX.md update | 🔄 |

---

## Architecture Overview

```
CEO: "@coder refactor the auth module"
        │
        ▼
ConversationStore.add(chatId, "user", msg)   ← B1/B2
        │
        ▼
LocalRouterAgent.route(msg)                  ← A2
  └─ qwen3.5:9b (local, think:false, ~100ms) ← A3
  └─ Sonnet fallback if Ollama down           ← A4
        │
        ▼
InvokeRequest { agent: "coder", conversationHistory: [...] }
        │
        ▼
ClaudeCodeBridge → @coder executes
        │
        ▼
ConversationStore.add(chatId, "assistant", response)  ← B2
        │
        ▼
CEO receives response in Telegram/Zalo
```

---

## Success Criteria

- [ ] `qwen3.5:9b` used for routing when Ollama running
- [ ] Fallback to Sonnet within 2s when Ollama unreachable
- [ ] `routerModel` field in routing response for observability
- [ ] Conversation persists across messages in same chatId
- [ ] `/clear` resets context (Telegram + Zalo)
- [ ] Help messages include `/clear`
- [ ] CTO code review ≥ 8/10
- [ ] Build clean, 5060+ tests passing

---

## Files Touched

| File | Change |
|------|--------|
| `src/providers/ollama/index.ts` | `qwen3.5:9b`, `DEFAULT_ROUTER_MODEL`, `think` wiring |
| `src/providers/types.ts` | `metadata` field in `ChatRequest` |
| `src/agents/routing/local-router.ts` | NEW — LocalRouterAgent |
| `src/channels/conversation/store.ts` | NEW — ConversationStore |
| `src/channels/zalo/agent-handler.ts` | Wire store + history |
| `src/channels/zalo/zalo-commands.ts` | `/clear` command |
| `src/channels/telegram/telegram-channel.ts` | Wire store + history |
| `src/channels/telegram/telegram-commands.ts` | `/clear` command |
| `tests/agents/routing/local-router.test.ts` | NEW — 30+ tests |
| `tests/channels/conversation/store.test.ts` | NEW — 25+ tests |
