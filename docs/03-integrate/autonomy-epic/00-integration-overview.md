# Autonomy Epic - Integration Overview

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: APPROVED
**Authority**: System Architect + Integration Lead
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 03 - INTEGRATION
**SDLC**: Framework 6.1.1

---

## Executive Summary

This document defines the integration strategy for the Autonomy Epic (Sprints 35-40), ensuring seamless coordination between six new subsystems and existing infrastructure modules.

**Integration Complexity**: Medium-High
- **6 new modules** (Checkpoint, Budget, Escalation, Self-Correction, Resource Router, Parallel Tracks)
- **8 existing modules** (Session, Provider, Logger, Config, Orchestrator, SDLC, Security, Infra)
- **14 cross-module integration points**
- **Single process model** (no IPC complexity)

---

## Integration Timeline

### Sprint-by-Sprint Integration

```
Sprint 35 (Checkpoint + Resume)
────────────────────────────────
New Modules:
• CheckpointManager
• ConflictDetector
• VersionMigrator

Integration Points:
• SessionManager → CheckpointManager (checkpoint hooks)
• Logger → EventsLogger (event log foundation)
• Git → GitAutomation (auto-commit)

Validation:
• Checkpoint → resume → verify state restored
• Session persists across process restarts

────────────────────────────────
Sprint 36 (Budget + Escalation)
────────────────────────────────
New Modules:
• BudgetTracker
• EscalationRouter
• ApprovalQueue
• NotificationRateLimiter

Integration Points:
• CheckpointManager ↔ BudgetTracker (cost tracking)
• ProviderRegistry → BudgetTracker (cost reporting)
• MultiModelOrchestrator ↔ EscalationRouter (consultation)
• SessionManager ↔ ApprovalQueue (persistent queue)

Validation:
• Budget limit → pause → checkpoint → notify
• Approval request → queue → persist → resume

────────────────────────────────
Sprint 37 (Self-Correction)
────────────────────────────────
New Modules:
• SelfCorrectionEngine
• ErrorClassifier
• DeterministicFixer
• AntiCheatVerifier

Integration Points:
• BudgetTracker ↔ SelfCorrectionEngine (retry cost tracking)
• EscalationRouter ↔ SelfCorrectionEngine (3-strike escalation)
• Security → AntiCheatVerifier (rule violation patterns)
• Git → DeterministicFixer (file patching)

Validation:
• Error → classify → fix → verify
• 3 strikes → escalate (no infinite loop)

────────────────────────────────
Sprint 38 (Hybrid AI Router)
────────────────────────────────
New Modules:
• ResourceRouter
• TaskClassifier
• ModelSelector
• QualityGates

Integration Points:
• BudgetTracker ↔ ResourceRouter (cost-aware routing)
• ProviderRegistry ↔ ResourceRouter (Ollama provider)
• MultiModelOrchestrator ↔ ResourceRouter (model selection)
• SDLC Gates ↔ QualityGates (critical task enforcement)

Validation:
• Simple task → Ollama (free)
• Complex task → Claude (quality)
• Critical task → Opus (quality gate enforced)

────────────────────────────────
Sprint 39 (Parallel Tracks)
────────────────────────────────
New Modules:
• TrackManager
• FileLockManager
• DependencyScheduler

Integration Points:
• BudgetTracker ↔ TrackManager (per-track budget)
• CheckpointManager ↔ TrackManager (track state persistence)
• ResourceRouter ↔ TrackManager (per-track model selection)
• SessionManager ↔ TrackManager (track lifecycle)

Validation:
• 2-3 tracks run concurrently
• File locks prevent conflicts
• Dependencies respected (tests wait for implementation)

────────────────────────────────
Sprint 40 (Fix Logging)
────────────────────────────────
New Modules:
• FixLogger
• PatternAnalyzer
• WeeklyReviewCLI

Integration Points:
• SelfCorrectionEngine ↔ FixLogger (log every fix)
• Logger → FixLogger (structured logging backend)
• CLI → WeeklyReviewCLI (pattern review command)

Validation:
• All fixes logged to fix-log.json
• Weekly review CLI shows patterns
• Pattern export/import works
```

---

## Integration Points Matrix

### New Module → Existing Module

