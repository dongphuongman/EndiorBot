# Sprint 69-71: Session Resilience

---
**Status**: PLANNED
**Duration**: 3 weeks (30h)
**Goal**: Autonomous session manager with recovery and checkpointing
**Prerequisites**: Sprint 68 (PatchManager)
**Version**: v1.9 (bridge to v2.0)
**Master Plan**: v4.3

---

## Executive Summary

**Problem**: Without recovery, autonomous sessions fail catastrophically:
```
Agent runs 60min → hits error → session lost → CEO starts over ❌
```

**Solution**: Session Resilience enables recovery:
```
Agent runs 60min → hits error → classify → retry/fix/escalate → continues ✅
```

**Key Features**:
1. **Session State Machine**: Structured state transitions
2. **Auto-Checkpointing**: Every 5 patches + on events
3. **Failure Classification**: TRANSIENT / FIXABLE / DESIGN_ISSUE
4. **Auto-Recovery**: Retry transient, fix loop for fixable

---

## Sprint 69-71 Breakdown

### Week 1: Session State Machine (10h)

**T9.1: State Machine Definition** (4h)

```typescript
// src/sessions/state-machine.ts

enum SessionState {
  INIT = 'INIT',
  PLANNING = 'PLANNING',
  DESIGN = 'DESIGN',
  INTEGRATE = 'INTEGRATE',
  BUILD = 'BUILD',
  TEST = 'TEST',
  DONE = 'DONE',
  ERROR = 'ERROR',
  PAUSED = 'PAUSED'
}

interface StateTransition {
  from: SessionState;
  to: SessionState;
  trigger: string;
  guard?: () => Promise<boolean>;
  action?: () => Promise<void>;
}

const STATE_TRANSITIONS: StateTransition[] = [
  // Normal flow
  { from: 'INIT', to: 'PLANNING', trigger: 'start' },
  { from: 'PLANNING', to: 'DESIGN', trigger: 'plan_complete' },
  { from: 'DESIGN', to: 'INTEGRATE', trigger: 'design_complete' },
  { from: 'INTEGRATE', to: 'BUILD', trigger: 'integration_ready' },
  { from: 'BUILD', to: 'TEST', trigger: 'build_complete' },
  { from: 'TEST', to: 'DONE', trigger: 'tests_pass' },

  // Error handling
  { from: '*', to: 'ERROR', trigger: 'fatal_error' },
  { from: 'ERROR', to: 'PAUSED', trigger: 'escalate' },
  { from: 'PAUSED', to: '*', trigger: 'resume' },

  // Retry paths
  { from: 'BUILD', to: 'BUILD', trigger: 'retry_build' },
  { from: 'TEST', to: 'BUILD', trigger: 'test_failure' },
];

export class SessionStateMachine {
  private currentState: SessionState = SessionState.INIT;
  private history: Array<{ state: SessionState; timestamp: string }> = [];

  constructor(private sessionId: string) {}

  async transition(trigger: string): Promise<boolean> {
    const transition = this.findTransition(this.currentState, trigger);

    if (!transition) {
      throw new Error(
        `Invalid transition: ${this.currentState} --[${trigger}]--> ???`
      );
    }

    // Check guard condition
    if (transition.guard && !(await transition.guard())) {
      return false;
    }

    // Execute action
    if (transition.action) {
      await transition.action();
    }

    // Update state
    this.currentState = transition.to;
    this.history.push({
      state: transition.to,
      timestamp: new Date().toISOString()
    });

    // Log to event-log
    await this.logStateChange(trigger, transition);

    return true;
  }

  getState(): SessionState {
    return this.currentState;
  }

  canTransition(trigger: string): boolean {
    return !!this.findTransition(this.currentState, trigger);
  }

  private findTransition(
    from: SessionState,
    trigger: string
  ): StateTransition | undefined {
    return STATE_TRANSITIONS.find(
      t => (t.from === from || t.from === '*') && t.trigger === trigger
    );
  }
}
```

**T9.2: SessionManager Implementation** (6h)

