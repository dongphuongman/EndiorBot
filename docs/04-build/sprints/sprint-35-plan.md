# Sprint 35 Detailed Plan - Autonomy Epic Phase 1

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Autonomy Epic)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 34 Complete (Logging Module Enhancement)
- ADR-006 Approved (Checkpoint State Model)
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 35 is the **first sprint** of the Autonomy Epic, implementing **Phase 1: Foundation** - Checkpoint & Resume system that enables long-running autonomous sessions.

### Vision: From 5-Minute to 30-Minute Sessions

```
Current (Sprint 34):  5-10 min sessions → Manual restart needed
Sprint 35 Target:     30+ min sessions → Auto-checkpoint + Resume
Future (Sprint 40):   2+ hour sessions → Full autonomy
```

### Why Phase 1 is Critical

> **CPO/CTO Requirement**: "You need checkpoint/resume as foundation for EVERYTHING else in autonomy."

Without checkpoint/resume:
- ❌ Can't have budget control (Session 36) - no way to pause at budget limit
- ❌ Can't have self-correction (Sprint 37) - errors abort entire session
- ❌ Can't have parallel tracks (Sprint 39) - no way to coordinate state
- ❌ Can't have fix logging (Sprint 40) - context lost on restart

---

## Sprint Goal

**Enable EndiorBot to checkpoint execution state and resume after interruption, supporting 30+ minute autonomous runs.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **ADR-006** | Checkpoint State Model approved | DRAFT | Sprint 35 Day 1 |
| **Sprint 34** | Logging module complete | CLOSE | Sprint 35 start |
| **Expert feedback** | 3 expert consultations incorporated | ✅ COMPLETE | - |
| **P0 Checklist** | All 10 P0 items addressed | Pending | Day 1 |

### P0 Checklist Review (from Autonomy Epic)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Checkpoint `schema_version` + migration strategy | ✅ ADR-006 |
| 2 | Idempotency keys + `completedActions[]` | ✅ ADR-006 |
| 3 | Execution determinism: `repoCommitSha`, `lockfilesHash`, `nodeVersion` | ✅ ADR-006 |
| 4 | Conflict classification model (trivial/additive/semantic/structural) | ✅ ADR-006 |
| 5 | Logging-lite: `events.jsonl` from Day 1 | 📝 Sprint 35 Day 1 |
| 6 | Security sanitizer before ALL tool calls | ✅ Sprint 34 (already exists) |
| 7 | Anti-cheat verifier: reject if disables rules/relaxes strictness | 📝 Sprint 37 prep |
| 8 | Rollback via stable primitives (git reset, patches, compensate) | ✅ ADR-006 |
| 9 | ADR-006 formally written and committed | 📝 Day 1 |
| 10 | Notification rate limit (4/hr max) | 📝 Sprint 36 |

**Day 1 Action**: Review ADR-006, mark as APPROVED, commit to repo.

---

## Sprint 35 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Checkpoint System + Event Logging | checkpoint.ts, events.jsonl, migration |
| **Week 2** | Resume Handler + Git Automation | resume-handler.ts, git-automation.ts, E2E tests |

**Duration**: 10 working days (March 17-28, 2026)

---

## Week 1: Checkpoint System (Day 1-5)

### Day 1: ADR-006 Approval + Event Logging Foundation

**Goal**: Formalize ADR-006 and set up event logging infrastructure.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Review ADR-006 draft | P0 | ADR-006.md APPROVED | - |
| Move ADR-006 to approved/ | P0 | docs/02-design/approved/ADR-006.md | - |
| Create events logger | P0 | src/logging/events-logger.ts | ~150 |
| Create event types | P0 | src/logging/event-types.ts | ~100 |
| Create events.jsonl writer | P0 | src/logging/events-writer.ts | ~80 |
| Create tests/logging/events-logger.test.ts | P0 | Unit tests | ~100 |

**Acceptance Criteria**:
- [ ] ADR-006 moved to approved/ and committed
- [ ] Event logging captures: timestamp, phase, action, outcome, cost_delta
- [ ] Events written to `~/.endiorbot/events.jsonl` (append-only)
- [ ] EventLog interface matches ADR-006 requirements
- [ ] Tests pass: event writing, append mode, no format overhead
- [ ] Build passes

