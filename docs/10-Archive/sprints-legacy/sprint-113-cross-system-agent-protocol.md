# Sprint 113: Cross-System Agent Communication (EndiorBot ↔ MTClaw)

**Sprint Duration**: March 20, 2026
**Sprint Goal**: Enable EndiorBot agents to communicate with MTClaw agents via MCP protocol. `@mtclaw.*` mentions route through native MCP client to MTClaw's enterprise gateway.
**Status**: ✅ COMPLETE
**Priority**: P0
**Framework**: SDLC 6.3.0
**Authority**: CPO APPROVED WITH CONDITIONS + CTO 8.5/10 APPROVED WITH CONDITIONS
**Previous Sprint**: Sprint 112 ✅ COMPLETE — SDLC 6.3.0 Alignment
**ADR**: ADR-034-CrossSystem-Agent-Protocol

---

## Background

CEO requirement: EndiorBot agents must be able to **talk to MTClaw agents**.

MTClaw (Go) is production-ready (Sprint 50–59):
- MCP server `/mcp` active with Bearer token + `X-Tenant-ID` auth
- `agent_chat` tool: call any SOUL agent (sync, max 120s)
- `knowledge_search` tool: RAG search over SOPs/docs
- `platform_call` tool: BFlow ERP proxy (read-only)
- Per-user API keys + scopes (Sprint 57)

EndiorBot agents spawn separate processes (CC, Ollama, Cloud API) — they do not inherit `.mcp.json`. A native MCP client is required in the agent pipeline.

**Decision**: MCP-only protocol — `agent_chat` replaces a bespoke REST client.

---

## Sprint 113 Deliverables

### T1: Types & Config (`src/mtclaw/types.ts`, `src/mtclaw/config.ts`)

| Item | Detail |
|------|--------|
| `MTClawConfig` | URL, authToken (env → fallback .mcp.json), tenantId, timeoutMs |
| `CrossSystemRoute` | `{ system: "mtclaw", agent: string, task: string }` |
| `McpToolResult` | `{ content: Array<{type, text}>, isError? }` |
| Config loader | Read `.mcp.json` + `MTCLAW_API_KEY` env var (CTO C2) |
| Security | Token never logged (CPO C5) |

### T2: MCP Client (`src/mtclaw/mcp-client.ts`)

Raw `fetch()` JSON-RPC 2.0 over Streamable-HTTP. 0 new dependencies.

| Method | Purpose |
|--------|---------|
| `initialize()` | MCP handshake → session ID |
| `listTools()` | Discover tools (cached 5min TTL) |
| `callTool(name, args)` | Execute MCP tool |
| `ping()` | Health check |
| `parseToolResult()` | Response → string mapper (CPO C6) |

### T3: Bridge Facade (`src/mtclaw/bridge.ts`)

Wraps McpClient + reuses `CircuitBreaker` from `src/budget/circuit-breaker.ts` (CTO C5).

| Method | MCP Tool |
|--------|----------|
| `chatWithAgent(agent, message)` | `agent_chat` |
| `listAgents()` | `agent_list` |
| `searchKnowledge(query)` | `knowledge_search` |
| `callTool(name, args)` | Any MCP tool |
| `isAvailable()` | Circuit breaker check |

### T4: Cross-System Mention Parsing

**Modify:** `src/agents/orchestrator/mention-parser.ts`

Add Step 2.5 in `parseAgentPart()` (between team detection and unknown warning):
- `@mtclaw.<agent>` → returns `agents: []` + `crossSystem` field
- Bypasses multi-agent decomposer (CPO C1/C3)
- `exactOptionalPropertyTypes` pattern (CTO C4)

Also update `parseOTTMention()` for `[@mtclaw.researcher: task]` format.

### T5: ChannelRouter Wiring

**Modify:** `src/agents/channel-router.ts`

- Extend `ChannelRouterConfig` with optional `mtclawBridge` (CPO C2)
- Extend `RouteResult` with optional `crossSystem`
- New `callMTClaw(route)` method — routing destination, not fallback (CTO C6)
- `routeMessage()` propagates crossSystem from parseMention

### T6: Ingress Cross-System Intercept

**Modify:** `src/gateway/ingress.ts` (+8 lines)

