"""Load EndiorBot RL training data from JSONL into HuggingFace Dataset format.

Sprint 110 JSONL schema (schema_version: 1):
  {
    "schema_version": 1,
    "session_id": "rl-telegram-...",
    "turn_id": 1,
    "messages": [{"role": "user", "content": "..."}, ...],
    "response": "...",
    "feedback_label": "good" | "bad",
    "reward": 1 | -1,
    "hint": null,
    "provider": "claude-code",
    "feedback_status": "received",
    "timestamp": 1234567890
  }
"""

from __future__ import annotations

import glob
import json
import os
from typing import Iterator


def _expand(path: str) -> str:
    return os.path.expanduser(path)


def iter_records(data_dir: str, good_only: bool = True) -> Iterator[dict]:
    """Yield RLRecord dicts from all JSONL files in data_dir."""
    pattern = os.path.join(_expand(data_dir), "rl-*.jsonl")
    files = sorted(glob.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No rl-*.jsonl files found in {data_dir}")
    for path in files:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if good_only and record.get("reward", 0) != 1:
                    continue
                yield record


def records_to_sft_examples(data_dir: str, good_only: bool = True) -> list[dict]:
    """Convert RLRecords to SFT format: list of {messages: [...], response: str}."""
    examples = []
    for record in iter_records(data_dir, good_only=good_only):
        messages = record.get("messages", [])
        response = record.get("response", "")
        if not messages or not response:
            continue
        # Build full conversation for SFT (prompt + response)
        full_messages = messages + [{"role": "assistant", "content": response}]
        examples.append({"messages": full_messages, "reward": record.get("reward", 1)})
    return examples


def records_to_grpo_prompts(data_dir: str) -> list[dict]:
    """Extract prompts for GRPO rollout from all records (good + bad).

    Returns list of {messages: [user turns only]} for rollout generation.
    Deduplicates by prompt text to avoid over-training on repeated prompts.
    """
    seen: set[str] = set()
    prompts = []
    for record in iter_records(data_dir, good_only=False):
        messages = record.get("messages", [])
        if not messages:
            continue
        key = json.dumps(messages, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        prompts.append({"messages": messages})
    return prompts
