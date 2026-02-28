# Sprint 48 Plan

**Sprint**: 48 - Evaluator-Optimizer Loop
**Duration**: 10 Days (Feb 26 - Mar 7, 2026)
**Authority**: ADR-010 (to be created)
**Status**: 🟡 PLANNED
**Dependencies**: Sprint 45 (Brain), Sprint 47 (Chat)

---

## Executive Summary

Implement a self-improving feedback loop where EndiorBot evaluates its own outputs, scores quality, and optimizes future responses based on learned patterns.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Evaluator-Optimizer Loop                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌───────────┐    ┌────────────┐    ┌────────┐ │
│  │ Response │───▶│ Evaluator │───▶│ Score Card │───▶│ Brain  │ │
│  └──────────┘    └───────────┘    └────────────┘    │ Update │ │
│       ▲                                              └────────┘ │
│       │          ┌───────────┐    ┌────────────┐         │     │
│       └──────────│ Optimizer │◀───│ Strategies │◀────────┘     │
│                  └───────────┘    └────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Day-by-Day Plan

| Day | Task | Priority | Est. LOC | Tests |
|-----|------|----------|----------|-------|
| **1** | ADR-010 + Types + Interfaces | P0 | ~400 | 15 |
| **2** | Evaluator Core (quality scoring) | P0 | ~450 | 35 |
| **3** | Score Card (multi-dimension) | P0 | ~350 | 25 |
| **4** | Optimizer Core (strategy selection) | P0 | ~400 | 30 |
| **5** | Optimization Strategies | P0 | ~500 | 40 |
| **6** | Brain Integration (feedback storage) | P0 | ~350 | 25 |
| **7** | Loop Orchestrator | P0 | ~400 | 30 |
| **8** | Gateway Methods | P1 | ~300 | 20 |
| **9** | CLI Commands + Integration | P1 | ~350 | 25 |
| **10** | G-Sprint-48 Gate | P0 | - | - |
| **Total** | | | **~3,500** | **~245** |

---

## Day 1: ADR-010 + Types

### Deliverables
- `docs/02-design/01-ADRs/ADR-010-Evaluator-Optimizer.md`
- `src/evaluator/types.ts`

### Key Types

```typescript
interface EvaluationResult {
  responseId: string;
  scores: ScoreCard;
  suggestions: OptimizationSuggestion[];
  evaluatedAt: string;
}

interface ScoreCard {
  overall: number;           // 0-100
  dimensions: {
    correctness: number;     // Did it solve the problem?
    efficiency: number;      // Token/cost efficiency
    clarity: number;         // Response clarity
    safety: number;          // Security compliance
    ceoAlignment: number;    // CEO preference match
  };
  confidence: number;        // Evaluation confidence
}

interface OptimizationStrategy {
  name: string;
  trigger: ScoreThreshold;
  action: OptimizationAction;
  priority: number;
}

interface OptimizationSuggestion {
  type: 'retry' | 'escalate' | 'simplify' | 'enhance';
  reason: string;
  confidence: number;
  estimatedImprovement: number;
}
```

---

## Day 2: Evaluator Core

### File
`src/evaluator/evaluator.ts` (~450 LOC)

### Features
- Self-evaluation using reflection prompts
- Multi-model consensus evaluation (optional)
- Metric extraction from responses
- CEO preference alignment check

### API

```typescript
class Evaluator {
  constructor(config: EvaluatorConfig);

  // Core evaluation
  evaluate(response: AgentResponse): Promise<EvaluationResult>;
  evaluateWithConsensus(response: AgentResponse, models: string[]): Promise<EvaluationResult>;

  // Comparison
  compareResponses(a: AgentResponse, b: AgentResponse): Promise<ComparisonResult>;

  // Configuration
  setWeights(weights: DimensionWeights): void;
  getWeights(): DimensionWeights;
}
```

### Evaluation Prompt Template

```
You are evaluating an AI assistant's response.

Task: {task}
Response: {response}
Context: {context}

Score the response on these dimensions (0-100):
1. Correctness: Does it solve the problem correctly?
2. Efficiency: Is it concise and cost-effective?
3. Clarity: Is it well-structured and easy to understand?
4. Safety: Does it follow security best practices?
5. CEO Alignment: Does it match the user's preferences?

Provide scores and brief justifications.
```

