---
spec_id: SPEC-04BUILD-SPRINT93
title: "Sprint 93: Gateway-Centric Unified Application"
spec_version: "1.0.0"
status: implemented
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-08
last_updated: 2026-03-08
related_adrs: ["ADR-002", "ADR-024"]
---

# Sprint 93: Gateway-Centric Unified Application

**Date:** 2026-03-08
**Gate:** G-Sprint
**Authority:** ADR-024 (Notification Bridge) + ADR-002 (MTClaw zero runtime coupling)
**Preceding sprint:** Sprint 92 (Unified App Launcher)
**Est. effort:** ~35h
**Est. tests:** ~37 (delivered 37)

---

## Goal

Replace the current 3-script / 3-terminal startup model with a single unified command (`endiorbot serve`) that starts Gateway, OTT adapters, and all services in one process. All inbound messages route through `GatewayIngress.handleInbound()` as single source of truth — adapters are thin transport layers with zero business logic.

**Key principle:** "1 ứng dụng, run là làm việc." CEO runs `./endiorbot.mjs serve` and everything works — Gateway (WebSocket + HTTP), Telegram, Zalo, all commands.

---

## Depends On

- Sprint 92 (Unified Launcher) — lock file, PID tracking, crash recovery infrastructure.
- Sprint 82–83 (Bridge commands) — `/link`, `/launch`, `/sessions` etc. handlers exist.
- Sprint 76–80 (OTT commands) — `/agents`, `/gate`, `/compliance` etc. handlers exist.

---

## Scope

| In Scope | Out of Scope (deferred) |
|----------|------------------------|
| `endiorbot serve` unified command (B1 fix) | Full canonical types — EndiorMessage/EndiorRequest (D1 → Sprint 94) |
| `GatewayIngress.handleInbound()` — single entry point (B3 fix) | Channel policy engine (D2 → Sprint 94) |
| `CommandDispatcher` — central command registry (R1) | RuntimeSupervisor with restart policies (D3 → Sprint 94) |
| `cmd.*` Gateway methods with auth check (R3) | Script replacement with redirects (D4 → Sprint 94) |
| `router.chat` + `router.status` Gateway methods (R2) | `/health` endpoint (D5 → Sprint 94) |
| Telegram OTT adapter (thin, ~120 lines) | Progressive Autonomy T2 — 30 min relay (D6 → Sprint 94-95) |
| Zalo OTT adapter (thin, ~180 lines) | |
| Deprecation warnings on old scripts (B2) | |
| 37 new tests across 5 test files (R7: ≥15 required) | |

---

## Review Synthesis

**4 reviewers + CPO approved this plan.** Key decisions:

### Blocking Issues — Fixed

| # | Issue | Source | Resolution |
|---|-------|--------|------------|
| B1 | `endiorbot start` already exists (project init) | CTO MF-1 | Renamed to `endiorbot serve` |
| B2 | Scripts must remain functional until new path proven | CTO MF-2 | Deprecation warning only, scripts 100% functional |
| B3 | Adapter dispatches directly, bypasses Gateway | Review + Doc 19 | `gateway.handleInbound(msg)` as single entry point |

### Required — Addressed

| # | Issue | Resolution |
|---|-------|------------|
| R1 | `dispatchCommand()` undefined | Created `src/commands/command-dispatcher.ts` |
| R2 | `router.chat` oversimplified | Thin passthrough to full ChannelRouter pipeline with metadata |
| R3 | Auth for `cmd.*` methods | Security-sensitive commands require userId parameter |
| R5 | Error boundaries per component | try/catch per adapter, crash doesn't kill process |
| R6 | Shutdown sequence | Reverse order: adapters → gateway → lock (5s per component, 20s max) |
| R7 | Test count too low | 37 tests (target was ≥15) |

### Final Synthesis Fixes (4 targeted)

| # | Fix | Impact |
|---|-----|--------|
| Fix 1 | Unknown `/xxx` → return error, NOT fall through to chat | Prevents typo commands from triggering AI chat |
| Fix 2 | Unify auth at GatewayIngress level | Same auth path for WebSocket and OTT |
| Fix 3 | Startup order: providers → router → dispatcher → gateway → adapters | Session-dependent components start last |
| Fix 4 | `requireLinkedActor(ctx)` helper | Avoids repeating identity check in 17 command handlers |

---

## Architecture

### Gateway-Centric with OTT Adapter Layer

