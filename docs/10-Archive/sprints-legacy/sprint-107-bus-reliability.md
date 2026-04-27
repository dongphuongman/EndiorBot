# Sprint 107: Bus Reliability — Debounce + Dedup + Approval Notification

**Sprint Duration**: March 12, 2026
**Sprint Goal**: Make the Sprint 106 event bus production-reliable — prevent duplicate processing, tame rapid-fire input, and give CEO real-time feedback on pending approvals
**Status**: COMPLETE (P0 scope — P1 deferred to Sprint 108)
**Priority**: P0 (Reliability) + P1 (UX — deferred)
**Framework**: SDLC 6.1.2
**Authority**: CTO 9.5/10 APPROVED
**Previous Sprint**: Sprint 106 COMPLETE — Event Bus Foundation (CTO 9.5/10, CPO APPROVED)
**Tests**: 22 new tests (debounce ×8, dedup ×9, consumer-dedup ×5)
**ADR**: [ADR-032](../../02-design/01-ADRs/ADR-032-Event-Bus-Async-Command.md) Sprint 107 Extensions

---

## Background

Sprint 106 delivered the `EventEmitterBus` foundation: Telegram polling is no longer blocked during AI calls. Sprint 107 addresses three reliability gaps that appear in production but don't affect unit tests:

| Gap | Symptom | Root Cause |
|-----|---------|------------|
| **GAP-107-1** | Telegram retries deliver the same message 2–3× when bot is slow | Webhook retry: no dedup guard at consumer level |
| **GAP-107-2** | CEO types rapidly and bot processes every intermediate keystroke as a separate command | No debounce: each message published immediately to bus |
| **GAP-107-3** | CEO sends "@coder implement X" → gets "⏳" → then silence for 5 min (no approval notification) | `requestPatchConfirmation()` awaits silently; no Telegram feedback |

**MTClaw reference:**
- `internal/bus/inbound_debounce.go` — per-sender 500ms debounce before PublishInbound
- `internal/bus/dedupe.go` — TTL-based dedup cache (20min, 1000 max) at consumer level

---

## Sprint 107 Scope

### P0 — Reliability (required)

| # | Deliverable | MTClaw Equivalent |
|---|------------|-------------------|
| 1 | `src/bus/debounce.ts` — `BusDebounce`: last-message-wins, 500ms window, per-sender key | `inbound_debounce.go` |
| 2 | `src/bus/dedup.ts` — `BusDedup`: TTL cache (20min, 1000 max), per-messageId | `dedupe.go` |
| 3 | Wire `BusDebounce` in `telegram-ott-adapter.ts` before `bus.publishInbound()` | `debounce.Wrap(bus)` |
| 4 | Wire `BusDedup` in `BusConsumer._process()` before `handleInbound()` | `dedupe.IsDuplicate()` |
| 5 | Export `BusDebounce`, `BusDedup` from `src/bus/index.ts` | — |

### P1 — Approval Notification (target)

| # | Deliverable | Benefit |
|---|------------|---------|
| 6 | `notifyFn?: ChannelSendFn` on `BusInboundMessage` | Allows BusConsumer to deliver intermediate progress to CEO |
| 7 | `BusConsumer._process()`: plumbs `notifyFn` into `InboundMessage.metadata.notifyFn` | Threads callback through ingress → router |
| 8 | `requestPatchConfirmation()` uses `notifyFn` to send "Awaiting your approval" message immediately | CEO knows to `/approve <id>` on Telegram |

### Out of Scope (Sprint 108)

- `/fix` dry-run immediate ACK + push result — requires further `executeFixCommand` async refactor
- Redis upgrade (`RedisBus`) — Sprint 110+
- Bus debounce for Web channel — Sprint 108

---

## Component Design

### `src/bus/debounce.ts` — BusDebounce

**MTClaw alignment**: `inbound_debounce.go` uses per-key timer map. Last message within window wins.

```typescript
export class BusDebounce {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly windowMs = 500) {}

  /**
   * Debounce a publish call.
   * If another message from the same sender arrives within windowMs,
   * the earlier timer is cancelled and the new message takes its place.
   *
   * Key: "${channel}-${senderId}" — per-sender, channel-scoped.
   */
  debounce(msg: BusInboundMessage, publish: (msg: BusInboundMessage) => void): void {
    const key = `${msg.channel}-${msg.senderId}`;
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      publish(msg);
    }, this.windowMs);
    this.timers.set(key, timer);
  }

  /** Cancel pending timer for a specific sender key (or all if omitted). */
  cancel(key?: string): void { ... }

  get pendingCount(): number { return this.timers.size; }
}
```