**Event Log Format (Log-Lite)**:
```typescript
interface EventLog {
  timestamp: Date;
  phase: 'checkpoint' | 'resume' | 'execute' | 'tool_call' | 'gate_eval';
  action: string;
  tool?: string;
  outcome: 'success' | 'failure' | 'partial';
  cost_delta?: number;
  files_touched_count: number;
  retry_count: number;
  context?: Record<string, string>;  // Minimal, no PII
}
```

**Integration Points**:
```
events-logger.ts
    └── Logger (src/logging/logger.ts) ✅ Sprint 34
    └── FileTransport (src/logging/transports.ts) ✅ Sprint 34
```

---

### Day 2-3: Checkpoint State Implementation

**Goal**: Implement CheckpointState interface and save logic.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/sessions/checkpoint/types.ts | P0 | CheckpointState interface | ~400 |
| Create src/sessions/checkpoint/checkpoint.ts | P0 | Checkpoint save logic | ~350 |
| Create src/sessions/checkpoint/serializer.ts | P0 | JSON serialization | ~100 |
| Create tests/sessions/checkpoint/checkpoint.test.ts | P0 | Unit tests | ~200 |
| Create tests/sessions/checkpoint/serializer.test.ts | P0 | Serialization tests | ~100 |

**Acceptance Criteria**:
- [ ] CheckpointState matches ADR-006 interface (all 50+ fields)
- [ ] `saveCheckpoint()` creates checkpoint in `~/.endiorbot/projects/{projectId}/checkpoints/{id}.json`
- [ ] Checkpoint includes: schema_version = "1.0.0"
- [ ] Checkpoint includes: session state, execution context, provenance
- [ ] Checkpoint includes: idempotency keys, file hashes, git state
- [ ] Checkpoint includes: cost tracking (sessionCostSoFar, tokenUsage)
- [ ] Checkpoint includes: brain reference (brainVersion, brainDigest)
- [ ] Serializer handles Map<string, string> correctly (JSON compatible)
- [ ] Serializer compresses checkpoints >50KB (gzip)
- [ ] Tests pass: checkpoint creation, field validation
- [ ] Build passes

**CheckpointState Sub-Interfaces** (per ADR-006):
```typescript
interface CheckpointState {
  meta: CheckpointMeta;
  session: SessionState;
  execution: ExecutionContext;
  provenance: RuntimeProvenance;
  idempotency: IdempotencyState;
  filesystem: FilesystemDelta;
  git: GitState;
  cost: CostState;
  rollback: RollbackStrategy;
  brain: BrainReference;
  statemachine: StateMachineState;
}
```

**Integration Points**:
```
checkpoint.ts
    └── SessionManager (src/sessions/session-manager.ts) ✅ Sprint 34
    └── SessionStore (src/sessions/session-store.ts) ✅ Sprint 34
    └── EventsLogger (new, Day 1)
```

---

### Day 4: Conflict Detection & Classification

**Goal**: Implement file conflict detection using hashes.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/sessions/checkpoint/conflict-detector.ts | P0 | Conflict detection | ~200 |
| Create src/sessions/checkpoint/conflict-classifier.ts | P0 | Conflict classification | ~180 |
| Create src/utils/hash.ts extension | P1 | File hashing utilities | +50 |
| Create tests/sessions/checkpoint/conflict.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] `detectConflicts()` compares checkpoint fileHashes with current files
- [ ] Returns list of conflicting files with: path, checkpointHash, currentHash
- [ ] `classifyConflicts()` categorizes by severity: trivial, additive, semantic, structural
- [ ] Trivial: whitespace-only changes
- [ ] Additive: new code added, no overlap
- [ ] Semantic: same lines modified
- [ ] Structural: file renamed/deleted
- [ ] Tests pass: hash computation, conflict detection, classification
- [ ] Build passes

**Conflict Classification Logic** (per ADR-006):
```typescript
function classifyConflicts(conflicts: FileConflict[]): ClassifiedConflict[] {
  return conflicts.map(conflict => {
    const diff = computeDiff(conflict.checkpointContent, conflict.currentContent);

    if (isWhitespaceOnly(diff)) return { ...conflict, severity: 'trivial' };
    if (isAdditive(diff)) return { ...conflict, severity: 'additive' };
    if (hasOverlap(diff)) return { ...conflict, severity: 'semantic' };
    if (isStructuralChange(diff)) return { ...conflict, severity: 'structural' };

    return { ...conflict, severity: 'unknown' };
  });
}
```

