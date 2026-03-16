"""Sprint 111a → GRPO training via HuggingFace TRL.

Pipeline:
  Prompts from ~/.endiorbot/rl-training-data/ (unique prompts from all records)
    → GRPOTrainer: generate G=4 rollouts per prompt (from the policy model directly)
    → Reward function: match formatted prompt against CEO feedback index (+1 / -1)
    → GRPO advantages → gradient update

How rollouts work:
  - TRL GRPOTrainer generates rollouts internally from the policy model being trained.
  - No separate proxy/server needed — GRPOTrainer handles generation + reward scoring.
  - CEO feedback JSONL is indexed by formatted prompt string (apply_chat_template output)
    so reward_fn can look up the CEO's historical preference for each prompt.

Usage:
  python run.py --method grpo
  python run.py --method grpo --max-steps 50

Prerequisites (Sprint 111a gate):
  - 20+ feedback records in ~/.endiorbot/rl-training-data/
  - Policy model downloaded (Qwen/Qwen2.5-7B-Instruct or smaller)
"""

from __future__ import annotations

import logging
import os

from datasets import Dataset

from config import TRLConfig
from data_loader import iter_records, records_to_grpo_prompts

logger = logging.getLogger(__name__)

_GREEN = "\033[32m"
_RESET = "\033[0m"


def _build_feedback_index(data_dir: str, tokenizer) -> dict[str, float]:
    """Build formatted_prompt → reward index from CEO feedback JSONL.

    Key: apply_chat_template(messages, add_generation_prompt=True)
         — same format that GRPOTrainer receives in reward_fn(prompts, ...)
    Value: mean reward across all feedback for that prompt
    """
    index: dict[str, list[float]] = {}
    for record in iter_records(data_dir, good_only=False):
        messages = record.get("messages", [])
        if not messages:
            continue
        # Use the same chat-template format as format_prompt() → GRPOTrainer
        formatted = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True,
        )
        reward = float(record.get("reward", 0))
        index.setdefault(formatted, []).append(reward)
    return {k: sum(v) / len(v) for k, v in index.items()}


def _make_reward_fn(feedback_index: dict[str, float]):
    """Return a GRPO reward function.

    TRL GRPOTrainer calls: reward_fn(prompts, completions) → list[float]
    - prompts: list of prompt strings
    - completions: list of generated strings
    Returns +1.0 / -1.0 per completion.
    """

    def reward_fn(prompts: list[str], completions: list[str], **kwargs) -> list[float]:
        rewards = []
        for prompt, completion in zip(prompts, completions):
            # Try to look up CEO preference from feedback index
            # Fallback: 0.0 (neutral) for unseen prompts
            reward = feedback_index.get(prompt, 0.0)
            rewards.append(float(reward))
        return rewards

    return reward_fn


def run_grpo(config: TRLConfig) -> None:
    try:
        from trl import GRPOConfig, GRPOTrainer
    except ImportError as e:
        raise ImportError(
            "GRPOTrainer requires trl>=0.12.0. Run: pip install 'trl>=0.12.0'"
        ) from e

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, TaskType, get_peft_model

    # Device
    if config.device == "auto":
        if torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"
    else:
        device = config.device
    logger.info("[GRPO] device=%s model=%s", device, config.model_name)

    # Load prompts
    prompts = records_to_grpo_prompts(config.grpo_reward_data_dir)
    if len(prompts) < 20:
        logger.warning(
            "[GRPO] only %d unique prompts found (Sprint 111a gate: 20+). "
            "Collect more CEO feedback before running GRPO.",
            len(prompts),
        )
    logger.info("[GRPO] %d unique prompts loaded", len(prompts))

    # Tokenizer must be initialized before building the feedback index
    # (index keys use apply_chat_template — same format as GRPOTrainer prompt input)
    tokenizer = AutoTokenizer.from_pretrained(config.model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    # Build reward index keyed by formatted prompt string (SF-1 fix)
    feedback_index = _build_feedback_index(config.grpo_reward_data_dir, tokenizer)
    logger.info("[GRPO] feedback index: %d prompt keys", len(feedback_index))

    def format_prompt(example: dict) -> dict:
        prompt_str = tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=True,
        )
        return {"prompt": prompt_str}

    dataset = Dataset.from_list(prompts).map(format_prompt)

    # Model
    dtype = torch.float16 if device == "cuda" else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        config.model_name,
        torch_dtype=dtype,
        device_map=device if device != "mps" else None,
        trust_remote_code=True,
    )
    if device == "mps":
        model = model.to(device)

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

    output_dir = os.path.join(config.output_dir, "grpo")
    grpo_config = GRPOConfig(
        output_dir=output_dir,
        per_device_train_batch_size=config.batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        learning_rate=config.learning_rate,
        max_steps=config.max_steps if config.max_steps > 0 else -1,
        num_generations=config.grpo_num_generations,
        max_new_tokens=config.grpo_max_new_tokens,
        temperature=config.grpo_temperature,
        logging_steps=config.logging_steps,
        save_steps=config.save_steps,
        report_to="wandb" if os.getenv("WANDB_API_KEY") else "none",
        fp16=(device == "cuda"),
    )

    reward_fn = _make_reward_fn(feedback_index)

    trainer = GRPOTrainer(
        model=model,
        args=grpo_config,
        train_dataset=dataset,
        tokenizer=tokenizer,
        reward_funcs=[reward_fn],
    )

    logger.info(
        "%s[GRPO] starting training (steps=%d, G=%d) ...%s",
        _GREEN, config.max_steps, config.grpo_num_generations, _RESET,
    )
    trainer.train()

    final_path = os.path.join(output_dir, "final")
    trainer.save_model(final_path)
    tokenizer.save_pretrained(final_path)
    logger.info("[GRPO] done — saved to %s", final_path)
