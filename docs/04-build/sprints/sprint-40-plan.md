# Sprint 40 Detailed Plan - Parallel Execution

**Version**: 2.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Sprint 38-46 Replan)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 39 Complete (Resource Router + Ollama validated)
- ADR-008 Approved (Concurrency Model) — already approved
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 40 implements **Parallel Execution** — 2-3 concurrent task tracks to reduce wall-clock time by 50-60% with file locks preventing conflicts.

### Vision: Faster Autonomous Sessions

```
Current (Sprint 39):  Sequential tasks → 10 min impl + 5 min tests = 15 min total
Sprint 40 Target:     Parallel tracks → impl + tests in parallel → ~8 min (50% faster)
Future (Sprint 41):   Fix logging + pattern review
```

### Why Parallel Tracks?

> **CPO/CTO Requirement**: "2-3 parallel tracks max. Single-process model. File locks prevent conflicts. No over-engineering."

Benefits:
- Reduce wall-clock time 50-60%
- Better resource utilization (I/O-bound AI tasks)
- Single process (no multi-process complexity)
- File locks prevent concurrent edits to same file

Constraints:
- Max 2-3 tracks
- Dependency-aware scheduling (tests after implementation)
- Per-track budget and checkpoint

---

## Sprint Goal

**Enable EndiorBot to run 2-3 independent task tracks concurrently in a single process, with file-level locks and dependency-aware scheduling, integrated with BudgetTracker and CheckpointManager.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 39** | Resource Router + Ollama validated | PLANNED | Sprint 40 start |
| **ADR-008** | Concurrency Model | ✅ APPROVED | - |
| **Single-process** | No multi-process | ✅ DESIGN | Architecture |

### Phase 6 Validation Criteria (Revised)

Sprint 39 → Sprint 40 Gate:
- [ ] Track manager schedules 2-3 parallel tracks
- [ ] File lock manager prevents concurrent edits
- [ ] Dependency scheduler respects task dependencies
- [ ] Wall-clock time reduced 50-60% for independent tasks
- [ ] Per-track budget and checkpoint work
- [ ] E2E: 2 parallel tracks → file lock prevents conflict → merge success

**Gate**: All criteria must PASS before Sprint 41 Day 1.

---

## Sprint 40 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Track Manager + File Locks | file-lock.ts, dependency-graph.ts, track-manager.ts |
| **Week 2** | Scheduler + Integration | dependency-scheduler.ts, parallel-executor.ts, E2E |

**Duration**: 10 working days (2 weeks from Sprint 39 close)

---

## Week 1: Track Manager + File Locks (Day 1-5)

### Day 1-2: File Lock Manager

**Goal**: File-level write locks to prevent concurrent edits.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/infra/file-lock.ts | P0 | FileLockManager: acquire, release, timeout | ~350 |
| Read vs write locks (multiple readers, exclusive writer) | P0 | Same file | - |
| Create tests/infra/file-lock.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] acquireLock(trackId, filePath, 'read' | 'write') → boolean
- [ ] releaseLock(trackId, filePath)
- [ ] acquireWithTimeout(..., timeoutMs) → boolean (default 30s)
- [ ] Write lock: exclusive; read lock: shared
- [ ] Conflict: same file write lock by another track → return false
- [ ] Tests pass: acquisition, release, timeout, conflict
- [ ] Build passes

**Integration Points**:
```
file-lock.ts
    └── Logger (Sprint 34)
```

---

### Day 3: Dependency Graph

**Goal**: Task dependency tracking and ready-task resolution.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/parallel/dependency-graph.ts | P0 | Add task, getReadyTasks, detectCircular | ~350 |
| Create src/agents/parallel/types.ts | P0 | Task, Track, Batch types | ~150 |
| Create tests/agents/parallel/dependency-graph.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] addTask(task), getReadyTasks(completedSet) → Task[]
- [ ] detectCircularDependencies() → string[] (cycle IDs)
- [ ] Task.dependsOn: string[] (task IDs)
- [ ] Tests pass: ordering, circular detection
- [ ] Build passes

---

### Day 4-5: Track Manager Core

**Goal**: Create and manage 2-3 tracks; schedule tasks by dependency and file conflict.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/parallel/track-manager.ts | P0 | scheduleTracks(tasks) → Track[] | ~500 |
| Integrate FileLockManager | P0 | Acquire before task, release after | - |
| Integrate DependencyGraph | P0 | Batches by dependency | - |
| Max 2-3 tracks enforced | P0 | config.maxTracks | - |
| Create tests/agents/parallel/track-manager.test.ts | P0 | Unit tests | ~250 |

**Acceptance Criteria**:
- [ ] scheduleTracks(tasks) returns batches of tracks (each batch parallel)
- [ ] Tasks that touch same file serialized (same batch or sequential batches)
- [ ] maxTracks = 2 or 3 (configurable)
- [ ] Track has: id, taskIds[], status
- [ ] Tests pass: scheduling, file conflict serialization
- [ ] Build passes

**Integration Points**:
```
track-manager.ts
    └── dependency-graph.ts
    └── file-lock.ts (src/infra/)
    └── Logger
```

---

## Week 2: Scheduler + Integration (Day 6-10)

### Day 6-7: Dependency Scheduler + Parallel Executor

