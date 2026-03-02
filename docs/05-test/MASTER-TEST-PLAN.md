# Master Test Plan - EndiorBot SDLC Framework

**Version:** 1.1
**Date:** 2026-03-01 (Updated after Sprint 65 completion)
**Framework:** SDLC v6.1.1
**Coverage:** Unit + Integration + E2E + Manual + Performance

---

## Overview

This master test plan covers all testing aspects of EndiorBot, organized by test type and sprint deliverables.

### Test Pyramid

```
        ┌─────────────────┐
        │   Manual (25)   │  ← User acceptance, exploratory
        ├─────────────────┤
        │    E2E (74)     │  ← End-to-end workflows ✅ Sprint 65
        ├─────────────────┤
        │Integration (100)│  ← Component integration
        ├─────────────────┤
        │  Unit (4100+)   │  ← Function-level tests
        └─────────────────┘
```

**Current Status (Post-Sprint 65):**
- **Unit Tests:** 4,112 passing | 63 failing (tech debt)
  - Context Module: 97 tests ✅ NEW (Sprint 65)
  - Search Module: 176 tests ✅
- **Integration Tests:** 25 passing (search module)
- **E2E Tests:** 74 passing ✅ NEW (Sprint 65)
- **Manual Tests:** 16/25 passing (64% coverage)
- **Performance Tests:** TBD

---

## 1. Unit Tests (4,016)

### 1.1 Context Module (97 tests) ✅ Sprint 65

**Location:** `src/context/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| sprint-goals.test.ts | 14 | ✅ ALL PASS | Sprint Goals persistence |
| checkpoint-manager.test.ts | 18 | ✅ ALL PASS | Checkpoint create/restore |
| anchor-budget.test.ts | 23 | ✅ ALL PASS | Token budget optimization |
| git-context.test.ts | 20 | ✅ ALL PASS | Git time-travel queries |
| spec-snapshot-anchor.test.ts | 22 | ✅ ALL PASS | Spec drift detection |

**Coverage:** ~98% (Sprint 65 deliverable)

---

### 1.2 Search Module (176 tests) ✅ Sprint 63-64

**Location:** `src/search/__tests__/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| types.test.ts | 22 | ✅ ALL PASS | Types, constants, utils |
| rg-provider.test.ts | 20 | ✅ ALL PASS | RgProvider search |
| ast-grep-provider.test.ts | 26 | ⚠️ 9 SKIP | AstGrepProvider (binary) |
| result-ranker.test.ts | 36 | ✅ ALL PASS | Multi-factor ranking |
| spec-snapshot.test.ts | 31 | ✅ ALL PASS | Spec file discovery |
| integration.test.ts | 25 | ✅ ALL PASS | Provider integration |
| ceo-benchmark.test.ts | 16 | ✅ ALL PASS | CEO scenarios |

**Coverage:** ~95% (excluding binaries)

---

### 1.2 SDLC Module Tests

**Location:** `src/sdlc/**/__tests__/`

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| scaffold/ | 172 | ✅ ALL PASS | Sprint 61 |
| compliance/ | TBD | ⏳ | Sprint 61 |
| gates/ | TBD | ⏳ | Sprint 62 |

---

### 1.3 Core Module Tests

**Location:** `src/**/__tests__/`

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| providers/ | ~3500 | ✅ MOSTLY PASS | Multi-model AI |
| agents/ | ~150 | ✅ ALL PASS | Agent framework |
| config/ | ~50 | ✅ ALL PASS | Configuration |
| logging/ | ~30 | ✅ ALL PASS | Logger |
| utils/ | ~40 | ✅ ALL PASS | Utilities |

---

### 1.4 Known Failures (Tech Debt)

**Location:** `tests/integration/workflow.test.ts`

- **Count:** 62 failing tests
- **Root Cause:** Missing workflow methods from Sprint 58
- **Impact:** No blocking issues
- **Priority:** P3 (backlog)
- **Tracking:** Tech debt ticket TBD

---

## 2. Integration Tests (125)

### 2.1 Search Integration (25 tests)

**File:** `src/search/__tests__/integration.test.ts`

**Scenarios:**
1. RgProvider + ResultRanker pipeline
2. AstGrepProvider + SpecSnapshot integration
3. Multi-provider search coordination
4. Budget enforcement across providers
5. Error handling and fallback