```typescript
// src/sessions/session-manager.ts

export class SessionManager {
  private stateMachine: SessionStateMachine;
  private checkpointManager: CheckpointManager;  // From Sprint 65
  private patchManager: PatchManager;            // From Sprint 68

  constructor(private sessionId: string, private config: SessionConfig) {
    this.stateMachine = new SessionStateMachine(sessionId);
    this.checkpointManager = new CheckpointManager(sessionId);
    this.patchManager = new PatchManager(sessionId, this.checkpointManager);
  }

  /**
   * Start a new session or resume from checkpoint.
   */
  async start(resumeFrom?: string): Promise<void> {
    if (resumeFrom) {
      await this.resume(resumeFrom);
    } else {
      await this.stateMachine.transition('start');
      await this.checkpointManager.create('session_start');
    }
  }

  /**
   * Resume session from checkpoint.
   */
  async resume(checkpointId: string): Promise<void> {
    const checkpoint = await this.checkpointManager.load(checkpointId);

    // Restore state
    this.stateMachine = checkpoint.stateMachine;
    this.patchManager = checkpoint.patchManager;

    // Transition to resumed state
    await this.stateMachine.transition('resume');
  }

  /**
   * Execute a stage with auto-checkpointing.
   */
  async executeStage(stageId: string): Promise<StageResult> {
    // Validate stage contract (Sprint 68)
    const contractValid = await this.validateStageContract(stageId);
    if (!contractValid.valid) {
      throw new Error(`Contract validation failed: ${contractValid.errors}`);
    }

    // Transition to stage
    await this.stateMachine.transition(`enter_${stageId}`);

    // Execute stage work
    try {
      const result = await this.runStageWork(stageId);

      // Auto-checkpoint on completion
      await this.checkpointManager.create(`${stageId}_complete`);

      return result;
    } catch (error) {
      // Failure handling (see Week 3)
      return this.handleStageFailure(stageId, error);
    }
  }

  /**
   * Get current session status.
   */
  getStatus(): SessionStatus {
    return {
      sessionId: this.sessionId,
      state: this.stateMachine.getState(),
      patches: this.patchManager.getPatchHistory(),
      checkpoints: this.checkpointManager.listCheckpoints(),
      duration: this.getSessionDuration(),
      lastActivity: new Date().toISOString()
    };
  }
}
```

**Deliverables**:
- ✅ SessionStateMachine with state transitions
- ✅ SessionManager with checkpoint integration
- ✅ Session resume capability
- ✅ Event-log integration

---

### Week 2: Auto-Checkpointing (10h)

**T9.3: Checkpoint Strategy** (4h)

```typescript
// src/sessions/checkpoint/strategy.ts

interface CheckpointTrigger {
  type: 'time' | 'event' | 'patch_count';
  condition: any;
}

export const CHECKPOINT_STRATEGY: CheckpointTrigger[] = [
  // Time-based
  { type: 'time', condition: { interval: '15min' } },

  // Event-based
  { type: 'event', condition: { event: 'stage_complete' } },
  { type: 'event', condition: { event: 'task_complete' } },
  { type: 'event', condition: { event: 'escalation' } },
  { type: 'event', condition: { event: 'rollback' } },

  // Patch-based
  { type: 'patch_count', condition: { count: 5 } }
];

export class CheckpointScheduler {
  private lastCheckpoint: Date = new Date();
  private patchesSinceCheckpoint = 0;

  constructor(
    private sessionManager: SessionManager,
    private checkpointManager: CheckpointManager
  ) {}

  /**
   * Check if checkpoint should be created.
   */
  shouldCheckpoint(trigger: CheckpointTrigger, event?: any): boolean {
    switch (trigger.type) {
      case 'time':
        const elapsed = Date.now() - this.lastCheckpoint.getTime();
        const intervalMs = this.parseInterval(trigger.condition.interval);
        return elapsed >= intervalMs;

      case 'event':
        return event?.type === trigger.condition.event;

      case 'patch_count':
        return this.patchesSinceCheckpoint >= trigger.condition.count;

      default:
        return false;
    }
  }

  /**
   * Create checkpoint if triggered.
   */
  async maybeCheckpoint(event?: any): Promise<string | null> {
    for (const trigger of CHECKPOINT_STRATEGY) {
      if (this.shouldCheckpoint(trigger, event)) {
        const reason = this.getCheckpointReason(trigger, event);
        const checkpointId = await this.checkpointManager.create(reason);

        this.lastCheckpoint = new Date();
        this.patchesSinceCheckpoint = 0;

        return checkpointId;
      }
    }

    return null;
  }

  onPatchCreated(): void {
    this.patchesSinceCheckpoint++;
  }
}
```

**T9.4: Checkpoint Metadata** (6h)

