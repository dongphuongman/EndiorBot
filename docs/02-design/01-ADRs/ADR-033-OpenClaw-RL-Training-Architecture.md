# ADR-033: OpenClaw-RL Training Architecture — RL-by-Chat for EndiorBot

**Status**: AMENDED — Sprint 110.5 FINALIZED, D1/D2/D10/Q1-Q4 revised 2026-03-16
**Date**: 2026-03-15 (amended 2026-03-16 — Tinker → TRL migration)
**Authority**: CTO 9/10 APPROVED + CPO APPROVED (Sprint 110 plan)
**Sprints**: 110 (capture) → 110.5 (validation/finalization) → 111a (training) → 111b (rollout)

---

## Context

EndiorBot agents deliver the same quality regardless of CEO satisfaction. No feedback loop exists. CEO "that was perfect" / "missed the point" teaches the system nothing.

This ADR captures the architecture decisions for integrating OpenClaw-RL into EndiorBot to create a preference-alignment loop from conversational feedback.

**Priority constraint**: EndiorBot must work anytime, anywhere on local MacBook without depending on RTX 5090 server. All decisions respect this constraint.

---

## Decisions

### D1: Training Path — HuggingFace TRL as Primary *(amended 2026-03-16)*

**Decision**: Use `OpenClaw-RL/openclaw-trl/run.py` (HuggingFace TRL) as the primary training path. RTX 5090 + SGLang is optional acceleration, not a prerequisite.

**Amendment reason**: `tinker.build` is a parked GoDaddy domain (confirmed 2026-03-16). OpenClaw Tinker cloud service is permanently unavailable. `openclaw-tinker/` directory removed from repo.

**Replacement**:
- `openclaw-trl/` — HuggingFace TRL (`SFTTrainer` + `GRPOTrainer`)
- MacBook-compatible: runs on Apple Silicon MPS (no CUDA required)
- Optional acceleration: RTX 5090 (CUDA) for faster iteration
- No cloud dependency, no API keys required for training

**Consequences**:
- `TINKER_API_KEY` is N/A — removed from prerequisites
- Sprint 111a: `python run.py --method sft` (SFT on Sprint 110 JSONL)
- Sprint 111a+: `python run.py --method grpo` (GRPO with Ollama rollouts)

**Status**: DECIDED (amended)

---

### D2: Training Methodology Contract *(amended 2026-03-16)*

