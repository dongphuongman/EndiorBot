# Autonomy Epic - API Specifications

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: APPROVED
**Authority**: API Architect
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 03 - INTEGRATION
**SDLC**: Framework 6.1.1

---

## Overview

This document defines API contracts for all autonomy modules (Sprints 35-40). Each interface is designed for:
- **Type Safety**: TypeScript strict mode compliance
- **Testability**: Mockable dependencies
- **Extensibility**: Easy to add features in future sprints
- **Integration**: Clear contracts between modules

---

## CheckpointManager API (Sprint 35)

### Interface

```typescript
/**
 * Manages checkpoint creation, storage, and restoration.
 *
 * @module sessions/checkpoint
 * @since Sprint 35
 */
interface ICheckpointManager {
  /**
   * Create a new checkpoint of current execution state.
   *
   * @param options - Checkpoint options
   * @returns CheckpointState with generated ID
   * @throws CheckpointError if state capture fails
   */
  create(options: CheckpointOptions): Promise<CheckpointState>;

  /**
   * Restore execution state from a checkpoint.
   *
   * @param checkpointId - Checkpoint ID (defaults to latest)
   * @returns RestoreResult with status and conflicts
   * @throws CheckpointError if restore fails
   */
  restore(checkpointId?: string): Promise<RestoreResult>;

  /**
   * List all checkpoints for current project.
   *
   * @returns Array of checkpoint metadata
   */
  list(): Promise<CheckpointMetadata[]>;

  /**
   * Delete a specific checkpoint.
   *
   * @param checkpointId - Checkpoint ID to delete
   */
  delete(checkpointId: string): Promise<void>;

  /**
   * Update cost tracking in latest checkpoint.
   *
   * @param costUpdate - Session cost and token usage
   */
  updateCostTracking(costUpdate: CostUpdate): Promise<void>;

  /**
   * Get latest checkpoint (without restoring).
   *
   * @returns Latest checkpoint or null if none exists
   */
  getLatest(): Promise<CheckpointState | null>;
}
```

### Types

```typescript
interface CheckpointOptions {
  reason: 'interrupt' | 'gate_pass' | 'budget_pause' | 'manual' | 'crash' | 'timeout';
  description?: string;
  metadata?: Record<string, unknown>;
}

interface CheckpointMetadata {
  id: string;
  createdAt: Date;
  reason: string;
  sessionCostSoFar: number;
  filesModified: number;
  size: number; // bytes
}

interface RestoreResult {
  status: 'success' | 'conflict' | 'migration_required' | 'dependency_mismatch';
  resumedFrom?: Date;
  tasksResumed?: number;
  conflicts?: ClassifiedConflict[];
  options?: string[]; // For conflict resolution
}

interface CostUpdate {
  sessionCostSoFar: number;
  tokenUsage: TokenUsageRecord[];
}
```

### Usage Example

```typescript
// Create checkpoint
const checkpoint = await checkpointManager.create({
  reason: 'gate_pass',
  description: 'G1 passed - foundation complete',
});
console.log(`Checkpoint created: ${checkpoint.id}`);

// Resume from checkpoint
const result = await checkpointManager.restore();
if (result.status === 'conflict') {
  console.log('Conflicts detected:', result.conflicts);
  // Handle conflict resolution
} else if (result.status === 'success') {
  console.log(`Resumed from ${result.resumedFrom}`);
}
```

---

## BudgetTracker API (Sprint 36)

### Interface

```typescript
/**
 * Tracks and enforces budget limits.
 *
 * @module agents/budget
 * @since Sprint 36
 */
interface IBudgetTracker {
  /**
   * Record cost for a completed task.
   *
   * @param taskId - Task identifier
   * @param cost - Cost in USD
   * @param model - Model used
   * @param tokens - Token usage
   * @returns BudgetAction to take (continue, pause, switch_model, escalate)
   * @throws BudgetError if tracking fails
   */
  recordCost(
    taskId: string,
    cost: number,
    model: string,
    provider: string,
    tokens: { input: number; output: number },
    taskType?: TaskType,
    trackId?: string
  ): Promise<BudgetAction>;

  /**
   * Estimate cost for upcoming task.
   *
   * @param taskType - Type of task
   * @param model - Model to use
   * @param context - Task context for estimation
   * @returns Cost estimate with confidence
   */
  estimateCost(
    taskType: TaskType,
    model: string,
    context: TaskContext
  ): Promise<CostEstimate>;

  /**
   * Check current budget status.
   *
   * @returns Current budget state
   */
  getStatus(): BudgetStatus;

  /**
   * Reset daily budget (called at midnight UTC).
   */
  resetDaily(): Promise<void>;

  /**
   * Restore budget state from checkpoint.
   *
   * @param state - Budget state from checkpoint
   */
  restoreState(state: BudgetStateRestore): Promise<void>;
}
```

