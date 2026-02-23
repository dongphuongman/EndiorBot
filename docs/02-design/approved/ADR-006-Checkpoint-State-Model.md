# ADR-006: Checkpoint State Model

**Status**: APPROVED
**Approved By**: CEO (Sprint 35 Day 1)
**Approval Date**: 2026-02-22
**Date**: 2026-02-22
**Blocking**: Sprint 35 (Phase 1: Checkpoint + Resume)
**Authority**: CTO + 3 External Experts + Critical Review
**SDLC**: Framework 6.1.1

**Note**: Checkpoint storage location changed from global `~/.endiorbot/checkpoints/` to per-project `~/.endiorbot/projects/{projectId}/checkpoints/` to align with ADR-002 context switching and prevent conflicts between projects.

---

## Context

EndiorBot needs to support autonomous runs of 1-2+ hours. To achieve this, the system must be able to:

1. **Checkpoint**: Save execution state at any point
2. **Resume**: Restore execution state after interruption
3. **Recover**: Rollback to stable state if resume fails
4. **Verify**: Detect conflicts when environment changes

This ADR defines the CheckpointState interface and restore semantics based on:
- CPO/CTO requirements (safety-first, conflict detection)
- 3 external expert consultations (execution provenance, idempotency, state machine)
- Critical review (5 lỗ thủng chết người)

---

## Decision

### CheckpointState Interface (Grouped)

**Note from CPO/CTO Review**: Interface grouped into logical sub-interfaces for maintainability.

```typescript
/**
 * Complete checkpoint state for autonomous execution.
 *
 * Grouped into logical sub-interfaces per CPO/CTO feedback.
 */
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

### Sub-Interfaces

#### CheckpointMeta

```typescript
/**
 * Checkpoint metadata.
 */
interface CheckpointMeta {
  /** Checkpoint schema version (semver, e.g., "1.0.0") */
  schema_version: string;

  /**
   * Migration notes for version upgrades.
   * Example: ["1.0.0 → 1.1.0: Added brainVersion field"]
   */
  migration_notes?: string[];

  /** Checkpoint creation timestamp */
  createdAt: Date;

  /**
   * Why was this checkpoint created?
   * - interrupt: User Ctrl+C
   * - gate_pass: G1/G2 gate passed
   * - budget_pause: Budget limit reached
   * - manual: User `endiorbot checkpoint`
   * - crash: Unexpected error (Expert #2)
   * - timeout: Session timeout (Expert #2)
   */
  reason: 'interrupt' | 'gate_pass' | 'budget_pause' | 'manual' | 'crash' | 'timeout';

  /**
   * Human-readable description (optional).
   * Example: "Checkpoint before risky refactor"
   */
  description?: string;

  // ========================================
  // EXECUTION DETERMINISM (Critical Review)
  // ========================================

  /**
   * SHA256 hash of tool call trace.
   * Ensures resume executes same sequence.
   */
  executionTraceDigest: string;

  /**
   * Runtime environment fingerprint.
   * Example: "darwin-arm64-node20.11.0"
   */
  runtimeFingerprint: string;

  // ========================================
  // SESSION STATE (Existing)
  // ========================================

  /** Session metadata (existing SessionState) */
  session: SessionState;

  /**
   * Active agent persona (Soul).
   * Example: 'architect' | 'implementer' | 'reviewer'
   */
  activeSoul: SoulType;

  /** Decision log for audit trail */
  decisionLog: Decision[];

  // ========================================
  // EXECUTION CONTEXT (Expert #1 + #3)
  // ========================================

  /**
   * Current SDLC phase.
   * Maps to ADR-002 souls.
   */
  currentPhase: 'research' | 'design' | 'implement' | 'test' | 'review';

  /** Current task ID being executed */
  currentTaskId: string;

  /** Queued tasks not yet executed */
  taskQueue: Task[];

  /**
   * Execution depth stack (Expert #2).
   * Tracks nested tool calls/subtasks.
   * Example: [{ tool: 'grep', depth: 0 }, { tool: 'read', depth: 1 }]
   */
  stepStack: StepFrame[];

  /**
   * Detailed interruption reason (Expert #2).
   * Example: "SIGINT received" | "Budget limit $2.00 reached"
   */
  interruptionReason?: string;

