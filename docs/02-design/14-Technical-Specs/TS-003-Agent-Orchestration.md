# Technical Specification: Agent Orchestration

**ID:** TS-003
**Status:** Active
**Date:** 2026-02-28
**Related ADR:** ADR-001 (Multi-Model Orchestrator)
**SDLC Stage:** 02-DESIGN
**Updated:** Sprint 55 - Agent-Claude Code Bridge

---

## Overview

The Agent module orchestrates AI model interactions, including:
1. Multi-model consultation (Sprint 54)
2. Response consolidation
3. SDLC-aware routing
4. **Agent-Claude Code Bridge** (Sprint 55) - Wire 12 SDLC agents to Claude Code

---

## Architecture

```
src/agents/
├── index.ts                     # Re-exports
├── types.ts                     # Agent types
├── agent-scope.ts               # Permission boundaries
├── types/
│   └── handoff.ts               # Handoff JSON schema + guards (Sprint 55)
├── orchestrator/
│   ├── index.ts
│   ├── multi-model-orchestrator.ts
│   ├── response-consolidator.ts
│   ├── task-classifier.ts
│   ├── mention-parser.ts        # Parse @agent mentions (Sprint 55)
│   ├── agent-router.ts          # Route to SOUL templates (Sprint 55)
│   ├── handoff-guards.ts        # Validate transitions (Sprint 55)
│   └── workflow-engine.ts       # Agent chain state machine (Sprint 55)
├── context/
│   ├── context-manifest.ts      # Injection manifest (Sprint 55)
│   └── context-injector.ts      # Brain → Claude prompt (Sprint 55)
├── invoke/
│   ├── claude-code-bridge.ts    # 3 modes: read/patch/interactive (Sprint 55)
│   ├── patch-validator.ts       # Validate unified diff (Sprint 55)
│   └── response-parser.ts       # Extract handoffs (Sprint 55)
├── handoff/
│   └── handoff-detector.ts      # Detect handoffs in responses (Sprint 55)
├── safety/
│   ├── risk-classifier.ts       # LOW/MEDIUM/HIGH/CRITICAL (Sprint 55)
│   └── audit-logger.ts          # Log to JSONL (Sprint 55)
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

## Agent-Claude Code Bridge (Sprint 55)

### Flow Overview

```
CEO: @pm "plan payment gateway"
      │
      ▼
┌─────────────────────────────────────────────────┐
│  CLI agent.ts / OTT channel                      │
│  Parse input, detect @agent mention              │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  mention-parser.ts                               │
│  Formats: @pm "msg", [@pm: msg], [@pm,arch: msg] │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  agent-router.ts                                 │
│  1. Load SOUL template from docs/reference/souls │
│  2. Validate agent in current tier              │
│  3. Classify task complexity                    │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  context-injector.ts                             │
│  1. Load Brain L1-L4 context                    │
│  2. Build context manifest                      │
│  3. Inject into Claude Code prompt              │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  claude-code-bridge.ts                           │
│  Mode: READ | PATCH | INTERACTIVE               │
│  Invoke: claude -p "prompt" [--allowedTools]    │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  response-parser.ts                              │
│  Extract: handoff JSON, artifacts, output       │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│  workflow-engine.ts                              │
│  1. Validate handoff transition                 │
│  2. Check guards (depth, total, timeout)        │
│  3. Prompt CEO for confirmation                 │
│  4. Route to next agent or complete             │
└─────────────────────────────────────────────────┘
```

### Handoff Protocol

```typescript
// 12 SDLC Roles
type SE4ARole = "researcher" | "pm" | "pjm" | "architect" | "coder" | "reviewer" | "tester" | "devops";
type SE4HRole = "ceo" | "cpo" | "cto";
type RouterRole = "assistant";
type AgentRole = SE4ARole | SE4HRole | RouterRole;

// Handoff JSON Schema
interface HandoffItem {
  to: AgentRole;
  intent: string;
  priority: "P0" | "P1" | "P2";
  inputs: Record<string, unknown>;
  reason: string;
}

interface HandoffRequest {
  handoff: HandoffItem[];
}

// Allowed Transitions
const ALLOWED_TRANSITIONS: Record<AgentRole, AgentRole[]> = {
  researcher: ["pm"],
  pm: ["architect", "pjm"],
  pjm: ["coder", "tester"],
  architect: ["coder", "reviewer"],
  coder: ["reviewer", "tester"],
  reviewer: ["coder", "pm"],
  tester: ["coder", "devops"],
  devops: ["tester"],
  ceo: [], cpo: [], cto: [],  // Advisors cannot delegate
  assistant: ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops"],
};

// Handoff Guards
const HANDOFF_GUARDS = {
  maxDepth: 3,
  maxTotalPerRequest: 5,
  timeoutPerAgent: 300,  // seconds
  maxRetries: 2,
  retryCooldownMs: 1000,
};
```

### Claude Code Bridge Modes

| Mode | Flag | Description | Use Case |
|------|------|-------------|----------|
| READ | (default) | No file changes | Research, planning, review |
| PATCH | --patch | Unified diff + CEO confirm | Code changes |
| INTERACTIVE | --interactive | Human takes over | Complex refactoring |

```typescript
interface ClaudeCodeBridge {
  // READ mode - safe, no file changes
  invokeRead(prompt: string, workspace: string): Promise<ClaudeResponse>;

  // PATCH mode - diff preview + confirm
  invokePatch(prompt: string, workspace: string): Promise<PatchResponse>;

  // INTERACTIVE mode - human takeover
  invokeInteractive(prompt: string, workspace: string): Promise<void>;
}

interface PatchResponse {
  diff: string;
  affectedFiles: string[];
  validation: PatchValidation;
  applied: boolean;
}

interface PatchValidation {
  allowed: boolean;
  risks: string[];
  dangerousPatterns: string[];  // e.g., "rm -rf", "DROP TABLE"
}
```

### Risk Classification

```typescript
const RISK_LEVELS = {
  LOW: {
    actions: ["read_file", "search", "generate_spec", "generate_plan"],
    confirmation: "none",
  },
  MEDIUM: {
    actions: ["create_test", "update_docs", "create_draft_pr"],
    confirmation: "batch",
  },
  HIGH: {
    actions: ["modify_source", "apply_patch", "merge_pr"],
    confirmation: "explicit",
  },
  CRITICAL: {
    actions: ["delete_file", "db_migration", "deploy", "push_main"],
    confirmation: "explicit_with_audit",
  },
};
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

## Migration from MTS-OpenClaw

| MTS-OpenClaw File | EndiorBot Target | Changes |
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