### Types

```typescript
interface BudgetAction {
  action: 'continue' | 'pause' | 'switch_model' | 'escalate' | 'fail';
  reason?: string;
  model?: string; // For 'switch_model'
  approvalId?: string; // For 'escalate'
  remainingBudget?: {
    session: number;
    daily: number;
  };
}

interface BudgetStatus {
  session: {
    costSoFar: number;
    limit: number;
    percentUsed: number;
  };
  daily: {
    costSoFar: number;
    limit: number;
    percentUsed: number;
    date: string; // YYYY-MM-DD
    resetAt: Date;
  };
  tracks?: Record<string, {
    costSoFar: number;
    limit: number;
  }>;
}

interface CostEstimate {
  estimated_cost: number; // USD
  estimated_tokens: { input: number; output: number };
  confidence: 'low' | 'medium' | 'high';
  confidence_score: number; // 0-1
  historical_avg?: number;
  recommendation?: string;
}

interface BudgetStateRestore {
  sessionCost: number;
  dailyCost?: number;
  tokenUsage: TokenUsageRecord[];
}
```

### Usage Example

```typescript
// Estimate cost before execution
const estimate = await budgetTracker.estimateCost(
  'code_implementation',
  'claude-3-5-haiku',
  { prompt: '...', files: [...] }
);
console.log(`Estimated cost: $${estimate.estimated_cost}`);

// Record cost after execution
const action = await budgetTracker.recordCost(
  'task-123',
  0.15,
  'claude-3-5-haiku',
  'anthropic',
  { input: 500, output: 800 }
);

if (action.action === 'pause') {
  console.log('Budget limit reached:', action.reason);
}
```

---

## EscalationRouter API (Sprint 36)

### Interface

```typescript
/**
 * Routes decisions to appropriate escalation level.
 *
 * @module agents/escalation
 * @since Sprint 36
 */
interface IEscalationRouter {
  /**
   * Route a decision to appropriate handler.
   *
   * @param decision - Decision to route
   * @returns Escalation result with action to take
   */
  routeDecision(decision: Decision): Promise<EscalationResult>;

  /**
   * Classify decision type (auto, notify, block, consult).
   *
   * @param decision - Decision to classify
   * @returns Classification result
   */
  classifyDecision(decision: Decision): Promise<DecisionClassification>;
}
```

### Types

```typescript
interface Decision {
  type: 'architecture' | 'refactor' | 'security' | 'budget' | 'file_delete' | 'api_change';
  description: string;
  impact: 'low' | 'medium' | 'high';
  estimatedCost?: number;
  filesAffected?: string[];
  metadata?: Record<string, unknown>;
}

interface EscalationResult {
  action: 'proceed' | 'wait_approval' | 'escalate';
  approval?: 'automatic' | 'notified' | 'consensus' | 'pending';
  approvalId?: string;
  consultation?: ConsensusResult;
  reason?: string;
}

interface DecisionClassification {
  category: 'auto' | 'notify' | 'block' | 'consult';
  confidence: number; // 0-1
  reasoning: string;
}
```

### Usage Example

```typescript
// Route architecture decision
const result = await escalationRouter.routeDecision({
  type: 'architecture',
  description: 'Refactor to event sourcing',
  impact: 'high',
  estimatedCost: 4.50,
});

if (result.action === 'wait_approval') {
  console.log(`Approval required: ${result.approvalId}`);
  // Wait for CEO approval
} else if (result.action === 'proceed') {
  console.log('Proceeding with consensus approval');
}
```

---

## SelfCorrectionEngine API (Sprint 37)

### Interface

