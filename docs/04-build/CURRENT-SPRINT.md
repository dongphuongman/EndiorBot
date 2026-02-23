# Current Sprint: Sprint 36 - Autonomy Epic Phase 2

**Sprint Duration**: February 22 - March 7, 2026 (10 working days)
**Sprint Goal**: Budget control and escalation for safe autonomous execution
**Status**: IN PROGRESS - Day 6-7 Complete
**Priority**: P0 (Autonomy Epic)
**Framework**: SDLC 6.1.1
**Previous Sprint**: Sprint 35 COMPLETE - Checkpoint/Resume Capability

---

## Sprint 36 Overview

**Problem**: Autonomous sessions need budget control to prevent runaway costs and CEO notification spam. Without limits, a single session could spend $50+ unchecked.

**Sprint 36 Deliverables**:

| Day | Deliverable | Status |
|-----|-------------|--------|
| **Day 1** | ADR-007 Approval + Budget Types | ✅ COMPLETE |
| **Day 2-3** | BudgetTracker + Circuit Breakers | ✅ COMPLETE |
| **Day 4** | CostEstimator + Token Estimation | ✅ COMPLETE |
| **Day 5** | Checkpoint Integration + Budget Recovery | ✅ COMPLETE |
| **Day 6-7** | Escalation Router + Decision Classifier + ApprovalQueue | ✅ COMPLETE |
| **Day 8** | CLI Commands + Integration | ⏳ PENDING |
| **Day 9** | Notification System + Rate Limiter | ⏳ PENDING |
| **Day 10** | E2E Testing + Sprint Review | ⏳ PENDING |

---

## ADR-007 Key Decisions

### Budget Limits (Hard Limits)
- **Session Limit**: $2.00
- **Daily Limit**: $10.00
- **Per-Track Limit**: $0.50 (Sprint 39+)
- **Warning Threshold**: 80%

### Circuit Breakers
- **Max Retries**: 3 per task
- **Max Cost**: $0.50 per task
- **Max Duration**: 5 minutes per task

### Notification Rate Limiting
- **Max Rate**: 4 notifications per hour
- **Batch Window**: 5 minutes
- **Channels**: Console, Email, Slack (configurable)

### Fallback Strategy
- **On Limit**: Pause and notify CEO
- **Fallback Model**: Ollama (qwen2.5-coder) when budget exhausted
- **Escalation**: Create approval request for CEO

---

## Day 1: ADR-007 Approval + Budget Types

### Tasks
- [x] ADR-007 status changed to APPROVED
- [x] Create `src/budget/types.ts` - Budget type definitions (~320 LOC)
- [x] Create `src/budget/index.ts` - Module exports (~55 LOC)
- [x] Create `tests/budget/types.test.ts` - Type validation tests (52 tests, ~380 LOC)

### Type Definitions (per ADR-007)

```typescript
// Core Budget Types
interface BudgetConfig {
  daily_limit: number;           // USD, default: $10.00
  per_session_limit: number;     // USD, default: $2.00
  per_track_limit?: number;      // USD, default: $0.50
  warning_threshold: number;     // Percentage, default: 80%
  on_limit_reached: LimitAction;
  notification: NotificationConfig;
  circuit_breakers: CircuitBreakerConfig;
  estimation: EstimationConfig;
}

interface BudgetState {
  session: SessionBudget;
  daily: DailyBudget;
  tracks?: Record<string, TrackBudget>;
  tokenUsage: TokenUsageRecord[];
  historical: HistoricalData;
}

interface TokenUsageRecord {
  timestamp: Date;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  taskType?: TaskType;
  taskId?: string;
  trackId?: string;
}

interface CostEstimate {
  estimated_cost: number;
  estimated_tokens: { input: number; output: number };
  confidence: 'low' | 'medium' | 'high';
  confidence_score: number;
  historical_avg?: number;
  breakdown?: CostBreakdown;
  recommendation?: string;
}

interface BudgetAction {
  action: 'continue' | 'pause' | 'switch_model' | 'escalate' | 'fail';
  reason?: string;
  model?: string;
  approvalId?: string;
  remainingBudget?: { session: number; daily: number };
}

interface CircuitBreakerResult {
  status: 'closed' | 'open' | 'half_open';
  reason?: CircuitBreakerReason;
  escalate: boolean;
  metrics: TaskMetrics;
}
```

