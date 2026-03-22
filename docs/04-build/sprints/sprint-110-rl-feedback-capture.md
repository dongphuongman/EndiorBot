# Sprint 110: RL Feedback Capture — CEO Preference Alignment via Chat

**Sprint Duration**: March 2026
**Sprint Goal**: Capture CEO feedback (👍/🔄/👎) on every agent response, persist to JSONL pre-training buffer, wire correlationId through ChannelSendFn so the feedback keyboard links to the correct turn
**Status**: 🚧 IN PROGRESS
**Priority**: P0 (correlationId plumbing + feedback capture + JSONL buffer)
**Framework**: SDLC 6.1.2
**Authority**: CTO 9/10 APPROVED — Sprint 110 authorized (2026-03-15)
**Previous Sprint**: Sprint 109 COMPLETE — gstack Best Practices (CTO 9/10 + CPO APPROVED)
**Tests**: ~16 new tests (session-tracker ×6, feedback-service ×5, data-store ×3, rl-feedback ×2)
**ADR**: [ADR-033](../../02-design/01-ADRs/ADR-033-OpenClaw-RL-Training-Architecture.md) — OpenClaw-RL Training Architecture
**Plan**: [quiet-jumping-bee.md](~/.claude/plans/quiet-jumping-bee.md)

---

## Background

EndiorBot agents deliver the same quality regardless of CEO satisfaction. No feedback loop exists. CEO "that was perfect" / "missed the point" teaches the system nothing.

Sprint 110 builds the **capture layer** — the TypeScript infrastructure that records CEO preferences in a JSONL pre-training buffer. No Python, no training in this sprint. The data collected here feeds OpenClaw Tinker (cloud LoRA) in Sprint 111.

**Priority constraint:** EndiorBot must work anytime, anywhere on local MacBook without depending on RTX 5090. OpenClaw Tinker (cloud training) is the primary path. RTX 5090 is optional acceleration validated in Sprint 110.5.

---

## Sprint 110 Deliverables

### Step 0: Fix `sendMessageWithId()` (CTO MF-1)

`telegram-channel.ts:761` discards `message_id` from Telegram API response. Without it, there's no way to link a feedback keyboard to the correct `RLTurn`.

| # | Deliverable | Status |
|---|------------|--------|
| 0 | `src/channels/telegram/telegram-channel.ts` — ADD `sendMessageWithId()` alongside `sendMessage()` | 🚧 PLANNED |

### Step 0.5: Extend `ChannelSendFn` opts (Doc 10 true blocker)

`ChannelSendFn` opts is `{ format?: string }`. `correlationId` is available in `BusConsumer` but NOT passed to the channel via `replyFn()`. Without it, `telegram-channel.ts` cannot link the feedback keyboard to the correct `RLTurn`.

| # | File | Lines | Change | Status |
|---|------|-------|--------|--------|
| 0.5a | `src/bus/types.ts` | 27-30 | ADD `correlationId?: string` to ChannelSendFn opts | 🚧 PLANNED |
| 0.5b | `src/bus/consumer.ts` | 136-138 | PASS `correlationId` in sendOpts | 🚧 PLANNED |
| 0.5c | `src/bus/consumer.ts` | 154-155 | PASS `correlationId` in error path replyFn | 🚧 PLANNED |
| 0.5d | `src/channels/telegram/telegram-ott-adapter.ts` | 128-131 | EXTRACT `opts.correlationId` | 🚧 PLANNED |
| VERIFY | `src/channels/zalo/zalo-ott-adapter.ts` | — | Compile check after type change (no code change) | 🚧 PLANNED |
| VERIFY | Web channel adapter | — | Compile check after type change (no code change) | 🚧 PLANNED |

**Build checkpoint after Step 0.5: `pnpm build` must pass across ALL channel adapters.**

### P0: RL Feedback Capture Infrastructure

