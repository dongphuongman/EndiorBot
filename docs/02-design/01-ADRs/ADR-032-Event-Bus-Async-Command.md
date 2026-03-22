# ADR-032: Event Bus for Async Command Execution

**Status**: ACCEPTED — Sprint 106
**Date**: 2026-03-12
**Sprint**: 106
**Author**: @cto (Directive) + @pm + @architect (Joint Analysis — MTClaw Reference)

---

## Context

EndiorBot's current command dispatch is synchronous: `Channel → CommandDispatcher → handler → direct execution`. This works for Sprint 103-105 scope but hits a ceiling:

1. **Telegram polling loop blocked**: `telegram-ott-adapter.ts:124` awaits `ingress.handleInbound()` which takes 30–120s for AI calls. During this time no new Telegram messages can be polled — the bot appears dead to the CEO.
2. **`requestPatchConfirmation()` blocks HTTP handler** for up to 5 minutes (Sprint 105 approved flow).
3. **No streaming progress** during long `/fix` dry-runs (30–60s).

**MTClaw architecture reference** (`internal/bus/bus.go`): Go channels-based MessageBus with consumer goroutine — `Channel → PublishInbound() [non-blocking] → consumer → channel.Send()`. This decouples channel polling from execution.

---

## Decision

**Adopt in-process Node.js `EventEmitter` as the Sprint 106 message bus.**

### Technology rationale

| Factor | Assessment |
|--------|-----------|
| Process model | Single-process, single-user CEO tool — no horizontal scaling in MVP |
| Codebase convention | Module-level singletons already used (`setGatewayServer`, `approvalQueue`, `turnCounters`). `getMessageBus()` follows the same pattern |
| Dependencies | Zero external deps — no Redis, no startup ordering complexity |
| Immediate value | Fixes Telegram polling timeout (P0) without any infrastructure changes |

**Not chosen:** Redis pub/sub. Adds external process dependency, startup ordering, connection management for zero benefit at current scale.

### Redis upgrade path

`IMessageBus` interface isolates the implementation (defined in `src/bus/types.ts`). When multi-process is needed (Sprint 110+), `RedisBus implements IMessageBus` swaps in. Zero changes to:
- `GatewayIngress` (doesn't know about the bus)
- Channel adapters (use `IMessageBus` interface, not concrete class)
- `BusConsumer` (depends on `IMessageBus`, not `EventEmitterBus`)

### Async delivery mechanism

- **Channel delivery**: `replyFn: ChannelSendFn` on `BusInboundMessage` — direct callback called by `BusConsumer` after processing. No registry needed for in-process use.
- **WebSocket broadcast**: `bus.onOutbound()` handler in `serve.ts` broadcasts `"bus.response"` events to connected Web UI clients.

### Backward compatibility

`GatewayIngress.handleInbound()` signature is **UNCHANGED**. All 65+ existing tests pass without modification. Bus is an optional enhancement layer — components work correctly if bus is not provided.

---

## Architecture

```
BEFORE (sync, blocks polling):
  Telegram → onMessage() → await ingress.handleInbound() [30-120s] → channel.send()

AFTER (async, non-blocking):
  Telegram → onMessage() → bus.publishInbound(msg) → RETURN IMMEDIATELY
    [BusConsumer async]:
      bus.onInbound(msg) → ingress.handleInbound() → msg.replyFn() [Telegram proactive send]
                                                    → bus.publishOutbound() [WebSocket broadcast]
```

### Components (MTClaw alignment)

| EndiorBot Component | File | MTClaw Equivalent |
|--------------------|------|-------------------|
| `EventEmitterBus` | `src/bus/message-bus.ts` | `MessageBus` (Go channels) |
| `BusInboundMessage` | `src/bus/types.ts` | `InboundMessage` struct |
| `BusConsumer` | `src/bus/consumer.ts` | `consumeInboundMessages()` goroutine |
| `bus.onOutbound()` in `serve.ts` | `src/cli/commands/serve.ts` | `dispatchOutbound()` goroutine |
| `replyFn` | `src/bus/types.ts` | `channel.Send()` in channel manager |

---

## Key Design Decisions

### `replyFn` vs registry

`BusInboundMessage.replyFn: ChannelSendFn` is a function pointer registered by the channel adapter when publishing. `BusConsumer` calls it directly after processing.

**Trade-off**: Non-serializable (function) — cannot be stored in Redis.
**Accepted**: In-process MVP. Sprint 107+ Redis upgrade replaces with `replyAddress: { channel, chatId }` + channel manager registry.

### CTO C1 (RESOLVED): `replyFn` guard in catch block

`BusConsumer._process()` wraps `replyFn()` in an inner try-catch inside the error handler:

```typescript
} catch (err) {
  try { await msg.replyFn("Internal error. Please try again."); } catch {}
  // ...
}
```

Rationale: If `replyFn` throws (Telegram down, bot blocked, network error), an unguarded throw inside `catch` would become an `unhandledRejection` in the fire-and-forget `void this._process(msg)` call chain. In Node.js ≥ v15, `unhandledRejection` crashes the process by default.

### CTO C2 (RESOLVED): Best-effort progress message

In `telegram-ott-adapter.ts`, the progress message before `publishInbound()` uses `.catch(() => {})`:

```typescript
channel.send(`⏳ @${agentName} đang xử lý...`).catch(() => {});
bus.publishInbound(busMsg);  // non-blocking
```

Rationale: If Telegram API throws before enqueue (network blip), an unguarded `await channel.send()` would crash the `onMessage` handler and stop the adapter's polling loop entirely.

---

## Consequences

### Positive

- Telegram polling loop no longer blocked during AI calls — bot stays responsive to CEO
- `GatewayIngress.handleInbound()` unchanged — zero regression risk
- Web UI clients receive async responses via `"bus.response"` WebSocket events
- Foundation for Sprint 107 async migration of `requestPatchConfirmation()` and `/fix`

### Negative (accepted)

- `replyFn` is non-serializable — Redis upgrade requires additional refactor in Sprint 110+
- `reset()` does not update `BusConsumer._started` flag — always recreate `BusConsumer` after `resetMessageBus()` in tests
- Out-of-order responses possible if same user sends rapid consecutive messages (mitigated by Sprint 107 debounce)

---

## Sprint 107+ Extensions

| Feature | Sprint | Description |
|---------|--------|-------------|
| `requestPatchConfirmation()` async | 107 | Unblock HTTP handler; resolve via `/approve` event |
| `/fix` dry-run async | 107 | ACK immediately, push result when done |
| Bus debounce | 107 | MTClaw `inbound_debounce.go` — merge rapid messages from same sender (500ms) |
| Bus dedup | 107 | MTClaw `dedupe.go` — TTL cache (20min, 1000 max) for webhook retries |
| Redis bus | 110+ | `RedisBus implements IMessageBus` for multi-process |

---

## Related

- [ADR-031](ADR-031-Channel-Command-Feature-Matrix.md) — Channel × Command Feature Matrix (IMPLEMENTED)
- [ADR-030](ADR-030-Unified-Command-Architecture.md) — Unified Command Architecture
- MTClaw `internal/bus/` architecture (Go reference, Sprint 33)
- [Sprint 106](../../04-build/sprints/sprint-106-event-bus-foundation.md) — Implementation

---

*ADR-032 ACCEPTED — Sprint 106 (2026-03-12)*
*CTO 8.5/10 APPROVED WITH CONDITIONS (C1 resolved, C2 resolved)*
