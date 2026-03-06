# Master Test Plan - EndiorBot SDLC Framework

**Version:** 6.0
**Date:** 2026-03-06 (Updated after Sprint 80 completion)
**Framework:** SDLC v6.1.1
**Coverage:** Unit + Integration + E2E + Manual + Performance
**Milestone:** v2.2 SDLC Content Quality + Gate Fixes (ADR-023)

---

## Overview

This master test plan covers all testing aspects of EndiorBot, organized by test type and sprint deliverables.

### Test Pyramid

```
        ┌─────────────────┐
        │  Manual (177)   │  ← User acceptance, exploratory
        ├─────────────────┤
        │    E2E (74)     │  ← End-to-end workflows
        ├─────────────────┤
        │ Integration(197)│  ← Component integration ✅ Sprint 68-72
        ├─────────────────┤
        │  Unit (5100+)   │  ← Function-level tests
        └─────────────────┘
```

**Current Status (Post-Sprint 80): 2026-03-06**
- **Total Tests:** 5,155 (5,145 passing | 0 failing | 10 skipped)
- **Pass Rate:** 99.8%
- **New Tests (Sprint 68-80):** 984 tests added
  - Sprint 68 (SDLC Compliance): 102 tests
  - Sprint 69-71 (Session Resilience): 112 tests
  - Sprint 72 (Autonomous Agent): 184 tests (+ 44 golden scenarios type tests)
  - Sprint 73 (CLI Session Mode): 42 tests
  - Sprint 74 (Team Agent System): 99 tests
  - Sprint 75 (Compliance Fix Engine): 41 tests
  - Sprint 76 (OTT Channel Enhancement): 68 unit + 63 manual tests
  - Sprint 77 (Zalo Channel): 153 unit tests
  - Sprint 78 (Local Ollama Router + Conversation Persistence): 70 unit tests
  - Sprint 79 (Smart Init): 31 unit + 35 manual tests
  - Sprint 80 (SDLC Content Quality): 27 unit + 34 manual tests
- **Tech Debt:** 1 flaky test (checkpoint.test.ts:462 — pre-existing since Sprint 35-40)

---

## 1. Unit Tests (5,000+)

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
| gates/ | 25 | PASS | 68, 80 | Gate engine integration + gate: checker + OTT fix |
| patches/ | 25 | PASS | 68 | Patch lifecycle, SHA256 audit |
| dashboard/ | 16 | PASS | 68 | Compliance scoring, reports |
| compliance-integration | 19 | PASS | 68 | Full E2E compliance flow |

**Total SDLC Tests:** 288

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

### 1.9 Team Agent System (99 tests) - Sprint 74

**Location:** `tests/agents/orchestrator/`
**Authority:** ADR-017 Team Agent System

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| team-registry.test.ts | 44 | PASS | Registry loading, lookup, resolution, tier switching, charter caching, type guards |
| mention-parser-teams.test.ts | 28 | PASS | Agent-first namespace, team detection, tier availability, backward compat, isTeam derivation |
| agent-router-teams.test.ts | 27 | PASS | Team routing, SOUL enrichment, setTier sync, classification, getTeamRegistry |

**Validated Features:**
- 7 teams: planning, dev, qa, design, ops, fullstack, executive
- Tier-dependent availability: LITE(1) → STANDARD(3) → PRO(5) → ENT(6)
- Agent-first namespace resolution (@pm→agent, @planning→team→pm)
- SOUL context injection: teammates, delegation, charter
- Team charter loading and caching
- Type guards: isValidTeamId, isValidTeamArchetype, isAllowedTeamTransition
- ALLOWED_TEAM_TRANSITIONS (SDLC-aware handoff rules)
- Backward compatibility: no registry → agents only

**Key Design Decisions Tested:**
- CTO B3: `isTeam` derived from `teamId` (never set independently)
- Agent-first: `@fullstack` routes as agent in LITE, not team
- Enrichment: `## Team Context` section appended to leader SOUL
- Tier sync: `setTier()` updates both AgentRouter and TeamRegistry

---

### 1.10 CLI Session Mode (42 tests) - Sprint 73

**Location:** `tests/cli/`, `tests/sessions/`

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| session-mode.test.ts | 22 | PASS | CLI session mode, L2 compliance |
| cli-session-integration.test.ts | 20 | PASS | BUG-011 fix, session resilience |

**Validated Features:**
- CLI session mode switching
- L2 Compliance checks
- BUG-011 fix verification

---

### 1.11 Compliance Fix Engine (41 tests) - Sprint 75