---

## Day 3: Score Card

### File
`src/evaluator/score-card.ts` (~350 LOC)

### Dimensions

| Dimension | Weight | Source |
|-----------|--------|--------|
| Correctness | 30% | Test pass rate, error count |
| Efficiency | 20% | Tokens used, latency |
| Clarity | 15% | Structure, formatting |
| Safety | 20% | Security scan results |
| CEO Alignment | 15% | CEO Profile match |

### API

```typescript
class ScoreCardCalculator {
  constructor(weights?: DimensionWeights);

  // Calculation
  calculate(metrics: ResponseMetrics): ScoreCard;
  getWeightedScore(card: ScoreCard): number;

  // Comparison
  compareCards(a: ScoreCard, b: ScoreCard): ScoreComparison;

  // Thresholds
  meetsThreshold(card: ScoreCard, threshold: ScoreThreshold): boolean;
  getDeficientDimensions(card: ScoreCard, threshold: number): string[];
}
```

### Score Thresholds

| Level | Overall | Action |
|-------|---------|--------|
| Excellent | 90+ | No action |
| Good | 70-89 | Log, continue |
| Needs Improvement | 50-69 | Suggest optimization |
| Poor | <50 | Trigger optimization |

---

## Day 4: Optimizer Core

### File
`src/evaluator/optimizer.ts` (~400 LOC)

### Features
- Strategy selection based on score card
- Retry with different parameters
- Model escalation (free → paid)
- Prompt refinement suggestions

### API

```typescript
class Optimizer {
  constructor(strategies: OptimizationStrategy[]);

  // Strategy selection
  selectStrategy(scoreCard: ScoreCard): OptimizationStrategy | null;
  selectStrategies(scoreCard: ScoreCard, max: number): OptimizationStrategy[];

  // Optimization
  optimize(response: AgentResponse, strategy: OptimizationStrategy): Promise<OptimizedResponse>;

  // Suggestions
  suggestImprovements(scoreCard: ScoreCard): Suggestion[];

  // Configuration
  registerStrategy(strategy: OptimizationStrategy): void;
  removeStrategy(name: string): void;
}
```

---

## Day 5: Optimization Strategies

### Directory
`src/evaluator/strategies/` (~500 LOC)

### Built-in Strategies

| Strategy | Trigger | Action |
|----------|---------|--------|
| `retry-with-context` | correctness < 60 | Add more context, retry |
| `escalate-model` | overall < 50 | Use higher-tier model |
| `simplify-prompt` | efficiency < 40 | Reduce prompt complexity |
| `add-examples` | clarity < 50 | Include examples in prompt |
| `security-review` | safety < 70 | Run security scan, fix |

### Strategy Interface

```typescript
interface OptimizationStrategy {
  name: string;
  description: string;

  // Trigger conditions
  trigger: {
    dimension: keyof ScoreCard['dimensions'] | 'overall';
    operator: '<' | '<=' | '>' | '>=';
    value: number;
  };

  // Action to take
  action: {
    type: 'retry' | 'escalate' | 'modify' | 'enhance';
    params: Record<string, unknown>;
  };

  // Metadata
  priority: number;
  maxAttempts: number;
  cooldownMs: number;
}
```

### Strategy Files

```
src/evaluator/strategies/
├── index.ts
├── retry-with-context.ts
├── escalate-model.ts
├── simplify-prompt.ts
├── add-examples.ts
└── security-review.ts
```

---

## Day 6: Brain Integration

### File
`src/evaluator/brain-feedback.ts` (~350 LOC)

### Integration Points

| Brain Layer | Feedback Type |
|-------------|---------------|
| Events | Evaluation events, optimization attempts |
| Patterns | Low-score patterns, successful fixes |
| Structures | Response quality per project/file |
| Mental Models | Derived optimization rules |

### API

