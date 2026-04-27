# Sprint 121 — Agent Coverage Hardening + Router Decomposition + Web Command Support

**Date:** 2026-03-26
**Status:** PLANNED
**Prerequisite:** Sprint 120 COMPLETE (7,127 tests passing, CPO APPROVED)
**Framework:** SDLC 6.2.0
**Authority:** PM (this doc) — CPO APPROVED with conditions

---

## Context

Sprint 120 closed with 7,127 tests passing (10 skipped, 0 failing). Six agent modules (2,115 lines) in `src/agents/resilience/`, `src/agents/quality/`, and `src/agents/handoff/` have **zero test coverage** — these were explicitly deferred from Sprint 120 as "Sprint 121 candidates." `channel-router.ts` has grown to 908 lines — Sprint 115 flagged refactor at >400 lines. ADR-035 (Web UI Command Support) was PROPOSED in Sprint 120 and CPO requires Phase 1 implementation.

**Goal:** Harden agent test coverage (+~155 tests), decompose the oversized router, implement Web command parity (AD-3), and close housekeeping debt.

**Baseline:** 7,127 tests passing, 10 skipped, 0 failing, build clean.

---

## CPO Conditions (binding)

1. **C1 — T3 behavior-preserving**: Zero public contract/return shape change; smoke tests for all 3 provider paths + patch-flow gate
2. **C2 — Coverage quality > test count**: Report line/branch/function coverage delta for 6 modules at sprint close
3. **C3 — Handoff detector safety cases**: Mandatory coverage of malformed JSON, nested blocks, partial markers, regex lastIndex/stateful behavior, null/undefined inputs
4. **C4 — ADR rationale quality**: ADR-011 deferred with reopen condition; ADR-015 superseded with specific sprint/file reference
5. **C5 — T3 incremental verification**: Run `pnpm test tests/agents/` after each extraction step, not just at end

---

## Scope

### IN SCOPE

| Track | What | Est. |
|-------|------|------|
| T1 — Resilience Module Tests | `conversation-limits.ts` (301L), `conversation-tracker.ts` (438L), `failover-classifier.ts` (322L) | 1.1d, ~77 tests |
| T2 — Quality + Handoff Module Tests | `reflect-step.ts` (198L), `history-compactor.ts` (350L), `handoff-detector.ts` (506L) | 1d, ~65 tests |
| T3 — Channel Router Decomposition | Split 908L → ~350L core + ~280L providers + ~280L patch-flow | 0.75d, ~5 smoke tests |
| T4 — Stale ADR Resolution + Barrel | ADR-011 → DEFERRED, ADR-015 → SUPERSEDED, create `intelligence/index.ts` | 0.15d |
| T5 — ADR-035 Web Command Support | Enhance `safeMarkdown()` (AD-3), Web command integration tests, ADR status update | 0.75d, ~8 tests |

### OUT OF SCOPE (deferred)

| Deferred | Reason |
|----------|--------|
| `claude-code-bridge.ts` tests (810 lines) | Heavily integration-dependent, needs separate spike |
| ADR-035 AD-4 (command autocomplete) | Phase 2 — deferred per ADR |
| RL pipeline expansion | Sprint 115 T1/T2 just shipped, need usage data first |
| Channel-router refactor beyond 3-file split | Only decompose to meet <400L threshold |

---

## Task Breakdown

### Track 1: Resilience Module Tests (~77 tests, 1.1d)

**Why:** 1,061 lines, 0 tests. Core conversation safety (token limits, turn tracking, failover classification).

| # | File | Test File (CREATE) | Est. Tests | Priority |
|---|------|--------------------|------------|----------|
| T1-1 | `src/agents/resilience/conversation-limits.ts` (301L) | `tests/agents/resilience/conversation-limits.test.ts` | ~25 | P1 |
| T1-2 | `src/agents/resilience/conversation-tracker.ts` (438L) | `tests/agents/resilience/conversation-tracker.test.ts` | ~30 | P1 |
| T1-3 | `src/agents/resilience/failover-classifier.ts` (322L) | `tests/agents/resilience/failover-classifier.test.ts` | ~22 | P1 |

**Coverage targets:**
- ConversationLimits: all 8 check methods + checkAll + describeViolation + singleton
- ConversationTracker: create, get, getActive, checkLimits, incrementMessageCount, recordTokenUsage, complete, error, pause, resume, parent-child delegation depth, list/listActive/delete/clear
- FailoverClassifier: classifyHttpError (all status codes), classifyErrorMessage (all patterns), classifyAndRoute, formatErrorAsString, shouldFallback/shouldRetry/shouldAbort, formatProfileKey/parseProfileKey/getCooldownKey

### Track 2: Quality + Handoff Module Tests (~65 tests, 1d)

**Why:** 1,054 lines, 0 tests. Agent quality reflection and handoff detection critical for multi-agent orchestration.

