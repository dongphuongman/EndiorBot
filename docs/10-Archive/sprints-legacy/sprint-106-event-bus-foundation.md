# Sprint 106: Event Bus Foundation

**Sprint Duration**: TBD
**Sprint Goal**: Decouple Telegram polling from AI processing — fix the 30–120s polling loop block
**Status**: PLANNED
**Priority**: P0 (Critical Infrastructure)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED WITH CONDITIONS (C1 RESOLVED, C2 non-blocking)
**Previous Sprint**: Sprint 105 COMPLETE — Mode-Aware Agent Routing (ADR-031 IMPLEMENTED)
**Tests**: 20 new bus tests
**ADR**: [ADR-032](../../02-design/01-ADRs/ADR-032-Event-Bus-Async-Command.md)

---

## Background

After Sprints 103–105 close all 5 ADR-031 gaps (commands × channels), one architectural ceiling remains:

**GAP-ARCH-001**: EndiorBot's dispatch is fully synchronous. `GatewayIngress.handleInbound()` awaits AI responses (30–120s), blocking the Telegram polling loop. During this time:
- No new Telegram messages can be polled (bot appears dead to CEO)
- `requestPatchConfirmation()` (Sprint 105) blocks the HTTP handler for up to 5 minutes
- `/fix` dry-runs (30–60s) hold up the event loop

**MTClaw reference:** `internal/bus/bus.go` solves this with a Go channels-based MessageBus. The pattern: publish message to bus (non-blocking) → consumer goroutine processes async → reply via channel-specific `Send()`.

Sprint 106 adapts this pattern to Node.js/TypeScript: `EventEmitterBus` + `BusConsumer` + `replyFn` callback.

---

## System Architecture — Sprint 106 Changes

```
BEFORE (Sprint 105):
  @coder fix the auth bug
    → TelegramOTT.onMessage()
    → await ingress.handleInbound()   ← BLOCKS 30-120s
    → channel.send(response)
    [Polling loop BLOCKED during AI call]

AFTER (Sprint 106):
  @coder fix the auth bug
    → TelegramOTT.onMessage()
    → bus.publishInbound(msg)         ← RETURNS IMMEDIATELY
    → [polling loop continues for next messages]

  BusConsumer (async):
    → ingress.handleInbound()         ← processes in background
    → msg.replyFn(response)           ← sends via Telegram proactive send
    → bus.publishOutbound(msg)        ← WebSocket broadcast for Web UI
```

---

## CTO Review Conditions

| # | Type | Condition | Resolution |
|---|------|-----------|------------|
| C1 | 🔴 Blocker | `replyFn()` in catch block can throw → `unhandledRejection` → process crash (Node ≥ v15) | Wrap `replyFn()` in inner try-catch inside error handler: `try { await msg.replyFn(...); } catch {}` + move `inbound` construction inside outer try |
| C2 | 🟡 Non-blocking | Progress `channel.send()` before `publishInbound()` is unguarded — if Telegram API throws, adapter polling loop crashes | Use fire-and-forget: `channel.send(...).catch(() => {})` — don't let network hiccup block enqueue |

---

## Sprint 106 Deliverables

| # | Deliverable | Status |
|---|------------|--------|
| 1 | `src/bus/types.ts` — `IMessageBus`, `BusInboundMessage`, `BusOutboundMessage`, `BusStats`, `ChannelSendFn` | PLANNED |
| 2 | `src/bus/message-bus.ts` — `EventEmitterBus`, `getMessageBus()` singleton, `createCorrelationId()` | PLANNED |
| 3 | `src/bus/consumer.ts` — `BusConsumer` with fire-and-forget `_process()`, C1 guarded | PLANNED |
| 4 | `src/bus/index.ts` — barrel export | PLANNED |
| 5 | `src/gateway/types.ts` — add `"bus.response"` to `GatewayEventType` union | PLANNED |
| 6 | `src/channels/telegram/telegram-ott-adapter.ts` — optional `bus?: IMessageBus` param, async publish path with C2 guard, sync fallback | PLANNED |
| 7 | `src/cli/commands/serve.ts` — wire `getMessageBus()`, `BusConsumer.start()`, outbound→WebSocket bridge | PLANNED |
| 8 | `docs/02-design/01-ADRs/ADR-032-Event-Bus-Async-Command.md` — fill in full decision from stub | PLANNED |
| 9 | `tests/bus/message-bus.test.ts` — 10 tests | PLANNED |
| 10 | `tests/bus/consumer.test.ts` — 7 tests | PLANNED |
| 11 | `tests/bus/async-telegram.test.ts` — 3 tests | PLANNED |

---

## ADR-032 Technology Decision

**Technology: In-Process Node.js `EventEmitter`**

| Factor | Assessment |
|--------|-----------|
| Process model | Single-process CEO tool — no horizontal scaling in MVP |
| Codebase convention | Module-level singletons already used (`setGatewayServer`, `approvalQueue`, `turnCounters`). `getMessageBus()` follows same pattern exactly |
| Dependencies | Zero external deps — no Redis, no startup ordering complexity |
| Upgrade path | `IMessageBus` interface isolates implementation. `RedisBus` swaps in for Sprint 110+ multi-process if needed |

