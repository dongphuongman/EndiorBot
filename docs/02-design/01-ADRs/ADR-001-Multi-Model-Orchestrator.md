# ADR-001: Multi-Model Orchestrator

| Metadata | Value |
|----------|-------|
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Authors** | PM, Architect |
| **Reviewers** | CTO |
| **Sprint** | 29 |

## Context

### Problem Statement

CEO currently uses multiple AI tools (Claude Code, Cursor, ChatGPT, Gemini) to get diverse perspectives on architecture decisions. This workflow requires:

- Opening 5+ apps
- Copy/paste prompts 10+ times
- Manual consolidation of responses
- 30-60 minutes per decision

### Goal

Reduce decision time to ~5 minutes by automating multi-model consultation within EndiorBot CLI.

## Decision

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Multi-Model Orchestrator                     │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  Query Dispatcher                        │   │
│   │  • Detect task type (architecture, security, research)  │   │
│   │  • Select appropriate expert panel                       │   │
│   │  • Format queries for each provider                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐            │
│   │  Claude  │      │   GPT    │      │  Gemini  │            │
│   │ (Primary)│      │ (Expert) │      │ (Expert) │            │
│   └────┬─────┘      └────┬─────┘      └────┬─────┘            │
│        │                 │                 │                   │
│        └─────────────────┼─────────────────┘                   │
│                          ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                 Response Consolidator                    │   │
│   │  • Extract key recommendations                          │   │
│   │  • Identify consensus (>50% agreement)                  │   │
│   │  • Surface disagreements                                │   │
│   │  • Apply SDLC compliance filter                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  CEO Decision Interface                  │   │
│   │  [Approve] [Discuss] [Re-consult] [See Full Responses]  │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Core Interfaces

```typescript
interface MultiModelConfig {
  // Query Strategy
  queryMode: 'parallel' | 'sequential' | 'cascade';
  maxParallelQueries: number;  // Default: 3

  // Timeout Handling
  perModelTimeout: number;     // Default: 30000ms
  totalTimeout: number;        // Default: 60000ms

  // Fallback Strategy
  fallbackBehavior: 'use_available' | 'require_minimum' | 'fail_fast';
  minimumResponses: number;    // Default: 2

  // Response Merging
  mergingAlgorithm: 'weighted_consensus' | 'simple_majority' | 'primary_with_notes';
  primaryModelWeight: number;  // Default: 1.5
  expertModelWeight: number;   // Default: 1.0
}

interface ExpertConsultation {
  taskId: string;
  taskType: TaskType;
  query: string;
  
  models: ModelQuery[];
  responses: ModelResponse[];
  consensus: ConsensusResult;
  
  decision?: CEODecision;
  createdAt: Date;
  completedAt?: Date;
}

type TaskType = 
  | 'architecture'
  | 'security'
  | 'code_review'
  | 'research'
  | 'general';

interface ModelQuery {
  provider: 'anthropic' | 'openai' | 'google' | 'mistral';
  model: string;
  role: 'primary' | 'expert';
  prompt: string;
  status: 'pending' | 'success' | 'timeout' | 'error';
  latencyMs?: number;
}

interface ModelResponse {
  provider: string;
  content: string;
  confidence?: number;
  recommendations: string[];
  concerns: string[];
  metadata: Record<string, unknown>;
}

interface ConsensusResult {
  hasConsensus: boolean;
  consensusPoints: string[];
  disagreements: Disagreement[];
  recommendation: string;
  sdlcCompliance: SDLCComplianceResult;
}

interface Disagreement {
  topic: string;
  positions: {
    provider: string;
    position: string;
  }[];
}
```

### Model Routing by Task Type

| Task Type | Primary Model | Expert Models | Rationale |
|-----------|---------------|---------------|-----------|
| **Architecture** | Claude Opus | GPT-5, Gemini | Diverse perspectives |
| **Security** | Claude Opus | GPT-5 | Cross-validation |
| **Code Gen** | Claude Opus | - | Single model faster |
| **Bug Fix** | Claude Sonnet | GPT-5 (if stuck) | Speed priority |
| **Research** | Gemini | Claude, GPT-5 | Latest data access |
| **SDLC Gate** | Claude Opus | - | Framework knowledge |

### Merging Algorithm

1. **Collect Responses**
   - Gather responses from all models with metadata
   - Track latency and confidence scores

2. **Extract Key Recommendations**
   - Parse structured recommendations from each response
   - Identify action items and warnings

