# Sprint 120 — Continued Remediation

**Date:** 2026-03-26
**Status:** PLANNED
**Prerequisite:** Sprint 119 COMPLETE (Beta Remediation, +392 tests, 3 P0 bugs fixed)
**Audit Source:** `docs/05-test/AUDIT-REPORT-2026-03-26.md`
**Framework:** SDLC 6.2.0
**Authority:** PM (this doc) — requires CTO sign-off before execution

---

## Context

Sprint 119 closed successfully: 6,983 tests passing (10 skipped, 6,993 total), all P0 bugs resolved, security and safety modules fully covered, and 3 of 7 handler modules have dedicated test files. This sprint continues the remediation work deferred from Sprint 119, focusing on the remaining handler modules, ClawVault memory tests, and the critical `agents/invoke/` modules (patch-validator, response-parser) that sit on the code execution path.

**CTO review note (F3):** A production bug was found in `response-parser.ts:524` — `hasHandoff()` used a stateful `g`-flag regex causing alternating true/false results. Fixed as C0 prerequisite before C2 tests.

**Guiding principle:** Close the handler gap (4/7 remaining without dedicated test files), cover the modules that silently protect data integrity (memory, patch validation), and clean up CTO review debt. Skip heavy infra work (E2E, bridge session lifecycle) for a future sprint.

**Baseline:** 6,983 tests passing, 10 skipped (6,993 total), 0 failing, build clean.

---

## Scope

### IN SCOPE

