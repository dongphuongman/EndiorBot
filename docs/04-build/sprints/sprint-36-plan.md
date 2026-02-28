# Sprint 36 Detailed Plan - Autonomy Epic Phase 2

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Autonomy Epic)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 35 Complete (Checkpoint + Resume validated)
- ADR-007 Approved (Autonomous Execution Budget)
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 36 implements **Phase 2: Escalation & Budget Control** - the safety net that MUST be in place before increasing autonomy.

### Vision: Safety-First Autonomy

```
Without Phase 2:  Runaway costs, unchecked decisions, CEO overwhelmed
With Phase 2:     Budget limits, smart escalation, CEO informed but not interrupted
```

### Why Phase 2 BEFORE Self-Correction?

> **CPO/CTO Requirement**: "You need the safety net in place before giving EndiorBot more autonomy."

Without escalation + budget control:
- ❌ Self-correction (Sprint 37) could loop infinitely → runaway costs
- ❌ No pause mechanism when budget limit reached
- ❌ Architecture changes happen without CEO approval
- ❌ CEO gets notification spam (no rate limiting)

With Phase 2 as foundation:
- ✅ Budget tracker pauses at $2 session / $10 daily limit
- ✅ Escalation router blocks risky decisions
- ✅ Approval queue persists across sessions
- ✅ Notification rate limited to 4/hour max

---

## Sprint Goal

**Implement budget control and escalation protocols to enable safe autonomous operation with minimal CEO intervention.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 35** | Checkpoint + Resume validated | PLANNED | Sprint 36 start |
| **ADR-007** | Autonomous Execution Budget | DRAFT | Sprint 36 Day 1 |
| **Phase 2 validated** | G-Sprint-35 PASS | Pending | Sprint 36 start |

### Phase 2 Validation Criteria (from Autonomy Epic)

Sprint 35 → Sprint 36 Gate:
- [ ] Budget tracker tested with real provider calls
- [ ] Budget tracker correctly pauses at limit ($2 session limit)
- [ ] Escalation queue blocks architecture changes
- [ ] Notification sent to CEO on budget warning
- [ ] Integration test passes: budget limit → Ollama fallback

**Gate**: All criteria must PASS before Sprint 36 Day 1.

---

## Sprint 36 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Budget Tracker + Cost Estimator | budget-tracker.ts, cost-estimator.ts, ADR-007 |
| **Week 2** | Escalation Router + Approval Queue + Notification | escalation-router.ts, approval-queue.ts, notification.ts |

**Duration**: 10 working days (March 29 - April 9, 2026)

---

## Week 1: Budget Control (Day 1-5)

### Day 1: ADR-007 Approval + Budget Configuration

**Goal**: Formalize ADR-007 and set up budget configuration.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create ADR-007 draft | P0 | ADR-007-Autonomous-Execution-Budget.md | ~400 |
| Review ADR-007 with @cto | P0 | ADR-007.md APPROVED | - |
| Create src/agents/budget/types.ts | P0 | Budget types | ~150 |
| Create src/config/budget-defaults.ts | P0 | Default budget config | ~100 |
| Create tests/agents/budget/types.test.ts | P0 | Unit tests | ~80 |

**Acceptance Criteria**:
- [ ] ADR-007 defines budget model, limits, actions
- [ ] BudgetConfig interface includes: daily_limit, per_session_limit, warning_threshold
- [ ] BudgetConfig includes: on_limit_reached (pause_and_notify, switch_to_ollama, fail_fast)
- [ ] Default config: $10 daily, $2 session, 80% warning
- [ ] Tests pass: config validation
- [ ] Build passes

**Budget Configuration Schema**:
```typescript
interface BudgetConfig {
  daily_limit: number;           // USD, default: $10
  per_session_limit: number;     // USD, default: $2
  warning_threshold: number;     // Percentage, default: 80%

  on_limit_reached: {
    action: 'pause_and_notify' | 'switch_to_ollama' | 'fail_fast';
    fallback_model?: string;     // For 'switch_to_ollama'
  };

  notification: {
    channels: ('console' | 'email' | 'slack')[];
    rate_limit: number;          // Max notifications per hour, default: 4
  };

  // Circuit breakers (per Expert feedback)
  circuit_breakers: {
    max_retry_per_task: number;  // Default: 3
    max_cost_per_task: number;   // Default: $0.50
    max_duration_per_task: number; // Milliseconds, default: 300000 (5 min)
  };
}
```

