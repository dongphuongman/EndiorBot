# Master Test Plan - EndiorBot SDLC Framework

**Version:** 2.0
**Date:** 2026-03-02 (Updated after Sprint 72 completion)
**Framework:** SDLC v6.1.1
**Coverage:** Unit + Integration + E2E + Manual + Performance
**Milestone:** v2.0 Autonomous SDLC Agent

---

## Overview

This master test plan covers all testing aspects of EndiorBot, organized by test type and sprint deliverables.

### Test Pyramid

```
        ┌─────────────────┐
        │   Manual (25)   │  ← User acceptance, exploratory
        ├─────────────────┤
        │    E2E (74)     │  ← End-to-end workflows
        ├─────────────────┤
        │ Integration(197)│  ← Component integration ✅ Sprint 68-72
        ├─────────────────┤
        │  Unit (4530+)   │  ← Function-level tests
        └─────────────────┘
```

**Current Status (Post-Sprint 72): 2026-03-02**
- **Total Tests:** 4,602 (4,592 passing | 0 failing | 10 skipped)
- **Pass Rate:** 99.8% (up from 98.7%)
- **New Tests (Sprint 68-72):** 442 tests added
  - Sprint 68 (SDLC Compliance): 102 tests
  - Sprint 69-71 (Session Resilience): 112 tests
  - Sprint 72 (Autonomous Agent): 184 tests (+ 44 golden scenarios type tests)
- **Tech Debt:** 0 failing (all legacy tests fixed - Sprint 72)

---

## 1. Unit Tests (4,530+)

### 1.1 Context Module (97 tests) - Sprint 65

**Location:** `src/context/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| sprint-goals.test.ts | 14 | PASS | Sprint Goals persistence |
| checkpoint-manager.test.ts | 18 | PASS | Checkpoint create/restore |
| anchor-budget.test.ts | 23 | PASS | Token budget optimization |
| git-context.test.ts | 20 | PASS | Git time-travel queries |
| spec-snapshot-anchor.test.ts | 22 | PASS | Spec drift detection |

---

### 1.2 Search Module (176 tests) - Sprint 63-64

**Location:** `src/search/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| types.test.ts | 22 | PASS | Types, constants, utils |
| rg-provider.test.ts | 20 | PASS | RgProvider search |
| ast-grep-provider.test.ts | 26 | 9 SKIP | AstGrepProvider (binary) |
| result-ranker.test.ts | 36 | PASS | Multi-factor ranking |
| spec-snapshot.test.ts | 31 | PASS | Spec file discovery |
| integration.test.ts | 25 | PASS | Provider integration |
| ceo-benchmark.test.ts | 16 | PASS | CEO scenarios |

---

### 1.3 SDLC Module Tests - Sprint 61-62, 68

**Location:** `src/sdlc/**/__tests__/`

| Module | Tests | Status | Sprint | Notes |
|--------|-------|--------|--------|-------|
| scaffold/ | 159 | PASS | 61-62 | Structure generation, migration |
| contracts/ | 28 | PASS | 68 | Stage contracts, glob matching |
| gates/ | 14 | PASS | 68 | Gate engine integration |
| patches/ | 25 | PASS | 68 | Patch lifecycle, SHA256 audit |
| dashboard/ | 16 | PASS | 68 | Compliance scoring, reports |
| compliance-integration | 19 | PASS | 68 | Full E2E compliance flow |

**Total SDLC Tests:** 261

---

### 1.4 AER Metrics Module (32 tests) - Sprint 72 Week 1

**Location:** `src/metrics/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| aer-calculator.test.ts | 32 | PASS | AER calculation, JSONL parsing, aggregation |

**Validated Features:**
- 5 primary metrics: Autonomy Time, TCR, RR, Tool Choice, Cost per Task
- Model pricing calculations
- Event log parsing (JSONL format)
- Division-by-zero protection
- DEFAULT_AER_TARGETS v2.0 benchmarks

---

### 1.5 Model Tiering Module (71 tests) - Sprint 72 Week 2

**Location:** `src/models/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| model-selector.test.ts | 31 | PASS | Task-to-tier mapping, escalation, downgrade |
| session-budget.test.ts | 40 | PASS | Budget caps, Opus limits, event system |