**Status:** ✅ 19 passing | ⚠️ 6 skipped (binaries)

---

### 2.2 Multi-Model Consultation (TBD)

**File:** `tests/integration/consultation.test.ts` (to create)

**Scenarios:**
1. Full 3-model consultation (Claude + OpenAI + Gemini)
2. Primary provider override
3. Agreement detection (full/partial/none)
4. Token budget tracking
5. Error handling (provider unavailable)

**Status:** ⏳ PLANNED

---

### 2.3 SDLC Workflow (TBD)

**File:** `tests/integration/sdlc-workflow.test.ts` (to create)

**Scenarios:**
1. Init → Scaffold → Compliance flow
2. Gate progression (G0 → G1 → ... → G8)
3. Sprint lifecycle (start → develop → close)
4. Context switching between projects

**Status:** ⏳ PLANNED

---

## 3. End-to-End Tests (74 tests) ✅ Sprint 65

### 3.1 Context Anchoring E2E (17 tests)

**File:** `tests/e2e/context-anchoring.e2e.test.ts` ✅

**Test Scenarios:**
- Sprint Goals persistence across sessions
- Checkpoint create/restore workflow
- Token budget optimization strategies
- Git context injection
- Full context anchoring workflow

**Status:** ✅ 17 tests passing

---

### 3.2 Code Search E2E (20 tests)

**File:** `tests/e2e/code-search.e2e.test.ts` ✅

**Test Scenarios:**
- RgProvider integration
- ResultRanker scoring
- Stage/role-aware search
- Budget enforcement
- Multi-provider coordination

**Status:** ✅ 20 tests passing

---

### 3.3 Chat Flow E2E (37 tests)

**Files:** `tests/e2e/*.e2e.test.ts` (5 files) ✅

**Test Scenarios:**
- Multi-model consultation flow
- Budget integration across requests
- Connection resilience
- Stream handling
- Error recovery

**Status:** ✅ 37 tests passing

---

### 3.4 CLI Command E2E (Planned)

**File:** `tests/e2e/cli-commands.test.ts` (to create)

**Test Cases:**

| ID | Command | Scenario | Status |
|----|---------|----------|--------|
| E2E-01 | `init` | Initialize new project | ⏳ Manual tested |
| E2E-02 | `compliance check` | Verify compliance | ⏳ |
| E2E-03 | `context search` | Codebase search | ⏳ |
| E2E-04 | `consult` | Multi-model query | ⏳ |
| E2E-05 | `consult --via-claude-code` | OAuth Max 200 | ✅ |
| E2E-06 | `gate status` | Check gates | ⏳ |
| E2E-07 | `status` | Project status | ⏳ |

---

### 3.2 User Workflows E2E (25 tests)

**File:** `tests/e2e/user-workflows.test.ts` (to create)

**Scenarios:**

1. **New Project Setup**
   - Run `init` in empty directory
   - Verify CLAUDE.md, IDENTITY.md created
   - Check compliance = 100%

2. **Search & Consult**
   - Search for "authentication"
   - Consult with search results
   - Verify response accuracy

3. **Sprint Progression**
   - Start sprint
   - Develop features
   - Close sprint with gate check

**Status:** ⏳ PLANNED

---

## 4. Manual Tests (25 tests)

**File:** [`docs/05-test/manual-test-plan.md`](./manual-test-plan.md)

### 4.1 Test Suites (Updated 2026-03-01)

| Suite | Tests | Passed | Failed | Pending |
|-------|-------|--------|--------|---------|
| Context Search | 6 | 6 | 0 | 0 |
| Multi-Model Consultation | 5 | 2 | 0 | 3 |
| Compliance | 2 | 2 | 0 | 0 |
| Init Command | 2 | 2 | 0 | 0 |
| Core Commands | 3 | 1 | 0 | 2 |
| Error Handling | 3 | 3 | 0 | 0 |
| Performance | 2 | 0 | 0 | 2 |
| Integration | 2 | 0 | 0 | 2 |
| **TOTAL** | **25** | **16** | **0** | **9** |

**Status:** ✅ 64% COMPLETE (16/25 passing, 100% pass rate)

**Bugs Fixed:**
- ✅ BUG-003: active.json not persisted (TC-5.1 now passing)
- ✅ BUG-004: RgProvider file type error (TC-1.1 through TC-1.6 now passing)