---

## Sprint 36 Metrics (Running)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Tests passing | 100% | 958/958 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| Budget types tests | > 20 | 52 | ✅ COMPLETE |
| BudgetTracker tests | > 30 | 56 | ✅ COMPLETE |
| CircuitBreaker tests | > 30 | 44 | ✅ COMPLETE |
| PricingRegistry tests | > 20 | 36 | ✅ COMPLETE |
| CostEstimator tests | > 20 | 37 | ✅ COMPLETE |
| Checkpoint integration tests | > 20 | 36 | ✅ COMPLETE |
| DecisionClassifier tests | > 20 | 48 | ✅ COMPLETE |
| EscalationRouter tests | > 20 | 37 | ✅ COMPLETE |
| ApprovalQueue tests | > 20 | 51 | ✅ COMPLETE |
| Notification tests | > 20 | 0 | ⏳ DAY 9 |
| E2E tests | > 10 | 0 | ⏳ DAY 10 |

---

## Day 1 Complete (2026-02-22)

### ADR-007 Approval
- [x] ADR-007 reviewed and status changed to APPROVED
- [x] Core interfaces defined per specification
- [x] Budget limits: $2 session, $10 daily, 80% warning

### Budget Types Implementation
- [x] `src/budget/types.ts` - 27 types/interfaces (~320 LOC)
  - BudgetConfig, BudgetState, TokenUsageRecord
  - CostEstimate, BudgetAction, CircuitBreakerResult
  - Notification, ApprovalRequest, ModelPricing
  - Factory functions: createInitialBudgetState, createEmptyTaskMetrics
  - Utility functions: needsDailyReset, calculateBudgetPercentage, etc.
- [x] `src/budget/index.ts` - Module exports (~55 LOC)
- [x] `tests/budget/types.test.ts` - 52 unit tests (~380 LOC)

### Day 1 Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Tests passing | 100% | 613/613 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| Budget types tests | > 20 | 52 | ✅ PASS |
| LOC added | ~520 | ~755 | ✅ PASS |

---

## Day 2-3 Complete (2026-02-22)

### CircuitBreaker Implementation
- [x] `src/budget/circuit-breaker.ts` - Full state machine (~493 LOC)
  - NotificationRateLimiter class (4/hour per CPO)
  - CircuitBreaker state machine: closed → open → half_open
  - Cool-down period for recovery (per CTO)
  - Probe request pattern in half_open
  - Threshold evaluation with warning/critical/limit levels
- [x] `tests/budget/circuit-breaker.test.ts` - 44 unit tests (~594 LOC)

### BudgetTracker Implementation
- [x] `src/budget/budget-tracker.ts` - Full tracking (~1016 LOC)
  - Session and daily budget tracking
  - Per CTO: calls needsDailyReset() on every cost record
  - Cost estimation based on model pricing
  - Threshold evaluation and warnings
  - Event emission for budget events
  - Shared rate limiter across all circuit breakers
- [x] `tests/budget/budget-tracker.test.ts` - 56 unit tests (~796 LOC)

### Day 2-3 Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Tests passing | 100% | 713/713 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| BudgetTracker tests | > 30 | 56 | ✅ PASS |
| CircuitBreaker tests | > 30 | 44 | ✅ PASS |
| LOC added | ~1350 | ~2899 | ✅ PASS |

---

## Day 4 Complete (2026-02-22)

### PricingRegistry Implementation
- [x] `src/budget/pricing-registry.ts` - File-based pricing config (~370 LOC)
  - Per CTO: Pricing staleness addressed via loadable `.endiorbot/pricing.json`
  - Deep copy of default config to prevent mutation
  - Methods: getPricing, calculateCost, isStale, reload, updatePricing
  - NQH API models (api.nqh-internal.example) with $0 pricing
- [x] `tests/budget/pricing-registry.test.ts` - 36 unit tests (~533 LOC)

### CostEstimator Implementation
- [x] `src/budget/cost-estimator.ts` - Honest confidence estimation (~590 LOC)
  - Per CTO: Confidence defaults to LOW until historical data proves accuracy
  - Thresholds: minSessionsForMedium=10, minSessionsForHigh=50
  - Token estimation via BASE_OUTPUT_ESTIMATES per task type
  - Running average tracking for actual costs
  - Smart recommendations (NQH for simple tasks, Sonnet for expensive)
