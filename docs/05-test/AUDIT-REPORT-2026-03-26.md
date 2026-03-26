# EndiorBot Comprehensive Audit Report

**Date:** 2026-03-26
**Version:** 0.1.0-beta.1
**Framework:** SDLC v6.2.0
**Auditor:** Claude Code (Opus 4.6)

---

## Executive Summary

EndiorBot beta has been audited across CLI, OTT (Telegram/Zalo), and Web UI channels. The build is clean (zero TypeScript errors), all 6,596 tests pass, and the command system is properly wired. However, several gaps exist between "declared ready" and "production ready" that must be addressed before wider community adoption.

**Overall Verdict: BETA PASS with 7 issues to fix**

---

## 1. Build & Infrastructure

| Check | Result | Details |
|-------|--------|---------|
| `pnpm build` | PASS | Zero TypeScript errors |
| `endiorbot.mjs` executable | PASS | `-rwxr-xr-x`, shebang script |
| `dist/` completeness | PASS | All 13 modules compiled |
| `pnpm test` | PASS | 6,596 passing, 0 failing, 10 skipped |
| npm package | PASS | Published as `@dttai/endiorbot@0.1.0-beta.1` |

---

## 2. CLI Command Audit (40 commands)

### 2.1 Tested Commands

| # | Command | Result | Notes |
|---|---------|--------|-------|
| 1 | `--help` | PASS | Shows 40+ commands |
| 2 | `--version` | PASS | Outputs `0.1.0-beta.1` |
| 3 | `init --help` | PASS | Shows `--tier`, `--path`, `--analyze`, `--force`, `--skip-analysis` |
| 4 | `serve --help` | PASS | Shows `-p/--port`, `--no-telegram`, `--no-zalo` |
| 5 | `compliance check` | PASS | L1=100%, L2=100%, Tier=STANDARD |
| 6 | `compliance score` | PASS | Shows L1/L2 percentages + 6 warnings |
| 7 | `gate status` | WARN | "No active project" — expected without `start` |
| 8 | `status` | PASS | Reports "No active project" |
| 9 | `projects` | PASS | Lists 3 tracked projects |
| 10 | `models` | PASS | Shows OpenAI(6), Gemini(4), Claude(3) |
| 11 | `nonexistent` | PASS | Exit code 1 + `error: unknown command` |

### 2.2 CLI Registration

- **29 command modules** registered in `register-all.ts`
- **11 agent shortcuts**: `@researcher`, `@pm`, `@pjm`, `@architect`, `@coder`, `@reviewer`, `@tester`, `@devops`, `@ceo`, `@cpo`, `@cto`
- **Total: 40 CLI commands**

---

## 3. OTT Command Audit (31 commands)

### 3.1 Command Registry

All 31 commands registered in `createCommandDispatcher()`:

```
agents, approve, attach, capture, compliance, config, consult, cost, cp,
eval, fix, focus, gate, help, init, kill, kill-team, launch, link, mode,
reject, repos, run, send, sessions, sh, switch, team-status, teams,
webhook, where
```

### 3.2 Channel Support Matrix

| Command | CLI | Web | Telegram | Zalo | Auth |
|---------|-----|-----|----------|------|------|
| `/help` | Y | - | Y | Y | No |
| `/agents` | Y | - | Y | Y | No |
| `/teams` | Y | - | Y | Y | No |
| `/gate` | Y | - | Y | Y | No |
| `/compliance` | Y | - | Y | Y | No |
| `/fix` | Y | - | Y | Y | No |
| `/consult` | Y | - | Y | Y | No |
| `/config` | Y | - | Y | Y | No |
| `/init` | Y | - | Y | Y | No |
| `/cost` | Y | - | Y | Y | No |
| `/link` | Y | - | Y | Y | No |
| `/where` | Y | - | Y | - | No |
| `/webhook` | Y | - | Y | - | No |
| `/repos` | Y | - | Y | - | No |
| `/mode` | Y | - | Y | - | Yes |
| `/launch` | Y | - | Y | - | Yes |
| `/sessions` | Y | - | Y | - | Yes |
| `/switch` | Y | - | Y | - | Yes |
| `/capture` | Y | - | Y | - | Yes |
| `/kill` | Y | - | Y | - | Yes |
| `/send` | Y | - | Y | - | Yes |
| `/eval` | Y | - | Y | - | Yes |
| `/team-status` | Y | - | Y | - | Yes |
| `/kill-team` | Y | - | Y | - | Yes |
| `/focus` | Y | - | Y | - | Yes |
| `/cp` | Y | - | Y | - | Yes |
| `/sh` | Y | - | Y | - | Yes |
| `/attach` | Y | - | Y | - | Yes |
| `/run` | Y | - | Y | - | Yes |
| `/approve` | Y | - | Y | Info | Yes |
| `/reject` | Y | - | Y | Info | Yes |

**Coverage:**
- CLI: 31/31 (100%)
- Telegram: 30/31 (97%)
- Zalo: 14/31 (45%) — Bridge commands not supported
- Web UI: 0/31 — AI routing only (by design, ADR-019)

### 3.3 The `/launch` Command Specification

```
/launch <agent> [path] [--as <role>] [--as-team <teamId>] [--risk <mode>]
```

| Flag | Values | Purpose |
|------|--------|---------|
| `--as` | pm, architect, coder, reviewer, tester, etc. | Launch as SOUL role |
| `--as-team` | dev, planning, design, qa, ops, executive | Launch team |
| `--risk` | read, patch | Session risk mode |

**Known UX Issue:** `--mode` does NOT exist. Users must use `--risk`. Unknown flags are treated as positional args, causing confusing "path not found" errors.

---

## 4. Web UI Audit