**Integration Points**:
```
budget/types.ts
    └── Config (src/config/types.ts) ✅ Sprint 33
    └── Provider types (src/providers/types.ts) ✅ Sprint 29
```

---

### Day 2-3: Budget Tracker Implementation

**Goal**: Implement budget tracking and enforcement.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/budget/budget-tracker.ts | P0 | Budget tracking logic | ~400 |
| Create src/agents/budget/cost-accumulator.ts | P0 | Cost accumulation | ~150 |
| Create src/agents/budget/circuit-breaker.ts | P0 | Circuit breakers | ~200 |
| Create tests/agents/budget/budget-tracker.test.ts | P0 | Unit tests | ~250 |

**Acceptance Criteria**:
- [ ] BudgetTracker tracks costs: sessionCostSoFar, dailyCostSoFar
- [ ] BudgetTracker pauses at session limit ($2.00)
- [ ] BudgetTracker pauses at daily limit ($10.00)
- [ ] BudgetTracker warns at 80% threshold
- [ ] BudgetTracker integrates with CheckpointState.sessionCostSoFar (Sprint 35)
- [ ] Circuit breakers: max retry (3), max cost per task ($0.50), max duration (5 min)
- [ ] Circuit breakers trigger escalation on breach
- [ ] Tests pass: budget enforcement, circuit breakers
- [ ] Build passes

**Budget Tracker Logic**:
```typescript
class BudgetTracker {
  private sessionCost: number = 0;
  private dailyCost: number = 0;
  private config: BudgetConfig;

  async recordCost(taskId: string, cost: number, model: string): Promise<BudgetAction> {
    this.sessionCost += cost;
    this.dailyCost += cost;

    // Update checkpoint (Sprint 35)
    await checkpoint.updateCostTracking({
      sessionCostSoFar: this.sessionCost,
      tokenUsage: [...this.tokenUsage, { model, cost }],
    });

    // Check session limit
    if (this.sessionCost >= this.config.per_session_limit) {
      return this.handleLimitReached('session', this.sessionCost);
    }

    // Check daily limit
    if (this.dailyCost >= this.config.daily_limit) {
      return this.handleLimitReached('daily', this.dailyCost);
    }

    // Check warning threshold
    const sessionPercent = (this.sessionCost / this.config.per_session_limit) * 100;
    if (sessionPercent >= this.config.warning_threshold) {
      await this.notifyWarning('session', sessionPercent);
    }

    return { action: 'continue' };
  }

  private async handleLimitReached(type: 'session' | 'daily', amount: number): Promise<BudgetAction> {
    // Checkpoint before pausing (Sprint 35)
    await checkpoint.create({
      reason: 'budget_pause',
      description: `${type} limit reached: $${amount}`,
    });

    // Notify CEO (rate limited)
    await notification.send({
      type: 'budget_limit',
      message: `${type} budget limit reached: $${amount}`,
      options: ['continue_with_approval', 'switch_to_ollama', 'stop'],
    });

    // Execute on_limit_reached action
    switch (this.config.on_limit_reached.action) {
      case 'pause_and_notify':
        return { action: 'pause', reason: `${type}_limit_reached` };
      case 'switch_to_ollama':
        return { action: 'switch_model', model: 'ollama' };
      case 'fail_fast':
        throw new BudgetLimitError(`${type} budget limit reached`);
    }
  }
}
```

**Circuit Breaker Logic** (per Expert feedback):
```typescript
class CircuitBreaker {
  async checkTask(taskId: string, metrics: TaskMetrics): Promise<CircuitBreakerResult> {
    // Check retry count
    if (metrics.retryCount >= this.config.max_retry_per_task) {
      return { status: 'open', reason: 'max_retry_exceeded', escalate: true };
    }

    // Check cost per task
    if (metrics.costSoFar >= this.config.max_cost_per_task) {
      return { status: 'open', reason: 'max_cost_exceeded', escalate: true };
    }

    // Check duration per task
    if (metrics.durationMs >= this.config.max_duration_per_task) {
      return { status: 'open', reason: 'max_duration_exceeded', escalate: true };
    }

    return { status: 'closed' };
  }
}
```

