# EndiorBot Product Vision

---
version: 2.2
status: APPROVED
updated: 2026-03-01
author: CEO + Expert Panel + CTO
---

## Vision Statement

```
EndiorBot v2.0 transforms from a "CEO Power Tool" to an "Autonomous SDLC Agent"
that can run 120+ minute sessions without human intervention while maintaining
full SDLC compliance and self-healing capabilities.
```

### Operational spine (stages & commands)

For **stage alignment (00→05)**, **design–build–test traceability**, and the split between **atomic** CLI/OTT/Web commands and **seamless workflows**, see [`stage-command-workflow-spine.md`](./stage-command-workflow-spine.md). **Full stage index (00→09):** [`docs/README.md`](../README.md).

---

## CEO Vision

```
EndiorBot runs continuously for 1–2+ hours to:
├── Complete each SDLC stage
├── Design → implement in a steady loop
├── Test / fix until done
└── Escalate ONLY on critical issues
```

---

## Autonomy Levels

| Level | Name | Version | Description |
|-------|------|---------|-------------|
| **L1** | Assisted | v1.0 | CEO confirms each step |
| **L2** | Supervised | v1.5 | Context anchoring, checkpoints |
| **L3** | Semi-Autonomous | v1.8 | Stage contracts, patch discipline |
| **L4** | Autonomous | v2.0 | Full 120min+ sessions |

---

## Key Features by Version

### v1.5 - Foundation

| Feature | Description |
|---------|-------------|
| **Context Anchoring** | Prevent context drift via structured injection |
| **Git Time-Travel** | Session state recovery from git |
| **SESSION-PROGRESS.md** | Human-readable progress log |
| **Checkpoint System** | Recoverable checkpoints |
| **Spec Snapshot** | Drift detection (ADR-011) |

```yaml
# anchoring_config.yaml
anchoring_schedule:
  triggers:
    - on_session_start
    - every_15_min
    - on_task_completion
    - on_stage_transition
    - on_escalation
    - on_rollback

anchor_templates:
  identity: "EndiorBot is {identity}. Current sprint: {sprint}. Focus: {focus}"
  sprint_goals: "Sprint {sprint_number} Goals:\n{goals_list}"
  north_star: "North Star: {goal}. Non-negotiables: {constraints}"
```

### v1.8 - Compliance

| Feature | Description |
|---------|-------------|
| **Stage Contracts** | Pre-flight validation before transitions |
| **Patch Discipline** | Incremental, reviewable patches |
| **Risk Scoring** | Heuristic-based risk assessment |
| **Decision Packets** | Blast radius reports for CEO |
| **Event Log** | Append-only audit trail |

```yaml
# stage_contracts.yaml
contracts:
  "02-design → 04-build":
    required_artifacts:
      - path: "docs/02-design/api-spec.yaml"
        checks: [file_exists, valid_openapi_3]
      - path: "docs/02-design/architecture.md"
        checks: [has_sections: ["## Overview", "## Components"]]
      - ADR for major decisions

    auto_checks:
      - lint_design_docs
      - validate_adr_format
      - spec_snapshot_id_matches

    gate: "G2"
```

```yaml
# Patch discipline rules
patch_rules:
  max_lines_per_patch: 100
  one_logical_change: true
  auto_git_commit: true
  rollback_on_test_failure: true
  human_checkpoint_every_n: 5

  write_new_limits:
    max_files_per_stage: 10
    overflow: "BATCH_CONFIRM"
```

### v2.0 - Autonomy

| Feature | Description |
|---------|-------------|
| **Operation-Based Autonomy** | Granular permissions |
| **Non-Blocking Escalation** | Reversible only, parallel work |
| **Dynamic Model Tiering** | Task-appropriate model selection |
| **Autonomous Session Manager** | 120min+ unattended |
| **Test/Fix Loop** | With failure classification |

```yaml
# autonomy_policy.yaml
operations:
  READ:
    autonomy: FULL

  code_generation:
    autonomy: FULL
    constraints: [max_100_loc, require_tests]

  WRITE_NEW:
    autonomy: FULL
    limits:
      max_files_per_stage: 10
      overflow: BATCH_CONFIRM

  WRITE_MODIFY:
    autonomy: BATCH

  file_deletion:
    autonomy: CONFIRM
    escalation_timeout: 5m

  architecture_changes:
    autonomy: ESCALATE
    notify: [@architect, @cto]

  schema_change:
    autonomy: CONFIRM
    irreversibility: HIGH

  deploy_to_production:
    autonomy: NEVER

risk_thresholds:
  auto: 0.3
  batch: 0.6
  confirm: 0.8
  escalate: 1.0
```

```yaml
# model_tiering.yaml
tiers:
  ROUTINE:
    tasks: [lint, format, simple_edits, verify]
    budget: $0.01/task
    models: ["qwen2.5:7b", "claude-haiku"]

  STANDARD:
    tasks: [code_generation, refactoring, tests, bug_fix]
    budget: $0.10/task
    models: ["claude-sonnet-4", "deepseek-r1:32b"]

  COMPLEX:
    tasks: [architecture, multi_file_refactor, debugging, design]
    budget: $0.50/task
    models: ["claude-opus-4"]

escalation_rules:
  - "3 failed attempts → escalate tier"
  - "Security-related → minimum STANDARD"
  - "Architecture decision → COMPLEX only"

session_budget:
  total_usd: 10.00
  per_stage:
    planning: 15%
    design: 25%
    build: 40%
    test_fix: 20%
```

