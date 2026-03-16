# Current Sprint: Sprint 111a — Offline Replay + Shadow Mode

**Sprint Duration**: March 2026
**Sprint Goal**: Run first TRL SFT training on Sprint 110 JSONL, then GRPO setup with Ollama rollouts — HuggingFace TRL path (Tinker dead, ADR-033 amended)
**Status**: 🔜 PLANNED
**Priority**: P1
**Framework**: SDLC 6.1.2
**Authority**: ADR-033 (amended 2026-03-16 — Tinker → TRL)
**Previous Sprint**: Sprint 110.5 COMPLETE — RL Serve Wiring + ADR-033 + Validation Set (CTO 9.2/10 APPROVED)
**Prerequisites**: `pip install trl>=0.12.0 transformers peft`, 10+ good feedback records (1/10 collected)
**ADR**: [ADR-033](../../02-design/01-ADRs/ADR-033-OpenClaw-RL-Training-Architecture.md)

---

## Sprint 110 Summary (COMPLETE — CTO 9/10 APPROVED)

| Deliverable | Status |
|-------------|--------|
| `sendMessageWithId()` — returns `message_id` from Telegram API | ✅ COMPLETE |
| `ChannelSendFn` opts — ADD `correlationId?`, `isTrainableTurn?`, `provider?` (5 files) | ✅ COMPLETE |
| `src/rl/types.ts` — `FeedbackStatus`, `FeedbackLabel`, `RLTurn`, `RLSession`, `RLRecord`, `RLEventLogEntry` | ✅ COMPLETE |
| `src/rl/session-tracker.ts` — `RLSessionTracker` (30-min idle-timeout, correlationId primary key) | ✅ COMPLETE |
| `src/rl/feedback-service.ts` — `RLFeedbackService` (tracker + dataStore + eventLog) | ✅ COMPLETE |
| `src/rl/data-store.ts` — `RLDataStore` (training JSONL) + `RLEventLog` (all-turns event log) | ✅ COMPLETE |
| `src/rl/observability.ts` + `src/rl/index.ts` | ✅ COMPLETE |
| `telegram-channel.ts` — 3-button keyboard + `rl_fb:*` callback handler + `setFeedbackService()` | ✅ COMPLETE |
| 16 new tests (session-tracker ×6, feedback-service ×5, data-store ×3, rl-feedback ×2) | ✅ 21/21 pass |
| SF-1 fix: `globalTurnCounter` → instance field `turnCounter` | ✅ COMPLETE |

**Gap discovered during 110.5 planning**: `RLFeedbackService` never initialized in `serve.ts` — serve wiring is Sprint 110.5 Track A (P0 blocker).

---

## Sprint 110.5 Deliverables

### Track A: Serve Wiring (P0 — BLOCKER)

| # | Deliverable | Status |
|---|------------|--------|
| 1 | `src/channels/telegram/telegram-ott-adapter.ts` — ADD optional `feedbackService?` param | ✅ COMPLETE |
| 2 | `src/cli/commands/serve.ts` — INIT `RLFeedbackService` + 15-min expiry timer + inject | ✅ COMPLETE |
| 3 | `tests/channels/telegram/ott-serve-wiring.test.ts` — 3 tests | ✅ COMPLETE (33/33 pass) |
| 4 | Manual test: 👍/🔄/👎 keyboard visible in real Telegram after agent response | ✅ CONFIRMED (2026-03-15) |

### Track B: OpenClaw Tinker Validation (P2 — ADR-033 finalized, training deferred to 111a)

| # | Deliverable | Status |
|---|------------|--------|
| 5 | Collect 20+ real feedback samples (via normal EndiorBot usage) | 🔄 IN PROGRESS (1/20 collected) |
| 6 | ~~Run `run.py --method rl` with Sprint 110 JSONL~~ → **REVISED**: Sprint 110 JSONL → offline SFT (HF); Sprint 111a = first Tinker run | ✅ REVISED (ADR-033 D2/D10) |
| 7 | Validate Tinker training (loss curve) | ⏳ DEFERRED to Sprint 111a (requires TINKER_API_KEY + Qwen rollouts) |
| 8 | Finalize ADR-033 Q1-Q4 → FINALIZED | ✅ COMPLETE (Q1-Q4 resolved, D10 added) |

### Track C: Validation Set (P2 — parallel)

| # | Deliverable | Status |
|---|------------|--------|
| 9 | 20 curated Q&A pairs × 4 roles (pm/architect/coder/reviewer) for kill-criteria measurement | ✅ COMPLETE — [rl-validation-set-v1.md](../../05-test/rl-validation-set-v1.md) (80 prompts) |

---

## Deferred Sprint: Sprint 108 — Async Notifications (PLANNED)

Sprint 108 (notifyFn PATCH approval, Zalo bus wiring, bus metrics) is deferred — independent track from RL work. Will be scheduled after Sprint 111 or when capacity allows.

| Deliverable | Status |
|-------------|--------|
| `src/bus/types.ts` — ADD `notifyFn?: ChannelSendFn` to `BusInboundMessage` | PLANNED |
| `telegram-ott-adapter.ts` — set `busMsg.notifyFn = replyFn` | PLANNED |
| `src/gateway/ingress.ts` — extract `notifyFn`, pass to `router.callAI()` | PLANNED |
| `src/channels/zalo/zalo-ott-adapter.ts` — bus + debounce wiring | PLANNED |
| `src/gateway/server.ts` — ADD `setBus()` + bus stats in `/api/status` | PLANNED |
| 15 tests (notify-fn ×5, zalo-bus ×7, bus-metrics ×3) | PLANNED |

---

**Last Updated**: 2026-03-15 (Track A COMPLETE + keyboard confirmed; Track B ADR-033 FINALIZED; Track C + Sprint 111a pending)
