# Sprint 119 — Beta Remediation

**Date:** 2026-03-26
**Status:** COMPLETE
**Prerequisite:** Sprint 118 COMPLETE (Beta Stabilization + Public Readiness)
**Audit Source:** `docs/05-test/AUDIT-REPORT-2026-03-26.md`
**Framework:** SDLC 6.2.0
**Authority:** PM (this doc) — requires CTO sign-off before execution

---

## Context

Sprint 118 shipped `0.1.0-beta.1` to npm. A same-day audit found 7 issues and ~28 source modules with zero test coverage. The CEO wants this cleaned up before community adoption grows. This sprint targets the issues that would embarrass us if a new user hit them on day one.

**Guiding principle:** Fix what breaks trust first. Cover what could silently fail second. Leave nice-to-haves for Sprint 120.

**Baseline:** 6,596 tests passing, 0 failing, build clean.

---

## Scope

### IN SCOPE

| Track | What |
|-------|------|
| A — Bug Fixes | ISSUE-2: `--mode` alias; ISSUE-3: remote command workspace resolution |
| B — Security Tests | ISSUE-5: 5 untested security modules |
| C — Safety Tests | ISSUE-6: risk-classifier, audit-logger |
| D — Handler Tests | ISSUE-7: 7 command handler modules (targeted subset) |
| E — Doc Fix | ISSUE-4: Zalo help text |

### OUT OF SCOPE (deferred to Sprint 120)

| Deferred | Reason |
|----------|--------|
| ISSUE-1: Web UI command support | Architectural change; ADR required first |
| ClawVault memory tests (`src/memory/`) | Priority 2; not user-facing |
| Agent resilience/quality/handoff tests | Priority 2 |
| Full-stack serve E2E | Heavy infra; separate sprint |
| Bridge session E2E (tmux lifecycle) | Requires environment mocking infra |
| Telegram/Zalo webhook E2E | Requires real credentials in CI |
| 14+ untested CLI commands | Moderate priority; addressed in Sprint 120 |
| `src/agents/invoke/` tests | Low immediate user impact |
| `src/bridge/repo/workspace-resolver.ts` tests | Covered by ISSUE-3 fix scope |

---

## Priority Definitions

- **P0** — Blocks community trust / causes user-visible errors today
- **P1** — Should fix before v1.0; high-risk gap
- **P2** — Nice to have; deferred if time runs short

---

## Task Breakdown

### Track A — Bug Fixes (P0)

#### A1: Add `--mode` as alias for `--risk` in `/launch` (P0, 1h)

**Issue:** ISSUE-2
**User impact:** `endiorbot launch @coder --mode patch` gives a cryptic "path not found: --mode" error.
**Fix:** In `src/commands/handlers/bridge-commands.ts` (and the CLI parser if separate), accept `--mode` as an alias that maps to `--risk`. The `--risk` flag and its validation remain the canonical implementation. `--mode` is deprecated on arrival — emit a one-line deprecation notice in the output.

**Files:**
- `src/commands/handlers/bridge-commands.ts` — alias `--mode` → `--risk` in arg parsing
- `src/commands/remote-handlers.ts` — same alias if flags are re-parsed there

**Acceptance criteria:**
- `--mode read` and `--mode patch` behave identically to `--risk read` / `--risk patch`
- Output includes: `Warning: --mode is deprecated, use --risk`
- `--mode invalid-value` produces the same validation error as `--risk invalid-value`
- `pnpm test` green

---

#### A2: Pass `ctx.workspace` to remote command handlers (P0, 2h)

**Issue:** ISSUE-3
**User impact:** `/focus`, `/cp`, `/sh` ignore per-chat workspace from ADR-029 — they always operate on the default workspace regardless of which repo the user focused with `/link`.
**Fix:** `src/commands/remote-handlers.ts` must resolve and inject the per-chat workspace from `~/.endiorbot/chat-focus.json` before dispatching `/focus`, `/cp`, and `/sh`. The resolved workspace must be passed as `ctx.workspace` to the handler.

