# Sprint 44 Detailed Plan - Gateway + Desktop Integration

**Version**: 2.1.0 (Research Integration)
**Date**: 2026-02-23
**Status**: APPROVED - Ready to Start
**Authority**: PM + CTO (Research Integration — Claude Cowork Syllabus Findings)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 43 Complete (Desktop Foundation validated)
**SDLC**: Framework 6.1.1

> **Note**: Originally Sprint 43 (Gateway + Desktop Integration). Shifted to Sprint 44 per CEO-approved Option A resequence (2026-02-23).

---

## Executive Summary

Sprint 44 implements **Gateway + Desktop Integration** — WebSocket gateway server connecting Desktop UI to EndiorBot core in real-time.

### Vision: Real-Time Desktop

```
Sprint 43:  Desktop → IPC (direct) → Core (poll/on-load)
Sprint 44:  Desktop → WebSocket Gateway → Core (push events)
```

Benefits:
- Real-time budget updates in UI
- Live approval queue (approve/reject from desktop)
- Checkpoint events stream to UI
- Telegram + Desktop notifications in parallel (CEO chooses)

---

## Sprint Goal

**Implement WebSocket gateway server (port 18790) with JSON-RPC protocol; connect Desktop to gateway for real-time session, budget, approval, and checkpoint events.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 43** | Desktop Foundation validated | PLANNED | Sprint 44 start |
| **Port 18790** | Configurable (default 18790) | DESIGN | config.json / env |

---

## Sprint 44 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Gateway Server | server.ts, protocol, methods, auth |
| **Week 2** | Desktop Real-Time Integration | WebSocket client, live UI updates, parallel notifications |

**Duration**: 10 working days (2 weeks from Sprint 43 close)

---

## Week 1: Gateway Server (Day 1-5)

### Day 1-2: WebSocket Server + Protocol

**Goal**: WebSocket server listening on port 18790; JSON-RPC 2.0 schema.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/gateway/server.ts | P0 | WebSocket server (ws or uWebSockets.js) | ~200 |
| Config: port from ~/.endiorbot/config.json or env GATEWAY_PORT | P0 | gateway-config.ts | ~60 |
| Create src/gateway/protocol/schema.ts | P0 | JSON-RPC 2.0 request/response types | ~120 |
| Create src/gateway/protocol/errors.ts | P0 | -32700, -32601, -32602, -32603 | ~60 |
| Connection lifecycle: connect, ping/pong, disconnect | P0 | server.ts | ~80 |
| Create tests/gateway/server.test.ts | P1 | Connect, send invalid JSON | ~150 |

**Acceptance Criteria**:
- [ ] Gateway starts on configurable port (default 18790)
- [ ] Client can connect via WebSocket
- [ ] Messages follow JSON-RPC 2.0 (id, method, params / result / error)
- [ ] Build passes

---

### Day 3: Gateway Methods