| # | Deliverable | Status |
|---|------------|--------|
| 1 | `src/rl/types.ts` — `RLTurn`, `RLSession`, `RLRecord`, `RLEventLogEntry`, `FeedbackStatus`, `FeedbackLabel` | 🚧 PLANNED |
| 2 | `src/rl/session-tracker.ts` — `RLSessionTracker` (idle-timeout 30min, correlationId primary key) | 🚧 PLANNED |
| 3 | `src/rl/feedback-service.ts` — `RLFeedbackService` (business logic, separated from Telegram transport) | 🚧 PLANNED |
| 4 | `src/rl/data-store.ts` — `RLDataStore` (training JSONL) + `RLEventLog` (all turns event log) | 🚧 PLANNED |
| 5 | `src/rl/observability.ts` — `RLStats` interface | 🚧 PLANNED |
| 6 | `src/channels/telegram/telegram-channel.ts` — 3-button keyboard after agent response + callback handler | 🚧 PLANNED |

### Tests

| # | Deliverable | Status |
|---|------------|--------|
| 7 | `tests/rl/session-tracker.test.ts` — 6 tests | 🚧 PLANNED |
| 8 | `tests/rl/feedback-service.test.ts` — 5 tests | 🚧 PLANNED |
| 9 | `tests/rl/data-store.test.ts` — 3 tests (includes JSONL fixture validation against OpenClaw format) | 🚧 PLANNED |
| 10 | `tests/channels/telegram/rl-feedback.test.ts` — 2 tests (keyboard attach + orphan callback drop) | 🚧 PLANNED |

---

## Architecture

### Hook Location — `telegram-channel.ts` ONLY

RL hook goes in `telegram-channel.ts` (channel adapter layer), NOT `ingress.ts`. Reason: `ingress.ts:handleInbound()` never sees `message_id` — it returns `{text, format, metadata}`. The `message_id` is created by Telegram's `sendMessage` response, which only exists in the channel layer.

```
ingress.handleInbound() → {text, metadata} → BusConsumer (correlationId in replyFn opts)
  → telegram-channel.ts: sendMessageWithId() → gets message_id from Telegram
  → feedbackService.onAgentResponse({..., telegramMessageId, correlationId})
  → attach 3-button inline keyboard
```

`ingress.ts` stays **channel-agnostic** (no changes).

### Trainable Turn Policy

| Condition | `isTrainableTurn` | `turnType` |
|-----------|-------------------|------------|
| Agent call result, `provider !== "system"`, `metadata.agent !== undefined` | true | "main" |
| Error message, timeout, panic | false | "side" |
| Gate check (`/gate`), `/status`, `/help` | false | "side" |
| Short command ack from system | false | "side" |

### Feedback Scope Guard (CPO C4)

Attach 👍/🔄/👎 keyboard ONLY AFTER:
1. `sessionTracker.addTurn()` succeeds
2. `sendMessageWithId()` returns a valid `message_id`
3. `sessionTracker.setMessageId()` called with that `message_id`

Orphan callbacks (correlationId unknown to tracker) → log + drop silently.

### Three-State Feedback

```
[👍 Good]  [🔄 Partial]  [👎 Bad]
Callback: "rl_fb:good:{correlationId}" / "rl_fb:partial:{correlationId}" / "rl_fb:bad:{correlationId}"
```

- `correlationId` = primary key (not `telegramMessageId`)
- **Hint capture: DEFERRED to Sprint 112.** Sprint 110 records have `hint: null` for all turns.

### feedbackLabel / reward Separation

Raw human signal `feedbackLabel: "good" | "partial" | "bad"` stored separately from `reward` scalar. Reward mapping (good=+1, bad=-1) happens in training pipeline, not capture layer. `partial` records go to **event log only** — NOT to training JSONL in Sprint 110.

### Two Storage Paths

