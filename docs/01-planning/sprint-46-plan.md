# Sprint 46 Detailed Plan - Full OTT Ecosystem + GitHub Models Provider

**Version**: 3.0.0 (CTO Research Integration)
**Date**: 2026-02-23
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO + CTO Research
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 45 Complete (Brain Architecture validated)
- Sprint 38 (Telegram channel) and Sprint 43 (Desktop channel) in place
- GitHub PAT with `models:read` scope (for GitHub Models)
**SDLC**: Framework 6.1.1

> **Note**: Originally Sprint 45 (Full OTT Ecosystem). Shifted to Sprint 46 per CEO-approved Option A resequence (2026-02-23).
> **v3.0.0**: Added GitHub Models Provider per CTO research and CEO approval (2026-02-23).

---

## Executive Summary

Sprint 46 delivers two major features:

1. **OTT Ecosystem**: Add Zalo (Vietnam market), refactor channels for **bidirectional** communication, and enable **conversational escalation** so the CEO can have multi-turn dialogue with EndiorBot via Telegram or Zalo.

2. **GitHub Models Provider**: Add GitHub Models API as a **free-tier cloud provider** (via Copilot Pro+ subscription), expanding the provider ecosystem alongside Ollama.

### Vision: Multi-Channel CEO + Extended Provider Ecosystem

```
Sprint 38:  Telegram send-only + /approve, /reject, /status
Sprint 46:  Telegram + Zalo; bidirectional; "Show me the error", "Try different approach", "What's status?"
            + GitHub Models as free cloud provider ($0 via Copilot Pro+)
```

**OTT Benefits**:
- Vietnam market: Zalo OA integration
- Unified message format across channels
- CEO can ask follow-ups from phone (e.g. "Show me the error" → code snippet)
- Channel preference: ~/.endiorbot/channels.json

**GitHub Models Benefits**:
- Free cloud provider ($0 cost via Copilot Pro+ subscription)
- OpenAI-compatible API (reuse existing SDK)
- Access to GPT-4o, Claude 3.5 Sonnet, Llama 3.3 70B, Mistral, Phi-4
- Second free-tier option (alongside Ollama)

---

## Sprint Goal

**Two parallel tracks:**

1. **OTT Track**: Refactor channels for bidirectional support; add Zalo channel; implement conversational escalation (multi-turn) so CEO can interact with EndiorBot via Telegram or Zalo.

2. **Provider Track**: Add GitHub Models Provider as free-tier cloud option; integrate with ResourceRouter for intelligent failover.

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 45** | Brain Architecture validated | PLANNED | Sprint 46 start |
| **Sprint 38** | Telegram channel (send + commands) | ✅ | Base |
| **Zalo OA** | API access (app id, secret) | ⚠️ | Config |
| **GitHub PAT** | Token with `models:read` scope | ⚠️ | GitHub Models |

---

## ADR-009: GitHub Models Provider

**Decision**: Add GitHub Models API as free-tier cloud provider.

**Context**:
- CTO research identified GitHub Models API (OpenAI-compatible) as cost-free via Copilot Pro+ subscription
- Provides access to GPT-4o, Claude 3.5 Sonnet, Llama 3.3 70B, Mistral-large, Phi-4
- Lower rate limits than direct API (15 req/min) but $0 cost

**Consequences**:
- +1 provider in ResourceRouter failover chain
- Circuit breaker required (15 req/min limit)
- PAT stored securely via `keytar`

**Status**: APPROVED (CEO 2026-02-23)

---

## Sprint 46 Overview

| Week | OTT Track | Provider Track |
|------|-----------|----------------|
| **Week 1** | Channel Abstraction + Zalo (Day 1-3) | GitHub Models Provider (Day 4-5) |
| **Week 2** | Conversational Escalation (Day 6-9) | Integration + Testing (Day 10) |

**Duration**: 10 working days (2 weeks from Sprint 45 close)
**Total Scope**: ~2,800 LOC (OTT ~2,000 + GitHub Models ~800)

---

## Week 1: Channel Abstraction + Zalo (Day 1-5)

### Day 1-2: Bidirectional Channel Interface

**Goal**: Channels can receive messages, not only send.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Extend src/channels/types.ts | P0 | BidirectionalChannel: send, sendAlert, isAvailable, onMessage(callback), startListening(), stopListening() | ~80 |
| Telegram channel: implement onMessage (polling or webhook), start/stop | P0 | telegram-channel.ts | ~120 |
| Unified IncomingMessage type: channelId, userId, text, timestamp, messageId | P0 | types.ts | ~60 |
| Channel registry: register bidirectional channels | P0 | channels/index.ts | ~60 |
| Create tests/channels/bidirectional.test.ts | P1 | Mock channel, onMessage | ~100 |
| Refactor NotificationSystem to support "reply target" per channel | P1 | notification-system.ts | ~80 |

