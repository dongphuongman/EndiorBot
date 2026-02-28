# Sprint 38 Detailed Plan - OTT Escalation + Multi-Provider

**Version**: 2.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Sprint 38-46 Replan)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 37 Complete (Self-Correction validated)
- CEO decision: OTT as primary escalation channel
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 38 implements **OTT Escalation + Multi-Provider** — CEO receives escalations via Telegram and the multi-model orchestrator gains OpenAI and Gemini providers.

### Vision: CEO Reachable Anywhere

```
Current (Sprint 37):  Escalations only in terminal → CEO must be at desk
Sprint 38 Target:     Telegram alerts + /approve from phone → CEO works anywhere
Future (Sprint 45):   Zalo + conversational escalation
```

### Why OTT First?

> **CEO Decision**: "Escalate (raise to CEO) when agents cannot proceed — via OTT is most reasonable. OTT is required so CEO can work anytime, anywhere."

Benefits:
- CEO receives budget/approval/escalation alerts on Telegram
- CEO can `/approve` and `/reject` from phone — no terminal needed
- Multi-model orchestrator has real providers (Anthropic + OpenAI + Gemini)
- Foundation for longer autonomous sessions (Sprint 39+)

Risks:
- Telegram API dependency; polling mode avoids webhook complexity
- Bot token and chat ID must be configured securely

---

## Sprint Goal

**Enable CEO to receive escalation alerts via Telegram and approve/reject from mobile; add OpenAI and Gemini providers to the multi-model orchestrator.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 37** | Self-correction validated | PLANNED | Sprint 38 start |
| **Telegram Bot** | Bot token from BotFather | ⚠️ MANUAL | Day 2 |
| **BaseProvider** | Interface from Sprint 29 | ✅ | - |
| **NotificationSystem** | Sprint 36 | ✅ | - |
| **ApprovalQueue** | Sprint 36 | ✅ | - |

### Phase 4 Validation Criteria (Revised)

Sprint 37 → Sprint 38 Gate:
- [ ] CEO receives Telegram alerts for budget/approval/escalation events
- [ ] CEO can `/approve` and `/reject` from Telegram
- [ ] OpenAI + Gemini providers registered and functional
- [ ] NotificationSystem routes to Telegram when configured
- [ ] E2E: trigger budget limit → CEO receives Telegram message

**Gate**: All criteria must PASS before Sprint 39 Day 1.

---

## Sprint 38 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | OTT Channel Architecture | channels/types.ts, telegram-channel.ts, NotificationSystem integration, CEO reply handling |
| **Week 2** | Multi-Provider | openai-provider.ts, gemini-provider.ts, ProviderRegistry, E2E tests |

**Duration**: 10 working days (2 weeks from Sprint 37 close)

---

## Week 1: OTT Channel Architecture (Day 1-5)

### Day 1-2: Channel Abstraction + Telegram

**Goal**: Define channel interface and implement send-only Telegram channel.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/channels/types.ts | P0 | Channel interface, EscalationAlert type | ~150 |
| Create src/channels/telegram/telegram-channel.ts | P0 | Send-only Telegram bot (Bot API) | ~350 |
| Create src/channels/telegram/telegram-config.ts | P0 | Bot token + chat ID from config | ~80 |
| Create src/channels/index.ts | P0 | Channel registry | ~60 |
| Create tests/channels/telegram-channel.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Channel interface: `send(message: string)`, `sendAlert(alert: EscalationAlert)`, `isAvailable(): boolean`
- [ ] EscalationAlert type: budget_warning, budget_limit, approval_needed, escalation_3strike, gate_failed
- [ ] TelegramChannel uses Bot API (node-telegram-bot-api or raw HTTPS)
- [ ] Config: `~/.endiorbot/config.json` or env: `ENDIORBOT_TELEGRAM_BOT_TOKEN`, `ENDIORBOT_TELEGRAM_CHAT_ID`
- [ ] Markdown formatting for alerts (bold, code blocks for IDs)
- [ ] Tests pass: send message, send alert, config load, isAvailable
- [ ] Build passes

**Channel Interface**:
```typescript
// src/channels/types.ts
export type EscalationAlertType =
  | 'budget_warning'
  | 'budget_limit'
  | 'approval_needed'
  | 'escalation_3strike'
  | 'gate_failed';

export interface EscalationAlert {
  type: EscalationAlertType;
  title: string;
  body: string;
  approvalId?: string;
  projectId?: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface IChannel {
  name: string;
  send(message: string): Promise<boolean>;
  sendAlert(alert: EscalationAlert): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}
```

