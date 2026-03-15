# Sprint 110.5: RL Serve Wiring + OpenClaw Tinker Validation

**Status**: COMPLETE
**Date**: 2026-03-15 → 2026-03-16
**Authority**: ADR-033
**PM**: @pm
**CTO Score**: 9.2/10 APPROVED (Track A: 9/10 · Track B: 9.5/10 · Track C: 9/10)
**CPO Score**: APPROVED (all 3 tracks)

---

## Context

Sprint 110 built the complete RL capture infrastructure (`src/rl/`) and wired
`telegram-channel.ts` to attach 👍/🔄/👎 keyboards. However, `RLFeedbackService`
is **never initialized or injected** in `serve.ts`.

**Consequence**: Zero keyboards will appear in production. Zero JSONL records will
be written. The entire RL pipeline is capture-ready in code but dead on startup.

This sprint closes that gap, then validates the OpenClaw Tinker training path
(the original Sprint 110.5 scope from ADR-033).

---

## Gap Analysis (discovered during Sprint 110.5 planning)

| Gap | Location | Impact |
|-----|----------|--------|
| `RLFeedbackService` never constructed | `serve.ts` | 🔴 P0 — no feedback data ever collected |
| `channel.setFeedbackService()` never called | `serve.ts` | 🔴 P0 — keyboard never attached |
| 15-min stale expiry timer never started | `serve.ts` | 🟡 P1 — turns never expire, feedbackRate inaccurate |
| `feedbackService` not plumbed to `createTelegramOttAdapter()` | `telegram-ott-adapter.ts` | 🔴 P0 — no injection path exists |

---

## Sprint Goal

> Wire `RLFeedbackService` into `serve.ts` so CEO sees 👍/🔄/👎 keyboard after
> every agent response. Then validate OpenClaw Tinker cloud training with the
> first real feedback JSONL data.

---

## Track A: Serve Wiring (P0 — must complete first)

### Step 1: Extend `createTelegramOttAdapter()` signature

**File**: `src/channels/telegram/telegram-ott-adapter.ts`
**Change**: Add optional 4th parameter `feedbackService?: RLFeedbackService`

```typescript
export function createTelegramOttAdapter(
  ingress: GatewayIngress,
  bus?: IMessageBus,
  debounce?: BusDebounce,
  feedbackService?: RLFeedbackService,  // Sprint 110.5: RL wiring
): OttAdapter | null {
  // ...
  if (feedbackService) {
    channel.setFeedbackService(feedbackService);
  }
  // ...
}
```

Pattern: consistent with existing `bus?` and `debounce?` optional parameters.
Backward compat: optional — existing callers unaffected.
Zalo/Web: unchanged (no RL wiring needed; Telegram-only in Sprint 110).

### Step 2: Wire in `serve.ts`

**File**: `src/cli/commands/serve.ts`
**Insert between step 4.5 (MessageBus) and step 6 (OTT Adapters)**:

```typescript
// 4.6 RL Feedback Service (Sprint 110, ADR-033)
// Owns: RLSessionTracker + RLDataStore + RLEventLog
// Injected into Telegram adapter for 👍/🔄/👎 keyboard attachment
import { RLFeedbackService } from "../../rl/index.js";

const feedbackService = new RLFeedbackService();

// 15-min stale expiry timer — marks unfeedback turns "expired" for kill-criteria measurement
const RL_EXPIRE_INTERVAL_MS = 15 * 60 * 1000;
const rlExpireTimer = setInterval(() => {
  feedbackService.expireStale();
}, RL_EXPIRE_INTERVAL_MS);

components.push({
  name: "RLFeedbackService",
  stop: async () => {
    clearInterval(rlExpireTimer);
  },
});
console.log(green("  RLFeedbackService ready (15-min stale expiry)"));
```

Then pass to Telegram adapter:
```typescript
const telegram = createTelegramOttAdapter(ingress, bus, busDebounce, feedbackService);
```

### Step 3: Tests (3 tests in `tests/channels/telegram/ott-serve-wiring.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| T1 | `createTelegramOttAdapter()` with feedbackService → adapter created (no throw) | Optional param accepted |
| T2 | `createTelegramOttAdapter()` without feedbackService (backward compat) → adapter created | No regression |
| T3 | `feedbackService.expireStale()` called on interval — returns expired correlationIds | Timer logic |

---

## Track B: OpenClaw Tinker Validation (P2 — after Track A collects real data)

**Prerequisite**: 20+ real feedback samples from production (after Track A deployed).

### Steps

1. Collect 20+ samples via real CEO → agent → 👍/👎 interactions
   (should take 1-2 hours of normal EndiorBot usage)

2. Locate training data:
   ```
   ls ~/.endiorbot/rl-training-data/rl-*.jsonl
   ```

