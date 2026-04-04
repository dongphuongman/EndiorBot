# ADR-040: Prompt Caching Architecture

**Status:** PROPOSED (implementation deferred to Sprint 126 per CTO — provider refactor needed)
**Date:** 2026-04-01
**Sprint:** 126 (spike in Sprint 125)
**Authority:** PM + Architect
**SDLC Framework:** 6.2.1
**Traces:** ADR-039 (research findings), ADR-025 (SessionIntelligenceEnvelope)

---

## Context

EndiorBot sends SOUL template (~300 tokens) + PREAMBLE (~130 tokens) + Brain L4 + project context on every turn. These are **immutable within a session** — they never change between turns. Yet they're re-sent and re-processed by the API on every call, wasting ~50% of input tokens.

Anthropic API supports `cache_control: { type: "ephemeral" }` on system message blocks. Cached blocks are billed at 1/10th the normal input rate on turns 2+. This is purely a cost optimization — no behavior change.

**Research source:** Public Anthropic API docs + architectural pattern observed in clean-room specs (ADR-039 compliant).

---

## Decision

### Mark immutable system prompt sections as cacheable

Add `cache_control` metadata to system message blocks sent via Anthropic provider:

```
System message structure (per turn):
┌────────────────────────────────┐
│ [PREAMBLE] ← cache_control    │  ~130 tokens, immutable per session
│ [SOUL template] ← cache_control│  ~300 tokens, immutable per session
│ [Brain L4] ← cache_control    │  ~200 tokens, immutable per session
├────────────────────────────────┤
│ [Project context]              │  ~100 tokens, may change (workspace git)
│ [Memory facts]                 │  ~300 tokens, may change (new facts)
│ [Conversation history]         │  Changes every turn
└────────────────────────────────┘
```

**Cacheable (immutable):** PREAMBLE + SOUL + Brain L4
**Not cacheable (mutable):** Project context, memory facts, conversation history

### Implementation approach

1. `SoulLoadResult` gets a `cacheEligible: boolean` field (true for file-loaded SOULs)
2. `anthropic-provider.ts` checks `cacheEligible` and adds `cache_control` header to system message block
3. Other providers (OpenAI, Gemini) ignore caching metadata — no behavior change
4. Token savings tracked via `cachedTokens` in response metadata

### What NOT to change

- No changes to SOUL content or preamble content
- No changes to Brain L4 loading
- No changes to non-Anthropic providers
- No runtime behavior change — purely API billing optimization

---

## Consequences

### Positive
- ~25-30% reduction in input token costs on turns 2+ (SOUL + PREAMBLE cached, declining per turn as conversation grows)
- Estimated savings: ~430 tokens cached/turn at 90% discount = moderate cost reduction
- CTO note: savings decline as conversation context grows relative to cached prefix
- Zero behavior change — transparent optimization

### Negative
- Anthropic-specific optimization — other providers don't benefit
- Cache invalidation on SOUL change (rare, only on agent switch)
- Adds complexity to provider layer (cache metadata handling)

### Risks
- Cache may not be honored if API changes caching semantics
- Mitigation: cache is optional — fallback is normal billing

---

## Implementation Design (from Sprint 125 spike)

**Spike doc:** `docs/02-design/spike-prompt-caching.md`

Key finding: system message sent as flat string at `anthropic-provider.ts:146`. Must refactor to structured `SystemBlock[]` with `cache_control` headers.

**New type in `providers/types.ts`:**
```typescript
interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}
```

**Cacheable split:** PREAMBLE + SOUL + Brain = cacheable blocks. Project context + memory = mutable blocks.

## Files to Modify

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/providers/types.ts` | Add `SystemBlock`, update `ChatMessage.content` union |
| MODIFY | `src/bridge/intelligence/soul-loader.ts` | Add `cacheEligible` to `SoulLoadResult` |
| MODIFY | `src/bridge/intelligence/envelope-builder.ts` | Produce cacheable/mutable split |
| MODIFY | `src/providers/anthropic/anthropic-provider.ts` | Send structured blocks with `cache_control` |
| MODIFY | `src/providers/openai/index.ts` | Flatten SystemBlock[] to string (backward compat) |
| MODIFY | `src/gateway/chat-handler.ts` | Build structured system message |

---

## References

- Anthropic Prompt Caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- ADR-039: Research artifacts governance (pattern source)
- ADR-025: SessionIntelligenceEnvelope (3-layer context model)