**Files:**
- `src/commands/remote-handlers.ts` — resolve workspace via `WorkspaceResolver` before handler dispatch
- `src/bridge/repo/workspace-resolver.ts` — verify `resolveForChat(chatId)` is exported and handles missing entry gracefully (fallback to default)

**Acceptance criteria:**
- A chat with `/link /path/to/repo-A` then `/sh ls` runs `ls` in repo-A, not default workspace
- A chat with no linked repo falls back to default workspace without error
- `pnpm test tests/commands/` green

---

### Track B — Security Module Tests (P1)

> These five modules are runtime guardrails. They work (Sprint 116 wired them), but "works in production" without tests means a future refactor can silently break them. Ship confidence, not faith.

#### B1: Tests for `src/security/input-sanitizer.ts` (P1, 1.5h)

**File to create:** `tests/security/input-sanitizer.test.ts`

**Test cases:**
- SQL injection blocked (`'; DROP TABLE users;--` does not pass through)
- XSS blocked (`<script>alert(1)</script>` stripped or escaped)
- Normal chat message passes unchanged
- Empty string passes
- Very long input (>10K chars) handled without throwing
- Unicode input preserved

---

#### B2: Tests for `src/security/output-scrubber.ts` (P1, 1.5h)

**File to create:** `tests/security/output-scrubber.test.ts`

**Test cases:**
- API keys (`sk-...`, `ANTHROPIC_API_KEY=...`) redacted
- JWT tokens redacted
- File system paths outside project root scrubbed
- Email addresses scrubbed when configured
- Normal output passes unchanged
- Scrubbed output is a string (never throws)

---

#### B3: Tests for `src/security/rate-limiter.ts` (P1, 1h)

**File to create:** `tests/security/rate-limiter.test.ts`

**Test cases:**
- Under limit: all requests pass
- At limit: Nth+1 request blocked
- After window expires: limit resets
- Different callers have independent limits
- Concurrent requests counted correctly

---

#### B4: Tests for `src/security/shell-guard.ts` (P1, 1h)

**File to create:** `tests/security/shell-guard.test.ts`

**Test cases:**
- Allowlisted commands pass
- Non-allowlisted commands blocked
- Commands with argument injection blocked
- Empty command blocked
- `EXEC_ALLOWLIST` enforcement

---

#### B5: Tests for `src/security/secure-fs.ts` (P1, 1h)

**File to create:** `tests/security/secure-fs.test.ts`

**Test cases:**
- Path traversal (`../../etc/passwd`) blocked
- Write outside allowed base path blocked
- Read within allowed path succeeds
- Symlink escape blocked

---

### Track C — Agent Safety Tests (P1)

> `risk-classifier` and `audit-logger` are the safety guardrails for bridge operations. Zero tests on safety guardrails is an unacceptable gap for a tool that runs shell commands.

#### C1: Tests for `src/agents/safety/risk-classifier.ts` (P1, 1.5h)

**File to create:** `tests/agents/safety/risk-classifier.test.ts`

**Test cases:**
- `READ` mode operations classified correctly
- `PATCH` mode operations classified correctly
- `INTERACTIVE` mode operations classified correctly
- Shell command with file write classified as at least PATCH
- Unknown command type → safe default (READ or error, not PATCH)
- Classification returns one of the three canonical mode values

---

#### C2: Tests for `src/agents/safety/audit-logger.ts` (P1, 1h)

**File to create:** `tests/agents/safety/audit-logger.test.ts`

**Test cases:**
- Log entry written to configured path
- Log entry contains timestamp, tool name, file path
- Sensitive data in log entry is scrubbed before write
- `consoleLog: false` suppresses stdout output
- Logger does not throw on missing directory (auto-creates)
- Multiple concurrent log calls do not corrupt file

---

### Track D — Command Handler Tests (P1, targeted)

> 31 OTT commands with zero direct unit tests. Testing all 7 handler modules in one sprint is too much for a solo dev. This sprint covers the 3 highest-risk modules. The rest go to Sprint 120.

#### D1: Tests for `src/commands/handlers/bridge-commands.ts` (P1, 2h)

**File to create:** `tests/commands/handlers/bridge-commands.test.ts`