```typescript
/**
 * Automatically corrects build, lint, and type errors.
 *
 * @module agents/self-correction
 * @since Sprint 37
 */
interface ISelfCorrectionEngine {
  /**
   * Verify current codebase (build + lint + typecheck + test).
   *
   * @returns Verification result with errors
   */
  verify(): Promise<VerificationResult>;

  /**
   * Classify an error.
   *
   * @param error - Error to classify
   * @returns Error classification
   */
  classifyError(error: RawError): Promise<ErrorClassification>;

  /**
   * Attempt to fix an error.
   *
   * @param error - Classified error
   * @returns Fix result
   * @throws AntiCheatViolationError if fix violates rules
   */
  fixError(error: ErrorClassification): Promise<FixResult>;

  /**
   * Correct all fixable errors (with 3-strike limit).
   *
   * @returns Correction result
   */
  correctErrors(): Promise<CorrectionResult>;
}
```

### Types

```typescript
interface VerificationResult {
  passed: boolean;
  errors: ErrorClassification[];
  fixable: number; // Count of fixable errors
  warnings: number;
  duration: number; // ms
}

interface ErrorClassification {
  type: 'build' | 'lint' | 'type' | 'test' | 'logic' | 'unknown';
  severity: 'error' | 'warning';
  confidence: 'high' | 'medium' | 'low';
  fixable: boolean;
  file: string;
  line: number;
  message: string;
  rule?: string; // ESLint rule, TS error code
}

interface FixResult {
  success: boolean;
  patch?: string; // Unified diff
  filesModified: string[];
  verified: boolean; // Re-verified after fix
  strikesUsed: number;
  escalated: boolean;
}

interface CorrectionResult {
  totalErrors: number;
  fixed: number;
  escalated: number;
  strikes: number; // Total strikes used
  duration: number; // ms
}
```

### Usage Example

```typescript
// Verify codebase
const verifyResult = await selfCorrectionEngine.verify();
console.log(`Errors: ${verifyResult.errors.length}`);

// Auto-correct errors
if (!verifyResult.passed) {
  const correctionResult = await selfCorrectionEngine.correctErrors();
  console.log(`Fixed ${correctionResult.fixed}/${correctionResult.totalErrors}`);

  if (correctionResult.escalated > 0) {
    console.log(`Escalated ${correctionResult.escalated} errors to CEO`);
  }
}
```

---

## ResourceRouter API (Sprint 38)

### Interface

```typescript
/**
 * Routes tasks to appropriate AI model based on complexity.
 *
 * @module agents/routing
 * @since Sprint 38
 */
interface IResourceRouter {
  /**
   * Select model for a task.
   *
   * @param task - Task to execute
   * @returns Model selection result
   */
  selectModel(task: Task): Promise<ModelSelection>;

  /**
   * Classify task complexity.
   *
   * @param task - Task to classify
   * @returns Complexity classification
   */
  classifyComplexity(task: Task): Promise<TaskComplexity>;

  /**
   * Switch to a different model mid-session.
   *
   * @param model - New model to use
   */
  switchModel(model: string): Promise<void>;
}
```

### Types

```typescript
interface Task {
  description: string;
  type: TaskType;
  files?: string[];
  context?: string;
}

interface ModelSelection {
  model: string;
  provider: string;
  reasoning: string;
  estimatedCost: number;
  complexity: TaskComplexity;
}

interface TaskComplexity {
  level: 'simple' | 'moderate' | 'complex' | 'critical';
  confidence: 'high' | 'medium' | 'low';
  score: number; // 0-100
  factors: {
    codeSize: number;
    dependencies: number;
    logicDepth: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresReasoning: boolean;
  };
  recommendedModel: 'ollama' | 'claude' | 'gpt' | 'gemini';
}
```

### Usage Example

```typescript
// Select model for task
const selection = await resourceRouter.selectModel({
  description: 'Add user authentication',
  type: 'code_implementation',
});

console.log(`Selected: ${selection.model} (${selection.reasoning})`);
console.log(`Estimated cost: $${selection.estimatedCost}`);
```

---

## TrackManager API (Sprint 39)

### Interface

