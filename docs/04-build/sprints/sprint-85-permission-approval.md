---
spec_id: SPEC-04BUILD-SPRINT85
title: "Sprint 85: Permission Approval via Telegram"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024"]
---

# Sprint 85: Permission Approval via Telegram

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-024 §8.4
**Preceding sprint:** Sprint 84 (SOUL Bridge Foundation) ✅
**Est. effort:** ~40h
**Est. tests:** ~20

---

## Goal

Forward Claude Code permission requests (Bash, Edit, Write) to CEO on Telegram for approval or denial. Currently, granting or denying permissions requires physical terminal access. This sprint eliminates that constraint by routing all hook events through the Telegram bot with inline keyboard buttons.

**Key principle:** CEO approves from anywhere — terminal presence is no longer required for Claude Code permission gates.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| Claude Code Stop hook → Telegram notification | Free-text sendKeys — Sprint 86 |
| Permission display with Approve/Deny inline keyboard | Hook installer automation — Sprint 86 |
| HMAC-SHA256 signed hook events | Non-Claude agent permissions |
| Permission relay: sendKeys `y` or `n` to tmux pane | Brain/Context injection — Sprint 87 |
| Audit trail: `hook_permission`, `permission_decision` events | Evaluator pipeline — Sprint 88 |
| Permission timeout: 5 min → auto-deny | |
| Auto-approve for `read` mode operations | |

---

## Architecture

```
Claude Code → Stop Hook
           → hook-handler.ts
           → HMAC-SHA256 sign + nonce
           → Telegram bot (inline keyboard: Approve / Deny)
           → CEO taps button
           → sendKeys "y\n" or "n\n"
           → tmux pane
           → Audit log (hook_permission + permission_decision)
```

### Hook Event Flow

1. Claude Code fires Stop hook with tool name, file path, risk mode.
2. `hook-handler.ts` validates HMAC signature using `node:crypto.timingSafeEqual()`.
3. Validated event is forwarded to Telegram bot as permission request message.
4. CEO taps **Approve** or **Deny** inline button.
5. Bridge calls `sendKeys("y\n")` or `sendKeys("n\n")` into the active tmux pane.
6. Audit event is written to `.endiorbot/audit-logs/`.

### Nonce Format

```
{sessionId}:{randomHex(16)}
```

Nonces are single-use and expire after 5 minutes. Duplicate nonces are rejected.

---

## Security

| Control | Detail |
|---------|--------|
| HMAC-SHA256 | All hook events signed; **CTO A1: use `node:crypto.timingSafeEqual()`** to prevent timing attacks |
| Nonce | `{sessionId}:{randomHex}` — single-use, 5-minute TTL |
| Timeout | Permission request expires after 5 min → auto-deny |
| Auto-approve | `read` mode operations approved without Telegram prompt |
| Audit | All decisions logged as `hook_permission` + `permission_decision` events |

---

## Key Deliverables

1. **`src/bridge/hooks/hook-handler.ts`** — Receives Stop hook events, validates HMAC, dispatches to Telegram.
2. **`src/bridge/hooks/hook-verifier.ts`** — `timingSafeEqual()`-based HMAC-SHA256 verification, nonce store.
3. **`src/bridge/hooks/permission-relay.ts`** — Calls `sendKeys("y\n")` or `sendKeys("n\n")` into tmux pane on CEO decision.
4. **Telegram inline keyboard** — Permission request message with **Approve** / **Deny** buttons in `telegram-commands.ts`.
5. **Permission timeout handler** — Background timer per pending request; auto-deny + audit on expiry.
6. **Audit events** — `hook_permission` (request received) and `permission_decision` (approve/deny/timeout) in existing audit logger.

---

## Test Plan (~20 tests)

| Test Area | Cases |
|-----------|-------|
| Hook event parsing | Valid JSON, missing fields, unknown tool |
| HMAC verification | Valid signature, invalid signature, timing-safe comparison |
| Nonce validation | First use passes, replay rejected, expired nonce rejected |
| Auto-approve | `read` mode bypasses Telegram, write/bash prompts Telegram |
| Telegram UI | Approve button triggers sendKeys `y\n`, Deny triggers `n\n` |
| Permission relay | sendKeys called with correct session ID and pane |
| Timeout | 5-min expiry fires auto-deny + audit event |
| Audit trail | `hook_permission` event on receipt, `permission_decision` on outcome |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 86 | /send Command + Hook Installer (ADR-024 §8.5) |
| 87 | Brain L4 + Context Anchoring in Bridge (ADR-025) |
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline |
| 89 | Unified App Launcher (infrastructure) |
