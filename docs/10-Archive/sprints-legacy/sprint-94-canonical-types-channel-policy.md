---
spec_id: SPEC-04BUILD-SPRINT94
title: "Sprint 94: Canonical Types + Channel Policy Engine"
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

# Sprint 94: Canonical Types + Channel Policy Engine

**Date:** 2026-03-08
**Gate:** G-Sprint
**Authority:** Sprint 93 Deferred D1/D2/D4/D5 + ADR-024 + ADR-002
**Preceding sprint:** Sprint 93 (Gateway-Centric Unified Application)
**Est. effort:** ~35h
**Est. tests:** ~28

---

## Goal

Establish the **abstraction layer** between Sprint 93's unified infrastructure and Sprint 95-97's progressive autonomy. Deliver canonical message types portable to MTClaw/SDLC Orchestrator (ADR-002), a unified channel policy engine consolidating 4 scattered rate-limiting systems, complete script retirement, and enhanced health endpoints.

---

## Depends On

- Sprint 93 (Gateway-Centric Unified App) — GatewayIngress, CommandDispatcher, OTT adapters.
- Sprint 82-86 (Bridge + Commands) — /link, /approve handlers exist in telegram-poll.mjs.
- Sprint 76-80 (OTT commands) — Telegram/Zalo channel infrastructure.

---

## Scope

| In Scope | Out of Scope (deferred) |
|----------|------------------------|
| D1: Canonical types — `EndiorMessage`, `EndiorRequest`, `EndiorResponse` in `src/protocol/` | Full consumer migration (InboundMessage replacement) → Sprint 95 |
| D2: Channel Policy Engine — per-channel rate limits in `src/policy/` | Per-channel policy dashboard UI → Sprint 96+ |
| D4: Script retirement — redirect stubs + `/approve`, `/reject` migration + MF-1 bridge.ts fix | Multi-agent routing from web-gateway.mjs → Sprint 95 |
| D5: Health enhancement — OTT adapter + router status in HealthReport | Webhook-mode transition (polling → webhook) → separate sprint |
| Integration wiring — PolicyEngine in serve.ts + GatewayIngress (CTO F3: required) | PolicyEngine replacement of ApprovalQueue mechanics |

---

## Review Synthesis

**CTO 8.5/10 APPROVED + CPO APPROVED**

### CTO Findings — All Addressed

| # | Type | Issue | Resolution |
|---|------|-------|-----------|
| MF-1 | Must-Fix | `bridge.ts` forks scripts that D4 stubs → launcher breaks | Patch bridge.ts to detect stub/serve mode; skip script spawn |
| F1 | Finding | `receivedAt: Date` vs ISO string convention | Use `string` (ISO 8601) for all timestamps in canonical types |
| F2 | Finding | `/approve` needs `executeApprovedRun()` integration | Carry structured details (cmd, repoPath, repo) in approval flow |
| F3 | Finding | Policy integration marked optional | Move Steps 14-15 to **required** scope |
| F4 | Finding | Message ID generation unspecified | Use `${channel}-${vendorId}` format; nanoid() fallback |

### CPO Conditions (advisory)

| # | Condition | Status |
|---|-----------|--------|
| CA1 | Script stub stderr + exit(1) with clear message | Addressed |
| CA2 | PolicyEngine testable independently if wiring deferred | Addressed (F3: wiring is required) |
| CA3 | /approve, /reject must call ApprovalQueue/executeApprovedRun | Addressed (F2) |

---

## Architecture

### D1: Canonical Types — `src/protocol/`

Three canonical types replacing 5 scattered message types:

```typescript
type ChannelSource = "telegram" | "zalo" | "web" | "webhook" | "cli" | "desktop";

interface EndiorMessage {
  id: string;           // F4: "${channel}-${vendorId}" or nanoid()
  channel: ChannelSource;
  senderId: string;
  content: string;
  receivedAt: string;   // F1: ISO 8601 string
  replyToId?: string;
  senderName?: string;
  vendorMeta?: Record<string, unknown>;
}

interface EndiorRequest {
  message: EndiorMessage;
  sanitized: boolean;
  policyAllowed: boolean;
  actorId?: string;
  violations: string[];
  policyDenialReason?: string;
  processedAt: string;  // F1: ISO 8601
}

interface EndiorResponse {
  text: string;
  format?: "markdown" | "plain" | "html";
  replyMarkup?: unknown;
  meta?: { agent?: string; provider?: string; durationMs?: number; };
}
```

Converters in `src/protocol/converters.ts` bridge old ↔ new. Existing types NOT removed.

### D2: Channel Policy Engine — `src/policy/`

Wraps and coordinates 4 existing rate-limiting systems:

| Channel | msgs/min | cmds/min | maxLen | Sanitize |
|---------|----------|----------|--------|----------|
| telegram | 30 | 20 | 4096 | yes |
| zalo | 20 | 15 | 2000 | yes |
| web | 60 | 30 | 10000 | yes |
| cli/desktop | 120 | 60 | 50000 | no |

### D4: Script Retirement + MF-1 Fix