**Behavior**: rapid messages from the same sender are coalesced — only the LAST message within the 500ms window is published. Different senders are independent.

---

### `src/bus/dedup.ts` — BusDedup

**MTClaw alignment**: `dedupe.go` uses TTL cache to prevent double-processing from webhook retries.

```typescript
export class BusDedup {
  private readonly cache = new Map<string, number>(); // key → expiresAt

  constructor(
    private readonly ttlMs = 20 * 60 * 1000,  // 20 min
    private readonly maxEntries = 1000,
  ) {}

  /** Returns true if this key was recently seen (within TTL). */
  isDuplicate(key: string): boolean {
    this._evictExpired();
    return this.cache.has(key);
  }

  /** Mark key as seen. LRU eviction when maxEntries is reached. */
  markSeen(key: string): void {
    this._evictExpired();
    if (this.cache.size >= this.maxEntries) {
      // LRU: evict oldest entry (Map insertion order)
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, Date.now() + this.ttlMs);
  }

  get size(): number { return this.cache.size; }

  private _evictExpired(): void { ... }
}
```

**Dedup key**: `telegram-${messageId}` — Telegram message IDs are stable across webhook retries.
**Dedup in BusConsumer**: check `isDuplicate(key)` → skip silently if true, else `markSeen(key)` → process.

---

### Wiring: `telegram-ott-adapter.ts` (debounce)

```typescript
// Signature: add optional debounce param
export function createTelegramOttAdapter(
  ingress: GatewayIngress,
  bus?: IMessageBus,
  debounce?: BusDebounce,   // NEW — optional, zero coupling when absent
): OttAdapter | null {

  // In onMessage handler, async path:
  if (bus) {
    // ... build busMsg ...

    if (debounce) {
      // DEBOUNCE PATH: last-message-wins within 500ms window
      debounce.debounce(busMsg, (msg) => bus.publishInbound(msg));
    } else {
      // IMMEDIATE PATH (existing behavior)
      bus.publishInbound(busMsg);
    }
    return;
  }
  // Sync fallback unchanged...
}
```

**Wiring in `serve.ts`:**
```typescript
const debounce = new BusDebounce(500);
const telegram = createTelegramOttAdapter(ingress, bus, debounce);
```

---

### Wiring: `BusConsumer` (dedup)

```typescript
// Constructor: add optional dedup param
constructor(
  private readonly bus: IMessageBus,
  private readonly ingress: GatewayIngress,
  private readonly dedup?: BusDedup,   // NEW — optional
) { ... }

private async _process(msg: BusInboundMessage): Promise<void> {
  // DEDUP GUARD (if dedup configured)
  if (this.dedup) {
    // Key: channel-scoped message ID (set by OTT adapter)
    const dedupKey = msg.metadata?.dedupKey as string | undefined;
    if (dedupKey) {
      if (this.dedup.isDuplicate(dedupKey)) {
        // Silent skip — Telegram webhook retry, already processing
        return;
      }
      this.dedup.markSeen(dedupKey);
    }
  }

  // ... existing _process() logic unchanged ...
}
```

**Dedup key in OTT adapter** — set in metadata when building `busMsg`:
```typescript
// exactOptionalPropertyTypes: conditionally set dedupKey
if (msg.messageId) metadata.dedupKey = `telegram-${msg.messageId}`;
```

---

### P1: Approval Notification via `notifyFn`

**Context**: `requestPatchConfirmation()` in `channel-router.ts` creates an approval request and then silently waits up to 5 minutes. The CEO needs a Telegram message saying "Awaiting your approval".

**Mechanism**: Add `notifyFn?: ChannelSendFn` to `BusInboundMessage`. `BusConsumer` plumbs it into `InboundMessage.metadata.notifyFn` when translating. Deep in the router, `requestPatchConfirmation()` calls it immediately after `createApprovalRequest()`.

