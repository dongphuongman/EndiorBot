# Sprint 115: RL Prompt Injection + Async UX Completion

**Sprint Duration**: March 23-25, 2026
**Sprint Goal**: Wire RL prompt enrichment into SOUL agent calls (close feedback loop), inject workspace context into system prompts, and ship Sprint 108 deferred async UX gaps (notifyFn + Zalo bus + bus metrics).
**Status**: PLANNED
**Priority**: P0 (prompt injection, notifyFn) | P1 (workspace context, Zalo bus, bus metrics)
**Framework**: SDLC 6.2.0
**Authority**: Pending CTO review — Sprint 114 completion
**Previous Sprint**: Sprint 114 ✅ — Context-Aware Token Tracking & RL Enrichment
**Related ADRs**: ADR-032 (Event Bus), ADR-033 (RL Training Architecture)
**Tests**: ~18 new tests planned

---

## Background

Sprint 114 delivered the **foundation**: `getPromptEnrichment()` extracts RL patterns from JSONL, `getWorkspaceContext()` reads git state, `/cost` exposes token usage. But the foundation is inert — patterns aren't injected into prompts, workspace context isn't used in agent calls, and Sprint 108's async UX gaps remain open.

Sprint 115 activates the foundation and closes two debts:

1. **RL feedback loop closure**: RL data → SOUL prompt improvement → better responses → more positive feedback → loop
2. **Async UX completion**: CEO gets approval notifications, Zalo gets bus parity, ops gets bus metrics

### CTO Deferred Items (Sprint 114 Review)

| # | Item | Severity | Sprint 115 Action |
|---|------|----------|-------------------|
| C3 | `execSync` blocks event loop in workspace-context.ts | LOW | Document + monitor; async conversion deferred |
| C7 | `provider.includes(agentKey)` too loose in prompt-enrichment.ts | LOW | Fix with exact match or prefix match |

### CPO Advisory Notes (Sprint 114)