**Location:** `tests/sdlc/compliance-fix.test.ts`
**Authority:** ADR-018 AI-Generated Compliance Content

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| compliance-fix.test.ts | 41 | PASS | Fix engine, issue mapper, content generator, project context |

**Validated Features:**
- ComplianceFixEngine with dry-run and auto-confirm modes
- Issue mapper: compliance issues → fix operations
- AI content generator for missing SDLC artifacts
- Project context collector for AI-generated content
- CLI: `endiorbot compliance fix [--dry-run] [--stage]`
- Stage contracts: artifact dependency tracking

---

### 1.12 OTT Channel Enhancement (68 tests) - Sprint 76

**Location:** `tests/channels/ott/ott-enhancement.test.ts`
**Authority:** ADR-019 OTT Channel Enhancement

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| Telegram Commands (10 new) | 15 | PASS | /agents, /teams, /gate, /compliance, /fix, /consult, /config, /init, /mode, /webhook |
| Help Message | 3 | PASS | 14 commands, 4 categories, mention format |
| Agent Keyboard | 6 | PASS | 12 agents tier-aware, 3-per-row layout, icons |
| Team Keyboard | 5 | PASS | Tier-aware (LITE→ENT), 2-per-row, callbacks |
| Mode Confirm Keyboard | 2 | PASS | Confirm/cancel buttons, request ID |
| formatAgentNotFound | 2 | PASS | 12 agents + 7 teams dynamic list |
| Webhook (Telegram) | 8 | PASS | Secret token, body parsing, JSON validation |
| Webhook (Zalo) | 6 | PASS | HMAC-SHA256 MAC, replay protection, timestamp |
| Webhook (Rate Limit) | 1 | PASS | 100/min per IP sliding window |
| Webhook (Handler) | 5 | PASS | HTTP routing, 405, 404, body size limit |
| Agent Icons | 2 | PASS | All 12 + fallback, fullstack icon |
| i18n | 2 | PASS | 25 EN keys, 25 VI keys |
| Response Formatter | 3 | PASS | Processing, error, patch status |
| CTO Fixes | 4 | PASS | B3 64-byte, P0-2 NaN guard, P0-4 fullstack |
| **Total** | **68** | **PASS** | **All Sprint 76 features** |

**Validated Features:**
- Webhook handler: Telegram secret token + Zalo HMAC-SHA256 MAC verification
- Gateway integration: POST /webhook/telegram and /webhook/zalo routes
- Security: timingSafeEqual, rate limiting (100/min/IP), replay protection
- 10 new commands with edge case handling
- Agent keyboard: 12 agents tier-aware (SE4A + SE4H)
- Team keyboard: tier-aware (LITE→ENT)
- Mode escalation: PATCH detection with CEO 2-step confirmation
- i18n: 25 OTT keys (EN + VI)

---

### 1.13 Zalo Channel (153 tests) - Sprint 77

**Location:** `tests/channels/zalo/`
**Authority:** ADR-020 OTT Channel Completion

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| zalo-bot.test.ts | ~45 | PASS | ZaloBotChannel lifecycle, send, dispose |
| zalo-channel.test.ts | ~38 | PASS | Channel interface, bidirectional comms |
| zalo-agent-handler.test.ts | ~38 | PASS | Message dispatch, agent routing |
| zalo-commands.test.ts | ~32 | PASS | 10 Zalo slash commands, text responses |

**Validated Features:**
- ZaloBotChannel implements BidirectionalChannel interface
- Zalo API integration (getMe, sendMessage, getWebhookInfo, getUpdates)
- 10 Zalo commands: /help, /agents, /teams, /gate, /compliance, /fix, /consult, /config, /init, /approve
- Plain text responses (no Markdown — Zalo limitation)
- Agent dispatch via ZaloAgentHandler
- Platform limitations documented (zapps.me 502, no markdown)

---

### 1.14 Local Ollama Router + Conversation Persistence (70 tests) - Sprint 78

**Location:** `tests/agents/routing/local-router.test.ts`, `tests/channels/conversation/`
**Authority:** ADR-021 Local Ollama Router

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| local-router.test.ts | ~32 | PASS | LocalRouterAgent, cost optimizer, pattern analytics |
| conversation/store.test.ts | ~28 | PASS | ConversationStore persistence, TTL, CRUD |
| conversation/intents.test.ts | ~6 | PASS | Intent classification |
| conversation/message-handler.test.ts | ~4 | PASS | Message routing |