| Check | Result | Notes |
|-------|--------|-------|
| Static HTML served | PASS | `index.html` at `/` |
| WebSocket connection | PASS | Auto-reconnect enabled |
| AI chat routing | PASS | Messages go via `router.chat` |
| Command dispatch | NOT SUPPORTED | Web UI sends to AI router, not command dispatcher |
| `@agent` mentions | PASS | Handled via `ChannelRouter` |

**Finding:** Web UI is an AI chat interface only. Slash commands (`/launch`, `/repos`, etc.) are NOT supported — they go to the AI model as text, not to `CommandDispatcher`.

---

## 5. Test Coverage Gaps

### 5.1 Overview

| Metric | Value |
|--------|-------|
| Total tests | 6,596 passing |
| Test files | 292 |
| Mocked tests | 31% (91/292) |
| Pure logic tests | 69% (201/292) |
| E2E tests | 5 files |
| Integration tests | 9 files |

### 5.2 Critical Gaps (Priority 1 — HIGH RISK)

| Module | Files Untested | Risk |
|--------|---------------|------|
| `src/security/` | 5 of 6 files (sanitizer, scrubber, rate-limiter, shell-guard, secure-fs) | CRITICAL — security components |
| `src/agents/safety/` | risk-classifier, audit-logger | CRITICAL — safety guardrails |
| `src/agents/invoke/` | claude-code-bridge, patch-validator | CRITICAL — core CC integration |
| `src/memory/` | fact-store, session-handoff, observation-scorer | HIGH — ClawVault memory |
| `src/commands/handlers/` | All 7 handler modules (31 OTT commands) | HIGH — no direct handler tests |

### 5.3 Moderate Gaps (Priority 2)

| Module | Gap |
|--------|-----|
| `src/agents/resilience/` | Conversation limits, failover — zero tests |
| `src/agents/quality/` | Reflect step, history compactor — zero tests |
| `src/agents/handoff/` | Handoff detection — zero tests |
| `src/bridge/repo/workspace-resolver.ts` | ADR-029 workspace resolution — zero tests |
| 14+ CLI commands | `init`, `serve`, `gate`, `consult`, `bridge`, etc. — no CLI-level tests |

### 5.4 Missing E2E Tests

1. No full-stack `serve` E2E (start all channels, send request, verify response)
2. No Telegram webhook E2E (real HTTP POST → OTT adapter → ingress → response)
3. No Zalo webhook E2E
4. No bridge session E2E (tmux start → send → receive → cleanup)
5. No CLI `init` E2E (filesystem effects verification)

---

## 6. Issues Found

### ISSUE-1: Web UI Cannot Execute Commands (DESIGN)
- **Severity:** Medium
- **Impact:** Users typing `/help` in Web UI get AI response, not command list
- **Status:** By design (ADR-019) — Web UI is AI-only
- **Recommendation:** Add command support to Web UI OR clearly document this limitation

### ISSUE-2: `--mode` Flag Does Not Exist (UX) — RESOLVED (Sprint 119)
- **Severity:** Medium
- **Impact:** Users get "path not found: --mode" error
- **Status:** RESOLVED — `--mode` accepted as deprecated alias for `--risk`, emits deprecation warning
- **Fix:** `src/commands/handlers/bridge-commands.ts` — `--mode` maps to `--risk` with warning

### ISSUE-3: Remote Commands Missing Workspace Resolution (BUG) — FALSE POSITIVE
- **Severity:** Medium (originally)
- **Impact:** N/A — workspace resolution works correctly
- **Status:** FALSE POSITIVE — `remote-handlers.ts` uses `getRepoForChat(chatId)` which reads `ChatFocusManager` + `RepoRegistry` directly. 13 repro tests confirm correct behavior.
- **Evidence:** `tests/commands/workspace-resolution.test.ts` (13 tests passing)

### ISSUE-4: `/cost` Missing from Zalo Help (DOC) — RESOLVED (Sprint 119)
- **Severity:** Low
- **Impact:** Zalo users don't see `/cost` command
- **Status:** RESOLVED — Added `/cost` to help text AND dispatch case in `zalo-commands.ts`
- **Fix:** `src/channels/zalo/zalo-commands.ts` — help text + `case "/cost":` dispatch

### ISSUE-5: Security Module 83% Untested (TEST)
- **Severity:** High
- **Impact:** `input-sanitizer`, `output-scrubber`, `rate-limiter`, `shell-guard`, `secure-fs` have no tests
- **Recommendation:** Write tests for all security modules before v1.0

### ISSUE-6: Agent Safety Zero Tests (TEST)
- **Severity:** High
- **Impact:** `risk-classifier` and `audit-logger` are safety guardrails with no verification
- **Recommendation:** Write tests for agent safety modules

### ISSUE-7: Command Handlers Zero Direct Tests (TEST)
- **Severity:** Medium
- **Impact:** 31 OTT command handlers tested only through integration paths
- **Recommendation:** Add unit tests for each handler module

---

## 7. Recommendations

### Must Fix Before v1.0

1. **Write security module tests** — 5 untested files, CRITICAL priority
2. **Write agent safety tests** — risk-classifier, audit-logger
3. **Fix remote command workspace** — ISSUE-3
4. **Add `--mode` alias or better error** — ISSUE-2

### Should Fix

5. **Add command handler unit tests** — all 7 handler modules
6. **Add Web UI command support** or document limitation
7. **Write bridge session E2E** — tmux lifecycle test
8. **Update Zalo help text** — add `/cost`

### Nice to Have

9. **Full-stack serve E2E** — start all channels, send/receive
10. **ClawVault memory tests** — fact-store, session-handoff
11. **Agent resilience/quality tests** — conversation limits, reflect step

---

*Audit Report v1.0 | EndiorBot 0.1.0-beta.1 | SDLC Framework 6.2.0*