```typescript
// BusInboundMessage (src/bus/types.ts)
notifyFn?: ChannelSendFn;  // Optional intermediate notification callback

// BusConsumer._process() — plumb notifyFn into InboundMessage
if (msg.notifyFn !== undefined) {
  inbound.metadata = { ...inbound.metadata, notifyFn: msg.notifyFn };
}

// OTT adapter — set notifyFn same as replyFn (both call channel.send)
busMsg.notifyFn = replyFn;  // reuse same sender fn for notifications

// requestPatchConfirmation() — call notifyFn after creating request
const notifyFn = this.config.notifyFn as ChannelSendFn | undefined;
if (notifyFn) {
  const approvalMsg = [
    `⚠️ @${agent} muốn thay đổi file`,
    ``,
    `Confidence: ${(intent.confidence * 100).toFixed(0)}%  Reason: ${intent.reason}`,
    ``,
    `✅ \`/approve ${approvalRequest.id}\` — cho phép`,
    `❌ \`/reject ${approvalRequest.id}\` — từ chối`,
    `_Tự động từ chối sau 5 phút._`,
  ].join("\n");
  notifyFn(approvalMsg).catch(() => {});  // best-effort
}
// Then await waitForApproval as before
```

**`ChannelRouter` needs `notifyFn` in config** — wire via `GatewayIngress` which passes `metadata.notifyFn` to router when available.

> **Note**: If P1 proves too invasive to `ChannelRouter` interface in this sprint, defer to Sprint 108 and deliver P0 only.

---

## Files Modified/Created

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | `src/bus/debounce.ts` | NEW — `BusDebounce` | P0 |
| 2 | `src/bus/dedup.ts` | NEW — `BusDedup` | P0 |
| 3 | `src/bus/index.ts` | ADD exports: `BusDebounce`, `BusDedup` | P0 |
| 4 | `src/channels/telegram/telegram-ott-adapter.ts` | ADD optional `debounce?` param; set `metadata.dedupKey` | P0 |
| 5 | `src/bus/consumer.ts` | ADD optional `dedup?: BusDedup` param; dedup guard in `_process()` | P0 |
| 6 | `src/cli/commands/serve.ts` | ADD `BusDebounce` init + pass to adapter; `BusDedup` init + pass to consumer | P0 |
| 7 | `src/bus/types.ts` | ADD `notifyFn?: ChannelSendFn` to `BusInboundMessage` | P1 |
| 8 | `src/bus/consumer.ts` | ADD `notifyFn` plumbing to `InboundMessage.metadata` | P1 |
| 9 | `src/agents/channel-router.ts` | ADD `notifyFn` call in `requestPatchConfirmation()` | P1 |
| 10 | `tests/bus/debounce.test.ts` | NEW — 8 tests | P0 |
| 11 | `tests/bus/dedup.test.ts` | NEW — 7 tests | P0 |
| 12 | `tests/bus/consumer-dedup.test.ts` | NEW — 5 tests | P0 |

---

## Test Plan (~20 new tests)

### `tests/bus/debounce.test.ts` (8 tests)

| T# | Test |
|----|------|
| T1 | Single message published immediately after window |
| T2 | Two rapid messages from same sender: only LAST is published |
| T3 | Three rapid messages: only LAST published, first two cancelled |
| T4 | Messages from different senders are independent (both published) |
| T5 | `cancel()` removes pending timer — message NOT published |
| T6 | `pendingCount` reflects active timer count |
| T7 | Zero-window (windowMs=0): message published synchronously |
| T8 | After window: new message from same sender starts fresh timer |

### `tests/bus/dedup.test.ts` (7 tests)

| T# | Test |
|----|------|
| T9 | First `isDuplicate(key)` → false; then `markSeen(key)` |
| T10 | After `markSeen`: `isDuplicate` → true |
| T11 | Expired entry (mock TTL): `isDuplicate` → false |
| T12 | Different keys are independent |
| T13 | LRU eviction: when maxEntries reached, oldest entry evicted |
| T14 | `size` returns current cache entry count |
| T15 | `_evictExpired()` called on each `isDuplicate` / `markSeen` |

### `tests/bus/consumer-dedup.test.ts` (5 tests)

| T# | Test |
|----|------|
| T16 | Consumer WITH dedup: duplicate messageId → `handleInbound` NOT called |
| T17 | Consumer WITH dedup: first message processed normally |
| T18 | Consumer WITHOUT dedup (dedup=undefined): all messages processed (backward compat) |
| T19 | Consumer: `metadata.dedupKey` undefined → no dedup check (graceful) |
| T20 | Consumer: after duplicate skip, bus does NOT publish outbound (silent) |

---

## CTO Pre-Review Checklist

| Check | Assessment |
|-------|-----------|
| `exactOptionalPropertyTypes` | `notifyFn` conditionally assigned: `if (msg.notifyFn !== undefined) inbound.metadata = ...` |
| `BusDebounce` constructor binding | Timer callback uses arrow function (no `this` binding issue) |
| `BusDedup` LRU | Map insertion order used for LRU — correct in Node.js (Maps maintain insertion order) |
| Dedup key collision risk | Key = `telegram-${messageId}` — Telegram message IDs are unique per chat |
| `notifyFn` guard | Same `.catch(() => {})` pattern as CTO C2 (best-effort) |
| Backward compatibility | All new params optional; existing `createTelegramOttAdapter(ingress, bus)` still works |
| Consumer `dedup` param | Optional — `new BusConsumer(bus, ingress)` without dedup still works |

---

## Constraints

1. `GatewayIngress.handleInbound()` signature UNCHANGED — all 65+ existing tests pass
2. `createTelegramOttAdapter(ingress)` (no bus, no debounce) still works — sync fallback unchanged
3. `new BusConsumer(bus, ingress)` (no dedup) still works — backward compat
4. `BusDebounce` and `BusDedup` are standalone classes — no coupling to EventEmitterBus or channel adapters
5. `notifyFn` is optional and best-effort (P1) — P0 items do not depend on P1

---

## Definition of Done

**P0:**
- [ ] `src/bus/debounce.ts` created — `BusDebounce` with 500ms default window
- [ ] `src/bus/dedup.ts` created — `BusDedup` with 20min TTL, 1000 max entries
- [ ] OTT adapter: `metadata.dedupKey = "telegram-${messageId}"` set before publish
- [ ] OTT adapter: `BusDebounce` optional param wired (debounce path before publishInbound)
- [ ] `BusConsumer`: optional `dedup?: BusDedup` param; dedup guard at top of `_process()`
- [ ] `serve.ts`: `BusDebounce` + `BusDedup` instantiated and wired
- [ ] 20 new tests passing (debounce ×8, dedup ×7, consumer-dedup ×5)
- [ ] All existing tests pass (≥6,373)
- [ ] `pnpm build && pnpm test` clean

**P1 (target):**
- [ ] `BusInboundMessage.notifyFn?: ChannelSendFn` added
- [ ] `BusConsumer._process()` plumbs `notifyFn` into `InboundMessage.metadata`
- [ ] `requestPatchConfirmation()` calls `notifyFn` with structured approval message (best-effort)
- [ ] Integration test: approval notification delivered to replyFn before waitForApproval

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| T1 | Create `src/bus/debounce.ts` | 45m |
| T2 | Create `src/bus/dedup.ts` | 45m |
| T3 | Update `src/bus/index.ts` — barrel export | 10m |
| T4 | Modify `telegram-ott-adapter.ts` — dedupKey metadata + debounce param | 45m |
| T5 | Modify `BusConsumer` — dedup param + guard in `_process()` | 45m |
| T6 | Modify `serve.ts` — instantiate + wire debounce + dedup | 30m |
| T7 | Write `tests/bus/debounce.test.ts` (8 tests) | 1.5h |
| T8 | Write `tests/bus/dedup.test.ts` (7 tests) | 1.5h |
| T9 | Write `tests/bus/consumer-dedup.test.ts` (5 tests) | 1h |
| T10 | [P1] Add `notifyFn` to types + BusConsumer plumbing | 45m |
| T11 | [P1] Modify `requestPatchConfirmation()` + integration test | 1.5h |
| T12 | `pnpm build && pnpm test` validation | 30m |

**P0 total: ~7h | P0+P1 total: ~10h**

---

## CTO Review Results

**Score: 9.5/10 — APPROVED**

| # | Observation | Type | Resolution |
|---|-------------|------|------------|
| O1 | `markSeen` does not update LRU insertion order — a frequently re-marked key can be evicted ahead of newer keys | 🟡 Non-blocking | Acceptable for Telegram use case (webhook retries are rare, short-lived). Redis upgrade (Sprint 110) uses `EXPIRE` for correct semantics. |
| O2 | `consumer.ts:19` `@sprint 106` stale after Sprint 107 dedup addition | 🟡 Doc nit | Fixed: updated to `@version 1.1.0 @sprint 107` |

**Verified:**
- `vi.useFakeTimers()` in `beforeEach` — deterministic CI timing ✅
- `BusDebounce.cancel()` uses `values()` only — correct ✅
- `BusDedup._evictExpired()` deletes during Map iteration — safe in JS ✅
- Dedup guard at TOP of `_process()` before `InboundMessage` construction — silent skip is truly silent, no `replyFn("Internal error")` to retry ✅

---

## Sprint 108 Preview

After Sprint 107 bus reliability is solid:

1. **`notifyFn` approval notification** (deferred P1 from Sprint 107): threads callback through ingress → router → `requestPatchConfirmation()` so CEO gets Telegram feedback on pending PATCH approval.
2. **`/fix` dry-run async**: `executeFixCommand()` publishes immediate ACK `"🔧 Compliance check running..."` + pushes full result when done. Requires `isProgress=true` mechanism from `BusConsumer`.
3. **Web channel debounce**: Wire `BusDebounce` to web channel adapter (Sprint 107 only wires Telegram).
4. **Bus metrics dashboard**: Expose `bus.getStats()` via `/gateway/status` endpoint.

---

**Last Updated**: 2026-03-12 (by @coder — Sprint 107 COMPLETE, CTO 9.5/10)