**Validated Features:**
- LocalRouterAgent routes cheap tasks to Ollama (local, free)
- Cost optimizer: Ollama for EFFICIENCY tier tasks, cloud for STANDARD+
- ConversationStore: SQLite-backed persistence with TTL
- Pattern analytics for routing decisions
- Adaptive gates: quality checks before accepting local responses
- Confidence scoring for local vs cloud routing

---

### 1.15 Smart Init — Codebase Analysis (31 tests) - Sprint 79

**Location:** `tests/sdlc/compliance/project-context-collector.test.ts` (NEW), `tests/sdlc/scaffold/templates.test.ts`, `tests/sdlc/scaffold/structure-generator.test.ts`
**Authority:** ADR-022 Smart Init Codebase Analysis

| Test Suite | Tests | Status | New | Coverage |
|------------|-------|--------|-----|----------|
| project-context-collector.test.ts | 13 | PASS | 13 (NEW) | bun.lock, Tauri, Vue/Vite, open-pencil scenario |
| templates.test.ts | +14 | PASS | 14 | identity-md/claude-md/sdlc-config with snapshot |
| structure-generator.test.ts | +4 | PASS | 4 | scaffoldProject with snapshot threading |

**Validated Features:**
- `bun.lock` text format (Bun 1.2+) detected as Bun package manager
- Tauri 2 detection via `@tauri-apps/api` or `@tauri-apps/cli`
- Vue/Vite enrichment: vue + vite/`@vitejs/plugin-vue` → `"Vue/Vite"` string
- `generateIdentityMd(project, snapshot?)` — `## Tech Stack` section when snapshot present
- `generateClaudeMd(project, snapshot?)` — script-aware commands with detected PM
- `generateSdlcConfig(project, snapshot?)` — emits `techStack` + `analyzedAt`
- `scaffoldProject()` with snapshot threads to all 3 templates
- No snapshot → backward-compatible generic output (no regression)

---

### 1.16 SDLC Content Quality + Gate Fixes (27 tests) - Sprint 80

**Location:** `tests/sdlc/compliance/content-generator.test.ts` (+16), `tests/sdlc/gates/gate-engine.test.ts` (NEW, 11)
**Authority:** ADR-023 SDLC-Aligned Content Quality

| Test Suite | Tests | Status | Coverage |
|------------|-------|--------|----------|
| content-generator.test.ts (+16) | 16 | PASS | Gate-driven prompts, quality validation, extractKeyContent, refinement loop |
| gate-engine.test.ts (NEW) | 11 | PASS | gate: checker, command: checker, coverage: stub, OTT /gate fix, G-Sprint path |

**Validated Features:**
- `GATE_ARTIFACT_REQUIREMENTS` — 7 gates, 30+ artifacts with tier-specific requirements
- `buildUserPrompt()` — gate-driven instructions with pass criteria, all modules, dependencies
- `validateContentQuality()` — 6 checks (YAML, BDD, References, minLines, specificity, placeholders)
- `extractKeyContent()` — smart context extraction (2000 chars, YAML/heading preservation)
- Refinement loop — max 2 invocations, retry on quality failure
- `gate:` checker — queries gate-store via `isGateConfirmed()`, not a stub
- `command:` checker — `commandRunner` injection via `--run-checks` flag
- `coverage:` checker — explicit stub with TODO (CTO C3)
- OTT `/gate` command — references `gate recommend` (not `gate check`)
- G-Sprint checker path — `docs/04-build/sprints/` (not `01-planning/`)
- CTO C1-C4 — all conditions satisfied and tested

---

### 1.17 Previously Known Failures (RESOLVED)

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

## 4. Sprint E2E Reports

### 4.1 Sprint 79 Test Summary (Smart Init)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| project-context-collector (NEW) | 13 | <100ms | bun.lock, Tauri 2, Vue/Vite, open-pencil scenario |
| templates.test.ts (+14 new) | 14 | <50ms | identity-md, claude-md, sdlc-config with snapshot |
| structure-generator.test.ts (+4 new) | 4 | <50ms | scaffoldProject snapshot threading |
| **Manual mt-79-smart-init.mjs** | **35** | ~30s | **35/35 PASS** (6 phases, open-pencil live) |
| **Total** | **66** | <1s | **Full Smart Init pipeline** |

### 4.2 Sprint 80 Test Summary (SDLC Content Quality + Gate Fixes)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| content-generator.test.ts (+16 new) | 16 | <50ms | Gate-driven prompts, quality validation, extraction |
| gate-engine.test.ts (NEW) | 11 | <10ms | gate: checker, command: checker, OTT fix, G-Sprint path |
| **Manual mt-80-content-quality.mjs** | **34** | ~5s | **34/34 PASS** (9 phases, open-pencil quality audit) |
| **Total** | **61** | <6s | **Full Sprint 80 pipeline** |

