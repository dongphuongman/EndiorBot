# Sprint 108: Async Notifications — notifyFn + Zalo Bus + Metrics

**Sprint Duration**: March 2026
**Sprint Goal**: Close the three remaining async UX gaps from Sprint 107 deferral — CEO gets Telegram feedback on pending PATCH approvals, Zalo has channel parity with Telegram (bus + debounce), and ops has bus visibility via `/api/status`
**Status**: PLANNED
**Priority**: P0 (notifyFn, Zalo bus, metrics) | P1 (web channel async path)
**Framework**: SDLC 6.1.2
**Authority**: CTO Sprint 107 APPROVED — "Sprint 108 authorized"
**Previous Sprint**: Sprint 107 COMPLETE — Bus Reliability (CTO 9.5/10 APPROVED)
**ADR**: [ADR-032](../../02-design/01-ADRs/ADR-032-Event-Bus-Async-Command.md) Sprint 108 Extensions

---

## Background

Sprint 107 shipped `BusDebounce` + `BusDedup` + consumer dedup guard (22 new tests). Three P1 items were deferred to Sprint 108:

| Gap | Symptom | Root Cause |
|-----|---------|------------|
| **GAP-108-1** | CEO sends `@coder implement X` → sees "⏳" → then silence for 5 min (pending PATCH approval) | `requestPatchConfirmation()` in `channel-router.ts` awaits `waitForApproval()` silently — no Telegram feedback |
| **GAP-108-2** | Zalo users get sync-blocked AI calls (same pre-Sprint 106 problem that Telegram had) | `zalo-ott-adapter.ts` has no bus path — still calls `ingress.handleInbound()` directly |
| **GAP-108-3** | No way to see if bus is processing messages or if debounce/dedup is firing | `bus.getStats()` exists but `/api/status` doesn't expose it |

---

## Sprint 108 Deliverables

### P0-1: `notifyFn` Approval Notification

**Problem:** When `@coder implement X` triggers a PATCH confirmation request (confidence ≥ 0.8), the CEO receives "⏳ @coder đang xử lý..." immediately, then nothing for up to 5 minutes while `waitForApproval()` blocks. CEO has no idea if the bot is waiting for `/approve` or crashed.

**Solution:** Thread a `notifyFn?: ChannelSendFn` through the bus message → ingress metadata → channel router → `requestPatchConfirmation()`. Immediately after `createApprovalRequest()`, call `notifyFn` with the approval pending message — before `waitForApproval()` blocks.

**Approval message format (Telegram markdown):**
```
🔐 *PATCH approval required*
@coder wants to modify files.

Approval ID: `abc-123`
Use /approve abc-123 to allow or /reject abc-123 to cancel.
Expires in 5 min.
```

**Files changed:**

| # | File | Change |
|---|------|--------|
| 1 | `src/bus/types.ts` | Add `notifyFn?: ChannelSendFn` to `BusInboundMessage` |
| 2 | `src/bus/consumer.ts` | Thread `msg.notifyFn` → `inbound.metadata.notifyFn` (exactOptionalPropertyTypes guard) |
| 3 | `src/channels/telegram/telegram-ott-adapter.ts` | Set `busMsg.notifyFn = replyFn` (same `channel.send` wrapper already used for `replyFn`) |
| 4 | `src/gateway/ingress.ts` | Extract `notifyFn` from `msg.metadata` before `router.callAI()`, pass as optional param |
| 5 | `src/agents/channel-router.ts` | (a) Add optional `notifyFn?` to `callAI()` signature; (b) pass to `requestPatchConfirmation()`; (c) in `requestPatchConfirmation()` call `notifyFn?.(approvalMessage)` immediately after `createApprovalRequest()` |

**Implementation pattern (channel-router.ts):**
```typescript
// callAI() signature — add optional 4th param
async callAI(
  agent: string,
  task: string,
  history?: Array<{role: string; content: string}>,
  workspace?: string,
  notifyFn?: ChannelSendFn,        // NEW — Sprint 108
): Promise<AIResult>

// requestPatchConfirmation() — add notifyFn param, call after createApprovalRequest
private async requestPatchConfirmation(
  agent: string,
  task: string,
  intent: { confidence: number; reason: string },
  workspace?: string,
  notifyFn?: ChannelSendFn,        // NEW — Sprint 108
): Promise<boolean> {
  const approvalRequest = createApprovalRequest(/* ... */);

  // NEW: notify CEO immediately (before waitForApproval blocks)
  if (notifyFn) {
    const notifyText =
      `🔐 *PATCH approval required*\n` +
      `@${agent} wants to modify files.\n\n` +
      `Approval ID: \`${approvalRequest.id}\`\n` +
      `Use /approve ${approvalRequest.id} to allow or /reject ${approvalRequest.id} to cancel.\n` +
      `Expires in 5 min.`;
    notifyFn(notifyText, { format: "markdown" }).catch(() => {}); // fire-and-forget
  }

  // ... existing waitForApproval() flow unchanged