| New Module | Existing Module | Integration Type | Data Flow |
|------------|-----------------|------------------|-----------|
| **CheckpointManager** | SessionManager | Lifecycle hooks | Session → CheckpointState |
| **CheckpointManager** | Logger | Event logging | Checkpoint events → events.jsonl |
| **CheckpointManager** | Git (Infra) | Auto-commit | Checkpoint → git commit |
| **BudgetTracker** | ProviderRegistry | Cost reporting | Provider → token usage → cost |
| **BudgetTracker** | CheckpointManager | Cost persistence | Cost data → CheckpointState |
| **EscalationRouter** | MultiModelOrchestrator | Consultation | Decision → consensus query |
| **EscalationRouter** | SessionManager | Approval queue | Approvals → session state |
| **SelfCorrectionEngine** | BudgetTracker | Retry cost | Fix attempt → cost accumulation |
| **SelfCorrectionEngine** | EscalationRouter | 3-strike escalation | 3 failures → approval request |
| **SelfCorrectionEngine** | Security | Anti-cheat | Fix patch → rule violation check |
| **ResourceRouter** | ProviderRegistry | Model selection | Complexity → provider lookup |
| **ResourceRouter** | BudgetTracker | Cost optimization | Model cost → budget check |
| **TrackManager** | BudgetTracker | Per-track budget | Track → budget allocation |
| **TrackManager** | CheckpointManager | Track state | Track state → checkpoint |
| **FixLogger** | SelfCorrectionEngine | Fix logging | Fix result → log entry |

### New Module → New Module

| Module A | Module B | Integration Type | Data Flow |
|----------|----------|------------------|-----------|
| **CheckpointManager** | **BudgetTracker** | State persistence | Budget state → checkpoint |
| **BudgetTracker** | **EscalationRouter** | Budget limit → escalation | Limit reached → approval request |
| **BudgetTracker** | **SelfCorrectionEngine** | Retry cost tracking | Fix retry → cost accumulation |
| **EscalationRouter** | **SelfCorrectionEngine** | 3-strike escalation | Retry failure → escalation |
| **ResourceRouter** | **BudgetTracker** | Cost-aware routing | Budget remaining → model selection |
| **ResourceRouter** | **TrackManager** | Per-track model | Track → model assignment |
| **TrackManager** | **CheckpointManager** | Track persistence | Track state → checkpoint |
| **SelfCorrectionEngine** | **FixLogger** | Fix logging | Fix applied → log entry |

---

## Integration Patterns

### Pattern 1: Event-Driven Hooks

**Used By**: CheckpointManager ↔ SessionManager

**Implementation**:
```typescript
// SessionManager emits events
sessionManager.on('session:created', async (session) => {
  await checkpointManager.createInitialCheckpoint(session);
});

sessionManager.on('session:interrupted', async (session) => {
  await checkpointManager.create({ reason: 'interrupt' });
});

sessionManager.on('gate:passed', async (gate, session) => {
  await checkpointManager.create({ reason: 'gate_pass', gate });
  await gitAutomation.autoCommit(`checkpoint(gate_pass): ${gate} passed`);
});
```

**Benefits**:
- Loose coupling
- Easy to add new checkpoint triggers
- Clear separation of concerns

### Pattern 2: Dependency Injection

**Used By**: BudgetTracker ↔ ProviderRegistry

**Implementation**:
```typescript
// BudgetTracker constructor
class BudgetTracker {
  constructor(
    private providerRegistry: ProviderRegistry,
    private checkpointManager: CheckpointManager,
    private logger: Logger
  ) {}

  async recordCost(taskId: string, model: string): Promise<BudgetAction> {
    // Get cost from provider
    const provider = this.providerRegistry.getProvider(model);
    const cost = provider.getLastRequestCost();

    // Update checkpoint
    await this.checkpointManager.updateCostTracking({
      sessionCostSoFar: this.state.session.costSoFar + cost,
    });

    // Log event
    this.logger.info('Cost recorded', { taskId, model, cost });

    return this.checkBudget();
  }
}
```

**Benefits**:
- Testable (mock dependencies)
- Clear dependencies at construction time
- Type-safe

### Pattern 3: Async Pipeline

**Used By**: SelfCorrectionEngine → ErrorClassifier → Fixer → Verifier

**Implementation**:
```typescript
async function correctError(error: ErrorClassification): Promise<CorrectionResult> {
  // Step 1: Classify
  const classification = await errorClassifier.classify(error);

  // Step 2: Select fixer
  const fixer = await selectFixer(classification);

  // Step 3: Generate fix
  const fixPatch = await fixer.generateFix(classification);

  // Step 4: Anti-cheat verification
  const antiCheatResult = await antiCheatVerifier.verify(fixPatch);
  if (!antiCheatResult.passed) {
    throw new AntiCheatViolationError(antiCheatResult.violations);
  }

  // Step 5: Apply fix
  await applyPatch(fixPatch);

  // Step 6: Verify
  const verifyResult = await verifier.verify();

  return {
    success: verifyResult.passed,
    fixPatch,
    verifyResult,
  };
}
```