**Integration Points**:
```
budget-tracker.ts
    └── ProviderRegistry (src/providers/registry.ts) ✅ Sprint 29
    └── BaseProvider (src/providers/base.ts) ✅ Sprint 29 [cost data]
    └── CheckpointState (Sprint 35) [sessionCostSoFar]
    └── Logger (src/logging/logger.ts) ✅ Sprint 34
    └── EventsLogger (Sprint 35) [budget events]
```

---

### Day 4: Cost Estimator

**Goal**: Predict task costs before execution.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/budget/cost-estimator.ts | P0 | Cost prediction | ~250 |
| Create src/agents/budget/token-estimator.ts | P1 | Token estimation | ~150 |
| Create tests/agents/budget/cost-estimator.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] `estimateCost(taskType, model)` predicts cost
- [ ] Estimation based on: task complexity, model pricing, historical data
- [ ] Token estimation for prompt + expected response
- [ ] Confidence interval: low/medium/high
- [ ] Tests pass: estimation accuracy (within 30%)
- [ ] Build passes

**Cost Estimation Logic**:
```typescript
interface CostEstimate {
  estimated_cost: number;      // USD
  estimated_tokens: {
    input: number;
    output: number;
  };
  confidence: 'low' | 'medium' | 'high';
  historical_avg?: number;     // From past similar tasks
}

async function estimateCost(
  taskType: TaskType,
  model: string,
  context: TaskContext
): Promise<CostEstimate> {
  // Estimate input tokens (prompt + context)
  const inputTokens = estimateInputTokens(context);

  // Estimate output tokens (based on task type)
  const outputTokens = estimateOutputTokens(taskType);

  // Get model pricing
  const pricing = await getModelPricing(model);

  // Calculate cost
  const cost =
    (inputTokens / 1000) * pricing.input_per_1k +
    (outputTokens / 1000) * pricing.output_per_1k;

  // Check historical data
  const historicalAvg = await getHistoricalAverage(taskType, model);

  return {
    estimated_cost: cost,
    estimated_tokens: { input: inputTokens, output: outputTokens },
    confidence: historicalAvg ? 'high' : 'medium',
    historical_avg: historicalAvg,
  };
}
```

---

### Day 5: Budget Integration with Checkpoint

**Goal**: Integrate budget tracking with checkpoint system.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Update CheckpointState integration | P0 | Budget fields in checkpoint | ~100 |
| Create budget recovery logic | P0 | Restore budget state on resume | ~150 |
| Update resume-handler.ts | P0 | Budget restoration | +50 |
| Create tests/agents/budget/integration.test.ts | P0 | Integration tests | ~200 |

**Acceptance Criteria**:
- [ ] CheckpointState.sessionCostSoFar restored on resume
- [ ] CheckpointState.tokenUsage restored on resume
- [ ] Budget tracker resumes from checkpointed state
- [ ] Daily budget resets at midnight (UTC)
- [ ] Tests pass: checkpoint → budget recovery
- [ ] Build passes

**Budget Recovery on Resume**:
```typescript
async function restoreBudgetState(checkpoint: CheckpointState): Promise<void> {
  // Restore session cost
  budgetTracker.sessionCost = checkpoint.sessionCostSoFar;

  // Restore token usage
  budgetTracker.tokenUsage = checkpoint.tokenUsage;

  // Check if daily limit still applies
  const checkpointDate = new Date(checkpoint.createdAt);
  const now = new Date();

  if (isSameDay(checkpointDate, now)) {
    // Same day, restore daily cost
    budgetTracker.dailyCost = checkpoint.dailyCostSoFar;
  } else {
    // New day, reset daily cost
    budgetTracker.dailyCost = 0;
  }

  logger.info('Budget state restored', {
    sessionCost: budgetTracker.sessionCost,
    dailyCost: budgetTracker.dailyCost,
  });
}
```

---

## Week 2: Escalation & Notification (Day 6-10)

### Day 6-7: Escalation Router