| # | File | Test File (CREATE) | Est. Tests | Priority |
|---|------|--------------------|------------|----------|
| T2-1 | `src/agents/quality/reflect-step.ts` (198L) | `tests/agents/quality/reflect-step.test.ts` | ~18 | P1 |
| T2-2 | `src/agents/quality/history-compactor.ts` (350L) | `tests/agents/quality/history-compactor.test.ts` | ~25 | P1 |
| T2-3 | `src/agents/handoff/handoff-detector.ts` (506L) | `tests/agents/handoff/handoff-detector.test.ts` | ~22 | P1 |

**CPO C3 — handoff-detector mandatory safety cases:**
- Malformed JSON (broken brackets, unclosed strings)
- Nested code blocks (triple backticks inside backticks)
- Partial handoff markers (incomplete `{"handoff":` without closing)
- Regex lastIndex stateful behavior (g-flag + matchAll bug from Sprint 120)
- Empty/null/undefined inputs

### Track 3: Channel Router Decomposition (0.75d)

**Why:** 908 lines in single file. Sprint 115 flagged refactor at >400 lines.

| # | Action | File | Est. Lines |
|---|--------|------|-----------|
| T3-0 | CREATE | `src/agents/router/agent-constants.ts` — constants, types, shared helpers | ~120 |
| T3-1 | CREATE | `src/agents/router/providers.ts` — `callClaudeBridge()`, `callCloudFallback()`, `callRemoteOllama()` as standalone fns | ~280 |
| T3-2 | CREATE | `src/agents/router/patch-flow.ts` — `requestPatchConfirmation()`, `executePatch()` as standalone fns | ~280 |
| T3-3 | MODIFY | `src/agents/channel-router.ts` — Core class, `callAI()`, routing, re-exports | 908 → ~350 |
| T3-4 | CREATE | `tests/agents/router/router-decomposition.test.ts` — Smoke tests | ~40, ~5 tests |

**CTO C1 — Extraction pattern:** Standalone functions with explicit params (not class delegation). Avoids circular deps, improves testability. Provider methods receive `bridge`, `config`, `claudeAvailable` as params.

**CTO C2 — Line count correction:** Actual remaining ~550-570L after extracting providers+patch-flow. Extract constants/types block (lines 1-236) into `agent-constants.ts` (~120L) to hit <400L target.

**CTO C3 — Circular dependency prevention:** `providers.ts` needs `getAgentSoul()`, `formatHistoryContext()`, `getAgentModel()` from channel-router. Extract these shared helpers into `agent-constants.ts`. Both `providers.ts` and `channel-router.ts` import unidirectionally from `agent-constants.ts`.

**CPO C1 constraints:**
- Zero behavior change — pure structural refactor
- `channel-router.ts` remains the public import path (re-exports)
- Existing tests must pass without modification

**CPO C5 — Incremental verification:**
1. Extract `agent-constants.ts` → `pnpm test tests/agents/` → verify green
2. Extract `providers.ts` → `pnpm test tests/agents/` → verify green
3. Extract `patch-flow.ts` → `pnpm test tests/agents/` → verify green
4. Write smoke tests → full suite green

### Track 4: Stale ADR Resolution + Barrel Index (0.15d)

| # | Action | File |
|---|--------|------|
| T4-1 | Update status → DEFERRED | `docs/02-design/01-ADRs/ADR-011-Composio-Integration.md` |
| T4-2 | Update status → SUPERSEDED | `docs/02-design/01-ADRs/ADR-015-Retrieval-Explainability-Evidence.md` |
| T4-3 | CREATE barrel index | `src/agents/intelligence/index.ts` |

**CPO C4 rationale:**
- ADR-011: "Deferred — Composio integration requires external API dependency and CEO use case validation. Reopen when specific tool orchestration need arises."
- ADR-015: "Superseded by Sprint 65 Context Anchoring implementation. Explainability patterns incorporated into `src/agents/intelligence/workspace-context.ts` and `src/agents/intelligence/patch-intent-classifier.ts`."

### Track 5: ADR-035 Web UI Command Support (0.75d)

**Why:** ADR-035 PROPOSED in Sprint 120. Web UI lacks command parity with Telegram/Zalo.

**Analysis of current state:**
- AD-2 (Ingress routing) is ALREADY DONE — `GatewayIngress.handleInbound()` line 110 routes `/` prefix to CommandDispatcher for all channels including Web
- AD-1 (isCommand tag) is UNNECESSARY — ingress detects `/` prefix directly
- AD-3 (Markdown rendering) is PARTIALLY DONE — `safeMarkdown()` handles bold, code, italic but **missing**: lists, headers, horizontal rules

| # | Action | File | Est. |
|---|--------|------|------|
| T5-A | Enhance `safeMarkdown()` + CSS | `src/gateway/web/index.html` | +50 lines |
| T5-B | Web command integration tests | `tests/gateway/web-commands.test.ts` (CREATE) | ~80 lines, ~8 tests |
| T5-C | Update ADR-035 status → ACCEPTED | `docs/02-design/01-ADRs/ADR-035-Web-UI-Command-Support.md` | +5 lines |