---

## 5. Performance Tests (TBD)

### 5.1 Search Performance

**File:** `tests/performance/search-perf.test.ts` (to create)

**Benchmarks:**

| Scenario | Target | Current | Status |
|----------|--------|---------|--------|
| RgProvider search (small repo) | < 100ms | TBD | ⏳ |
| RgProvider search (large repo) | < 500ms | TBD | ⏳ |
| AstGrepProvider search | < 2s | TBD | ⏳ |
| ResultRanker (100 results) | < 50ms | TBD | ⏳ |
| Full pipeline (search + rank) | < 1s | TBD | ⏳ |

---

### 5.2 Consultation Performance

**File:** `tests/performance/consult-perf.test.ts` (to create)

**Benchmarks:**

| Scenario | Target | Current | Status |
|----------|--------|---------|--------|
| Single model query | < 5s | ~3-5s | ✅ |
| 3-model consultation | < 15s | ~10-15s | ✅ |
| Claude Code CLI (OAuth) | < 30s | ~19s | ✅ |

---

## 6. Security Tests (TBD)

### 6.1 API Key Security

**Scenarios:**
1. ✅ API keys not committed to git (.env.local in .gitignore)
2. ✅ API keys redacted in logs
3. ⏳ API keys not exposed in error messages
4. ⏳ API keys properly scoped (read-only where possible)

---

### 6.2 Input Validation

**Scenarios:**
1. ⏳ SQL injection prevention (not applicable - no SQL)
2. ⏳ Command injection prevention (shell escaping)
3. ⏳ Path traversal prevention (file access)
4. ⏳ XSS prevention (HTML output sanitization)

---

## 7. Compliance Tests

### 7.1 SDLC Compliance

**File:** `src/cli/commands/compliance.ts` + tests

**Checks:**
- ✅ File compliance (CLAUDE.md, IDENTITY.md, AGENTS.md)
- ✅ Stage compliance (7 stages for STANDARD tier)
- ✅ Tier detection (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)

**Status:** ✅ 100% compliance (verified)

---

### 7.2 Code Quality

**Tools:**
- ✅ TypeScript strict mode
- ✅ ESLint (configured)
- ⏳ Prettier (to configure)
- ⏳ Dependency audit (npm audit)

---

## 8. Regression Tests

### 8.1 Automated Regression Suite

**Strategy:**
- Every sprint adds new tests
- Existing tests must continue passing
- Baseline: 4,016 tests passing

**Regression Gate:**
- ❌ Block if > 5% tests fail
- ⚠️ Warn if > 1% tests fail
- ✅ Pass if ≤ 1% tests fail (acceptable tech debt)

**Current:** 62/4078 = 1.5% (acceptable)

---

### 8.2 Sprint-Specific Regression

**Sprint 63-64 Regression:**
- ✅ All 176 search tests passing
- ✅ No breaking changes to existing APIs
- ✅ Compliance remains 100%

---

## 9. Test Execution Schedule

### 9.1 Continuous (CI/CD)

**On every commit:**
- ✅ Run unit tests (4,000+)
- ✅ Run linter
- ⏳ Run integration tests (when created)

**On PR:**
- ✅ All unit tests
- ⏳ Integration tests
- ⏳ E2E tests (smoke)

**On release:**
- ✅ Full test suite
- ⏳ Performance tests
- ⏳ Security scan
- ✅ Manual smoke tests

---

### 9.2 Manual Testing Cadence

**Weekly:**
- Run manual test plan (25 tests)
- Update test results
- File bugs for failures

**Per Sprint:**
- Manual acceptance testing
- CEO benchmark validation
- Performance baseline

---

## 10. Test Metrics & KPIs

### 10.1 Current Metrics

**Coverage:**
- **Unit test coverage:** ~85% (estimated)
- **Integration coverage:** ~30% (search module only)
- **E2E coverage:** ~5% (minimal)
- **Manual coverage:** 8% (2/25 tests)

**Quality:**
- **Test pass rate:** 98.5% (4016/4078)
- **Flaky tests:** 0
- **Tech debt tests:** 62 (tracked)

---

### 10.2 Target Metrics (Sprint 65+)

