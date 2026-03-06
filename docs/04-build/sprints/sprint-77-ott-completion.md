# Sprint 77: OTT Channel Completion — Zalo Command Parity

**Date:** 2026-03-04
**Status:** COMPLETE
**Duration:** ~13h
**Prerequisites:** Sprint 76 ✅ Complete (OTT Channel Enhancement, 14 commands Telegram-only)

---

## 1. Sprint Goal

Deliver **slash command support to Zalo channel** by reusing the 10 shared command handlers from Sprint 76 and adding Zalo-specific command dispatch. Also fix 2 Telegram command sanitization issues (CTO C2) before porting.

---

## 2. Context

- **Problem:** Sprint 76 added 14 slash commands to Telegram, but Zalo channel has **zero command support**. Zalo only processes agent mentions (`@agent task`); slash commands like `/help`, `/agents`, `/gate` are silently ignored.
- **Root Cause:** `createZaloAgentHandler()` in `agent-handler.ts` only checks `hasMention()` — no command parsing.
- **Solution:** Add command detection layer before mention check, reuse existing handlers from `telegram-commands.ts`, strip Markdown for Zalo plain text.
- **Design Docs:** [ADR-020](../../02-design/01-ADRs/ADR-020-OTT-Channel-Completion.md) (Accepted)
- **CTO Review:** 6/10 APPROVED WITH CONDITIONS (Track A+D only; Track B WhatsApp BLOCKED)

### CTO Review Summary

| # | Condition | Resolution |
|---|-----------|-----------|
| C1 | Zalo command dispatch layer missing | New `zalo-commands.ts` + wiring in `createZaloAgentHandler()` |
| C2 | Fix unsanitized echo in `handleFixCommand` + `handleConsultCommand` | Apply `sanitizeForEcho()` to `stage` and `query` args |
| C3 | WhatsApp CEO decision gate | BLOCKED — pending CEO decision (Cloud API vs Baileys vs Defer) |
| W1 | Zalo READ-only is comment-based | Add runtime assertion in `invokeZaloAgent()` |

---

## 3. Scope

### In Scope

| # | Pri | Task | Hours | Deliverable |
|---|-----|------|-------|-------------|
| 1 | P1 | C2: Fix Telegram command sanitization | 0.5h | `sanitizeForEcho()` applied to `stage` and `query` args |
| 2 | P0 | Zalo command handler (`zalo-commands.ts`) | 3h | `handleZaloCommand()`, `stripMarkdown()`, `generateZaloHelpMessage()` |
| 3 | P0 | Zalo approve/reject/status handlers | 1.5h | Shared workflow command handlers for OTT channels |
| 4 | P0 | Wire command dispatch into `createZaloAgentHandler()` | 1h | Command detection before mention check |
| 5 | P1 | W1: READ-only runtime assertion | 0.5h | Guard in `invokeZaloAgent()` |
| 6 | P0 | Unit tests (`zalo-commands.test.ts`) | 3h | 15+ tests for 12 commands + stripMarkdown + dispatch |
| 7 | P1 | Manual test (`mt-77-zalo-commands.mjs`) | 1.5h | Live test via Zalo Bot API |
| 8 | P1 | ADR-020 + SPRINT-INDEX update | 2h | Architecture decision record |

**Total: ~13h, 15+ new tests**

### Out of Scope

- WhatsApp channel (BLOCKED — CTO P0-1 Baileys ToS risk, pending CEO decision)
- Ollama Remote fallback (already completed by CEO)
- `/mode` command on Zalo (intentionally READ-only, CTO P1-5)
- `/webhook` command on Zalo (Telegram-specific feature)
- PATCH mode for Zalo (no inline keyboard support for confirmation)

---

## 4. Acceptance Criteria

### AC-1: Zalo Command Recognition
```
Given a CEO sends "/help" via Zalo Bot
When the message is received by createZaloAgentHandler()
Then the handler recognizes it as a slash command
And returns a plain-text command list (no Markdown formatting)
```