```

**Backward compat:** `notifyFn` is optional on all signatures. All existing tests pass unmodified. When `bus=undefined` (sync path), `notifyFn` is absent — notification not sent (no regression vs current behavior).

---

### P0-2: Zalo Bus Wiring + Debounce

**Problem:** `createZaloOttAdapter()` calls `ingress.handleInbound()` directly — same blocking pattern Telegram had before Sprint 106. Zalo polling loop blocks for 30–120s during AI calls.

**Solution:** Mirror Sprint 107's Telegram changes for the Zalo adapter. Add optional `bus?: IMessageBus` and `debounce?: BusDebounce` params. When `bus` present: async path with `bus.publishInbound()`. When absent: sync fallback (backward compat).

**Files changed:**

| # | File | Change |
|---|------|--------|
| 1 | `src/channels/zalo/zalo-ott-adapter.ts` | Add optional `bus?: IMessageBus`, `debounce?: BusDebounce` params; add async bus path mirroring Telegram Sprint 107 pattern; add `dedupKey` to metadata |
| 2 | `src/cli/commands/serve.ts` | Pass `bus, busDebounce` to `createZaloOttAdapter()` |

**Adapter signature change:**
```typescript
export function createZaloOttAdapter(
  ingress: GatewayIngress,
  bus?: IMessageBus,           // NEW — Sprint 108
  debounce?: BusDebounce,      // NEW — Sprint 108
): OttAdapter | null
```

**Zalo-specific constraints vs Telegram:**
- `ZALO_MAX_LEN = 2000` (vs Telegram 4096) — `replyFn` must call `truncateForZalo()`
- `stripMarkdown()` applied in `replyFn` (Zalo is plain text only)
- Progress message: `"⏳ @{agent} đang xử lý..."` (same as Telegram, no bold/markdown)
- `dedupKey`: `"zalo-${msg.message_id}"` (format mirrors Telegram's `"telegram-${messageId}"`)

**BusInboundMessage construction (Zalo):**
```typescript
const replyFn: ChannelSendFn = async (text, _opts) => {
  // Zalo: strip markdown + truncate in replyFn
  const plainText = stripMarkdown(text);
  const formatted = truncateForZalo(plainText);
  return sendMessage(token, { chat_id: msg.chat.id, text: formatted })
    .then((r) => r.ok ?? false)
    .catch(() => false);
};