---

### Day 5: Checkpoint Versioning & Migration

**Goal**: Implement schema versioning and migration strategy.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/sessions/checkpoint/migration.ts | P0 | Migration logic | ~200 |
| Create src/sessions/checkpoint/version-compat.ts | P0 | Version compatibility | ~100 |
| Create tests/sessions/checkpoint/migration.test.ts | P0 | Migration tests | ~150 |

**Acceptance Criteria**:
- [ ] `isCompatible(version)` checks if checkpoint version can be loaded
- [ ] `migrate(checkpoint, targetVersion)` upgrades checkpoint schema
- [ ] Migration path: "1.0.0" → "1.1.0" → "2.0.0" (examples)
- [ ] Migration preserves all data
- [ ] Migration adds `migration_notes` field
- [ ] Tests pass: version compatibility, migration correctness
- [ ] Build passes

**Migration Example** (per ADR-006):
```typescript
async function migrate(checkpoint: CheckpointState, targetVersion: string): Promise<CheckpointState> {
  const migrations = {
    '1.0.0→1.1.0': (c: CheckpointState) => ({
      ...c,
      schema_version: '1.1.0',
      brainContext: loadBrainContext(c.brainVersion),
      migration_notes: ['Added brainContext field'],
    }),
  };

  let current = checkpoint;
  const path = getMigrationPath(checkpoint.schema_version, targetVersion);

  for (const step of path) {
    current = migrations[step](current);
  }

  return current;
}
```

---

## Week 2: Resume & Git Automation (Day 6-10)

### Day 6-7: Resume Handler

**Goal**: Implement checkpoint restore and resume logic.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/sessions/checkpoint/resume-handler.ts | P0 | Resume logic | ~400 |
| Create src/sessions/checkpoint/restore.ts | P0 | State restoration | ~250 |
| Create tests/sessions/checkpoint/resume.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] `restore(checkpoint)` implements 9-step restore flow (per ADR-006)
- [ ] Step 1: Version check + migration if needed
- [ ] Step 2: Provenance check (repoCommitSha, nodeVersion, lockfilesHash)
- [ ] Step 3: File conflict detection + classification
- [ ] Step 4: Idempotency check (skip completed actions)
- [ ] Step 5: Brain verification (digest check)
- [ ] Step 6: State machine restore (gate status, approval queue)
- [ ] Step 7: Session restore (session state, active soul, task queue)
- [ ] Step 8: Resume tool calls (partial → resume, pending → retry)
- [ ] Step 9: Success logging
- [ ] Returns `RestoreResult` with status: 'success' | 'conflict' | 'migration_required' | 'dependency_mismatch'
- [ ] Tests pass: full restore flow, conflict handling, idempotency
- [ ] Build passes

**Restore Flow** (per ADR-006):
```typescript
async function restore(checkpoint: CheckpointState): Promise<RestoreResult> {
  // Step 1: Version check
  if (!isCompatible(checkpoint.schema_version)) {
    return { status: 'migration_required', ... };
  }

  // Step 2: Provenance check
  const currentCommit = await git.getCurrentCommit();
  if (checkpoint.repoCommitSha !== currentCommit) {
    logger.warn('Repository has changed since checkpoint');
  }

  // Step 3: File conflict detection
  const conflicts = await detectConflicts(checkpoint.fileHashes);
  if (conflicts.serious.length > 0) {
    return { status: 'conflict', conflicts, options: [...] };
  }

  // Step 4: Idempotency check
  const completedToolIds = new Set(checkpoint.completedActions.map(a => a.idempotencyKey));
  const pendingTools = checkpoint.pendingToolCalls.filter(t => !completedToolIds.has(t.id));

  // Step 5-9: Restore session, resume tools, success
  // ...

  return { status: 'success', resumedFrom: checkpoint.createdAt, tasksResumed: pendingTools.length };
}
```

**Integration Points**:
```
resume-handler.ts
    └── checkpoint.ts (Day 2-3)
    └── conflict-detector.ts (Day 4)
    └── migration.ts (Day 5)
    └── SessionManager (existing)
    └── EventsLogger (Day 1)
```

---

### Day 8: Git Automation