This module handles `/launch`, `/sessions`, `/kill`, `/attach`, `/mode` — the bridge entry points most likely to have edge cases.

**Test cases:**
- `/launch @coder` with valid path → returns launch command string
- `/launch @coder --risk patch` sets risk mode
- `/launch @coder --mode patch` (alias) sets risk mode (validates A1 fix)
- `/launch` with unknown SOUL role → friendly error
- `/sessions` returns session list format
- `/kill <id>` with valid session id → success
- `/kill <id>` with invalid id → error message

---

#### D2: Tests for `src/commands/handlers/sdlc-commands.ts` (P1, 1.5h)

**File to create:** `tests/commands/handlers/sdlc-commands.test.ts`

Covers `/gate`, `/compliance`, `/consult`, `/init`.

**Test cases:**
- `/gate status` returns gate table
- `/compliance check` returns L1/L2 percentages
- `/consult <query>` dispatches to agent with query intact
- `/init` without args returns help text (not an error)

---

#### D3: Tests for `src/commands/handlers/ott-commands.ts` (P1, 1.5h)

**File to create:** `tests/commands/handlers/ott-commands.test.ts`

Covers `/help`, `/start`, `/where`, `/repos`, `/cost`.

**Test cases:**
- `/help` returns all commands listed
- `/where` returns current workspace path
- `/repos` returns registered repos list
- `/cost` returns cost summary (not undefined)
- `/help` on Zalo includes `/cost` (validates E1 fix)

---

### Track E — Doc Fix (P0, 15 min)

#### E1: Add `/cost` to Zalo help text (P0, 15 min)

**Issue:** ISSUE-4
**File:** `src/channels/zalo/zalo-commands.ts`
**Fix:** Add `/cost` to the `generateZaloHelpMessage()` command list. Place it alongside `/gate` and `/compliance` since they are all reporting commands.

**Acceptance criteria:**
- `generateZaloHelpMessage()` output includes `/cost`
- Existing Zalo tests pass
- `pnpm test tests/channels/zalo/` green

---

## Effort Summary

| Track | Tasks | Est. Hours | Priority |
|-------|-------|-----------|---------|
| A — Bug Fixes | 2 tasks | 3h | P0 |
| B — Security Tests | 5 tasks | 7h | P1 |
| C — Safety Tests | 2 tasks | 2.5h | P1 |
| D — Handler Tests | 3 tasks | 5h | P1 |
| E — Doc Fix | 1 task | 0.25h | P0 |
| **Total** | **13 tasks** | **~18h** | |

A solo developer can complete this in 2-3 focused days.

---

## Execution Order

```
Day 1 — Visible Issues (P0 first, user-facing):
├── E1: Zalo /cost help fix (15 min — quick win, proves we're iterating)
├── A1: --mode alias for --risk (1h)
└── A2: Remote command workspace resolution (2h)

Day 2 — Security Test Coverage:
├── B1: input-sanitizer tests (1.5h)
├── B2: output-scrubber tests (1.5h)
├── B3: rate-limiter tests (1h)
├── B4: shell-guard tests (1h)
└── B5: secure-fs tests (1h)

Day 3 — Safety + Handler Tests:
├── C1: risk-classifier tests (1.5h)
├── C2: audit-logger tests (1h)
├── D1: bridge-commands handler tests (2h)
├── D2: sdlc-commands handler tests (1.5h)
└── D3: ott-commands handler tests (1.5h)
```

**Gate:** Run `pnpm build && pnpm test` after each track. Do not start the next track with a red build.

---

## Acceptance Criteria

### P0 Gate (must pass before any release activity)

- [ ] `--mode read` and `--mode patch` work without error in `/launch`
- [ ] `/sh ls` in a linked chat operates in the linked repo, not default workspace
- [ ] Zalo `/help` output includes `/cost`
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — 0 failures (baseline: 6,596 passing)

### P1 Gate (target before Sprint 119 close)