```typescript
/**
 * Manages parallel execution tracks.
 *
 * @module agents/parallel
 * @since Sprint 39
 */
interface ITrackManager {
  /**
   * Create a new track.
   *
   * @param name - Track name
   * @param tasks - Tasks to execute
   * @returns Created track
   */
  createTrack(name: string, tasks: Task[]): Promise<Track>;

  /**
   * Execute all tracks in parallel.
   *
   * @returns Track execution results
   */
  executeTracks(): Promise<TrackResult[]>;

  /**
   * Acquire file lock for a track.
   *
   * @param trackId - Track ID
   * @param filePath - File to lock
   * @param timeout - Lock timeout (ms)
   * @returns true if lock acquired
   */
  acquireLock(trackId: string, filePath: string, timeout?: number): Promise<boolean>;

  /**
   * Release file lock.
   *
   * @param trackId - Track ID
   * @param filePath - File to unlock
   */
  releaseLock(trackId: string, filePath: string): Promise<void>;
}
```

### Types

```typescript
interface Track {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'blocked' | 'completed' | 'failed';
  tasks: Task[];
  currentTask: Task | null;
  dependencies: string[]; // Task IDs
  fileLocks: Set<string>;
  budget: { allocated: number; used: number };
  model: string;
  createdAt: Date;
  completedAt?: Date;
}

interface TrackResult {
  trackId: string;
  success: boolean;
  tasksCompleted: number;
  duration: number; // ms
  cost: number;
  errors?: Error[];
}
```

### Usage Example

```typescript
// Create parallel tracks
const track1 = await trackManager.createTrack('Implementation', [
  { description: 'Add User model', type: 'code_implementation' },
  { description: 'Add User routes', type: 'code_implementation' },
]);

const track2 = await trackManager.createTrack('Testing', [
  { description: 'Test User model', type: 'test_writing' },
]);

// Execute in parallel
const results = await trackManager.executeTracks();
console.log(`Completed in ${Math.max(...results.map(r => r.duration))}ms`);
```

---

## FixLogger API (Sprint 40)

### Interface

```typescript
/**
 * Logs fix attempts for pattern analysis.
 *
 * @module agents/fix-logging
 * @since Sprint 40
 */
interface IFixLogger {
  /**
   * Log a fix attempt.
   *
   * @param entry - Fix log entry
   */
  logFix(entry: FixLogEntry): Promise<void>;

  /**
   * Get recent fixes.
   *
   * @param limit - Max number of fixes to return
   * @returns Recent fix entries
   */
  getRecentFixes(limit?: number): Promise<FixLogEntry[]>;

  /**
   * Analyze fix patterns (for weekly review).
   *
   * @param startDate - Analysis start date
   * @param endDate - Analysis end date
   * @returns Pattern analysis result
   */
  analyzePatterns(startDate?: Date, endDate?: Date): Promise<PatternAnalysis>;
}
```

### Types

```typescript
interface FixLogEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  trackId?: string;
  error: {
    type: 'build' | 'lint' | 'type' | 'test' | 'logic' | 'unknown';
    code: string;
    message: string;
    file: string;
    line: number;
    severity: 'error' | 'warning';
  };
  fix: {
    patternId: string;
    strategy: string;
    diff: string;
    filesModified: string[];
    confidence: 'high' | 'medium' | 'low';
  };
  outcome: {
    success: boolean;
    verified: boolean;
    strikesUsed: number;
    escalated: boolean;
    antiCheatViolation: boolean;
  };
  cost: {
    model: string;
    estimatedCost: number;
    actualCost: number;
  };
  context: {
    complexity: 'simple' | 'moderate' | 'complex' | 'critical';
    sprintId?: string;
    taskType?: string;
  };
}

interface PatternAnalysis {
  totalFixes: number;
  successRate: number;
  patterns: {
    id: string;
    frequency: number;
    successRate: number;
    avgCost: number;
  }[];
  errorTypes: Record<string, number>;
  recommendations: string[];
}
```

### Usage Example