**Goal**: Implement auto-commit on milestones.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/infra/git-automation.ts | P0 | Git auto-commit | ~250 |
| Create src/infra/git-rollback.ts | P0 | Rollback strategies | ~200 |
| Create tests/infra/git-automation.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] `autoCommit(reason, files)` creates git commit with standardized message
- [ ] Commit message format: `"checkpoint(${reason}): ${summary}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"`
- [ ] Auto-commit triggers: gate pass (G1, G2), manual checkpoint, budget pause
- [ ] `rollback(checkpoint)` uses stable primitives: `git reset --hard`, patches, compensation
- [ ] Does NOT use shell command strings (security)
- [ ] Rollback handles: git operations (reset), file operations (patches), external operations (compensate)
- [ ] Tests pass: commit creation, rollback correctness
- [ ] Build passes

**Git Automation Triggers**:
```typescript
interface AutoCommitConfig {
  triggers: {
    gate_pass: boolean;      // Default: true
    checkpoint: boolean;     // Default: true
    budget_pause: boolean;   // Default: false (Sprint 36)
    manual: boolean;         // Default: true
  };
  message_template: string;
}
```

**Rollback Strategy** (per Critical Review):
```typescript
async function rollback(checkpoint: CheckpointState): Promise<void> {
  // Git rollback: Use git reset --hard
  if (checkpoint.lastStableCheckpoint) {
    const stableCheckpoint = await loadCheckpoint(checkpoint.lastStableCheckpoint);
    await git.reset('--hard', stableCheckpoint.lastCheckpointCommit);
  }

  // File rollback: Apply reverse patches
  if (checkpoint.filePatchesBeforeChange) {
    for (const [path, patch] of checkpoint.filePatchesBeforeChange) {
      await applyPatch(path, reversePatch(patch));
    }
  }

  // External actions: Compensate (do NOT rollback)
  const externalActions = checkpoint.completedActions.filter(
    a => a.actionType === 'push' || a.actionType === 'approve'
  );
  for (const action of externalActions) {
    await compensate(action);
  }
}
```

**Integration Points**:
```
git-automation.ts
    └── ShellEnv (src/infra/shell-env.ts) ✅ Sprint 34
    └── Platform (src/infra/platform.ts) ✅ Sprint 34
    └── EventsLogger (Day 1)
```

---

### Day 9: CLI Integration

**Goal**: Add checkpoint/resume commands to CLI.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/cli/commands/checkpoint.ts | P0 | `endiorbot checkpoint` | ~150 |
| Create src/cli/commands/resume.ts | P0 | `endiorbot resume` | ~200 |
| Update src/cli/index.ts | P0 | Register commands | +20 |
| Create tests/cli/checkpoint-cli.test.ts | P0 | CLI tests | ~100 |

**Acceptance Criteria**:
- [ ] `endiorbot checkpoint [--reason <reason>] [--description <desc>]` creates checkpoint
- [ ] `endiorbot resume [--checkpoint-id <id>]` resumes from checkpoint (defaults to latest)
- [ ] `endiorbot checkpoints list` shows all checkpoints
- [ ] `endiorbot checkpoints clean [--keep <N>]` removes old checkpoints (default: keep 10)
- [ ] CLI shows progress: "Creating checkpoint...", "Checkpoint saved: ckpt-20260322-100000"
- [ ] CLI shows conflicts on resume: file paths, severity, options
- [ ] Tests pass: command execution, output format
- [ ] Build passes

**CLI Output Examples**:
```bash
$ endiorbot checkpoint --reason gate_pass --description "G1 passed"
Creating checkpoint...
✓ Checkpoint saved: ckpt-20260322-100000
  Reason: gate_pass
  Files: 12 modified, 3 created
  Size: 47KB (compressed)

$ endiorbot resume
Loading checkpoint: ckpt-20260322-100000 (latest)
Checking conflicts...
✓ No conflicts detected
Restoring session...
✓ Session restored
Resuming 3 pending tool calls...
✓ Resume complete

$ endiorbot resume
Loading checkpoint: ckpt-20260322-100000
⚠ Conflicts detected (2 files):
  src/config/types.ts (semantic - same lines modified)
  src/cli/index.ts (additive - new code added)

Options:
  1. force_restore   - Overwrite external changes
  2. merge_manual    - Review diffs and merge manually
  3. abort           - Cancel resume
  4. new_baseline    - Accept external changes as new baseline

Choose option [1-4]: _
```

---

