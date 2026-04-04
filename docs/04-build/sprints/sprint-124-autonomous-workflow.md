# Sprint 124 — Autonomous Workflow Integration

**Date:** 2026-03-31
**Status:** PROPOSED (Sprint 124a — CTO split directive)
**Prerequisite:** Sprint 123 COMPLETE (7,501 tests, bootstrap + polyglot + Docker)
**Framework:** SDLC 6.2.1
**Authority:** PM + Architect — CTO 5/10 NEEDS REVISION, split into 124a + 124b

---

## Context

CEO vision: *Seamless workflows for AI-assisted application development — fast, effective, with EndiorBot growing more autonomous over time.*

After Sprint 121–123, EndiorBot had:
- 14 SOUL agents, 4-channel OTT, bootstrap + polyglot detection
- AutonomousSessionManager (Sprint 72) — **built but NOT wired**
- ClawVault memory (Sprint ~80) — **built but ISOLATED**
- ComplianceFixEngine — **built but not exposed in bootstrap flow**
- Consult command — **returns text, no actionable follow-up**

**Problem:** All building blocks existed but ran **in isolation**. The CEO had to wire them manually: consult → manually invoke @coder → manually check compliance → manually close sprint.

**Goal:** Wire the existing systems together — seamless "idea → plan → build → verify" in one flow.

---

## Architecture: Glue Layer

```
                    ┌─────────────────────┐
                    │  endiorbot plan      │ ← NEW: unified entry point
                    │  "add payment API"   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Task Decomposer     │ Uses @pm agent (READ mode)
                    │  → spec + tasks      │ Parses output into actionable items
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Task Queue          │ Already exists (src/sessions/autonomous/)
                    │  → ordered by deps   │ Needs CLI entry point
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │ @architect  │   │  @coder    │   │  @tester   │
     │ design ADR  │   │ implement  │   │ write tests│
     └──────┬─────┘   └──────┬─────┘   └──────┬─────┘
            │                │                 │
            └────────────────┼─────────────────┘
                             ▼
                    ┌────────────────────┐
                    │  compliance check   │ Auto-verify after each task
                    └────────┬───────────┘
                             ▼
                    ┌────────────────────┐
                    │  CEO Checkpoint     │ Escalate if needed, else continue
                    └────────────────────┘
```

---

## 3 Tracks (ordered by CEO impact)

### Track 1: `endiorbot plan` Command ⏱️ 4-5h

**The missing "idea → tasks" bridge.**

CEO says "add payment gateway" → EndiorBot creates:
1. Spec summary (what needs to be built)
2. Task list with agent assignments (@architect, @coder, @tester)
3. Dependency ordering (design before code, code before tests)
4. Estimated effort per task

**Implementation:**
- CREATE: `src/cli/commands/plan.ts` — CLI command
- CREATE: `src/commands/handlers/plan-handler.ts` — shared handler (OTT-compatible)
- Uses: consult (OpenAI expert) for task decomposition
- Uses: existing TaskQueue from `src/sessions/autonomous/`
- Output: structured plan saved to `docs/04-build/sprints/` + printed to CLI

**Input:**
```bash
endiorbot plan "add payment gateway with Stripe integration"
```

**Output:**
```
┌─────────────────────────────────────────────────────────────┐
│  📋 Development Plan                                        │
├─────────────────────────────────────────────────────────────┤
│  Goal: Add payment gateway with Stripe integration          │
│  Tasks: 4 | Estimated: 3-4h                                │
├─────────────────────────────────────────────────────────────┤
│  1. [@architect] Design payment API + ADR                   │
│  2. [@coder] Implement Stripe integration                   │
│  3. [@tester] Write payment flow tests                      │
│  4. [@reviewer] Security review (PCI compliance)            │
└─────────────────────────────────────────────────────────────┘

📋 Action — [E]xecute plan / [M]odify / [S]ave only (default: S):
```

CEO chooses [E] → tasks queued for execution (Track 2).

**OTT parity:**
```
/plan add payment gateway with Stripe
→ "📋 Plan created: 4 tasks. /plan execute to start, /plan show to review."
```

### Track 2: Wire AutonomousSessionManager ⏱️ 3-4h

**Expose the autonomous execution that already exists.**

Sprint 72 built AutonomousSessionManager with:
- Task queue with dependency ordering
- Model tiering (Opus for architecture, Sonnet for coding)
- Budget caps ($10 total, $3 Opus)
- Escalation framework
- Checkpoint + recovery

**Missing:** CLI entry point + integration with consult/plan output.