- [ ] `tests/security/input-sanitizer.test.ts` exists and passes
- [ ] `tests/security/output-scrubber.test.ts` exists and passes
- [ ] `tests/security/rate-limiter.test.ts` exists and passes
- [ ] `tests/security/shell-guard.test.ts` exists and passes
- [ ] `tests/security/secure-fs.test.ts` exists and passes
- [ ] `tests/agents/safety/risk-classifier.test.ts` exists and passes
- [ ] `tests/agents/safety/audit-logger.test.ts` exists and passes
- [ ] `tests/commands/handlers/bridge-commands.test.ts` exists and passes
- [ ] `tests/commands/handlers/sdlc-commands.test.ts` exists and passes
- [ ] `tests/commands/handlers/ott-commands.test.ts` exists and passes
- [ ] Net new tests: +80 minimum (target +100)
- [ ] Zero pre-existing tests broken

---

## Metrics Targets

| Metric | Before (Sprint 118) | Target (Sprint 119) |
|--------|---------------------|---------------------|
| Tests passing | 6,596 | 6,680+ |
| Security module test coverage | ~17% (1/6 files) | ~100% (6/6 files) |
| Agent safety test coverage | 0% | 100% |
| Handler modules with tests | 0/7 | 3/7 |
| User-visible bugs (P0) | 3 (ISSUE-2,3,4) | 0 |

---

## Dependencies

| Dependency | Status |
|-----------|--------|
| Sprint 118 merged and tagged `0.1.0-beta.1` | DONE |
| `src/security/input-sanitizer.ts` exports are stable | Assumed — verify before B1 |
| `src/agents/safety/risk-classifier.ts` uses `InvokeMode` enum (uppercase) | Confirmed from MEMORY.md |
| `src/bridge/repo/workspace-resolver.ts` exports `resolveForChat()` | Verify before A2 |
| No ADR required for `--mode` alias | Confirmed — implementation detail, not architecture |
| ADR required for Web UI command support | Not in this sprint scope |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `workspace-resolver.ts` lacks `resolveForChat()` | Medium | Check exports before starting A2; add the method if missing (small scope) |
| Security module internals require heavy mocking | Low | These are pure functions or thin wrappers — mocking should be minimal |
| Handler tests reveal latent bugs in the handlers | Medium | Budget 30 min triage per handler module; if a real bug surfaces, create ISSUE-8 and fix in Sprint 120 |
| Test count target undershoots (handlers are thin) | Low | 10+ tests per module is achievable; adjust target if handlers are truly trivial |

---

## Definition of Done

1. All P0 acceptance criteria pass
2. All P1 acceptance criteria pass
3. `pnpm build` clean, `pnpm test` green with net +80 tests minimum
4. This sprint doc updated with actual results section
5. CTO sign-off on security and safety test coverage
6. AUDIT-REPORT-2026-03-26.md issues ISSUE-2, ISSUE-3, ISSUE-4 marked RESOLVED

---

## Deferred to Sprint 120

| Issue | Rationale |
|-------|-----------|
| ISSUE-1: Web UI command support | Requires ADR decision on whether to add a command channel to Web UI (ADR-019 says AI-only by design — override needs CTO approval) |
| Handler tests for `team-commands.ts`, `eval-commands.ts`, `permission-formatters.ts`, `shared.ts` | Remaining 4 handler modules after D1-D3 |
| ClawVault memory tests (`fact-store`, `session-handoff`, `observation-scorer`) | Priority 2 — no user-facing failure mode today |
| Agent resilience, quality, handoff tests | Priority 2 |
| `src/agents/invoke/` tests (bridge, patch-validator) | Priority 2 |
| Full-stack serve E2E | Requires CI environment with port isolation |
| CLI `init` E2E (filesystem effects) | Requires temp dir scaffolding |

---

---

## Actual Results

**Execution Date:** 2026-03-26
**Executed By:** @coder (Claude Code Opus 4.6)

### Track Results