**Not chosen:** Redis pub/sub — adds external process dependency, startup ordering, connection management for zero benefit at current scale.

---

## Design: Key Types

### `BusInboundMessage`

Extends `InboundMessage` with bus-specific routing metadata:

| Field | Type | Purpose |
|-------|------|---------|
| `correlationId` | `string` | Ties inbound request to async outbound response |
| `channel` | `string` | `"telegram"`, `"web"`, etc. |
| `senderId` | `string` | Channel-specific user ID |
| `content` | `string` | Message text |
| `metadata?` | `Record<string, unknown>` | chatId, messageId, username |
| `enqueuedAt` | `number` | Timestamp when published to bus |
| `replyFn` | `ChannelSendFn` | Channel-specific send callback (called by BusConsumer) |

### `IMessageBus` interface

Decouples in-process EventEmitter from future Redis upgrade:

```typescript
interface IMessageBus {
  publishInbound(msg: BusInboundMessage): void;
  publishOutbound(msg: BusOutboundMessage): void;
  onInbound(handler: (msg: BusInboundMessage) => void): void;
  onOutbound(handler: (msg: BusOutboundMessage) => void): void;
  offInbound(handler: (msg: BusInboundMessage) => void): void;
  offOutbound(handler: (msg: BusOutboundMessage) => void): void;
  getStats(): BusStats;
  reset(): void;
}
```

### `replyFn` design note (CTO-acknowledged limitation)

`replyFn` is a function — non-serializable. This means `BusInboundMessage` cannot be serialized to Redis for multi-process use. **Accepted for Sprint 106 in-process MVP.** Sprint 107 Redis upgrade replaces `replyFn` with `replyAddress: { channel: string; chatId: string }` + registry lookup.

---

## BusConsumer._process() — CTO C1 Resolution

```typescript
private async _process(msg: BusInboundMessage): Promise<void> {
  const inbound: InboundMessage = {
    channel: msg.channel,
    senderId: msg.senderId,
    content: msg.content,
  };
  if (msg.metadata !== undefined) inbound.metadata = msg.metadata;

  try {
    const response = await this.ingress.handleInbound(inbound);

    const sendOpts: { format?: string } = {};
    if (response.format) sendOpts.format = response.format;
    await msg.replyFn(response.text, sendOpts);

    const outbound: BusOutboundMessage = { correlationId: msg.correlationId, text: response.text };
    if (response.format) outbound.format = response.format;
    if (response.metadata) outbound.processingMeta = response.metadata;
    this.bus.publishOutbound(outbound);

  } catch (err) {
    // CTO C1: Guard replyFn() — Telegram may be down, bot blocked, etc.
    // Inner try-catch prevents unhandledRejection from crashing Node.js ≥ v15
    try { await msg.replyFn("Internal error. Please try again."); } catch {}
    this.bus.publishOutbound({ correlationId: msg.correlationId, text: "Internal error.", isError: true });
  }
}
```

---

## Telegram OTT Adapter — Async Path with C2 Guard

```typescript
if (bus) {
  // Best-effort progress (CTO C2: don't block enqueue on Telegram API error)
  const agentMatch = rawText.match(/^@(\w+)/);
  if (agentMatch) {
    const agentName = agentMatch[1] ?? "agent";
    const model = getAgentModel(agentName) ?? "sonnet";
    channel.send(`⏳ @${agentName} đang xử lý... (${model})`).catch(() => {});
  }

  bus.publishInbound(busMsg);  // Non-blocking — returns immediately
  return;
}
```

---

## Backward Compatibility Invariants

1. **`GatewayIngress.handleInbound()` signature unchanged** — all 65+ existing tests pass
2. **`createTelegramOttAdapter(ingress)` (without bus) still works** — sync fallback path unchanged
3. **`createCommandDispatcher()` unchanged** — no command registration changes
4. **`GatewayEventType` addition is additive** — existing subscriptions unaffected
5. **Bus is optional enhancement** — if not wired in tests, all components work exactly as before

---

## Test Plan (20 new tests)

### `tests/bus/message-bus.test.ts` (10 tests)

| T# | Assertion |
|----|-----------|
| T1 | `publishInbound()` calls registered `onInbound` handler with correct msg |
| T2 | `publishOutbound()` calls registered `onOutbound` handler with correct msg |
| T3 | Multiple `onInbound` subscribers all receive the same message |
| T4 | `offInbound()` removes only the specified handler; others still receive |
| T5 | `getStats()` tracks `totalInbound`/`totalOutbound` correctly |
| T6 | `inFlight` increases on publishInbound, decreases on final publishOutbound |
| T7 | `isProgress=true` publishOutbound does NOT decrement `inFlight` |
| T8 | `reset()` clears all listeners and resets stats to zero |
| T9 | `createCorrelationId()` returns `"${channel}-${senderId}-${timestamp}"` format |
| T10 | `getMessageBus()` returns same instance; `resetMessageBus()` creates fresh instance |