| # | Note | Sprint 115 Action |
|---|------|-------------------|
| A1 | Privacy — git context may leak repo info | Add opt-out flag in config |
| A2 | Cost estimates ≠ actuals | Clarify label in /cost output |
| A3 | Token coverage gaps (some providers don't report tokens) | Log warning, don't fail |
| A4 | RL enrichment quality is simplistic | Improve matching in C7 fix |

---

## Sprint 115 Deliverables

### T1: RL Prompt Enrichment Injection (P0, 1d)

**Goal**: Wire `getPromptEnrichment()` output into SOUL agent system prompts. When RL feedback data exists, the agent receives "patterns that work" and "patterns to avoid" in its system prompt.

**Modified Files:**

| # | File | Change |
|---|------|--------|
| 1 | `src/agents/channel-router.ts` | Import `getPromptEnrichment()`, call before `callAI()`, inject into system prompt |
| 2 | `src/rl/prompt-enrichment.ts` | (a) Fix C7: exact agent key match instead of `.includes()`; (b) Add `formatForSystemPrompt()` export |

**New Function:**
```typescript
/**
 * Format prompt enrichment as a compact system prompt section.
 * Returns empty string if no patterns available.
 */
export function formatEnrichmentForPrompt(enrichment: PromptEnrichment): string;
```

**Output format injected into system prompt:**
```
[RL Insights — 42 feedback samples]
Effective patterns: "Trả lời ngắn gọn, đi thẳng vào vấn đề" | "Dùng bullet points cho danh sách"
Avoid: "Giải thích dài dòng" | "Dùng thuật ngữ kỹ thuật khi CEO hỏi business"
```

**C7 Fix** — Replace loose `.includes()` with exact match:
```typescript
// Before (Sprint 114): rec.provider.includes(agentKey)
// After: rec.provider === agentKey || rec.provider?.startsWith(agentKey + "-")
```

**Implementation Notes:**
- Injection point: `callAI()` in channel-router.ts, before building the provider prompt
- Only inject when `enrichment.sampleCount >= 5` (avoid noise from sparse data)
- Max 200 chars for patterns section (truncate if longer)
- Graceful: if enrichment fails, agent call proceeds without it

**AC:**
- Agent calls with RL data include enrichment in system prompt
- Agent calls without RL data work unchanged
- C7 fixed: agent key matching is exact or prefix-based
- `formatEnrichmentForPrompt()` returns empty string for empty data

---

### T2: Workspace Context Integration (P1, 0.5d)

**Goal**: Inject `getWorkspaceContext()` output into agent system prompts. Agent knows what branch, recent commits, and uncommitted changes exist.

**Modified Files:**

| # | File | Change |
|---|------|--------|
| 1 | `src/agents/channel-router.ts` | Import `getWorkspaceContext()` + `formatWorkspaceContext()`, inject into system prompt |
| 2 | `src/bridge/intelligence/turn-context.ts` | Add workspace context to `TurnContext.dynamicContext` |

**Implementation Notes:**
- Use `formatWorkspaceContext()` already exported from Sprint 114
- Inject after RL enrichment section (if both present)
- Only inject for PATCH/INTERACTIVE modes (not READ — CEO browsing doesn't need git context)
- A1 (CPO): Add `ENDIORBOT_DISABLE_WORKSPACE_CONTEXT=1` env var opt-out

**AC:**
- PATCH/INTERACTIVE agent calls include workspace context
- READ-only calls skip workspace context (no noise)
- `ENDIORBOT_DISABLE_WORKSPACE_CONTEXT=1` disables injection
- Non-git directories → no context injected (graceful)

---

### T3: notifyFn — Approval Notifications (P0, 0.75d)

**Goal**: CEO receives immediate Telegram message when agent requests PATCH approval, instead of silence while `waitForApproval()` blocks.

**From Sprint 108 GAP-108-1 — ready to implement.**

**Modified Files:**

| # | File | Change |
|---|------|--------|
| 1 | `src/bus/types.ts` | Add `notifyFn?: ChannelSendFn` to `BusInboundMessage` |
| 2 | `src/bus/consumer.ts` | Thread `msg.notifyFn` → `inbound.metadata.notifyFn` |
| 3 | `src/channels/telegram/telegram-ott-adapter.ts` | Set `busMsg.notifyFn = replyFn` |
| 4 | `src/gateway/ingress.ts` | Extract `notifyFn` from metadata, pass to router |
| 5 | `src/agents/channel-router.ts` | Accept `notifyFn?` in `callAI()`, call in `requestPatchConfirmation()` before `waitForApproval()` |

**Approval message (Telegram):**
```
🔐 *PATCH approval required*
@coder wants to modify files.

Approval ID: `abc-123`
Use /approve abc-123 to allow or /reject abc-123 to cancel.
Expires in 5 min.
```

**AC:**
- CEO sends `@coder implement X` → sees "⏳" → sees approval message → `/approve` → result
- Without bus (sync path): approval message still sent via `notifyFn` param
- Missing `notifyFn` → silent approval (backward compat)

---

### T4: Zalo Bus Wiring (P1, 0.5d)

**Goal**: Zalo channel gets bus async path parity with Telegram (Sprint 106-107).

**From Sprint 108 GAP-108-2.**

**Modified Files:**

| # | File | Change |
|---|------|--------|
| 1 | `src/channels/zalo/zalo-ott-adapter.ts` | Accept optional `bus`, `debounce` params; mirror Telegram bus path |

**Implementation Notes:**
- Pattern: exact copy of Telegram OTT adapter bus path (Sprint 106-107)
- `createZaloOttAdapter(ingress, bus?, debounce?)` — same signature pattern
- `correlationId` generation: `createCorrelationId("zalo", senderId)`
- `replyFn` wraps `channel.send()` with Zalo-specific formatting
- Zalo has no callback_query → no RL keyboard (not needed for now)

**AC:**
- `pnpm build` clean after type change
- Zalo adapter with bus → non-blocking message handling
- Zalo adapter without bus → sync fallback (backward compat)

---

### T5: Bus Metrics in `/api/status` (P1, 0.25d)

**Goal**: Ops visibility into bus processing state.

**From Sprint 108 GAP-108-3.**

**Modified Files:**

| # | File | Change |
|---|------|--------|
| 1 | `src/gateway/server.ts` | Extend `/api/status` to include `bus` section |
| 2 | `src/bus/message-bus.ts` | Add `getStats()` → `{ inboundListeners, outboundListeners }` |

**`/api/status` bus section:**
```json
{
  "bus": {
    "active": true,
    "inboundListeners": 1,
    "outboundListeners": 2,
    "debounce": { "pending": 0, "windowMs": 500 },
    "dedup": { "cacheSize": 42, "maxEntries": 1000, "ttlMs": 1200000 }
  }
}
```

**AC:**
- `GET /api/status` includes bus section when bus is active
- `GET /api/status` returns `"bus": null` when bus is not configured

---

### T6: Tests (0.75d)

| # | Test File | Tests | Coverage |
|---|-----------|-------|----------|
| 1 | `tests/rl/prompt-enrichment-injection.test.ts` | 5 | formatEnrichmentForPrompt, exact match, empty data, truncation, sampleCount threshold |
| 2 | `tests/agents/intelligence/workspace-injection.test.ts` | 3 | READ vs PATCH mode, env opt-out, non-git graceful |
| 3 | `tests/commands/notify-approval.test.ts` | 4 | notifyFn called, message format, missing notifyFn, sync fallback |
| 4 | `tests/channels/zalo/zalo-bus-wiring.test.ts` | 3 | bus path, sync fallback, correlationId format |
| 5 | `tests/gateway/bus-metrics.test.ts` | 3 | bus active, bus null, debounce/dedup stats |

**Total: 18 new tests.**

---

## Files Summary

| Action | File | Est. Lines |
|--------|------|-----------|
| MODIFY | `src/rl/prompt-enrichment.ts` | +30 (formatEnrichmentForPrompt, C7 fix) |
| MODIFY | `src/agents/channel-router.ts` | +35 (inject enrichment + workspace + notifyFn) |
| MODIFY | `src/bridge/intelligence/turn-context.ts` | +10 (workspace context in dynamicContext) |
| MODIFY | `src/bus/types.ts` | +3 (notifyFn) |
| MODIFY | `src/bus/consumer.ts` | +5 (thread notifyFn) |
| MODIFY | `src/bus/message-bus.ts` | +10 (getStats) |
| MODIFY | `src/channels/telegram/telegram-ott-adapter.ts` | +3 (set notifyFn) |
| MODIFY | `src/channels/zalo/zalo-ott-adapter.ts` | +50 (bus path) |
| MODIFY | `src/gateway/ingress.ts` | +10 (extract notifyFn) |
| MODIFY | `src/gateway/server.ts` | +20 (bus metrics) |
| CREATE | `tests/rl/prompt-enrichment-injection.test.ts` | ~60 |
| CREATE | `tests/agents/intelligence/workspace-injection.test.ts` | ~40 |
| CREATE | `tests/commands/notify-approval.test.ts` | ~50 |
| CREATE | `tests/channels/zalo/zalo-bus-wiring.test.ts` | ~40 |
| CREATE | `tests/gateway/bus-metrics.test.ts` | ~40 |

**Total:** 10 modified + 5 test files = 15 files, ~406 lines.

---

## Architecture: RL Feedback Loop (Closed)

```
Sprint 110: Capture     Sprint 114: Extract     Sprint 115: Inject
─────────────────       ──────────────────      ──────────────────
CEO feedback            getPromptEnrichment()   formatEnrichmentForPrompt()
  👍/🔄/👎               ↓                       ↓
  ↓                     RL JSONL → patterns     system prompt += patterns
  RLRecord JSONL        (foundation)            (injection)
                                                  ↓
                                                callAI() with enriched prompt
                                                  ↓
                                                better response → more 👍
                                                  ↓
                                                ─────── LOOP CLOSED ───────
```

---

## Sprint 108 Debt Resolution

| Gap | Sprint 108 Plan | Sprint 115 Deliverable | Status |
|-----|-----------------|----------------------|--------|
| GAP-108-1 | notifyFn threading | T3: Approval Notifications | ✅ Included |
| GAP-108-2 | Zalo bus wiring | T4: Zalo Bus Wiring | ✅ Included |
| GAP-108-3 | Bus metrics | T5: Bus Metrics | ✅ Included |

---

## CTO Constraints

| # | Constraint | Implementation |
|---|-----------|---------------|
| C1 | Enrichment injection must not slow agent calls | Cache-first (10min TTL), async-safe |
| C2 | No new npm dependencies | All built-in (readFileSync, execSync) |
| C3 | `exactOptionalPropertyTypes` | Conditional assignment for notifyFn, tokenUsage |
| C4 | Backward compat | All new params optional, sync fallback preserved |
| C5 | Workspace context opt-out | `ENDIORBOT_DISABLE_WORKSPACE_CONTEXT` env var |
| C6 | Fix Sprint 114 C7 | Exact agent key matching in prompt-enrichment.ts |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| RL data too sparse (<5 records) → no patterns injected | Threshold gate: `sampleCount >= 5` required |
| Prompt injection increases token usage → budget concern | Max 200 chars for enrichment section |
| Zalo bus wiring introduces regressions | Mirror exact Telegram pattern (proven in Sprint 106-107) |
| notifyFn threading touches 5 files | Each file change is ≤5 lines, backward compat via optional param |

---

## Acceptance Criteria

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — no regressions, 18+ new tests
- [ ] T1: Agent calls with RL data include enrichment in system prompt
- [ ] T2: PATCH/INTERACTIVE calls include workspace context
- [ ] T3: CEO receives approval notification before `waitForApproval()` blocks
- [ ] T4: Zalo adapter uses bus for async message handling
- [ ] T5: `/api/status` includes bus metrics
- [ ] Sprint 114 C7 fixed: exact agent key matching

---

## Definition of Done

- [ ] All 5 deliverables + tests implemented
- [ ] 18+ new tests across 5 test files
- [ ] Sprint doc updated with final status
- [ ] Sprint 108 debt fully resolved
- [ ] RL feedback loop verified end-to-end
- [ ] CTO review score >= 8/10

---

## Deferred to Sprint 116+

| Item | Rationale |
|------|-----------|
| `execSync` → async in workspace-context.ts (C3) | Low impact, monitor first |
| RL kill criteria dashboard | Needs more data collection time |
| Redis MessageBus upgrade | Infrastructure sprint scope |
| A/B test mechanism for enrichment | Needs baseline data from Sprint 115 |
| ClawVault memory pruning | Separate concern, not on critical path |

---

**Created by**: @pm
**Date**: 2026-03-22
**Sprint 114 Handoff**: Token tracking + workspace context + /cost + RL enrichment foundation ✅
