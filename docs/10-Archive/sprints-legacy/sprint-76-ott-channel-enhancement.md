# Sprint 76: OTT Channel Enhancement — Full Agent & Team Parity + Webhook

**Date:** 2026-03-04
**Status:** IN PROGRESS
**Duration:** 30h
**Prerequisites:** Sprint 75 ✅ Complete (Compliance Fix Engine, 4,785 tests)

---

## 1. Sprint Goal

Bring OTT channels (Telegram + Zalo) to full parity with Sprint 74 Team Agent System and Sprint 75 Compliance Fix. Add webhook support for both channels. Fix critical gaps: team support (0/7→7/7), agent keyboard (4/13→12/13), extend commands (4→14), enable webhook mode, and secure mode escalation with CEO confirmation.

---

## 2. Context

- **Problem:** OTT channels built in Sprint 38/46/57 with 4 agents, 4 commands, polling only. Sprint 74 added 13 agents + 7 teams. Sprint 75 added `compliance fix`. OTT has none of these.
- **CEO Reports:** OTT Channel Audit (5 gaps) + Telegram Diagnostic (timeout, lost message)
- **CEO Note:** Claude Code sessions with large context + multiple agents can take **several minutes** — timeout must account for this.
- **CEO Requirement:** Webhook support for both Telegram and Zalo.
- **Design Doc:** [ADR-019](../../02-design/01-ADRs/ADR-019-OTT-Channel-Enhancement.md) (to be created)
- **Scope:** Both Telegram AND Zalo (unified OTT layer)
- **CTO Review:** 8/10 APPROVED WITH CONDITIONS (C1-C3 addressed)
- **CPO Review:** APPROVED (CA1-CA2 advisory)

### Gap Summary

| Gap | Current | Target |
|-----|---------|--------|
| Agent Keyboard | 4/13 agents (31%) | 12/13 (assistant excluded) |
| Team Support | 0/7 teams (0%) | 7/7 tier-aware |
| Commands | 4 (/approve, /reject, /status, /help) | 14 (+10 new, incl Sprint 75) |
| Mode | Hardcoded READ | READ default + PATCH with CEO confirm |
| Help Message | Lists 4 commands only | Dynamic, all commands + agent/team format |
| Bridge Timeout | Fixed, causes timeout on large context | Configurable, longer default for OTT |
| Telegram delivery | Polling only (3s interval) | Webhook mode (instant, lower resource) |
| Zalo delivery | Webhook handler exists but not wired | Webhook wired to HTTP server |

---

## 3. Scope

### In Scope

| # | Pri | Task | Hours | Deliverable |
|---|-----|------|-------|-------------|
| 0 | P0 | ADR-019 document | 1.5h | Architecture decisions committed before code |
| 1 | P0 | Team support in OTT agent handlers | 2h | Pass `getTeamRegistry()` to `parseMention()` in Telegram + Zalo |
| 2 | P0 | Agent keyboard — 12 agents, tier-aware | 2.5h | `createAgentSelectionKeyboard(tier?)` with categorized rows |
| 3 | P0 | Team keyboard | 1.5h | `createTeamSelectionKeyboard(tier?)` tier-appropriate |
| 4 | P1 | Extended commands (+10, incl Sprint 75) | 4h | /gate, /compliance, /fix, /consult, /agents, /teams, /config, /init, /mode, /webhook |
| 5 | P1 | Updated help message + formatAgentNotFound | 1.5h | Dynamic help with all 14 commands + agent/team format |
| 6 | P1 | Telegram webhook mode | 4h | `setWebhook()` + HTTP endpoint on gateway server (CTO C2: +1h for POST body parsing) |
| 7 | P1 | Zalo webhook wiring | 2h | Wire existing `handleWebhookEvent()` to gateway HTTP server |
| 8 | P2 | Mode escalation (READ→PATCH) | 3h | CEO confirm workflow via OTT keyboard/text |
| 9 | P2 | OTT bridge timeout config | 1h | Configurable timeout, longer default (5min for OTT) |
| 10 | P1 | i18n OTT keys (EN + VI) | 1h | ~25 new message keys |
| 11 | — | Tests (~75 new) | 5h | Unit tests for all tasks |
| 12 | — | Build + full test suite | 1h | `pnpm build` + `pnpm test` pass |

**Total: 30h, ~75 new tests**

### Out of Scope