**Implementation:**
- MODIFY: `src/cli/commands/workflow.ts` — add `workflow execute <plan-id>` subcommand
- WIRE: AutonomousSessionManager → use existing task queue
- WIRE: After each task → auto-run `compliance check` (verification loop)
- WIRE: On failure → FailureClassifier → RecoveryEngine → retry or escalate

**Entry point:**
```bash
endiorbot workflow execute --gate B --budget 5
# Runs tasks from last plan
# Gate B = ASSISTED (CEO reviews critical actions)
# Budget = $5 max
```

### Track 3: Memory Integration (ClawVault → SOUL) ⏱️ 3-4h

**Make agents learn from past sessions.**

ClawVault has:
- `FactStore` — entity-relation-value storage (JSONL)
- `SessionHandoff` — checkpoint serialization
- `ObservationScorer` — relevance scoring

**Missing:** Wire into agent context injection.

**Implementation:**
- MODIFY: `src/bridge/intelligence/context-builder.ts` — load facts from FactStore before agent launch
- MODIFY: `src/agents/orchestrator/` — after agent execution, score + save observations
- Budget: max 500 tokens from memory (within 2K turn budget)

**Flow:**
```
Agent Launch:
  1. Load SOUL template ✓ (existing)
  2. Load Brain L4 ✓ (existing)
  3. Load project context ✓ (existing)
  4. Load relevant facts from ClawVault ← NEW
     → "Last time @coder worked on payments: used Stripe SDK v12, had CORS issues"

Agent Complete:
  5. Score observation (relevance, impact)
  6. Save to FactStore
     → type: "decision", entity: "payment-gateway", fact: "Chose Stripe over PayPal"
```

---

## Execution Order

```
Sprint 124:
├── T1: plan command + handler                              [4-5h]
│   ├── plan-handler.ts (task decomposition via consult)
│   ├── plan.ts (CLI + OTT parity)
│   └── Test: endiorbot plan "add feature X" → structured output
│
├── T2: Wire AutonomousSessionManager                       [3-4h]
│   ├── workflow execute subcommand
│   ├── Connect TaskQueue → agent execution → compliance loop
│   └── Test: workflow execute runs 2+ tasks sequentially
│
├── T3: Memory integration (ClawVault → SOUL)               [3-4h]
│   ├── context-builder.ts loads facts
│   ├── Agent post-execution saves observations
│   └── Test: facts injected into next agent session
│
├── Build + full test suite
└── E2E: plan → execute → verify → memory persists
```

**Total estimated effort:** 10-13h

---

## Acceptance Criteria

| AC | Description | How to Verify |
|----|-------------|---------------|
| AC1 | `endiorbot plan "X"` creates structured task list with agent assignments | Run command, verify output has tasks + agents |
| AC2 | Plan saved to `docs/04-build/sprints/` automatically | Check file created |
| AC3 | `workflow execute` runs tasks from plan sequentially | Execute 2+ tasks, verify sequential completion |
| AC4 | After each task, auto-run `compliance check` | Compliance output appears between tasks |
| AC5 | Budget cap enforced ($5 default, configurable) | Exceed budget → session paused |
| AC6 | ClawVault facts injected into agent SOUL context | Agent output references past decisions |
| AC7 | Agent observations saved after execution | Check `~/.endiorbot/memory/` after agent run |
| AC8 | OTT `/plan` returns plan summary | Test via Telegram/Web |

---

## Out of Scope

| Item | Why | When |
|------|-----|------|
| Full AUTONOMOUS gate (Gate C) | Need more testing at Gate B first | Sprint 126+ |
| Consult → auto-queue | Depends on T1 plan command working first | Sprint 125 |
| Resume from checkpoint | T3 memory saves handoff, resume in next sprint | Sprint 125 |
| Bootstrap auto-comply | Depends on compliance fix engine reliability | Sprint 125 |

---

## Verification

```bash
# T1: Plan command
endiorbot plan "add user authentication with JWT"
# Verify: structured output with 3-4 tasks, agent assignments

# T2: Workflow execution
endiorbot workflow execute --gate B --budget 3
# Verify: tasks run, compliance checked between each

# T3: Memory
# After running plan + execute, check facts:
cat ~/.endiorbot/memory/*/facts.jsonl | head -5
# Verify: observations saved with entity/relation/value

# Full suite
pnpm build && pnpm test  # 7,501+ tests
```

---

## ADR Reference

- **ADR-038**: Autonomous Workflow Integration (plan → execute → verify → remember)