**Goal**: Implement decision escalation system.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/escalation/types.ts | P0 | Escalation types | ~150 |
| Create src/agents/escalation/escalation-router.ts | P0 | Escalation routing | ~400 |
| Create src/agents/escalation/decision-classifier.ts | P0 | Decision classification | ~200 |
| Create tests/agents/escalation/escalation.test.ts | P0 | Unit tests | ~250 |

**Acceptance Criteria**:
- [ ] Decision classification: auto, notify, block
- [ ] Escalation levels: Agent Retry → Multi-Model → CEO
- [ ] Architecture changes always escalate to CEO (block until approval)
- [ ] Security-related decisions always escalate
- [ ] Major refactors escalate
- [ ] Bug fixes auto-approve
- [ ] New files auto-approve (with notification)
- [ ] Tests pass: classification accuracy >90%
- [ ] Build passes

**Escalation Levels** (from Autonomy Epic):
```
Level 1: Agent Retry (auto)
    ↓ fail
Level 2: Multi-Model Consultation (@cto)
    ↓ fail or requires approval
Level 3: Human Coach (CEO/Developer)
```

**Decision Classification Matrix** (from Autonomy Epic):
| Decision Type | Auto | Notify | Block |
|---------------|------|--------|-------|
| Bug fix | ✅ | - | - |
| New file | ✅ | - | - |
| Architecture change | - | ✅ | ✅ |
| Major refactor | - | ✅ | ✅ |
| Security-related | - | ✅ | ✅ |
| Budget threshold | - | ✅ | ✅ |
| Delete files | - | ✅ | - |
| External API | - | ✅ | - |

**Escalation Router Logic**:
```typescript
class EscalationRouter {
  async routeDecision(decision: Decision): Promise<EscalationResult> {
    // Classify decision
    const classification = await this.classifyDecision(decision);

    switch (classification) {
      case 'auto':
        // Proceed automatically
        return { action: 'proceed', approval: 'automatic' };

      case 'notify':
        // Notify CEO but proceed
        await notification.send({
          type: 'decision_notification',
          decision,
          canProceed: true,
        });
        return { action: 'proceed', approval: 'notified' };

      case 'block':
        // Block until CEO approval
        const approvalId = await approvalQueue.enqueue(decision);
        return { action: 'wait_approval', approvalId };

      case 'consult':
        // Multi-model consultation first
        const consultation = await multiModelOrchestrator.consult({
          query: decision.description,
          taskType: decision.type,
        });

        if (consultation.hasConsensus) {
          return { action: 'proceed', approval: 'consensus', consultation };
        } else {
          // Escalate to CEO if no consensus
          const approvalId = await approvalQueue.enqueue(decision);
          return { action: 'wait_approval', approvalId, consultation };
        }
    }
  }
}
```

**Integration Points**:
```
escalation-router.ts
    └── MultiModelOrchestrator (src/agents/orchestrator/) ✅ Sprint 32
    └── AgentScope (src/agents/scope.ts) ✅ Sprint 32
    └── ApprovalQueue (new, Day 8)
    └── Notification (new, Day 9)
```

---

### Day 8: Approval Queue

**Goal**: Implement persistent approval queue.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/escalation/approval-queue.ts | P0 | Approval queue | ~300 |
| Create src/agents/escalation/approval-types.ts | P0 | Approval types | ~100 |
| Create tests/agents/escalation/approval-queue.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Approval queue persists to `~/.endiorbot/approvals.json`
- [ ] Queue includes: id, decision, timestamp, status (pending/approved/rejected)
- [ ] Queue survives checkpoint/resume
- [ ] CLI command: `endiorbot approve <id>` approves decision
- [ ] CLI command: `endiorbot queue` lists pending approvals
- [ ] Notification sent when approval added to queue
- [ ] Tests pass: queue persistence, approval workflow
- [ ] Build passes