### 4.3 Sprint 77 Test Summary (Zalo Channel)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| zalo-bot.test.ts | ~45 | <100ms | ZaloBotChannel lifecycle, API |
| zalo-channel.test.ts | ~38 | <100ms | BidirectionalChannel interface |
| zalo-agent-handler.test.ts | ~38 | <100ms | Message dispatch, routing |
| zalo-commands.test.ts | ~32 | <100ms | 10 slash commands, plain text |
| **Total** | **153** | <1s | **Full Zalo channel** |

### 4.3 Sprint 78 Test Summary (Local Ollama Router + Conversation Persistence)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| local-router.test.ts | ~32 | <200ms | LocalRouterAgent, cost optimizer |
| conversation/store.test.ts | ~28 | <100ms | ConversationStore persistence |
| conversation/intents.test.ts | ~6 | <50ms | Intent classification |
| conversation/message-handler.test.ts | ~4 | <50ms | Message routing |
| **Total** | **70** | <500ms | **Full local routing pipeline** |

### 4.5 Sprint 74 Test Summary (Team Agent System)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| Team Registry | 44 | 12ms | Loading, lookup, resolution, charter |
| Mention Parser Teams | 28 | 4ms | Agent-first, team detect, tier avail |
| Agent Router Teams | 27 | 19ms | Routing, SOUL enrichment, tier sync |
| **Total** | **99** | **35ms** | **Full team routing pipeline** |

### 4.6 Sprint 76 Test Summary (OTT Channel Enhancement)

| Module | Tests | Time | Coverage |
|--------|-------|------|----------|
| Telegram Commands | 15 | <5ms | 10 new commands + edge cases |
| Keyboards (Agent/Team/Mode) | 13 | <5ms | Tier-aware, callback parsing |
| Webhook Handler | 20 | <10ms | Telegram + Zalo + rate limit |
| Response Formatter | 5 | <5ms | Icons, formatting, agent not found |
| i18n | 2 | <5ms | 25 EN + 25 VI keys |
| CTO Fixes | 4 | <5ms | B3, P0-2, P0-4 |
| Help + formatAgentNotFound | 5 | <5ms | 14 commands, 12 agents + 7 teams |
| Mode Escalation | 4 | <5ms | PATCH detection, confirm/cancel |
| **Total** | **68** | **269ms** | **Full OTT parity** |

### 4.7 Sprint 72 Test Summary

**Full Report:** [E2E-SPRINT-72-REPORT-2026-03-02.md](./07-E2E-Testing/reports/E2E-SPRINT-72-REPORT-2026-03-02.md)

| Week | Module | Tests | Time |
|------|--------|-------|------|
| 1 | AER Metrics | 32 | 254ms |
| 2 | Model Tiering | 71 | 60ms |
| 3 | Autonomous Session Manager | 32 | 10.5s |
| 4 | Golden Scenarios | 49 | 29ms |
| **Total** | | **184** | **10.8s** |

---

## 5. Manual Tests (143 tests)

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
| Team Agent Routing (Sprint 74) | 8 | 8 | 0 |
| Dyad Repo Manual (Sprint 74) | 12 | 12 | 0 |
| OTT Enhancement (Sprint 76) | 63 | 63 | 0 |
| Zalo Bot Live (Sprint 77) | 7 | 0 | 7 (requires live Zalo API) |
| Zalo Commands Live (Sprint 77) | 10 | 0 | 10 (requires live Zalo API) |
| Smart Init — open-pencil (Sprint 79) | 35 | 35 | 0 |
| Content Quality — open-pencil (Sprint 80) | 34 | 34 | 0 |
| **TOTAL** | **194** | **168** | **26** |

### 5.1 Team Agent Routing Manual Tests (Sprint 74)

