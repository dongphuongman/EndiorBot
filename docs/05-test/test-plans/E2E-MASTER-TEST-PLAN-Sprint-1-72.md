# E2E Master Test Plan: Sprint 1-72

> **Historical artifact** — this document reflects the framework version and test count at the time of writing. Current stats: 8,124+ tests, SDLC 6.3.1.

**Status:** Active
**Date:** 2026-03-03
**Author:** @tester + @pm
**SDLC Stage:** 05-TEST
**Scope:** Full regression — ALL sprints (1-72)
**Target Project:** Dyad (Electron app, npm, STANDARD tier)

---

## 1. Overview

Comprehensive E2E test plan covering all EndiorBot features delivered across Sprints 1-72 (v1.0 → v2.0). This plan validates the entire CLI tool against a real project (Dyad) before v2.0 milestone release.

**CTO Recommendation:** Tiered approach — Critical features first, then important, then nice-to-have.

---

## 2. Test Environment

| Parameter | Value |
|-----------|-------|
| EndiorBot version | v1.0.0 (Sprint 72 complete) |
| Target project | Dyad (Electron + React + Vite) |
| Package manager | npm |
| SDLC tier | STANDARD |
| OS | macOS Darwin 25.3.0 |
| Node.js | v22+ |
| Test runner | Manual CLI + automated unit tests |

---

## 3. Tier 1: Critical (MUST PASS before v2.0 release)

### 3.1 Project Init & Detection (Sprint 61-62)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T1-01 | Fresh project init | `endiorbot init --path /tmp/fresh-test` | Scaffold created, .sdlc-config.json generated | 61 |
| T1-02 | Existing EndiorBot project detection | `endiorbot init --path <endiorbot>` | State: ENDIORBOT, no overwrite | 61 |
| T1-03 | Partial project detection | `endiorbot init` on project with docs/ but no config | State: PARTIAL, config generated | 61 |
| T1-04 | Tier detection from docs/ | `endiorbot init --analyze` | Correct tier inferred from existing stage dirs | 61 |
| T1-05 | Init with explicit tier | `endiorbot init --tier LITE` | LITE scaffold (4 stages) | 61 |
| T1-06 | Init idempotency | `endiorbot init` twice on same project | Second run: no unnecessary changes | 61 |
| T1-07 | Init with --force | `endiorbot init --force` | Backup created, files overwritten | 61 |

### 3.2 SDLC Gate Engine (Sprint 30-34, BUG-009, BUG-010)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T1-08 | Gate status display | `endiorbot gate status` | Progress-aware: CONFIRMED/AUTO-READY/CURRENT/LOCKED | 30-34 |
| T1-09 | Gate confirm G0 | `endiorbot gate confirm G0 --confirm` | G0 confirmed, persisted to disk | 30-34 |
| T1-10 | Gate persistence across invocations | Confirm G0, restart, `gate status` | G0 still shows ✅ CONFIRMED | BUG-010 |
| T1-11 | Gate sequential progression | Confirm G0 → G0.1 → G1 → G2 → G3 | Each gate shows confirmed, next unlocks | 30-34 |
| T1-12 | Gate recommend | `endiorbot gate recommend G2` | Full evaluation with command execution | 30-34 |
| T1-13 | Gate without G3 blocks ops | `endiorbot ops build` (no G3) | Blocked with message to confirm G3 | E2E |
| T1-14 | Gate force confirm | `endiorbot gate confirm G3 --force --confirm` | Force-confirmed with override reason | 30-34 |

### 3.3 DevOps Ops Command (Sprint E2E, TS-010)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T1-15 | Package manager detection | `endiorbot ops build --path <dyad>` | Detects npm from package-lock.json | E2E |
| T1-16 | Build execution | `endiorbot ops build --path <dyad> --skip-gate-check` | npm install + npm run build succeeds | E2E |
| T1-17 | Run execution | `endiorbot ops run --path <dyad> --skip-gate-check` | npm start launches app | E2E |
| T1-18 | Build-run combo | `endiorbot ops build-run --path <dyad> --skip-gate-check` | Build then run in sequence | E2E |
| T1-19 | Run with --dev flag | `endiorbot ops run --dev --path <dyad> --skip-gate-check` | Uses dev script (fallback to start) | E2E |
| T1-20 | Gate check enforcement | `endiorbot ops build --path <dyad>` (no G3) | Blocked | E2E |

### 3.4 Compliance (Sprint 61-62, 68)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T1-21 | Compliance score | `endiorbot compliance score` | Numeric score with breakdown | 61 |
| T1-22 | Compliance check | `endiorbot compliance check` | File/stage verification results | 61 |
| T1-23 | Stage contract validation | Gate transition with missing artifacts | Blocked if contract not met | 68 |

