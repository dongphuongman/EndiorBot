---
spec_id: SPEC-04BUILD-SPRINT95
title: "Sprint 95: Progressive Autonomy T2 — Multi-Agent Routing"
spec_version: "1.0.0"
status: complete
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-08
last_updated: 2026-03-08
related_adrs: ["ADR-002", "ADR-024"]
---

# Sprint 95: Progressive Autonomy T2 — Multi-Agent Routing

**Date:** 2026-03-08
**Gate:** G-Sprint
**Authority:** Sprint 94 CURRENT-SPRINT.md + ADR-024 + ADR-002
**Preceding sprint:** Sprint 94 (Canonical Types + Channel Policy Engine)
**Est. effort:** ~5h
**Est. tests:** ~55

---

## Goal

Deliver the **intelligence layer** for Progressive Autonomy Tier 2 (T2). Break CEO goals into multi-agent subtasks (GoalDecomposer), propagate context between sequential agent invocations (SessionRelay), aggregate results from multiple agents (ResponseAggregator), and orchestrate execution with budget enforcement (MultiAgentDispatcher). Integrate into GatewayIngress and router-chat.ts while preserving full single-agent backward compatibility.

---

## Depends On

- Sprint 94 (Canonical Types + Channel Policy Engine) — EndiorMessage, ChannelPolicyEngine, GatewayIngress with optional params.
- Sprint 93 (Gateway-Centric Unified App) — CommandDispatcher, GatewayIngress, `endiorbot serve`.
- MentionParser (Sprint 83) — `agents: AgentRole[]` for explicit multi-agent mentions.
- TaskClassifier (Sprint 72) — Complexity classification for decomposition.
- HandoffGuards + isAllowedTransition (Sprint 72) — Agent transition validation.
- SessionBudget (Sprint 72) — Cost tracking patterns.
- AUTONOMY_GATE_CONFIG.B (Sprint 72) — 30 min / $2.00 budget limits.
- TokenCounter (Sprint 69-71) — Token counting for 2K context cap.
- ChannelRouter.callAI() (Sprint 93) — 3-level fallback AI invocation.

---

## Scope

| In Scope | Out of Scope (deferred) |
|----------|------------------------|
| GoalDecomposer — break goals into multi-agent subtasks | Full consumer migration (InboundMessage → EndiorMessage) → Sprint 96+ |
| SessionRelay — context propagation with 2K token cap | LLM-based response summarization (T3 feature) → Sprint 97 |
| ResponseAggregator — template-based merging | Agent Teams integration (already Sprint 90) |
| MultiAgentDispatcher — sequential/parallel/mixed execution | Per-agent cost dashboard UI → Sprint 96+ |
| Gateway integration — multi-agent branch in ingress.ts | Webhook-mode transition |
| Gate B budget enforcement ($2.00, 30 min) | Complexity-based decomposition triggers (T3) |

---

## Review Synthesis

**CTO 8.5/10 APPROVED → Code Review 9/10 APPROVED**

### CTO Plan Findings — All Addressed

| # | Type | Issue | Resolution |
|---|------|-------|-----------|
| MF-1 | Must-Fix | `RouteResult.agents` is `string[]` not `AgentRole[]` | GoalDecomposer accepts `string[]`, validates via `isValidRole()` internally |
| F1 | Finding | AD-4 wording ambiguous (rate limit vs cost) | Clarified: PolicyEngine at ingress, SessionBudget-style cost in dispatcher |
| F2 | Finding | `callAI()` returns no cost info | `estimateCost(durationMs, provider)` using per-provider rate table |
| F3 | Finding | `formatResponse()` is single-agent only | ResponseAggregator has own template, does NOT reuse formatResponse() |
| F4 | Finding | Parallel execution needs `Promise.allSettled()` | Used in `executeParallel()` — prevents cascading failures |
| F5 | Finding | 12 dispatcher tests insufficient | Expanded to 12 `it()` blocks in 7 describe groups with combinatorial coverage |

### CTO Code Review Findings (Post-Implementation)

