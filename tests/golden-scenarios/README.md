# Golden Scenarios

End-to-end testing framework for autonomous session gates.

## Overview

Golden scenarios validate that EndiorBot's autonomous agents behave correctly at each autonomy level (Gate A, B, C). Each scenario defines:

- **Setup**: Initial project state and configuration
- **Tasks**: Work items to execute
- **Expectations**: What should happen
- **Validations**: How to verify results

## Gate Levels

| Gate | Mode | Allowed Operations | Budget |
|------|------|-------------------|--------|
| **A** | Design Only | Read, analyze, plan | $0.50 |
| **B** | Limited Writes | Single file edits, tests | $2.00 |
| **C** | Full Autonomy | Multi-file, git commits | $10.00 |

## Scenario Files

```
tests/golden-scenarios/
├── gate-a.yml       # Design-only validation
├── gate-b.yml       # Limited writes validation
├── gate-c.yml       # Full autonomy validation
├── types.ts         # TypeScript type definitions
├── runner.ts        # Scenario execution engine
├── validator.ts     # Result validation
├── index.ts         # Barrel export
└── README.md        # This file
```

## Running Scenarios

### Run All Scenarios

```typescript
import { createScenarioRunner } from "./runner.js";

const runner = createScenarioRunner();
const results = await runner.runAllScenarios();
```

### Run Single Scenario

```typescript
const result = await runner.runScenario("tests/golden-scenarios/gate-a.yml");
```

### Run by Gate Level

```typescript
const results = await runner.runByGate("B"); // Run all Gate B scenarios
```

### Dry Run Mode

```typescript
const runner = createScenarioRunner({ dryRun: true });
const results = await runner.runAllScenarios(); // Validates without executing
```

## Scenario Schema

### Metadata

```yaml
metadata:
  name: gate-a-design-only
  description: Validate design-only mode
  version: "1.0.0"
  author: EndiorBot Sprint 72
  tags: [gate-a, design-only]
  expectedDurationMin: 30
  priority: 1
```

### Gate Configuration

```yaml
gate:
  level: A
  autonomyLevel: SUPERVISED
  maxDurationMin: 30
  maxCostUsd: 0.50
  allowedOperations:
    - read_file
    - search_code
    - analyze_code
  forbiddenOperations:
    - write_file
    - edit_file
    - git_commit
```

### Task Definition

```yaml
tasks:
  - id: analyze-codebase
    type: architecture
    description: Analyze existing codebase
    stage: PLANNING
    priority: 1
    estimatedCost: 0.10
    dependencies: []
    expectedTier: STANDARD
    expectedOutcome: success
    timeoutSec: 60
    input:
      scope: "full"
    expectedArtifacts: []
```

### Expectations

```yaml
expectations:
  taskCompletion:
    minCompleted: 4
    maxFailed: 0
    minCompletionRate: 1.0

  budget:
    maxSpentUsd: 0.50
    maxOpusSpentUsd: 0.15
    withinBudget: true

  escalations:
    maxCount: 0
    minTimeBetweenMin: 30

  recovery:
    minRecoveryRate: 1.0
    maxRetryAttempts: 0

  finalState: DESIGN
```

### Validation Rules

```yaml
validations:
  - id: no-file-writes
    name: Verify no files were modified
    type: operation_forbidden
    severity: error
    config:
      target: operations.write_file
      operator: eq
      expected: 0
    errorMessage: Gate A must not write any files
```

## Validation Types

| Type | Description |
|------|-------------|
| `task_completion` | Verify task completion metrics |
| `budget_limit` | Verify spending within limits |
| `escalation_count` | Verify escalation behavior |
| `recovery_rate` | Verify failure recovery |
| `artifact_exists` | Verify files were created |
| `artifact_content` | Verify file contents |
| `final_state` | Verify SDLC state |
| `operation_forbidden` | Verify forbidden ops not used |
| `duration_limit` | Verify time limits |
| `model_usage` | Verify correct model selection |

## Operators

| Operator | Description |
|----------|-------------|
| `eq` | Equal |
| `ne` | Not equal |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `contains` | String contains |
| `matches` | Regex matches |

## Results

```typescript
interface ScenarioResult {
  scenarioName: string;
  gate: "A" | "B" | "C";
  passed: boolean;
  durationMs: number;
  taskResults: TaskResult[];
  validationResults: ValidationResult[];
  budgetSummary: BudgetSummary;
  escalationSummary: EscalationSummary;
  artifactsCreated: string[];
  finalState: ResilienceState;
  errors: ScenarioError[];
  timestamp: string;
}
```

## AER Metrics Integration

Golden scenarios validate AER (Autonomous Execution Ratio) targets:

| Metric | Target |
|--------|--------|
| Autonomy Time | ≥30 minutes between escalations |
| Task Completion Rate | ≥70% without intervention |
| Recovery Rate | ≥80% failures self-healed |
| Tool Choice Accuracy | ≥85% correct selections |
| Cost per Task | <$1.00 per task |

## Sprint 72 Coverage

- **Week 1-2**: AER Metrics + Model Tiering (103 tests)
- **Week 3**: Autonomous Session Manager (32 tests)
- **Week 4**: Golden Scenarios (this module)

---

*Sprint 72 | v2.0 Autonomous SDLC Agent*
*EndiorBot SDLC Framework v6.1.1*