| Track | Task | Status | Tests Added | Notes |
|-------|------|--------|-------------|-------|
| E1 | Zalo `/cost` help + dispatch | DONE | 0 (existing tests cover) | 3 edits to `zalo-commands.ts` |
| A1 | `--mode` alias for `--risk` | DONE | 0 (validated by D1) | 3 edits to `bridge-commands.ts` |
| A2 | Workspace resolution | FALSE POSITIVE | 13 | `getRepoForChat()` already resolves per-chat workspace correctly |
| B1 | input-sanitizer tests | DONE | 29 | Covers 12 injection patterns, violations API |
| B2 | output-scrubber tests | DONE | 29 | Covers 6 credential patterns, PEM, idempotency |
| B3 | rate-limiter tests | DONE | 21 | Covers sliding window, key isolation, peek/reset |
| B4 | shell-guard tests | DONE | 41 | Covers all 8 deny patterns, path traversal, truncation |
| B5 | secure-fs tests | DONE | 29 | Uses real tmpdir, covers permissions (0o700/0o600) |
| C1 | risk-classifier tests | DONE | 72 | Covers all risk levels, modes, agent profiles, blocking |
| C2 | audit-logger tests | DONE | 55 | Covers JSONL, rotation, cost calc, sanitization |
| D1 | bridge-commands tests | DONE | 46 | Validates A1 `--mode` alias, launch, sessions, mode |
| D2 | sdlc-commands tests | DONE | 28 | Covers gate, compliance, consult, fix |
| D3 | ott-commands tests | DONE | 19 | Covers agents, teams, config, cost, help |

### Metrics

| Metric | Before (Sprint 118) | After (Sprint 119) | Target | Status |
|--------|---------------------|---------------------|--------|--------|
| Tests passing | 6,596 | 6,988 | 6,680+ | EXCEEDED (+392) |
| Net new tests | — | +392 | +80 minimum | EXCEEDED (4.9x target) |
| Security module coverage | ~17% (1/6) | 100% (6/6) | 100% | PASS |
| Agent safety coverage | 0% | 100% (2/2) | 100% | PASS |
| Handler modules with tests | 0/7 | 3/7 | 3/7 | PASS |
| User-visible bugs (P0) | 3 (ISSUE-2,3,4) | 0 | 0 | PASS |
| Build errors | 0 | 0 | 0 | PASS |
| Test failures | 0 | 0 | 0 | PASS |

### ISSUE Resolution

| Issue | Resolution |
|-------|-----------|
| ISSUE-2: `--mode` flag | RESOLVED — `--mode` accepted as deprecated alias for `--risk`, emits deprecation warning |
| ISSUE-3: Remote workspace | FALSE POSITIVE — `getRepoForChat(chatId)` in `remote-handlers.ts` already resolves per-chat workspace correctly. 13 repro tests written to confirm. |
| ISSUE-4: Zalo `/cost` | RESOLVED — Added to help text + dispatch case in `zalo-commands.ts` |

### Files Created (11 test files)

```
tests/security/input-sanitizer.test.ts       (29 tests)
tests/security/output-scrubber.test.ts       (29 tests)
tests/security/rate-limiter.test.ts          (21 tests)
tests/security/shell-guard.test.ts           (41 tests)
tests/security/secure-fs.test.ts             (29 tests)
tests/agents/safety/risk-classifier.test.ts  (72 tests)
tests/agents/safety/audit-logger.test.ts     (55 tests)
tests/commands/handlers/bridge-commands.test.ts (46 tests)
tests/commands/handlers/sdlc-commands.test.ts   (28 tests)
tests/commands/handlers/ott-commands.test.ts    (19 tests)
tests/commands/workspace-resolution.test.ts     (13 tests)
```

### Files Modified (2 source files)

```
src/channels/zalo/zalo-commands.ts           — E1: /cost help + dispatch
src/commands/handlers/bridge-commands.ts      — A1: --mode alias
```

### CTO Review Notes

CTO approved (8.5/10) with 3 conditions — all addressed:
1. A2 repro test first → DONE (confirmed false positive with 13 tests)
2. E1 must include dispatch case → DONE (not just help text)
3. B1 test cases match actual API → DONE (agents tested real `InputSanitizer` API)

---

*Sprint 119 Complete v1.0 | @coder | 2026-03-26*
*SDLC Framework 6.2.0 | Audit-driven remediation | +392 tests*
