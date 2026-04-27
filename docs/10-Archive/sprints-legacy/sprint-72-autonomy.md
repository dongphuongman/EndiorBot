# Sprint 72: v2.0 Autonomous SDLC Agent

---
**Status**: PLANNED
**Duration**: 4 weeks (40h)
**Goal**: Full 120min+ autonomous sessions with observability
**Prerequisites**: Sprint 68 (Compliance), Sprint 69-71 (Resilience)
**Version**: v2.0
**Master Plan**: v4.3

---

## Executive Summary

**Vision**: Transform EndiorBot from "Solo Developer Power Tool" to "Autonomous SDLC Agent".

```
v1.0: CEO asks → Agent answers (30s decisions)
v1.5: CEO starts → Agent plans (60min sessions)
v1.8: CEO approves → Agent builds (controlled autonomy)
v2.0: CEO delegates → Agent delivers (120min+ full SDLC loop) ← THIS SPRINT
```

**Key Features**:
1. **Enhanced AER Metrics**: TCR, RR, Tool Choice, Cost per task
2. **Model Tiering**: Dynamic model selection (Opus/Sonnet/Haiku)
3. **Autonomous Session Manager**: Full SDLC loop (01→02→03→04→05)
4. **Golden Scenarios**: Gate A/B/C validation

---

## Sprint 72 Breakdown

### Week 1: Enhanced AER Metrics (10h)

**T12.1: AER Calculator** (6h)

```typescript
// src/metrics/aer-calculator.ts

interface AERMetrics {
  // Core metrics
  autonomyTime: number;        // Time between escalations (minutes)
  taskCompletionRate: number;  // % tasks done without intervention (TCR)
  recoveryRate: number;        // % failures self-healed (RR)
  toolChoiceAccuracy: number;  // % correct tool selections
  costPerTask: number;         // Total cost / tasks completed

  // Breakdown
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  escalations: number;
  recoveries: number;
  totalCost: number;
  sessionDuration: number;      // minutes
}

export class AERCalculator {
  /**
   * Calculate AER metrics from retrieval-log.jsonl and event-log.
   */
  async calculate(sessionId: string): Promise<AERMetrics> {
    // Parse logs
    const retrievalLog = await this.parseRetrievalLog(sessionId);
    const eventLog = await this.parseEventLog(sessionId);

    // Calculate metrics
    const totalTasks = eventLog.filter(e => e.type === 'task_start').length;
    const completedTasks = eventLog.filter(
      e => e.type === 'task_complete' && !e.hadIntervention
    ).length;
    const failedTasks = eventLog.filter(e => e.type === 'task_failed').length;
    const escalations = eventLog.filter(e => e.type === 'escalation').length;

    // Recovery rate
    const failures = eventLog.filter(e => e.type === 'failure');
    const recoveries = failures.filter(f => f.recovered).length;
    const recoveryRate = failures.length > 0 ? recoveries / failures.length : 0;

    // Tool choice accuracy
    const toolUses = retrievalLog.filter(r => r.query);
    const correctChoices = toolUses.filter(t => t.wasCorrect).length;
    const toolChoiceAccuracy = toolUses.length > 0
      ? correctChoices / toolUses.length
      : 0;

    // Cost calculation
    const totalCost = this.calculateCost(eventLog);

    // Autonomy time
    const escalationEvents = eventLog.filter(e => e.type === 'escalation');
    const autonomyTime = this.calculateAutonomyTime(escalationEvents);

    return {
      autonomyTime,
      taskCompletionRate: completedTasks / totalTasks,
      recoveryRate,
      toolChoiceAccuracy,
      costPerTask: totalCost / completedTasks,
      totalTasks,
      completedTasks,
      failedTasks,
      escalations,
      recoveries,
      totalCost,
      sessionDuration: this.getSessionDuration(eventLog)
    };
  }

  /**
   * Calculate autonomy time: average time between escalations.
   */
  private calculateAutonomyTime(escalations: EventLogEntry[]): number {
    if (escalations.length <= 1) {
      // No escalations or only 1 → return session duration
      return this.getSessionDuration([]);
    }

    const intervals: number[] = [];
    for (let i = 1; i < escalations.length; i++) {
      const prev = new Date(escalations[i - 1].timestamp);
      const curr = new Date(escalations[i].timestamp);
      intervals.push((curr.getTime() - prev.getTime()) / 1000 / 60); // minutes
    }

    // Average interval
    return intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  /**
   * Calculate total cost from model usage in event log.
   */
  private calculateCost(eventLog: EventLogEntry[]): number {
    let totalCost = 0;

    for (const event of eventLog) {
      if (event.type === 'model_call') {
        const cost = this.getModelCost(
          event.model,
          event.inputTokens,
          event.outputTokens
        );
        totalCost += cost;
      }
    }

    return totalCost;
  }
}
```

