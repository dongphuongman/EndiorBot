"""Configuration for OpenClaw TRL training.

Replaces openclaw-tinker (tinker.build dead as of 2026-03).
Primary path: HuggingFace TRL — MacBook-compatible (MPS / CPU), no cloud dependency.

Two methods:
  sft  — Sprint 110 JSONL → SFTTrainer (offline reward-filtered distillation)
  grpo — Sprint 111a+ → GRPOTrainer (online RL, rollouts from policy model via TRL)
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TRLConfig:
    """Unified config for OpenClaw TRL (SFT + GRPO)."""

    # -- Method --
    method: str = "sft"  # "sft" or "grpo"

    # -- Model --
    model_name: str = "Qwen/Qwen2.5-7B-Instruct"
    use_lora: bool = True
    lora_rank: int = 16
    lora_alpha: int = 32
    lora_target_modules: list[str] = field(
        default_factory=lambda: ["q_proj", "v_proj", "k_proj", "o_proj"]
    )

    # -- Training --
    learning_rate: float = 2e-4
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    max_steps: int = 200
    num_epochs: int = 1
    max_seq_length: int = 2048
    output_dir: str = "./runs/openclaw-trl"

    # -- SFT-specific --
    # Sprint 110 JSONL — good responses only (reward-filtered distillation)
    sft_data_dir: str = "~/.endiorbot/rl-training-data"
    sft_good_only: bool = True  # train on good (reward=+1) responses only

    # -- GRPO-specific --
    # GRPOTrainer generates rollouts from the policy model internally (no external server)
    grpo_num_generations: int = 4    # rollouts per prompt (G in GRPO)
    grpo_max_new_tokens: int = 512
    grpo_temperature: float = 0.7
    grpo_reward_data_dir: str = "~/.endiorbot/rl-training-data"  # CEO feedback JSONL

    # -- Checkpoint --
    save_steps: int = 50
    resume_from_checkpoint: str = ""

    # -- Logging --
    wandb_project: str = "openclaw-trl"
    logging_steps: int = 10

    # -- Device --
    # "auto" → MPS on Apple Silicon, CUDA on GPU server, CPU fallback
    device: str = "auto"