**Telegram Config**:
```typescript
// telegram-config.ts
export interface TelegramChannelConfig {
  botToken: string;
  chatId: string;
  parseMode?: 'Markdown' | 'HTML';
  disableNotification?: boolean;
}

export function loadTelegramConfig(): TelegramChannelConfig | null {
  // 1. Env: ENDIORBOT_TELEGRAM_BOT_TOKEN, ENDIORBOT_TELEGRAM_CHAT_ID
  // 2. Fallback: ~/.endiorbot/config.json → channels.telegram
  // 3. Return null if not configured (channel disabled)
}
```

**Integration Points**:
```
telegram-channel.ts
    └── config (paths.ts, env-vars)
    └── Logger (src/logging/logger.ts)
```

---

### Day 3: NotificationSystem Integration

**Goal**: Route escalation events to Telegram when Telegram channel is configured.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add TelegramChannel to NotificationSystem | P0 | notification-system.ts changes | ~100 |
| Map BudgetEvent → EscalationAlert | P0 | budget event formatter | ~80 |
| Map ApprovalQueue events → EscalationAlert | P0 | approval formatter | ~60 |
| Add channel config to BudgetConfig / NotificationConfig | P0 | types + schema | ~40 |
| Create tests/budget/notification-telegram.test.ts | P0 | Integration tests | ~120 |

**Acceptance Criteria**:
- [ ] NotificationSystem accepts optional TelegramChannel in constructor or setChannel()
- [ ] When event is threshold_warning, limit_reached, or approval_queued: format as EscalationAlert and call channel.sendAlert()
- [ ] Rate limiting (4/hour) still applies; critical alerts bypass (existing behavior)
- [ ] If Telegram not configured, behavior unchanged (terminal + file only)
- [ ] Tests pass: alert routed to Telegram when configured
- [ ] Build passes

**Integration Points**:
```
NotificationSystem
    └── TerminalChannel (existing)
    └── FileChannel (existing)
    └── TelegramChannel (new, optional)
BudgetEscalationIntegration
    └── NotificationSystem (already integrated)
```

---

### Day 4-5: CEO Reply Handling (Minimal)

**Goal**: Telegram bot listens for /approve, /reject, /status and wires to ApprovalQueue.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add polling to TelegramChannel (optional mode) | P0 | telegram-channel.ts polling | ~150 |
| Parse /approve &lt;id&gt;, /reject &lt;id&gt;, /status | P0 | command parser | ~80 |
| Wire to ApprovalQueue.approve(id), reject(id) | P0 | queue integration | ~60 |
| Load ApprovalQueue from default path | P0 | approval-queue.ts already file-backed | - |
| Create tests/channels/telegram-commands.test.ts | P0 | Command tests | ~100 |
| Document: Bot token setup, chat ID discovery | P1 | docs/04-build/telegram-setup.md | ~80 |

**Acceptance Criteria**:
- [ ] Polling mode (no webhook) — bot.getUpdates() or equivalent
- [ ] /approve &lt;id&gt; → ApprovalQueue.approve(id), reply "Approved"
- [ ] /reject &lt;id&gt; → ApprovalQueue.reject(id), reply "Rejected"
- [ ] /status → Reply with pending count and list of approval IDs
- [ ] Commands only processed when message.chat.id === configured chatId (security)
- [ ] Tests pass: command parsing, queue integration (mocked)
- [ ] Build passes

**Command Handling**:
```typescript
// In TelegramChannel when polling enabled
async handleUpdate(update: TelegramUpdate): void {
  const text = update.message?.text;
  const chatId = update.message?.chat?.id;
  if (chatId !== this.config.chatId) return; // Only accept from CEO chat
  if (!text?.startsWith('/')) return;

  const [cmd, ...args] = text.trim().split(/\s+/);
  if (cmd === '/approve' && args[0]) {
    await this.approvalQueue.approve(args[0]);
    await this.send(`Approved: ${args[0]}`);
  } else if (cmd === '/reject' && args[0]) {
    await this.approvalQueue.reject(args[0]);
    await this.send(`Rejected: ${args[0]}`);
  } else if (cmd === '/status') {
    const pending = await this.approvalQueue.listPending();
    await this.send(`Pending: ${pending.length}\n${pending.map(p => `- ${p.id}: ${p.description}`).join('\n')}`);
  }
}
```

**Integration Points**:
```
TelegramChannel (polling)
    └── ApprovalQueue (Sprint 36)
    └── loadApprovalQueue(defaultPath)
```

---

## Week 2: Multi-Provider Implementation (Day 6-10)

### Day 6-7: OpenAI Provider