**Validated Features:**
- 3-tier system: ELITE (Opus), STANDARD (Sonnet), EFFICIENCY (Haiku)
- Auto-escalation after 3 failures
- Budget-aware downgrade
- Opus caps: $3 max cost, 20min max time
- Stage-based allocation
- BudgetEventListener system

---

### 1.6 Session Resilience Module (112 tests) - Sprint 69-71

**Location:** `src/sessions/__tests__/`, `src/sessions/autonomous/__tests__/`

| Test Suite | Tests | Status | Sprint | Coverage |
|------------|-------|--------|--------|----------|
| state-machine.test.ts | 36 | PASS | 69-71 | 9 states, 18 transitions |
| failure-classifier.test.ts | 25 | PASS | 69-71 | TRANSIENT/FIXABLE/DESIGN_ISSUE |
| recovery-engine.test.ts | 19 | PASS | 69-71 | Retry, fix loop, escalation |
| manager.test.ts | 32 | PASS | 72 | Autonomous session orchestration |

**Validated Features:**
- ResilienceState enum (INIT -> DONE, 9 states)
- Failure classification with evidence types
- Exponential backoff retry (transient)
- Fix loop with max attempts (fixable)
- Context-aware escalation (design issues)
- Autonomy Gates A/B/C
- Task queue with priority sorting

---

### 1.7 Golden Scenarios (49 tests) - Sprint 72 Week 4