**T12.2: Analytics CLI** (4h)

```bash
# Usage
endiorbot analytics aer                    # Show AER for current session
endiorbot analytics aer --session abc123   # Specific session
endiorbot analytics aer --last 10          # Last 10 sessions
endiorbot analytics aer --export report.md # Export to markdown
```

```typescript
// src/cli/commands/analytics.ts

export async function analyticsAER(options: AnalyticsOptions) {
  const calculator = new AERCalculator();

  // Get sessions
  const sessions = await this.getSessions(options);

  // Calculate metrics for each
  const results: AERMetrics[] = [];
  for (const sessionId of sessions) {
    const metrics = await calculator.calculate(sessionId);
    results.push(metrics);
  }

  // Display
  if (options.export) {
    await this.exportMarkdown(results, options.export);
  } else {
    this.displayTable(results);
  }
}

function displayTable(results: AERMetrics[]): void {
  console.log('\n📊 AER Metrics\n');

  const table = new Table({
    head: ['Metric', 'Value', 'Target', 'Status'],
    colWidths: [30, 15, 15, 10]
  });

  for (const metrics of results) {
    table.push(
      ['Autonomy Time', `${metrics.autonomyTime.toFixed(1)}min`, '≥30min',
       metrics.autonomyTime >= 30 ? '✅' : '❌'],
      ['Task Completion Rate', `${(metrics.taskCompletionRate * 100).toFixed(1)}%`, '≥70%',
       metrics.taskCompletionRate >= 0.7 ? '✅' : '❌'],
      ['Recovery Rate', `${(metrics.recoveryRate * 100).toFixed(1)}%`, '≥80%',
       metrics.recoveryRate >= 0.8 ? '✅' : '❌'],
      ['Tool Choice Accuracy', `${(metrics.toolChoiceAccuracy * 100).toFixed(1)}%`, '≥85%',
       metrics.toolChoiceAccuracy >= 0.85 ? '✅' : '❌'],
      ['Cost per Task', `$${metrics.costPerTask.toFixed(2)}`, '<$1',
       metrics.costPerTask < 1.0 ? '✅' : '❌']
    );
  }

  console.log(table.toString());
}
```

**Deliverables**:
- ✅ AER Calculator with 5 metrics
- ✅ Parse retrieval-log.jsonl and event-log
- ✅ CLI: `endiorbot analytics aer`
- ✅ Markdown export for reports

---

### Week 2: Model Tiering & Opus Cap (10h)

**T12.3: Model Tiering Strategy** (6h)