- [x] `tests/budget/cost-estimator.test.ts` - 37 unit tests (~475 LOC)

### Day 4 Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Tests passing | 100% | 786/786 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| PricingRegistry tests | > 20 | 36 | ✅ PASS |
| CostEstimator tests | > 20 | 37 | ✅ PASS |
| LOC added | ~750 | ~1968 | ✅ PASS |

---

## Day 5 Complete (2026-02-22)

### Checkpoint Integration Implementation
- [x] `src/budget/checkpoint-integration.ts` - Budget-checkpoint bridge (~400 LOC)
  - Per CTO: Session costs carry over on resume (not reset to zero)
  - Per CTO: Daily budget persists across sessions (file-backed)
  - DailyBudgetStore class with file persistence at `~/.endiorbot/daily-budget.json`
  - Functions: extractCostState, restoreBudgetFromCheckpoint, createBudgetStateFromCheckpoint
- [x] `tests/budget/checkpoint-integration.test.ts` - 36 unit tests (~550 LOC)

### BudgetTracker Extensions
- [x] Added `restoreFromCheckpoint(costState: CostState)` method
- [x] Added `toCostState()` method for checkpoint saves
- [x] Added `budget_restored` and `threshold_warning` event types

### Day 5 Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Tests passing | 100% | 822/822 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| Checkpoint integration tests | > 20 | 36 | ✅ PASS |
| LOC added | ~450 | ~950 | ✅ PASS |

---

## Day 6-7 Complete (2026-02-22)

### DecisionClassifier Implementation
- [x] `src/budget/decision-classifier.ts` - 4-bucket classification (~420 LOC)
  - Per CTO: Decision buckets: auto/notify/block/consult
  - Intervention matrix with 14 decision types
  - Escalation conditions (security, cost, files affected)
  - Factory functions: createDecisionClassifier, classifyDecision
- [x] `tests/budget/decision-classifier.test.ts` - 48 unit tests (~450 LOC)

### EscalationRouter Implementation
- [x] `src/budget/escalation-router.ts` - Routing with L1/L2/L3 levels (~400 LOC)
  - Per CTO: Shared NotificationRateLimiter (no second instance)
  - L1: Auto-execute, L2: Notify/Consult, L3: Block/Queue
  - Retry tracking with escalation
  - Approval queue callback integration
- [x] `tests/budget/escalation-router.test.ts` - 37 unit tests (~400 LOC)

### ApprovalQueue Implementation
- [x] `src/budget/approval-queue.ts` - File-backed queue (~450 LOC)
  - Per CTO: Persistence at ~/.endiorbot/approval-queue.json
  - Approve/Reject/Cancel workflow
  - Auto-expiry after 24 hours
  - Statistics and history tracking
- [x] `tests/budget/approval-queue.test.ts` - 51 unit tests (~500 LOC)

### Day 6-7 Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Tests passing | 100% | 958/958 | ✅ PASS |
| Lint warnings | 0 | 0 | ✅ PASS |
| Build | Pass | Pass | ✅ PASS |
| DecisionClassifier tests | > 20 | 48 | ✅ PASS |
| EscalationRouter tests | > 20 | 37 | ✅ PASS |
| ApprovalQueue tests | > 20 | 51 | ✅ PASS |
| LOC added | ~750 | ~2620 | ✅ PASS |

---

## Files to Create (Sprint 36)

### Day 1 Files (COMPLETE)
| File | LOC | Purpose |
|------|-----|---------|
| `src/budget/types.ts` | ~320 | Budget type definitions (27 interfaces/types) |
| `src/budget/index.ts` | ~55 | Module exports |
| `tests/budget/types.test.ts` | ~380 | Type validation tests (52 tests) |

### Day 2-3 Files (COMPLETE)
| File | LOC | Purpose |
|------|-----|---------|
| `src/budget/budget-tracker.ts` | ~1016 | Budget tracking and enforcement |
| `src/budget/circuit-breaker.ts` | ~493 | Circuit breaker + rate limiter |
| `tests/budget/budget-tracker.test.ts` | ~796 | BudgetTracker tests (56 tests) |
| `tests/budget/circuit-breaker.test.ts` | ~594 | CircuitBreaker tests (44 tests) |

