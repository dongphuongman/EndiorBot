# Current Sprint: Sprint 111a — First TRL Training Run

**Sprint Duration**: March 2026
**Sprint Goal**: Run first SFT training on Sprint 110+ JSONL → establish untrained Qwen baseline → GRPO setup
**Status**: 🚀 IN PROGRESS
**Priority**: P1
**Framework**: SDLC 6.1.2
**Authority**: ADR-033 (amended 2026-03-16 — Tinker → TRL)
**Previous Sprint**: Sprint 110.5 COMPLETE — CTO 9.2/10 APPROVED
**ADR**: [ADR-033](../../02-design/01-ADRs/ADR-033-OpenClaw-RL-Training-Architecture.md)

---

## Sprint 111a Deliverables

### Track A: TRL Infrastructure (COMPLETE)

| # | Deliverable | Status | Commit |
|---|------------|--------|--------|
| 1 | Replace openclaw-tinker with HuggingFace TRL (`openclaw-trl/`) | ✅ COMPLETE | `e3f216e` |
| 2 | CTO SF-1 fix: reward_fn key mismatch (json.dumps → apply_chat_template) | ✅ COMPLETE | `b79f958` |
| 3 | CTO SF-2 fix: bfloat16 for MPS (Apple Silicon M2+) | ✅ COMPLETE | `b79f958` |
| 4 | CTO F-1 fix: remove vestigial ollama_base_url / ollama_model fields | ✅ COMPLETE | `b79f958` |
| 5 | ADR-033 amended: D1/D2/D10/Q1-Q4 Tinker → TRL | ✅ COMPLETE | `e3f216e` |
| 6 | Sprint 111a messages-threading fix: `RLRecord.messages` populated from `msg.content` | ✅ COMPLETE | `fae86fe` |
| 7 | `openclaw-trl/` promoted to EndiorBot repo root (OpenClaw-RL nested repo removed) | ✅ COMPLETE | `76d2b82` |

### Track B: Data Collection (IN PROGRESS)

| # | Deliverable | Status |
|---|------------|--------|
| 8 | Collect 10+ good feedback records (reward=+1, messages non-empty) | 🔄 0/10 usable (old record has `messages:[]`) |
| 9 | Verify JSONL format: `schema_version:1`, `messages` non-empty, `response` non-empty | ⏳ PENDING (needs real records) |

### Track C: Model + Training (IN PROGRESS)

| # | Deliverable | Status |
|---|------------|--------|
| 10 | Download `Qwen/Qwen2.5-3B-Instruct` (~6GB) | 🔄 IN PROGRESS — retry with `HF_HUB_DISABLE_XET=1` |
| 11 | Score untrained Qwen baseline on 80 validation prompts | ⏳ PENDING (after download) |
| 12 | First SFT training run: `python3 run.py --method sft --model-name Qwen/Qwen2.5-3B-Instruct --max-steps 50` | ⏳ PENDING (needs 10+ records + model) |
| 13 | Loss curve: verify decreasing (kill criterion: divergence = disable RL tier) | ⏳ PENDING |

### Track D: GRPO Setup (PLANNED — after SFT validated)

| # | Deliverable | Status |
|---|------------|--------|
| 14 | Collect 20+ unique prompts for GRPO rollout pool | ⏳ PLANNED (needs Track B) |
| 15 | First GRPO run: `python3 run.py --method grpo --max-steps 50` | ⏳ PLANNED |

---

## Sprint 111a Commands Reference

```bash
# Download model (use HF_HUB_DISABLE_XET=1 to avoid xet backend bug on Python 3.13)
HF_HUB_DISABLE_XET=1 hf download Qwen/Qwen2.5-3B-Instruct

# SFT training (after 10+ good feedback records collected)
cd openclaw-trl
python3 run.py --method sft --model-name Qwen/Qwen2.5-3B-Instruct --max-steps 50

# GRPO training (after 20+ unique prompts collected)
python3 run.py --method grpo --model-name Qwen/Qwen2.5-3B-Instruct --max-steps 50

# Check existing feedback records
cat ~/.endiorbot/rl-training-data/rl-*.jsonl | python3 -c \
  "import sys,json; [print(r.get('feedback_label'), bool(r.get('messages')), r.get('response','')[:40]) \
   for l in sys.stdin for r in [json.loads(l)] if l.strip()]"
```

---

## Sprint 111a Definition of Done

- [ ] `pnpm build` clean
- [ ] 14 RL tests pass (session-tracker ×6, feedback-service ×5, data-store ×3)
- [ ] 10+ usable good feedback records (messages non-empty)
- [ ] Model downloaded: `Qwen/Qwen2.5-3B-Instruct` in HuggingFace cache
- [ ] SFT run completes without divergence (loss curve visible)
- [ ] Untrained baseline score recorded (80 validation prompts)
- [ ] `python3 run.py --method grpo --max-steps 10` starts (Sprint 111b: full GRPO run)

---

## Deferred: Sprint 108 — Async Notifications (PLANNED)

Sprint 108 is independent from RL. Will schedule after Sprint 111.

| Deliverable | Status |
|-------------|--------|
| `notifyFn?: ChannelSendFn` in `BusInboundMessage` | PLANNED |
| `telegram-ott-adapter.ts` — set `busMsg.notifyFn = replyFn` | PLANNED |
| Zalo bus + debounce wiring | PLANNED |
| 15 tests | PLANNED |

---

**Last Updated**: 2026-03-16 (Track A COMPLETE — TRL infra + messages threading; Track B/C in progress)