const busMsg: BusInboundMessage = {
  correlationId: createCorrelationId("zalo", msg.from.id),
  channel: "zalo",
  senderId: msg.from.id,
  content: msg.text,
  enqueuedAt: Date.now(),
  replyFn,
  metadata: {
    chatId: msg.chat.id,
    messageId: msg.message_id,
    chatType: msg.chat.chat_type,
    dedupKey: `zalo-${msg.message_id}`,
  },
};
```

---

### P0-3: Bus Metrics in `/api/status`

**Problem:** `bus.getStats()` returns `{ totalInbound, totalOutbound, inFlight, startedAt }` but `/api/status` doesn't expose it — ops has no visibility into bus health.

**Solution:** Extend `GatewayServer`'s `/api/status` HTTP handler to accept an optional `IMessageBus` reference and include `bus.getStats()` in the response.

**Files changed:**

| # | File | Change |
|---|------|--------|
| 1 | `src/gateway/server.ts` | Add optional `bus?: IMessageBus` to `GatewayServer` constructor (or `setBus(bus)` method); include `bus.getStats()` in `/api/status` response |
| 2 | `src/cli/commands/serve.ts` | Pass `bus` to `GatewayServer` after construction |

**Design choice — `setBus()` method (preferred over constructor param):**
Avoids changing the `GatewayServer` constructor signature (used in 10+ tests). A `setBus(bus: IMessageBus): void` method is additive and test-safe.

**Extended `/api/status` response:**
```json
{
  "ok": true,
  "activeConnections": 1,
  "uptimeSec": 3600,
  "serverVersion": "1.0.0",
  "bus": {
    "totalInbound": 42,
    "totalOutbound": 41,
    "inFlight": 1,
    "startedAt": 1741737600000
  }
}
```

When `bus` not set (e.g., tests not wiring bus): `"bus": null` — no breaking change.

---

### P1: Web Channel Async Path (Scope-Conditional)

**Problem:** `router-chat.ts` (web channel via WebSocket JSON-RPC) calls `await ingress.handleInbound()` — same blocking pattern. Web UI users may see 30–120s response times.

**Complexity:** Unlike Telegram/Zalo (fire-and-forget), the web channel uses JSON-RPC request-response. Making it truly async requires a correlationId + deferred Promise pattern (publish to bus → resolve promise when `bus.onOutbound` fires with matching correlationId). This is a non-trivial change.

**Decision:** Include in Sprint 108 only if P0 items complete early. Otherwise defer to Sprint 109.

**If included:**
- `registerRouterChatMethods()` gains optional `bus?: IMessageBus` param
- On bus path: generate `correlationId` → `bus.publishInbound()` → return a Promise that resolves when `bus.onOutbound(correlationId)` fires → unsubscribe
- 3s timeout safeguard: if no outbound event received in 3s, fall back to sync path

---

## Test Plan (15 new tests)

### `tests/bus/notify-fn.test.ts` (5 tests — P0-1)

| # | Test |
|---|------|
| T1 | `requestPatchConfirmation()` calls `notifyFn` with approval ID in message immediately after `createApprovalRequest()` |
| T2 | `notifyFn` called BEFORE `waitForApproval()` resolves (fire-and-forget) |
| T3 | `notifyFn` absent → `requestPatchConfirmation()` proceeds normally (backward compat) |
| T4 | `notifyFn` throws → error absorbed (`.catch(() => {})` guard) |
| T5 | `BusConsumer` threads `msg.notifyFn` to `inbound.metadata.notifyFn` (exactOptionalPropertyTypes — only when present) |

### `tests/channels/zalo/zalo-bus.test.ts` (7 tests — P0-2)

| # | Test |
|---|------|
| T6 | With `bus`: adapter calls `bus.publishInbound()` and returns immediately (async path) |
| T7 | With `bus=undefined`: adapter calls `ingress.handleInbound()` directly (sync fallback) |
| T8 | `replyFn` applies `stripMarkdown()` + `truncateForZalo()` on response text |
| T9 | `dedupKey` set to `"zalo-${messageId}"` on bus message |
| T10 | With `debounce`: rapid messages from same sender → only last published |
| T11 | With `debounce=undefined`: all messages published immediately |
| T12 | Error in `replyFn` → `bus.publishOutbound({ isError: true })` published |

### `tests/gateway/bus-metrics.test.ts` (3 tests — P0-3)

| # | Test |
|---|------|
| T13 | `/api/status` response includes `bus` stats when `setBus()` called |
| T14 | `/api/status` response has `"bus": null` when `setBus()` not called |
| T15 | `bus.inFlight` count reflects in-progress messages via `/api/status` |

---

## Constraints

- `exactOptionalPropertyTypes`: build objects first, conditionally assign `notifyFn` only when present
- `notifyFn` is non-serializable (function) — acceptable for in-process; Sprint 110 Redis upgrade replaces with `notifyAddress` + registry pattern
- All Sprint 108 params are optional — backward compat for all 223 existing tests (zero modifications to existing tests)
- `notifyFn` call in `requestPatchConfirmation()` is fire-and-forget — `.catch(() => {})` guard prevents unhandledRejection if channel is down
- Zalo `replyFn` applies `stripMarkdown()` + `truncateForZalo()` — different from Telegram `replyFn` which uses `truncateForTelegram()` only
- `GatewayServer.setBus()` is additive — constructor signature unchanged

---

## Files Created/Modified

| # | File | Change |
|---|------|--------|
| 1 | `src/bus/types.ts` | ADD `notifyFn?: ChannelSendFn` to `BusInboundMessage` |
| 2 | `src/bus/consumer.ts` | Thread `msg.notifyFn` → `inbound.metadata.notifyFn` |
| 3 | `src/channels/telegram/telegram-ott-adapter.ts` | SET `busMsg.notifyFn = replyFn` |
| 4 | `src/gateway/ingress.ts` | Extract `notifyFn` from metadata, pass to `router.callAI()` |
| 5 | `src/agents/channel-router.ts` | Thread `notifyFn` through `callAI()` → `requestPatchConfirmation()` |
| 6 | `src/channels/zalo/zalo-ott-adapter.ts` | ADD bus async path + debounce (Sprint 107 Telegram pattern) |
| 7 | `src/gateway/server.ts` | ADD `setBus()` method, expose `bus.getStats()` in `/api/status` |
| 8 | `src/cli/commands/serve.ts` | Wire `notifyFn` + Zalo bus + `server.setBus(bus)` |
| 9 | `tests/bus/notify-fn.test.ts` | NEW — 5 tests |
| 10 | `tests/channels/zalo/zalo-bus.test.ts` | NEW — 7 tests |
| 11 | `tests/gateway/bus-metrics.test.ts` | NEW — 3 tests |

---

## Definition of Done

- [ ] `pnpm build` — clean, zero new type errors
- [ ] 15 new tests pass (`tests/bus/notify-fn.test.ts`, `tests/channels/zalo/zalo-bus.test.ts`, `tests/gateway/bus-metrics.test.ts`)
- [ ] All 223 existing bus/channel/gateway tests pass (no regressions)
- [ ] Manual: `@coder implement X` on Telegram → CEO receives "🔐 PATCH approval required" message with approval ID immediately (not after 5 min wait)
- [ ] Manual: Zalo bot configured → messages use async bus path (check log `"[ZaloOTT] Bus path active"`)
- [ ] Manual: `GET /api/status` response includes `bus.totalInbound` + `bus.inFlight` fields

---

## Sprint 109 Preview

After Sprint 108:
1. **Web channel async path** (deferred P1): correlationId-based request-response over bus for `router-chat.ts`
2. **`/fix` compliance async ACK**: `handleFixCommand()` publishes immediate progress message + full result when engine completes (requires `isProgress=true` from `BusConsumer`)
3. **Bus persistence** (Redis path): `RedisBus implements IMessageBus` for multi-process deployment

---

**Last Updated**: 2026-03-12 (by @pm — Sprint 107 CTO handoff)
