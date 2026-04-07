# ADR-045: Code Knowledge Graph — MCP Client (Consumer)

**Status:** ACCEPTED
**Date:** 2026-04-06
**Sprint:** 130
**Authority:** CTO 8.5/10 APPROVED + CPO APPROVED
**SDLC Framework:** 6.3.0
**Traces:** ADR-044 (Agentic OS Alignment), ADR-083 (BFlow — Shared Graph Service), TS-007 (Code Search Layer)

---

## Context

EndiorBot, MTClaw, and SDLC Orchestrator are platforms used to develop OTHER applications (Bflow-Platform, NQH-POS, etc.). When CEO or dev team uses `@reviewer` or `@architect` to review a target repo, agents need structural codebase understanding — call graphs, impact radius, module communities.

[code-review-graph](https://github.com/tirth8205/code-review-graph) (4.9K stars, MIT, 22 MCP tools) provides this via Tree-sitter AST parsing + SQLite knowledge graphs.

**Key insight (CEO correction):** All 3 platforms analyze the SAME target repos. Per-platform graph builds = 3N duplicate work. Shared service = N builds, shared by all.

## Decision

**EndiorBot = MCP client (consumer).** AI-Platform hosts code-review-graph as a shared service. EndiorBot queries it when agents need code structure context.

### What EndiorBot Does

- Calls AI-Platform graph service MCP tools when `@reviewer`, `@architect`, `@coder`, `@tester` need impact analysis
- Injects graph context into agent envelope (500-token cap, optional)
- Fails soft when graph service unavailable — agents work without it (existing ripgrep/ast-grep search still works)

### What EndiorBot Does NOT Do

- Does NOT build graphs (AI-Platform does this)
- Does NOT host Tree-sitter or SQLite (no native deps)
- Does NOT replace existing code search (ripgrep P0, ast-grep P1 — graph is P2 supplement)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI-Platform (shared service)                       │
│  code-review-graph MCP Server                       │
│                                                     │
│  /data/graphs/bflow-platform.db    (SQLite per repo)│
│  /data/graphs/nqh-pos-platform.db                   │
│  /data/repos/bflow-platform/       (read-only mount)│
│                                                     │
│  Tools: get_impact_radius, get_architecture_overview│
│         detect_changes, semantic_search_nodes, ...   │
└────────────────────┬────────────────────────────────┘
                     │ streamable-http MCP
        ┌────────────┼────────────┐
        │            │            │
   MTClaw MCP    EndiorBot    SDLC Orch
   bridge        MCP client   (future)
   (@reviewer)   (CEO review)
```

## Integration Plan (Sprint 131, after AI-Platform Sprint 105-106)

### EndiorBot Changes (~2 days)

1. **MCP client for graph service** — reuse existing MCP bridge pattern from `src/mtclaw/`
2. **Context-builder enrichment** — optional `graphContext` in agent envelope (500-token cap)
3. **Fail-soft behavior** — graph unavailable → log warning, continue without graph context

### Files to Modify

| File | Change |
|------|--------|
| `src/bridge/intelligence/context-builder.ts` | Add optional graph context injection |
| `src/bridge/intelligence/envelope.ts` | Add `graphContext?: string` field |
| Config (`.env` or `.mcp.json`) | AI-Platform graph service endpoint |

### Graph-Aware Agents

| Agent | Graph Tools Used | Value |
|-------|------------------|-------|
| @reviewer | `get_impact_radius` | Only review affected files (6-49x token reduction) |
| @architect | `get_architecture_overview` | Auto-generated module map |
| @coder | `detect_changes` | Risk-scored change context |
| @tester | `get_affected_flows` | Which test flows are impacted |

Agents NOT using graph: @pm, @pjm, @ceo, @cpo, @cto, @cso, @assistant (advisory roles don't need code structure).

## Evaluation Gate (Sprint 132)

| Metric | Go | Kill |
|--------|----|----|
| Token reduction | >= 3x | < 3x → REMOVE |
| Review time | >= 20% faster | No improvement → flag |
| Defect detection | >= 10% more | Decrease → REMOVE |

CTO + CPO joint sign-off required.

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Native TypeScript port (Sprint 130-132 original plan) | 14-21 day effort, 8 native deps, EndiorBot is consumer not builder |
| Standalone Python MCP per platform (ADR-083 original) | CEO correction: 3 platforms same repos = 3N duplicate builds |
| Integrate into AI-Platform VeritasGraph | Domain mismatch: code AST ≠ business documents |

## Cross-References

- **TS-007:** Code Search Layer — graph is P2 provider, supplements ripgrep (P0) + ast-grep (P1)
- **ADR-083 (BFlow):** Shared graph service architecture + security policy + evaluation gate
- **ADR-044:** Agentic OS Alignment — pattern ownership matrix

## Consequences

### Positive
- Zero new dependencies in EndiorBot
- Shared graph = build once, query from all platforms
- Fail-soft: EndiorBot works perfectly without graph service

### Negative
- Depends on AI-Platform team delivering Sprint 105-106
- Network latency for graph queries (acceptable if < 2s)
- Limited to repos registered in AI-Platform

---

*EndiorBot | SDLC Framework 6.3.0 — ADR-045*