```typescript
// src/sessions/checkpoint/metadata.ts

interface CheckpointMetadata {
  checkpointId: string;
  timestamp: string;
  reason: string;

  // Session state
  sessionId: string;
  state: SessionState;
  stage: string;

  // Work completed
  taskList: Task[];
  completedTasks: string[];
  specSnapshotId?: string;

  // File changes in this checkpoint
  filesCreated: string[];
  filesModified: string[];
  patches: Patch[];

  // Rollback info
  rollback: {
    command: string;
    gitCommit: string;
    safetyLevel: 'SAFE' | 'PARTIAL' | 'RISKY';
  };
}

export class CheckpointManager {
  async create(reason: string): Promise<string> {
    const checkpointId = `checkpoint-${Date.now()}`;

    // Create git commit for checkpoint
    const gitCommit = await this.createCheckpointCommit(checkpointId);

    // Gather metadata
    const metadata: CheckpointMetadata = {
      checkpointId,
      timestamp: new Date().toISOString(),
      reason,
      sessionId: this.sessionId,
      state: await this.getSessionState(),
      stage: await this.getCurrentStage(),
      taskList: await this.getTaskList(),
      completedTasks: await this.getCompletedTasks(),
      specSnapshotId: await this.getSpecSnapshotId(),
      filesCreated: await this.getFilesCreated(),
      filesModified: await this.getFilesModified(),
      patches: await this.getPatches(),
      rollback: {
        command: `git reset --hard ${gitCommit}`,
        gitCommit,
        safetyLevel: this.calculateSafetyLevel()
      }
    };

    // Save metadata
    await this.saveMetadata(checkpointId, metadata);

    return checkpointId;
  }

  async load(checkpointId: string): Promise<CheckpointMetadata> {
    const metadata = await this.loadMetadata(checkpointId);

    // Restore git state
    await this.execAsync(`git checkout ${metadata.rollback.gitCommit}`);

    return metadata;
  }
}
```

**Deliverables**:
- ✅ CheckpointScheduler with trigger logic
- ✅ Auto-checkpoint every 5 patches
- ✅ Event-based checkpointing
- ✅ Time-based checkpointing (15min)
- ✅ Checkpoint metadata with rollback info

---

### Week 3: Failure Classification & Recovery (10h)

**T9.5: Failure Classifier** (6h)

```typescript
// src/sessions/failure/classifier.ts

enum FailureType {
  TRANSIENT = 'TRANSIENT',     // Network, rate limit → retry
  FIXABLE = 'FIXABLE',         // Lint, test fail → fix loop
  DESIGN_ISSUE = 'DESIGN_ISSUE' // Spec mismatch → escalate
}

interface FailureEvidence {
  type: string;
  message: string;
  stackTrace?: string;
  attempts: number;
}

export class FailureClassifier {
  /**
   * Classify failure based on error and context.
   */
  classify(error: Error, context: any): FailureType {
    const evidence = this.gatherEvidence(error, context);

    // TRANSIENT: Network, timeout, rate limit
    if (this.isTransient(evidence)) {
      return FailureType.TRANSIENT;
    }

    // FIXABLE: Lint error, test failure, type error
    if (this.isFixable(evidence)) {
      return FailureType.FIXABLE;
    }

    // DESIGN_ISSUE: Spec mismatch, breaking change
    return FailureType.DESIGN_ISSUE;
  }

  private isTransient(evidence: FailureEvidence): boolean {
    const transientPatterns = [
      /network timeout/i,
      /rate limit/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /429 Too Many Requests/i
    ];

    return transientPatterns.some(pattern =>
      pattern.test(evidence.message)
    );
  }

  private isFixable(evidence: FailureEvidence): boolean {
    const fixablePatterns = [
      /lint error/i,
      /test failed/i,
      /type error/i,
      /tsc check failed/i,
      /missing import/i,
      /undefined variable/i
    ];

    return fixablePatterns.some(pattern =>
      pattern.test(evidence.message)
    );
  }

  /**
   * Check if we have enough evidence for DESIGN_ISSUE escalation.
   * Per CTO P0-6: Need ≥2 evidence types.
   */
  hasDesignIssueEvidence(failures: FailureEvidence[]): boolean {
    const evidenceTypes = new Set<string>();

    for (const failure of failures) {
      if (/repeated same failure/i.test(failure.message)) {
        evidenceTypes.add('repeated_failure');
      }
      if (/spec mismatch/i.test(failure.message)) {
        evidenceTypes.add('spec_mismatch');
      }
      if (/breaking change/i.test(failure.message)) {
        evidenceTypes.add('breaking_change');
      }
      if (/cross-module ripple/i.test(failure.message)) {
        evidenceTypes.add('cross_module_ripple');
      }
    }

    return evidenceTypes.size >= 2;
  }
}
```

**T9.6: Recovery Engine** (4h)