3. Run OpenClaw Tinker with Sprint 110 data:
   ```bash
   cd OpenClaw-RL/openclaw-tinker/
   python run.py \
     --data ~/.endiorbot/rl-training-data/ \
     --method rl \
     --output ./runs/sprint-110-distill/
   ```

   Expected: distillation run (not GRPO) — Sprint 110 data has `provider=claude`,
   so only reward-filtered distillation is valid (ADR-033 D2).

4. Validate:
   - [ ] Training completes without crash
   - [ ] Loss curve shows decreasing trend (no divergence)
   - [ ] Output checkpoint saved to `./runs/sprint-110-distill/`

5. Finalize ADR-033 open questions:

| Q | Question | Resolution target |
|---|----------|-------------------|
| Q1 | OpenClaw Tinker API: cloud key required or self-hosted? | Run Tinker and inspect |
| Q2 | VRAM budget for optional RTX 5090 path | Check Tinker output for resource requirements |
| Q3 | Training window: concurrent vs off-hours? | Measure Tinker run duration |
| Q4 | Minimum samples before first Tinker run? | Observed from Q3 run |

---

## Track C: Validation Set (P2 — parallel with Track B)

Create 20-30 curated Q&A pairs per agent role for kill-criteria measurement:

| Role | File | Content |
|------|------|---------|
| @pm | `~/.endiorbot/validation/pm-qa.jsonl` | 20 sprint planning / prioritization prompts |
| @architect | `~/.endiorbot/validation/architect-qa.jsonl` | 20 architecture decision prompts |
| @coder | `~/.endiorbot/validation/coder-qa.jsonl` | 20 TypeScript implementation prompts |
| @reviewer | `~/.endiorbot/validation/reviewer-qa.jsonl` | 20 code review prompts |

Format: `{"prompt": "...", "expected_themes": [...], "anti-patterns": [...]}` (JSONL)

---

## Files Changed (Sprint 110.5)

| # | File | Change |
|---|------|--------|
| 1 | `src/channels/telegram/telegram-ott-adapter.ts` | ADD optional `feedbackService?` param (Step 1) |
| 2 | `src/cli/commands/serve.ts` | ADD `RLFeedbackService` init + expiry timer + inject to adapter (Step 2) |
| 3 | `tests/channels/telegram/ott-serve-wiring.test.ts` | NEW — 3 tests (Track A Step 3) |
| 4 | `docs/02-design/01-ADRs/ADR-033-OpenClaw-RL-Training-Architecture.md` | UPDATE — resolve Q1-Q4, change DRAFT → FINALIZED |
| 5 | `~/.endiorbot/validation/` | NEW — validation sets per role (not tracked in repo) |

---

## Acceptance Criteria

### Track A (must pass before Track B):

- [ ] **A1** `pnpm build` clean after all changes
- [ ] `RLFeedbackService` initialized in `serve.ts` startup
- [ ] 15-min `expireStale()` timer starts and clears on shutdown
- [ ] `createTelegramOttAdapter()` receives `feedbackService` and calls `channel.setFeedbackService()`
- [ ] Backward compat: existing callers compile unchanged
- [ ] 3 new tests pass
- [ ] **Manual test**: Start `pnpm serve`, send `@pm hello`, verify 👍🔄👎 keyboard appears
- [ ] **Manual test**: Tap 👍, verify JSONL record written to `~/.endiorbot/rl-training-data/`
- [ ] **Manual test**: Tap 🔄, verify event log written, no training JSONL record

### Track B (conditional on A):

- [ ] **B1** 20+ real feedback samples collected
- [ ] OpenClaw Tinker run completes without error
- [ ] Loss curve shows decreasing trend (screenshot/log saved)
- [ ] ADR-033 open questions Q1-Q4 resolved, DRAFT → FINALIZED

### Track C (optional, P2):

- [ ] **C1** 20 Q&A pairs per role × 4 roles = 80 validation prompts created

---

## Definition of Done

**Sprint 110.5 DONE when A1 + manual production test pass.**
Track B and C are P2 — if OpenClaw-RL repo is not set up, defer to Sprint 111a.

---

## Kill Criteria Check (first measurement possible after A1)

Once Track A is in production for 1 week:
- Measure `feedbackRate = feedbackReceived / trainableTurns` from event log
- If `< 15%` after 4 weeks → review keyboard UX (prominence, timing)
- Target: CEO taps keyboard on ≥ 15% of agent responses

---

## Sprint 110.5 vs Sprint 111a

| Sprint | Focus | Gate |
|--------|-------|------|
| 110.5 | Serve wiring + Tinker validation | Track A done = proceed |
| 111a | Offline replay + shadow mode (Qwen running in background) | 100+ samples collected |
| 111b | Gated rollout (Tier 4, ENABLE_RL_TIER=true) | Win rate >50% on 200 samples |

---

**Author**: @pm
**Date**: 2026-03-15
**Reviewers**: CTO, CPO