  // ========================================
  // IN-FLIGHT STATE (All Experts)
  // ========================================

  /**
   * Tool calls in progress.
   * Each has: { id, tool, args, idempotent, status, partialOutput }
   */
  pendingToolCalls: ToolCallState[];

  /** Partial results from streaming responses */
  partialResults: Map<string, unknown>;

  // ========================================
  // COST TRACKING (Expert #1 + #2)
  // ========================================

  /**
   * Total cost spent in this session.
   * CRITICAL for budget resume (Phase 2).
   */
  sessionCostSoFar: number;

  /**
   * Token usage per model.
   * Example: [{ model: 'opus', input: 1000, output: 500 }]
   */
  tokenUsage: TokenUsageRecord[];

  /**
   * Remaining time budget in milliseconds (Expert #3).
   * Example: 3600000 (1 hour remaining)
   */
  timeBudgetRemaining?: number;

  // ========================================
  // EXECUTION PROVENANCE (Expert #2)
  // ========================================

  /** Git commit SHA when checkpoint was created */
  repoCommitSha: string;

  /**
   * Working tree patch or worktree ref.
   * Captures uncommitted changes.
   */
  workingTreePatch?: string;

  /** Hash of pnpm-lock.yaml for dependency verification */
  lockfilesHash: string;

  /** Node.js version (e.g., "20.11.0") */
  nodeVersion: string;

  /**
   * Model configuration used.
   * Example: { model: 'claude-opus-4', temperature: 0.7 }
   */
  modelConfig: { model: string; temperature?: number };

  /**
   * Environment fingerprint (sanitized).
   * MUST NOT include secrets.
   * Example: { SHELL: 'zsh', LANG: 'en_US.UTF-8' }
   */
  envFingerprint: Record<string, string>;

  // ========================================
  // IDEMPOTENCY (Expert #2 + Critical Review)
  // ========================================

  /**
   * Idempotency keys for tool calls.
   * Maps: tool_call_id → idempotency_key
   * Example: { "git_commit_1": "commit-abc123" }
   */
  idempotencyKeys: Map<string, string>;

  /**
   * Completed actions that MUST NOT be retried.
   * CRITICAL: Prevents double commits, double approvals.
   */
  completedActions: CompletedAction[];

  /**
   * Idempotency scope per tool.
   * Example: { "git_commit": "per-branch", "file_write": "per-path" }
   */
  idempotencyScope: Record<string, string>;

  /**
   * Tool call outputs cache.
   * For idempotent reads, avoid re-executing.
   */
  toolCallOutputsCache: Map<string, unknown>;

  /** Retry attempts per tool call */
  toolCallAttempts: Map<string, number>;

  /** Remaining retry budget for this session */
  retryBudget: number;

  // ========================================
  // FILE SYSTEM (All Experts)
  // ========================================

  /** Files modified since session start */
  modifiedFiles: FileChange[];

  /** Files created (not committed) */
  createdFiles: string[];

  /**
   * File hashes for conflict detection.
   * Maps: path → SHA256
   * CRITICAL: Detects external modifications.
   */
  fileHashes: Map<string, string>;

  /**
   * File patches before changes (Critical Review).
   * For rollback if resume fails.
   * Maps: path → unified diff
   */
  filePatchesBeforeChange?: Map<string, string>;

  // ========================================
  // GIT STATE (All Experts)
  // ========================================

  /** Current git branch */
  gitBranch: string;

  /** Uncommitted changes (paths only) */
  uncommittedChanges: string[];

  /** Last git commit when checkpoint was created */
  lastCheckpointCommit: string;

  /**
   * Last stable checkpoint ID (Critical Review).
   * Points to checkpoint before risky operation.
   * Example: "ckpt-20260222-100000"
   */
  lastStableCheckpoint?: string;

  /**
   * Git worktree ref for rollback (Critical Review).
   * Safer than shell commands.
   */
  workingTreeRef?: string;

  // ========================================
  // ROLLBACK (Expert #1 + Critical Review)
  // ========================================

  /**
   * @deprecated Use stable primitives instead.
   * Shell commands are unreliable for rollback.
   * Use: lastStableCommit + workingTreeRef + filePatchesBeforeChange
   */
  rollbackCommands?: string[];