**Acceptance Criteria**:
- [ ] Telegram can receive messages (polling); callback invoked with IncomingMessage
- [ ] Unified IncomingMessage shape
- [ ] Build passes

---

### Day 3: Zalo Channel

**Goal**: Zalo OA API integration for send and receive.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/channels/zalo/zalo-config.ts | P0 | App id, secret, OA id from config | ~60 |
| Create src/channels/zalo/zalo-channel.ts | P0 | Send message via Zalo OA API; receive via webhook or polling | ~250 |
| Zalo message format: map to/from UnifiedMessage | P0 | Same file or format.ts | ~80 |
| Register Zalo in channel registry when configured | P0 | channels/index.ts | ~40 |
| Create tests/channels/zalo.test.ts (mock API) | P1 | Send, receive | ~120 |
| Document: Zalo OA setup, webhook URL if required | P1 | docs/04-build/ott-channels.md | ~80 |

**Acceptance Criteria**:
- [ ] Zalo channel sends messages when configured
- [ ] Zalo receives messages (webhook or polling per Zalo API)
- [ ] Build passes

---

### Day 4: GitHub Models Provider

**Goal**: Implement GitHub Models as free-tier cloud provider.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add `GITHUB_TOKEN` to src/config/env-vars.ts | P0 | Optional env var with keytar fallback | ~40 |
| Create src/providers/github-models/index.ts | P0 | GitHubModelsProvider extending BaseProvider | ~300 |
| Use `openai` SDK with baseURL: `https://models.inference.ai.azure.com` | P0 | Same file | — |
| Models map: gpt-4o, gpt-4o-mini, claude-3-5-sonnet, llama-3.3-70b, phi-4, mistral-large | P0 | Same file | ~60 |
| Circuit breaker: 15 req/min with exponential backoff | P0 | Same file | ~80 |
| Create src/cli/commands/setup-github.ts | P1 | CLI: `endiorbot setup github` to store PAT via keytar | ~100 |
| Create tests/providers/github-models/provider.test.ts | P1 | Unit tests with mock HTTP | ~120 |

**Acceptance Criteria**:
- [ ] GitHubModelsProvider sends requests to GitHub Models API
- [ ] Circuit breaker limits to 15 req/min
- [ ] PAT stored securely via keytar (not .env)
- [ ] Build passes

---

### Day 5: GitHub Models Integration + Unified Message Format

**Goal**: Integrate GitHub Models into ResourceRouter; finalize channel routing.

**GitHub Models Tasks**:

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Register `github-models` in src/providers/provider-registry.ts | P0 | Provider registration | ~30 |
| Add `'github-models'` to AIProvider union in types.ts | P0 | Type update | ~5 |
| Update src/providers/resource-router.ts: add github-models to failover chain | P0 | Routing rules | ~60 |
| Priority: Ollama (local) → GitHub Models (free cloud) → Paid (Anthropic/OpenAI) | P0 | Same | — |
| Create tests/providers/github-models/integration.test.ts | P1 | Integration with mock | ~80 |

**Acceptance Criteria**:
- [ ] ResourceRouter includes github-models in failover chain
- [ ] Route TaskType.research → github-models when Ollama unavailable
- [ ] Build passes

---

### Day 5 (continued): Unified Message Format + Channel Routing

**Goal**: One format for alerts and replies; route by alert type.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Unified EscalationMessage: type (budget, approval, gate, status), payload, replyToMessageId? | P0 | channels/types.ts | ~60 |
| Channel routing config: e.g. `{ budget: ['telegram'], approval: ['telegram', 'zalo'] }` | P0 | channels/routing.ts or config | ~100 |
| NotificationSystem: when sending alert, use routing to pick channels | P0 | notification-system.ts | ~80 |
| Create ~/.endiorbot/channels.json schema (or extend config.json) | P0 | docs or types | ~40 |
| Create tests/channels/routing.test.ts | P1 | Route by type | ~80 |

**Acceptance Criteria**:
- [ ] Alerts formatted once; routing picks which channels get which alert type
- [ ] channels.json (or config) drives routing
- [ ] Build passes

---

### Day 5: Integration (Week 1)

**Goal**: Telegram + Zalo both work; routing applied.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: send alert → both Telegram and Zalo receive (if both configured) | P0 | Manual or E2E | — |
| E2E: receive message from Telegram → callback; from Zalo → callback | P0 | Manual or E2E | — |
| Document channels.json and config keys | P1 | docs/04-build/ott-channels.md | ~40 |

