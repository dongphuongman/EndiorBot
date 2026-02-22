# Technical Specification: Agent Orchestration

**ID:** TS-003
**Status:** Proposed
**Date:** 2026-02-22
**Related ADR:** ADR-001 (Multi-Model Orchestrator)
**SDLC Stage:** 02-DESIGN

---

## Overview

The Agent module orchestrates AI model interactions, including multi-model consultation, response consolidation, and SDLC-aware routing.

---

## Architecture

```
src/agents/
├── index.ts                     # Re-exports
├── types.ts                     # Agent types
├── agent-scope.ts               # Permission boundaries
├── orchestrator/
│   ├── index.ts
│   ├── multi-model-orchestrator.ts
│   ├── response-consolidator.ts
│   └── task-classifier.ts
├── quality/
│   ├── index.ts
│   ├── reflect-step.ts          # Port from Python
│   ├── history-compactor.ts     # Port from Python
│   └── query-classifier.ts      # Port from Python
└── resilience/
    ├── index.ts
    ├── failover-classifier.ts   # Port from Python
    └── conversation-tracker.ts  # Port from Python
```

---

## Multi-Model Orchestrator

### Core Interface

```typescript
interface MultiModelOrchestrator {
  consult(request: ConsultationRequest): Promise<ConsultationResult>;
  consultStream(request: ConsultationRequest): AsyncIterable<ConsultationChunk>;
}

interface ConsultationRequest {
  query: string;
  taskType: TaskType;
  models?: ModelSelection[];
  timeout?: number;
  minResponses?: number;
}

type TaskType =
  | 'architecture'    // Multi-model recommended
  | 'security'        // Cross-validation critical
  | 'code_gen'        // Single model (speed)
  | 'bug_fix'         // Single model (speed)
  | 'research'        // Multi-model (diverse data)
  | 'general';        // Auto-detect

interface ConsultationResult {
  taskId: string;
  query: string;
  responses: ModelResponse[];
  consensus: ConsensusResult;
  recommendation: string;
  sdlcCompliance: SDLCComplianceCheck;
}
```

### Model Routing

```typescript
class TaskClassifier {
  private patterns: Map<TaskType, RegExp[]>;

  classify(query: string): TaskType {
    // Check explicit markers
    if (query.includes('@consult')) return 'architecture';
    if (query.includes('@quick')) return 'code_gen';

    // Pattern matching
    for (const [taskType, patterns] of this.patterns) {
      if (patterns.some(p => p.test(query))) {
        return taskType;
      }
    }

    return 'general';
  }

  getRecommendedModels(taskType: TaskType): ModelSelection[] {
    switch (taskType) {
      case 'architecture':
        return [
          { provider: 'anthropic', model: 'claude-opus-4', role: 'primary' },
          { provider: 'openai', model: 'gpt-5', role: 'expert' },
          { provider: 'google', model: 'gemini-2-pro', role: 'expert' },
        ];
      case 'security':
        return [
          { provider: 'anthropic', model: 'claude-opus-4', role: 'primary' },
          { provider: 'openai', model: 'gpt-5', role: 'expert' },
        ];
      case 'code_gen':
      case 'bug_fix':
        return [
          { provider: 'anthropic', model: 'claude-opus-4', role: 'primary' },
        ];
      case 'research':
        return [
          { provider: 'google', model: 'gemini-2-pro', role: 'primary' },
          { provider: 'anthropic', model: 'claude-opus-4', role: 'expert' },
        ];
      default:
        return [
          { provider: 'anthropic', model: 'claude-opus-4', role: 'primary' },
        ];
    }
  }
}
```

---

## Response Consolidator

### Consensus Algorithm

```typescript
class ResponseConsolidator {
  async consolidate(responses: ModelResponse[]): Promise<ConsensusResult> {
    // Extract key recommendations from each response
    const recommendations = await Promise.all(
      responses.map(r => this.extractRecommendations(r))
    );

    // Find consensus points (>50% agreement)
    const consensusPoints = this.findConsensus(recommendations);

    // Find disagreements
    const disagreements = this.findDisagreements(recommendations);

    // Weight by model role (primary gets 1.5x)
    const weightedRecommendation = this.weightedMerge(
      recommendations,
      responses.map(r => r.role === 'primary' ? 1.5 : 1.0)
    );

    return {
      hasConsensus: consensusPoints.length > 0,
      consensusPoints,
      disagreements,
      recommendation: weightedRecommendation,
    };
  }

  private async extractRecommendations(response: ModelResponse): Promise<string[]> {
    // Use fast model to extract bullet points
    const extraction = await this.provider.chat({
      model: 'claude-haiku-4',
      messages: [
        {
          role: 'system',
          content: 'Extract the key recommendations as a JSON array of strings.',
        },
        { role: 'user', content: response.content },
      ],
    });
    return JSON.parse(extraction.content);
  }
}
```

### Consensus Result

```typescript
interface ConsensusResult {
  hasConsensus: boolean;
  consensusPoints: string[];       // Agreed by >50%
  disagreements: Disagreement[];
  recommendation: string;
}

interface Disagreement {
  topic: string;
  positions: {
    provider: string;
    position: string;
    reasoning: string;
  }[];
}
```

