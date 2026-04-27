---
spec_id: SPEC-04BUILD-SPRINT86
title: "Sprint 86: /send Command + Hook Installer"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024", "ADR-025"]
---

# Sprint 86: /send Command + Hook Installer

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-024 §8.5, ADR-025 (Turn-time layer)
**Preceding sprint:** Sprint 85 (Permission Approval via Telegram)
**Est. effort:** ~40h
**Est. tests:** ~25
**Milestone:** ADR-024 complete at Sprint 86

---

## Goal

CEO sends task instructions to running agent sessions via Telegram `/send` command, with turn-time context automatically prepended. A hook installer CLI command (`bridge install-hooks`) automates Claude Code hook setup so CEO never has to manually edit `.claude/settings.json`.

**Key principle:** Zero-friction task injection — CEO types `/send`, agent receives context-enriched instruction immediately.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `/send <sessionId> <message>` Telegram command | Brain L4 injection — Sprint 87 |
| Turn-time context prefix (sprint goals, blockers, task) | Evaluator pipeline — Sprint 88 |
| Hook installer: `bridge install-hooks <path>` | Agent Teams — Sprint 89 |
| CLI flag research doc (cursor/codex/gemini) | Full Brain L2 pattern matching |
| RiskMode enforcement on sendKeys | Non-Claude agent hook support |
| **CTO A2: sendKeys MAX 4096 chars** — reject longer with error | |
| `endiorbot bridge install-hooks <path>` CLI subcommand | |

---

## Architecture

```
CEO → /send <sessionId> <message>
    → turn-context.ts builds 2K context prefix
    → RiskMode check (PATCH/INTERACTIVE allowed)
    → sendKeys(prefix + message) → tmux pane
    → Audit log (send_command event)

endiorbot bridge install-hooks <path>
    → hook-installer.ts
    → writes .claude/settings.json hooks block
    → reports installed/skipped/error per hook
```

### Turn-time Context Format

```
[EndiorBot Context]
Sprint: {current sprint name}
Blockers: {active blockers list or "none"}
Task: {last task from active.json}
[End Context]

{user's message}
```

Context prefix is capped at 2K tokens. If prefix + message exceeds 4096 chars, the command is rejected with a clear error message before sendKeys is called.

---

## CLI Flag Research

Sprint 86 includes a research document (`docs/02-design/research/agent-cli-flags.md`) covering:

| Agent | Flag Candidate | Status |
|-------|---------------|--------|
| Claude Code | `--append-system-prompt-file` | Confirmed (Sprint 84) |
| Cursor | TBD | Research required |
| Codex | TBD | Research required |
| Gemini CLI | TBD | Research required |

Results feed into Sprint 89 (Unified App Launcher).

---

## Key Deliverables

1. **`/send` command** in `src/channels/telegram/telegram-commands.ts` — Parses `<sessionId> <message>`, enforces RiskMode, calls turn-context builder, calls sendKeys.
2. **`src/bridge/intelligence/turn-context.ts`** — Turn-time context builder: reads `~/.endiorbot/active.json`, formats 2K context prefix with sprint goals, blockers, last task.
3. **`src/bridge/hooks/hook-installer.ts`** — Writes Claude Code Stop/Pre-tool hooks to `.claude/settings.json`; idempotent (skip if already present, `--force` to overwrite).
4. **`endiorbot bridge install-hooks <path>` CLI subcommand** — Wires `hook-installer.ts` into the `bridge` command registered in `src/cli/commands/bridge.ts`.
5. **4096-char guard** — `sendKeys` wrapper rejects payloads exceeding 4096 chars with structured `EndiorBotError` before any tmux call.
6. **CLI flag research doc** — `docs/02-design/research/agent-cli-flags.md` summarizing flags for cursor, codex, gemini.

---

## Test Plan (~25 tests)

| Test Area | Cases |
|-----------|-------|
| /send parsing | Valid `<sessionId> <message>`, missing sessionId, missing message |
| RiskMode enforcement | PATCH/INTERACTIVE allowed, READ blocked for /send |
| sendKeys relay | Correct pane targeted, prefix prepended correctly |
| 4096-char limit | Message at limit passes, message over limit rejected with error |
| Turn-context builder | Sprint goals included, blockers included, "none" when empty |
| Context token cap | Prefix truncated to 2K tokens when active.json data is large |
| Hook installer | Creates `.claude/settings.json`, idempotent on re-run, `--force` overwrites |
| Hook installer errors | Invalid path rejected, missing directory reported cleanly |
| Audit | `send_command` event logged with sessionId and message length |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 87 | Brain L4 + Context Anchoring in Bridge (ADR-025) |
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline |
| 89 | Unified App Launcher (infrastructure) |
| 90 | Agent Teams — Files |