**Goal**: Implement server methods callable via JSON-RPC.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/gateway/methods/sessions.ts | P0 | sessions.list, sessions.get, sessions.status | ~150 |
| Create src/gateway/methods/agents.ts | P0 | agents.status | ~80 |
| Create src/gateway/methods/budget.ts | P0 | budget.get (BudgetTracker state) | ~80 |
| Create src/gateway/methods/checkpoints.ts | P0 | checkpoints.list, checkpoints.get | ~120 |
| Create src/gateway/methods/approval.ts | P0 | approval.list, approval.approve, approval.reject | ~120 |
| Router: dispatch by method name to handler | P0 | router.ts | ~100 |
| Create tests/gateway/methods/*.test.ts | P1 | Unit tests with mocks | ~200 |

**Acceptance Criteria**:
- [ ] sessions.list, sessions.get, sessions.status return expected shape
- [ ] budget.get returns current budget state
- [ ] checkpoints.list, checkpoints.get work
- [ ] approval.list, approve, reject wire to ApprovalQueue
- [ ] Build passes

---

### Day 4: Authentication

**Goal**: Local-only or token-based auth.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Localhost-only mode: accept connections from 127.0.0.1 only | P0 | server.ts (check socket.remoteAddress) | ~40 |
| Optional: token in query or header; validate against config | P1 | auth.ts, config gateway.token | ~80 |
| Reject unauthorized with JSON-RPC error | P0 | -32001 Unauthorized | ~20 |
| Document auth in docs/04-build/gateway.md | P1 | doc | ~60 |

**Acceptance Criteria**:
- [ ] By default, only localhost can connect
- [ ] If token configured, client must send valid token
- [ ] Unauthorized returns error, connection closed
- [ ] Build passes

---

### Day 5: Server Events (Push)

**Goal**: Server can push events to connected clients.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Define event types: budget.updated, approval.pending, checkpoint.created, session.updated | P0 | protocol/events.ts | ~80 |
| Subscribe/unsubscribe or broadcast to all clients | P0 | server broadcast on event | ~100 |
| Wire BudgetTracker events → gateway broadcast | P0 | gateway subscribes to tracker | ~60 |
| Wire ApprovalQueue events → gateway broadcast | P0 | Same | ~60 |
| Wire CheckpointManager events → gateway broadcast | P0 | Same | ~60 |
| Create tests/gateway/events.test.ts | P1 | Mock events, assert client receives | ~120 |

**Acceptance Criteria**:
- [ ] When budget changes, connected clients receive budget.updated
- [ ] When approval pending, clients receive approval.pending
- [ ] When checkpoint created, clients receive checkpoint.created
- [ ] Build passes

---

## Week 2: Desktop Real-Time Integration (Day 6-10)

### Day 6-7: Desktop WebSocket Client

**Goal**: Desktop renderer connects to gateway; reconnection logic.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/gateway-client.ts | P0 | WebSocket connect, send JSON-RPC, handle response/events | ~250 |
| Config: gateway URL (ws://127.0.0.1:18790) from main or env | P0 | Pass from main via IPC or env | ~40 |
| Reconnect on disconnect (exponential backoff) | P0 | gateway-client.ts | ~80 |
| Expose gateway client to React (context or store) | P0 | GatewayContext or useGatewayStore | ~100 |
| Replace IPC poll with gateway calls where real-time needed | P0 | Pages use gateway client | ~150 |
| Keep IPC fallback when gateway not running | P1 | Desktop works without gateway | ~80 |

**Acceptance Criteria**:
- [ ] Desktop connects to gateway when available
- [ ] RPC calls (sessions.list, budget.get, etc.) work via gateway
- [ ] When gateway down, fallback to IPC (or show "Gateway disconnected")
- [ ] Build passes

---

### Day 8: Live UI Updates

**Goal**: Dashboard and approval queue update in real time.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| On budget.updated: refresh budget bar in Dashboard | P0 | Dashboard subscribes to event | ~80 |
| On approval.pending: refresh approval list; show toast | P0 | Approval component | ~80 |
| On checkpoint.created: append to Checkpoint viewer list | P0 | Checkpoints page | ~60 |
| On session.updated: refresh session status | P0 | Dashboard | ~40 |
| Loading states and "Gateway disconnected" banner | P0 | Shared component | ~60 |

**Acceptance Criteria**:
- [ ] Changing budget in CLI/core reflects in Desktop within 1–2s
- [ ] New approval appears in Desktop without refresh
- [ ] New checkpoint appears in list
- [ ] Build passes

---

### Day 9: Telegram + Desktop Notifications + SKILL.md Audit

**Goal**: CEO can receive alerts on both Telegram and Desktop; SKILL.md audit (research quick win).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add DesktopChannel: push to gateway broadcast (alert event) | P0 | src/channels/desktop/desktop-channel.ts | ~100 |
| Register DesktopChannel when gateway server is running | P0 | NotificationSystem + gateway | ~60 |
| Desktop UI: show notification toast when alert received | P0 | renderer/components/NotificationToast.tsx | ~80 |
| Config: enable Telegram and/or Desktop in ~/.endiorbot/config.json | P1 | channels.telegram, channels.desktop | ~40 |
| Document: channels config | P1 | docs/04-build/gateway.md | ~40 |
| **SKILL.md Audit** (Research P0) | P0 | Audit existing skill files | ~50 |

**SKILL.md Audit Checklist** (from Research):
- [ ] All SKILL.md files < 200 lines
- [ ] description has trigger keywords ("Use when user mentions...")
- [ ] Progressive Disclosure: detail → references/ folder
- [ ] No magic numbers in scripts
- [ ] Test skill loading with Haiku, Sonnet, Opus

**Acceptance Criteria**:
- [ ] Escalation alert sends to both Telegram (if configured) and Desktop (if connected)
- [ ] Desktop shows toast for budget/approval/gate alerts
- [ ] CEO can choose which channels to enable
- [ ] SKILL.md audit complete with findings documented
- [ ] Build passes

---

### Day 10: Routing Confidence + Integration + G-Sprint-44

**Goal**: Add Routing Confidence Score (research P1); E2E and gate validation.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| **Routing Confidence Score** (Research P1) | P1 | src/agents/routing/confidence.ts | ~100 |
| Wire ConfidenceRouter to QueryClassifier | P1 | Integration with existing router | ~50 |
| E2E: start gateway, start desktop, trigger budget update → UI updates | P0 | Manual or E2E script | — |
| E2E: approval from desktop (approve/reject) → ApprovalQueue updated | P0 | Manual or E2E | — |
| CLI flag or subcommand: `endiorbot gateway` | P0 | bin or src/cli | ~60 |
| G-Sprint-44 checklist | P0 | All criteria below | — |

**Routing Confidence Interface** (from Research):
```typescript
// src/agents/routing/confidence.ts
export interface RoutingDecision {
  model: ModelType;
  confidence: number;      // 0.0 - 1.0
  reason: string;
  escalateIfBelow: number; // Default 0.7 - HITL threshold
}

export class ConfidenceRouter {
  route(query: string): RoutingDecision;
  shouldEscalate(decision: RoutingDecision): boolean;
}
```

**Acceptance Criteria**:
- [ ] ConfidenceRouter returns confidence score with routing decision
- [ ] HITL escalation triggers when confidence < 0.7
- [ ] `endiorbot gateway` starts WebSocket server
- [ ] Desktop connects and receives real-time updates
- [ ] Approve/reject from Desktop updates queue
- [ ] Build and lint pass

---

## Files Created (Sprint 44)

| File / Dir | Est. LOC | Purpose |
|------------|----------|---------|
| src/gateway/server.ts | ~280 | WebSocket server, router, broadcast |
| src/gateway/protocol/schema.ts | ~120 | JSON-RPC types |
| src/gateway/protocol/errors.ts | ~60 | RPC errors |
| src/gateway/protocol/events.ts | ~80 | Event payloads |
| src/gateway/methods/sessions.ts | ~150 | Session methods |
| src/gateway/methods/agents.ts | ~80 | Agent methods |
| src/gateway/methods/budget.ts | ~80 | Budget method |
| src/gateway/methods/checkpoints.ts | ~120 | Checkpoint methods |
| src/gateway/methods/approval.ts | ~120 | Approval methods |
| src/gateway/auth.ts | ~100 | Token/localhost auth |
| src/gateway/config.ts | ~60 | Port, token config |
| src/channels/desktop/desktop-channel.ts | ~100 | Desktop notification channel |
| src/desktop/renderer/gateway-client.ts | ~330 | WebSocket client |
| src/desktop/renderer/components/NotificationToast.tsx | ~80 | Alert toasts |
| tests/gateway/*.test.ts | ~470 | Gateway tests |
| docs/04-build/gateway.md | ~100 | Gateway + auth doc |
| **src/agents/routing/confidence.ts** | **~100** | **Routing Confidence Score (Research)** |
| **docs/02-design/research/skill-audit.md** | **~50** | **SKILL.md Audit Report (Research)** |
| **Total** | **~2,700** | |

---

## Success Criteria (Sprint 44)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Gateway listens on 18790 | 100% | Manual / test |
| Desktop connects to gateway | 100% | Manual |
| Real-time budget/approval/checkpoint | 100% | Manual |
| Approve/reject from Desktop | 100% | Manual |
| Telegram + Desktop alerts in parallel | 100% | Manual |
| **SKILL.md Audit complete** | 100% | Audit report |
| **Routing Confidence integrated** | 100% | Unit tests |
| Build + lint | Pass | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 43 complete | PLANNED | Desktop Foundation |
| SessionManager, BudgetTracker, ApprovalQueue, CheckpointManager | ✅ | Prior sprints |
| NotificationSystem (Sprint 38) | ✅ | Multi-channel |
| WebSocket library (ws) | ⚠️ | Add dependency |

---

## Next Sprint Preview (Sprint 45)

**Sprint Goal**: Brain Architecture

**Key Deliverables**:
- Brain storage ~/.endiorbot/brain/
- Layers: events, patterns, structures, mental-models
- CEO profile, evolution/versioning
- CLI: `endiorbot brain status`, `brain export`

**Prerequisite**: Sprint 44 PASS (Gateway + Desktop validated)

---

## Approval Checklist (G-Sprint-44)

- [ ] WebSocket gateway server runs on configurable port (default 18790)
- [ ] JSON-RPC methods: sessions, agents, budget, checkpoints, approval
- [ ] Auth: localhost-only or token
- [ ] Server pushes events: budget.updated, approval.pending, checkpoint.created
- [ ] Desktop connects via WebSocket; real-time UI updates
- [ ] Approve/reject from Desktop works
- [ ] Telegram + Desktop notifications in parallel
- [ ] **SKILL.md Audit complete** (Research P0)
- [ ] **Routing Confidence Score integrated** (Research P1)
- [ ] Build and lint pass
- [ ] docs/04-build/gateway.md updated

---

**Last Updated**: 2026-02-23
**Sprint Status**: DRAFT — Option A Resequence (shifted from Sprint 43)
**Blocking**: Sprint 43 close

---

*Sprint 44 Plan - Gateway + Desktop Integration*
*EndiorBot - Real-Time Desktop*
*SDLC Framework 6.1.1*