- Discord/Slack channels
- Full CLI command parity (only high-value commands)
- Zalo inline keyboards (API doesn't support; use text-based hints)
- Lost message recovery (requires message queue — future sprint)
- Auto-retry on transient network errors (existing bridge retry handles this)
- Telegram webhook with self-signed certificates (require valid HTTPS)

---

## 4. Acceptance Criteria

### AC-1: Team Mention via OTT
```
Given CEO sends "@planning review sprint" via Telegram
When agent handler processes the message
Then parseMention receives teamRegistry
And resolves "planning" → PM (leader) with team context
And CEO receives response from PM
```

### AC-2: Full Agent Keyboard
```
Given STANDARD tier project
When CEO taps agent selection keyboard
Then shows 12 agents: 9 SE4A + 3 SE4H (no assistant)
With proper icons and 3-per-row layout
```

### AC-3: Team Keyboard
```
Given LITE tier project → shows only: @fullstack
Given STANDARD tier → shows: fullstack, planning, dev, qa
```

### AC-4: Extended Commands (incl Sprint 75)
```
Given CEO sends "/agents" → lists all agents with icons
Given CEO sends "/teams" → lists tier-appropriate teams
Given CEO sends "/gate G2" → returns gate status
Given CEO sends "/compliance score" → returns compliance score
Given CEO sends "/fix --dry-run" → runs compliance fix preview
Given CEO sends "/fix --stage 01-planning" → fixes specific stage
```

### AC-5: Telegram Webhook
```
Given CEO sends "/webhook on" via Telegram
When webhook URL is configured
Then Telegram Bot API setWebhook() is called
And polling stops
And messages arrive instantly via HTTP POST
Given CEO sends "/webhook off"
Then deleteWebhook() is called and polling resumes
```

### AC-6: Zalo Webhook
```
Given Zalo OA sends webhook event to /webhook/zalo
When MAC signature is valid
Then event is routed to handleWebhookEvent()
And CEO receives response
When MAC signature is invalid → 403 Forbidden
```

### AC-7: Mode Escalation
```
Given CEO sends "@coder PATCH: implement feature"
Then confirm keyboard shown before PATCH invocation
Only after CEO confirms → invoke with mode: "PATCH"
```

### AC-8: Updated Help
```
Given CEO sends "/help"
Then lists all 14 commands + agent/team format + webhook info
```

---

## 5. CTO Blocking Conditions (Resolved)

| # | Condition | Resolution |
|---|-----------|------------|
| C1 | `hasMention()` does NOT accept `teamRegistry` — `@planning` mentions return false | Update `hasMention(input, teamRegistry?)` signature, forward to inner `parseMention()` |
| C2 | Gateway `handleHttpRequest()` has no POST body parsing — webhook routes cannot receive JSON | Implement HTTP POST body accumulation (`req.on('data')`/`req.on('end')`) in `WebhookHandler` class |
| C3 | Zalo uses OA platform, not Bot API — `zalo-bot-api.ts:setWebhook()` is wrong API | Remove programmatic `setWebhook()` call; webhook URL set in Zalo OA admin panel |

## 6. CTO Advisory Items (Addressed)

| # | Advisory | Action |
|---|----------|--------|
| W1 | `handleHttpRequest()` is private | Webhook routing added inside private method; WebhookHandler class handles logic externally |
| W2 | 64-byte callback_data limit | Team IDs all < 10 chars; `team:executive:start` = 20 chars — safe |
| W3 | `/fix` via OTT high-risk | Default dry-run; `--yes` requires second OTT confirm; audit log all invocations |
| W4 | CORS wildcard on webhook endpoints | Skip `Access-Control-Allow-Origin: *` for `/webhook/*` routes |
| W5 | Rate limiting for webhook | Basic rate limit: max 100 req/min per IP for webhook endpoints |
| W6 | Zalo replay protection | Timestamp freshness check — reject events older than 5 minutes |

## 7. CPO Advisory Items

| # | Advisory | Action |
|---|----------|--------|
| CA1 | Webhook docs | ADR-019 includes: enable webhook (TG: `/webhook on`), reverse proxy/ngrok setup, Zalo OA admin panel |
| CA2 | `/fix` UX | Progress message "Running compliance fix..." + result "Fix complete: before% → after%" via i18n keys |

---

## 8. Architecture

### Team Support Flow (Task 1)
```
CEO → "@planning review sprint" via Telegram/Zalo
  → agent-handler imports getTeamRegistry()
  → hasMention(content, getTeamRegistry())   ← CTO C1 FIX
  → parseMention(content, getTeamRegistry())
  → mention-parser detects "planning" as team
  → resolves to PM (leader) with TeamContext
  → PM SOUL enriched with ## Team Context
  → CEO receives response
```

### Webhook Architecture (Tasks 6-7)

**Current state:**
- Telegram: polling via `getUpdates()` every 3s (`telegram-channel.ts:273-297`)
- Zalo: `handleWebhookEvent()` exists (`zalo-channel.ts:274-333`) but NOT wired to any HTTP server

**Target state:**
```
                    ┌─────────────────────────┐
                    │  WebGatewayServer        │
                    │  (gateway/web-server.ts) │
                    │  Port: 18790 (existing)  │
                    ├─────────────────────────┤
Internet ──HTTPS──► │  /ws           → WebSocket│
                    │  /api/status   → JSON     │
                    │  /api/health   → 200 OK   │
    NEW ──────────► │  /webhook/telegram → TG   │
    NEW ──────────► │  /webhook/zalo     → Zalo │
                    └─────────────────────────┘
                         │              │
                    ┌────▼────┐   ┌────▼────┐
                    │Telegram │   │  Zalo   │
                    │Channel  │   │ Channel │
                    │handleUp │   │handleWH │
                    │date()   │   │Event()  │
                    └─────────┘   └─────────┘
```

**Design decisions:**
1. **Reuse WebGatewayServer** HTTP server (`gateway/web-server.ts:131`) — already has `http.createServer()`
2. **CTO C2:** WebhookHandler class handles POST body parsing (chunk accumulation, JSON parse, size limit)
3. **Telegram:** Add `/webhook/telegram` endpoint → calls existing `handleUpdate()`. Keep polling as fallback.
4. **CTO C3:** Zalo uses OA platform — webhook URL set in admin panel, NOT via `setWebhook()` API
5. **Switch mode:** `/webhook on` enables webhook, `/webhook off` reverts to polling (Telegram only)
6. **HTTPS requirement:** Telegram requires HTTPS for webhooks. CEO uses reverse proxy (nginx/cloudflare/ngrok).

### Mode Escalation Flow (Task 8)
```
CEO → "@coder PATCH: implement feature X"
  → agent-handler detects PATCH modifier
  → sends patch summary + confirm keyboard  ← SECURITY GATE
  → CEO taps [Confirm] or [Reject]
  → only on confirm: invoke with mode: "PATCH"
  → after apply/reject: reset to READ
```

### Timeout Strategy (Task 9, CEO Note)
```
Claude Code + large context + multiple agents = several minutes normal
  → OTT default timeout: 300s (5 min) — same as CLI
  → DO NOT reduce to 90s (CEO explicitly noted this)
  → Configurable via ENDIORBOT_OTT_TIMEOUT env var
```

---

## 9. Files

### New Files (4)

| File | Purpose |
|------|---------|
| `docs/02-design/01-ADRs/ADR-019-OTT-Channel-Enhancement.md` | Architecture decisions (webhook + agent/team parity) |
| `src/channels/telegram/telegram-commands.ts` | Extracted command handlers (10 new) |
| `src/channels/ott/webhook-handler.ts` | Webhook HTTP endpoint handler for Telegram + Zalo |
| `tests/channels/ott/ott-enhancement.test.ts` | ~75 new tests |

### Modified Files (9)

| File | Change |
|------|--------|
| `src/channels/telegram/agent-handler.ts` | Pass teamRegistry to parseMention, mode escalation |
| `src/channels/telegram/keyboards.ts` | Full agent keyboard (12), team keyboard, mode confirm keyboard |
| `src/channels/telegram/telegram-channel.ts` | +10 commands, help rewrite, webhook start/stop methods |
| `src/channels/zalo/agent-handler.ts` | Same as Telegram: teamRegistry, mode, timeout |
| `src/channels/zalo/zalo-channel.ts` | Expose `handleWebhookEvent()` for external HTTP routing |
| `src/gateway/web-server.ts` | Add `/webhook/telegram` and `/webhook/zalo` routes |
| `src/agents/orchestrator/mention-parser.ts` | `hasMention(input, teamRegistry?)` signature (CTO C1) |
| `src/channels/ott/response-formatter.ts` | `formatAgentNotFound()` dynamic list |
| `src/i18n/messages.ts` | +25 OTT keys (EN + VI) |

### Key Existing Files (reuse, don't recreate)

| File | What to Reuse |
|------|---------------|
| `src/agents/orchestrator/team-registry.ts:373` | `getTeamRegistry(tier?)` singleton |
| `src/agents/orchestrator/mention-parser.ts:243` | `parseMention(input, teamRegistry?)` |
| `src/agents/types/handoff.ts:14-48` | `AgentRole` (13 roles) |
| `src/agents/types/team.ts:38-45` | `TeamId` (7 teams) |
| `src/channels/telegram/keyboards.ts:96-113` | `createPatchConfirmKeyboard()` existing |
| `src/channels/telegram/keyboards.ts:297-313` | Agent icons (all 12 already defined) |
| `src/gateway/web-server.ts:131` | Existing HTTP server (`http.createServer()`) |
| `src/channels/zalo/zalo-channel.ts:274-333` | Existing `handleWebhookEvent()` method |

---

## 10. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Webhook server | Reuse WebGatewayServer (port 18790) | Avoid new server; already has HTTP + WebSocket |
| Telegram webhook | setWebhook/deleteWebhook API | Standard Telegram Bot API; keep polling fallback |
| Zalo webhook | OA admin panel setup (CTO C3) | Zalo OA ≠ Zalo Bot; no programmatic registration |
| POST body parsing | WebhookHandler class (CTO C2) | Gateway has no POST support; handler owns parsing |
| hasMention | Add optional teamRegistry param (CTO C1) | Backward compatible; enables team detection in OTT |
| Mode default | READ, PATCH requires 2-step confirm | Security: OTT is less controlled than CLI |
| Timeout | 300s (5 min), configurable via env | CEO noted large sessions take minutes |
| Agent keyboard | 12 agents, 3 per row, tier-aware | Mobile readability; assistant excluded (router) |
| CORS on webhooks | Skip wildcard CORS (W4) | Server-to-server; no browser involved |
| Rate limiting | 100 req/min per IP (W5) | Protect against webhook flooding |

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `hasMention()` signature change breaks callers | Medium | Optional param, backward compatible |
| Telegram 64-byte callback_data limit | Medium | Use short team IDs (max 10 chars) |
| PATCH mode via OTT = security risk | High | 2-step confirm, audit log, CEO-only chat |
| Telegram webhook requires HTTPS | High | Document nginx/cloudflare/ngrok; keep polling fallback |
| Webhook endpoint exposed to internet | High | Secret token validation, chat ID guard, rate limit |
| Zalo webhook MAC verification wrong | Medium | Test with real Zalo OA sandbox |
| `/fix` via OTT may be slow | Low | Show progress indicator, use dry-run by default |
| Zalo no inline keyboards | Low | Text-based quick reply hints |
| Zalo replay attacks (W6) | Medium | Timestamp freshness check (5 min window) |

---

## 12. Test Plan

| Test Group | Count |
|------------|-------|
| Team support (parseMention with registry via OTT) | 8 |
| Agent keyboard (tier-aware, layout, icons) | 6 |
| Team keyboard (tier-aware, callbacks) | 5 |
| Telegram commands (10 new + edge cases) | 15 |
| Help message (14 commands listed) | 3 |
| formatAgentNotFound | 2 |
| Telegram webhook (set/delete, endpoint, secret validation) | 8 |
| Zalo webhook (MAC verification, event routing) | 6 |
| Webhook handler (HTTP parsing, error handling) | 5 |
| Mode escalation (confirm/reject/reset) | 8 |
| OTT timeout config | 3 |
| i18n completeness | 2 |
| Existing handler tests updated | 4 |
| **Total** | **~75** |

---

## 13. Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| ADR-019 | To be created | `docs/02-design/01-ADRs/ADR-019-OTT-Channel-Enhancement.md` |
| Sprint 74 Team Agent System | ✅ Complete | `src/agents/orchestrator/team-registry.ts`, `mention-parser.ts` |
| Sprint 75 Compliance Fix Engine | ✅ Complete | `src/sdlc/compliance/fix-engine.ts` |
| WebGatewayServer HTTP server | ✅ Exists | `src/gateway/web-server.ts:131` |
| Zalo `handleWebhookEvent()` | ✅ Exists | `src/channels/zalo/zalo-channel.ts:274` |
| Agent icons (12) | ✅ Exists | `src/channels/telegram/keyboards.ts:297-313` |
| PatchConfirmKeyboard | ✅ Exists | `src/channels/telegram/keyboards.ts:96-113` |

---

## 14. Definition of Done

- [ ] ADR-019 committed before code
- [ ] `pnpm build` — zero errors
- [ ] All existing 4,785 tests pass
- [ ] ~75 new tests pass
- [ ] Manual E2E: `@planning task` via Telegram → PM with team context
- [ ] Manual E2E: `/agents` lists 13 agents, `/teams` lists tier teams
- [ ] Manual E2E: Agent keyboard shows 12 agents
- [ ] Manual E2E: `/help` shows 14 commands
- [ ] Manual E2E: `/fix --dry-run` returns compliance preview
- [ ] Manual E2E: Telegram webhook mode works (set/delete/receive)
- [ ] Manual E2E: Zalo webhook receives and processes events
- [ ] i18n: All keys have EN + VI
- [ ] PATCH mode requires CEO confirmation
- [ ] Webhook endpoints validate secret tokens
