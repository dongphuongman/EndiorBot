# ADR-010: Evaluator-Optimizer Loop

| Metadata | Value |
|----------|-------|
| **Status** | Approved |
| **Date** | 2026-02-25 |
| **Authors** | PM, Architect |
| **Reviewers** | CTO, CPO |
| **Sprint** | 48 |
| **Related ADRs** | ADR-009 (Brain Architecture), ADR-001 (Multi-Model Orchestrator) |

## Context

### Problem Statement

EndiorBot currently executes tasks without systematic quality feedback:

- **No Self-Evaluation**: Responses are sent without quality assessment
- **No Optimization Loop**: Poor responses are not automatically improved
- **No Quality Metrics**: No structured scoring of response quality
- **No Learning Feedback**: Brain receives no quality signals for pattern learning

Current state:
- Response generated → sent immediately
- Quality issues discovered by CEO manually
- No automatic retry or improvement
- Brain learns from events but not quality outcomes

Goal: Implement a self-improving feedback loop where EndiorBot evaluates its own outputs, scores quality across multiple dimensions, and optimizes future responses based on learned patterns.

### Requirements

**Architecture Alignment Score**: Target 95%

**Key Capabilities**:
1. Multi-dimensional quality scoring (correctness, efficiency, clarity, safety, CEO alignment)
2. Automatic optimization strategies based on score thresholds
3. Brain integration for learning from evaluation outcomes
4. Configurable thresholds and weights
5. Minimal latency impact on main response loop

**Constraints**:
- Self-evaluation must not block response delivery (async option)
- Use free models for evaluation when possible (cost control)
- Max 3 retry attempts to prevent infinite loops
- Must integrate with existing Brain architecture

## Decision

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Evaluator-Optimizer Loop                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌───────────────┐     ┌────────────────┐  │
│  │   Response   │────▶│   Evaluator   │────▶│   Score Card   │  │
│  │  (from Agent)│     │  (quality AI) │     │ (5 dimensions) │  │
│  └──────────────┘     └───────────────┘     └────────────────┘  │
│         ▲                                           │           │
│         │                                           ▼           │
│         │             ┌───────────────┐     ┌────────────────┐  │
│         │             │   Optimizer   │◀────│   Strategies   │  │
│         │             │ (improvement) │     │  (5 built-in)  │  │
│         │             └───────────────┘     └────────────────┘  │
│         │                    │                      │           │
│         │                    ▼                      │           │
│         │             ┌───────────────┐             │           │
│         └─────────────│    Retry?     │─────────────┘           │
│                       └───────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                       ┌───────────────┐                         │
│                       │     Brain     │                         │
│                       │  (feedback)   │                         │
│                       └───────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Evaluator

Responsible for scoring responses across 5 quality dimensions.

```typescript
interface EvaluationResult {
  responseId: string;
  scores: ScoreCard;
  suggestions: OptimizationSuggestion[];
  evaluatedAt: string;
  evaluationModel: string;
  confidence: number;
}

interface Evaluator {
  evaluate(response: AgentResponse): Promise<EvaluationResult>;
  evaluateWithConsensus(response: AgentResponse, models: string[]): Promise<EvaluationResult>;
  compareResponses(a: AgentResponse, b: AgentResponse): Promise<ComparisonResult>;
}
```

**Evaluation Methods**:
- **Self-Evaluation**: Use the same model with a reflection prompt
- **Cross-Model Consensus**: Use multiple models and aggregate scores
- **Rule-Based**: Apply deterministic rules (token count, structure checks)

#### 2. Score Card

Multi-dimensional quality scoring with configurable weights.

```typescript
interface ScoreCard {
  overall: number;           // 0-100 weighted average
  dimensions: {
    correctness: number;     // Did it solve the problem? (30%)
    efficiency: number;      // Token/cost efficiency (20%)
    clarity: number;         // Response clarity (15%)
    safety: number;          // Security compliance (20%)
    ceoAlignment: number;    // CEO preference match (15%)
  };
  confidence: number;        // Evaluation confidence 0-1
}

interface DimensionWeights {
  correctness: number;       // Default: 0.30
  efficiency: number;        // Default: 0.20
  clarity: number;           // Default: 0.15
  safety: number;            // Default: 0.20
  ceoAlignment: number;      // Default: 0.15
}
```

**Score Thresholds**:

| Level | Overall Score | Action |
|-------|---------------|--------|
| Excellent | 90-100 | No action, log success |
| Good | 70-89 | Log, continue |
| Needs Improvement | 50-69 | Suggest optimization |
| Poor | 0-49 | Trigger automatic optimization |

#### 3. Optimizer

Selects and applies optimization strategies based on score card analysis.

```typescript
interface Optimizer {
  selectStrategy(scoreCard: ScoreCard): OptimizationStrategy | null;
  optimize(response: AgentResponse, strategy: OptimizationStrategy): Promise<OptimizedResponse>;
  suggestImprovements(scoreCard: ScoreCard): OptimizationSuggestion[];
}

interface OptimizationStrategy {
  name: string;
  trigger: {
    dimension: keyof ScoreCard['dimensions'] | 'overall';
    operator: '<' | '<=' | '>' | '>=';
    value: number;
  };
  action: {
    type: 'retry' | 'escalate' | 'modify' | 'enhance';
    params: Record<string, unknown>;
  };
  priority: number;
  maxAttempts: number;
  cooldownMs: number;
}
```