| ID | Test Case | Tier | Expected | Status |
|----|-----------|------|----------|--------|
| MT-74-01 | `@planning "plan auth"` routes to PM with team context | STANDARD | PM SOUL + Team Context section | PASS |
| MT-74-02 | `@dev "implement login"` routes to Coder with team context | STANDARD | Coder SOUL + teammates | PASS |
| MT-74-03 | `@qa "review PR"` routes to Reviewer (sole member) | STANDARD | Reviewer SOUL + sole member msg | PASS |
| MT-74-04 | `@pm "plan"` routes directly (agent-first, no team) | STANDARD | PM SOUL, isTeam=false | PASS |
| MT-74-05 | `@design "wireframes"` routes to Architect | PRO | Architect SOUL + pm,coder teammates | PASS |
| MT-74-06 | `@ops "deploy"` fails in STANDARD, works in ENT | STD→ENT | Error → DevOps SOUL | PASS |
| MT-74-07 | `@executive "review"` → CTO(PRO) vs CEO(ENT) | PRO/ENT | Tier-dependent leader | PASS |
| MT-74-08 | setTier LITE→STANDARD enables @planning | LITE→STD | Fail → Success | PASS |

**Executed:** 2026-03-03 | **Script:** `tests/manual/mt-74-team-routing.mjs` | **Result:** 8/8 PASS

### 5.2 Dyad Repo Manual Tests (STANDARD tier)

| ID | Test Case | Expected | Status |
|----|-----------|----------|--------|
| MT-D01 | `@planning "plan payment"` → PM with Planning Team context | PM SOUL + ## Team Context | PASS |
| MT-D02 | `@dev "implement auth"` → Coder with teammates + delegation | Coder SOUL + ### Teammates | PASS |
| MT-D03 | `@qa "review PR"` → Reviewer (sole member) | Reviewer SOUL + sole member msg | PASS |
| MT-D04 | `@pm "plan sprint"` → PM direct (agent-first, no team) | PM SOUL, isTeam=false | PASS |
| MT-D05 | `@coder "fix bug"` → Coder direct (agent-first) | Coder SOUL, isTeam=false | PASS |
| MT-D06 | `@ops "deploy"` fails in STANDARD | INVALID_MENTION error | PASS |
| MT-D07 | `@design "wireframes"` fails in STANDARD | INVALID_MENTION error | PASS |
| MT-D08 | `@architect "design schema"` → Architect direct | Architect SOUL, isTeam=false | PASS |
| MT-D09 | SOUL enrichment: charter + leader + delegation present | All 3 sections in SOUL | PASS |
| MT-D10 | Task classification works for team routes | taskType, complexity, model set | PASS |
| MT-D11 | STANDARD tier has exactly 3 teams (planning, dev, qa) | 3 teams | PASS |
| MT-D12 | Warnings propagated for unknown agents in combo | Warning includes agent name | PASS |

**Executed:** 2026-03-03 | **Script:** `tests/manual/mt-74-dyad-manual.mjs` | **Result:** 12/12 PASS

### 5.3 OTT Channel Enhancement Manual Tests (Sprint 76)

**Authority:** ADR-019 OTT Channel Enhancement

| Phase | Tests | Description |
|-------|-------|-------------|
| Commands (18) | MT-76-01..18 | 10 new commands: /agents, /teams, /gate, /compliance, /fix, /consult, /config, /init, /mode, /webhook |
| Help (3) | MT-76-19..21 | 14 commands listed, 4 categories, agent/team format |
| Agent Keyboard (6) | MT-76-22..27 | 12 agents (STANDARD), 9 (LITE), 3/row, icons, 64-byte limit |
| Team Keyboard (6) | MT-76-28..33 | LITE(1), STANDARD(3), PRO(5), ENT(6), 2/row, callbacks |
| Mode Confirm (2) | MT-76-34..35 | Confirm/cancel buttons, request ID |
| Handoff 64-byte (2) | MT-76-36..37 | Short + long intent within 64 bytes (CTO B3) |
| Callback Parsing (4) | MT-76-38..41 | agent_select, team_select, mode confirm/cancel |
| Team via OTT (6) | MT-76-42..47 | hasMention + parseMention with registry, tier check |
| Response Formatter (2) | MT-76-48..49 | formatAgentNotFound (12+7), formatProcessing |
| Webhook Handler (4) | MT-76-50..53 | Constructor, dispose, cleanup, missing secret warning |
| Zalo MAC (2) | MT-76-54..55 | HMAC-SHA256 deterministic, mac= prefix normalization |
| i18n (2) | MT-76-56..57 | 25 EN keys, 25 VI matching keys |
| PATCH Mode (3) | MT-76-58..60 | Detection, case-insensitive, non-match |
| Timeout Config (3) | MT-76-61..63 | Default 300s, NaN fallback, valid override |
| **Total** | **63** | **All Sprint 76 acceptance criteria** |

**Executed:** 2026-03-04 | **Script:** `tests/manual/mt-76-ott-enhancement.mjs` | **Result:** 63/63 PASS