### 3.5 Session Resilience (Sprint 69-71)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T1-24 | State machine transitions | Unit test | 18 valid transitions, invalid rejected | 69 |
| T1-25 | Checkpoint creation | Unit test | Auto-checkpoint on time/event triggers | 70 |
| T1-26 | Failure classification | Unit test | TRANSIENT/FIXABLE/DESIGN_ISSUE correctly categorized | 71 |
| T1-27 | Recovery with retry | Unit test | Exponential backoff for transient failures | 71 |
| T1-28 | Failure evidence (CTO P0-6) | Unit test | ≥2 evidence types for escalation | 71 |

### 3.6 v2.0 Autonomous SDLC Agent (Sprint 72)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T1-29 | AER metric calculation | Unit test | 5 primary metrics computed correctly | 72 |
| T1-30 | Model tier selection | Unit test | architecture→ELITE, code→STANDARD, lint→EFFICIENCY | 72 |
| T1-31 | Session budget (Opus cap) | Unit test | $3/20min cap enforced, auto-downgrade | 72 |
| T1-32 | Autonomous session lifecycle | Unit test | Start → execute tasks → checkpoint → complete | 72 |
| T1-33 | Golden Scenario A (Gate A) | Golden test | Plan-only, no code writes, 30min | 72 |
| T1-34 | Golden Scenario B (Gate B) | Golden test | Max 10 files, decision packets | 72 |
| T1-35 | Golden Scenario C (Gate C) | Golden test | Full SDLC loop, 120min | 72 |

---

## 4. Tier 2: Important (Should pass for v2.0 quality)

### 4.1 Project Management (Sprint 29-34)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T2-01 | Start project | `endiorbot start dyad` | Active project set, config loaded | 29 |
| T2-02 | Switch project | `endiorbot switch endiorbot` | Context switches, new project active | 29 |
| T2-03 | Project status | `endiorbot status` | Shows active project, tier, gate progress | 29 |
| T2-04 | Config management | `endiorbot config get tier` | Shows configured tier | 30 |

### 4.2 Security Layer (Sprint 30-34)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-05 | Input sanitization | Unit test | SQL injection blocked | 30 |
| T2-06 | Output scrubbing | Unit test | API keys redacted | 30 |
| T2-07 | Shell guard | Unit test | Command injection blocked | 30 |
| T2-08 | Secure file permissions | Unit test | State dir is 0o700, files are 0o600 | 49 |

### 4.3 Code Search (Sprint 63-64)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-09 | RgProvider search | Unit/E2E test | ripgrep finds matches correctly | 63 |
| T2-10 | Search retrieval policy | Unit test | Policy determines search strategy | 64 |
| T2-11 | AstGrepProvider (feature flag) | Unit test | Stub returns expected results when enabled | 63 |

### 4.4 Context Anchoring (Sprint 65)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-12 | Spec Snapshot integration | Unit/E2E test | SHA256 of spec files computed correctly | 65 |
| T2-13 | Context anchoring events | Unit test | Anchoring on session_start, 15min, task_complete | 65 |
| T2-14 | Performance P95 | Benchmark | < 2000ms (current ~500ms) | 65 |

### 4.5 Model Tiering (Sprint 72)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-15 | Dynamic model selection | Unit test | Task type maps to correct tier | 72 |
| T2-16 | Budget-aware downgrade | Unit test | Opus → Sonnet when budget exceeded | 72 |
| T2-17 | Session cost tracking | Unit test | Cumulative cost tracked per session | 72 |

### 4.6 Checkpoint System (Sprint 38-39, 65)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-18 | Create checkpoint | `endiorbot checkpoint create` | Checkpoint saved to disk | 38 |
| T2-19 | Resume from checkpoint | `endiorbot resume` | State restored from checkpoint | 38 |
| T2-20 | Checkpoint versioning | Unit test | Migration between schema versions | 39 |

### 4.7 Stage Contracts (Sprint 68)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T2-21 | Contract validation (all 10 stages) | Unit test | Required artifacts checked via glob | 68 |
| T2-22 | Gate engine integration | Unit test | `contract:<stage>` checker works | 68 |
| T2-23 | Compliance dashboard | Unit test | Markdown/JSON/HTML reports generated | 68 |

---

## 5. Tier 3: Nice-to-Have (Quality and polish)

### 5.1 Brain Architecture (Sprint 45)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T3-01 | Brain 4-layer model | Unit test | L1 Events → L2 Patterns → L3 Structures → L4 Mental Models | 45 |
| T3-02 | Brain status | `endiorbot brain status` | Shows layer stats | 45 |
| T3-03 | Brain export | `endiorbot brain export` | JSON export of brain state | 45 |

### 5.2 Multi-Model Consultation (Sprint 39, 52-53)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T3-04 | 3-model consult | `endiorbot consult "Redis vs PostgreSQL?"` | Responses from 3 models | 39 |
| T3-05 | Cost optimization | Unit test | 83% cost reduction verified | 39 |
| T3-06 | Quality gates on responses | Unit test | Low-quality responses filtered | 39 |

