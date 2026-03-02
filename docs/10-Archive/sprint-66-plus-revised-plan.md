# Sprint 66+ Revised Plan (Post-Research Analysis)

---
**Status**: PROPOSED
**Date**: 2026-03-01
**Author**: CTO + Architect
**Authority**: Master Plan v4.2, Research "Autonomous SDLC Agent", ADR-015
**Supersedes**: Original Sprint 66-67 plan in Master Plan v4.1

---

## Executive Summary

Based on research report analysis and CEO feedback, **revising Sprint 66-72** to incorporate:

✅ **Accept from Research** (aligned with CEO tool identity):
- Dual-output retrieval logger (human + machine)
- Typed ranking reasons (contract-based explainability)
- Spec snapshot boosting (not just drift detection)
- Stage/role-aware retrieval
- Enhanced AER metrics (TCR, RR, Cost)

❌ **Defer from Research** (platform features, not v1-v2):
- Intent Envelope signatures → Bflow/NQH-Bot
- Semantic embeddings → Post-v2.0, conditional
- L5 Collaborative Teams → Post-v2.0

---

## Current State (Sprint 65)

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 61-62 | Init + Compliance | ✅ COMPLETE |
| Sprint 63-64 | Code Search Foundation | ✅ COMPLETE (RgProvider, AstGrepProvider stub, basic logging) |
| **Sprint 65** | **Context Anchoring** | 🔄 CURRENT |

**Sprint 65 goals**:
- SESSION-PROGRESS.md generation
- Spec Snapshot (ADR-011)
- Git Time-Travel
- Checkpoint system

**Sprint 65 NEW additions** (from research):
- ✅ Dual-output logger (JSONL + MD)
- ✅ RankingReason enum (ADR-015)
- ✅ Benchmark Scenario #5 (anti-pattern)

---

## Revised Sprint 66-72 Roadmap

### Sprint 66: Retrieval Intelligence (3 weeks, ~40h)

**Goal**: Complete Code Search Layer with explainability and context-awareness.

**Phase 1: Dual-Output Logger** (Week 1, 10h)
- [ ] Implement `RetrievalLogger` class
  - Human output: `SESSION-PROGRESS.md` (enhanced)
  - Machine output: `retrieval-log.jsonl` (NEW)
- [ ] JSONL format per ADR-015
- [ ] Per-session log rotation
- [ ] Integration with RgProvider and AstGrepProvider

**Phase 2: Spec Snapshot Boosting** (Week 1-2, 8h)
- [ ] Read `spec_snapshot.yaml` sources
- [ ] Boost ranking for snapshot-matching paths (+30%)
- [ ] Add SPEC_SNAPSHOT_MATCH reason code
- [ ] Gate A/B scope restriction (plan-only / limited writes)