```typescript
// src/sessions/recovery/engine.ts

export class RecoveryEngine {
  private failureHistory: Map<string, FailureEvidence[]> = new Map();

  constructor(
    private classifier: FailureClassifier,
    private checkpointManager: CheckpointManager
  ) {}

  /**
   * Handle failure and attempt recovery.
   */
  async handleFailure(error: Error, context: any): Promise<RecoveryResult> {
    const failureType = this.classifier.classify(error, context);

    switch (failureType) {
      case FailureType.TRANSIENT:
        return this.retryTransient(error, context);

      case FailureType.FIXABLE:
        return this.fixLoop(error, context);

      case FailureType.DESIGN_ISSUE:
        return this.escalateDesignIssue(error, context);
    }
  }

  /**
   * Retry transient failures (max 3 attempts with exponential backoff).
   */
  private async retryTransient(
    error: Error,
    context: any
  ): Promise<RecoveryResult> {
    const attempts = this.getAttempts(context.taskId);

    if (attempts >= 3) {
      return {
        recovered: false,
        action: 'ESCALATE',
        reason: 'Max retry attempts reached'
      };
    }

    // Exponential backoff: 2^attempts seconds
    const delaySec = Math.pow(2, attempts);
    await this.sleep(delaySec * 1000);

    return {
      recovered: true,
      action: 'RETRY',
      nextAttempt: attempts + 1
    };
  }

  /**
   * Fix loop for fixable errors (max 3 attempts).
   */
  private async fixLoop(
    error: Error,
    context: any
  ): Promise<RecoveryResult> {
    const attempts = this.getAttempts(context.taskId);

    if (attempts >= 3) {
      // Rollback to last checkpoint
      const lastCheckpoint = await this.checkpointManager.getLatest();
      await this.checkpointManager.load(lastCheckpoint);

      return {
        recovered: false,
        action: 'ROLLBACK',
        reason: 'Max fix attempts reached, rolled back to checkpoint'
      };
    }

    // Attempt automated fix
    const fixed = await this.attemptAutoFix(error, context);

    if (fixed) {
      return {
        recovered: true,
        action: 'FIXED',
        nextAttempt: attempts + 1
      };
    }

    return {
      recovered: false,
      action: 'ESCALATE',
      reason: 'Auto-fix failed'
    };
  }

  /**
   * Escalate design issues (require ≥2 evidence types per CTO P0-6).
   */
  private async escalateDesignIssue(
    error: Error,
    context: any
  ): Promise<RecoveryResult> {
    const failures = this.failureHistory.get(context.taskId) || [];
    const hasEvidence = this.classifier.hasDesignIssueEvidence(failures);

    if (!hasEvidence) {
      // Not enough evidence yet, treat as fixable
      return this.fixLoop(error, context);
    }

    // Enough evidence → escalate to CEO
    await this.createEscalation({
      type: 'DESIGN_ISSUE',
      error,
      evidence: failures,
      context
    });

    return {
      recovered: false,
      action: 'ESCALATE',
      reason: 'Design issue detected (≥2 evidence types)'
    };
  }

  private getAttempts(taskId: string): number {
    const failures = this.failureHistory.get(taskId) || [];
    return failures.length;
  }
}
```

**Deliverables**:
- ✅ FailureClassifier (TRANSIENT/FIXABLE/DESIGN_ISSUE)
- ✅ RecoveryEngine with retry/fix/escalate logic
- ✅ Evidence-based escalation (≥2 types)
- ✅ Auto-rollback on max attempts

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Recovery success (TRANSIENT) | ≥95% | % recovered after retry |
| Recovery success (FIXABLE) | ≥70% | % recovered after fix loop |
| False DESIGN_ISSUE escalations | 0% | No escalations without ≥2 evidence |
| Checkpoint overhead | <5% | Time spent checkpointing vs working |
| Resume time | <30s | Time to restore from checkpoint |
| Session continuity | >90% | % sessions that complete without restart |

---

## Deliverables

- [x] SessionStateMachine with state transitions
- [x] SessionManager with checkpoint integration
- [x] CheckpointScheduler (time/event/patch triggers)
- [x] FailureClassifier (TRANSIENT/FIXABLE/DESIGN_ISSUE)
- [x] RecoveryEngine (retry/fix/escalate)
- [x] Evidence-based escalation (≥2 types)
- [x] Auto-rollback on failure
- [x] Integration tests
- [x] Documentation

---

## Dependencies

**Requires**:
- Sprint 65: CheckpointManager
- Sprint 68: PatchManager
- Sprint 68: StageContracts

**Enables**:
- Sprint 72: Autonomous sessions (2h+)

---

*Sprint 69-71: Session Resilience*
*SDLC Framework v6.1.1 compliant*
*CEO Tool - Autonomous with Recovery*
