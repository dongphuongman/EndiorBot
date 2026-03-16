# Sprint 111a — First TRL Training Run

**Status**: IN PROGRESS
**Date**: 2026-03-16
**Authority**: ADR-033 (TRL path)
**CTO Score**: TBD
**Previous Sprint**: [Sprint 110.5](sprint-110.5-rl-serve-wiring.md) — COMPLETE (CTO 9.2/10)

---

## Goal

Run first SFT training on Sprint 110+ feedback JSONL using HuggingFace TRL.
Establish untrained Qwen2.5-3B-Instruct baseline. Validate loss curve.

---

## Completed (2026-03-16)

### TRL Infrastructure (Track A — COMPLETE)

**Tinker → TRL migration** (`e3f216e`):
- Created `openclaw-trl/` with `run.py`, `sft_train.py`, `grpo_train.py`, `config.py`, `data_loader.py`
- MacBook MPS-compatible (bfloat16, device_map=None for MPS)
- No cloud dependency — `tinker.build` confirmed parked GoDaddy domain (2026-03-16)

**CTO review fixes** (`b79f958`):
- SF-1: `_build_feedback_index` now keyed by `apply_chat_template` output (matches GRPOTrainer prompt format)
- SF-2: dtype=bfloat16 for MPS, bf16=True in TrainingArguments
- F-1: Removed vestigial `ollama_base_url` / `ollama_model` from config

**Sprint 111a messages-threading fix** (`fae86fe`):
- Root cause: `RLRecord.messages` was always `[]` (Sprint 110 design — deferred)
- Fix: thread `msg.content` as `[{role:"user", content}]` through 7-file chain
- `BusConsumer` → opts.request → `telegram-ott-adapter` → `telegram-channel` → `onAgentResponse` → `RLTurn.request` → `RLRecord.messages`

**Repo cleanup** (`76d2b82`):
- `openclaw-trl/` promoted to EndiorBot repo root (tracked by EndiorBot git)
- `OpenClaw-RL/` nested repo removed
- `agency-agents/` removed

---

## In Progress

### Data Collection (Track B)

- Current: 1 record in `~/.endiorbot/rl-training-data/rl-2026-03-15.jsonl` — `messages:[]` (unusable)
- After `fae86fe`: new records will have `messages:[{role:"user",content}]`
- Gate: **10+ usable records** before SFT run

### Model Download (Track C)

- `Qwen/Qwen2.5-3B-Instruct` download attempted — failed due to xet backend bug (Python 3.13)
- Fix: `HF_HUB_DISABLE_XET=1 hf download Qwen/Qwen2.5-3B-Instruct`
- Size: ~6GB to `~/.cache/huggingface/hub/`

---

## Pending

| # | Task | Blocker |
|---|------|---------|
| T1 | Complete Qwen2.5-3B-Instruct download | HF_HUB_DISABLE_XET=1 fix |
| T2 | Collect 10+ good feedback records (use EndiorBot + click 👍) | Normal usage |
| T3 | Score untrained baseline on 80 validation prompts | T1 |
| T4 | First SFT run: `python3 run.py --method sft --max-steps 50` | T1 + T2 |
| T5 | Verify loss curve (non-divergent) | T4 |
| T6 | GRPO run: 20+ prompts, `python3 run.py --method grpo --max-steps 50` | T4 |

---

## Kill Criteria (from ADR-033)

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Explicit feedback rate | <15% after 4 weeks | feedbackReceived / trainableTurns (event log) |
| Win rate vs untrained | <50% after 200 samples | Blinded A/B (10 prompts/role fixed — see validation-set-v1.md) |
| Validation set drop | >10% | 80 Q&A pairs, 4 roles |
| TRL training diverges | Loss increases in 1st SFT run | Loss curve |

---

## Files Changed

| File | Change | Commit |
|------|--------|--------|
| `openclaw-trl/run.py` | NEW — CLI entry point | e3f216e |
| `openclaw-trl/config.py` | NEW — TRLConfig dataclass | e3f216e |
| `openclaw-trl/sft_train.py` | NEW — SFTTrainer (bfloat16 MPS) | e3f216e |
| `openclaw-trl/grpo_train.py` | NEW — GRPOTrainer (apply_chat_template key) | e3f216e |
| `openclaw-trl/data_loader.py` | NEW — JSONL loader | e3f216e |
| `src/bus/types.ts` | ADD `request?` to ChannelSendFn opts | fae86fe |
| `src/bus/consumer.ts` | SET `request=[{role:"user",content}]` for trainable turns | fae86fe |
| `src/channels/telegram/telegram-ott-adapter.ts` | FORWARD `opts.request` | fae86fe |
| `src/channels/telegram/telegram-channel.ts` | PASS `request` to onAgentResponse | fae86fe |
| `src/rl/types.ts` | ADD `request?` to RLTurn | fae86fe |
| `src/rl/feedback-service.ts` | ADD `request?` to AgentResponseParams | fae86fe |
| `src/rl/session-tracker.ts` | USE `turn.request ?? []` for RLRecord.messages | fae86fe |
| `docs/02-design/01-ADRs/ADR-033-*.md` | AMENDED D1/D2/D10/Q1-Q4 Tinker→TRL | e3f216e |