  // ========================================
  // STATE MACHINE (Expert #3)
  // ========================================

  /**
   * SDLC gate status.
   * Example: { "G1": "pass", "G2": "pending" }
   */
  gateStatus: Record<string, 'pending' | 'pass' | 'fail'>;

  /**
   * Evidence bindings for gates.
   * Example: { "G1_ADR": "docs/ADR-001.md" }
   */
  evidenceBindings: Record<string, string>;

  /** Pending approval requests */
  approvalPending: ApprovalRequest[];

  // ========================================
  // BRAIN REFERENCE (All Experts)
  // ========================================

  /**
   * Brain version reference.
   * Example: "1.0.0"
   * NOTE: Checkpoint does NOT embed brain, only references.
   */
  brainVersion: string;

  /**
   * Brain digest for verification.
   * SHA256 of brain state at checkpoint time.
   */
  brainDigest: string;
}
```

---

## Supporting Types

### CompletedAction

```typescript
/**
 * Record of completed side-effects.
 * MUST NOT be retried on resume.
 */
interface CompletedAction {
  /** Action type */
  actionType: 'commit' | 'push' | 'approve' | 'tool_call' | 'file_write';

  /** Idempotency key */
  idempotencyKey: string;

  /** When action completed */
  timestamp: Date;

  /** Result */
  result: 'success' | 'failure';

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}
```

### StepFrame

```typescript
/**
 * Execution stack frame (Expert #2).
 */
interface StepFrame {
  /** Tool or function name */
  name: string;

  /** Depth in call stack (0 = top level) */
  depth: number;

  /** Arguments (sanitized) */
  args?: Record<string, unknown>;

  /** When this step started */
  startedAt: Date;
}
```

### ToolCallState

```typescript
/**
 * State of a tool call.
 */
interface ToolCallState {
  /** Unique ID */
  id: string;

  /** Tool name */
  toolName: string;

  /** Arguments (sanitized) */
  args: unknown;

  /**
   * Is this tool call idempotent?
   * - true: Safe to retry (e.g., file read, git status)
   * - false: MUST NOT retry (e.g., git commit, file write)
   */
  idempotent: boolean;

  /** Current status */
  status: 'pending' | 'executing' | 'partial' | 'complete' | 'failed';

  /** Partial output (for streaming) */
  partialOutput?: unknown;

  /** Error if failed */
  error?: Error;
}
```

### TokenUsageRecord

```typescript
/**
 * Token usage per model.
 */