**Coverage Targets:**
- Unit test coverage: > 90%
- Integration coverage: > 60%
- E2E coverage: > 80%
- Manual coverage: 100%

**Quality Targets:**
- Test pass rate: > 99%
- Flaky tests: 0
- Tech debt tests: < 20

---

## 11. Test Environment

### 11.1 Development

- **OS:** macOS / Linux
- **Node:** v24.11.0+
- **Dependencies:** Install via `pnpm install`
- **Binaries:** ripgrep, ast-grep (optional)

---

### 11.2 CI/CD

- **Platform:** GitHub Actions (to configure)
- **Triggers:** PR, commit to main, release
- **Artifacts:** Test reports, coverage reports
- **Notifications:** Slack (to configure)

---

## 12. Test Data

### 12.1 Test Fixtures

**Location:** `tests/fixtures/`

**Data:**
- Sample .pen files (Sprint 63)
- Sample SDLC configs (Sprint 61)
- Mock API responses (Sprint 54)
- Sample codebases (Sprint 64 benchmark)

---

### 12.2 Test Repositories

**EndiorBot self-test:**
- Use EndiorBot repo as test data
- ~6,000 lines of TypeScript
- Real-world SDLC compliance

**External test repos:** (to create)
- Minimal project (10 files)
- Medium project (100 files)
- Large project (1000+ files)

---

## 13. Bug Tracking

### 13.1 Current Known Issues

| ID | Description | Severity | Sprint | Status |
|----|-------------|----------|--------|--------|
| BUG-001 | workflow.test.ts failures | P3 | 58 | 🐛 OPEN |
| BUG-002 | ripgrep binary not found | P2 | 63 | 🔧 WORKAROUND |

---

### 13.2 Bug Lifecycle

1. **Discovered** → File in GitHub Issues
2. **Triaged** → Assign priority (P0-P3)
3. **Fixed** → Create PR with fix + test
4. **Verified** → QA validates fix
5. **Closed** → Merged to main

---

## 14. Test Documentation

### 14.1 Test Plans

- ✅ [Manual Test Plan](./manual-test-plan.md)
- ✅ [Master Test Plan](./MASTER-TEST-PLAN.md) (this file)
- ⏳ CEO Benchmark Results (to create)
- ⏳ Performance Benchmark Results (to create)

---

### 14.2 Test Reports

**Location:** `docs/05-test/test-reports/`

- Sprint 61 Test Report (to create)
- Sprint 63 Test Report (to create)
- Sprint 64 Test Report (to create)

---

## 15. Next Steps

### Immediate Actions (Sprint 64)

1. ✅ Create Master Test Plan
2. ⏳ Execute manual tests (23 pending)
3. ⏳ Install ripgrep for full search testing
4. ⏳ Document CEO benchmark results

---

### Short-term (Sprint 65)

1. Create E2E test suite
2. Add integration tests for consultation
3. Set up CI/CD pipeline
4. Achieve > 90% unit test coverage

---

### Long-term (Sprint 66+)

1. Performance regression testing
2. Security audit and penetration testing
3. Load testing (large codebases)
4. User acceptance testing (external users)

---

## Appendix A: Test Commands

### Run All Tests
```bash
pnpm test
```

### Run Specific Module
```bash
pnpm test src/search
```

### Run with Coverage
```bash
pnpm test --coverage
```

### Run Manual Tests
```bash
# Follow docs/05-test/manual-test-plan.md
```

### Run Performance Tests
```bash
# TBD: pnpm test:perf
```

---

## Appendix B: Test Standards

### Unit Test Standards

- **AAA Pattern:** Arrange, Act, Assert
- **One assertion per test:** Focused tests
- **Descriptive names:** `it("should return empty array when no results found")`
- **No test interdependence:** Each test runs independently
- **Mock external dependencies:** APIs, file system, etc.

### Integration Test Standards

- **Real dependencies:** Use actual components, not mocks
- **Test interfaces:** Focus on component boundaries
- **Test data cleanup:** Clean up after each test
- **Realistic scenarios:** Mirror production usage

### E2E Test Standards

- **User perspective:** Test as end user would use it
- **Complete workflows:** Full user journeys
- **Stable selectors:** Don't rely on implementation details
- **Idempotent:** Can run multiple times safely

---

*Master Test Plan v1.0 | SDLC Framework v6.1.1 | Sprint 64*