### AC-2: 12 Commands Supported
```
Given Zalo channel is active
When CEO sends any of the 12 supported commands:
  /help, /agents, /teams, /gate, /compliance, /fix,
  /consult, /config, /init, /approve, /reject, /status
Then each command returns a formatted plain-text response
And response has no Telegram Markdown characters (*_`[])
```

### AC-3: Agent Mentions Unaffected
```
Given a CEO sends "@researcher analyze code" via Zalo
When the message is received
Then the agent mention flow is preserved (unchanged from Sprint 57)
And the message is NOT treated as a command
```

### AC-4: Unknown Commands Fall Through
```
Given a CEO sends "/unknown" via Zalo
When the handler does not recognize the command
Then it falls through to the agent mention check
And is silently ignored (no error response)
```

### AC-5: Telegram Sanitization Fixed
```
Given handleFixCommand receives --stage "<script>alert(1)</script>"
When the response is generated
Then the stage arg is sanitized via sanitizeForEcho()
And no raw HTML/script content appears in the response
```

---

## 5. Technical Design

### 5.1 Architecture

```
Zalo Incoming Message
  │
  ├─ message.sanitized.startsWith("/") ?
  │   ├─ YES → handleZaloCommand(text, sendFn)
  │   │         ├─ Parse command + args
  │   │         ├─ Route to shared handler (telegram-commands.ts)
  │   │         ├─ stripMarkdown(response)
  │   │         └─ sendFn(plainTextResponse)
  │   │
  │   └─ NO → hasMention(text, teamRegistry) ?
  │             ├─ YES → handleZaloAgentMention()  (existing)
  │             └─ NO → ignore
```

### 5.2 Key Files

| File | Role | Action |
|------|------|--------|
| `src/channels/telegram/telegram-commands.ts` | Shared handlers | MODIFY (C2 sanitization) |
| `src/channels/zalo/zalo-commands.ts` | Zalo command dispatcher | NEW |
| `src/channels/zalo/agent-handler.ts` | Agent handler | MODIFY (add command detection) |
| `tests/channels/zalo/zalo-commands.test.ts` | Unit tests | NEW |
| `tests/manual/mt-77-zalo-commands.mjs` | Manual test | NEW |

### 5.3 Command Parity Matrix

| Command | Telegram | Zalo | Handler Source |
|---------|----------|------|---------------|
| `/help` | ✅ Markdown | ✅ Plain text | Zalo-specific `generateZaloHelpMessage()` |
| `/agents` | ✅ | ✅ | `handleAgentsCommand()` → `stripMarkdown()` |
| `/teams` | ✅ | ✅ | `handleTeamsCommand()` → `stripMarkdown()` |
| `/gate` | ✅ | ✅ | `handleGateCommand()` → `stripMarkdown()` |
| `/compliance` | ✅ | ✅ | `handleComplianceCommand()` → `stripMarkdown()` |
| `/fix` | ✅ | ✅ | `handleFixCommand()` → `stripMarkdown()` |
| `/consult` | ✅ | ✅ | `handleConsultCommand()` → `stripMarkdown()` |
| `/config` | ✅ | ✅ | `handleConfigCommand()` → `stripMarkdown()` |
| `/init` | ✅ | ✅ | `handleInitCommand()` → `stripMarkdown()` |
| `/approve` | ✅ | ✅ | Shared OTT handler (new) |
| `/reject` | ✅ | ✅ | Shared OTT handler (new) |
| `/status` | ✅ | ✅ | Shared OTT handler (new) |
| `/mode` | ✅ | ❌ SKIP | Zalo READ-only by design |
| `/webhook` | ✅ | ❌ SKIP | Telegram-specific |

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Zalo 2000 char limit for long responses | Medium | Low | Chunking already in ZaloBotChannel.sendTextMessage() |
| zapps.me transient 502 errors | Medium | Low | isAvailable() fallback already fixed in Sprint 76 |
| stripMarkdown misses edge cases | Low | Low | Test with all 12 command outputs |

---

## 7. Success Criteria

- [x] 12 Zalo commands working (verified via unit + manual test)
- [x] C2: Telegram command sanitization fixed (3 echo sites + gateId)
- [x] W1: READ-only runtime assertion added
- [x] All existing tests passing (no regressions)
- [x] 72 new tests (49 zalo-commands + 23 zalo-agent-handler)
- [x] ADR-020 written
- [x] Manual test `mt-77-zalo-commands.mjs` passing (12/12)
- [x] SPRINT-INDEX.md updated
- [x] CTO Review: 9/10 APPROVED (2026-03-05)

---

**@pm → @architect (ADR-020) → @coder (implementation)**

*Sprint 77 Plan — SDLC Framework 6.1.1 — Stage 04-BUILD*