**Goal**: Implement OpenAI provider (GPT-4 Turbo, GPT-4o) implementing BaseProvider.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/providers/openai/openai-provider.ts | P0 | OpenAI API adapter | ~400 |
| Create src/providers/openai/openai-client.ts | P0 | HTTP client (fetch or openai SDK) | ~150 |
| Implement BaseProvider interface | P0 | chat(), stream?, isAvailable() | - |
| Register in ProviderRegistry | P0 | providers/index.ts or registry | ~20 |
| Create tests/providers/openai/openai-provider.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] OpenAIProvider implements BaseProvider (from src/providers/base-provider.ts)
- [ ] Supports models: gpt-4-turbo, gpt-4o, gpt-4o-mini (configurable)
- [ ] API key from config or env OPENAI_API_KEY
- [ ] Token usage and cost tracking (use PricingRegistry)
- [ ] Error handling: rate limit, invalid key, model not found
- [ ] Tests pass: mock HTTP, response mapping
- [ ] Build passes

**Integration Points**:
```
OpenAIProvider
    └── BaseProvider (Sprint 29)
    └── PricingRegistry (Sprint 36)
    └── Logger
```

---

### Day 8-9: Gemini Provider

**Goal**: Implement Google Gemini provider (Gemini Pro, Gemini Flash).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/providers/google/gemini-provider.ts | P0 | Gemini API adapter | ~400 |
| Create src/providers/google/gemini-client.ts | P0 | HTTP client (Generative Language API) | ~150 |
| Implement BaseProvider interface | P0 | chat(), stream?, isAvailable() | - |
| Register in ProviderRegistry | P0 | providers/index.ts | ~20 |
| Create tests/providers/google/gemini-provider.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] GeminiProvider implements BaseProvider
- [ ] Supports models: gemini-1.5-pro, gemini-1.5-flash (or current names)
- [ ] API key from config or env GOOGLE_API_KEY / GEMINI_API_KEY
- [ ] Token usage and cost tracking
- [ ] Error handling: quota, invalid key
- [ ] Tests pass: mock HTTP
- [ ] Build passes

**Integration Points**:
```
GeminiProvider
    └── BaseProvider
    └── PricingRegistry
    └── Logger
```

---

### Day 10: Integration + E2E

**Goal**: Multi-model orchestrator with 3 providers; Telegram E2E.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Multi-model orchestrator test (Anthropic + OpenAI + Gemini) | P0 | tests/agents/orchestrator/multi-provider.test.ts | ~150 |
| Telegram alert E2E: trigger budget limit → receive message | P0 | tests/e2e/telegram-escalation.test.ts | ~120 |
| Update resource-router-fallback mock (Sprint 36) | P1 | Use real router in Sprint 39 | - |
| G-Sprint-38 gate validation | P0 | Checklist below | - |

**Acceptance Criteria**:
- [ ] Consult command can use claude, gpt-4o, gemini (via orchestrator)
- [ ] E2E: set budget limit, record cost to limit → NotificationSystem fires → TelegramChannel.sendAlert() called (mock or real token in CI)
- [ ] All Sprint 38 acceptance criteria met
- [ ] Build passes, lint clean, tests pass

---

## Files Created (Sprint 38)

| File | Est. LOC | Purpose |
|------|----------|---------|
| src/channels/types.ts | ~150 | Channel interface, EscalationAlert |
| src/channels/telegram/telegram-channel.ts | ~350 | Telegram send + polling |
| src/channels/telegram/telegram-config.ts | ~80 | Config load |
| src/channels/index.ts | ~60 | Exports, registry |
| src/providers/openai/openai-provider.ts | ~400 | OpenAI adapter |
| src/providers/openai/openai-client.ts | ~150 | HTTP client |
| src/providers/google/gemini-provider.ts | ~400 | Gemini adapter |
| src/providers/google/gemini-client.ts | ~150 | HTTP client |
| tests/channels/telegram-channel.test.ts | ~200 | Telegram tests |
| tests/channels/telegram-commands.test.ts | ~100 | Command tests |
| tests/budget/notification-telegram.test.ts | ~120 | Notification + Telegram |
| tests/providers/openai/openai-provider.test.ts | ~200 | OpenAI tests |
| tests/providers/google/gemini-provider.test.ts | ~200 | Gemini tests |
| tests/agents/orchestrator/multi-provider.test.ts | ~150 | Orchestrator 3-provider |
| tests/e2e/telegram-escalation.test.ts | ~120 | E2E Telegram |
| docs/04-build/telegram-setup.md | ~80 | Setup guide |
| **Total** | **~2,500** | |

---

## Modified Files (Sprint 38)