**Location:** `tests/golden-scenarios/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| types.test.ts | 24 | PASS | Scenario types, YAML parsing |
| validator.test.ts | 16 | PASS | 10+ validation rules |
| runner.test.ts | 9 | PASS | Dry-run, parallel execution |

**Validated Features:**
- Gate A: Design only (no code writes)
- Gate B: Limited writes (max 10 files)
- Gate C: Full autonomy (2h sessions)
- YAML scenario parsing
- ScenarioRunner with dry-run mode

---

### 1.8 Core Module Tests

**Location:** `src/**/__tests__/`

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| providers/ | ~3500 | MOSTLY PASS | Multi-model AI |
| agents/ | ~150 | PASS | Agent framework |
| budget/ | 56 | PASS | Budget tracker |
| account-manager | 65 | PASS | Multi-account switching |
| config/ | ~50 | PASS | Configuration |
| logging/ | ~30 | PASS | Logger |
| utils/ | ~40 | PASS | Utilities |

---

### 1.9 Previously Known Failures (RESOLVED)

| File | Was Failing | Fix Applied | Sprint Fixed |
|------|-------------|-------------|--------------|
| tests/integration/workflow.test.ts | 40 | Rewritten to match multi-workflow ID-based API | 72 |
| tests/integration/agent-loop.test.ts | 20 | Rewritten to match ParseResult/HandoffGuards API | 72 |
| tests/cli/cli-smoke.test.ts | 1 | Fixed test ordering assertion | 72 |

- **Total Tech Debt:** 0 failing tests (all resolved)
- **Resolution:** All 61 legacy tests rewritten to match current API implementations

---

## 2. Integration Tests

### 2.1 SDLC Compliance Integration (19 tests) - Sprint 68

**File:** `tests/sdlc/compliance-integration.test.ts`

**Scenarios:**
1. Init -> Scaffold -> Compliance full flow
2. Multi-tier validation (LITE/STANDARD/PROFESSIONAL)
3. PatchManager lifecycle (start -> commit -> rollback)
4. Dashboard scoring with report generation
5. Stage contract enforcement

**Status:** 19 tests passing | Performance: < 50ms full scan

---

### 2.2 Search Integration (25 tests) - Sprint 63-64

**File:** `src/search/__tests__/integration.test.ts`

**Status:** 19 passing | 6 skipped (binaries)

---

### 2.3 Multi-Model Consultation (TBD)

**Status:** PLANNED

---

## 3. End-to-End Tests (74 tests)

### 3.1 Context Anchoring E2E (17 tests) - Sprint 65

**File:** `tests/e2e/context-anchoring.e2e.test.ts`
**Status:** 17 tests passing

### 3.2 Code Search E2E (20 tests) - Sprint 65

**File:** `tests/e2e/code-search.e2e.test.ts`
**Status:** 20 tests passing

### 3.3 Chat Flow E2E (37 tests) - Sprint 65

**Files:** `tests/e2e/*.e2e.test.ts` (5 files)
**Status:** 37 tests passing

---

## 4. Sprint 72 E2E Report

**Full Report:** [E2E-SPRINT-72-REPORT-2026-03-02.md](./07-E2E-Testing/reports/E2E-SPRINT-72-REPORT-2026-03-02.md)

### Sprint 72 Test Summary

| Week | Module | Tests | Time |
|------|--------|-------|------|
| 1 | AER Metrics | 32 | 254ms |
| 2 | Model Tiering | 71 | 60ms |
| 3 | Autonomous Session Manager | 32 | 10.5s |
| 4 | Golden Scenarios | 49 | 29ms |
| **Total** | | **184** | **10.8s** |

---

## 5. Manual Tests (25 tests)

**File:** [manual-test-plan.md](./manual-test-plan.md)

| Suite | Tests | Passed | Pending |
|-------|-------|--------|---------|
| Context Search | 6 | 6 | 0 |
| Multi-Model Consultation | 5 | 2 | 3 |
| Compliance | 2 | 2 | 0 |
| Init Command | 2 | 2 | 0 |
| Core Commands | 3 | 1 | 2 |
| Error Handling | 3 | 3 | 0 |
| Performance | 2 | 0 | 2 |
| Integration | 2 | 0 | 2 |
| **TOTAL** | **25** | **16** | **9** |

---

## 6. Performance Tests

### 6.1 Measured Performance (Sprint 68-72)

| Module | Target | Actual | Status |
|--------|--------|--------|--------|
| SDLC Compliance full scan | < 3s | < 50ms | PASS |
| AER Calculator (32 tests) | < 1s | 254ms | PASS |
| ModelSelector (31 tests) | < 100ms | 22ms | PASS |
| SessionBudget (40 tests) | < 100ms | 38ms | PASS |
| Golden Scenarios (49 tests) | < 1s | 29ms | PASS |
| AutonomousManager (32 tests) | < 30s | 10.5s | PASS |
| State Machine (36 tests) | < 500ms | 113ms | PASS |

---

## 7. Compliance Tests

### 7.1 SDLC Compliance - Sprint 68

- File compliance (CLAUDE.md, IDENTITY.md, AGENTS.md)
- Stage compliance (7 stages for STANDARD tier)
- Tier detection (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)
- Stage contracts (10 default contracts with glob matching)
- Compliance dashboard (scoring 0-100, multi-format reports)

**Status:** 100% compliance verified

### 7.2 Code Quality

- TypeScript strict mode with exactOptionalPropertyTypes
- ESLint configured
- Zero Mock Policy compliance
- Factory pattern with reset functions

---

## 8. Regression Tests

### 8.1 Automated Regression Suite

**Baseline:** 4,592 tests passing (Sprint 72)

**Regression Gate:**
- BLOCK if > 5% tests fail
- WARN if > 1% tests fail
- PASS if <= 1% tests fail

**Current:** 0/4,602 = 0% (all tests passing)

### 8.2 Sprint-Specific Regression

| Sprint | New Tests | Regression | Status |
|--------|-----------|------------|--------|
| 68 | 102 | 0 regressions | PASS |
| 69-71 | 112 | 0 regressions | PASS |
| 72 | 184 | 0 regressions | PASS |

---

## 9. Test Metrics & KPIs

### 9.1 Current Metrics (Post-Sprint 72)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Total tests | 4,602 | - | - |
| Pass rate | 99.8% | > 99% | ON TARGET |
| Tech debt tests | 0 | < 20 | RESOLVED |
| Flaky tests | 0 | 0 | ON TARGET |
| New tests (Sprint 68-72) | 442 | - | +10.6% growth |

### 9.2 Coverage by Module

| Module | Tests | Coverage |
|--------|-------|----------|
| Providers | ~3,500 | ~95% |
| SDLC | 261 | ~98% |
| Sessions | 112 | ~95% |
| Metrics | 32 | ~98% |
| Models | 71 | ~98% |
| Golden Scenarios | 49 | ~90% |
| Search | 176 | ~95% |
| Context | 97 | ~98% |
| Other (budget, config, etc.) | ~200 | ~85% |

---

## 10. Bug Tracking

### 10.1 Current Known Issues

| ID | Description | Severity | Sprint | Status |
|----|-------------|----------|--------|--------|
| BUG-002 | ripgrep binary not found | P2 | 63 | WORKAROUND |

### 10.2 Resolved Issues

| ID | Description | Sprint Fixed |
|----|-------------|-------------|
| BUG-001 | workflow.test.ts failures | Sprint 72 (tests rewritten to match multi-workflow API) |
| BUG-003 | active.json not persisted | Sprint 65 |
| BUG-004 | RgProvider file type error | Sprint 65 |
| BUG-005 | agent-loop.test.ts stale tests | Sprint 72 (tests rewritten to match ParseResult API) |
| BUG-006 | cli-smoke status command | Sprint 72 (fixed test ordering assertion) |
| BUG-007 | init treats path argument as project-name | E2E Dyad (path redirected to --path in action) |
| BUG-008 | compliance ignores active project | E2E Dyad (loadActiveProject() fallback added) |
| BUG-009 | gate status shows all gates empty for fresh project | E2E Dyad (progress-aware display with GateEngine eval) |

---

## 11. Test Documentation

### 11.1 Test Plans

- [Master Test Plan](./MASTER-TEST-PLAN.md) (this file)
- [Manual Test Plan](./manual-test-plan.md)
- [Dogfooding Test Plan](./DOGFOODING-TEST-PLAN.md)
- [TP-061 Init Command](./test-plans/TP-061-Init-Command.md)
- [TP-062 Restructure Compliance](./test-plans/TP-062-Restructure-Compliance.md)

### 11.2 Test Reports

- [E2E API Report 2026-02-27](./07-E2E-Testing/reports/E2E-API-REPORT-2026-02-27.md)
- [E2E Sprint 72 Report 2026-03-02](./07-E2E-Testing/reports/E2E-SPRINT-72-REPORT-2026-03-02.md)
- [Test Report 2026-03-01](./test-reports/test-report-2026-03-01.md)

---

## 12. Next Steps

### Immediate Actions (Post-Sprint 72)

1. ~~Fix BUG-006: cli-smoke status command~~ DONE
2. ~~Fix tech debt tests (BUG-001, BUG-005)~~ DONE (61 tests rewritten)
3. Run full security audit

### Short-term (Sprint 73+)

1. Add performance benchmarks for AER calculation
2. Add stress tests for SessionBudget event system
3. Property-based testing for state machine

### Long-term (Sprint 75+)

1. Mutation testing for critical paths
2. CI/CD pipeline integration
3. Load testing with large codebases
4. External user acceptance testing

---

## Appendix A: Test Commands

```bash
# Run all tests
pnpm test

# Run Sprint 72 modules
pnpm test src/metrics/__tests__ src/models/__tests__ tests/golden-scenarios/__tests__

# Run Session Resilience
pnpm test src/sessions/__tests__ src/sessions/autonomous/__tests__

# Run SDLC Compliance
pnpm test tests/sdlc/ src/sdlc/__tests__

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test src/models/__tests__/session-budget.test.ts
```

---

## Appendix B: Sprint Test History

| Sprint | New Tests | Cumulative | Pass Rate |
|--------|-----------|------------|-----------|
| 61-62 | 172 | ~4,000 | 98.5% |
| 63-64 | 176 | ~4,078 | 98.5% |
| 65 | 171 | ~4,112 | 98.5% |
| 66-67 | 0 (SKIPPED) | ~4,112 | 98.5% |
| 68 | 102 | ~4,214 | 98.5% |
| 69-71 | 112 | ~4,326 | 98.6% |
| 72 | 184 | ~4,530 | 98.7% |
| 72-fix | +61 fixed | 4,602 | 99.8% |

---

*Master Test Plan v2.0 | SDLC Framework v6.1.1 | Sprint 72*