**Benefits**:
- Clear error handling boundaries
- Easy to add steps
- Sequential guarantees

### Pattern 4: State Synchronization

**Used By**: BudgetTracker ↔ CheckpointManager

**Implementation**:
```typescript
// BudgetTracker pushes state to CheckpointManager
class BudgetTracker {
  async recordCost(cost: number): Promise<void> {
    this.state.session.costSoFar += cost;

    // Immediately sync to checkpoint
    await this.checkpointManager.updateCostTracking({
      sessionCostSoFar: this.state.session.costSoFar,
      tokenUsage: [...this.state.tokenUsage],
    });
  }
}

// CheckpointManager restores state to BudgetTracker
class CheckpointManager {
  async restore(checkpoint: CheckpointState): Promise<void> {
    // Restore budget state
    await budgetTracker.restoreState({
      sessionCost: checkpoint.sessionCostSoFar,
      tokenUsage: checkpoint.tokenUsage,
    });
  }
}
```

**Benefits**:
- Budget state always persisted
- Resume restores exact state
- Single source of truth

---

## Data Flow Diagrams

### End-to-End Flow: Task Execution with All Integrations

```
1. CEO: endiorbot start myproject --task "Implement login"

2. SessionManager: createSession()
   ├─> CheckpointManager: createInitialCheckpoint()
   │   └─> CheckpointState: { session, executionContext, ... }
   │
   ├─> BudgetTracker: initializeBudget(session)
   │   └─> BudgetState: { session: $2.00, daily: $10.00 }
   │
   └─> AgentScope: setActiveSoul('implementer')

3. ResourceRouter: classifyTask("Implement login")
   ├─> TaskClassifier: analyze() → complexity: "moderate" (score: 55)
   ├─> ModelSelector: selectModel("moderate") → "claude-3-5-haiku"
   └─> QualityGates: enforce() → PASS (not critical task)

4. BudgetTracker: estimateCost("moderate", "haiku")
   ├─> CostEstimator: estimate() → $0.20 (confidence: medium)
   └─> BudgetTracker: checkBudget($0.20) → CONTINUE

5. Provider: executeTask(task, "haiku")
   ├─> Anthropic API: ...
   └─> tokenUsage: { input: 600, output: 1000 }

6. BudgetTracker: recordCost($0.18, tokenUsage)
   ├─> CheckpointManager: updateCostTracking()
   │   └─> CheckpointState.sessionCostSoFar: $0.18
   │
   ├─> checkBudget() → session: $1.82 remaining
   └─> if ($1.82 < 80% warning) → notify CEO

7. SelfCorrectionEngine: verify()
   ├─> Verifier: runBuild() → FAIL (TS2304: 'User' not found)
   │
   ├─> ErrorClassifier: classify() → "type" (fixable: true)
   │
   ├─> DeterministicFixer: fixMissingImport('User')
   │   ├─> findSymbol('User') → "models/user.ts"
   │   └─> generatePatch() → import statement
   │
   ├─> AntiCheatVerifier: verify(patch) → PASS
   │
   ├─> applyPatch(patch)
   │
   ├─> Verifier: runBuild() → PASS
   │
   └─> FixLogger: logFix({ error, fix, outcome: success })

8. CheckpointManager: autoCheckpoint("task_complete")
   ├─> CheckpointState: { sessionCostSoFar: $0.18, ... }
   ├─> Serializer: compress() → 45KB
   └─> persist() → ~/.endiorbot/projects/.../checkpoints/ckpt-...json

9. SessionManager: completeTask()
   └─> return: { success: true, cost: $0.18 }
```

### Error Flow: Budget Limit + Escalation

```
1. BudgetTracker: recordCost($0.50)
   └─> sessionCost: $2.05 (>= $2.00 limit)

2. BudgetTracker: handleLimitReached('session', $2.05)
   ├─> CheckpointManager: create({ reason: 'budget_pause' })
   │   └─> Checkpoint saved
   │
   ├─> NotificationRateLimiter: send({ type: 'budget_limit' })
   │   ├─> checkRateLimit() → 3 sent in past hour (< 4 max)
   │   └─> sendToConsole() → Display message
   │
   └─> EscalationRouter: escalate({ type: 'budget_approval' })
       ├─> DecisionClassifier: classify() → "block"
       │
       ├─> ApprovalQueue: enqueue(decision)
       │   └─> persist() → ~/.endiorbot/approvals.json
       │
       └─> AgentScope: pauseExecution()

3. CEO: endiorbot approve <id> --action switch_to_ollama

4. ApprovalQueue: processApproval(id, 'switch_to_ollama')
   ├─> ResourceRouter: switchModel('ollama/qwen2.5-coder')
   │   └─> ModelSelector: validateModel() → PASS
   │
   ├─> BudgetTracker: resetSessionBudget()
   │   └─> Ollama is free, no budget tracking
   │
   └─> AgentScope: resumeExecution(model: 'ollama')
```