---

## Safety Guards

### 6 P0 Fixes Applied

| # | Fix | Description |
|---|-----|-------------|
| 1 | Gate A = Plan-Only | applyPatch() disabled in v1.5 |
| 2 | WRITE_NEW Limits | max 10 files/stage, 25/session |
| 3 | Non-Blocking = Reversible Only | Core arch → MUST BLOCK |
| 4 | Spec Snapshot | SHA256, drift → PAUSE |
| 5 | Risk Scoring | Heuristic formula with thresholds |
| 6 | Decision Packets | Blast radius for CEO |

### 6 CTO P0 Additions

| # | Fix | Description |
|---|-----|-------------|
| 1 | Gate A Path Policy | `docs/**` only, no `src/**` |
| 2 | Stage 03 Mandatory | 01→02→**03**→04→05 |
| 3 | 2-Tier Verify | patch_small vs patch_build |
| 4 | Event-Based Anchoring | time/event triggers, not turns |
| 5 | Model Tiering Cap | Opus ≤20min/$3 per session |
| 6 | Failure Evidence | DESIGN_ISSUE needs ≥2 evidence |

### 4 Hard Guards

| Guard | Description |
|-------|-------------|
| **Spec Snapshot** | Drift detection via SHA256 |
| **Risk Scoring** | Measurable, not "idea" |
| **Blast Radius** | CEO sees impact before confirm |
| **Per-Stage Budget** | Prevent runaway costs |

---

## Golden Scenarios

### Gate A: Design Only
```bash
endiorbot autopilot "Design user authentication" \
  --gate A --duration 30m --budget 2

# ✅ Creates planning + design artifacts
# ✅ Validates specs
# ✅ Updates SESSION-PROGRESS.md
# ❌ NO code writes
```

### Gate B: Limited Writes
```bash
endiorbot autopilot "Implement user model" \
  --gate B --duration 30m --budget 3 --max-files 10

# ✅ Max 10 new files
# ✅ Patch discipline enforced
# ✅ Decision packets generated
# ✅ Checkpoint commits
```

### Gate C: Full Autonomy
```bash
endiorbot autopilot "Build complete auth system" \
  --gate C --duration 2h --budget 10

# ✅ Full SDLC loop (01→02→03→04→05)
# ✅ 120+ min session
# ✅ < 3 escalations
# ✅ AER > 30 min/escalation
```

---

## Success Metrics

| Metric | v1.0 | v1.5 | v1.8 | v2.0 |
|--------|------|------|------|------|
| **Session duration** | 30 min | 60 min | 60 min | 120+ min |
| **Context retention** | 50% | 85% | 90% | 95% |
| **Recovery success** | 0% | 90% | 95% | 98% |
| **SDLC compliance** | Reactive | Reactive | Proactive | Proactive |
| **Patch reviewability** | N/A | N/A | 100% | 100% |
| **Human interventions** | Frequent | Moderate | Minimal | Rare |
| **Cost efficiency** | Baseline | -10% | -25% | -40% |
| **AER** | N/A | 10 min | 15 min | 30 min |
| **Hallucination recovery** | 0% | 50% | 70% | 80% |

---

## Roadmap

| Version | Sprint | Hours | Focus |
|---------|--------|-------|-------|
| v1.0 | 61-62 | 34h | Init, Compliance, CEO Power Tool |
| v1.5 | 65 | 34h | Foundation: Context + Recovery |
| v1.8 | 68 | 40h | Compliance: Contracts + Patch |
| v2.0 | 72 | 80h | Autonomy: Full SDLC loop |

**Total Post-v1.0: ~154h**

---

## Source Directories

```
src/
├── anchoring/              # v1.5
│   ├── injection-engine.ts
│   └── templates/
├── state/                  # v1.5
│   ├── git-recovery.ts
│   └── checkpoint.ts
├── progress/               # v1.5
│   └── session-progress.ts
├── contracts/              # v1.8
│   ├── stage-contract-engine.ts
│   └── preflight-validator.ts
├── patch/                  # v1.8
│   ├── patch-manager.ts
│   ├── risk-scorer.ts
│   └── decision-packet.ts
├── autonomy/               # v2.0
│   ├── operation-policy.ts
│   └── escalation-queue.ts
├── models/                 # v2.0
│   └── tiering.ts
└── session/                # v2.0
    └── autonomous-manager.ts
```

---

## ADR List

| ADR | Title | Sprint |
|-----|-------|--------|
| ADR-006 | Checkpoint Architecture | 65 |
| ADR-007 | Patch Discipline | 65 |
| ADR-008 | Concurrency Model | 68 |
| ADR-009 | Model Tiering Strategy | 72 |
| ADR-010 | Escalation Queue | 72 |
| ADR-011 | Spec Snapshot & Drift Policy | 65 |

---

## Approval Status

| Stakeholder | Status |
|-------------|--------|
| CEO | ✅ Vision Approved |
| Expert #1 (Architecture) | ✅ A+++ Rating |
| Expert #2 (Pragmatic) | ✅ Approved with P0 fixes |
| CTO | ✅ Signed Off |

---

*EndiorBot Product Vision*
*SDLC Framework v6.2.0 compliant*