**Goal**: Execute batches with Promise.all; per-track budget and checkpoint.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/parallel/dependency-scheduler.ts | P0 | Build batches from dependency graph | ~200 |
| Create src/agents/parallel/parallel-executor.ts | P0 | executeBatch(tracks) with Promise.all | ~350 |
| Per-track budget: BudgetTracker or allocator | P0 | Track cost per track | ~100 |
| Per-track checkpoint: optional checkpoint per batch | P1 | CheckpointManager integration | ~80 |
| Create tests/agents/parallel/parallel-executor.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Scheduler produces ordered batches (batch N+1 depends on batch N complete)
- [ ] Executor runs batch with Promise.all; waits for all before next batch
- [ ] File locks acquired before task run, released after
- [ ] Budget: each track's cost recorded (or shared session budget)
- [ ] Checkpoint: optional save after each batch (for resume)
- [ ] Tests pass: execution order, lock lifecycle
- [ ] Build passes

**Integration Points**:
```
parallel-executor.ts
    └── track-manager.ts
    └── FileLockManager
    └── BudgetTracker (Sprint 36)
    └── CheckpointManager (Sprint 35)
    └── ResourceRouter (Sprint 39) — model per task
```

---

### Day 8-9: CLI + Config

**Goal**: CLI commands and config for parallel execution.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add endiorbot parallel --dry-run | P0 | Show plan without executing | ~150 |
| Add endiorbot parallel | P0 | Execute parallel plan | ~100 |
| Config: maxTracks (2 | 3), timeoutMs | P0 | config/schema.ts | ~40 |
| Create tests/cli/commands/parallel.test.ts | P0 | CLI tests | ~120 |

**Acceptance Criteria**:
- [ ] --dry-run prints batch plan, estimated time, cost
- [ ] parallel runs batches and reports wall-clock vs sequential estimate
- [ ] Config: agents.parallel.maxTracks, agents.parallel.lockTimeoutMs
- [ ] Build passes

---

### Day 10: E2E + G-Sprint-40

**Goal**: Full E2E and gate validation.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: 2 parallel tracks, no file overlap | P0 | tests/e2e/parallel-execution.test.ts | ~150 |
| E2E: 2 tracks, same file → serialized | P0 | Same file | ~80 |
| G-Sprint-40 checklist | P0 | All criteria below | - |

**Acceptance Criteria**:
- [ ] E2E: independent tasks run in parallel; wall-clock < sequential
- [ ] E2E: conflicting file access → one track waits; no data corruption
- [ ] All Sprint 40 acceptance criteria met
- [ ] Build passes, lint clean

---

## Files Created (Sprint 40)

| File | Est. LOC | Purpose |
|------|----------|---------|
| src/infra/file-lock.ts | ~350 | File-level locks |
| src/agents/parallel/types.ts | ~150 | Task, Track, Batch |
| src/agents/parallel/dependency-graph.ts | ~350 | Dependencies |
| src/agents/parallel/track-manager.ts | ~500 | Track scheduling |
| src/agents/parallel/dependency-scheduler.ts | ~200 | Batch building |
| src/agents/parallel/parallel-executor.ts | ~350 | Execution |
| tests/infra/file-lock.test.ts | ~200 | Lock tests |
| tests/agents/parallel/*.test.ts | ~670 | Parallel tests |
| tests/e2e/parallel-execution.test.ts | ~230 | E2E |
| **Total** | **~1,800** | |

---

## Modified Files (Sprint 40)

| File | Changes |
|------|---------|
| src/cli/commands/index.ts | Register parallel command |
| src/cli/index.ts | parallel subcommand |
| src/config/schema.ts | agents.parallel config |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 40 INTEGRATION                         │
│                                                                  │
│  Tasks → DependencyGraph → DependencyScheduler → Batches         │
│                                    │                             │
│                                    ▼                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  ParallelExecutor                                           │ │
│  │  Batch 1: [Track1, Track2, Track3] → Promise.all            │ │
│  │  Batch 2: [Track4, Track5] → Promise.all (after Batch 1)   │ │
│  │  FileLockManager: acquire before task, release after       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                    │                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Resource Router (S39) │ BudgetTracker (S36) │ Checkpoint (S35)│ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria (Sprint 40)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Wall-clock speedup | 1.5-2x | E2E |
| File lock correctness | 100% | No corrupt writes |
| Dependency order | 100% | Correct batch order |
| Max tracks | 2-3 | Config enforced |
| Build & lint | Pass | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 39 complete | PLANNED | Resource Router |
| ADR-008 | ✅ APPROVED | Concurrency Model |
| BudgetTracker | ✅ | Sprint 36 |
| CheckpointManager | ✅ | Sprint 35 |
| ResourceRouter | ✅ | Sprint 39 |

---

## Next Sprint Preview (Sprint 41)

**Sprint Goal**: Fix Logging + Pattern Review

**Key Deliverables**:
- fix-log.json (structured, append-only)
- Weekly review CLI (endiorbot fixes --week, --patterns)
- Manual pattern import/export (no ML)
- ADR-011 (Fix Logging Architecture)

**Prerequisite**: Sprint 40 PASS (Parallel Execution validated)

---

## Approval Checklist (G-Sprint-40)

### Code Quality
- [ ] Build passes
- [ ] All tests pass (~100 new)
- [ ] Zero lint warnings

### Features
- [ ] Track manager schedules 2-3 parallel tracks
- [ ] File lock manager prevents concurrent edits
- [ ] Dependency scheduler respects dependencies
- [ ] Parallel executor reduces wall-clock 50-60%
- [ ] Per-track budget and checkpoint integrated
- [ ] CLI: parallel, parallel --dry-run

### E2E
- [ ] 2 parallel tracks complete without conflict
- [ ] File conflict causes serialization (no corruption)

---

**Last Updated**: 2026-02-22
**Sprint Status**: DRAFT - Revised per Sprint 38-46 Replan
**Blocking**: Sprint 39 close

---

*Sprint 40 Plan - Parallel Execution*
*EndiorBot - 50-60% faster sessions*
*SDLC Framework 6.1.1*