### Day 10: E2E Testing & Sprint Review

**Goal**: End-to-end testing and sprint closure.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create tests/e2e/checkpoint-resume.test.ts | P0 | E2E tests | ~250 |
| Create docs/05-test/checkpoint-test-scenarios.md | P1 | Test scenarios | ~100 |
| Run full test suite | P0 | All tests pass | - |
| Update CURRENT-SPRINT.md | P0 | Sprint 35 CLOSE | - |
| G-Sprint-35 checklist | P0 | Sprint approved | - |

**E2E Test Scenarios**:
- [ ] Scenario 1: Create checkpoint, resume immediately (happy path)
- [ ] Scenario 2: Create checkpoint, modify file externally, resume (conflict handling)
- [ ] Scenario 3: Create checkpoint, change git commit, resume (provenance warning)
- [ ] Scenario 4: Create checkpoint, change pnpm-lock.yaml, resume (dependency mismatch)
- [ ] Scenario 5: Create checkpoint with pending tool calls, resume (idempotency)
- [ ] Scenario 6: Auto-commit on gate pass (G1), verify commit message
- [ ] Scenario 7: Rollback to last stable checkpoint
- [ ] Scenario 8: Checkpoint garbage collection (keep last 10)
- [ ] Scenario 9: Event logging captures all checkpoint/resume events
- [ ] Scenario 10: Migration from v1.0.0 to v1.1.0 (simulate future)

**Acceptance Criteria**:
- [ ] All E2E tests pass
- [ ] All unit tests pass (target: 100+ tests)
- [ ] Build passes
- [ ] Zero lint warnings
- [ ] Code coverage >80% for checkpoint module
- [ ] Documentation complete
- [ ] G-Sprint-35 checklist signed off

---

## Sprint 35 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Tests passing** | 100% | All unit + E2E tests |
| **Lint warnings** | 0 | pnpm lint |
| **Build** | Pass | pnpm build |
| **Code coverage** | >80% | vitest --coverage |
| **Checkpoint tests** | >30 | Unit + E2E |
| **Event logging tests** | >10 | Event logger tests |
| **Documentation** | Complete | ADR-006, test scenarios |
| **LOC added** | ~3,500 | Checkpoint module |

---

## Files Created (Sprint 35)

### New Files

| File | LOC | Purpose |
|------|-----|---------|
| **Logging** | | |
| `src/logging/events-logger.ts` | ~150 | Event logging |
| `src/logging/event-types.ts` | ~100 | Event type definitions |
| `src/logging/events-writer.ts` | ~80 | JSONL writer |
| **Checkpoint** | | |
| `src/sessions/checkpoint/types.ts` | ~400 | CheckpointState interface |
| `src/sessions/checkpoint/checkpoint.ts` | ~350 | Checkpoint save logic |
| `src/sessions/checkpoint/serializer.ts` | ~100 | JSON serialization |
| `src/sessions/checkpoint/conflict-detector.ts` | ~200 | Conflict detection |
| `src/sessions/checkpoint/conflict-classifier.ts` | ~180 | Conflict classification |
| `src/sessions/checkpoint/migration.ts` | ~200 | Schema migration |
| `src/sessions/checkpoint/version-compat.ts` | ~100 | Version compatibility |
| `src/sessions/checkpoint/resume-handler.ts` | ~400 | Resume logic |
| `src/sessions/checkpoint/restore.ts` | ~250 | State restoration |
| `src/sessions/checkpoint/index.ts` | ~50 | Module exports |
| **Git** | | |
| `src/infra/git-automation.ts` | ~250 | Auto-commit |
| `src/infra/git-rollback.ts` | ~200 | Rollback strategies |
| **CLI** | | |
| `src/cli/commands/checkpoint.ts` | ~150 | Checkpoint command |
| `src/cli/commands/resume.ts` | ~200 | Resume command |
| **Tests** | | |
| `tests/logging/events-logger.test.ts` | ~100 | Event logger tests |
| `tests/sessions/checkpoint/checkpoint.test.ts` | ~200 | Checkpoint tests |
| `tests/sessions/checkpoint/serializer.test.ts` | ~100 | Serializer tests |
| `tests/sessions/checkpoint/conflict.test.ts` | ~150 | Conflict tests |
| `tests/sessions/checkpoint/migration.test.ts` | ~150 | Migration tests |
| `tests/sessions/checkpoint/resume.test.ts` | ~200 | Resume tests |
| `tests/infra/git-automation.test.ts` | ~150 | Git tests |
| `tests/cli/checkpoint-cli.test.ts` | ~100 | CLI tests |
| `tests/e2e/checkpoint-resume.test.ts` | ~250 | E2E tests |
| **Documentation** | | |
| `docs/05-test/checkpoint-test-scenarios.md` | ~100 | Test scenarios |
| **Total** | **~4,410** | |