| Track | What |
|-------|------|
| A — Handler Tests (remaining 4) | `team-commands.ts`, `eval-commands.ts`, `permission-formatters.ts`, `shared.ts` |
| B — ClawVault Memory Tests | `fact-store.ts`, `session-handoff.ts`, `observation-scorer.ts` |
| C — Invoke Module Tests | `patch-validator.ts`, `response-parser.ts` |
| D — CTO Review Debt | 5 LOW issues from Sprint 119 CTO review (#3, #5, #6, #7, #8) |
| E — ISSUE-1 Triage | Web UI command support — document the limitation or propose a minimal fix |

### OUT OF SCOPE (deferred to Sprint 121+)

| Deferred | Reason |
|----------|--------|
| `claude-code-bridge.ts` tests | 810 lines, heavy tmux mocking — needs dedicated sprint |
| Agent resilience tests (conversation-limits, tracker, failover) | 1,061 lines total — Sprint 121 candidate |
| Agent quality tests (reflect-step, history-compactor) | 548 lines — Sprint 121 candidate |
| Agent handoff tests (handoff-detector) | 506 lines — Sprint 121 candidate |
| Full-stack serve E2E | Requires CI environment with port isolation |
| Bridge session E2E (tmux lifecycle) | Requires environment mocking infra |
| Telegram/Zalo webhook E2E | Requires real credentials in CI |
| CLI `init` E2E (filesystem effects) | Requires temp dir scaffolding |

---

## Priority Definitions

- **P0** — Blocks community trust / causes user-visible errors today
- **P1** — Should fix before v1.0; high-risk gap
- **P2** — Nice to have; deferred if time runs short

---

## Task Breakdown

### Track A — Remaining Handler Tests (P1)

> Sprint 119 covered 3/7 handler modules with dedicated test files (bridge-commands, sdlc-commands, ott-commands). These 4 lack dedicated handler-level test files. Note: `team-commands.ts` is already functionally tested via `tests/channels/telegram/team-monitoring.test.ts` (18 call sites), and `shared.ts` (`sanitizeForEcho`) has coverage in 3+ existing test files. The goal here is to create dedicated, co-located test files for organizational completeness — a meaningful quality gate for v1.0.

#### A1: Tests for `src/commands/handlers/team-commands.ts` (P1, 1.5h)

**File to create:** `tests/commands/handlers/team-commands.test.ts`

This module handles `/team-status`, `/kill-team`, and the cost threshold callback. It has the most complex logic of the remaining handlers (237 lines, 3 exported functions + `costThresholdOverrides` Map, interaction with session registry, team monitor, cost overrides, and audit logging). **Note:** These functions are already exercised via `tests/channels/telegram/team-monitoring.test.ts` — this task adds a dedicated handler-level test file for co-location and more granular assertions.

**Test cases:**
- `/team-status` with AGENT_TEAMS flag disabled returns error
- `/team-status` with no args returns usage message
- `/team-status` with unknown session ID returns "not found"
- `/team-status` with non-team session returns "not part of a team"
- `/team-status` with valid team session returns formatted dashboard
- `/team-status` with threshold exceeded includes cost keyboard in result
- `/kill-team` with AGENT_TEAMS flag disabled returns error
- `/kill-team` with no args returns usage message
- `/kill-team` with unknown session ID returns "not found"
- `/kill-team` with non-team session returns "not part of a team"
- `/kill-team` with valid team kills all members and clears override
- `handleTeamCostCallback("extend", ...)` increases threshold by $2
- `handleTeamCostCallback("stop", ...)` delegates to kill-team
- `handleTeamCostCallback` with unknown action returns error
- `costThresholdOverrides` map is cleared after kill-team

---

#### A2: Tests for `src/commands/handlers/eval-commands.ts` (P1, 1h)

**File to create:** `tests/commands/handlers/eval-commands.test.ts`

Covers `/eval <sessionId>`. Thin module (85 lines) that delegates to `runEvaluation` and `getTurnCount`.

**Test cases:**
- `/eval` with no args returns usage message
- `/eval` with unknown session ID returns "not found or inactive"
- `/eval` with inactive session returns "not found or inactive"
- `/eval` with valid session and no output returns "no evaluatable output"
- `/eval` with valid session and output returns formatted score card
- `/eval` when `runEvaluation` throws returns error message
- Session ID is truncated to 40 chars in error messages (sanitization)

---

#### A3: Tests for `src/commands/handlers/permission-formatters.ts` (P1, 1h)

**File to create:** `tests/commands/handlers/permission-formatters.test.ts`

Pure formatting functions (73 lines, 3 exported functions). These are straightforward to test — no mocking required.

**Test cases:**
- `formatPermissionMessage` includes session ID, tool name, risk mode
- `formatPermissionMessage` includes file path when provided
- `formatPermissionMessage` omits file info when no file path
- `formatPermissionMessage` returns keyboard with correct permission ID
- `formatPermissionMessage` truncates long file paths to 60 chars
- `formatPermissionDecisionMessage("approve", ...)` shows checkmark icon
- `formatPermissionDecisionMessage("deny", ...)` shows X icon
- `formatPermissionDecisionMessage` with unknown decision shows clock icon
- `formatPermissionTimeoutMessage` includes tool name and session ID
- Markdown special chars in inputs are sanitized

---

#### A4: Tests for `src/commands/handlers/shared.ts` (P1, 0.25h)

**File to create:** `tests/commands/handlers/shared.test.ts`

Utility module (40 lines): `sanitizeForEcho` function and `TEAM_ICONS` constant. **Note:** `sanitizeForEcho` already has test coverage in `bridge-commands.test.ts` (BC-26/BC-27), `team-monitoring.test.ts`, and `zalo-commands.test.ts`. This dedicated file focuses on `TEAM_ICONS` exhaustive check and edge cases not covered elsewhere.

**Test cases:**
- `sanitizeForEcho` strips Markdown links but preserves link text
- `sanitizeForEcho` strips HTTP/HTTPS URLs
- `sanitizeForEcho` strips www. URLs
- `sanitizeForEcho` strips Markdown special characters (`*`, `_`, backtick, etc.)
- `sanitizeForEcho` collapses multiple whitespace to single space
- `sanitizeForEcho` trims whitespace
- `sanitizeForEcho` truncates to 80 chars
- `sanitizeForEcho` handles empty string
- `TEAM_ICONS` has entries for all 7 team IDs (fullstack, planning, design, dev, qa, ops, executive)

---

### Track B — ClawVault Memory Tests (P1)

> ClawVault memory modules store structured facts, session handoffs, and observation scores. They are not user-facing today but they power session continuity. A silent bug here means the next session starts with corrupted context — hard to debug, easy to prevent with tests.

#### B1: Tests for `src/memory/fact-store.ts` (P1, 2h)

**File to create:** `tests/memory/fact-store.test.ts`

The FactStore (213 lines) is the most complex memory module: JSONL persistence, in-memory indices, conflict resolution. Tests should use a real temp directory for file I/O.

**Test cases:**
- `FactStore.createFact` returns fact with UUID, entity, relation, value, confidence, validFrom, source
- `addFacts` indexes by entity — `query({ entity })` returns matching facts
- `addFacts` indexes by relation — `query({ relation })` returns matching facts
- `query` with entity+relation intersects both indices
- `query` with no filter returns all current facts
- `query` excludes superseded facts (those with `validUntil` set)
- Conflict resolution: adding fact with same entity+relation sets `validUntil` on old fact
- Conflict resolution: new fact becomes the current one
- `getCurrentFactCount` returns only non-superseded facts
- `getAllFacts` returns both current and superseded facts
- `save` creates directory if missing
- `save` then `load` round-trips all facts
- `load` skips malformed JSONL lines without throwing
- `load` on non-existent file initializes empty store
- Empty store returns empty array for any query

---

#### B2: Tests for `src/memory/session-handoff.ts` (P1, 1.5h)

**File to create:** `tests/memory/session-handoff.test.ts`

Session handoff (140 lines): create, save, load latest, load all. Uses sync fs operations. Tests should use a real temp directory.

**Test cases:**
- `createHandoff` adds `createdAt` timestamp
- `createHandoff` preserves all input fields
- `saveHandoff` creates directory structure if missing
- `saveHandoff` writes JSON file named `{sessionId}.json`
- `loadLatestHandoff` returns null for non-existent project
- `loadLatestHandoff` returns the most recently modified handoff
- `loadLatestHandoff` skips malformed JSON files
- `loadAllHandoffs` returns empty array for non-existent project
- `loadAllHandoffs` returns handoffs sorted by `createdAt` ascending
- Save then load round-trip preserves all fields
- Multiple handoffs for same project stored as separate files

---

#### B3: Tests for `src/memory/observation-scorer.ts` (P1, 1h)

**File to create:** `tests/memory/observation-scorer.test.ts`

Observation scorer (114 lines): pure functions for scoring observations by type. No I/O, no mocking needed.

**Test cases:**
- `scoreObservation("decision", ...)` returns importance 0.9, confidence 0.85
- `scoreObservation("commitment", ...)` returns importance 0.85, confidence 0.9
- `scoreObservation("lesson", ...)` returns importance 0.8, confidence 0.7
- `scoreObservation("blocker", ...)` returns importance 0.75, confidence 0.8
- `scoreObservation("fact", ...)` returns importance 0.6, confidence 0.75
- `scoreObservation("preference", ...)` returns importance 0.5, confidence 0.6
- `scoreObservation("project", ...)` returns importance 0.5, confidence 0.8
- All 7 memory types have defined scores (exhaustive check)
- `filterByImportance` with structural threshold (0.8) returns decision, commitment, lesson
- `filterByImportance` with potential threshold (0.4) returns all types
- `filterByImportance` with threshold 1.0 returns empty array
- `IMPORTANCE_THRESHOLDS.structural` equals 0.8
- `IMPORTANCE_THRESHOLDS.potential` equals 0.4
- `getTypeImportance` and `getTypeConfidence` match `scoreObservation` output

---

### Track C — Invoke Module Tests (P1)

> `patch-validator` and `response-parser` sit on the code execution critical path. The patch validator decides whether a diff is safe to apply. The response parser decides whether an agent wants to hand off work. Both are security-sensitive. `claude-code-bridge.ts` (810 lines, heavy tmux integration) is deferred.

#### C0: Fix `hasHandoff()` stateful regex bug (P0, 0.25h) — DONE

**File:** `src/agents/invoke/response-parser.ts` line 524

**Bug:** `HANDOFF_JSON_PATTERN` uses the `g` flag (needed for `matchAll()` at line 244), but `hasHandoff()` calls `.test()` on it without resetting `lastIndex`. This causes alternating true/false results across consecutive calls — a production bug on the handoff detection path.

**Fix applied (CTO review):** Added `HANDOFF_JSON_PATTERN.lastIndex = 0;` before `.test()`.

---

#### C1: Tests for `src/agents/invoke/patch-validator.ts` (P1, 2h)

**File to create:** `tests/agents/invoke/patch-validator.test.ts`

PatchValidator (502 lines): diff parsing, dangerous pattern detection, path validation, risk assessment. Pure logic except for logger.

**Test cases:**
- Clean diff with single file change returns `allowed: true, risk: "LOW"`
- Diff with `rm -rf /` in addition line returns `allowed: false, risk: "CRITICAL"`
- Diff with `DROP TABLE` returns `allowed: false, risk: "CRITICAL"`
- Diff with `sudo` command returns `allowed: false, risk: "CRITICAL"`
- Diff with `curl | sh` pipe returns `allowed: false, risk: "CRITICAL"`
- Diff with `chmod 777` returns `allowed: false, risk: "HIGH"`
- Diff with `eval(` expression returns `allowed: false, risk: "HIGH"`
- Diff touching `.env` file flagged as sensitive
- Diff touching `credentials.json` flagged as blocked
- Diff with `../` path traversal returns PATH_TRAVERSAL risk
- Diff with file outside workspace returns PATH_TRAVERSAL risk
- Diff with file inside workspace passes
- Large deletion (>500 lines) flagged as LARGE_DELETION
- Diff affecting >20 files produces warning
- Strict mode blocks on any risk (including MEDIUM)
- Non-strict mode allows MEDIUM risks
- `parseDiff` correctly extracts file names from `--- a/` and `+++ b/` headers
- `parseDiff` counts additions and deletions per file
- Deletion lines (starting with `-`) are not checked for dangerous patterns
- Context lines (no prefix) are not checked for dangerous patterns
- `createPatchValidator` factory function returns working validator
- `validatePatch` convenience function works end-to-end

---

#### C2: Tests for `src/agents/invoke/response-parser.ts` (P1, 2h)

**File to create:** `tests/agents/invoke/response-parser.test.ts`

ResponseParser (534 lines): handoff extraction (JSON + fuzzy), code block extraction, artifact detection. Pure logic.

**Test cases:**
- Plain text response returns `status: "complete"`, no handoffs
- Response with valid handoff JSON block returns `status: "handoff"` and extracted handoff
- Response with multiple handoffs extracts all
- Response with invalid handoff target adds error
- Response with malformed JSON in non-strict mode attempts fuzzy extraction
- Response with malformed JSON in strict mode adds parse error
- Code blocks extracted with language and content
- Handoff JSON code blocks excluded from code block extraction
- Diff code blocks detected as `type: "diff"`
- Shell code blocks (`bash`, `sh`) detected as `type: "shell"`
- File path comments in code blocks extracted
- Artifacts extracted from `## File:` headers
- Artifacts extracted from code blocks with file paths
- `cleanContent` removes handoff JSON but preserves other content
- Very short response (<10 chars) returns `status: "incomplete"`
- Output longer than `maxContentLength` is truncated with warning
- `hasHandoff` utility returns true for response with handoff
- `extractFirstHandoff` returns first handoff item
- `createResponseParser` factory creates new instance
- `resetResponseParser` clears singleton

---

### Track D — CTO Review Debt (P2)

> 5 LOW issues from Sprint 119 CTO review. These are test quality improvements, not coverage gaps. Grouping them as a single track keeps the sprint focused.

#### D1: Fix vacuous conditional guards in risk-classifier tests (P2, 0.5h)

**CTO Issue #3:** Some risk-classifier tests use `if (level === "X")` guards that make assertions vacuously pass when the condition is false.

**Fix:** Replace conditional assertions with unconditional ones. If the test expects a specific level, assert it directly without wrapping in an `if`. If the test is parameterized, ensure each parameter combination is exercised.

**File:** `tests/agents/safety/risk-classifier.test.ts`

---

#### D2: Remove inflated `generateHelpMessage` substring tests (P2, 0.5h)

**CTO Issue #5:** 20 tests for `generateHelpMessage` that each check a single substring are inflated padding. They contribute to test count without meaningful coverage.

**Fix:** Consolidate into 3-4 focused tests: one per channel variant (Telegram, Zalo, CLI) that checks the complete command list, plus one test that verifies help text format (header, footer, command sections).

**File:** `tests/commands/handlers/ott-commands.test.ts`

---

#### D3: Strengthen `handleComplianceCommand` case-insensitive test (P2, 0.25h)

**CTO Issue #6:** The case-insensitive test for `handleComplianceCommand` is under-specified — it does not verify the exact behavior difference.

**Fix:** Add explicit tests that `compliance CHECK`, `compliance Check`, and `compliance check` all produce the same result object (deep equality).

**File:** `tests/commands/handlers/sdlc-commands.test.ts`

---

#### D4: Add >10K chars input-sanitizer boundary test (P2, 0.25h)

**CTO Issue #7:** Missing boundary test for very large input to `InputSanitizer`.

**Fix:** Add a test with a 15K-character input string. Verify it does not throw, returns within 100ms, and output length is reasonable (not larger than input).

**File:** `tests/security/input-sanitizer.test.ts`

---

#### D5: Clarify `handleTeamsCommand(tier)` parameter validity (P2, 0.25h)

**CTO Issue #8:** Unclear what happens when `handleTeamsCommand` receives an invalid tier value.

**Fix:** Add test with invalid tier string. Verify it returns a graceful error or falls back to default behavior (not a crash).

**File:** `tests/commands/handlers/ott-commands.test.ts`

---

### Track E — ISSUE-1 Triage (P2, 1h)

#### E1: Document Web UI command limitation (P2, 1h)

**Issue:** ISSUE-1 from audit report. Users typing `/help` in the Web UI get an AI response instead of the command list.

**Analysis:** ADR-019 established Web UI as AI-only by design. Adding full command dispatch to the Web UI requires:
1. Detecting `/` prefix in the WebSocket message handler
2. Routing to `CommandDispatcher` instead of `router.chat`
3. Deciding on auth model (Web UI currently has password-based auth)

**Decision needed from CTO:** Is this a simple routing change (intercept `/` commands in the WS handler and dispatch them), or does it warrant a new ADR?

**Sprint 120 deliverable:** Write a brief analysis doc at `docs/02-design/01-ADRs/ADR-035-Web-UI-Command-Support.md` with PROPOSED status. If the CTO approves and the fix is trivial (<50 lines), implement it within this sprint. Otherwise, defer implementation to Sprint 121.

**Acceptance criteria:**
- ADR-035 exists with PROPOSED status
- ADR describes the current limitation, options, and recommendation
- If approved + trivial, Web UI `/help` returns command list instead of AI response

---

## Effort Summary

| Track | Tasks | Est. Hours | Priority |
|-------|-------|-----------|---------|
| A — Handler Tests (4 remaining) | 4 tasks | 3.75h | P1 |
| B — ClawVault Memory Tests | 3 tasks | 4.5h | P1 |
| C — Invoke Module Tests | 2 tasks + C0 bug fix | 4.25h | P1 |
| D — CTO Review Debt | 5 tasks | 1.75h | P2 |
| E — ISSUE-1 Triage | 1 task | 1h | P2 |
| **Total** | **16 tasks** | **~15.25h** | |

A solo developer can complete this in 2-3 focused days.

---

## Execution Order

```
Day 1 — Complete Handler Coverage (finish what Sprint 119 started):
+-- A4: shared.ts tests (0.25h -- TEAM_ICONS focus, sanitizeForEcho already covered)
+-- A3: permission-formatters tests (1h -- pure functions, no mocking)
+-- A2: eval-commands tests (1h -- thin module, zero coverage)
+-- A1: team-commands tests (1.5h -- dedicated file, functions already tested via team-monitoring)

Day 2 — Memory + Invoke (cover the data integrity path):
+-- B3: observation-scorer tests (1h -- pure functions, fast)
+-- B2: session-handoff tests (1.5h -- uses tmpdir, moderate I/O)
+-- B1: fact-store tests (2h -- JSONL persistence, conflict resolution)
+-- C0: Fix hasHandoff() stateful regex (0.25h -- DONE by CTO review)
+-- C1: patch-validator tests (2h -- security-critical, pure logic)

Day 3 — Invoke + CTO Debt + ISSUE-1:
+-- C2: response-parser tests (2h -- handoff extraction, fuzzy parsing)
+-- D1-D5: CTO review fixes (1.75h -- batch all 5 quick fixes)
+-- E1: Web UI ADR (1h -- analysis + write ADR-035)
```

**Gate:** Run `pnpm build && pnpm test` after each track. Do not start the next track with a red build.

---

## Acceptance Criteria

### P1 Gate (must pass before Sprint 120 close)

- [ ] `tests/commands/handlers/team-commands.test.ts` exists and passes
- [ ] `tests/commands/handlers/eval-commands.test.ts` exists and passes
- [ ] `tests/commands/handlers/permission-formatters.test.ts` exists and passes
- [ ] `tests/commands/handlers/shared.test.ts` exists and passes
- [ ] `tests/memory/fact-store.test.ts` exists and passes
- [ ] `tests/memory/session-handoff.test.ts` exists and passes
- [ ] `tests/memory/observation-scorer.test.ts` exists and passes
- [ ] `tests/agents/invoke/patch-validator.test.ts` exists and passes
- [ ] `tests/agents/invoke/response-parser.test.ts` exists and passes
- [ ] Handler modules with tests: 7/7 (100%)
- [ ] Net new tests: +60 minimum (target +80)
- [ ] Zero pre-existing tests broken
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — 0 failures

### P2 Gate (target before Sprint 120 close)

- [ ] CTO Issue #3: Vacuous conditional guards removed from risk-classifier tests
- [ ] CTO Issue #5: Help message tests consolidated (net test count may decrease — that is acceptable)
- [ ] CTO Issue #6: Compliance command case-insensitive tests strengthened
- [ ] CTO Issue #7: >10K chars input-sanitizer boundary test added
- [ ] CTO Issue #8: Invalid tier parameter test added for handleTeamsCommand
- [ ] ADR-035 written with PROPOSED status

---

## Metrics Targets

| Metric | Before (Sprint 119) | Target (Sprint 120) |
|--------|---------------------|---------------------|
| Tests total | 6,993 (6,983 passing, 10 skipped) | 7,040+ |
| Net new tests | -- | +55 minimum (target +70) |
| Handler modules with dedicated tests | 3/7 | 7/7 (100%) |
| ClawVault memory module coverage | 0% (0/3) | 100% (3/3) |
| Invoke module coverage (excl. bridge) | 0% (0/2) | 100% (2/2) |
| CTO review debt (LOW issues) | 5 open | 0 open |
| Audit ISSUE-1 (Web UI) | OPEN | ADR written (PROPOSED) |

---

## Dependencies

| Dependency | Status |
|-----------|--------|
| Sprint 119 complete with 6,993 total tests (6,983 passing, 10 skipped) | DONE |
| `src/commands/handlers/team-commands.ts` imports from bridge, sessions, budget | Requires mocking — verify mock setup before A1 |
| `src/memory/fact-store.ts` uses `~/.endiorbot/memory/` filesystem | Tests must use tmpdir, not real home directory |
| `src/memory/session-handoff.ts` uses sync fs | Tests must use tmpdir |
| `src/agents/invoke/patch-validator.ts` imports from logging | Logger can be mocked or left as console output |
| `src/agents/invoke/response-parser.ts` imports handoff types | Verify `isValidHandoffRequest` and `isValidRole` are importable |
| ADR-035 requires CTO review | Write first, await approval — implementation conditional |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `team-commands.ts` requires heavy mocking (6 module imports) | High | Mock at module level with `vi.mock()`; focus on behavior, not implementation |
| `fact-store.ts` tmpdir cleanup fails on CI | Low | Use `afterEach` with `rm -rf` on tmpdir; Vitest handles cleanup |
| CTO review debt fixes break existing tests | Low | Run full test suite after each D-track fix |
| `response-parser.ts` regex patterns are fragile for edge cases | Medium | Test with real-world handoff JSON samples; include malformed input tests |
| ADR-035 analysis concludes Web UI command support needs significant work | Medium | Cap ADR at analysis only; implementation deferred if >50 lines |
| Net test count decrease from D2 consolidation | Expected | Removing 15-16 inflated tests is a quality improvement — track net new separately |

---

## Definition of Done

1. All P1 acceptance criteria pass
2. All P2 acceptance criteria pass (or explicitly deferred with rationale)
3. `pnpm build` clean, `pnpm test` green with net +60 tests minimum
4. This sprint doc updated with actual results section
5. CTO sign-off on handler coverage (7/7) and memory test coverage
6. ADR-035 exists with at minimum PROPOSED status

---

## Deferred to Sprint 121+

| Issue | Rationale |
|-------|-----------|
| `claude-code-bridge.ts` tests (810 lines) | Heavy tmux mocking infrastructure needed — dedicated sprint |
| Agent resilience tests (conversation-limits, conversation-tracker, failover-classifier) | 1,061 lines, 3 modules — Sprint 121 candidate |
| Agent quality tests (reflect-step, history-compactor) | 548 lines, 2 modules — Sprint 121 candidate |
| Agent handoff tests (handoff-detector) | 506 lines — Sprint 121 candidate |
| Web UI command implementation (if ADR-035 approved) | Depends on ADR-035 outcome — Sprint 121 if trivial |
| Full-stack serve E2E | Requires CI environment with port isolation |
| CLI `init` E2E (filesystem effects) | Requires temp dir scaffolding |
| Bridge session E2E (tmux lifecycle) | Requires environment mocking infra |

---

*Sprint 120 Planned v1.0 | @pm | 2026-03-26*
*SDLC Framework 6.2.0 | Continued remediation | Target +80 tests*