---

## SDLC-Aware Routing

### Compliance Check

```typescript
interface SDLCComplianceCheck {
  passed: boolean;
  currentStage: SDLCStage;
  requiredArtifacts: string[];
  missingArtifacts: string[];
  recommendations: string[];
}

class SDLCRouter {
  checkCompliance(
    taskType: TaskType,
    currentStage: SDLCStage,
    projectContext: ProjectContext,
  ): SDLCComplianceCheck {
    const requirements = this.getStageRequirements(currentStage);

    // Check if task matches stage
    if (!this.isTaskAllowedInStage(taskType, currentStage)) {
      return {
        passed: false,
        currentStage,
        requiredArtifacts: requirements,
        missingArtifacts: [],
        recommendations: [
          `Task type "${taskType}" should wait until stage ${this.recommendedStage(taskType)}`,
        ],
      };
    }

    // Check required artifacts
    const missing = requirements.filter(r => !this.artifactExists(r, projectContext));

    return {
      passed: missing.length === 0,
      currentStage,
      requiredArtifacts: requirements,
      missingArtifacts: missing,
      recommendations: missing.map(m => `Create ${m} before proceeding`),
    };
  }
}
```

---

## Quality Layer (Ported from Python)

### Reflect Step

```typescript
class ReflectStep {
  async reflect(
    toolResult: ToolResult,
    context: ConversationContext,
  ): Promise<ReflectionResult> {
    // After tool execution, reflect on result quality
    const reflection = await this.provider.chat({
      model: 'claude-haiku-4',
      messages: [
        {
          role: 'system',
          content: `Reflect on this tool execution result. Check for:
            1. Completeness - did it achieve the goal?
            2. Quality - are there issues with the output?
            3. Next steps - what should happen next?`,
        },
        { role: 'user', content: JSON.stringify(toolResult) },
      ],
    });

    return this.parseReflection(reflection.content);
  }
}
```

### Query Classifier

```typescript
class QueryClassifier {
  // Model routing hints based on query characteristics
  classify(query: string): QueryClassification {
    return {
      complexity: this.assessComplexity(query),
      domain: this.detectDomain(query),
      urgency: this.detectUrgency(query),
      recommendedModel: this.recommendModel(query),
    };
  }

  private recommendModel(query: string): ModelRecommendation {
    const complexity = this.assessComplexity(query);

    if (complexity === 'high') {
      return { model: 'claude-opus-4', reason: 'Complex reasoning required' };
    }
    if (complexity === 'medium') {
      return { model: 'claude-sonnet-4', reason: 'Balanced speed/quality' };
    }
    return { model: 'claude-haiku-4', reason: 'Fast response preferred' };
  }
}
```

---

## Resilience Layer (Ported from Python)

### Failover Classifier

```typescript
class FailoverClassifier {
  classify(error: Error): FailoverDecision {
    const code = this.extractErrorCode(error);

    switch (code) {
      case 'AUTH_ERROR':
        return { action: 'fail', reason: 'Invalid credentials', retryable: false };
      case 'RATE_LIMIT':
        return { action: 'wait', reason: 'Rate limited', retryAfterMs: 60000 };
      case 'TIMEOUT':
        return { action: 'retry', reason: 'Request timeout', retryable: true };
      case 'SERVICE_ERROR':
        return { action: 'failover', reason: 'Service unavailable', fallbackProvider: 'openai' };
      default:
        return { action: 'fail', reason: 'Unknown error', retryable: false };
    }
  }
}
```

### Conversation Tracker

```typescript
class ConversationTracker {
  private maxDepth = 10;
  private maxTurns = 100;
  private seenStates = new Set<string>();

  checkLimits(conversation: Conversation): ConversationHealth {
    const issues: string[] = [];

    // Check depth
    if (conversation.depth > this.maxDepth) {
      issues.push(`Depth ${conversation.depth} exceeds max ${this.maxDepth}`);
    }

    // Check turns
    if (conversation.turns > this.maxTurns) {
      issues.push(`Turns ${conversation.turns} exceeds max ${this.maxTurns}`);
    }

    // Check for loops
    const stateHash = this.hashState(conversation);
    if (this.seenStates.has(stateHash)) {
      issues.push('Possible conversation loop detected');
    }
    this.seenStates.add(stateHash);

    // Check token budget
    if (conversation.tokenCount > conversation.maxTokens * 0.9) {
      issues.push('Approaching token budget limit');
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations: issues.map(i => this.getRecommendation(i)),
    };
  }
}
```

---

## Migration from OpenClaw

| OpenClaw File | EndiorBot Target | Changes |
|---------------|------------------|---------|
| src/agents/agent-scope.ts | src/agents/agent-scope.ts | - |
| src/agents/schema.ts | src/agents/types.ts | Rename |
| N/A | src/agents/orchestrator/ | New module |
| SDLC-Orchestrator/*.py | src/agents/quality/, resilience/ | Port |

---

## Testing Requirements

| Test Type | Coverage Target |
|-----------|-----------------|
| Unit tests | > 80% |
| Integration tests | Multi-model flow |
| Behavioral tests | Python parity |

---

*SDLC Framework v6.1.1 - Stage 02: Design*