---

## Execution Order

```
Day 1:
├── T4: ADR-011 DEFERRED + ADR-015 SUPERSEDED + barrel index
├── T5-C: ADR-035 status update
├── T1-1: conversation-limits.test.ts (~25 tests)
├── T1-2: conversation-tracker.test.ts (~30 tests)
└── T1-3: failover-classifier.test.ts (~22 tests)

Day 2:
├── T2-1: reflect-step.test.ts (~18 tests)
├── T2-2: history-compactor.test.ts (~25 tests)
└── T2-3: handoff-detector.test.ts (~22 tests, with CPO C3 safety cases)

Day 3:
├── T3-1: Extract providers.ts → pnpm test tests/agents/ → green
├── T3-2: Extract patch-flow.ts → pnpm test tests/agents/ → green
├── T3-4: Smoke tests (5 tests)
└── T5-A: Enhance safeMarkdown() in Web UI

Day 4:
├── T5-B: Web command integration tests (8 tests)
├── Full test suite verification (pnpm build && pnpm test)
├── Coverage report for T1+T2 modules (CPO C2)
├── Sprint doc update (this file → COMPLETE)
└── CTO/PJM review
```

---

## Verification

```bash
# Track 1: 77 new resilience tests
pnpm vitest tests/agents/resilience/ --reporter=verbose

# Track 2: 65 new quality/handoff tests
pnpm vitest tests/agents/quality/ tests/agents/handoff/ --reporter=verbose

# Track 3: Router decomposition — no regressions
pnpm vitest tests/agents/ --reporter=verbose
wc -l src/agents/channel-router.ts  # target: < 400 lines

# Track 4: ADR status updated, barrel exists
grep "Status" docs/02-design/01-ADRs/ADR-011-Composio-Integration.md  # DEFERRED
grep "Status" docs/02-design/01-ADRs/ADR-015-Retrieval-Explainability-Evidence.md  # SUPERSEDED
ls src/agents/intelligence/index.ts  # exists

# Track 5: Web command support
pnpm vitest tests/gateway/web-commands.test.ts --reporter=verbose

# CPO C2: Coverage delta
pnpm vitest --coverage tests/agents/resilience/ tests/agents/quality/ tests/agents/handoff/

# Full suite
pnpm build   # 0 errors
pnpm test    # ~7,282 passing (7,127 + ~155 new)
```

---

## Files Summary

| Track | Action | File | Est. Lines |
|-------|--------|------|-----------|
| T1 | CREATE | `tests/agents/resilience/conversation-limits.test.ts` | ~120 |
| T1 | CREATE | `tests/agents/resilience/conversation-tracker.test.ts` | ~150 |
| T1 | CREATE | `tests/agents/resilience/failover-classifier.test.ts` | ~100 |
| T2 | CREATE | `tests/agents/quality/reflect-step.test.ts` | ~90 |
| T2 | CREATE | `tests/agents/quality/history-compactor.test.ts` | ~120 |
| T2 | CREATE | `tests/agents/handoff/handoff-detector.test.ts` | ~110 |
| T3 | CREATE | `src/agents/router/agent-constants.ts` | ~120 |
| T3 | CREATE | `src/agents/router/providers.ts` | ~280 |
| T3 | CREATE | `src/agents/router/patch-flow.ts` | ~280 |
| T3 | CREATE | `tests/agents/router/router-decomposition.test.ts` | ~40 |
| T3 | MODIFY | `src/agents/channel-router.ts` | 908 → ~350 |
| T4 | MODIFY | `docs/02-design/01-ADRs/ADR-011-Composio-Integration.md` | +5 |
| T4 | MODIFY | `docs/02-design/01-ADRs/ADR-015-Retrieval-Explainability-Evidence.md` | +5 |
| T4 | CREATE | `src/agents/intelligence/index.ts` | ~10 |
| T5 | MODIFY | `src/gateway/web/index.html` | +50 |
| T5 | CREATE | `tests/gateway/web-commands.test.ts` | ~80 |
| T5 | MODIFY | `docs/02-design/01-ADRs/ADR-035-Web-UI-Command-Support.md` | +5 |

**Total:** 12 new files + 5 modified = 17 files, ~155 new tests, target ~7,282 passing

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| T3 refactor breaks hidden consumer | HIGH | Re-export all public symbols, incremental testing (CPO C5) |
| Handoff detector has undiscovered regex bugs | MEDIUM | Safety cases from CPO C3 catch stateful regex issues |
| Web safeMarkdown() regex conflicts with user content | LOW | HTML-escape runs first, markdown regex operates on escaped text |
| Coverage report tooling not configured | LOW | Use `vitest --coverage` with c8 provider |

---

*Sprint 121 plan by: @pm | CPO: APPROVED with conditions | CTO: APPROVED 8.5/10 with T3 conditions (C1-C3) | Baseline: 7,127 tests*
