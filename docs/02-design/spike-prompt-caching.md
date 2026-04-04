# Spike: Prompt Caching — System Message Flow Analysis

**Date:** 2026-04-01
**Sprint:** 125 (T1-prep)
**For:** Sprint 126 implementation (ADR-040)

---

## System Message Construction Point

**File:** `src/providers/anthropic/anthropic-provider.ts`
**Lines:** 134-148 (chat method)

```typescript
// Current implementation:
const systemMessage = request.messages.find((m) => m.role === "system");
const system = systemMessage ? this.extractTextContent(systemMessage.content) : undefined;

const body = {
  model: request.model,
  system: system,  // ← FLAT STRING — not structured blocks
  messages: anthropicMessages,
};
```

**Problem:** `system` is sent as a flat string. Anthropic `cache_control` requires structured blocks:

```typescript
// Required for caching:
system: [
  { type: "text", text: preambleContent, cache_control: { type: "ephemeral" } },
  { type: "text", text: soulContent, cache_control: { type: "ephemeral" } },
  { type: "text", text: mutableContext },  // NO cache_control — changes per turn
]
```

---

## Message Flow (end-to-end)

```
1. SoulLoader.load()
   → Returns: SoulLoadResult { content, preambleHash, cacheEligible? }
   → File: src/bridge/intelligence/soul-loader.ts

2. buildContextEnvelope()
   → Returns: ContextEnvelope { content (sprint + tier + memory facts) }
   → File: src/bridge/intelligence/context-builder.ts

3. buildFullEnvelope(persona)
   → Returns: SessionIntelligenceEnvelope { persona, brain?, context? }
   → File: src/bridge/intelligence/envelope-builder.ts

4. serializeEnvelopeForInjection(envelope)
   → Returns: flat string concatenation of SOUL + brain + context
   → File: src/bridge/intelligence/envelope-builder.ts

5. ChatHandler.handle() / ChannelRouter.callAI()
   → Builds ChatRequest with messages: [{ role: "system", content: flatString }]
   → File: src/gateway/chat-handler.ts, src/agents/channel-router.ts

6. AnthropicProvider.chat(request)
   → Extracts system as flat string via extractTextContent()
   → Sends to API as: { system: "flat string" }
   → File: src/providers/anthropic/anthropic-provider.ts:146
```

**The entire chain produces a flat string.** No structured blocks at any layer.

---

## Refactoring Required for Sprint 126

### Option A: Structured system message in ChatRequest (recommended)

Change `ChatRequest.messages` to support structured system blocks:

```typescript
// providers/types.ts — extend ChatMessage
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | SystemBlock[];  // ← NEW: allow structured blocks
}

interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
```

Then in `anthropic-provider.ts`:
```typescript
// If system content is already structured blocks, pass through
// If flat string, wrap in single block (backward compatible)
const systemBlocks = typeof systemMessage.content === "string"
  ? [{ type: "text", text: systemMessage.content }]
  : systemMessage.content;

const body = { system: systemBlocks, ... };
```

### Option B: Separate cache-eligible content in envelope (simpler)

Add `cacheablePrefix` and `mutableSuffix` to `PersonaEnvelope`:

```typescript
interface PersonaEnvelope {
  cacheableContent: string;   // PREAMBLE + SOUL + Brain (immutable)
  mutableContent: string;     // Project context + memory (changes per turn)
}
```

Then in provider: construct 2 blocks (cacheable + mutable).

**Recommendation:** Option A — more general, benefits all providers eventually.

---

## API Requirements

1. **Anthropic API version:** Must use `anthropic-version: 2023-06-01` or later
2. **Beta header:** `anthropic-beta: prompt-caching-2024-07-31` (check if still needed)
3. **Block format:** `system` must be `Array<{ type: "text", text: string, cache_control?: {...} }>`
4. **Cache granularity:** First N blocks marked cacheable, remaining blocks are mutable
5. **Response metadata:** `usage.cache_read_input_tokens` > 0 when cache hit

---

## Effort Estimate (Sprint 126)

| Task | Est. |
|------|------|
| Extend ChatMessage type to support SystemBlock[] | 1h |
| Update AnthropicProvider to send structured blocks | 2h |
| Update SoulLoader + envelope-builder to produce separate cacheable/mutable content | 2h |
| Update ChatHandler + ChannelRouter to pass structured system message | 1h |
| Tests (cache flag, provider mock, backward compat) | 2h |
| **Total** | **8h** |

CTO was right: 6-8h realistic, not 3-4h.

---

## Files to Modify (Sprint 126 scope)

| File | Change |
|------|--------|
| `src/providers/types.ts` | Add `SystemBlock` type, update `ChatMessage.content` union |
| `src/providers/anthropic/anthropic-provider.ts` | Send structured blocks with `cache_control` |
| `src/bridge/intelligence/soul-loader.ts` | Add `cacheEligible` field |
| `src/bridge/intelligence/envelope-builder.ts` | Produce cacheable/mutable split |
| `src/gateway/chat-handler.ts` | Pass structured system message |
| `src/providers/openai/index.ts` | Handle SystemBlock[] gracefully (flatten to string) |