**Decision**: Sprint 110 data (provider=claude) is used for **reward-filtered SFT/distillation** via `trl.SFTTrainer`. Sprint 111a data uses **online GRPO via `trl.GRPOTrainer`** (Qwen's own outputs as rollouts). Never mix in same batch without provider-aware loss weighting.

**Two-pipeline contract**:
```
Sprint 110 JSONL (provider="claude-code", CEO 👍):
  → reward-filter: good responses only (reward=+1)
  → trl.SFTTrainer: cross-entropy on assistant turn
  → Tooling: OpenClaw-RL/openclaw-trl/run.py --method sft

Sprint 111a JSONL (provider="openclaw-rl", Qwen rollouts):
  → trl.GRPOTrainer: GRPO with CEO feedback as reward signal
  → Valid on-policy RL: GRPOTrainer generates rollouts from the policy model
  → Tooling: OpenClaw-RL/openclaw-trl/run.py --method grpo
```

**Status**: DECIDED (amended — Tinker replaced with TRL)

---

### D3: Hook Location — `telegram-channel.ts` (Not `ingress.ts`)

**Decision**: RL feedback hook goes in `telegram-channel.ts` only. `ingress.ts` stays channel-agnostic with no changes.

**Rationale**:
- `ingress.ts:handleInbound()` returns `{text, format, metadata}` — never sees `message_id`
- `message_id` is created by Telegram's `sendMessage` response — only exists in channel layer
- If hook were in `ingress.ts`, we'd need to retrofit `message_id` back from channel (wrong direction)
- Channel adapter is the correct abstraction layer for channel-specific metadata

**Correct flow**:
```
ingress.handleInbound() → {text, metadata} → BusConsumer (correlationId in opts)
  → telegram-channel.ts: sendMessageWithId() → gets message_id from Telegram
  → feedbackService.onAgentResponse({..., telegramMessageId, correlationId})
  → attach 3-button inline keyboard
```

**Status**: DECIDED

---

### D4: `ChannelSendFn` Extension — Add `correlationId?` to Opts

**Decision**: Extend `ChannelSendFn` opts from `{ format?: string }` to `{ format?: string; correlationId?: string }`. Pass `correlationId` from `BusConsumer` through `replyFn()` to channel.

**Rationale**:
- `correlationId` exists in `BusConsumer` (in `msg.correlationId`) but is NOT currently passed to the channel
- Without it, `telegram-channel.ts` cannot link the feedback keyboard to the correct `RLTurn`
- `correlationId` is optional → backward compatible; existing callers (Zalo, Web) compile unchanged
- 5-file change with well-defined blast radius

**Files changed**:
1. `src/bus/types.ts` — type definition
2. `src/bus/consumer.ts` — pass correlationId in sendOpts (normal + error paths)
3. `src/channels/telegram/telegram-ott-adapter.ts` — extract from opts
4. `src/channels/telegram/telegram-channel.ts` — receive for RL keyboard attachment
5. **Verify** (no change): `src/channels/zalo/zalo-ott-adapter.ts`, web adapter

**Status**: DECIDED

---

### D5: `feedbackLabel` / `reward` Separation

**Decision**: Store raw human signal `feedbackLabel: "good" | "partial" | "bad"` separately from `reward: number` (+1/-1). Reward mapping happens in training pipeline, not capture layer.

**Rationale**:
- Capture layer should be maximally informative — raw signal preserved
- Reward scalar is a training pipeline concern (subject to change)
- `partial` may be treated differently in future (0.5, hint-prompt trigger, etc.)
- Sprint 110: `partial` → event log only, NOT training JSONL (conservative baseline)
- Sprint 112+: Experiment with partial as 0 or weak positive after sufficient data

**JSONL record includes both**:
```typescript
feedback_label: "good" | "partial" | "bad"  // raw signal
reward: number                                // +1 or -1 (good/bad only in Sprint 110)
```

**Status**: DECIDED

---

### D6: Two Storage Paths

**Decision**: Training JSONL (good/bad only) and Event Log (all turns) are separate stores with different purposes.

| Store | Path | Contents |
|-------|------|----------|
| Training JSONL | `~/.endiorbot/rl-training-data/rl-{YYYY-MM-DD}.jsonl` | `good`/`bad` feedback only (`schema_version:1`) |
| Event Log | `~/.endiorbot/rl-state/event-log.jsonl` | ALL turns including partial/missing/expired |

**Rationale**:
- Training JSONL: input to OpenClaw TRL — clean, only actionable records
- Event Log: kill-criteria measurement (`feedbackRate = received/trainable`) survives process restart
- Separate paths prevent accidental training on expired/missing data
- `partial` goes to event log to preserve the signal for Sprint 112 analysis

**Status**: DECIDED

---

### D7: Session Boundary — Idle-Timeout + Explicit Timezone

**Decision**: Session lifecycle = idle-timeout 30min. Timezone = `Asia/Ho_Chi_Minh`. Per-day file grouping only for filenames.

```typescript
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_TIMEZONE = "Asia/Ho_Chi_Minh";
// sessionId: "rl-{chatId}-{startTs}" (timestamp-based, not day-based)
```

**Rationale**:
- Day-based sessions (e.g., `rl-{chatId}-{YYYYMMDD}`) are ambiguous without timezone
- CEO works irregular hours — idle-timeout better matches natural conversation boundaries
- Per-day filenames are fine (UTC date) — they're for organizing output, not session lifecycle
- Explicit timezone in code + ADR prevents ambiguity in date calculations

**Status**: DECIDED

---

### D8: Hint/OPD Capture — Deferred to Sprint 112

**Decision**: Hint capture (👎 → "What was wrong?" prompt) is deferred to Sprint 112. Sprint 110 records have `hint: null` for all turns.

**Rationale**:
- Hint capture requires intercepting the next message BEFORE it routes to an agent
- This is a cross-cutting concern in `telegram-channel.ts` that risks hint being processed as an agent command
- Sprint 110's core value is capture infrastructure + binary feedback loop
- Defer until the core loop is stable and data confirms which roles need OPD most

**Status**: DECIDED

---

### D9: OpenClaw-RL Tier Placement — Tier 4 (After Remote Ollama)

**Decision**: OpenClaw-RL serving (Sprint 111b) goes as **Tier 4** after Remote Ollama. Configurable via `ENABLE_RL_TIER=true`. OpenClaw unavailable → silent skip, continue fallback chain.

**Rationale**:
- Qwen2.5:7b (LoRA-tuned) likely worse than qwen3-coder:30b (remote) initially
- Tier 4 = explicit opt-in until trained model proves quality
- Silent fallback: CEO never sees RL errors; EndiorBot always responds

**Tier chain (with RL enabled)**:
```
Tier 1: Claude (primary)
Tier 2: Cloud fallback providers
Tier 3: Remote Ollama (qwen3-coder:30b)
Tier 4: OpenClaw-RL Qwen2.5:7b LoRA [ENABLE_RL_TIER=true only]
```

**Status**: DECIDED (Sprint 111b implementation)

---

### D10: TRL vs Raw SFT — Format Boundary *(amended 2026-03-16)*

**Decision**: Sprint 110 JSONL feeds `trl.SFTTrainer` (offline). Sprint 111a JSONL feeds `trl.GRPOTrainer` (online). These are two distinct pipelines. `openclaw-tinker` removed (tinker.build dead).

**Two-pipeline contract**:

| Pipeline | Sprint | Data source | Tooling | Loss |
|----------|--------|-------------|---------|------|
| Offline SFT | Sprint 110/111a | `~/.endiorbot/rl-training-data/*.jsonl` (good, text) | `trl.SFTTrainer` via `run.py --method sft` | Cross-entropy on good responses |
| Online GRPO | Sprint 111a+ | CEO prompts → `GRPOTrainer` rollouts + CEO reward index | `trl.GRPOTrainer` via `run.py --method grpo` | GRPO clipped surrogate |

**Key difference from old Tinker approach**: TRL `GRPOTrainer` generates rollouts internally from the policy model (no separate proxy process). No `TrainingSample` token-level format required — TRL handles tokenization internally.

**Status**: DECIDED (amended — Tinker replaced with TRL)

---

## Kill Criteria

| Trigger | Threshold | Measurement |
|---------|-----------|-------------|
| Explicit feedback rate | <15% after 4 weeks | `feedbackReceived / trainableTurns` (from event log) |
| Win rate vs untrained | <50% after 200 samples | Blinded A/B test (fixed 10 prompts/role — see validation set v1) |
| Validation set drop | >10% | 80 curated Q&A pairs, 4 roles (`docs/05-test/rl-validation-set-v1.md`) |
| TRL training diverges | Loss increases in 1st SFT run | Loss curve from Sprint 111a |

If any kill criterion triggers, OpenClaw-RL tier is disabled and remaining JSONL data is archived for analysis.

---

## Open Questions — RESOLVED

| # | Question | Resolution |
|---|----------|------------|
| Q1 | OpenClaw Tinker API: cloud key required or self-hosted? | **N/A — Tinker dead.** `tinker.build` is a parked GoDaddy domain (2026-03-16). Replaced by HuggingFace TRL — no API key required. |
| Q2 | VRAM budget for training on MacBook vs RTX 5090 | **MPS (MacBook M-series): ~2–4h per 200 steps, Qwen2.5-7B + LoRA rank 16.** For faster iteration use `Qwen2.5-3B-Instruct`. RTX 5090 optional: ~20–30min same steps. No minimum VRAM requirement — TRL MPS path works without GPU. |
| Q3 | Training window: concurrent serving + training vs off-hours? | **TRL training is local CPU/MPS — no cloud contention.** Can run concurrently with EndiorBot serving. MPS inference and MPS training do share the Neural Engine — off-hours scheduling recommended on MacBook M-series to avoid latency impact during CEO sessions. |
| Q4 | Minimum samples before first training run (Sprint 111a)? | **SFT: 10+ good (reward=+1) records** sufficient for first run. Sprint 111a gate: run `python run.py --method sft` with Sprint 110 JSONL. GRPO (Sprint 111b): 20+ unique prompts for rollout pool. |

---

## References

- `openclaw-trl/run.py` — Primary training entry point (SFT + GRPO via TRL)
- `openclaw-trl/README.md` — Setup + usage guide
- `openclaw-trl/` promoted into EndiorBot repo root (2026-03-16 — OpenClaw-RL nested repo removed)
- Sprint 110: `src/rl/` module — capture infrastructure (👍/🔄/👎 keyboard, JSONL store)
- Sprint 111a: first `run.py --method sft` invocation + GRPO setup
- Sprint 111b: Gated rollout (Tier 4, `ENABLE_RL_TIER=true`)
- Sprint 112: Hint/OPD capture (deferred)
- `docs/05-test/rl-validation-set-v1.md` — 80 curated Q&A pairs for kill-criteria measurement

---

**Author**: @architect
**Reviewers**: CTO (9/10 APPROVED 2026-03-15), CPO (APPROVED 2026-03-15)
**Last Updated**: 2026-03-16 (AMENDED — D1/D2/D10 Tinker → TRL, Q1-Q4 updated, openclaw-tinker removed)