interface TokenUsageRecord {
  model: string;
  input: number;
  output: number;
  cost?: number;
}
```

---

## Restore Semantics

### Restore Flow (CTO Requirement + All Experts)

```typescript
async function restore(checkpoint: CheckpointState): Promise<RestoreResult> {
  // ===================================
  // STEP 1: Version Check (Expert #1)
  // ===================================

  if (!isCompatible(checkpoint.schema_version)) {
    return {
      status: 'migration_required',
      fromVersion: checkpoint.schema_version,
      toVersion: CURRENT_SCHEMA_VERSION,
      migrationPath: getMigrationPath(checkpoint.schema_version),
    };
  }

  // ===================================
  // STEP 2: Provenance Check (Expert #2)
  // ===================================

  const currentCommit = await git.getCurrentCommit();
  if (checkpoint.repoCommitSha !== currentCommit) {
    logger.warn('Repository has changed since checkpoint', {
      checkpointCommit: checkpoint.repoCommitSha,
      currentCommit,
    });
    // Continue, but mark as "unstable resume"
  }

  const currentNodeVersion = process.version.slice(1); // Remove 'v'
  if (checkpoint.nodeVersion !== currentNodeVersion) {
    logger.warn('Node.js version mismatch', {
      checkpointVersion: checkpoint.nodeVersion,
      currentVersion: currentNodeVersion,
    });
  }

  const currentLockfileHash = await hashFile('pnpm-lock.yaml');
  if (checkpoint.lockfilesHash !== currentLockfileHash) {
    return {
      status: 'dependency_mismatch',
      message: 'pnpm-lock.yaml has changed. Run `pnpm install` and retry.',
    };
  }

  // ===================================
  // STEP 3: File Conflict Detection (All Experts)
  // ===================================

  const conflicts = await detectConflicts(checkpoint.fileHashes);

  if (conflicts.length > 0) {
    // Classify conflicts (Critical Review)
    const classified = classifyConflicts(conflicts);

    // Auto-resolve trivial conflicts (whitespace only)
    const trivial = classified.filter(c => c.severity === 'trivial');
    for (const conflict of trivial) {
      await autoResolve(conflict);
    }

    // Prompt for semantic/structural conflicts
    const serious = classified.filter(c =>
      c.severity === 'semantic' || c.severity === 'structural'
    );

    if (serious.length > 0) {
      return {
        status: 'conflict',
        conflicts: serious,
        options: [
          'force_restore',    // Overwrite external changes
          'merge_manual',     // Show diffs, let CEO merge
          'abort',            // Cancel resume
          'new_baseline',     // Accept external changes as new baseline
        ],
      };
    }
  }

  // ===================================
  // STEP 4: Idempotency Check (Expert #2 + Critical Review)
  // ===================================

  const completedToolIds = new Set(
    checkpoint.completedActions.map(a => a.idempotencyKey)
  );

  const pendingTools = checkpoint.pendingToolCalls.filter(
    t => !completedToolIds.has(t.id)
  );

  logger.info('Idempotency check', {
    totalPending: checkpoint.pendingToolCalls.length,
    alreadyCompleted: completedToolIds.size,
    toResume: pendingTools.length,
  });

  // ===================================
  // STEP 5: Brain Verification (All Experts)
  // ===================================

  const currentBrainDigest = await computeBrainDigest();
  if (checkpoint.brainDigest !== currentBrainDigest) {
    logger.warn('Brain has evolved since checkpoint', {
      checkpointDigest: checkpoint.brainDigest,
      currentDigest: currentBrainDigest,
    });
    // Continue, brain evolution is expected
  }

  // ===================================
  // STEP 6: State Machine Restore (Expert #3)
  // ===================================

  await restoreGateStatus(checkpoint.gateStatus);
  await restoreApprovalQueue(checkpoint.approvalPending);

  // ===================================
  // STEP 7: Session Restore
  // ===================================

  await restoreSession(checkpoint.session);
  await restoreActiveSoul(checkpoint.activeSoul);
  await restoreTaskQueue(checkpoint.taskQueue);

  // ===================================
  // STEP 8: Resume Tool Calls
  // ===================================

  for (const tool of pendingTools) {
    if (tool.status === 'partial') {
      // Resume from partial output
      await resumeTool(tool, tool.partialOutput);
    } else {
      // Retry from beginning
      await retryTool(tool);
    }
  }

  // ===================================
  // STEP 9: Success
  // ===================================

  logger.info('Checkpoint restored successfully', {
    checkpointId: checkpoint.session.id,
    tasksResumed: pendingTools.length,
  });

  return {
    status: 'success',
    resumedFrom: checkpoint.createdAt,
    tasksResumed: pendingTools.length,
  };
}
```

---

## Conflict Classification (Critical Review)

```typescript
/**
 * Classify file conflicts by severity.
 */
function classifyConflicts(
  conflicts: FileConflict[]
): ClassifiedConflict[] {
  return conflicts.map(conflict => {
    const diff = computeDiff(conflict.checkpointContent, conflict.currentContent);

    // Trivial: Only whitespace/formatting
    if (isWhitespaceOnly(diff)) {
      return { ...conflict, severity: 'trivial' };
    }

    // Additive: New code added, no overlap
    if (isAdditive(diff)) {
      return { ...conflict, severity: 'additive' };
    }

    // Semantic: Same lines, different content
    if (hasOverlap(diff)) {
      return { ...conflict, severity: 'semantic' };
    }

    // Structural: File renamed/deleted
    if (isStructuralChange(diff)) {
      return { ...conflict, severity: 'structural' };
    }

    return { ...conflict, severity: 'unknown' };
  });
}