### Day 4 Files (COMPLETE)
| File | LOC | Purpose |
|------|-----|---------|
| `src/budget/pricing-registry.ts` | ~370 | File-based pricing config |
| `src/budget/cost-estimator.ts` | ~590 | Cost estimation with honest confidence |
| `tests/budget/pricing-registry.test.ts` | ~533 | PricingRegistry tests (36 tests) |
| `tests/budget/cost-estimator.test.ts` | ~475 | CostEstimator tests (37 tests) |

### Day 5 Files (COMPLETE)
| File | LOC | Purpose |
|------|-----|---------|
| `src/budget/checkpoint-integration.ts` | ~400 | Budget-checkpoint bridge + DailyBudgetStore |
| `tests/budget/checkpoint-integration.test.ts` | ~550 | Checkpoint integration tests (36 tests) |

### Day 6-7 Files (COMPLETE)
| File | LOC | Purpose |
|------|-----|---------|
| `src/budget/decision-classifier.ts` | ~420 | 4-bucket classification + intervention matrix |
| `src/budget/escalation-router.ts` | ~400 | L1/L2/L3 escalation routing |
| `src/budget/approval-queue.ts` | ~450 | File-backed approval persistence |
| `tests/budget/decision-classifier.test.ts` | ~450 | DecisionClassifier tests (48 tests) |
| `tests/budget/escalation-router.test.ts` | ~400 | EscalationRouter tests (37 tests) |
| `tests/budget/approval-queue.test.ts` | ~500 | ApprovalQueue tests (51 tests) |

### Day 8 Files
| File | LOC (Est) | Purpose |
|------|-----------|---------|
| `src/budget/approval-queue.ts` | ~300 | Approval queue persistence |
| `src/cli/commands/budget.ts` | ~250 | Budget CLI commands |
| `tests/budget/approval-queue.test.ts` | ~300 | ApprovalQueue tests |
| `tests/cli/commands/budget.test.ts` | ~250 | CLI tests |

### Day 9 Files
| File | LOC (Est) | Purpose |
|------|-----------|---------|
| `src/budget/notification.ts` | ~300 | Notification system |
| `src/budget/rate-limiter.ts` | ~200 | Rate limiting |
| `tests/budget/notification.test.ts` | ~300 | Notification tests |
| `tests/budget/rate-limiter.test.ts` | ~200 | Rate limiter tests |

### Day 10 Files
| File | LOC (Est) | Purpose |
|------|-----------|---------|
| `tests/budget/e2e.test.ts` | ~500 | E2E test scenarios |

---

## Team Context

| Role | Member | Current Focus |
|------|--------|---------------|
| CEO | Human | Sprint approval |
| PM | @pm (AI) | Sprint planning |
| CTO | @cto (AI) | Architecture review |
| Reviewer | @reviewer (AI) | Code quality |
| Coder | @coder (AI) | Implementation |

---

## Approval Status

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | 2026-02-22 | ✅ Sprint 36 Planned |
| CTO | @cto | 2026-02-22 | ✅ ADR-007 Approved |
| Reviewer | @reviewer | PENDING | |
| CEO | @CEO | 2026-02-22 | ✅ Sprint 36 Started |

---

## Sprint 35 Summary (Previous)

**Sprint 35** completed checkpoint/resume capability:

| Deliverable | Status |
|-------------|--------|
| Event Logging Foundation (32 tests) | ✅ COMPLETE |
| Checkpoint State Implementation (60 tests) | ✅ COMPLETE |
| Conflict Detection & Classification (33 tests) | ✅ COMPLETE |
| Checkpoint Versioning & Migration (82 tests) | ✅ COMPLETE |
| Resume Handler & Restore Flow (30 tests) | ✅ COMPLETE |
| Git Automation (46 tests) | ✅ COMPLETE |
| CLI Integration (23 tests) | ✅ COMPLETE |
| E2E Testing (24 tests) | ✅ COMPLETE |
| G-Sprint-35 Close | ✅ APPROVED |

**Total Sprint 35 Tests**: 330 new tests
**Total Project Tests**: 561/561 passing

---

**Last Updated**: 2026-02-22 (by @coder - Sprint 36 Day 6-7 Complete)
**Sprint Owner**: @coder (AI)
**Sprint Status**: IN PROGRESS - Day 6-7 Complete, Day 8 Next
