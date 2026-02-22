---
name: model-usage
description: Track and summarize per-model usage costs for AI models. Useful for monitoring spending across Claude, GPT, and other providers.
metadata:
  emoji: "📊"
  category: monitoring
  tags:
    - cost
    - usage
    - analytics
  requires:
    - name: codexbar
---

# Model Usage

Track per-model usage and costs from CodexBar's local cost logs.

## Overview

Get per-model usage cost from CodexBar's local cost logs. Supports "current model" (most recent daily entry) or "all models" summaries for Codex or Claude.

## Quick Start

```bash
# Current model usage
python scripts/model_usage.py --provider codex --mode current

# All models
python scripts/model_usage.py --provider codex --mode all

# Claude usage as JSON
python scripts/model_usage.py --provider claude --mode all --format json --pretty
```

## Current Model Logic

- Uses the most recent daily row with `modelBreakdowns`.
- Picks the model with the highest cost in that row.
- Falls back to the last entry in `modelsUsed` when breakdowns are missing.
- Override with `--model <name>` when you need a specific model.

## Inputs

Default: runs `codexbar cost --format json --provider <codex|claude>`.

File or stdin:
```bash
codexbar cost --provider codex --format json > /tmp/cost.json
python scripts/model_usage.py --input /tmp/cost.json --mode all
cat /tmp/cost.json | python scripts/model_usage.py --input - --mode current
```

## Output

- Text (default) or JSON (`--format json --pretty`).
- Values are cost-only per model; tokens are not split by model in CodexBar output.

## SDLC Integration

For EndiorBot, track model costs to:
- Monitor per-project spending
- Compare costs across providers
- Identify high-cost operations for optimization

```bash
# Daily cost summary
python scripts/model_usage.py --provider claude --mode all --period day

# Weekly summary
python scripts/model_usage.py --provider claude --mode all --period week
```