**Phase 3: Stage/Role-Aware Retrieval** (Week 2, 10h)
- [ ] Implement `applyStageRoleBoost()` in retrieval-policy.ts
- [ ] Stage patterns:
  - 01-planning → docs/01-planning/**
  - 02-design → docs/02-design/**, ADR-*.md
  - 04-build → src/**, lib/**
  - 05-test → tests/**, *.test.ts
- [ ] Role patterns:
  - @architect → docs/02-design/**, ADR-*.md
  - @coder → src/**, lib/**
  - @reviewer → src/**, tests/**
  - @tester → tests/**
- [ ] Add STAGE_BOOST, ROLE_BOOST reason codes

**Phase 4: AstGrepProvider Full Implementation** (Week 3, 12h)
- [ ] Execute Benchmark Scenario #5
- [ ] If precision ≥90%: Full implementation
- [ ] If precision <80%: Defer to Sprint 68
- [ ] Create `.ast-grep/rules/`:
  - no-any-type.yml
  - unused-exports.yml
  - no-direct-destructive-ops.yml
  - refactor-catch-to-async.yml
- [ ] Add AST_STRUCTURAL_MATCH reason code

**Deliverables**:
- ✅ Dual-output retrieval logger
- ✅ Spec snapshot boosting
- ✅ Stage/role-aware filtering
- ✅ AstGrepProvider (conditional on benchmark)
- ✅ retrieval-log.jsonl format defined

**Success Criteria**:
- [ ] 100% of searches logged (human + machine)
- [ ] Spec boost: +20% relevance for design stage
- [ ] Stage/role boost: +15% relevance for matching paths
- [ ] ast-grep precision ≥90% (if implemented)
- [ ] CEO can query JSONL for analytics in <5min

---

### Sprint 67: Conditional - Zoekt Scale-Up (2 weeks, 20h)

**Trigger**: BFlow 1M+ LOC benchmark shows P95 latency >2s with ripgrep.

**Goal**: Add ZoektProvider for million-LOC scale repos (if needed).

**Phase 1: Zoekt Benchmark** (Week 1, 8h)
- [ ] Set up Zoekt index on BFlow codebase (1M+ LOC)
- [ ] Run P95 latency benchmark
- [ ] Compare vs ripgrep (current)
- [ ] **Decision point**: If P95 ≤2s with rg → SKIP Sprint 67

**Phase 2: ZoektProvider** (Week 2, 12h) - CONDITIONAL
- [ ] Implement `ZoektProvider` class
- [ ] Trigram indexing setup
- [ ] Add TRIGRAM_MATCH reason code
- [ ] Index management (create, update, invalidate)
- [ ] Provider selection logic (rg → ast-grep → zoekt)

**Deliverables** (if triggered):
- ✅ ZoektProvider implementation
- ✅ Index management tooling
- ✅ Provider selection policy

**Success Criteria** (if triggered):
- [ ] P95 latency <2s on 1M+ LOC repos
- [ ] Index rebuild <10min
- [ ] Query latency <500ms

**If NOT triggered**: Sprint 67 is skipped, move to Sprint 68 directly.

---

### Sprint 68: Stage Contracts & Patch Discipline (v1.8, 5 weeks, ~40h)

**Goal**: Compliance layer - controlled autonomy with safety guards.

**Phase 1: Stage Contracts** (Week 1-2, 16h)
- [ ] Implement `StageContractEngine` class
- [ ] Define `stage_contracts.yaml` schema
- [ ] Pre-flight validation before transitions
- [ ] Contracts for:
  - 02-design → 04-build (require: api-spec.yaml, architecture.md, ADR)
  - 04-build → 05-test (require: src/** files, unit tests)
  - 05-test → 06-deploy (require: all tests pass, coverage ≥80%)
- [ ] Block invalid transitions

**Phase 2: Patch Discipline** (Week 2-3, 12h)
- [ ] Implement `PatchManager` class
- [ ] Enforce:
  - max_lines_per_patch: 100
  - one_logical_change: true
  - auto_git_commit: true
  - rollback_on_test_failure: true
- [ ] Integrate with ActionControlPlane

**Phase 3: Decision Packets** (Week 3-4, 8h)
- [ ] Implement `DecisionPacket` generator
- [ ] Include:
  - Blast radius (files created/modified/deleted, LOC delta)
  - Risk score (heuristic formula)
  - Irreversibility score
  - Rollback command
  - Evidence (spec snapshot ID, tests passed, lint passed, coverage)
- [ ] CEO confirmation flow

**Phase 4: 2-Tier Verify Strategy** (Week 4-5, 4h)
- [ ] Fast verify: `tsc`, `lint` only
- [ ] Build verify: `tsc`, `lint`, `targeted tests`
- [ ] Stage end verify: `full test suite`

**Deliverables**:
- ✅ StageContractEngine
- ✅ PatchManager
- ✅ DecisionPacket generator
- ✅ 2-tier verify strategy

**Success Criteria**:
- [ ] 100% stage transitions validated
- [ ] Patch reviewability: 100% (<100 LOC per patch)
- [ ] CEO decision time: <2min per decision packet
- [ ] Zero invalid transitions

---

### Sprint 69-71: Session Resilience (3 weeks, ~30h)

**Goal**: Autonomous session manager with recovery and checkpointing.

**Phase 1: Session State Machine** (Week 1, 10h)
- [ ] Implement `SessionManager` class
- [ ] States: INIT → PLANNING → DESIGN → BUILD → TEST → DONE → ERROR
- [ ] State transitions logged to event-log
- [ ] Session resume from checkpoint

**Phase 2: Checkpoint System** (Week 2, 10h)
- [ ] Auto-checkpoint every 5 patches
- [ ] Git checkpoint commits: `auto/session-{id}/checkpoint-{n}`
- [ ] Checkpoint metadata:
  - Stage, task list, spec snapshot ID
  - Files created/modified in this checkpoint
  - Rollback command
- [ ] Recovery: `endiorbot resume <session-id> --from-checkpoint <n>`

**Phase 3: Failure Classification** (Week 3, 10h)
- [ ] Implement failure detection:
  - TRANSIENT: Network timeout, API rate limit → retry
  - FIXABLE: Lint error, test failure → fix loop (max 3 attempts)
  - DESIGN_ISSUE: Spec mismatch, breaking change → escalate
- [ ] Evidence-based escalation (≥2 evidence types required)
- [ ] Auto-rollback on DESIGN_ISSUE

**Deliverables**:
- ✅ SessionManager with state machine
- ✅ Checkpoint system
- ✅ Failure classification
- ✅ Auto-recovery for TRANSIENT/FIXABLE

**Success Criteria**:
- [ ] Recovery success rate ≥95% for TRANSIENT
- [ ] Recovery success rate ≥70% for FIXABLE
- [ ] Zero DESIGN_ISSUE false positives
- [ ] CEO resume time <30s

---

### Sprint 72: Autonomy & AER Metrics (v2.0, 4 weeks, ~40h)

**Goal**: Full autonomous SDLC loop with observability.

**Phase 1: Enhanced AER Metrics** (Week 1, 10h)
- [ ] Implement `AERCalculator` class
- [ ] Parse `retrieval-log.jsonl` for metrics
- [ ] Calculate:
  - **TCR (Task Completion Rate)**: % tasks done without intervention
  - **Tool Choice Accuracy**: % correct tool selections
  - **RR (Recovery Rate)**: % failures self-healed
  - **Cost per Task**: Total cost / tasks completed
  - **Autonomy Time**: Time between escalations
- [ ] CLI: `endiorbot analytics aer`

**Phase 2: Model Tiering Cap** (Week 2, 10h)
- [ ] Implement dynamic model selection
- [ ] Tiers:
  - Tier 1 (Elite): Opus for architecture decisions only
  - Tier 2 (Standard): Sonnet for code/refactor
  - Tier 3 (Efficiency): Haiku for lint/format/simple edits
- [ ] Session budget: $10 total
- [ ] Opus cap: ≤20min / $3 per session
- [ ] Escalate tier after 3 failed attempts

**Phase 3: Autonomous Session Manager** (Week 3, 12h)
- [ ] Implement `AutonomousSessionManager`
- [ ] Full SDLC loop: 01→02→03→04→05
- [ ] 120min+ session capability
- [ ] Non-blocking escalation (reversible only)
- [ ] Conservative choice fallback (when uncertain)

**Phase 4: Golden Scenarios Validation** (Week 4, 8h)
- [ ] Gate A: Design only (30min, $2, docs/** writes only)
- [ ] Gate B: Limited writes (30min, $3, max 10 files)
- [ ] Gate C: Full autonomy (2h, $10, full SDLC loop)
- [ ] Each scenario must pass 3x on 3 sample repos

**Deliverables**:
- ✅ AERCalculator with 5 metrics
- ✅ Model Tiering with Opus cap
- ✅ AutonomousSessionManager
- ✅ Golden scenarios validated

**Success Criteria**:
- [ ] AER ≥30min (time between escalations)
- [ ] TCR ≥70% (task completion without intervention)
- [ ] RR ≥80% (failure recovery rate)
- [ ] Opus usage ≤20min / $3 per session
- [ ] Gate C: <3 escalations in 2h session
- [ ] Context retention ≥95% (no re-explanations)

---

## Comparison: Original vs Revised Plan

| Sprint | Original Plan (v4.1) | Revised Plan (v4.2) | Change |
|--------|----------------------|---------------------|--------|
| 65 | Context Anchoring | Context Anchoring + Retrieval Enhancements | +3 adjustments |
| 66 | Zoekt Scale-Up (conditional) | Retrieval Intelligence (explainability) | **NEW focus** |
| 67 | Zoekt Scale-Up | Zoekt Scale-Up (conditional, unchanged) | Same |
| 68 | Stage Contracts | Stage Contracts + Patch Discipline | Same |
| 69-71 | (not specified) | Session Resilience | **NEW sprint** |
| 72 | Full Autonomy | Autonomy + AER Metrics | Enhanced |

**Key changes**:
1. **Sprint 66 NEW**: Retrieval Intelligence (dual-output, spec boost, stage/role boost)
2. **Sprint 69-71 NEW**: Session Resilience (failure classification, checkpointing)
3. **Sprint 72 ENHANCED**: AER metrics (TCR, RR, Tool Choice, Cost)

---

## Total Effort

| Version | Sprints | Hours | Comment |
|---------|---------|-------|---------|
| **Original (v4.1)** | 66-72 | ~154h | 7 sprints |
| **Revised (v4.2)** | 66-72 | ~170h | +16h for retrieval enhancements |

**Justification for +16h**:
- Dual-output logger: +10h (high ROI for AER metrics)
- Spec/stage/role boosting: +6h (high ROI for relevance)
- Total: +16h (10% increase for 2x observability)

---

## CTO Approval Criteria

Sprint 66-72 approved if:
- [ ] ✅ Aligns with "CEO tool" identity (no over-engineering)
- [ ] ✅ Defers enterprise features (Intent Envelope, L5) to platform
- [ ] ✅ Incremental complexity (simple → full)
- [ ] ✅ High ROI features prioritized (dual-output, spec boost, AER)
- [ ] ✅ Conditional features have clear triggers (Zoekt benchmark)
- [ ] ✅ Total effort ≤200h (revised: 170h ✅)

---

*Sprint 66+ Revised Plan (Post-Research Analysis)*
*SDLC Framework v6.1.1 compliant*
*CEO Tool - Informed by Research, Filtered by Identity*
