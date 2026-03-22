# ADR-034: Cross-System Agent Communication Protocol (EndiorBot ↔ MTClaw)

**Status**: ACCEPTED
**Date**: 2026-03-20
**Decision Makers**: @pm, @architect
**Reviewers**: CPO (APPROVED WITH CONDITIONS), CTO (8.5/10 APPROVED WITH CONDITIONS)
**Sprint**: 113

---

## Context

CEO yêu cầu: "agent của EndiorBot có thể nói chuyện được với agent của MTClaw".

**EndiorBot** (TypeScript): 13 AI agents, router dùng local Ollama `qwen3.5:9b`, invocation qua 4 paths (Claude Code Bridge → Cloud API → Remote Ollama → Regex fallback). Không phụ thuộc Claude Code — CC chỉ là lựa chọn ưu tiên.

**MTClaw** (Go): 16 AI agents, 70+ built-in tools, MCP server endpoint active tại `/mcp` (Sprint 50-59). Đã expose enterprise MCP tools: `agent_chat`, `agent_list`, `knowledge_search`, `platform_call` (Sprint 57-59).

Hai hệ thống hiện tại **không có protocol chung** để agent nói chuyện với nhau. Claude Code IDE kết nối MTClaw MCP qua `.mcp.json`, nhưng EndiorBot agents spawn process riêng — không inherit MCP config.

---

## Decision

### MCP-Only Protocol

Toàn bộ cross-system communication sử dụng **MCP (Model Context Protocol)** duy nhất — không REST client riêng.

**Tại sao:**
- MTClaw Sprint 57 đã expose `agent_chat` MCP tool — gọi bất kỳ agent nào qua MCP
- `agent_chat` + `knowledge_search` + `platform_call` = đủ cho agent delegation, RAG, và ERP access
- 1 protocol duy nhất = ít code hơn, dễ maintain hơn
- Raw `fetch()` JSON-RPC 2.0 — 0 new dependencies, thin-client invariant

### Routing Architecture (CTO C6)

MTClaw là **routing destination**, không phải fallback provider:

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
- `@mtclaw.researcher "tìm SOP"` → `agent_chat(researcher, ...)`
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
