"""Sprint 110 → SFT training via HuggingFace TRL.

Pipeline:
  ~/.endiorbot/rl-training-data/rl-*.jsonl (good responses, reward=+1)
    → SFTTrainer (cross-entropy on assistant turns only)
    → LoRA checkpoint in output_dir

No cloud dependency. Runs on:
  - Apple Silicon MacBook (MPS): ~2–4h for 200 steps on Qwen2.5-7B with LoRA
  - RTX 5090: ~20–30min (optional acceleration)
  - CPU fallback: slow but functional for testing

Usage:
  python run.py --method sft
  python run.py --method sft --model-name Qwen/Qwen2.5-3B-Instruct --max-steps 100
"""

from __future__ import annotations

import logging
import os

from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from trl import SFTTrainer

from config import TRLConfig
from data_loader import records_to_sft_examples

logger = logging.getLogger(__name__)


def _resolve_device(device: str) -> str:
    if device != "auto":
        return device
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def run_sft(config: TRLConfig) -> None:
    device = _resolve_device(config.device)
    logger.info("[SFT] device=%s model=%s", device, config.model_name)

    # Load data
    examples = records_to_sft_examples(config.sft_data_dir, good_only=config.sft_good_only)
    if not examples:
        raise RuntimeError(
            f"No training examples found in {config.sft_data_dir}. "
            "Collect CEO 👍 feedback first (need reward=+1 records)."
        )
    logger.info("[SFT] loaded %d examples (good_only=%s)", len(examples), config.sft_good_only)

    dataset = Dataset.from_list(examples)

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(config.model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    # Model — dtype per device (SF-2: bfloat16 preferred on MPS, Apple Silicon M2+)
    import torch
    if device == "cuda":
        dtype = torch.float16
    elif device == "mps":
        dtype = torch.bfloat16   # MPS bf16 native on M2+; avoids float16 NaN issues
    else:
        dtype = torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        config.model_name,
        dtype=dtype,  # transformers>=4.47: torch_dtype → dtype
        device_map=device if device != "mps" else None,
        trust_remote_code=True,
    )
    if device == "mps":
        model = model.to(device)

    # LoRA
    if config.use_lora:
        lora_cfg = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=config.lora_rank,
            lora_alpha=config.lora_alpha,
            target_modules=config.lora_target_modules,
            lora_dropout=0.05,
            bias="none",
        )
        model = get_peft_model(model, lora_cfg)
        model.print_trainable_parameters()

    # Training args
    output_dir = os.path.join(config.output_dir, "sft")
    args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=config.batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        learning_rate=config.learning_rate,
        max_steps=config.max_steps if config.max_steps > 0 else -1,
        num_train_epochs=config.num_epochs,
        logging_steps=config.logging_steps,
        save_steps=config.save_steps,
        report_to="wandb" if os.getenv("WANDB_API_KEY") else "none",
        run_name="openclaw-sft",
        fp16=(device == "cuda"),
        bf16=(device == "mps"),   # SF-2: enable bf16 on MPS (Apple Silicon M2+)
        dataloader_num_workers=0,
        resume_from_checkpoint=config.resume_from_checkpoint or None,
    )

    def formatting_fn(example):
        """Format messages list as chat template string."""
        return tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )

    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=dataset,
        processing_class=tokenizer,  # trl>=0.12: tokenizer → processing_class
        formatting_func=formatting_fn,
        max_seq_length=config.max_seq_length,
    )

    logger.info("[SFT] starting training (steps=%d) ...", config.max_steps)
    trainer.train(resume_from_checkpoint=config.resume_from_checkpoint or None)

    final_path = os.path.join(output_dir, "final")
    trainer.save_model(final_path)
    tokenizer.save_pretrained(final_path)
    logger.info("[SFT] done — saved to %s", final_path)