```typescript
// src/models/tiering.ts

enum ModelTier {
  ELITE = 'ELITE',         // Opus - Architecture decisions only
  STANDARD = 'STANDARD',   // Sonnet - Code, refactor, design
  EFFICIENCY = 'EFFICIENCY' // Haiku - Lint, format, simple edits
}

interface ModelConfig {
  tier: ModelTier;
  model: string;
  maxCostPerCall: number;
  maxTimePerCall: number;   // seconds
  taskTypes: string[];
}

const MODEL_CONFIGS: ModelConfig[] = [
  {
    tier: ModelTier.ELITE,
    model: 'claude-opus-4',
    maxCostPerCall: 1.0,
    maxTimePerCall: 300,  // 5min
    taskTypes: ['architecture', 'design_decision', 'adr_draft']
  },
  {
    tier: ModelTier.STANDARD,
    model: 'claude-sonnet-4',
    maxCostPerCall: 0.10,
    maxTimePerCall: 60,
    taskTypes: ['code_generation', 'refactor', 'bug_fix', 'test_write']
  },
  {
    tier: ModelTier.EFFICIENCY,
    model: 'claude-haiku-4',
    maxCostPerCall: 0.01,
    maxTimePerCall: 10,
    taskTypes: ['lint', 'format', 'simple_edit', 'verify']
  }
];

export class ModelSelector {
  private sessionBudget: SessionBudget;

  constructor(budgetConfig: BudgetConfig) {
    this.sessionBudget = new SessionBudget(budgetConfig);
  }

  /**
   * Select appropriate model for task.
   */
  selectModel(taskType: string, complexity?: number): ModelConfig {
    // Default: find by task type
    let config = MODEL_CONFIGS.find(c =>
      c.taskTypes.includes(taskType)
    );

    if (!config) {
      // Fallback to STANDARD
      config = MODEL_CONFIGS.find(c => c.tier === ModelTier.STANDARD)!;
    }

    // Escalate tier if task failed multiple times
    if (complexity && complexity > 2) {
      config = this.escalateTier(config);
    }

    // Check budget constraints
    if (!this.sessionBudget.canAfford(config.tier, config.maxCostPerCall)) {
      // Downgrade to cheaper model
      config = this.downgradeTier(config);
    }

    return config;
  }

  private escalateTier(current: ModelConfig): ModelConfig {
    if (current.tier === ModelTier.EFFICIENCY) {
      return MODEL_CONFIGS.find(c => c.tier === ModelTier.STANDARD)!;
    }
    if (current.tier === ModelTier.STANDARD) {
      return MODEL_CONFIGS.find(c => c.tier === ModelTier.ELITE)!;
    }
    return current; // Already at top tier
  }
}
```

**T12.4: Opus Cap Enforcement** (4h)

```typescript
// src/models/budget.ts

interface BudgetConfig {
  totalUsd: number;          // $10 per session
  opusCapMin: number;        // 20 minutes max
  opusCapUsd: number;        // $3 max
  perStage: {
    planning: number;        // 15%
    design: number;          // 25%
    build: number;           // 40%
    test: number;            // 20%
  };
}

export class SessionBudget {
  private spent: Record<ModelTier, { usd: number; seconds: number }> = {
    ELITE: { usd: 0, seconds: 0 },
    STANDARD: { usd: 0, seconds: 0 },
    EFFICIENCY: { usd: 0, seconds: 0 }
  };

  constructor(private config: BudgetConfig) {}

  /**
   * Check if we can afford a model call.
   */
  canAfford(tier: ModelTier, estimatedCost: number): boolean {
    const totalSpent = this.getTotalSpent();

    // Check total budget
    if (totalSpent + estimatedCost > this.config.totalUsd) {
      return false;
    }

    // Check Opus cap
    if (tier === ModelTier.ELITE) {
      const opusSpent = this.spent.ELITE.usd;
      const opusTime = this.spent.ELITE.seconds / 60; // minutes

      if (opusSpent >= this.config.opusCapUsd) {
        return false;
      }

      if (opusTime >= this.config.opusCapMin) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record a model call.
   */
  recordCall(tier: ModelTier, cost: number, durationSec: number): void {
    this.spent[tier].usd += cost;
    this.spent[tier].seconds += durationSec;
  }

  /**
   * Get remaining budget.
   */
  getRemaining(): { total: number; opus: number } {
    return {
      total: this.config.totalUsd - this.getTotalSpent(),
      opus: this.config.opusCapUsd - this.spent.ELITE.usd
    };
  }

  private getTotalSpent(): number {
    return Object.values(this.spent).reduce((sum, s) => sum + s.usd, 0);
  }
}
```

**Deliverables**:
- ✅ ModelSelector with 3 tiers
- ✅ Task type → model mapping
- ✅ Auto-escalate after 3 failures
- ✅ SessionBudget with Opus cap ($3 / 20min)
- ✅ Budget enforcement