| # | Severity | Issue | Notes |
|---|----------|-------|-------|
| F1 | Info | `idCounter` module-level state in both goal-decomposer.ts and validators.ts | No action needed; Date.now() prefix prevents collisions |
| F2 | Info | Mixed execution skip reason doesn't mention which dependency failed | Enhancement for future sprint |
| F3 | Info | `shouldDecompose()` only checks heuristic patterns, not complexity | Conservative by design for T2; T3 may add complexity triggers |
| F4 | Low | Cost estimation rates are hardcoded | Estimates for guardrails, not billing; Gate B $2.00 cap is hard safety net |
| F5 | Low | GatewayIngress constructor growing (5 params) | Consider options object refactor in Sprint 96+ |

---

## Architecture

### Module Structure — `src/autonomy/`

```
autonomy/types.ts              ← ZERO imports from src/ (ADR-002)
        │
autonomy/goal-decomposer.ts   ← MentionParser, TaskClassifier, handoff types
        │
autonomy/session-relay.ts     ← TokenCounter (2K cap)
        │
autonomy/response-aggregator.ts ← (no external deps)
        │
autonomy/multi-agent-dispatcher.ts ← composes relay + aggregator + ChannelRouter.callAI()
        │
gateway/ingress.ts             ← optional injection, backward-compatible
gateway/methods/router-chat.ts ← same pattern
cli/commands/serve.ts          ← instantiates and wires everything
```

### Architecture Decisions

| # | Decision | Resolution |
|---|----------|-----------|
| AD-1 | Where do new modules live? | New `src/autonomy/` top-level module (cross-cutting, like `src/protocol/` and `src/policy/`) |
| AD-2 | Sequential vs parallel? | DecompositionPlan marks dependencies; independent → parallel, dependent → sequential |
| AD-3 | Response aggregation | Template-based (section per agent), NOT LLM summarization (latency/cost) |
| AD-4 | Policy interaction | ChannelPolicyEngine rate limiting at ingress only; SessionBudget-style cost enforcement per subtask in dispatcher |
| AD-5 | T2 budget | Gate B: 30 min, $2.00, Sonnet default |
| AD-6 | ADR-002 compliance | `src/autonomy/types.ts` imports ZERO modules from `src/` |

### GoalDecomposer — Decomposition Flow

```
CEO Goal → resolveAgents() → buildSubtasks() → determineStrategy() → validateBudget()
                │                   │                    │
    Priority:   │     Pipeline-ordered     sequential / parallel / mixed
    1. explicit agents (string[] → isValidRole)         │
    2. heuristic patterns (7 regexes)              estimateDuration()
    3. TaskClassifier → single agent                    │
                                                  GoalDecomposition
```

Heuristic patterns:
- `design and implement` → architect + coder (sequential)
- `plan and build` → pm + coder (sequential)
- `review and fix` → reviewer + coder (sequential)
- `test and fix` → tester + coder (sequential)
- `plan design implement` → pm + architect + coder (sequential)

### MultiAgentDispatcher — Execution Strategies

```
Sequential:  A ──→ B ──→ C    (context relayed between steps)
Parallel:    A ──→ ┐
             B ──→ ├──→ aggregate   (Promise.allSettled)
             C ──→ ┘
Mixed:       A ──→ ┐
             B ──→ ├──→ C ──→ aggregate  (dependency-aware waves)
```

### Cost Estimation (CTO F2)

```typescript
const PROVIDER_COST_PER_SEC: Record<string, number> = {
  "claude-bridge": 0.005,
  "claude-api": 0.010,
  "gemini-api": 0.003,
  "openai-api": 0.008,
  "ollama": 0.001,
};

function estimateCost(durationMs: number, provider: string): number {
  const rate = PROVIDER_COST_PER_SEC[provider] ?? 0.005;
  return (durationMs / 1000) * rate;
}
```

---

## Key Deliverables

### New Files (7)