### `tests/bus/consumer.test.ts` (7 tests)

| T# | Assertion |
|----|-----------|
| T11 | `start()` registers on `onInbound`; `stop()` removes it (handler not called after stop) |
| T12 | Consumer calls `ingress.handleInbound()` with correct translated `InboundMessage` |
| T13 | Consumer calls `msg.replyFn()` with response text and format |
| T14 | Consumer publishes `BusOutboundMessage` to bus after `handleInbound()` resolves |
| T15 | On `handleInbound()` rejection: `replyFn("Internal error...")` called; `isError=true` published; `replyFn` throwing inside catch does NOT produce `unhandledRejection` |
| T16 | `metadata` optional prop conditionally assigned only when present (`exactOptionalPropertyTypes`) |
| T17 | Consumer is fire-and-forget: calling `start()` + `publishInbound()` returns synchronously before handler resolves |

### `tests/bus/async-telegram.test.ts` (3 tests)

| T# | Assertion |
|----|-----------|
| T18 | With `bus` provided: adapter calls `bus.publishInbound()` and onMessage handler returns before `ingress.handleInbound()` resolves |
| T19 | With `bus=undefined`: adapter still awaits `ingress.handleInbound()` (backward compat) |
| T20 | `replyFn` registered in bus message calls `channel.send()` with truncated + formatted text |

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| T1 | Create `src/bus/types.ts` | 30m |
| T2 | Create `src/bus/message-bus.ts` + singleton | 1h |
| T3 | Create `src/bus/consumer.ts` with CTO C1 fix | 1h |
| T4 | Create `src/bus/index.ts` | 15m |
| T5 | Modify `src/gateway/types.ts` — add `"bus.response"` | 15m |
| T6 | Modify `telegram-ott-adapter.ts` — async bus path + C2 guard | 1.5h |
| T7 | Modify `serve.ts` — wire bus + consumer + outbound→WebSocket | 1h |
| T8 | Update ADR-032 | 30m |
| T9 | Write 20 tests | 3h |
| T10 | `pnpm build && pnpm test` | 30m |

**Total: ~10h**

---

## Definition of Done

- [ ] `src/bus/` module: `types.ts`, `message-bus.ts`, `consumer.ts`, `index.ts`
- [ ] `BusConsumer._process()` fully guards replyFn in catch (CTO C1)
- [ ] Telegram adapter async path: progress message is best-effort `.catch(() => {})` (CTO C2)
- [ ] `createTelegramOttAdapter(ingress)` (without bus) still works — sync fallback
- [ ] `"bus.response"` added to `GatewayEventType`
- [ ] `serve.ts` wires bus + consumer + outbound→WebSocket broadcast
- [ ] 20 new tests passing
- [ ] All 65+ existing tests still pass
- [ ] `pnpm build && pnpm test` passes
- [ ] ADR-032 status: STUB → ACCEPTED

---

## Files Modified/Created

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/bus/types.ts` | T1 | New: `IMessageBus`, `BusInboundMessage`, `BusOutboundMessage`, `BusStats`, `ChannelSendFn` |
| 2 | `src/bus/message-bus.ts` | T2 | New: `EventEmitterBus`, `getMessageBus()`, `resetMessageBus()`, `createCorrelationId()` |
| 3 | `src/bus/consumer.ts` | T3 | New: `BusConsumer` with CTO C1 guarded `_process()` |
| 4 | `src/bus/index.ts` | T4 | New: barrel export |
| 5 | `src/gateway/types.ts` | T5 | Add `"bus.response"` to `GatewayEventType` |
| 6 | `src/channels/telegram/telegram-ott-adapter.ts` | T6 | Add optional `bus` param, async publish path, C2 best-effort send |
| 7 | `src/cli/commands/serve.ts` | T7 | Wire bus, consumer, outbound→WebSocket |
| 8 | `docs/02-design/01-ADRs/ADR-032-Event-Bus-Async-Command.md` | T8 | Fill decision |
| 9 | `tests/bus/message-bus.test.ts` | T9 | New: 10 tests |
| 10 | `tests/bus/consumer.test.ts` | T9 | New: 7 tests |
| 11 | `tests/bus/async-telegram.test.ts` | T9 | New: 3 tests |

---

## Sprint 107 Preview: Command Async Migration

Sprint 106 builds the foundation. Sprint 107 migrates the two most blocking commands:

1. **`requestPatchConfirmation()` async** — currently `waitForApproval()` polls for 5 min, blocking HTTP. Sprint 107: publish to bus → `/approve` resolves via event → `replyFn()` delivers result.
2. **`/fix` dry-run async** — ACK immediately `"Compliance check running..."` → push result when done.
3. **Bus debounce** — merge rapid consecutive messages from same `senderId` within 500ms (MTClaw `inbound_debounce.go`).
4. **Bus dedup** — TTL cache (20min, 1000 max) prevents double-processing from webhook retries (MTClaw `dedupe.go`).

---

**Last Updated**: 2026-03-12 (by @pm — CTO C1/C2 addressed)