---

### Week 3: Autonomous Session Manager (12h)

**T12.5: AutonomousSessionManager** (12h)

```typescript
// src/sessions/autonomous-manager.ts

export class AutonomousSessionManager extends SessionManager {
  private modelSelector: ModelSelector;
  private recoveryEngine: RecoveryEngine;
  private contractEngine: StageContractEngine;

  constructor(sessionId: string, config: AutonomousConfig) {
    super(sessionId, config);
    this.modelSelector = new ModelSelector(config.budget);
    this.recoveryEngine = new RecoveryEngine(/* ... */);
    this.contractEngine = new StageContractEngine(/* ... */);
  }

  /**
   * Execute full SDLC loop: 01→02→03→04→05.
   */
  async executeFullSDLC(task: string): Promise<SDLCResult> {
    const stages = ['01-PLANNING', '02-DESIGN', '03-INTEGRATE', '04-BUILD', '05-TEST'];

    for (const stageId of stages) {
      // Validate contract before entry
      const entryValid = await this.contractEngine.validateEntry(stageId);
      if (!entryValid.valid) {
        return this.handleContractFailure(stageId, entryValid);
      }

      // Execute stage
      try {
        const result = await this.executeStageAutonomous(stageId, task);

        // Validate contract before exit
        const exitValid = await this.contractEngine.validateExit(stageId);
        if (!exitValid.valid) {
          return this.handleContractFailure(stageId, exitValid);
        }
      } catch (error) {
        // Attempt recovery
        const recovered = await this.recoveryEngine.handleFailure(
          error,
          { stageId, task }
        );

        if (!recovered.recovered) {
          return {
            success: false,
            stage: stageId,
            error,
            recovery: recovered
          };
        }
      }
    }

    return {
      success: true,
      completedStages: stages
    };
  }

  /**
   * Execute a single stage autonomously with model tiering.
   */
  private async executeStageAutonomous(
    stageId: string,
    task: string
  ): Promise<StageResult> {
    // Break down stage into subtasks
    const subtasks = await this.decomposeStage(stageId, task);

    for (const subtask of subtasks) {
      // Select appropriate model
      const model = this.modelSelector.selectModel(
        subtask.type,
        subtask.complexity
      );

      // Execute with selected model
      const result = await this.executeSubtask(subtask, model);

      // Track cost
      this.sessionBudget.recordCall(
        model.tier,
        result.cost,
        result.duration
      );
    }

    return { success: true };
  }

  /**
   * Non-blocking escalation: make conservative choice and continue.
   */
  private async handleEscalation(
    decision: string,
    options: string[]
  ): Promise<string> {
    // Create escalation but don't block
    await this.createNonBlockingEscalation({
      decision,
      options,
      chosen: 'conservative'
    });

    // Make conservative choice
    return this.chooseConservative(options);
  }

  /**
   * Choose conservative option when uncertain.
   */
  private chooseConservative(options: string[]): string {
    // Heuristics for conservative choice:
    // - Prefer existing over new
    // - Prefer simple over complex
    // - Prefer safe over risky
    return options[0]; // Simplest: first option
  }
}
```

**Deliverables**:
- ✅ AutonomousSessionManager
- ✅ Full SDLC loop (01→02→03→04→05)
- ✅ Model tiering integration
- ✅ Non-blocking escalation
- ✅ Conservative choice fallback

---

### Week 4: Golden Scenarios Validation (8h)

**T12.6: Golden Scenario Tests** (8h)

```yaml
# tests/golden-scenarios/gate-a.yml
name: "Gate A - Design Only"
duration: 30min
budget: $2
goal: "Create API design for user auth"

expected:
  writes:
    allowed: ["docs/**"]
    forbidden: ["src/**", "tests/**"]
  artifacts:
    - "docs/02-design/api-spec.yaml"
    - "ADR-*.md"
  gates: ["G2"]
  escalations: "≤1"

validation:
  - file_count: { pattern: "src/**/*.ts", expected: 0 }
  - file_count: { pattern: "docs/02-design/**", min: 3 }
  - budget_spent: { max: 2.0 }
  - duration: { max: 30min }
```