type ConflictSeverity = 'trivial' | 'additive' | 'semantic' | 'structural' | 'unknown';
```

---

## Rollback Strategy (Critical Review)

```typescript
/**
 * Rollback to stable state.
 * Uses stable primitives, NOT shell commands.
 */
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
  // Example: If commit was pushed, DON'T force-push revert
  //          Instead, create a new "compensation commit"
  const externalActions = checkpoint.completedActions.filter(
    a => a.actionType === 'push' || a.actionType === 'approve'
  );

  for (const action of externalActions) {
    await compensate(action);
  }

  logger.info('Rollback complete', {
    method: 'stable_primitives',
    gitReset: checkpoint.lastStableCheckpoint,
    filesPatched: checkpoint.filePatchesBeforeChange?.size ?? 0,
    externalCompensations: externalActions.length,
  });
}
```

---

## Checkpoint Versioning (Expert #1)

### Schema Evolution

| Version | Date | Changes |
|---------|------|---------|
| **1.0.0** | 2026-02-22 | Initial schema (Sprint 35) |
| 1.1.0 | Future | Add `brainContext` field |
| 2.0.0 | Future | Breaking: Split `session` into sub-fields |

### Migration Example

```typescript
async function migrate(
  checkpoint: CheckpointState,
  targetVersion: string
): Promise<CheckpointState> {
  const migrations = {
    '1.0.0→1.1.0': (c: CheckpointState) => ({
      ...c,
      schema_version: '1.1.0',
      brainContext: loadBrainContext(c.brainVersion),
    }),
    '1.1.0→2.0.0': (c: CheckpointState) => ({
      ...c,
      schema_version: '2.0.0',
      // Split session field
      sessionMetadata: c.session.metadata,
      sessionConfig: c.session.config,
    }),
  };

  let current = checkpoint;
  let path = getMigrationPath(checkpoint.schema_version, targetVersion);

  for (const step of path) {
    current = migrations[step](current);
  }

  return current;
}
```

---

## P0 Checklist (Must Have for Sprint 35)

| # | Requirement | Implementation | Status |
|---|-------------|----------------|--------|
| 1 | `schema_version` field | CheckpointState.schema_version | ✅ |
| 2 | Migration strategy | migrate() function | ✅ |
| 3 | Idempotency keys | completedActions[], idempotencyKeys | ✅ |
| 4 | Execution determinism | executionTraceDigest, provenance fields | ✅ |
| 5 | Conflict classification | classifyConflicts() | ✅ |
| 6 | Rollback via stable primitives | rollback() using git reset + patches | ✅ |
| 7 | Cost tracking | sessionCostSoFar, tokenUsage | ✅ |
| 8 | Brain reference (not embed) | brainVersion, brainDigest | ✅ |

---

## Consequences

### Positive

- **Complete state capture**: All expert fields included
- **Reliable resume**: Determinism + idempotency + provenance
- **Safe rollback**: Stable primitives, no shell command risk
- **Conflict handling**: 4-level classification (trivial → structural)
- **Cost-aware**: Budget tracking for Phase 2
- **Future-proof**: Versioning + migration strategy

### Negative

- **Large checkpoint size**: ~100KB per checkpoint (acceptable)
- **Complexity**: 40+ fields to maintain
- **Migration overhead**: Must support old versions

### Mitigations

- Use JSON compression for checkpoints >50KB
- Implement checkpoint garbage collection (keep last 10)
- Automate migration tests

---

## Related ADRs

- **ADR-001**: Multi-Model Orchestrator (provides SessionState)
- **ADR-002**: Agent Scope Partitioning (defines SoulType)
- **ADR-007**: Autonomous Execution Budget (uses sessionCostSoFar)
- **ADR-008**: Concurrency Model (uses fileHashes for conflict detection)
- **ADR-009** (Proposed): EndiorBot Brain Architecture (brainVersion, brainDigest)

---

## References

- CPO/CTO Review: Safety-first, conflict detection
- Expert #1: Versioning, rollback, cost tracking
- Expert #2: Execution provenance, interruption tracking
- Expert #3: Idempotency, state machine, retry budget
- Critical Review: 5 lỗ thủng chết người, stable primitives
- LangGraph: Agent checkpoint patterns
- Temporal.io: Durable workflow replay model

---

*ADR-006 v1.0.0 - APPROVED*
*EndiorBot Autonomy Epic - Phase 1*
*SDLC Framework 6.1.1*
