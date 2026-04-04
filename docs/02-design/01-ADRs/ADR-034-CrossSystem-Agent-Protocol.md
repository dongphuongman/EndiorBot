# ADR-034: Cross-System Agent Communication Protocol (EndiorBot ↔ MTClaw)

**Status**: ACCEPTED
**Date**: 2026-03-20
**Decision Makers**: @pm, @architect
**Reviewers**: CPO (APPROVED WITH CONDITIONS), CTO (8.5/10 APPROVED WITH CONDITIONS)
**Sprint**: 113

---

## Context

CEO requirement: EndiorBot agents must be able to **talk to MTClaw agents**.

**EndiorBot** (TypeScript): 13 AI agents; router uses local Ollama `qwen3.5:9b`; invocation follows four paths (Claude Code Bridge → Cloud API → Remote Ollama → Regex fallback). Not hard-dependent on Claude Code — CC is the preferred path only.

**MTClaw** (Go): 16 AI agents, 70+ built-in tools, MCP server endpoint active at `/mcp` (Sprint 50–59). Enterprise MCP tools exposed: `agent_chat`, `agent_list`, `knowledge_search`, `platform_call` (Sprint 57–59).

The two systems had **no shared protocol** for agent-to-agent chat. Claude Code IDE connects to MTClaw MCP via `.mcp.json`, but EndiorBot agents spawn separate processes — they do not inherit MCP config.

---

## Decision

### MCP-Only Protocol

All cross-system communication uses **MCP (Model Context Protocol)** only — no separate REST client.

**Rationale:**
- MTClaw Sprint 57 exposed the `agent_chat` MCP tool — any agent can be called via MCP
- `agent_chat` + `knowledge_search` + `platform_call` cover delegation, RAG, and ERP access
- One protocol means less code and simpler maintenance
- Raw `fetch()` JSON-RPC 2.0 — zero new dependencies, thin-client invariant

### Routing Architecture (CTO C6)

MTClaw is a **routing destination**, not a fallback provider:

```
ChannelRouter.routeMessage(text)
  │
  ├─ parseMention(text)
  │    ├─ @coder → local agent → callAI()
  │    ├─ @mtclaw.researcher → cross-system → callMTClaw()
  │    └─ no @agent → routeViaOllama → callAI()
  │
  ├─ [local] callAI()
  │    ├─ Claude Code Bridge
  │    ├─ Cloud Fallback
  │    └─ Remote Ollama
  │
  └─ [cross-system] callMTClaw()
       └─ MTClawBridge → MCP → agent_chat/knowledge_search/...
```

### Mention Namespace

`@mtclaw.<agent>` syntax:
- `@mtclaw.researcher "find SOP"` → `agent_chat(researcher, ...)`
- `@mtclaw.datasource "SHOW DATABASES"` → `datasource_query(...)`
- `@mtclaw.knowledge "leave request"` → `knowledge_search(...)`
- `@coder "implement"` → local agent (unchanged)

Cross-system mentions return `agents: []` + `crossSystem` field → bypasses multi-agent decomposer.

### Auth (CTO C2)

- Token from `MTCLAW_API_KEY` env var, fallback to `.mcp.json` `Authorization` header
- Token never logged
- Tenant ID from `.mcp.json` `X-Tenant-ID` header

### Graceful Degradation

- Circuit breaker: reuse `src/budget/circuit-breaker.ts` (5 failures / 30s cooldown)
- MTClaw unavailable → local agents unaffected
- Errors → user-friendly messages, never stack traces

---

## Alternatives Considered

### Option A: REST-only (`POST /v1/chat`)

Rejected. Would duplicate tool discovery that MCP already solves. MTClaw's `agent_chat` tool makes REST delegation redundant.

### Option B: Hybrid (MCP for tools + REST for delegation)

Initially proposed, then rejected after MTClaw Sprint 57 review. `agent_chat` MCP tool handles agent delegation, eliminating REST client need (~400 lines saved).

### Option C: MCP SDK (`@modelcontextprotocol/sdk`)

Rejected. 3 JSON-RPC methods don't justify a dependency. Raw fetch maintains thin-client invariant.

---

## Consequences

### Positive

- EndiorBot agents can query MTClaw data (DWH, files, SOPs) from any invocation path
- EndiorBot agents can delegate tasks to MTClaw agents (researcher, sop, pm, etc.)
- Zero new dependencies
- Graceful degradation — local agents unaffected when MTClaw is down
- Clean namespace (`@mtclaw.*`) — no pollution of local agent roster

### Negative

- Network latency: +100-500ms per cross-system call
- Rate limit: MTClaw `agent_chat` limited to 10 calls/user/hour (may need increase)
- Unidirectional: MTClaw cannot call EndiorBot agents back (deferred)

### Neutral

- New `src/mtclaw/` module (~5 files, ~520 lines production code)
- 4 modified files (mention-parser, channel-router, ingress, serve)

---

## MTClaw Tools Available

| Tool | Type | Description |
|------|------|-------------|
| `read_file` | Data | Read file from MTClaw workspace |
| `list_files` | Data | List files |
| `search` | Data | Full-text search |
| `glob` | Data | Glob pattern matching |
| `datasource_query` | Data | Query ClickHouse/MySQL DWH |
| `agent_chat` | Agent | Invoke any MTClaw SOUL agent (sync, max 120s) |
| `agent_list` | Agent | Discover available agents |
| `knowledge_search` | Knowledge | Search SOPs/docs via RAG |
| `platform_call` | Integration | Proxy BFlow ERP (read-only) |

---

## CPO + CTO Review Conditions

| # | Source | Condition | Resolution |
|---|--------|-----------|------------|
| CPO C1 | Mention parsing | Cross-system detection in `parseAgentPart()` Step 2.5, returns `agents: []` |
| CPO C2 | DI unclear | Extend `ChannelRouterConfig` with optional `mtclawBridge` |
| CPO C3 | Decomposer bypass | `agents: []` + `crossSystem` field → skip multi-agent pipeline |
| CPO C4 | ADR collision | Use ADR-034 (not 033) |
| CPO C5 | Security | Token never logged, errors → user-friendly messages |
| CPO C6 | Response contract | `parseToolResult()` with 7 test cases |
| CTO C1 | ADR-034 | This document |
| CTO C2 | Token from env | `MTCLAW_API_KEY` env var with `.mcp.json` fallback |
| CTO C3 | Don't modify ingress | Minimal 6-line intercept needed (justified) |
| CTO C4 | exactOptionalPropertyTypes | Conditional assignment pattern |
| CTO C5 | Reuse circuit breaker | Import from `src/budget/circuit-breaker.ts` |
| CTO C6 | Routing destination | `callMTClaw()` separate from `callAI()` |

---

## References

- MTClaw ADR-027: MCP Bridge Integration
- MTClaw ADR-030: Enterprise Integration Auth Boundary
- EndiorBot ADR-021: Local Ollama Router
- EndiorBot ADR-017: Team Agent System
- MCP Specification: Streamable HTTP Transport (2025-03-26)
