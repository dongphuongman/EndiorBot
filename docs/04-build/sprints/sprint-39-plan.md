# Sprint 39 Detailed Plan - Resource Router + Ollama

**Version**: 2.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Sprint 38-46 Replan)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 38 Complete (OTT + Multi-Provider validated)
- ADR-009 Approved (Hybrid AI/Ollama Architecture) — if not yet approved, approve Day 1
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 39 implements **Resource Router + Ollama** — intelligent model selection between cloud AI (Claude, GPT, Gemini) and local Ollama based on task complexity and budget.

### Vision: Cost-Effective Autonomy

```
Current (Sprint 38):  All tasks use Cloud AI → $2 session limit reached quickly
Sprint 39 Target:     Simple tasks use Ollama (free) → $2 lasts 3-5x longer
Future (Sprint 41):   Fix logging learns which patterns benefit which model
```

### Why Resource Router + Ollama?

> **CPO/CTO Requirement**: "Use expensive models for complex tasks, free models for simple tasks. Router must respect quality gates."

Benefits:
- Reduce costs 60-80% for simple tasks (formatting, boilerplate, imports)
- Extend session duration 3-5x (more work per $2 budget)
- Quality gates ensure critical tasks use best models
- Automatic fallback to Ollama when budget exhausted (Sprint 36 LimitAction now functional)

Risks:
- Ollama lower quality for complex reasoning — quality gates mitigate
- Task classification errors — conservative thresholds, telemetry

---

## Sprint Goal

**Implement resource router that selects between cloud AI and Ollama based on task complexity, budget, and quality requirements; implement Ollama provider and wire budget fallback.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 38** | OTT + Multi-Provider validated | PLANNED | Sprint 39 start |
| **ADR-009** | Hybrid AI/Ollama Architecture | DRAFT | Sprint 39 Day 1 |
| **Ollama installed** | Local Ollama or NQH API | ⚠️ MANUAL | Day 6-7 |

### Phase 5 Validation Criteria (Revised)

Sprint 38 → Sprint 39 Gate:
- [ ] Resource router selects model based on task complexity
- [ ] Quality gates enforce minimum model tier for critical tasks
- [ ] Ollama provider connects to local/NQH instance
- [ ] Cost reduction 60-80% for simple tasks
- [ ] Budget fallback to Ollama works (replace mock in resource-router-fallback.test.ts)
- [ ] E2E: complex task → Claude, simple task → Ollama, budget limit → Ollama fallback

**Gate**: All criteria must PASS before Sprint 40 Day 1.

---

## Sprint 39 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Resource Router + Task Classifier | routing/types.ts, task-classifier.ts, resource-router.ts, quality-gates.ts |
| **Week 2** | Ollama + Cost Optimization | ollama-provider.ts, cost-optimizer.ts, model-selector.ts, E2E |

**Duration**: 10 working days (2 weeks from Sprint 38 close)

---

## Week 1: Resource Router (Day 1-5)

### Day 1: ADR-009 Approval + Routing Types + Task Classifier

**Goal**: Formalize ADR-009 and implement task complexity classification.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create/approve ADR-009 | P0 | ADR-009-Hybrid-AI-Ollama-Architecture.md | ~450 |
| Create src/agents/routing/types.ts | P0 | TaskComplexity, RoutingContext, ModelSelection | ~200 |
| Create src/agents/routing/task-classifier.ts | P0 | Classify: simple/moderate/complex/critical | ~350 |
| Create tests/agents/routing/task-classifier.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] ADR-009 defines model tiers, routing rules, quality gates
- [ ] Task classifier categorizes: simple, moderate, complex, critical
- [ ] Complexity scoring: code size, dependencies, logic depth, risk
- [ ] Confidence: high (>80%), medium (50-80%), low (<50%)
- [ ] Tests pass: classification accuracy >85%
- [ ] Build passes

**Task Complexity Taxonomy**:
```typescript
interface TaskComplexity {
  level: 'simple' | 'moderate' | 'complex' | 'critical';
  confidence: 'high' | 'medium' | 'low';
  score: number;
  factors: {
    codeSize: number;
    dependencies: number;
    logicDepth: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresReasoning: boolean;
    hasExamples: boolean;
  };
  recommendedModel: 'ollama' | 'claude' | 'gpt' | 'gemini';
}
```

---

### Day 2-3: Resource Router + Quality Gates