**Acceptance Criteria**:
- [ ] CEO can receive alerts on chosen channels (Telegram and/or Zalo)
- [ ] Incoming messages from both channels trigger same handler path
- [ ] Build passes

---

## Week 2: Conversational Escalation (Day 6-10)

### Day 6-7: Message Router (Incoming → Actions)

**Goal**: Incoming CEO messages map to actions (approve, reject, status, show error, try different).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/channels/conversation/message-router.ts | P0 | Parse text: /approve, /reject, /status, "show me the error", "try a different approach" | ~200 |
| Intent types: APPROVE, REJECT, STATUS, SHOW_ERROR, TRY_DIFFERENT, UNKNOWN | P0 | types | ~40 |
| Wire APPROVE/REJECT to ApprovalQueue (existing) | P0 | message-router.ts | ~40 |
| Wire STATUS to session summary (SessionManager or Orchestrator) | P0 | Return summary text | ~100 |
| Create tests/channels/conversation/message-router.test.ts | P1 | Each intent | ~150 |
| IncomingMessage handler: call messageRouter.route(msg) → execute action | P0 | Integration point | ~80 |

**Acceptance Criteria**:
- [ ] /approve, /reject, /status work from Telegram and Zalo
- [ ] Plain text "what's the current status?" maps to STATUS
- [ ] Build passes

---

### Day 8: SHOW_ERROR and TRY_DIFFERENT

**Goal**: "Show me the error" returns last error/code snippet; "Try a different approach" triggers strategy change.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| SHOW_ERROR: get last error and optional code snippet from current session | P0 | conversation/actions/show-error.ts | ~120 |
| Send reply to CEO on same channel with error text + snippet | P0 | Channel send from conversation handler | ~80 |
| TRY_DIFFERENT: call Orchestrator to retry with different strategy | P0 | conversation/actions/try-different.ts | ~120 |
| Reply to CEO: "Retrying with different approach." | P0 | Same | ~40 |
| Create tests for show-error and try-different (mocked session) | P1 | tests | ~100 |
| Document: supported phrases in user guide | P1 | docs | ~40 |

**Acceptance Criteria**:
- [ ] "Show me the error" returns last error and snippet to CEO on same channel
- [ ] "Try a different approach" triggers retry and confirms to CEO
- [ ] Build passes

---

### Day 9: Full Session Summary + Multi-Turn Context

**Goal**: "What's the current status?" returns rich summary.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| STATUS action: build summary (session id, project, budget used/limit, approval queue, last checkpoint, active track) | P0 | conversation/actions/status.ts | ~150 |
| Format summary for Telegram/Zalo (length limit, markdown or plain) | P0 | Same | ~60 |
| Optional: conversationId in IncomingMessage so replies stay in context | P1 | types, storage | ~60 |
| Create tests for status action | P1 | tests | ~80 |
| E2E: trigger escalation → CEO replies "status" → receives summary | P0 | Manual or E2E | — |

**Acceptance Criteria**:
- [ ] "What's the current status?" returns full session summary
- [ ] Summary readable on mobile (length/formatted)
- [ ] Build passes

---

### Day 10: Integration + G-Sprint-46

**Goal**: Channel preference config; gate validation.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| channels.json: preferred channels per alert type; primary channel for replies | P0 | config load | ~60 |
| Document ~/.endiorbot/channels.json with examples | P0 | docs/04-build/ott-channels.md | ~80 |
| G-Sprint-46 checklist | P0 | All criteria below | — |
| Optional: rate limit or throttle replies to avoid spam | P2 | throttle.ts | ~40 |

**Acceptance Criteria**:
- [ ] CEO can choose Telegram and/or Zalo; routing and replies use config
- [ ] Conversational escalation: status, show error, try different all work from Telegram and Zalo
- [ ] Build and lint pass
- [ ] docs/04-build/ott-channels.md updated

---

## Files Created (Sprint 46)

### OTT Track Files