**Built-in Strategies**:

| Strategy | Trigger | Action |
|----------|---------|--------|
| `retry-with-context` | correctness < 60 | Add more context, retry |
| `escalate-model` | overall < 50 | Use higher-tier model |
| `simplify-prompt` | efficiency < 40 | Reduce prompt complexity |
| `add-examples` | clarity < 50 | Include examples in prompt |
| `security-review` | safety < 70 | Run security scan, fix |

#### 4. Brain Feedback

Integration with Brain architecture for learning from evaluations.

```typescript
interface BrainFeedback {
  recordEvaluation(result: EvaluationResult): Promise<void>;
  recordOptimization(before: ScoreCard, after: ScoreCard, strategy: string): Promise<void>;
  getHistoricalScores(context: EvaluationContext): Promise<ScoreHistory>;
  suggestStrategyFromHistory(scoreCard: ScoreCard): Promise<string | null>;
}
```

**Brain Layer Mappings**:

| Brain Layer | Feedback Type |
|-------------|---------------|
| Events | Evaluation events, optimization attempts |
| Patterns | Low-score patterns, successful fixes |
| Structures | Response quality per project/file |
| Mental Models | Derived optimization rules |

#### 5. Loop Orchestrator

Coordinates the evaluation-optimization cycle.

```typescript
interface EvaluatorLoop {
  processResponse(response: AgentResponse): Promise<ProcessedResponse>;
  start(): void;
  stop(): void;
  setThresholds(thresholds: ScoreThresholds): void;
  on(event: 'evaluated' | 'optimized' | 'failed', handler: EventHandler): void;
}

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

### Data Flow

```
1. Agent generates response
   ↓
2. Evaluator scores response (async or sync)
   ↓
3. Score Card computed
   ├── Score >= threshold → Response delivered, feedback to Brain
   └── Score < threshold → Optimizer selects strategy
                          ↓
4. Optimization applied
   ├── Retry count < max → Go to step 1 with modified request
   └── Retry count >= max → Deliver best response, notify CEO
```

### API Surface

**Gateway Methods**:
- `evaluator.evaluate` - Evaluate a response
- `evaluator.getScoreCard` - Get score card for response
- `evaluator.optimize` - Trigger optimization
- `evaluator.getHistory` - Get evaluation history
- `evaluator.setThresholds` - Update thresholds

**CLI Commands**:
- `endiorbot eval status` - Show evaluator status
- `endiorbot eval history` - Show recent evaluations
- `endiorbot eval thresholds` - View/update thresholds
- `endiorbot eval analyze <id>` - Deep analyze response
- `endiorbot eval compare <id1> <id2>` - Compare responses

### File Structure

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
```

## Consequences

### Positive

1. **Self-Improvement**: Automatic quality improvement without CEO intervention
2. **Quality Visibility**: Clear metrics for response quality
3. **Learning Loop**: Brain learns from quality outcomes
4. **Cost Optimization**: Can route to cheaper models for high-quality responses
5. **CEO Time Savings**: Fewer manual reviews needed

### Negative

1. **Evaluation Cost**: Additional API calls for evaluation
2. **Latency**: Potential delay if optimization required (mitigated by async)
3. **Complexity**: More moving parts in response pipeline
4. **False Positives**: Optimizer might "fix" good responses

### Mitigation

- **Cost**: Use free/cheap models for evaluation
- **Latency**: Async evaluation with immediate delivery option
- **Complexity**: Comprehensive testing (245+ tests planned)
- **False Positives**: Confidence thresholds, CEO override

## Alternatives Considered

### 1. Human-Only Evaluation

**Rejected**: Does not scale, CEO time is limited

### 2. Rule-Based Only

**Rejected**: Cannot capture nuanced quality (correctness, clarity)

### 3. External Evaluation Service

**Rejected**: Adds dependency, data privacy concerns

### 4. Post-Hoc Evaluation Only

**Rejected**: Misses optimization opportunity

## Success Criteria

1. **Automatic Evaluation**: Every response evaluated within 5s
2. **Score Accuracy**: Scores correlate with human judgment (>80%)
3. **Optimization Effectiveness**: 60%+ of optimizations improve score
4. **Brain Learning**: Patterns emerge after 100+ evaluations
5. **Zero Overhead**: <5% latency impact on main loop (async mode)

## References

- [ADR-009: Brain Architecture](ADR-009-Brain-Architecture.md)
- [ADR-001: Multi-Model Orchestrator](ADR-001-Multi-Model-Orchestrator.md)
- [Sprint 48 Plan](../../04-build/SPRINT-48-PLAN.md)

---

*ADR-010: Evaluator-Optimizer Loop*
*Sprint 48*
*2026-02-25*