**Goal**: Model selection logic and quality enforcement.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/routing/resource-router.ts | P0 | selectModel(task, context) | ~400 |
| Create src/agents/routing/quality-gates.ts | P0 | Minimum tier per task type | ~300 |
| Create src/agents/routing/model-registry.ts | P0 | Model metadata (tier, cost, capabilities) | ~200 |
| Create tests/agents/routing/resource-router.test.ts | P0 | Unit tests | ~250 |

**Acceptance Criteria**:
- [ ] Resource router selects model based on complexity + budget
- [ ] Quality gates: gate_evaluation → premium, security_code → premium, etc.
- [ ] Budget constraint: session < $0.50 remaining → prefer Ollama for simple/moderate
- [ ] Router integrates with BudgetTracker (Sprint 36)
- [ ] Tests pass: routing decisions, quality enforcement
- [ ] Build passes

**Integration Points**:
```
resource-router.ts
    └── task-classifier.ts
    └── quality-gates.ts
    └── BudgetTracker (Sprint 36)
    └── ProviderRegistry (Sprint 38)
```

---

### Day 4-5: Replace Mock ResourceRouter in Sprint 36 Test

**Goal**: Wire real ResourceRouter into budget-escalation flow; ensure onBudgetLimitReached triggers Ollama fallback path.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Integrate ResourceRouter with BudgetEscalationIntegration | P0 | budget-escalation-integration.ts | ~80 |
| Replace mock in resource-router-fallback.test.ts with real ResourceRouter | P0 | tests/budget/resource-router-fallback.test.ts | ~100 |
| Add ResourceRouter to agent/orchestrator context | P1 | agent-scope or orchestrator | ~50 |
| E2E: budget limit → router selects Ollama fallback | P0 | E2E test | ~80 |

**Acceptance Criteria**:
- [ ] When budget limit reached, BudgetTracker/Integration calls ResourceRouter or equivalent to trigger switch_to_ollama
- [ ] resource-router-fallback.test.ts uses real ResourceRouter (or real interface) instead of mock only
- [ ] E2E: hit session limit → fallback path exercised → Ollama selected for next simple task
- [ ] Build passes

---

## Week 2: Ollama + Cost Optimization (Day 6-10)

### Day 6-7: Ollama Provider

**Goal**: Implement Ollama provider (local or NQH API).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/providers/ollama/ollama-provider.ts | P0 | Ollama API adapter | ~400 |
| Create src/providers/ollama/ollama-client.ts | P0 | HTTP client (Ollama /api/chat) | ~200 |
| Implement BaseProvider interface | P0 | chat(), isAvailable() | - |
| Model mapping: Codestral, Llama3, Qwen (per plan) | P0 | model-mapper.ts | ~100 |
| Create tests/providers/ollama/ollama-provider.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] OllamaProvider implements BaseProvider
- [ ] Supports local Ollama (localhost:11434) or NQH API (configurable baseUrl)
- [ ] Models: codestral, llama3, qwen2.5 (or current names)
- [ ] Cost always $0.00; token usage estimated or from response
- [ ] isAvailable() checks /api/tags or health
- [ ] Error handling: connection refused, model not loaded
- [ ] Tests pass: mock HTTP
- [ ] Build passes

**Integration Points**:
```
OllamaProvider
    └── BaseProvider (Sprint 29)
    └── Logger
ProviderRegistry
    └── register Ollama provider
```

---

### Day 8-9: Cost Optimizer + Model Selector

**Goal**: Route simple tasks to Ollama when budget allows; final model selection API.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/routing/cost-optimizer.ts | P0 | Prefer Ollama when budget > 80% used | ~200 |
| Create src/agents/routing/model-selector.ts | P0 | Final model selection (router + optimizer) | ~150 |
| Wire LimitAction switch_to_ollama to ResourceRouter/Ollama | P0 | budget-tracker or integration | ~60 |
| Create tests/agents/routing/cost-optimizer.test.ts | P0 | Unit tests | ~120 |

**Acceptance Criteria**:
- [ ] When session budget > 80% used, cost optimizer suggests Ollama for simple/moderate
- [ ] model-selector.ts is single entry point for "which model for this task?"
- [ ] BudgetTracker limit_reached → EscalationRouter/BudgetEscalationIntegration → ResourceRouter triggers fallback (Ollama for next eligible task)
- [ ] Tests pass
- [ ] Build passes

---

### Day 10: Integration + E2E

**Goal**: Full E2E validation; G-Sprint-39 gate.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: complex task → Claude (or GPT/Gemini) | P0 | tests/e2e/resource-router-e2e.test.ts | ~100 |
| E2E: simple task → Ollama | P0 | Same file | ~80 |
| E2E: budget limit → Ollama fallback | P0 | Same file | ~100 |
| G-Sprint-39 checklist | P0 | All criteria below | - |