Intercept cross-system route **before** multi-agent decomposer and single-agent `callAI()`:
- `routeResult.crossSystem` → `router.callMTClaw()` → return directly
- Prevents `agents[0] ?? "assistant"` misroute for cross-system
- Justified deviation from CTO C3 (see ADR-034)

### T7: Startup Wiring

**Modify:** `src/cli/commands/serve.ts`

- Init `MTClawBridge` before `createChannelRouter()`
- Pass via `ChannelRouterConfig.mtclawBridge`
- Graceful: `.mcp.json` missing → bridge disabled, no crash
- Add to shutdown components[]

### T8: Tests (3 files)

| Test File | Coverage |
|-----------|----------|
| `tests/mtclaw/mcp-client.test.ts` | Handshake, list/call tools, response parsing (7 cases), timeout, session |
| `tests/mtclaw/bridge.test.ts` | chatWithAgent, searchKnowledge, degradation, no-leak |
| `tests/mtclaw/mention-cross-system.test.ts` | @mtclaw.* parsing, decomposer bypass, OTT format, edge cases |

All tests mock HTTP — no real MTClaw dependency.

---

## Files Modified

| Action | File | Est. Lines |
|--------|------|-----------|
| CREATE | `src/mtclaw/types.ts` | ~100 |
| CREATE | `src/mtclaw/config.ts` | ~50 |
| CREATE | `src/mtclaw/mcp-client.ts` | ~220 |
| CREATE | `src/mtclaw/bridge.ts` | ~130 |
| CREATE | `src/mtclaw/index.ts` | ~10 |
| MODIFY | `src/agents/orchestrator/mention-parser.ts` | +25 |
| MODIFY | `src/agents/channel-router.ts` | +40 |
| MODIFY | `src/gateway/ingress.ts` | +8 |
| MODIFY | `src/cli/commands/serve.ts` | +15 |
| CREATE | `tests/mtclaw/mcp-client.test.ts` | ~200 |
| CREATE | `tests/mtclaw/bridge.test.ts` | ~150 |
| CREATE | `tests/mtclaw/mention-cross-system.test.ts` | ~120 |
| CREATE | `docs/02-design/01-ADRs/ADR-034-CrossSystem-Agent-Protocol.md` | ~100 |

**Total:** 8 new + 4 modified = 12 files, ~1,168 lines.

---

## MTClaw Team Coordination

| # | Item | Priority | Type |
|---|------|----------|------|
| 1 | Confirm `agent_chat` accepts external MCP client calls | P1 | Verification |
| 2 | Provide API key with scope `enterprise-agent` | P1 | Config |
| 3 | Add `X-Correlation-ID` header propagation | P2 | Enhancement |
| 4 | Document `agent_chat` timeout behavior | P2 | Documentation |

---

## Acceptance Criteria

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test tests/mtclaw/` — all pass (mock HTTP)
- [ ] `pnpm test` — no regressions
- [ ] Manual: `@mtclaw.datasource "SHOW DATABASES"` → database list via web
- [ ] Manual: `@mtclaw.researcher "find SOP"` → MTClaw researcher responds
- [ ] Degradation: MTClaw down → local agents unaffected

---

## CPO + CTO Condition Tracker

| # | Source | Condition | Status |
|---|--------|-----------|--------|
| CPO C1 | Mention parsing | ✅ T4: cross-system Step 2.5 |
| CPO C2 | DI unclear | ✅ T5: ChannelRouterConfig.mtclawBridge |
| CPO C3 | Decomposer bypass | ✅ T4: agents:[] + T6: intercept |
| CPO C4 | ADR collision | ✅ ADR-034 |
| CPO C5 | Security | ✅ T1: token never logged |
| CPO C6 | Response contract | ✅ T2: parseToolResult() + 7 tests |
| CTO C1 | ADR-034 | ✅ ADR-034 |
| CTO C2 | Token from env | ✅ T1: MTCLAW_API_KEY env |
| CTO C3 | Don't modify ingress | ⚠️ T6: 8 lines justified |
| CTO C4 | exactOptionalPropertyTypes | ✅ T4: conditional assignment |
| CTO C5 | Reuse circuit breaker | ✅ T3: src/budget/circuit-breaker.ts |
| CTO C6 | Routing destination | ✅ T5: callMTClaw() separate |