---

## Modified Files (Sprint 35)

| File | Changes |
|------|---------|
| `src/cli/index.ts` | Register checkpoint/resume commands |
| `src/sessions/session-manager.ts` | Add checkpoint hooks |
| `src/utils/hash.ts` | Add file hashing utilities |
| `docs/02-design/ADR-006-Checkpoint-State-Model.md` | Move to approved/ |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 35 INTEGRATION                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ CLI Layer    │  │ Session Layer│  │ Infra Layer  │           │
│  │              │  │              │  │              │           │
│  │ checkpoint.ts│──▶ checkpoint.ts ◀──│ git-auto.ts  │           │
│  │ resume.ts    │  │ resume-      │  │ git-rollback │           │
│  │              │  │  handler.ts  │  │              │           │
│  └──────────────┘  └──────┬───────┘  └──────────────┘           │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────┐           │
│  │            Checkpoint Module (NEW)                │           │
│  │                                                   │           │
│  │  • CheckpointState (50+ fields)                  │           │
│  │  • Conflict Detection & Classification           │           │
│  │  • Schema Versioning & Migration                 │           │
│  │  • Resume Handler (9-step flow)                  │           │
│  │  • Rollback via Stable Primitives                │           │
│  └───────────────────────────────────────────────────┘           │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────┐           │
│  │         Event Logging (NEW, Log-Lite)            │           │
│  │                                                   │           │
│  │  • events.jsonl (append-only)                    │           │
│  │  • Captures: phase, action, outcome, cost        │           │
│  │  • Iceberg Layer 1: Events foundation            │           │
│  └───────────────────────────────────────────────────┘           │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────┐           │
│  │        Existing Modules (Sprint 34)              │           │
│  │                                                   │           │
│  │  • SessionManager ✅                             │           │
│  │  • SessionStore ✅                               │           │
│  │  • Logger ✅                                     │           │
│  │  • ShellEnv ✅                                   │           │
│  │  • Platform ✅                                   │           │
│  └───────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## CEO Experience (Sprint 35)

### Touchpoint 1: Create Checkpoint

```bash
$ endiorbot start myproject
# ... work for 20 minutes ...

$ endiorbot checkpoint --reason gate_pass --description "G1 passed, ready for design"
Creating checkpoint...
✓ Checkpoint saved: ckpt-20260322-143000
  Reason: gate_pass
  Files: 8 modified, 2 created
  Session cost so far: $0.45
  Size: 42KB

Next steps:
  - Continue working: Session will auto-checkpoint every 10 min
  - View checkpoints: endiorbot checkpoints list
  - Resume later: endiorbot resume
```

### Touchpoint 2: Interrupt & Resume

```bash
# CEO closes terminal (Ctrl+C or accidental close)

# Next day:
$ endiorbot resume
Loading checkpoint: ckpt-20260322-143000 (latest)
Checking environment...
  ✓ Git commit: abc1234 (unchanged)
  ✓ Dependencies: pnpm-lock.yaml (unchanged)
  ✓ Node version: 22.11.0 (match)
  ✓ No conflicts detected

Restoring session...
  ✓ Project: myproject
  ✓ SDLC Stage: G1 → G2 (design)
  ✓ Active Soul: architect
  ✓ Task queue: 2 pending tasks

Resuming work...
  ✓ Task 1: Design API endpoints (resumed)
  ✓ Session cost restored: $0.45

Session resumed successfully. Continue where you left off!
```

### Touchpoint 3: Conflict Handling

