# OpenClaw TRL

HuggingFace TRL-based training for EndiorBot RL-by-Chat loop.

**Replaces** `openclaw-tinker` (removed 2026-03 — tinker.build parked domain).

No cloud dependency. Runs on MacBook (Apple Silicon MPS), RTX 5090, or CPU.

## Methods

| Method | Flag | Sprint | Data | Description |
|--------|------|--------|------|-------------|
| **SFT** | `--method sft` | Sprint 110+ | `rl-*.jsonl` (reward=+1) | Offline reward-filtered distillation via `SFTTrainer` |
| **GRPO** | `--method grpo` | Sprint 111a+ | Same JSONL + Ollama rollouts | Online RL via `GRPOTrainer` (CEO feedback as reward) |

## Quick Start

```bash
cd OpenClaw-RL/openclaw-trl/
pip install -r requirements.txt

# SFT — offline distillation on Sprint 110 good responses (no GPU required):
python run.py --method sft

# GRPO — online RL (requires Ollama + 20+ feedback records):
ollama serve  # separate terminal
ollama pull qwen2.5:7b
python run.py --method grpo
```

## Architecture

```
run.py                CLI entry point (--method sft|grpo)
├── config.py         TRLConfig dataclass (all parameters)
├── data_loader.py    Load ~/.endiorbot/rl-training-data/rl-*.jsonl
├── sft_train.py      SFTTrainer (cross-entropy on good responses)
└── grpo_train.py     GRPOTrainer (GRPO with Ollama rollouts + CEO reward)
```

## Data Format

Input: `~/.endiorbot/rl-training-data/rl-{YYYY-MM-DD}.jsonl`

```json
{
  "schema_version": 1,
  "session_id": "rl-telegram-...",
  "turn_id": 1,
  "messages": [{"role": "user", "content": "..."}],
  "response": "...",
  "feedback_label": "good",
  "reward": 1,
  "provider": "claude-code",
  "feedback_status": "received"
}
```

SFT uses: `good` records only (`reward=+1`). Cross-entropy on `response`.
GRPO uses: all records for prompt pool + CEO reward index.

## SFT — Offline Distillation

```
Sprint 110 JSONL (provider=claude-code, CEO 👍)
  → reward-filter: good responses only (reward=+1)
  → SFTTrainer: cross-entropy on assistant turn
  → LoRA checkpoint: ./runs/openclaw-trl/sft/final/
```

**Why SFT first:** Sprint 110 records contain Claude's responses (not Qwen's own outputs).
Feeding them to GRPO would be invalid (no on-policy log-probs). SFT distillation is correct.

## GRPO — Online RL (Sprint 111a+)

```
Unique prompts from JSONL (CEO's real questions)
  → GRPOTrainer: generate G=4 Qwen responses per prompt (via local model)
  → Reward function: match against CEO feedback index (+1/-1)
  → GRPO advantages → LoRA update
  → LoRA checkpoint: ./runs/openclaw-trl/grpo/final/
```

**Why Qwen for rollouts:** GRPO requires the policy model's own outputs with log-probs.
We use the Qwen model being trained (not Ollama as inference server, but the TRL model directly).

## Device Support

| Device | Performance | Notes |
|--------|------------|-------|
| Apple Silicon MPS | ~2–4h / 200 steps (7B + LoRA) | Default on MacBook M-series |
| RTX 5090 (CUDA) | ~20–30min / 200 steps | Optional acceleration |
| CPU | Very slow (testing only) | Works, not recommended for full runs |

For small experiments on MacBook, use `Qwen/Qwen2.5-3B-Instruct` (`--model-name`).

## Sprint Gates

| Sprint | Gate | Command |
|--------|------|---------|
| Sprint 110 | 1+ feedback record | `ls ~/.endiorbot/rl-training-data/` |
| Sprint 111a | 20+ feedback records | `python run.py --method sft` |
| Sprint 111b | SFT checkpoint + win rate >50% | `python run.py --method grpo` |

## References

- ADR-033: OpenClaw-RL Training Architecture
- `src/rl/` — EndiorBot TypeScript capture infrastructure
- `~/.endiorbot/rl-training-data/` — Sprint 110 JSONL (CEO feedback)
- HuggingFace TRL docs: https://huggingface.co/docs/trl