**Acceptance Criteria**:
- [ ] All Sprint 39 acceptance criteria met
- [ ] Build passes, lint clean, tests pass
- [ ] Documentation: Ollama setup (brew install ollama, or NQH API key)

---

## Files Created (Sprint 39)

| File | Est. LOC | Purpose |
|------|----------|---------|
| src/agents/routing/types.ts | ~200 | Routing types |
| src/agents/routing/task-classifier.ts | ~350 | Task complexity |
| src/agents/routing/resource-router.ts | ~400 | Model selection |
| src/agents/routing/quality-gates.ts | ~300 | Quality enforcement |
| src/agents/routing/model-registry.ts | ~200 | Model metadata |
| src/agents/routing/cost-optimizer.ts | ~200 | Budget-aware routing |
| src/agents/routing/model-selector.ts | ~150 | Final selection API |
| src/providers/ollama/ollama-provider.ts | ~400 | Ollama adapter |
| src/providers/ollama/ollama-client.ts | ~200 | HTTP client |
| src/providers/ollama/model-mapper.ts | ~100 | Model names |
| tests/agents/routing/*.test.ts | ~700 | Unit tests |
| tests/providers/ollama/*.test.ts | ~200 | Ollama tests |
| tests/e2e/resource-router-e2e.test.ts | ~280 | E2E |
| **Total** | **~2,000** | |

---

## Modified Files (Sprint 39)

| File | Changes |
|------|---------|
| tests/budget/resource-router-fallback.test.ts | Use real ResourceRouter |
| src/budget/budget-escalation-integration.ts | Optional ResourceRouter integration |
| src/providers/index.ts | Register Ollama |
| docs/04-build/ollama-setup.md | Ollama/NQH setup |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 39 INTEGRATION                         │
│                                                                  │
│  Task → TaskClassifier → ResourceRouter → ModelSelector          │
│              │                    │                    │          │
│              │                    │                    ▼          │
│              │                    │          ┌─────────────────┐ │
│              │                    │          │ Quality Gates    │ │
│              │                    │          │ Cost Optimizer  │ │
│              │                    │          └────────┬────────┘ │
│              │                    │                   │          │
│              │                    ▼                   ▼          │
│              │          BudgetTracker (Sprint 36)   ProviderRegistry│
│              │          limit_reached → fallback    Anthropic, OpenAI,│
│              │                                       Gemini, Ollama (new)│
│              └──────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria (Sprint 39)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Resource router selects by complexity | 100% | Unit tests |
| Quality gates enforce tiers | 100% | Unit tests |
| Ollama provider works | 100% | Provider tests |
| Cost reduction simple tasks | 60-80% | E2E |
| Budget fallback to Ollama | 100% | E2E |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 38 complete | PLANNED | OTT + multi-provider |
| ADR-009 | DRAFT | Approve Day 1 |
| BudgetTracker | ✅ | Sprint 36 |
| ProviderRegistry | ✅ | Sprint 38 (Anthropic, OpenAI, Gemini) |
| Ollama or NQH | ⚠️ MANUAL | Day 6-7 |

---

## Next Sprint Preview (Sprint 40)

**Sprint Goal**: Parallel Execution

**Key Deliverables**:
- Track manager (2-3 tracks)
- File lock manager
- Dependency graph and scheduler
- Per-track budget and checkpoint

**Prerequisite**: Sprint 39 PASS (Resource Router + Ollama validated)

---

## Approval Checklist (G-Sprint-39)

### Code Quality
- [ ] Build passes
- [ ] All tests pass (~100 new)
- [ ] Zero lint warnings

### Features
- [ ] Task classifier identifies complexity
- [ ] Resource router selects model by complexity + budget
- [ ] Quality gates enforce minimum tiers
- [ ] Ollama provider works (local or NQH)
- [ ] Cost optimizer reduces cost 60-80% for simple tasks
- [ ] Budget fallback to Ollama works
- [ ] Mock in resource-router-fallback replaced with real path

### Integration
- [ ] ResourceRouter integrates with BudgetTracker
- [ ] Ollama registered in ProviderRegistry
- [ ] LimitAction switch_to_ollama functional

---

**Last Updated**: 2026-02-22
**Sprint Status**: DRAFT - Revised per Sprint 38-46 Replan
**Blocking**: Sprint 38 close

---

*Sprint 39 Plan - Resource Router + Ollama*
*EndiorBot - Cost-effective autonomy*
*SDLC Framework 6.1.1*