**Approval Queue Storage**:
```typescript
interface ApprovalRequest {
  id: string;                  // approval-20260322-100000
  timestamp: Date;
  decision: Decision;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  reason?: string;             // CEO's reason for approval/rejection
  consultation?: ConsensusResult; // If multi-model consulted
}

class ApprovalQueue {
  private queue: ApprovalRequest[] = [];
  private storagePath = '~/.endiorbot/approvals.json';

  async enqueue(decision: Decision): Promise<string> {
    const approval: ApprovalRequest = {
      id: `approval-${Date.now()}`,
      timestamp: new Date(),
      decision,
      status: 'pending',
    };

    this.queue.push(approval);
    await this.persist();

    // Notify CEO
    await notification.send({
      type: 'approval_required',
      approval,
    });

    return approval.id;
  }

  async waitForApproval(approvalId: string, timeout: number = 3600000): Promise<ApprovalResult> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const approval = this.queue.find(a => a.id === approvalId);

      if (!approval) {
        throw new Error(`Approval ${approvalId} not found`);
      }

      if (approval.status === 'approved') {
        return { approved: true, reason: approval.reason };
      }

      if (approval.status === 'rejected') {
        return { approved: false, reason: approval.reason };
      }

      // Wait 1 second before checking again
      await sleep(1000);
    }

    // Timeout
    return { approved: false, reason: 'timeout' };
  }
}
```

**Integration with Checkpoint**:
```typescript
// CheckpointState.approvalPending (from ADR-006)
interface CheckpointState {
  // ...
  statemachine: {
    approvalPending: ApprovalRequest[];
  };
}
```

---

### Day 9: Notification System

**Goal**: Implement notification system with rate limiting.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/notification/notification.ts | P0 | Notification logic | ~300 |
| Create src/agents/notification/rate-limiter.ts | P0 | Rate limiting | ~150 |
| Create src/agents/notification/channels.ts | P1 | Console/email/slack | ~200 |
| Create tests/agents/notification/notification.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Notification rate limited to max 4/hour (CPO requirement)
- [ ] Notification types: budget_warning, budget_limit, approval_required, decision_notification
- [ ] Console channel works (default)
- [ ] Email channel works (optional, config)
- [ ] Slack channel works (optional, config)
- [ ] Batching: Multiple notifications → single batch (within 5 min window)
- [ ] Tests pass: rate limiting, batching
- [ ] Build passes

**Notification Rate Limiter** (per CPO requirement):
```typescript
class NotificationRateLimiter {
  private config = {
    max_per_hour: 4,
    batch_window: 300000, // 5 minutes
  };

  private sentCount: { timestamp: Date; type: string }[] = [];
  private batchQueue: Notification[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  async send(notification: Notification): Promise<void> {
    // Check rate limit
    const oneHourAgo = new Date(Date.now() - 3600000);
    this.sentCount = this.sentCount.filter(n => n.timestamp > oneHourAgo);

    if (this.sentCount.length >= this.config.max_per_hour) {
      // Rate limit exceeded, add to batch queue
      this.batchQueue.push(notification);
      this.scheduleBatch();
      logger.warn('Notification rate limit exceeded, queued for batch', {
        queueSize: this.batchQueue.length,
      });
      return;
    }

    // Send immediately
    await this.sendNow(notification);
  }

  private async sendNow(notification: Notification): Promise<void> {
    // Send to configured channels
    for (const channel of this.config.channels) {
      await this.sendToChannel(channel, notification);
    }

    // Record sent notification
    this.sentCount.push({
      timestamp: new Date(),
      type: notification.type,
    });
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(async () => {
      if (this.batchQueue.length > 0) {
        // Send batch summary
        await this.sendNow({
          type: 'batch_summary',
          message: `${this.batchQueue.length} notifications pending`,
          notifications: this.batchQueue,
        });

        this.batchQueue = [];
      }
      this.batchTimer = null;
    }, this.config.batch_window);
  }
}
```

---

### Day 10: E2E Testing & Sprint Review

**Goal**: End-to-end testing and sprint closure.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create tests/e2e/budget-escalation.test.ts | P0 | E2E tests | ~300 |
| Create docs/06-test/budget-test-scenarios.md | P1 | Test scenarios | ~150 |
| Run full test suite | P0 | All tests pass | - |
| Update CURRENT-SPRINT.md | P0 | Sprint 36 CLOSE | - |
| G-Sprint-36 checklist | P0 | Sprint approved | - |