```bash
$ endiorbot resume
Loading checkpoint: ckpt-20260322-143000
Checking environment...
  ✓ Git commit: abc1234 (unchanged)
  ⚠ Conflicts detected (1 file):

File: src/config/types.ts
Severity: semantic (same lines modified)
Checkpoint hash: d4f2a1b3c5e6...
Current hash:    a1b2c3d4e5f6...

Diff summary:
  - Line 42: export interface Config {
  + Line 42: export interface EndiorBotConfig {

Options:
  1. force_restore   - Overwrite your changes with checkpoint version
  2. merge_manual    - Show full diff and let you merge
  3. abort           - Cancel resume
  4. new_baseline    - Keep your changes, ignore checkpoint

Choose option [1-4]: 4

✓ Using current file as new baseline
  Session resumed with 1 file updated externally

Continue where you left off!
```

### Touchpoint 4: Auto-Commit

```bash
$ endiorbot start myproject
# ... work on feature ...
# G1 gate passed

✓ G1 gate passed!
Auto-committing changes...
  Files: 8 modified, 2 created
  Commit: 1a2b3c4 "checkpoint(gate_pass): G1 passed - foundation complete

  Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

Checkpoint created: ckpt-20260322-150000
Continue to next stage: G2 (Design)
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Checkpoint size bloat** | High disk usage | Compression (gzip), garbage collection (keep 10) |
| **Restore conflicts** | Blocks resume | 4-level classification, auto-resolve trivial |
| **Migration failures** | Can't load old checkpoints | Version compatibility matrix, migration tests |
| **Git state mismatch** | Unstable resume | Provenance checking, warnings (not errors) |
| **Idempotency bugs** | Double commits, double actions | completedActions tracking, tool call IDs |
| **Performance** | Slow checkpoint creation | Async file I/O, incremental hashing |

---

## Success Criteria (Sprint 35)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Autonomous duration** | 30+ min | Manual test: start → checkpoint → resume |
| **Checkpoint creation time** | <2 sec | Performance test |
| **Resume success rate** | >95% | E2E test scenarios |
| **Conflict auto-resolution** | >80% trivial | Conflict classifier tests |
| **Event log overhead** | <100ms/event | Performance test |
| **Test coverage** | >80% | vitest --coverage |
| **Build status** | Pass | CI/CD |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 34 complete | CLOSE | Logging module needed |
| ADR-006 approved | DRAFT → APPROVED | Day 1 task |
| Git available | ✅ | System requirement |
| Node.js 22+ | ✅ | System requirement |
| pnpm installed | ✅ | Package manager |

---

## Next Sprint Preview (Sprint 36)

**Sprint Goal**: Phase 2 - Escalation & Budget Control

**Key Deliverables**:
- Budget tracker with $2 session limit, $10 daily limit
- Escalation router (auto → consult → human)
- Approval queue for architecture changes
- Notification system (max 4/hour)
- Integration with checkpoint system

**Prerequisite**: Sprint 35 PASS (checkpoint resume validated)

---

## Approval Checklist (G-Sprint-35)

### Code Quality
- [ ] Build passes (`pnpm build`)
- [ ] All tests pass (>100 tests)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] Code coverage >80% for checkpoint module
- [ ] TypeScript strict mode compliant

### Features
- [ ] Checkpoint creation works (manual + auto)
- [ ] Resume from checkpoint works (9-step flow)
- [ ] Conflict detection & classification works
- [ ] Event logging captures all events
- [ ] Git auto-commit works
- [ ] Rollback via stable primitives works
- [ ] CLI commands work (checkpoint, resume, list, clean)

### Testing
- [ ] 10 E2E scenarios pass
- [ ] Unit tests cover all edge cases
- [ ] Performance tests pass
- [ ] Manual testing: 30-min autonomous run

### Documentation
- [ ] ADR-006 approved and committed
- [ ] Test scenarios documented
- [ ] CLI help text complete
- [ ] Integration diagram accurate

### Integration
- [ ] SessionManager hooks checkpoint
- [ ] Logger integrates event logging
- [ ] Git automation uses ShellEnv
- [ ] CLI registers new commands

---

## Approval Status

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | PENDING | |
| CTO | @cto | PENDING | |
| Reviewer | @reviewer | PENDING | |
| CEO | @CEO | PENDING | Awaiting Sprint 34 close |

---

**Last Updated**: 2026-02-22
**Sprint Owner**: @coder (AI)
**Sprint Status**: DRAFT - Pending CEO Approval
**Blocking**: Sprint 34 close + ADR-006 approval

---

*Sprint 35 Plan - Autonomy Epic Phase 1*
*EndiorBot Checkpoint & Resume System*
*SDLC Framework 6.1.1*
