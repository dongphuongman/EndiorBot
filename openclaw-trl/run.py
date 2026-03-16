#!/usr/bin/env python3
"""OpenClaw TRL — unified entry point.

Replaces openclaw-tinker (tinker.build dead as of 2026-03).
Uses HuggingFace TRL: no cloud dependency, MacBook-compatible.

Methods:
  sft   Sprint 110 JSONL → SFTTrainer (offline reward-filtered distillation)
  grpo  Sprint 111a+    → GRPOTrainer (online RL with CEO feedback as reward)

Usage:
  # SFT (Sprint 110 data — immediate, no GPU required):
  python run.py --method sft

  # GRPO (Sprint 111a — requires 20+ feedback records):
  python run.py --method grpo

  # Override model (smaller for faster iteration on MacBook):
  python run.py --method sft --model-name Qwen/Qwen2.5-3B-Instruct --max-steps 100

Environment variables:
  WANDB_API_KEY  — optional, enables W&B logging
"""

from __future__ import annotations

import argparse
import logging
import sys

from config import TRLConfig

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def parse_args() -> TRLConfig:
    p = argparse.ArgumentParser(description="OpenClaw TRL trainer (SFT / GRPO)")

    p.add_argument("--method", choices=["sft", "grpo"], default="sft",
                   help="Training method: sft (offline distillation) or grpo (online RL)")
    p.add_argument("--model-name", default=TRLConfig.model_name)
    p.add_argument("--no-lora", action="store_true", help="Disable LoRA (full fine-tune)")
    p.add_argument("--lora-rank", type=int, default=TRLConfig.lora_rank)
    p.add_argument("--learning-rate", type=float, default=TRLConfig.learning_rate)
    p.add_argument("--batch-size", type=int, default=TRLConfig.batch_size)
    p.add_argument("--max-steps", type=int, default=TRLConfig.max_steps)
    p.add_argument("--num-epochs", type=int, default=TRLConfig.num_epochs)
    p.add_argument("--output-dir", default=TRLConfig.output_dir)
    p.add_argument("--sft-data-dir", default=TRLConfig.sft_data_dir)
    p.add_argument("--grpo-reward-data-dir", default=TRLConfig.grpo_reward_data_dir)
    p.add_argument("--grpo-num-generations", type=int, default=TRLConfig.grpo_num_generations)
    p.add_argument("--save-steps", type=int, default=TRLConfig.save_steps)
    p.add_argument("--resume-from-checkpoint", default="")
    p.add_argument("--device", default=TRLConfig.device,
                   help="Device: auto (default), mps, cuda, cpu")

    args = p.parse_args()

    return TRLConfig(
        method=args.method,
        model_name=args.model_name,
        use_lora=not args.no_lora,
        lora_rank=args.lora_rank,
        learning_rate=args.learning_rate,
        batch_size=args.batch_size,
        max_steps=args.max_steps,
        num_epochs=args.num_epochs,
        output_dir=args.output_dir,
        sft_data_dir=args.sft_data_dir,
        grpo_reward_data_dir=args.grpo_reward_data_dir,
        grpo_num_generations=args.grpo_num_generations,
        save_steps=args.save_steps,
        resume_from_checkpoint=args.resume_from_checkpoint,
        device=args.device,
    )


def main() -> None:
    config = parse_args()

    logger.info("OpenClaw TRL | method=%s | model=%s", config.method, config.model_name)

    if config.method == "sft":
        from sft_train import run_sft
        run_sft(config)
    elif config.method == "grpo":
        from grpo_train import run_grpo
        run_grpo(config)
    else:
        logger.error("Unknown method: %s", config.method)
        sys.exit(1)


if __name__ == "__main__":
    main()