| # | File | Description | Lines |
|---|------|-------------|-------|
| 1 | `src/autonomy/types.ts` | GoalDecomposition, Subtask, SessionRelayContext, AggregatedResponse, MultiAgentConfig, DEFAULT_T2_CONFIG, DispatchEvent — ZERO imports (ADR-002) | 216 |
| 2 | `src/autonomy/goal-decomposer.ts` | GoalDecomposer class — shouldDecompose(), decompose(), resolveAgents(), validateBudget() | 395 |
| 3 | `src/autonomy/session-relay.ts` | SessionRelay class — createRelay(), recordSubtaskResult(), buildAgentContext() with 2K token cap | 174 |
| 4 | `src/autonomy/response-aggregator.ts` | ResponseAggregator class — template-based merging with header/sections/failures | 142 |
| 5 | `src/autonomy/multi-agent-dispatcher.ts` | MultiAgentDispatcher class — sequential/parallel/mixed execution, Gate B budget, Promise.allSettled() | 330 |
| 6 | `src/autonomy/index.ts` | Barrel export for all types + classes | 35 |
| 7 | `tests/gateway/ingress-multiagent.test.ts` | Integration tests for multi-agent path in GatewayIngress | 151 |

### Modified Files (3)

| # | File | Changes |
|---|------|---------|
| 8 | `src/gateway/ingress.ts` | Add optional GoalDecomposer + MultiAgentDispatcher params; multi-agent branch when `agents.length > 1` or `shouldDecompose()` returns true |
| 9 | `src/gateway/methods/router-chat.ts` | Same multi-agent branch for WebSocket `router.chat` method |
| 10 | `src/cli/commands/serve.ts` | Instantiate GoalDecomposer + MultiAgentDispatcher; pass to GatewayIngress and registerRouterChatMethods() |

### Key Interfaces

```typescript
// src/autonomy/types.ts — ZERO imports (ADR-002)

type DecompositionStrategy = "sequential" | "parallel" | "mixed";

interface Subtask {
  id: string;
  description: string;
  agent: string;        // MF-1: string, not AgentRole
  dependencies: string[];
  priority: number;
  estimatedDurationMs: number;
  status: SubtaskStatus;
}

interface GoalDecomposition {
  goalId: string;
  originalGoal: string;
  subtasks: Subtask[];
  strategy: DecompositionStrategy;
  estimatedDurationMs: number;
  estimatedCostUsd: number;
}

interface SubtaskResult {
  subtaskId: string;
  agent: string;
  success: boolean;
  output: string;
  durationMs: number;
  estimatedCostUsd: number;   // CTO F2: from durationMs + provider
  provider?: string;
  error?: string;
}

interface AggregatedResponse {
  text: string;
  format: "markdown" | "plain";
  agents: string[];
  totalDurationMs: number;
  totalCostUsd: number;
  subtaskResults: SubtaskResult[];
}

const DEFAULT_T2_CONFIG: MultiAgentConfig = {
  maxAgents: 4,
  maxParallelTracks: 3,
  timeoutMs: 30 * 60 * 1000,     // Gate B: 30 min
  costLimitUsd: 2.0,              // Gate B: $2.00
  perSubtaskTimeoutMs: 60_000,    // 60s per subtask
  defaultStrategy: "sequential",
};
```

---

## Test Plan (~55 tests)

### Types (5 tests)

| Test | Description |
|------|-------------|
| DEFAULT_T2_CONFIG alignment | Gate B: 30 min, $2.00 |
| DEFAULT_T2_CONFIG defaults | maxAgents, maxParallelTracks, strategy |
| GoalDecomposition creation | All required fields |
| DecompositionStrategy exhaustiveness | "sequential", "parallel", "mixed" |
| SubtaskResult success/failure | Both paths with optional fields |

### GoalDecomposer (11 tests)