```
┌──────────────────────────────────────────────────────────────────┐
│                       EndiorBot Process                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Gateway Server (SSOT)                    │  │
│  │              HTTP + WebSocket on :18790                    │  │
│  │                                                            │  │
│  │  ┌──────────────────┐  ┌───────────────────────────────┐  │  │
│  │  │ handleInbound()  │  │   Gateway Method Registry     │  │  │
│  │  │ (single ingress) │  │ 52 existing + cmd.* +         │  │  │
│  │  │  → cmd or chat?  │  │ router.* methods              │  │  │
│  │  └──────────────────┘  └───────────────────────────────┘  │  │
│  │           │                        │                       │  │
│  │  ┌────────┴────────┐  ┌───────────┴───────────┐          │  │
│  │  │CommandDispatcher │  │   ChannelRouter       │          │  │
│  │  │ 23+ cmd handlers│  │   (AI routing SSOT)   │          │  │
│  │  └─────────────────┘  └───────────────────────┘          │  │
│  └──────┬──────────────────────┬─────────────────────────────┘  │
│         │ in-process calls     │                                 │
│  ┌──────┴──────────────────────┴──────────────────────────┐     │
│  │              OTT Adapter Layer                         │     │
│  │  ┌────────────────┐  ┌─────────────┐  ┌───────────┐   │     │
│  │  │ Telegram Adapter│  │Zalo Adapter │  │Future: ..│   │     │
│  │  │ • Long polling  │  │• Long poll  │  │• Slack   │   │     │
│  │  │ • 4096 char max │  │• 2000 chars │  │• WhatsApp│   │     │
│  │  │ • Markdown fmt  │  │• Plain text │  │          │   │     │
│  │  │ • InlineKeyboard│  │• No buttons │  │          │   │     │
│  │  └────────────────┘  └─────────────┘  └───────────┘   │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  External clients connect via WebSocket:                        │
│  • Browser (Web UI), Desktop (Electron), CLI                    │
└──────────────────────────────────────────────────────────────────┘
```

### Single Ingress (B3 Fix)

**Problem:** Original plan had adapter calling `dispatchCommand()` and `router.routeMessage()` directly — adapter knew about command semantics, violating SSOT.

**Fix:** `GatewayIngress.handleInbound()` is the ONLY entry point:

```
OTT message arrives
  → Adapter normalizes to { channel, senderId, content, metadata }
  → Adapter calls gateway.handleInbound(normalizedMsg)
  → Gateway determines: command (/xxx) or chat (@mention)?
  → Gateway dispatches to CommandDispatcher or ChannelRouter
  → Gateway returns { text, format }
  → Adapter formats for vendor (truncate, markdown, InlineKeyboard)
  → Adapter sends back to user
```

Adapter NEVER imports command handlers or ChannelRouter. Zero business logic.

### Ecosystem Alignment (ADR-002)

EndiorBot is part of a 3-product multi-agent engine family:

| Product | Role | Tech |
|---------|------|------|
| **EndiorBot** | CEO personal lab — thử nghiệm trước | TypeScript/Node.js |
| **MTClaw** | Governance-first assistant cho nhân viên MTS/NQH | Go (GoClaw) |
| **SDLC Orchestrator** | Commercial SDLC governance platform | Python/FastAPI |

**ADR-002:** Port patterns, NOT code. Zero runtime coupling.

The OTT adapter pattern aligns with MTClaw `Channel.HandleMessage() → Agent → Channel.Send()` flow. CommandDispatcher is portable to MTClaw/SDLC Orchestrator.

---

## Key Deliverables