### 5.4 Zalo Bot Live Tests (Sprint 77)

| Phase | Tests | Description |
|-------|-------|-------------|
| Zalo API (7) | MT-76-Z01..07 | getMe, sendMessage, long msg, unicode, getWebhookInfo, channel interface, getUpdates |
| Zalo Commands (10) | MT-77-T1..10 | /help, /agents, /gate, /teams, /compliance, /fix, /consult, /config, /init, /approve |
| **Total** | **17** | **Require live Zalo API + ZALO_BOT_TOKEN env** |

**Status:** PENDING — requires live Zalo OA bot token (`.env.local` with `ZALO_BOT_TOKEN`, `ZALO_BOT_CHAT_ID`)
**Scripts:** `tests/manual/mt-76-zalo-bot.mjs` | `tests/manual/mt-77-zalo-commands.mjs`

### 5.5 Smart Init Manual Tests (Sprint 79)

**Authority:** ADR-022 Smart Init Codebase Analysis

| Phase | Tests | Description |
|-------|-------|-------------|
| Phase 1: open-pencil full analysis (17) | MT-79-01..17 | Init STANDARD tier on real repo, spinner, IDENTITY.md/CLAUDE.md/.sdlc-config.json validation |
| Phase 2: --skip-analysis (6) | MT-79-18..23 | Generic fallback, no Tech Stack section, pnpm commands |
| Phase 3: bun.lock text format (3) | MT-79-24..26 | Bun 1.2+ `bun.lock` detected as bun |
| Phase 4: Tauri 2 detection (3) | MT-79-27..29 | @tauri-apps/api → desktop: "Tauri 2" |
| Phase 5: Vue/Vite enrichment (3) | MT-79-30..32 | Vue + Vite → "Vue/Vite" not just "Vue" |
| Phase 6: Empty project graceful failure (3) | MT-79-33..35 | No crash, IDENTITY.md created, generic output |
| **Total** | **35** | **All Sprint 79 acceptance criteria** |

**Executed:** 2026-03-05 | **Script:** `tests/manual/mt-79-smart-init.mjs` | **Result:** 35/35 PASS

### 5.6 SDLC Content Quality Manual Tests (Sprint 80)

**Authority:** ADR-023 SDLC-Aligned Content Quality

| Phase | Tests | Description |
|-------|-------|-------------|
| Phase 1: Gate-Artifact-Tier Matrix (7) | MT-80-01..07 | GATE_ARTIFACT_REQUIREMENTS, 7 gates, findGateRequirement, findArtifactSpec, TIER_COVERAGE_TARGETS, CTO C4 |
| Phase 2: Quality Validation (4) | MT-80-08..11 | validateContentQuality: missing YAML, missing BDD, below minLines, passes |
| Phase 3: extractKeyContent (3) | MT-80-12..14 | YAML preservation, heading preservation, maxChars limit |
| Phase 4: OTT /gate Fix (3) | MT-80-15..17 | gate recommend reference, no gate check, sanitizeForEcho |
| Phase 5: Gate Engine (3) | MT-80-18..20 | G-Sprint path, gate:G3 checker, command: checkers |
| Phase 6: open-pencil Audit (8) | MT-80-21..28 | requirements.md/architecture.md existence, YAML, gate refs, line count, quality scores |
| Phase 7: compliance score (2) | MT-80-29..30 | CLI exits clean, score percentage in output |
| Phase 8: compliance fix --dry-run (3) | MT-80-31..33 | CLI exits clean, DRY-RUN mode, issue summary |
| Phase 9: gate status (1) | MT-80-34 | CLI gate status runs |
| **Total** | **34** | **All Sprint 80 acceptance criteria** |

**Quality Audit Results (open-pencil, Phase 1 docs):**

| Document | Lines | Score | Key Issues |
|----------|-------|-------|------------|
| requirements.md | 62 | 40/100 | Missing BDD, missing References, below 120 min lines |
| architecture.md | 30 | 40/100 | Missing YAML frontmatter, missing References, below 120 min lines |

> These scores reflect Phase 1 (Sprint 80 Steps 1-5) generated docs. Phase 2 gate-driven prompts + refinement loop will improve quality on next `compliance fix` re-run.

**Executed:** 2026-03-06 | **Script:** `tests/manual/mt-80-content-quality.mjs` | **Result:** 34/34 PASS

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
| Team Registry (44 tests) | < 500ms | 12ms | PASS |
| Mention Parser Teams (28 tests) | < 100ms | 4ms | PASS |
| Agent Router Teams (27 tests) | < 500ms | 19ms | PASS |
| All Orchestrator (119 tests) | < 1s | 38ms | PASS |

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