### 5.3 Agent Orchestration (Sprint 55)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T3-07 | Agent invocation | `endiorbot agent architect "Design auth"` | Agent dispatched correctly | 55 |
| T3-08 | Handoff guards | Unit test | Max depth 3, chain validation | 55 |
| T3-09 | Mention parser | Unit test | `@agent message` parsed correctly | 55 |

### 5.4 Evaluator-Optimizer (Sprint 48)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T3-10 | Score card evaluation | Unit test | 5 quality dimensions scored | 48 |
| T3-11 | Optimizer strategies | Unit test | 5 optimization strategies applied | 48 |
| T3-12 | Eval-optimize loop | Unit test | Iterative improvement until threshold | 48 |

### 5.5 Gateway & WebSocket (Sprint 44, 47)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T3-13 | Gateway start | `endiorbot gateway start` | WebSocket server on configured port | 44 |
| T3-14 | Gateway health | `endiorbot gateway status` | Health check passes | 44 |
| T3-15 | Chat flow E2E | Unit/E2E test | Streaming chat through gateway | 47 |

### 5.6 Fix & Self-Correction (Sprint 41-42)

| # | Test Case | Command | Expected | Sprint |
|---|-----------|---------|----------|--------|
| T3-16 | Fix stats | `endiorbot fix-stats` | Weekly fix analytics | 41 |
| T3-17 | Pattern analytics | Unit test | Adaptive gates based on patterns | 42 |
| T3-18 | Error classifier | Unit test | Error types correctly categorized | 41 |

### 5.7 Providers (Sprint 38-39, 46)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T3-19 | Provider fallback | Unit test | Graceful degradation on failure | 49 |
| T3-20 | Rate limiting | Unit test | All 6 providers rate-limited | 49 |
| T3-21 | Resource routing | Unit test | Cost-based model selection | 38 |

### 5.8 Tools Integration (Sprint 50-51)

| # | Test Case | Method | Expected | Sprint |
|---|-----------|--------|----------|--------|
| T3-22 | Tool control plane | Unit test | Trust boundary enforced | 50 |
| T3-23 | Policy engine | Unit test | READ/WRITE/DESTRUCTIVE classification | 50 |
| T3-24 | Audit logging | Unit test | 100% execution logging | 50 |

---

## 6. Execution Plan

### Phase 1: Tier 1 Critical (Priority)

```
Day 1-2: Gate Engine (T1-08 to T1-14) + Init (T1-01 to T1-07)
Day 2-3: Ops Command (T1-15 to T1-20) + Compliance (T1-21 to T1-23)
Day 3-4: Session Resilience (T1-24 to T1-28) + v2.0 Autonomous (T1-29 to T1-35)
```

### Phase 2: Tier 2 Important

```
Day 4-5: Project Management + Security + Code Search + Context Anchoring
Day 5-6: Model Tiering + Checkpoints + Stage Contracts
```

### Phase 3: Tier 3 Nice-to-Have

```
Day 6-7: Brain + Consultation + Agents + Evaluator
Day 7-8: Gateway + Fixes + Providers + Tools
```

---

## 7. Test Results Tracking

| Tier | Total Tests | Passed | Failed | Blocked | Status |
|------|-------------|--------|--------|---------|--------|
| Tier 1 Critical | 35 | - | - | - | PENDING |
| Tier 2 Important | 23 | - | - | - | PENDING |
| Tier 3 Nice-to-Have | 24 | - | - | - | PENDING |
| **Total** | **82** | - | - | - | PENDING |

### Automated Test Baseline

```bash
pnpm test          # 3,434+ unit tests — MUST all pass
pnpm build         # TypeScript compilation — MUST pass
pnpm lint          # Code style — MUST pass
```

---

## 8. Pass Criteria

### v2.0 Release Gate

| Criterion | Threshold |
|-----------|-----------|
| Tier 1 tests | 100% pass |
| Tier 2 tests | 90%+ pass |
| Tier 3 tests | 70%+ pass |
| Unit tests | 3,434+ pass (no regression) |
| Build | Clean compilation |
| Lint | No errors |
| Known bugs | All P0/P1 fixed |

---

## 9. Known Issues & Workarounds

| Issue | Workaround | Status |
|-------|------------|--------|
| BUG-007 | Fixed (Sprint E2E) | ✅ |
| BUG-008 | Fixed (Sprint E2E) | ✅ |
| BUG-009 | Fixed — gate status progress display | ✅ |
| BUG-010 | Fixed — gate persistence to disk | ✅ |
| Dyad Electron binary missing | Run `node node_modules/electron/install.js` | Workaround |

---

## 10. References

- [Master Plan v3.2](../../00-foundation/master-plan.md)
- [ADR-004: Gate Engine](../../02-design/01-ADRs/ADR-004-SDLC-Gate-Engine.md)
- [TS-010: Ops Command](../../02-design/14-Technical-Specs/TS-010-Ops-Command.md)
- [Sprint Index](../../04-build/sprints/SPRINT-INDEX.md)
- [Golden Scenarios](../../../tests/golden-scenarios/)

---

*SDLC Framework v6.1.1 - Stage 05: Test*