1. **`src/commands/command-dispatcher.ts`** — `CommandDispatcher` class: central command registry mapping command names → handler functions. `SENSITIVE_COMMANDS` set, `LINKED_COMMANDS` set, `requireLinkedActor()` helper (Fix #4). Used by Gateway methods (WebSocket) and GatewayIngress (OTT).

2. **`src/commands/index.ts`** — Factory `createCommandDispatcher()` registering 23+ commands by wrapping existing handlers from `telegram-commands.ts` and `remote-commands.ts`. `withLinkedActor()` helper avoids repeating identity checks.

3. **`src/gateway/ingress.ts`** — `GatewayIngress` class with `handleInbound(msg: InboundMessage): Promise<InboundResponse>`. Single entry point for all OTT messages (B3 fix). Fix #1: unknown `/xxx` returns error. Fix #2: auth unified for WebSocket and OTT paths.

4. **`src/gateway/methods/bridge-commands.ts`** — `registerBridgeCommandMethods()`: registers CommandDispatcher commands as `cmd.*` Gateway JSON-RPC methods. R3: sensitive commands require `userId` parameter.

5. **`src/gateway/methods/router-chat.ts`** — `registerRouterChatMethods()`: `router.chat` (thin passthrough to ChannelRouter with agent/model/latencyMs metadata) and `router.status`.

6. **`src/channels/telegram/telegram-ott-adapter.ts`** — Telegram OTT adapter: normalize → `handleInbound()` → truncate to 4096 chars. `OttAdapter` interface. ZERO imports from command handlers or ChannelRouter.

7. **`src/channels/zalo/zalo-ott-adapter.ts`** — Zalo OTT adapter: same pattern, 2000 char limit, plain text (strips Markdown), no inline keyboard.

8. **`src/cli/commands/serve.ts`** — `endiorbot serve` unified startup command. `--port`, `--no-telegram`, `--no-zalo` options. Fix #3: startup order (providers → router → dispatcher → gateway → adapters). R6: graceful shutdown in reverse order.

### Modified Files

9. **`src/cli/commands/index.ts`** + **`register-all.ts`** — Export and register `registerServeCommand`.

10. **`src/gateway/methods/index.ts`** — Export `registerBridgeCommandMethods` and `registerRouterChatMethods`.

11. **`src/gateway/index.ts`** — Export `GatewayIngress`, `InboundMessage`, `InboundResponse`.

12. **`src/gateway/protocol/schema.ts`** — Add `cmd.*` (template literal) + `router.chat` + `router.status` to `GatewayMethod` type.

13. **`scripts/telegram-poll.mjs`** + **`scripts/web-gateway.mjs`** — Deprecation console.log warning (B2: scripts remain 100% functional).

---

## Test Plan (~37 tests)

### CommandDispatcher (11 tests)

| Test | Description |
|------|-------------|
| Register and dispatch | Registers handler and dispatches successfully |
| Unknown command → null | Returns null for unregistered command |
| has() case-insensitive | `has("TEST")` matches registered `"test"` |
| isSensitive() | Identifies launch, kill, sh as sensitive |
| requiresLink() | Identifies launch, sessions as linked commands |
| Context passthrough | userId, args, channel, chatId all passed correctly |
| Factory registers 17+ | `createCommandDispatcher()` registers ≥17 commands |
| requireLinkedActor — linked | Returns actorId when user is linked |
| requireLinkedActor — unlinked | Returns error with /link suggestion |
| SENSITIVE_COMMANDS includes | launch, kill, sh, run, cp, attach, link |
| SENSITIVE_COMMANDS excludes | agents, help, config not sensitive |

### GatewayIngress (8 tests)

| Test | Description |
|------|-------------|
| /help → CommandDispatcher | Routes command to dispatcher |
| /link passes userId | SenderId mapped to CommandContext.userId |
| @agent → ChannelRouter | Routes AI chat through ChannelRouter |
| No agent → usage hint | Returns usage hint when no agent detected |
| Unknown /xxx → error (Fix #1) | Returns error, NOT fall-through to chat |
| Empty / → error | Returns "Empty command" message |
| Strips @botname | `/help@Endior_bot` → dispatches as `help` |
| ChatId from metadata | `msg.metadata.chatId` passed to CommandContext |

### Bridge Commands Methods (4 tests)

| Test | Description |
|------|-------------|
| Registers cmd.* methods | All commands become `cmd.<name>` methods |
| cmd.agents callable | Non-sensitive command callable without userId |
| cmd.launch requires userId (R3) | Sensitive command returns error without userId |
| getBridgeCommandCount | Returns correct registered command count |

### OTT Adapters (10 tests)

| Test | Description |
|------|-------------|
| truncateForTelegram under limit | Returns text as-is when < 4096 |
| truncateForTelegram over limit | Truncates with `[...truncated]` marker |
| truncateForTelegram exact limit | Returns text at exactly 4096 chars |
| OttAdapter interface shape | name, start(), stop() methods exist |
| createTelegramOttAdapter null | Returns null when not configured |
| truncateForZalo | Truncates to 2000 chars |
| stripMarkdown bold | `**bold**` → `bold` |
| stripMarkdown italic | `*italic*` → `italic` |
| stripMarkdown code | `` `code` `` → `code` |
| stripMarkdown links | `[text](url)` → `text` |

### Serve Command (4 tests)

| Test | Description |
|------|-------------|
| Registers serve command | `serve` command added to program |
| --no-telegram/--no-zalo | Options available on serve command |
| --port option | Port option available |
| No collision with start (B1) | Both `start` and `serve` coexist |

---

## Milestone

Sprint 93 completes the **Gateway-Centric Unified Application**:

| Sprint | Capability |
|--------|-----------|
| 82–83 | Notification Bridge + Copilot CLI Remote Shell |
| 84 | SOUL Bridge Foundation (agent roles, install-agents) |
| 85 | Permission Approval via Telegram |
| 86–88 | /send, Hook Installer, Evaluator + Vibecoding |
| 89–91 | Agent Teams — Generation, Telegram, Monitoring |
| 92 | Unified App Launcher — PID + lock + crash recovery |
| **93** | **Gateway-Centric Unified App** — single `serve` command |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 94 | Full canonical types (EndiorMessage) + channel policies + script retirement |
| 95 | Progressive Autonomy T2 — Goal Decomposer + Session Relay (30 min) |
| 96 | Cross-Session Context Transfer + Quality Gates |
| 97 | Progressive Trust + Parallel subtasks (T3: 1-2 hours) |