```typescript
class BrainFeedback {
  constructor(brainStorage: BrainStorage);

  // Recording
  recordEvaluation(result: EvaluationResult): Promise<void>;
  recordOptimization(before: ScoreCard, after: ScoreCard, strategy: string): Promise<void>;

  // Querying
  getHistoricalScores(context: EvaluationContext): Promise<ScoreHistory>;
  getOptimizationSuccessRate(strategy: string): Promise<number>;

  // Learning
  deriveOptimizationRule(pattern: OptimizationPattern): Promise<MentalModel>;
  suggestStrategyFromHistory(scoreCard: ScoreCard): Promise<string | null>;
}
```

### Event Types

```typescript
// Layer 1: Events
interface EvaluationEvent {
  type: 'evaluation';
  responseId: string;
  overall: number;
  dimensions: ScoreCard['dimensions'];
  timestamp: string;
}

interface OptimizationEvent {
  type: 'optimization';
  responseId: string;
  strategy: string;
  beforeScore: number;
  afterScore: number;
  success: boolean;
  timestamp: string;
}
```

---

## Day 7: Loop Orchestrator

### File
`src/evaluator/loop.ts` (~400 LOC)

### Features
- Automatic evaluation after each response
- Configurable optimization thresholds
- Max retry limits
- Async background evaluation
- CEO notification on low scores

### API

```typescript
class EvaluatorLoop {
  constructor(config: LoopConfig);

  // Main loop
  processResponse(response: AgentResponse): Promise<ProcessedResponse>;

  // Control
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;

  // Configuration
  setThresholds(thresholds: ScoreThresholds): void;
  setMaxRetries(max: number): void;

  // Events
  on(event: 'evaluated' | 'optimized' | 'failed' | 'skipped', handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;

  // Status
  getStatus(): LoopStatus;
  getMetrics(): LoopMetrics;
}
```

### Loop Configuration

```typescript
interface LoopConfig {
  enabled: boolean;
  autoOptimize: boolean;

  thresholds: {
    minOverall: number;          // Default: 50
    minPerDimension: number;     // Default: 40
  };

  limits: {
    maxRetries: number;          // Default: 3
    maxOptimizationTime: number; // Default: 30000ms
  };

  notifications: {
    notifyOnLowScore: boolean;
    lowScoreThreshold: number;   // Default: 40
    channel: 'telegram' | 'desktop' | 'both';
  };
}
```

---

## Day 8: Gateway Methods

### File
`src/gateway/methods/evaluator.ts` (~300 LOC)

### Methods

| Method | Description |
|--------|-------------|
| `evaluator.evaluate` | Evaluate a response |
| `evaluator.getScoreCard` | Get score card for response |
| `evaluator.optimize` | Trigger optimization |
| `evaluator.getHistory` | Get evaluation history |
| `evaluator.setThresholds` | Update thresholds |

### Method Signatures

```typescript
// evaluator.evaluate
{
  method: 'evaluator.evaluate',
  params: {
    responseId: string;
    response: string;
    context?: EvaluationContext;
  }
}
// Returns: EvaluationResult

// evaluator.getScoreCard
{
  method: 'evaluator.getScoreCard',
  params: {
    responseId: string;
  }
}
// Returns: ScoreCard | null

// evaluator.optimize
{
  method: 'evaluator.optimize',
  params: {
    responseId: string;
    strategy?: string;
  }
}
// Returns: OptimizedResponse

// evaluator.getHistory
{
  method: 'evaluator.getHistory',
  params: {
    limit?: number;
    since?: string;
  }
}
// Returns: EvaluationResult[]

// evaluator.setThresholds
{
  method: 'evaluator.setThresholds',
  params: {
    thresholds: ScoreThresholds;
  }
}
// Returns: { success: boolean }
```

---

## Day 9: CLI Commands

### File
`src/cli/commands/evaluator.ts` (~350 LOC)

### Commands

```bash
# Status
endiorbot eval status
# Output: Evaluator status, loop state, recent metrics

# History
endiorbot eval history [--limit=10] [--since=1h]
# Output: Recent evaluations with scores

# Thresholds
endiorbot eval thresholds
endiorbot eval thresholds --set overall=60
# Output: Current/updated thresholds

# Analyze
endiorbot eval analyze <responseId>
# Output: Deep analysis of a specific response

# Compare
endiorbot eval compare <responseIdA> <responseIdB>
# Output: Side-by-side comparison
```

### Output Format