**E2E Test Scenarios**:
- [ ] Scenario 1: Session budget limit ($2) → pause → notify
- [ ] Scenario 2: Daily budget limit ($10) → pause → notify
- [ ] Scenario 3: Budget warning at 80% → notify
- [ ] Scenario 4: Budget limit → fallback to Ollama
- [ ] Scenario 5: Architecture decision → escalate → CEO approve
- [ ] Scenario 6: Bug fix decision → auto-approve
- [ ] Scenario 7: Multi-model consultation → consensus → proceed
- [ ] Scenario 8: Multi-model consultation → no consensus → escalate
- [ ] Scenario 9: Approval queue persists across checkpoint/resume
- [ ] Scenario 10: Notification rate limit (4/hour) enforced
- [ ] Scenario 11: Circuit breaker triggers (max retry, max cost, max duration)

**Acceptance Criteria**:
- [ ] All E2E tests pass
- [ ] All unit tests pass (target: 80+ tests)
- [ ] Build passes
- [ ] Zero lint warnings
- [ ] Code coverage >80% for budget/escalation modules
- [ ] Documentation complete
- [ ] G-Sprint-36 checklist signed off

---

## Sprint 36 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Tests passing** | 100% | All unit + E2E tests |
| **Lint warnings** | 0 | pnpm lint |
| **Build** | Pass | pnpm build |
| **Code coverage** | >80% | vitest --coverage |
| **Budget tests** | >30 | Unit + E2E |
| **Escalation tests** | >20 | Unit + E2E |
| **Integration tests** | >10 | Budget + Checkpoint |
| **Documentation** | Complete | ADR-007, test scenarios |
| **LOC added** | ~4,400 | Budget + Escalation modules |

---

## Files Created (Sprint 36)

### New Files

| File | LOC | Purpose |
|------|-----|---------|
| **Budget** | | |
| `src/agents/budget/types.ts` | ~150 | Budget types |
| `src/agents/budget/budget-tracker.ts` | ~400 | Budget tracking |
| `src/agents/budget/cost-accumulator.ts` | ~150 | Cost accumulation |
| `src/agents/budget/circuit-breaker.ts` | ~200 | Circuit breakers |
| `src/agents/budget/cost-estimator.ts` | ~250 | Cost prediction |
| `src/agents/budget/token-estimator.ts` | ~150 | Token estimation |
| `src/agents/budget/index.ts` | ~50 | Module exports |
| **Escalation** | | |
| `src/agents/escalation/types.ts` | ~150 | Escalation types |
| `src/agents/escalation/escalation-router.ts` | ~400 | Escalation routing |
| `src/agents/escalation/decision-classifier.ts` | ~200 | Decision classification |
| `src/agents/escalation/approval-queue.ts` | ~300 | Approval queue |
| `src/agents/escalation/approval-types.ts` | ~100 | Approval types |
| `src/agents/escalation/index.ts` | ~50 | Module exports |
| **Notification** | | |
| `src/agents/notification/notification.ts` | ~300 | Notification logic |
| `src/agents/notification/rate-limiter.ts` | ~150 | Rate limiting |
| `src/agents/notification/channels.ts` | ~200 | Console/email/slack |
| `src/agents/notification/index.ts` | ~50 | Module exports |
| **Config** | | |
| `src/config/budget-defaults.ts` | ~100 | Default budget config |
| **Tests** | | |
| `tests/agents/budget/types.test.ts` | ~80 | Budget type tests |
| `tests/agents/budget/budget-tracker.test.ts` | ~250 | Budget tracker tests |
| `tests/agents/budget/cost-estimator.test.ts` | ~150 | Cost estimator tests |
| `tests/agents/budget/integration.test.ts` | ~200 | Integration tests |
| `tests/agents/escalation/escalation.test.ts` | ~250 | Escalation tests |
| `tests/agents/escalation/approval-queue.test.ts` | ~200 | Approval queue tests |
| `tests/agents/notification/notification.test.ts` | ~200 | Notification tests |
| `tests/e2e/budget-escalation.test.ts` | ~300 | E2E tests |
| **Documentation** | | |
| `docs/02-design/ADR-007-Autonomous-Execution-Budget.md` | ~400 | Budget model ADR |
| `docs/06-test/budget-test-scenarios.md` | ~150 | Test scenarios |
| **Total** | **~5,380** | |