---

## Validation Strategy

### Integration Test Levels

#### Level 1: Unit Integration Tests

**Scope**: Two modules

**Examples**:
```typescript
// Test: CheckpointManager ↔ BudgetTracker
describe('CheckpointManager + BudgetTracker Integration', () => {
  it('should persist budget state to checkpoint', async () => {
    budgetTracker.recordCost($0.50);
    const checkpoint = await checkpointManager.create({ reason: 'manual' });
    expect(checkpoint.sessionCostSoFar).toBe(0.50);
  });

  it('should restore budget state from checkpoint', async () => {
    const checkpoint = await loadCheckpoint('ckpt-test');
    await checkpointManager.restore(checkpoint);
    expect(budgetTracker.getSessionCost()).toBe(checkpoint.sessionCostSoFar);
  });
});
```

#### Level 2: Module Integration Tests

**Scope**: Three or more modules

**Examples**:
```typescript
// Test: BudgetTracker + EscalationRouter + ApprovalQueue
describe('Budget Limit Escalation Flow', () => {
  it('should escalate when budget limit reached', async () => {
    budgetTracker.recordCost($2.00);
    const action = await budgetTracker.checkBudget();

    expect(action.action).toBe('pause');
    expect(approvalQueue.getPending()).toHaveLength(1);
    expect(approvalQueue.getPending()[0].type).toBe('budget_approval');
  });
});
```

#### Level 3: End-to-End Integration Tests

**Scope**: Full system flow

**Examples**:
```typescript
// Test: Complete task execution with error fixing
describe('E2E: Task Execution with Error Correction', () => {
  it('should execute task, fix error, checkpoint, complete', async () => {
    const result = await agent.executeTask({
      description: 'Add User model',
      complexity: 'moderate',
    });

    // Verify all integration points
    expect(result.success).toBe(true);
    expect(budgetTracker.getSessionCost()).toBeLessThan(2.00);
    expect(checkpointManager.getLatest()).toMatchObject({
      sessionCostSoFar: expect.any(Number),
      completedActions: expect.arrayContaining([
        expect.objectContaining({ actionType: 'tool_call' }),
      ]),
    });
    expect(fixLogger.getRecentFixes()).toHaveLength(1);
  });
});
```

### Integration Test Scenarios (11 Scenarios)

| ID | Scenario | Modules Involved | Expected Outcome |
|----|----------|------------------|------------------|
| E2E-1 | Create checkpoint → resume → continue | Checkpoint, Session | State restored exactly |
| E2E-2 | Budget limit → pause → notify → resume | Budget, Checkpoint, Escalation | Pause at $2, resume after approval |
| E2E-3 | Error → auto-fix → verify → continue | Self-Correction, Budget, FixLog | 70-90% fix success |
| E2E-4 | Simple task → Ollama, complex → Claude | Resource Router, Budget | Cost optimized |
| E2E-5 | 3 parallel tracks → file locks → complete | TrackManager, FileLockManager | No conflicts |
| E2E-6 | Architecture decision → escalate → approve | Escalation, Approval Queue | Blocks until approval |
| E2E-7 | Notification rate limit → batch queue | Notification, Rate Limiter | Max 4/hour |
| E2E-8 | Circuit breaker → 3 strikes → escalate | Self-Correction, Escalation, Budget | Escalates after 3 retries |
| E2E-9 | Anti-cheat → rule violation → reject | Self-Correction, Security | Fix rejected |
| E2E-10 | Checkpoint → external file change → conflict | Checkpoint, ConflictDetector | Conflict detected + options |
| E2E-11 | Fix logged → weekly review → patterns | FixLogger, ReviewCLI | Patterns visible |

---

## Rollback Strategy

### Integration Rollback Points

Each sprint has a rollback checkpoint:

| Sprint | Rollback Condition | Rollback Action |
|--------|-------------------|-----------------|
| **Sprint 35** | Resume fails >20% of time | Disable auto-checkpoint, manual only |
| **Sprint 36** | Budget enforcement buggy | Disable budget limits (warning only) |
| **Sprint 37** | Auto-fix success <50% | Disable auto-fix, escalate all errors |
| **Sprint 38** | Ollama quality too low | Disable Ollama, use Haiku for all |
| **Sprint 39** | File conflicts >10% | Disable parallel, sequential only |
| **Sprint 40** | Fix log corruption | Disable fix logging, no pattern analysis |

### Integration Rollback Procedure

```
1. Detect Integration Failure
   • E2E test failure rate >20%
   • User-reported critical bug
   • Performance degradation >2x

2. Assess Impact
   • Which modules are affected?
   • Can we isolate the failure?
   • Is this a configuration issue?

3. Execute Rollback
   • Feature flag: disable problematic integration
   • Config override: revert to conservative settings
   • Code rollback: git revert (last resort)

4. Root Cause Analysis
   • Why did integration fail?
   • Was it a design flaw or implementation bug?
   • How can we prevent recurrence?

5. Re-Integration (Sprint N+1)
   • Fix root cause
   • Add integration tests
   • Gradual rollout (10% → 50% → 100%)
```

---

## Configuration Management

### Integration Feature Flags

```typescript
// src/config/integration-flags.ts
export const INTEGRATION_FLAGS = {
  // Sprint 35
  ENABLE_AUTO_CHECKPOINT: true,
  ENABLE_AUTO_RESUME: true,
  ENABLE_CONFLICT_DETECTION: true,

  // Sprint 36
  ENABLE_BUDGET_ENFORCEMENT: true,
  ENABLE_CIRCUIT_BREAKERS: true,
  ENABLE_ESCALATION_ROUTER: true,
  ENABLE_NOTIFICATION_RATE_LIMIT: true,

  // Sprint 37
  ENABLE_AUTO_FIX: true,
  ENABLE_ANTI_CHEAT: true,
  MAX_FIX_RETRIES: 3,

  // Sprint 38
  ENABLE_HYBRID_ROUTING: true,
  ENABLE_OLLAMA: true,
  ENABLE_QUALITY_GATES: true,

  // Sprint 39
  ENABLE_PARALLEL_TRACKS: true,
  MAX_CONCURRENT_TRACKS: 3,
  ENABLE_FILE_LOCKS: true,

  // Sprint 40
  ENABLE_FIX_LOGGING: true,
  ENABLE_PATTERN_ANALYSIS: false, // Manual only
};
```

### Integration Configuration

```typescript
// ~/.endiorbot/config.json
{
  "autonomy": {
    "checkpoint": {
      "autoCheckpointInterval": 600000, // 10 min
      "maxCheckpointsPerProject": 10,
      "compressionThreshold": 51200 // 50KB
    },
    "budget": {
      "sessionLimit": 2.00,
      "dailyLimit": 10.00,
      "warningThreshold": 0.80,
      "onLimitReached": "pause_and_notify"
    },
    "escalation": {
      "notificationRateLimit": 4, // per hour
      "approvalTimeout": 3600000, // 1 hour
      "channels": ["console"]
    },
    "selfCorrection": {
      "maxRetries": 3,
      "enableAntiCheat": true,
      "fixableErrorTypes": ["build", "lint", "type"]
    },
    "resourceRouter": {
      "enableHybridRouting": true,
      "ollamaModel": "ollama/qwen2.5-coder",
      "qualityGateMinModel": "claude-opus-4"
    },
    "parallelTracks": {
      "maxConcurrentTracks": 3,
      "fileLockTimeout": 30000,
      "enableDependencyScheduling": true
    },
    "fixLogging": {
      "enableLogging": true,
      "maxLogSize": 10485760, // 10MB
      "enablePatternAnalysis": false // Manual only
    }
  }
}
```

---

## Related Documents

- **Design Documents**: `docs/02-design/autonomy-epic/00-06-*.md`
- **API Specifications**: `01-api-specifications.md`
- **Data Contracts**: `02-data-contracts.md`
- **Integration Tests**: `03-integration-tests.md`
- **Sprint Plans**: `docs/01-planning/sprint-35-40-*.md`

---

**Approved By**: System Architect + Integration Lead
**Date**: 2026-02-22
**Status**: APPROVED - Integration strategy defined
**Next Review**: Sprint 35 Day 5 (after first integration point)

---

*Autonomy Epic - Integration Overview v1.0.0*
*EndiorBot SDLC Framework 6.1.1*