```
$ endiorbot eval status

═══════════════════════════════════════════════════════════════
  Evaluator Status
═══════════════════════════════════════════════════════════════

  Loop:           running
  Auto-Optimize:  enabled

  Thresholds:
    Overall:      50
    Per-Dimension: 40

  Recent (24h):
    Evaluated:    47 responses
    Optimized:    12 responses
    Avg Score:    73.4

  Top Issues:
    clarity:      8 below threshold
    efficiency:   5 below threshold

═══════════════════════════════════════════════════════════════

$ endiorbot eval history --limit=5

Recent Evaluations:
─────────────────────────────────────────────────────────────
  ID          Overall   Correct   Effic   Clarity   Safety
─────────────────────────────────────────────────────────────
  resp-001    82        85        78      80        88
  resp-002    65        70        55      68        72      ← optimized
  resp-003    91        95        88      90        92
  resp-004    48        45        50      52        45      ← failed
  resp-005    76        80        72      75        78
─────────────────────────────────────────────────────────────
```

---

## Day 10: G-Sprint-48 Gate

### Gate Checklist

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | ADR-010 approved | Document exists |
| 2 | Evaluator scores responses | 5-dimension scoring works |
| 3 | Optimizer selects strategies | Threshold-based selection |
| 4 | 5 built-in strategies | All implemented and tested |
| 5 | Brain integration | Feedback stored in all 4 layers |
| 6 | Loop orchestrator | Auto-evaluation working |
| 7 | Gateway methods (5) | All methods registered |
| 8 | CLI commands (5) | All commands working |
| 9 | `pnpm build` clean | No TypeScript errors |
| 10 | `pnpm test` 3,038+ passing | +245 new tests |

---

## Expected Outcomes

| Metric | Target |
|--------|--------|
| LOC Added | ~3,500 |
| Tests Added | +245 |
| Total Tests | 3,038+ |
| New Gateway Methods | +5 (42 total) |
| New CLI Commands | +5 |

---

## File Structure

```
src/evaluator/
├── types.ts                 # Core type definitions
├── evaluator.ts             # Evaluator class
├── score-card.ts            # Score card calculator
├── optimizer.ts             # Optimizer class
├── brain-feedback.ts        # Brain integration
├── loop.ts                  # Loop orchestrator
├── index.ts                 # Module exports
└── strategies/
    ├── index.ts
    ├── retry-with-context.ts
    ├── escalate-model.ts
    ├── simplify-prompt.ts
    ├── add-examples.ts
    └── security-review.ts

src/gateway/methods/evaluator.ts
src/cli/commands/evaluator.ts

tests/evaluator/
├── evaluator.test.ts
├── score-card.test.ts
├── optimizer.test.ts
├── brain-feedback.test.ts
├── loop.test.ts
└── strategies/
    ├── retry-with-context.test.ts
    ├── escalate-model.test.ts
    ├── simplify-prompt.test.ts
    ├── add-examples.test.ts
    └── security-review.test.ts

tests/gateway/methods/evaluator.test.ts
tests/cli/commands/evaluator.test.ts

docs/02-design/01-ADRs/ADR-010-Evaluator-Optimizer.md
```

---

## Dependencies

| Dependency | Sprint | Status |
|------------|--------|--------|
| Brain Architecture | 45 | ✅ Complete |
| Gateway Chat | 47 | ✅ Complete |
| CEO Profile | 45 | ✅ Complete |
| Multi-Model Orchestrator | 39 | ✅ Complete |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Evaluation accuracy | Multi-model consensus option |
| Infinite optimization loop | Max retry limit (3) |
| Performance overhead | Async background evaluation |
| Cost of self-evaluation | Use free models for eval |
| Bias in self-evaluation | External model cross-check |

---

## Success Criteria

1. **Automatic Evaluation**: Every response is evaluated within 5s
2. **Score Accuracy**: Scores correlate with human judgment (>80%)
3. **Optimization Effectiveness**: 60%+ of optimizations improve score
4. **Brain Learning**: Patterns emerge after 100+ evaluations
5. **Zero Overhead**: <5% latency impact on main loop

---

*Sprint 48 Plan*
*Evaluator-Optimizer Loop*
*2026-02-25*
