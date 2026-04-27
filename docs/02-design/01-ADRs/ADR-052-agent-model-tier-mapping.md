---
status: ACCEPTED
authority:
  proposer: "@pm"
  countersigners:
    - actor: "@architect"
      date: "2026-04-23"
      grade: ""
      reference: "ceo-directive-2026-04-23"
  trigger: "CEO requires Kimi2.6 as primary for most agents, reserving Claude Opus for critical tasks, and leveraging free AI-Platform for non-coding work"
  notes: "Agent-centric tier mapping selected for maintainability and clear cost accountability per agent."
---

# ADR-052: Agent-Model Tier Mapping Strategy

## Status
Proposed (awaiting G2 approval)

## Context

Kimi k2.6 has demonstrated quality comparable to Claude Sonnet (and near-Opus for coding tasks) at significantly lower cost. CEO's AI-Platform (Ollama) provides free inference for non-critical workloads.

The current architecture assigns **Claude Code Bridge** as the primary provider for **all 14 agents**, with a uniform fallback chain. This is cost-inefficient because:
- `@coder`, `@reviewer`, `@tester` spend most tokens on coding tasks where Kimi k2.6 is equally capable.
- `@assistant` only routes messages — Ollama is sufficient.
- Only `@architect`, `@cso`, and `@ceo` truly require Opus-level reasoning.

## Decision

We will implement a **three-tier agent-model mapping** where each agent has a **designated primary provider** based on its typical workload complexity:

### Tier 1 — Claude Opus (Critical Reasoning)
Reserved for tasks where reasoning depth cannot be compromised.

| Agent | Primary | Rationale |
|-------|---------|-----------|
| `@architect` | Claude Opus | ADR writing, system design, G2 gate |
| `@cso` | Claude Opus | Security review, threat modeling, ASVS L2 |
| `@ceo` | Claude Opus | Strategic decisions, Go/No-Go |

### Tier 2 — Kimi k2.6 (Primary Workhorse)
The default for most agents. Kimi's 256K context and coding strength match Sonnet at lower cost.

| Agent | Primary | Rationale |
|-------|---------|-----------|
| `@coder` | Kimi k2.6 | Code generation, TDD, implementation |
| `@reviewer` | Kimi k2.6 | Code review, blast-radius analysis |
| `@tester` | Kimi k2.6 | Test plans, E2E, coverage |
| `@pm` | Kimi k2.6 | PRDs, requirements, backlog |
| `@cpo` | Kimi k2.6 | Product-market fit, validation |
| `@cto` | Kimi k2.6 | Architecture oversight (advisory) |
| `@fullstack` | Kimi k2.6 | Solo loop, all stages |
| `@pjm` | Kimi k2.6 | Sprint planning, velocity |
| `@researcher` | Kimi k2.6 | Evidence gathering, analysis |
| `@devops` | Kimi k2.6 | Deploy scripts, runbooks |

### Tier 3 — AI-Platform / Ollama (Free Tier)
For lightweight, non-coding tasks where quality tolerance is highest.

| Agent | Primary | Rationale |
|-------|---------|-----------|
| `@assistant` | Ollama qwen3.5:9b | Routing, delegation tracking |

### Fallback Chain per Tier

```
Tier 1 (Opus):   claude-code → kimi → ollama
Tier 2 (Kimi):   kimi → claude-code → ollama
Tier 3 (Ollama): ollama → kimi → claude-code
```

## Consequences

### Positive
- **Estimated 45–60% cost reduction**: Majority of agents move from Claude subscription to Kimi/Ollama.
- **Clear accountability**: Each agent's cost is tied to its tier — easy to audit.
- **CEO preference preserved**: CEO still uses Claude Code as primary interface.
- **Scalable**: New agents slot into the tier system without architecture changes.

### Negative
- **Provider heterogeneity**: Debugging spans 3 provider backends instead of 1.
- **Ollama quality gap**: Tier-3 agents may produce lower-quality output; fallback to Kimi mitigates this.
- **Kimi rate limits**: Tier-2 agents may hit proxy rate limits; `kimi-api` (API key) is immediate fallback.

## Implementation

| Component | Change |
|-----------|--------|
| `src/agents/router/agent-constants.ts` | `AGENT_PROVIDER_MODEL_MAP` + `TIER_FALLBACK_CHAIN` |
| `src/agents/router/providers.ts` | `dispatchAgentPrimary()` + `dispatchAgentFallback()` + `callKimiProvider()` |
| `src/agents/channel-router.ts` | `callAI()` uses agent-aware dispatch |
| `src/agents/orchestrator/task-classifier.ts` | `recommendModel()` returns provider-aware recommendations |
| `src/budget/pricing-registry.ts` | Kimi + Ollama pricing entries |
| `docs/reference/templates/souls/SOUL-*.md` | Update `## Model Fallback Policy` per tier |