3. **Calculate Consensus**
   - Weighted voting based on model weights
   - Consensus threshold: 50% agreement
   - Flag items with significant disagreement

4. **Apply SDLC Filter**
   - Check recommendations against SDLC Framework 6.1.1
   - Add required artifacts (ADRs, diagrams) to output

5. **Generate Summary**
   - Format consolidated recommendation
   - Include evidence from each expert
   - Surface concerns and disagreements

### Fallback Scenarios

| Scenario | Response |
|----------|----------|
| Model timeout | Use available responses, note timeout |
| Model error | Retry once, then exclude from result |
| All models fail | Return primary model only with warning |
| No consensus | Present all opinions without recommendation |
| Rate limited | Queue request, notify CEO |

### CLI Interface

```bash
# Auto mode - EndiorBot decides when to consult
$ endiorbot "design payment gateway integration"
# → Detects: Architecture task
# → Auto-consults: Claude + GPT-5 + Gemini

# Explicit consultation mode
$ endiorbot consult "is Redis or PostgreSQL better for sessions?"
# → Queries all configured experts
# → Returns comparison table

# Single model mode
$ endiorbot --model opus "quick fix for this bug"
# → Uses only Claude Opus
# → Faster, no consolidation
```

### Configuration

```yaml
# ~/.endiorbot/experts.yaml
experts:
  primary:
    provider: anthropic
    model: claude-opus-4
    purpose: "Main development, SDLC compliance"
    
  panel:
    - provider: openai
      model: gpt-5.2
      purpose: "Architecture review, scaling analysis"
      when: ["architecture", "security", "scaling"]
      
    - provider: google
      model: gemini-2-pro
      purpose: "GCP integration, latest tech trends"
      when: ["architecture", "research", "gcp"]
      
    - provider: mistral
      model: mistral-large
      purpose: "Cost-effective validation"
      when: ["validation", "simple-review"]

consultation:
  auto_threshold: 0.7      # Confidence below this triggers multi-model
  max_parallel: 3          # Max experts queried at once
  timeout_ms: 30000        # Per-model timeout
  require_minimum: 2       # Minimum responses for consensus
```

## Alternatives Considered

### 1. Sequential Querying
- **Pros**: Lower API costs, simpler implementation
- **Cons**: 3x longer latency, loses parallel benefit
- **Decision**: Rejected - speed is critical for CEO workflow

### 2. Single Model Only
- **Pros**: Simplest, cheapest
- **Cons**: No diverse perspectives, misses the core value prop
- **Decision**: Rejected - multi-model is the key differentiator

### 3. External Service (e.g., OpenRouter)
- **Pros**: Managed routing, unified API
- **Cons**: Additional dependency, less control, cost
- **Decision**: Rejected - prefer direct control over routing logic

## Consequences

### Positive
- 90% reduction in architecture decision time
- Automated expert consultation
- Consistent SDLC compliance
- Evidence-based recommendations

### Negative
- Higher API costs (3-4x single model)
- More complex error handling
- Requires multiple API keys

### Risks
- **API Cost Runaway**: Mitigated by per-session rate limits
- **Response Inconsistency**: Mitigated by structured prompts
- **Latency Spikes**: Mitigated by timeouts and fallbacks

## Implementation Plan

### Phase 1: Core Infrastructure (Sprint 30)
- [ ] Define TypeScript interfaces
- [ ] Implement query dispatcher
- [ ] Add provider adapters (Claude, GPT, Gemini)
- [ ] Basic parallel execution

### Phase 2: Consolidation (Sprint 30-31)
- [ ] Response parsing and normalization
- [ ] Consensus algorithm
- [ ] SDLC compliance filter
- [ ] CLI integration

### Phase 3: Optimization (Sprint 31)
- [ ] Caching for repeated queries
- [ ] Cost tracking and alerts
- [ ] Performance tuning

## Verification

### Unit Tests
```typescript
describe('MultiModelOrchestrator', () => {
  it('should query all models in parallel');
  it('should respect per-model timeout');
  it('should calculate consensus correctly');
  it('should surface disagreements');
  it('should handle partial failures');
});
```

### Integration Tests
- Query all providers with test prompts
- Verify consolidation accuracy
- Test fallback scenarios

### Manual Verification
- [ ] CEO reviews consolidated output quality
- [ ] Compare to manual consolidation baseline
- [ ] Verify time savings (~5 min target)

---

*ADR-001 created for EndiorBot Multi-Model Orchestrator*
*SDLC Framework v6.1.1*