| Store | Path | Contents | Purpose |
|-------|------|----------|---------|
| Training JSONL | `~/.endiorbot/rl-training-data/rl-{YYYY-MM-DD}.jsonl` | `good`/`bad` feedback only | OpenClaw Tinker input |
| Event Log | `~/.endiorbot/rl-state/event-log.jsonl` | ALL turns (including partial/missing/expired) | Kill-criteria measurement |

### Session Boundary

```typescript
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30-min idle timeout
const SESSION_TIMEZONE = "Asia/Ho_Chi_Minh";       // documented in ADR-033
// sessionId: "rl-{chatId}-{startTs}" (timestamp-based, not day-based)
```

---

## Key Design Decisions

**Training Methodology Contract:**
| Data source | Training use | Rationale |
|-------------|-------------|-----------|
| Sprint 110: `provider=claude`, CEO feedback | Reward-filtered distillation only | Training on Claude's outputs ≠ RLHF |
| Sprint 111: `provider=openclaw-rl`, CEO feedback | RLHF policy optimization (GRPO) | Qwen's own outputs with log-probs → valid on-policy RL |

**Kill Criteria:**
| Trigger | Threshold |
|---------|-----------|
| Explicit feedback rate | <15% after 4 weeks |
| Win rate vs untrained | <50% on 200+ samples |
| Validation set drop | >10% on 20-30 curated Q&A pairs |
| Training diverges | Loss increases in 1st Tinker run |

---

## 4 Acceptance Criteria for Sprint 110 Sign-off

1. **correlationId flows**: bus → consumer opts → telegram-channel → feedback keyboard → callback → RLRecord
2. **feedbackLabel preserved raw**: `"good"/"partial"/"bad"` in RLRecord AND event log; partial NOT in training JSONL
3. **Event log captures ALL turns**: including missing/expired — `feedbackRate` survives process restart
4. **JSONL validated**: `schema_version:1`, `correlation_id` present, format matches OpenClaw-RL fixture

---

## Files Modified/Created

| # | File | Change |
|---|------|--------|
| 0 | `src/channels/telegram/telegram-channel.ts` | ADD `sendMessageWithId()` (Step 0) |
| 0.5a | `src/bus/types.ts` | ADD `correlationId?` to ChannelSendFn opts |
| 0.5b-c | `src/bus/consumer.ts` | PASS `correlationId` in sendOpts (both paths) |
| 0.5d | `src/channels/telegram/telegram-ott-adapter.ts` | EXTRACT `opts.correlationId` |
| 1 | `src/rl/types.ts` | NEW |
| 2 | `src/rl/session-tracker.ts` | NEW |
| 3 | `src/rl/feedback-service.ts` | NEW |
| 4 | `src/rl/data-store.ts` | NEW (RLDataStore + RLEventLog) |
| 5 | `src/rl/observability.ts` | NEW |
| 6 | `src/channels/telegram/telegram-channel.ts` | MODIFY — 3-button keyboard + callback handler |
| 7-10 | `tests/rl/*.test.ts` + `tests/channels/telegram/rl-feedback.test.ts` | NEW (16 tests total) |

`ingress.ts`: NO changes (channel-agnostic, per CTO C2)

---

## Sprint 110.5 Preview

- **No GPU required** — OpenClaw Tinker cloud path (no SGLang/RTX 5090 dependency)
- Run `OpenClaw-RL/openclaw-tinker/run.py` with Sprint 110 JSONL data (`--method rl`)
- Write `ADR-033-OpenClaw-RL-Training-Architecture.md` (preliminary draft exists)
- Create validation set: 20-30 curated Q&A pairs per agent role

---

**CTO Review**: 9/10 APPROVED — 2026-03-15 (SF-1: verify Zalo+Web adapters compile after ChannelSendFn change)
**CPO Review**: APPROVED — 2026-03-15 (C1: timezone explicit; C2: OpenClaw fallback; C3: A/B criteria; C4: keyboard guard)

**Last Updated**: 2026-03-15 (Sprint 110 IN PROGRESS — ready for @coder)