| Test | Description |
|------|-------------|
| shouldDecompose — multi-agent patterns | "design and implement", "plan and build", "review and fix" |
| shouldDecompose — single-agent goals | "fix bug", "add button" |
| shouldDecompose — empty goal | Returns false |
| decompose — single agent passthrough | bug_fix → coder |
| decompose — explicit multi-agent | `["pm", "architect"]` from RouteResult |
| decompose — invalid agent filter (MF-1) | `["pm", "invalid", "coder"]` → only pm + coder |
| decompose — implicit "design and implement" | → architect + coder |
| decompose — implicit "plan and build" | → pm + coder |
| decompose — implicit "review and fix" | → reviewer + coder |
| dependency ordering | coder, pm, architect → sorted pm → architect → coder |
| budget trimming | $0.30 limit trims 6 agents to 2 |

### SessionRelay (10 tests)

| Test | Description |
|------|-------------|
| createRelay | Valid IDs, empty state |
| recordSubtaskResult — single | Updates context + handoff chain |
| recordSubtaskResult — accumulate | Multiple results build context |
| buildAgentContext — empty | Returns "" for no prior results |
| buildAgentContext — with prior | Includes agent output |
| buildAgentContext — 2K token cap | Truncates long context |
| buildAgentContext — ordering | Newest first for relevance |
| summarizeForHandoff — short | Full output returned |
| summarizeForHandoff — long | Truncated with "..." |
| getRelayStatus | Reflects completedCount, failedCount, totalCost |

### ResponseAggregator (8 tests)

| Test | Description |
|------|-------------|
| empty results | "No results available." |
| single success | Passthrough with markdown format |
| single failure | Error message |
| multi sequential | Both agents in output with header |
| metadata header | Stats (n/n completed, duration, cost) |
| partial failure | Successful sections + Errors section |
| all-failed | 0/n completed with error listing |
| truncation | Output exceeding maxLength truncated |

### MultiAgentDispatcher (12 tests)

| Test | Description |
|------|-------------|
| sequential — 2 agents | Execute in order, both succeed |
| sequential — context relay | Second call includes architect context |
| parallel — independent | Both execute, both succeed |
| parallel — Promise.allSettled (F4) | One fails, other still completes |
| mixed — dependency waves | Parallel first, then sequential dependent |
| budget — cost exceeded | Skip subtasks when over $2.00 |
| budget — all-fail | Graceful handling, Errors in output |
| timeout — per-subtask | 100ms timeout catches slow router |
| events — subtask lifecycle | start → complete → dispatch:complete |
| events — failure | subtask:failed emitted |
| cost estimation (F2) | estimatedCostUsd > 0 from durationMs + provider |
| single subtask | Handles trivial 1-subtask decomposition |

### Gateway Integration (7 tests)

| Test | Description |
|------|-------------|
| Multi-agent trigger — agents.length > 1 | Autonomy pipeline used |
| Multi-agent trigger — shouldDecompose | "design and implement" detected |
| Backward compat — single agent | Uses formatResponse, not aggregator |
| Backward compat — no autonomy modules | Works without GoalDecomposer |
| No route result | Returns usage hint |
| Command dispatch | /commands still work via CommandDispatcher |
| Single agent with autonomy wired | Still takes single-agent path |

---

## Results

| Metric | Value |
|--------|-------|
| New tests | 53 (`it()` blocks across 6 test files) |
| Total tests | 5,994 (5,994 passing + 10 skipped) |
| Regressions | 0 |
| Build | Clean (0 TS errors) |
| CTO Code Review | 9/10 APPROVED |

---

## Milestone

| Sprint | Capability |
|--------|-----------|
| 82-86 | Notification Bridge + Remote Shell + Permission Approval |
| 87-88 | Session Intelligence + Evaluator |
| 89-91 | Agent Teams (Files, Telegram, Monitoring) |
| 92 | Unified App Launcher (PID + lock + crash recovery) |
| 93 | Gateway-Centric Unified App (single `serve` command) |
| 94 | Canonical Types + Channel Policy Engine (abstraction layer) |
| **95** | **Progressive Autonomy T2 — Multi-Agent Routing (intelligence layer)** |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 96 | Cross-Session Context Transfer + Quality Gates |
| 97 | Progressive Trust T3 — 1-2 hour autonomous sessions |