**Baseline:** 5,155 tests passing (Sprint 80)

**Regression Gate:**
- BLOCK if > 5% tests fail
- WARN if > 1% tests fail
- PASS if <= 1% tests fail

**Current:** 0/5,155 = 0% (0 failing, 10 skipped)

### 8.2 Sprint-Specific Regression

| Sprint | New Tests | Regression | Status |
|--------|-----------|------------|--------|
| 68 | 102 | 0 regressions | PASS |
| 69-71 | 112 | 0 regressions | PASS |
| 72 | 184 | 0 regressions | PASS |
| 73 | 42 | 0 regressions | PASS |
| 74 | 99 | 0 regressions | PASS |
| 75 | 41 | 0 regressions | PASS |
| 76 | 68 | 0 regressions | PASS |
| 77 | 153 | 0 regressions | PASS |
| 78 | 70 | 0 regressions | PASS |
| 79 | 31 | 0 regressions | PASS |
| 80 | 27 | 0 regressions | PASS |

---

## 9. Test Metrics & KPIs

### 9.1 Current Metrics (Post-Sprint 80)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Total tests | 5,155 | - | - |
| Pass rate | 99.8% | > 99% | ON TARGET |
| Tech debt tests | 0 failing | < 20 | EXCELLENT |
| Flaky tests | 0 | 0 | RESOLVED |
| New tests (Sprint 68-80) | 984 | - | +24% growth |
| Manual tests | 194 (168 passing, 26 pending) | - | +34 Sprint 80, +35 Sprint 79 |

### 9.2 Coverage by Module

| Module | Tests | Coverage |
|--------|-------|----------|
| Providers | ~3,500 | ~95% |
| SDLC | 360 | ~98% |
| Sessions | 154 | ~95% |
| Metrics | 32 | ~98% |
| Models | 71 | ~98% |
| Golden Scenarios | 49 | ~90% |
| Search | 176 | ~95% |
| Context | 97 | ~98% |
| Orchestrator (Teams) | 119 | ~98% |
| OTT Channels | 68 | ~95% |
| Zalo Channel | 153 | ~95% |
| Local Router + Conversation | 70 | ~90% |
| Smart Init (Compliance) | 31 | ~98% |
| Other (budget, config, etc.) | ~200 | ~85% |

---

## 10. Bug Tracking

### 10.1 Current Known Issues

| ID | Description | Severity | Sprint | Status |
|----|-------------|----------|--------|--------|
| BUG-002 | ripgrep binary not found | P2 | 63 | WORKAROUND |
| BUG-012 | checkpoint.test.ts:462 flaky (resume from checkpoint) | P3 | 35-40 | KNOWN FLAKY |
| BUG-013 | OTT detection `includes(":]")` should be `includes("]")` | P2 | 74 | FIXED |

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
| BUG-011 | CLI session mode issue | Sprint 73 (L2 Compliance fix) |
| BUG-013 | OTT parser `includes(":]")` misses valid OTT tags | Sprint 74 (fixed to `includes("]")`) |

---

## 11. Test Documentation

### 11.1 Test Plans

- [Master Test Plan](./MASTER-TEST-PLAN.md) (this file)
- [Manual Test Plan](./manual-test-plan.md)
- [Dogfooding Test Plan](./DOGFOODING-TEST-PLAN.md)
- [TP-061 Init Command](./test-plans/TP-061-Init-Command.md)
- [TP-062 Restructure Compliance](./test-plans/TP-062-Restructure-Compliance.md)
- ADR-017 Team Agent System (Sprint 74 design authority)
- ADR-018 AI-Generated Compliance Content (Sprint 75 design authority)
- ADR-019 OTT Channel Enhancement (Sprint 76 design authority)
- ADR-020 OTT Channel Completion / Zalo (Sprint 77 design authority)
- ADR-021 Local Ollama Router (Sprint 78 design authority)
- ADR-022 Smart Init Codebase Analysis (Sprint 79 design authority)
- ADR-023 SDLC-Aligned Content Quality (Sprint 80 design authority)

### 11.2 Test Reports

- [E2E API Report 2026-02-27](./07-E2E-Testing/reports/E2E-API-REPORT-2026-02-27.md)
- [E2E Sprint 72 Report 2026-03-02](./07-E2E-Testing/reports/E2E-SPRINT-72-REPORT-2026-03-02.md)
- [Test Report 2026-03-01](./test-reports/test-report-2026-03-01.md)