| File | Changes |
|------|---------|
| src/budget/notification-system.ts | Add TelegramChannel support, sendAlert routing |
| src/budget/types.ts | NotificationConfig.channels add 'telegram' |
| src/providers/index.ts | Export openai, google; register providers |
| src/config/schema.ts | Telegram config schema (optional) |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 38 INTEGRATION                         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              NotificationSystem (Sprint 36)                │   │
│  │  TerminalChannel │ FileChannel │ TelegramChannel (NEW)   │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │ sendAlert()                          │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  BudgetEscalationIntegration → EscalationRouter           │   │
│  │  Events: threshold_warning, limit_reached, approval_queued │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  TelegramChannel                                          │   │
│  │  • send(message)  • sendAlert(alert)  • polling /approve  │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  ApprovalQueue (Sprint 36) ← /approve, /reject from TG    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Multi-Model Orchestrator (Sprint 29)                     │   │
│  │  AnthropicProvider │ OpenAIProvider (NEW) │ Gemini (NEW)  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## CEO Experience (Sprint 38)

### Touchpoint 1: Budget Limit Alert on Phone

```
[Telegram]
EndiorBot
🔴 Budget limit reached
Session: $2.00 / $2.00 (100%)
Project: myproject
Paused. Use /status to see queue or resume at terminal.
```

### Touchpoint 2: Approval Request

```
[Telegram]
EndiorBot
⏳ Approval needed
Architecture change: Add new API module
ID: apr-abc123
/approve apr-abc123
/reject apr-abc123
```

### Touchpoint 3: Approve from Phone

```
CEO: /approve apr-abc123
Bot: Approved: apr-abc123. Session will continue.
```

### Touchpoint 4: Status

```
CEO: /status
Bot: Pending: 2
- apr-xyz: Budget pause acknowledgment
- apr-def: Gate G2 approval
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Telegram API down | Alerts not delivered | Terminal + file channels still work; retry with backoff |
| Bot token leaked | Security | Token in env or encrypted config; never log token |
| Polling latency | Delayed /approve | Poll every 2–5 s; acceptable for approval workflow |
| OpenAI/Gemini API changes | Provider break | Versioned client; tests with mocked responses |

---

## Success Criteria (Sprint 38)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Telegram alerts delivered | 100% when configured | E2E test |
| /approve, /reject work | 100% | Command tests |
| OpenAI provider | Implements BaseProvider | Unit tests |
| Gemini provider | Implements BaseProvider | Unit tests |
| Multi-model consult | 3 providers selectable | Orchestrator test |
| Build & lint | Pass | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 37 complete | PLANNED | Self-correction validated |
| NotificationSystem | ✅ | Sprint 36 |
| ApprovalQueue | ✅ | Sprint 36 |
| BaseProvider | ✅ | Sprint 29 |
| Telegram Bot token | ⚠️ MANUAL | CEO creates via BotFather |
| OpenAI API key | ⚠️ MANUAL | Optional for consult |
| Gemini API key | ⚠️ MANUAL | Optional for consult |

---

## Next Sprint Preview (Sprint 39)

**Sprint Goal**: Resource Router + Ollama

**Key Deliverables**:
- Task classifier (simple/moderate/complex/critical)
- Resource router (model selection by complexity + budget)
- Ollama provider (local/NQH)
- Quality gates, cost optimizer
- Budget fallback to Ollama

**Prerequisite**: Sprint 38 PASS (OTT + multi-provider validated)

---

## Approval Checklist (G-Sprint-38)

### Code Quality
- [ ] Build passes (`pnpm build`)
- [ ] All tests pass (~120 new tests)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] TypeScript strict mode compliant

### Features
- [ ] CEO receives Telegram alerts for budget/approval/escalation
- [ ] CEO can /approve and /reject from Telegram
- [ ] OpenAI provider registered and functional
- [ ] Gemini provider registered and functional
- [ ] NotificationSystem routes to Telegram when configured
- [ ] Telegram config from env or config file

### Testing
- [ ] Telegram channel unit tests pass
- [ ] Telegram commands tests pass
- [ ] Notification + Telegram integration tests pass
- [ ] OpenAI provider tests pass (mock)
- [ ] Gemini provider tests pass (mock)
- [ ] E2E: budget limit → Telegram alert (mock or real)

### Documentation
- [ ] docs/04-build/telegram-setup.md (token, chat ID)
- [ ] CLI/config docs mention telegram channel

### Integration
- [ ] NotificationSystem uses TelegramChannel when configured
- [ ] ApprovalQueue used by Telegram /approve, /reject
- [ ] ProviderRegistry includes openai, google

---

## Approval Status

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | PENDING | |
| CTO | @cto | PENDING | |
| CEO | @CEO | PENDING | Awaiting Sprint 37 close |

---

**Last Updated**: 2026-02-22
**Sprint Owner**: @coder (AI)
**Sprint Status**: DRAFT - Revised per Sprint 38-46 Replan
**Blocking**: Sprint 37 close

---

*Sprint 38 Plan - OTT Escalation + Multi-Provider*
*EndiorBot - CEO reachable anywhere*
*SDLC Framework 6.1.1*