Scripts → redirect stubs. `/approve` + `/reject` migrate to CommandDispatcher with `executeApprovedRun()` integration (F2). Bridge.ts launcher patched to detect stub mode (MF-1).

### D5: Health Enhancement

Both HTTP `/api/health` and WebSocket `system.health` return unified `HealthReport` with `ottAdapters[]` and `channelRouter` status.

---

## Key Deliverables

### New Files (8)

| # | File | Description |
|---|------|-------------|
| 1 | `src/protocol/types.ts` | EndiorMessage, EndiorRequest, EndiorResponse, ChannelSource |
| 2 | `src/protocol/converters.ts` | fromInboundMessage(), fromOTTMessage(), toInboundMessage(), toInboundResponse() |
| 3 | `src/protocol/validators.ts` | isValidEndiorMessage(), isValidChannelSource(), validateMessageContent() |
| 4 | `src/protocol/index.ts` | Barrel export |
| 5 | `src/policy/types.ts` | ChannelPolicy, PolicyScope, PolicyCheckResult |
| 6 | `src/policy/channel-policy-engine.ts` | ChannelPolicyEngine class |
| 7 | `src/policy/defaults.ts` | DEFAULT_CHANNEL_POLICIES per channel |
| 8 | `src/policy/index.ts` | Barrel export + factory |

### Modified Files (7)

| # | File | Changes |
|---|------|---------|
| 9 | `src/commands/index.ts` | Register /approve and /reject with executeApprovedRun (F2) |
| 10 | `src/monitoring/metrics.ts` | Extend collectHealthReport() with OTT + router health |
| 11 | `src/gateway/web-server.ts` | Update serveHealth() to return full HealthReport |
| 12 | `src/cli/commands/serve.ts` | Add ChannelPolicyEngine to startup + inject into Ingress (F3) |
| 13 | `src/gateway/ingress.ts` | Accept optional ChannelPolicyEngine (F3) |
| 14 | `scripts/telegram-poll.mjs` | Replace with redirect stub |
| 15 | `scripts/web-gateway.mjs` | Replace with redirect stub |

### MF-1 Fix

| # | File | Changes |
|---|------|---------|
| 16 | Bridge launcher file | Detect stub scripts or ENDIORBOT_SERVE_MODE; skip spawn + print migration |

---

## Test Plan (~28 tests)

### Canonical Types (11 tests)

| Test | Description |
|------|-------------|
| EndiorMessage creation | All required fields (id, channel, senderId, content, receivedAt) |
| EndiorMessage optional fields | replyToId, senderName, vendorMeta |
| isValidEndiorMessage — valid | Returns true for valid message |
| isValidEndiorMessage — invalid | Returns false for missing fields |
| isValidChannelSource | Validates known channels, rejects unknown |
| fromInboundMessage | Maps InboundMessage → EndiorMessage (F4: id format) |
| fromOTTMessage | Maps OTTMessage (source → channel) |
| fromIncomingMessage | Maps IncomingMessage with channel param |
| toInboundMessage | Reverse conversion preserves fields |
| toInboundResponse | Maps EndiorResponse → InboundResponse |
| Round-trip | from → to preserves data |

### Channel Policy Engine (8 tests)

| Test | Description |
|------|-------------|
| check — under limit | Allows message within rate limit |
| check — over limit | Denies with reason |
| Telegram policy | 30 msgs/min enforced |
| Zalo policy | 20 msgs/min enforced (stricter) |
| Web policy | 60 msgs/min enforced |
| overridePolicy | Temporarily adjusts limits |
| resetLimits | Clears tracking for sender |
| getStats | Per-channel statistics |

### Script Retirement (6 tests)

| Test | Description |
|------|-------------|
| /approve — valid pending | Marks approved + calls executeApprovedRun (F2) |
| /approve — non-existent | Returns error |
| /approve — already resolved | Returns "already resolved" |
| /reject — valid pending | Marks rejected |
| /reject — no ID arg | Returns usage message |
| /reject — expired | Returns "already resolved" |

### Health Enhancement (3 tests)

| Test | Description |
|------|-------------|
| getOttAdapterMetrics | Returns adapter status array |
| getChannelRouterMetrics | Returns router readiness |
| collectHealthReport — enhanced | Includes ottAdapters + channelRouter |

---

## Milestone

| Sprint | Capability |
|--------|-----------|
| 82-86 | Notification Bridge + Remote Shell + Permission Approval |
| 87-88 | Session Intelligence + Evaluator |
| 89-91 | Agent Teams (Files, Telegram, Monitoring) |
| 92 | Unified App Launcher (PID + lock + crash recovery) |
| 93 | Gateway-Centric Unified App (single `serve` command) |
| **94** | **Canonical Types + Channel Policy Engine (abstraction layer)** |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 95 | Progressive Autonomy T2 — multi-agent routing, Goal Decomposer, Session Relay (30 min) |
| 96 | Cross-Session Context Transfer + Quality Gates |
| 97 | Progressive Trust + Parallel subtasks (T3: 1-2 hours) |