---

## Modified Files (Sprint 36)

| File | Changes |
|------|---------|
| `src/sessions/checkpoint/resume-handler.ts` | Budget state restoration |
| `src/cli/index.ts` | Register approve/queue commands |
| `src/providers/base-provider.ts` | Cost reporting hook |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 36 INTEGRATION                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │Budget Tracker│──▶Checkpoint     │  │Escalation    │           │
│  │              │  │(Sprint 35)    │  │Router        │           │
│  │• Session $   │  │• sessionCost  │  │              │           │
│  │• Daily $     │  │• tokenUsage   │  │• Classify    │           │
│  │• Circuit ⚡  │  │              │  │• Route       │           │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘           │
│         │                                    │                   │
│         ▼                                    ▼                   │
│  ┌──────────────┐                    ┌──────────────┐           │
│  │Notification  │◀───────────────────│Approval Queue│           │
│  │              │                    │              │           │
│  │• Rate limit  │                    │• Persist     │           │
│  │• Batch       │                    │• Wait        │           │
│  │• Channels    │                    │• Approve     │           │
│  └──────────────┘                    └──────────────┘           │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────┐           │
│  │               CEO Experience                     │           │
│  │                                                   │           │
│  │  • Budget alerts (max 4/hour)                   │           │
│  │  • Approval queue (endiorbot queue)             │           │
│  │  • Decision routing (auto/notify/block)         │           │
│  └───────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## CEO Experience (Sprint 36)

### Touchpoint 1: Budget Warning

```bash
$ endiorbot start myproject
# ... autonomous work ...

⚠ Budget Warning: 80% of session limit reached
  Session cost: $1.60 / $2.00
  Remaining: $0.40 (estimated 15 more minutes)

Options:
  - Continue: Work will pause at $2.00 limit
  - Increase limit: endiorbot config set budget.per_session_limit 5
  - Switch to Ollama: Lower cost, continue indefinitely
```

### Touchpoint 2: Budget Limit Reached

```bash
# ... autonomous work continues ...

🛑 Budget Limit Reached: Session limit $2.00
  Session cost: $2.00
  Daily cost: $3.50 / $10.00

Checkpoint created: ckpt-20260330-143000
Session paused.

Options:
  1. Continue with approval (will use daily budget)
  2. Switch to Ollama for remaining work
  3. Stop and review work

Choose option [1-3]: 2

✓ Switching to Ollama (local model)
  Cost: Free
  Speed: Moderate
  Quality: Good for implementation tasks

Resuming work...
```

### Touchpoint 3: Approval Required

```bash
# ... autonomous work ...

🔔 Approval Required: Architecture Decision
  Decision: Refactor session module to use event sourcing
  Impact: High - affects core functionality
  Estimated effort: 8 hours
  Cost estimate: $4.50

Multi-Model Consultation Result:
  ✓ Claude: Recommended (improves reliability)
  ✓ GPT-4: Recommended (good for scaling)
  ⚠ Gemini: Concerned about migration complexity
  Consensus: 2/3 recommend, proceed with caution

Approval ID: approval-20260330-150000

Options:
  1. Approve and proceed
  2. Reject and suggest alternative
  3. Defer decision (add to queue)

Choose option [1-3]: 3

✓ Decision added to queue
  View queue: endiorbot queue
  Approve later: endiorbot approve approval-20260330-150000
```

### Touchpoint 4: Approval Queue Review

```bash
$ endiorbot queue

Pending Approvals (2):

1. approval-20260330-150000 (30 min ago)
   Type: Architecture Decision
   Description: Refactor session module to use event sourcing
   Consensus: 2/3 recommend
   Impact: High
   Cost: $4.50 (estimated)

2. approval-20260330-160000 (5 min ago)
   Type: Major Refactor
   Description: Extract checkpoint logic to separate service
   Consensus: 3/3 recommend
   Impact: Medium
   Cost: $2.00 (estimated)

Commands:
  endiorbot approve <id>         - Approve decision
  endiorbot reject <id> [reason] - Reject decision
  endiorbot queue clear          - Clear completed approvals
```