| File / Dir | Est. LOC | Purpose |
|------------|----------|---------|
| src/channels/types.ts (extended) | ~140 | BidirectionalChannel, IncomingMessage, UnifiedEscalationMessage |
| src/channels/zalo/zalo-config.ts | ~60 | Zalo config |
| src/channels/zalo/zalo-channel.ts | ~330 | Zalo send/receive |
| src/channels/routing.ts | ~100 | Route by alert type |
| src/channels/conversation/message-router.ts | ~240 | Intent parsing, dispatch |
| src/channels/conversation/actions/status.ts | ~210 | Session summary |
| src/channels/conversation/actions/show-error.ts | ~200 | Last error + snippet |
| src/channels/conversation/actions/try-different.ts | ~160 | Retry strategy |
| tests/channels/*.test.ts | ~530 | Channel + conversation tests |
| docs/04-build/ott-channels.md | ~200 | Zalo setup, channels.json |
| **OTT Subtotal** | **~2,000** | |

### GitHub Models Track Files

| File / Dir | Est. LOC | Purpose |
|------------|----------|---------|
| src/providers/github-models/index.ts | ~440 | GitHubModelsProvider with circuit breaker |
| src/cli/commands/setup-github.ts | ~100 | CLI to store PAT via keytar |
| tests/providers/github-models/*.test.ts | ~200 | Unit + integration tests |
| docs/02-design/01-ADRs/ADR-009-github-models-provider.md | ~80 | ADR document |
| **GitHub Models Subtotal** | **~820** | |

### Total

| Track | LOC |
|-------|-----|
| OTT Ecosystem | ~2,000 |
| GitHub Models | ~820 |
| **Sprint 46 Total** | **~2,820** |

---

## Modified Files (Sprint 46)

| File | Changes |
|------|---------|
| src/channels/telegram/telegram-channel.ts | Bidirectional: onMessage, startListening |
| src/channels/index.ts | Registry: Zalo, bidirectional |
| src/notifications/notification-system.ts | Routing, reply target |
| ~/.endiorbot/channels.json (doc) | Schema and examples |

---

## Success Criteria (Sprint 46)

### OTT Track

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Zalo channel send/receive | 100% | Manual / test |
| Channel routing by alert type | 100% | Test |
| /approve, /reject, /status from Telegram and Zalo | 100% | Manual |
| "Show me the error" → snippet | 100% | Manual |
| "Try different approach" → retry | 100% | Manual |
| "What's the current status?" → summary | 100% | Manual |

### GitHub Models Track

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| GitHubModelsProvider sends to API | 100% | Test |
| Circuit breaker limits 15 req/min | 100% | Test |
| PAT stored via keytar (not .env) | 100% | Code review |
| ResourceRouter includes github-models | 100% | Test |
| `endiorbot setup github` works | 100% | Manual |

### Overall

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Build + lint | Pass | CI |
| All tests pass | 100% | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 45 complete | PLANNED | Brain Architecture |
| Sprint 38 (Telegram) | ✅ | Base channel |
| Sprint 43 (Desktop channel) | ✅ | Parallel notifications |
| ApprovalQueue, SessionManager, SelfCorrectionEngine | ✅ | Prior sprints |
| Zalo OA API | ⚠️ | External |
| GitHub PAT (`models:read`) | ⚠️ | CEO provides |
| `keytar` (secure storage) | ✅ | Already in deps |
| `openai` SDK | ✅ | Already in deps (OpenAI provider) |

---

## Next Sprint Preview (Sprint 47)

**Sprint Goal**: Integration + Stabilization

**Key Deliverables**:
- 2-hour autonomous session E2E
- Budget optimization, Telegram escalation, parallel tracks, Desktop + Gateway verified
- User guides, config reference, troubleshooting, benchmarks
- Sprint 48+ planning

**Prerequisite**: Sprint 46 PASS (Full OTT validated)

---

## Approval Checklist (G-Sprint-46)

### OTT Track
- [ ] Bidirectional channel interface; Telegram and Zalo receive messages
- [ ] Zalo OA integration (send + receive)
- [ ] Unified message format and channel routing (channels.json)
- [ ] Message router: /approve, /reject, /status, show error, try different, status phrase
- [ ] SHOW_ERROR returns last error + snippet
- [ ] TRY_DIFFERENT triggers retry and confirms
- [ ] STATUS returns full session summary
- [ ] docs/04-build/ott-channels.md updated

### GitHub Models Track
- [ ] ADR-009 created: docs/02-design/01-ADRs/ADR-009-github-models-provider.md
- [ ] GitHubModelsProvider implements BaseProvider
- [ ] Circuit breaker: 15 req/min with exponential backoff
- [ ] PAT stored via keytar (not .env or git)
- [ ] Registered in ProviderRegistry
- [ ] ResourceRouter includes github-models in failover chain
- [ ] `endiorbot setup github` CLI command works
- [ ] Unit tests pass

### Overall
- [ ] Build and lint pass
- [ ] All tests pass (~2,100+ total)

---

**Last Updated**: 2026-02-23
**Sprint Status**: DRAFT — v3.0.0 (OTT + GitHub Models)
**Blocking**: Sprint 45 close
**CTO Research**: GitHub Models Provider approved by CEO 2026-02-23

---

*Sprint 46 Plan - Full OTT Ecosystem + GitHub Models Provider*
*EndiorBot - Multi-Channel CEO + Extended Provider Ecosystem*
*SDLC Framework 6.1.1*