```yaml
# tests/golden-scenarios/gate-b.yml
name: "Gate B - Limited Writes"
duration: 30min
budget: $3
goal: "Implement user model with tests"

expected:
  max_files: 10
  artifacts:
    - "src/models/user.ts"
    - "tests/models/user.test.ts"
  gates: ["G3"]
  decision_packets: "≥1"
  escalations: "≤2"

validation:
  - file_count: { pattern: "src/**/*.ts", max: 10 }
  - test_coverage: { min: 80 }
  - budget_spent: { max: 3.0 }
```

```yaml
# tests/golden-scenarios/gate-c.yml
name: "Gate C - Full Autonomy"
duration: 2h
budget: $10
goal: "Build complete auth system (plan→design→build→test)"

expected:
  stages: ["01-PLANNING", "02-DESIGN", "03-INTEGRATE", "04-BUILD", "05-TEST"]
  escalations: "<3"
  aer: "≥30min"
  opus_usage: { time: "≤20min", cost: "≤$3" }

validation:
  - all_stages_complete: true
  - test_coverage: { min: 80 }
  - budget_spent: { max: 10.0 }
  - opus_time: { max: 20min }
  - escalation_count: { max: 3 }
  - aer: { min: 30 }
```

**Test runner**:
```typescript
// tests/golden-scenarios/runner.ts

export async function runGoldenScenario(
  scenario: string
): Promise<ScenarioResult> {
  const config = await loadScenario(scenario);

  // Execute
  const manager = new AutonomousSessionManager(
    `scenario-${scenario}`,
    config
  );

  const result = await manager.executeFullSDLC(config.goal);

  // Validate
  const validations = await validateResult(result, config.expected);

  return {
    scenario,
    passed: validations.every(v => v.passed),
    validations,
    metrics: await calculateMetrics(result)
  };
}
```

**Deliverables**:
- ✅ Golden Scenario A (design only)
- ✅ Golden Scenario B (limited writes)
- ✅ Golden Scenario C (full autonomy)
- ✅ Test runner
- ✅ Validation suite
- ✅ Each scenario passes 3x on 3 repos

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| **AER** | ≥30min | Time between escalations |
| **TCR** | ≥70% | Task completion without intervention |
| **RR** | ≥80% | Failure recovery rate |
| **Opus cap** | ≤20min / $3 | Per session |
| **Gate C escalations** | <3 | In 2h session |
| **Context retention** | ≥95% | No re-explanations |
| **Session completion** | ≥90% | % sessions that finish without restart |

---

## Deliverables

- [x] AER Calculator with 5 metrics
- [x] Analytics CLI (`endiorbot analytics aer`)
- [x] ModelSelector with 3 tiers
- [x] SessionBudget with Opus cap
- [x] AutonomousSessionManager
- [x] Full SDLC loop (01→05)
- [x] Non-blocking escalation
- [x] Golden Scenarios (A/B/C)
- [x] Integration tests
- [x] Documentation

---

## Dependencies

**Requires**:
- Sprint 66: Retrieval Logger (for AER metrics)
- Sprint 68: Compliance (contracts, patches)
- Sprint 69-71: Resilience (recovery, checkpoints)

**Delivers**:
- **v2.0**: Autonomous SDLC Agent

---

## CTO Sign-off Checklist

Before Sprint 72 completes:
- [ ] AER metrics calculated correctly from logs
- [ ] Model tiering selects appropriate models
- [ ] Opus cap enforced (≤20min / $3)
- [ ] AutonomousSessionManager completes full SDLC
- [ ] Golden Scenario A passes 3x
- [ ] Golden Scenario B passes 3x
- [ ] Golden Scenario C passes 3x
- [ ] Context retention ≥95%
- [ ] Session completion ≥90%

---

*Sprint 72: v2.0 Autonomous SDLC Agent*
*SDLC Framework v6.1.1 compliant*
*CEO Tool - Fully Autonomous*