---

## 12. Next Steps

### Completed Actions (Post-Sprint 79)

1. ~~Fix BUG-006: cli-smoke status command~~ DONE
2. ~~Fix tech debt tests (BUG-001, BUG-005)~~ DONE (61 tests rewritten)
3. ~~Implement Team Agent System tests (Sprint 74)~~ DONE (99 tests)
4. ~~Execute MT-74-01 through MT-74-08 manual tests~~ DONE (20/20 PASS)
5. ~~Sprint 75: Compliance Fix Engine tests~~ DONE (41 tests)
6. ~~Sprint 76: OTT Channel Enhancement tests~~ DONE (68 unit + 63 manual)
7. ~~Sprint 76: CTO review fixes (B1-B3, P0-1 through P0-4)~~ DONE
8. ~~Sprint 77: Zalo Channel 153 unit tests~~ DONE
9. ~~Sprint 78: Local Ollama Router + ConversationStore 70 tests~~ DONE
10. ~~Sprint 79: Smart Init 31 unit + 35 manual tests (35/35 PASS)~~ DONE
11. ~~Sprint 80: SDLC Content Quality 27 unit + 34 manual tests (34/34 PASS)~~ DONE

### Short-term (Sprint 81+)

1. Zalo webhook live E2E test (requires Zalo OA sandbox — 17 tests pending)
2. OTT PATCH mode end-to-end integration test (file modification flow)
3. Team cross-delegation integration tests (team→team handoff via OTT)
4. Property-based testing for state machine
5. Investigate BUG-012 (checkpoint.test.ts flaky)
6. Smart Init: language detection for monorepos (TypeScript in subdirectory)
7. Run `compliance fix` on open-pencil with AI bridge to validate quality improvement

### Long-term (Sprint 81+)

1. Mutation testing for critical paths
2. CI/CD pipeline integration
3. Load testing with large codebases
4. External user acceptance testing
5. Webhook stress testing (rate limit + concurrent connections)

---

## Appendix A: Test Commands

```bash
# Run all tests
pnpm test

# Run Sprint 80 SDLC Content Quality
pnpm vitest run tests/sdlc/compliance/content-generator.test.ts tests/sdlc/gates/gate-engine.test.ts

# Run Sprint 80 Manual Tests (34 tests)
node tests/manual/mt-80-content-quality.mjs

# Run Sprint 79 Smart Init
pnpm vitest run tests/sdlc/compliance/project-context-collector.test.ts tests/sdlc/scaffold/templates.test.ts tests/sdlc/scaffold/structure-generator.test.ts

# Run Sprint 79 Manual Tests (35 tests)
node tests/manual/mt-79-smart-init.mjs

# Run Sprint 77 Zalo Channel
pnpm vitest run tests/channels/zalo/

# Run Sprint 77 Zalo Manual Tests (requires live Zalo API)
node tests/manual/mt-76-zalo-bot.mjs
node tests/manual/mt-77-zalo-commands.mjs

# Run Sprint 78 Local Router + Conversation
pnpm vitest run tests/agents/routing/local-router.test.ts tests/channels/conversation/

# Run Sprint 76 OTT Channel Enhancement
pnpm vitest run tests/channels/ott/ott-enhancement.test.ts

# Run Sprint 76 Manual Tests (63 tests)
node tests/manual/mt-76-ott-enhancement.mjs

# Run Sprint 75 Compliance Fix
pnpm vitest run tests/sdlc/compliance-fix.test.ts

# Run Sprint 74 Team Agent System
pnpm vitest run tests/agents/orchestrator/

# Run Sprint 74 Manual Tests
node tests/manual/mt-74-team-routing.mjs
node tests/manual/mt-74-dyad-manual.mjs

# Run Sprint 72 modules
pnpm test src/metrics/__tests__ src/models/__tests__ tests/golden-scenarios/__tests__

# Run SDLC Compliance
pnpm test tests/sdlc/ src/sdlc/__tests__

# Run with coverage
pnpm test --coverage
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
| 73 | 42 | 4,644 | 99.8% |
| 74 | 99 | 4,754 | 99.8% |
| 75 | 41 | 4,795 | 99.8% |
| 76 | 68 | 4,863 | 99.8% |
| 77 | 153 | 5,016 | 99.8% |
| 78 | 70 | 5,086 | 99.8% |
| 79 | 31 | 5,117 | 99.8% |
| 80 | 27 | 5,155 | 99.8% |

---

*Master Test Plan v6.0 | SDLC Framework v6.1.1 | Sprint 80*