```typescript
// Log a fix
await fixLogger.logFix({
  id: 'fix-20260516-100000',
  timestamp: new Date(),
  sessionId: 'session-123',
  error: {
    type: 'type',
    code: 'TS2304',
    message: "Cannot find name 'User'",
    file: 'src/models/user.ts',
    line: 15,
    severity: 'error',
  },
  fix: {
    patternId: 'missing-import',
    strategy: 'add_import',
    diff: '+ import { User } from "./models/user";\n',
    filesModified: ['src/auth/login.ts'],
    confidence: 'high',
  },
  outcome: {
    success: true,
    verified: true,
    strikesUsed: 1,
    escalated: false,
    antiCheatViolation: false,
  },
  cost: {
    model: 'claude-3-5-haiku',
    estimatedCost: 0.05,
    actualCost: 0.04,
  },
  context: {
    complexity: 'simple',
    taskType: 'code_implementation',
  },
});

// Analyze patterns (weekly review)
const analysis = await fixLogger.analyzePatterns();
console.log(`Success rate: ${analysis.successRate}%`);
console.log('Top patterns:', analysis.patterns.slice(0, 5));
```

---

## Cross-Module Integration APIs

### CheckpointManager ↔ BudgetTracker

```typescript
// CheckpointManager updates budget state
interface ICheckpointManager {
  updateCostTracking(costUpdate: CostUpdate): Promise<void>;
}

// BudgetTracker restores from checkpoint
interface IBudgetTracker {
  restoreState(state: BudgetStateRestore): Promise<void>;
}
```

### BudgetTracker ↔ EscalationRouter

```typescript
// BudgetTracker escalates on limit
async handleLimitReached(type: 'session' | 'daily', amount: number): Promise<BudgetAction> {
  const decision: Decision = {
    type: 'budget',
    description: `${type} budget limit reached: $${amount}`,
    impact: 'high',
  };

  const result = await escalationRouter.routeDecision(decision);
  // ...
}
```

### SelfCorrectionEngine ↔ FixLogger

```typescript
// SelfCorrectionEngine logs every fix
async fixError(error: ErrorClassification): Promise<FixResult> {
  const fixResult = await deterministicFixer.fix(error);

  await fixLogger.logFix({
    // ... fix log entry
  });

  return fixResult;
}
```

---

## Error Handling

### Standard Error Classes

```typescript
class CheckpointError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = 'CheckpointError';
  }
}

class BudgetError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = 'BudgetError';
  }
}

class AntiCheatViolationError extends Error {
  constructor(message: string, public violations: string[]) {
    super(message);
    this.name = 'AntiCheatViolationError';
  }
}
```

### Error Codes

| Error Code | Module | Description |
|------------|--------|-------------|
| `CHECKPOINT_NOT_FOUND` | Checkpoint | Checkpoint ID does not exist |
| `CHECKPOINT_CORRUPT` | Checkpoint | Checkpoint file corrupted |
| `CONFLICT_UNRESOLVED` | Checkpoint | File conflicts require manual resolution |
| `BUDGET_LIMIT_EXCEEDED` | Budget | Session or daily budget exceeded |
| `CIRCUIT_BREAKER_OPEN` | Budget | Circuit breaker triggered (max retry, cost, duration) |
| `APPROVAL_TIMEOUT` | Escalation | Approval request timed out |
| `ANTI_CHEAT_VIOLATION` | Self-Correction | Fix violates anti-cheat rules |
| `FIX_FAILED` | Self-Correction | Fix applied but verification failed |
| `MAX_RETRIES_EXCEEDED` | Self-Correction | 3 strikes reached |

---

## Versioning

**API Version**: 1.0.0 (Sprint 35)

**Breaking Changes Policy**:
- Major version bump (2.0.0) for breaking changes
- Minor version bump (1.1.0) for new features (backward compatible)
- Patch version bump (1.0.1) for bug fixes

**Deprecation Policy**:
- Deprecated APIs supported for 2 sprints (20 days)
- Warning logged when deprecated API used
- Migration guide provided in release notes

---

## Related Documents

- **Design Documents**: `docs/02-design/autonomy-epic/00-06-*.md`
- **Integration Overview**: `00-integration-overview.md`
- **Data Contracts**: `02-data-contracts.md`
- **Sprint Plans**: `docs/01-planning/sprint-35-40-*.md`

---

**Approved By**: API Architect + Tech Lead
**Date**: 2026-02-22
**Status**: APPROVED - API contracts finalized
**Next Review**: Sprint 35 Day 3 (after initial implementation)

---

*Autonomy Epic - API Specifications v1.0.0*
*EndiorBot SDLC Framework 6.1.1*