### Touchpoint 5: Notification Batching

```bash
# After 4 notifications in an hour:

🔔 Notification Batch (5 pending):
  1. Budget warning: 90% session limit (10 min ago)
  2. New file created: src/agents/new-feature.ts (8 min ago)
  3. Delete file: src/old-module.ts (requires approval) (5 min ago)
  4. Budget warning: 95% session limit (3 min ago)
  5. Test failure: 2 tests failed (1 min ago)

Rate limit: 4 notifications/hour exceeded
Next notification window: 15 minutes

View details: endiorbot notifications
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Budget tracking inaccurate** | Overspend or early pause | Cost estimator + provider cost reporting hooks |
| **Notification spam** | CEO overwhelmed | Rate limiting (4/hour), batching (5 min window) |
| **Approval queue ignored** | Deadlock, no progress | CLI notifications, email/Slack channels |
| **Escalation too aggressive** | Too many approvals needed | Decision classifier tuning, auto-approve safe ops |
| **Circuit breakers too strict** | Premature escalation | Configurable thresholds, metrics collection |

---

## Success Criteria (Sprint 36)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Budget enforcement** | 100% | E2E tests: pause at $2, pause at $10 |
| **Escalation accuracy** | >90% | Classification tests (auto/notify/block) |
| **Notification rate limit** | 4/hour max | Rate limiter tests |
| **Approval persistence** | 100% | Checkpoint/resume tests |
| **Circuit breaker triggers** | 100% | Unit tests (retry, cost, duration) |
| **Test coverage** | >80% | vitest --coverage |
| **Build status** | Pass | CI/CD |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 35 complete | PLANNED | Checkpoint system needed |
| ADR-007 approved | DRAFT → APPROVED | Day 1 task |
| Provider cost reporting | ✅ | BaseProvider has cost hooks |
| Checkpoint sessionCostSoFar | ✅ | ADR-006 includes field |

---

## Next Sprint Preview (Sprint 37)

**Sprint Goal**: Phase 3 - Self-Correction (Scoped)

**Key Deliverables**:
- Error classifier (build/lint/type vs. logic/test)
- Deterministic fixer (70-90% success rate)
- Experimental test fixer (30% success rate)
- Verifier (build + test + lint)
- 3-strike escalation

**Prerequisite**: Sprint 36 PASS (budget control validated)

---

## Approval Checklist (G-Sprint-36)

### Code Quality
- [ ] Build passes (`pnpm build`)
- [ ] All tests pass (>80 tests)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] Code coverage >80% for budget/escalation modules
- [ ] TypeScript strict mode compliant

### Features
- [ ] Budget tracker enforces limits ($2 session, $10 daily)
- [ ] Budget tracker warns at 80% threshold
- [ ] Budget tracker pauses at limit
- [ ] Escalation router classifies decisions (>90% accuracy)
- [ ] Approval queue persists across sessions
- [ ] Notification rate limited to 4/hour
- [ ] Circuit breakers trigger on breach
- [ ] CLI commands work (approve, queue)

### Testing
- [ ] 11 E2E scenarios pass
- [ ] Unit tests cover all edge cases
- [ ] Integration tests pass (budget + checkpoint)
- [ ] Manual testing: budget limit enforcement

### Documentation
- [ ] ADR-007 approved and committed
- [ ] Test scenarios documented
- [ ] CLI help text complete
- [ ] Integration diagram accurate

### Integration
- [ ] Budget tracker integrates with checkpoint
- [ ] Escalation router integrates with orchestrator
- [ ] Approval queue integrates with checkpoint
- [ ] Notification rate limiter works

---

## Approval Status

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | PENDING | |
| CTO | @cto | PENDING | |
| Reviewer | @reviewer | PENDING | |
| CEO | @CEO | PENDING | Awaiting Sprint 35 close |

---

**Last Updated**: 2026-02-22
**Sprint Owner**: @coder (AI)
**Sprint Status**: DRAFT - Pending CEO Approval
**Blocking**: Sprint 35 close + ADR-007 approval

---

*Sprint 36 Plan - Autonomy Epic Phase 2*
*EndiorBot Budget Control & Escalation*
*SDLC Framework 6.1.1*
