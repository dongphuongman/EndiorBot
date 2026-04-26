---
title: "EndiorBot E2E Test Plan — All Channels"
status: DRAFT
sprint: 143
author: "@tester"
date: 2026-04-26
---

# E2E Test Plan — CLI, Web, OTT, Desktop

## Purpose

Comprehensive test plan covering all 4 channels (CLI, Web, Telegram/Zalo, Desktop) to verify EndiorBot features work end-to-end after Sprint 139-143 changes: provider refactor, anti-drift improvements, Kimi integration, security fixes.

---

## 1. CLI Channel Tests

### 1.1 Core Commands

| # | Test | Command | Expected | Priority |
|---|------|---------|----------|----------|
| C01 | Help display | `endiorbot --help` | Shows all commands, no crash | P0 |
| C02 | Version | `endiorbot --version` | Shows 0.1.0-beta.1 | P0 |
| C03 | Commands list | `endiorbot commands` | Lists 36+ commands, all categories | P0 |
| C04 | Commands JSON | `endiorbot commands --json` | Valid JSON envelope | P1 |

### 1.2 SDLC Commands

| # | Test | Command | Expected | Priority |
|---|------|---------|----------|----------|
| C05 | Init | `endiorbot init --tier STANDARD` | Creates SDLC scaffold (15+ files) | P0 |
| C06 | Compliance check | `endiorbot compliance check` | L1/L2 scores, no crash | P0 |
| C07 | Compliance fix | `endiorbot compliance fix --yes` | Generates missing docs via agent bridge | P0 |
| C08 | Gate status | `endiorbot gate status` | Shows current gate + passed gates | P1 |
| C09 | Compliance score | `endiorbot compliance score` | One-line summary | P1 |

### 1.3 Agent Invocation

| # | Test | Command | Expected | Priority |
|---|------|---------|----------|----------|
| C10 | @pm read mode | `endiorbot @pm "check sprint status"` | Response includes codebase context (Sprint 142 fix) | P0 |
| C11 | @coder read mode | `endiorbot @coder "review auth module"` | Response with workspace awareness | P0 |
| C12 | @architect | `endiorbot @architect "review design"` | Uses Claude Code (Tier 1) | P1 |
| C13 | @assistant | `endiorbot @assistant "hello"` | Routes to Ollama (Tier 3) | P1 |
| C14 | Multi-agent | `endiorbot @pm @cto "review sprint"` | GoalDecomposer splits task | P2 |

### 1.4 Consultation

| # | Test | Command | Expected | Priority |
|---|------|---------|----------|----------|
| C15 | Consult basic | `endiorbot consult "Redis vs Postgres?"` | 2-3 model responses + consensus | P0 |
| C16 | Consult --kimi | `endiorbot consult --kimi kimi-k2-6 "compare"` | Includes Kimi response | P1 |

### 1.5 Operations

| # | Test | Command | Expected | Priority |
|---|------|---------|----------|----------|
| C17 | Ops build | `endiorbot ops build` | Detects ecosystem + builds | P1 |
| C18 | Exec-policy show | `endiorbot exec-policy show` | Shows preset + allowlist count | P0 |
| C19 | Cost report | `endiorbot cost report` | Shows agent × provider breakdown | P1 |
| C20 | Bootstrap | `endiorbot bootstrap <url> --dir /tmp` | Clone + detect + scaffold | P2 |

---

## 2. Web Channel Tests

### 2.1 Gateway Health

| # | Test | Method | Expected | Priority |
|---|------|--------|----------|----------|
| W01 | Health check | `GET /health` | `{"status":"ok","protocol":3}` | P0 |
| W02 | API status | `GET /api/status` | JSON with Active Memory state | P1 |
| W03 | API config | `GET /api/config` | System config JSON | P1 |

### 2.2 Web API Mutations

| # | Test | Method | Expected | Priority |
|---|------|--------|----------|----------|
| W04 | Preset change | `POST /api/config/exec-policy/preset` | Requires GATEWAY_TOKEN | P1 |
| W05 | Active Memory toggle | `POST /api/config/active-memory` | Requires GATEWAY_TOKEN | P1 |
| W06 | Audit logs | `GET /api/audit/exec-policy?limit=5` | JSONL entries | P1 |

### 2.3 WebSocket Chat

| # | Test | Method | Expected | Priority |
|---|------|--------|----------|----------|
| W07 | WS connect | `ws://localhost:18790/ws` | Connection established | P1 |
| W08 | Agent chat | Send `@pm hello` via WS | Agent response received | P1 |

---

## 3. OTT Channel Tests (Telegram + Zalo)

### 3.1 Telegram Core

| # | Test | Message | Expected | Priority |
|---|------|---------|----------|----------|
| T01 | Start | `/start` | Welcome message | P0 |
| T02 | Help | `/help` | Command list | P0 |
| T03 | Link | `/link` | Identity binding | P0 |
| T04 | Agents list | `/agents` | Lists 14 agents | P1 |

### 3.2 Telegram Agent Routing (ADR-052)

| # | Test | Message | Expected | Priority |
|---|------|---------|----------|----------|
| T05 | @pm via Kimi | `@pm check sprint status` | Kimi response with codebase context | P0 |
| T06 | @architect via CC | `@architect review design` | CC bridge response (Tier 1) | P0 |
| T07 | @assistant via Ollama | `@assistant hello` | Ollama response (Tier 3) | P1 |
| T08 | Fallback chain | `@pm` when Kimi down | Falls back to CC bridge | P1 |

### 3.3 Telegram OTT Commands (Sprint 135)

| # | Test | Message | Expected | Priority |
|---|------|---------|----------|----------|
| T09 | Exec-policy show | `/exec-policy show` | Current preset + stats | P1 |
| T10 | Config view | `/config` | System config summary | P1 |
| T11 | Audit logs | `/audit exec-policy` | Last 10 decisions | P1 |
| T12 | Cost | `/cost` | Token usage summary | P1 |

### 3.4 Telegram Bridge Commands

| # | Test | Message | Expected | Priority |
|---|------|---------|----------|----------|
| T13 | Repos add | `/repos add test /tmp/test` | Repo registered | P1 |
| T14 | Focus | `/focus test` | Workspace focused | P1 |
| T15 | Launch | `/launch claude --as coder --risk read` | tmux session created | P0 |
| T16 | Sessions | `/sessions` | Lists active sessions | P1 |
| T17 | Capture | `/capture` | Session output captured | P1 |
| T18 | Kill | `/kill` | Session terminated | P1 |

### 3.5 Zalo Channel

| # | Test | Message | Expected | Priority |
|---|------|---------|----------|----------|
| Z01 | Help | `/help` | Command list (14 commands) | P1 |
| Z02 | Agent chat | `@pm hello` | Agent response | P1 |
| Z03 | Compliance | `/compliance check` | L1/L2 scores | P2 |

---

## 4. Desktop Channel Tests (Electron)

| # | Test | Action | Expected | Priority |
|---|------|--------|----------|----------|
| D01 | App launch | `npm run electron:dev` | Window opens, UI renders | P2 |
| D02 | IPC bridge | Agent call via Electron IPC | Response displayed | P2 |
| D03 | Local model | Settings → configure local model | Model selection works | P2 |

---

## 5. Cross-Channel Consistency Tests

| # | Test | Expected | Priority |
|---|------|----------|----------|
| X01 | Command count parity | CLI = Telegram = Web RPC = dispatcher registry (same count) | P0 |
| X02 | Agent response consistency | Same prompt → same codebase context injected regardless of channel | P0 |
| X03 | Exec-policy same across channels | CLI `exec-policy show` = Telegram `/exec-policy show` = Web API | P1 |

---

## 6. Sprint 142-143 Specific Tests

### 6.1 Vendor-Agnostic Enrichment (Sprint 142)

| # | Test | Expected | Priority |
|---|------|----------|----------|
| S01 | READ task gets workspace context | `@pm check sprint` → response mentions branch/commits | P0 |
| S02 | Kill switch disables ALL workspace | `ENDIORBOT_DISABLE_WORKSPACE_CONTEXT=true` → no `[Workspace:]` in any provider | P0 |
| S03 | IDENTITY.md injected for cloud providers | Kimi/@pm response references project identity | P0 |
| S04 | New provider registration | Add mock provider → gets enriched prompt without context code | P1 |

### 6.2 Anti-Drift (Sprint 142-143)

| # | Test | Expected | Priority |
|---|------|----------|----------|
| S05 | Vision re-injection at turn 10 | After 10 turns → sprint goals in context | P1 |
| S06 | Vision re-injection at turn 20 | After 20 turns → full vision in context | P1 |
| S07 | Dedup guard | Turn 10 + 30-min refresh → ONE injection | P1 |
| S08 | Brain L2 pattern hint | Error matching pattern → patternHint in retry prompt | P0 |
| S09 | Active Memory dry-run logging | FF off → latency logged anyway | P1 |

### 6.3 Expert Routing Phase 2 (Sprint 142)

| # | Test | Expected | Priority |
|---|------|----------|----------|
| S10 | FF off (default) | Routing follows static ADR-052 mapping | P0 |
| S11 | FF on + 50+ records | Historical performance influences provider selection | P1 |
| S12 | Confidence threshold | Only override when confidence ≥ 60% | P1 |

---

## 7. Security Tests

| # | Test | Expected | Priority |
|---|------|----------|----------|
| SEC01 | Dep audit | `pnpm audit` → ≤ 2 moderate (dev-only) | P0 |
| SEC02 | Gitleaks | 0 findings on commit | P0 |
| SEC03 | SSRF boundary | No bare fetch() in src/providers/ | P0 |
| SEC04 | Kimi proxy SSRF | `ENDIORBOT_KIMI_PROXY_URL` on 127.0.0.1 not blocked | P0 |
| SEC05 | Gateway auth | POST mutations require GATEWAY_TOKEN | P1 |

---

## 8. Execution Plan

### Automated (CI/existing tests)
- **8,131 unit/integration tests** (`pnpm test`)
- **SSRF boundary test** (`tests/architecture/fetch-boundary.test.ts`)
- **Router tests** (73 tests, `tests/agents/router/`)
- **Vision re-injection** (8 tests, `tests/context/transfer/vision-reinjection.test.ts`)
- **Brain L2 integration** (4 tests, `tests/sessions/recovery/brain-l2-integration.test.ts`)

### Manual (requires running services)
- **Telegram tests** (T01-T18): Requires `endiorbot serve` + Telegram bot
- **Web API tests** (W01-W08): Requires gateway running
- **CLI agent tests** (C10-C14): Requires CC bridge or Kimi proxy
- **Desktop tests** (D01-D03): Requires Electron build

### Test Execution Order
1. `pnpm build` — TypeScript clean
2. `pnpm test` — 8,131+ automated tests
3. CLI smoke tests (C01-C09)
4. Start `endiorbot serve` → Telegram tests (T01-T18)
5. Web API tests via curl (W01-W08)
6. Sprint-specific tests (S01-S12)
7. Security audit (SEC01-SEC05)

---

## 9. Pass Criteria

- **Automated:** 8,131+ tests pass, 0 failures
- **CLI:** C01-C09 all pass
- **Telegram:** T01-T08 all pass (P0 items)
- **Web:** W01 passes
- **Security:** SEC01-SEC04 all pass
- **Sprint-specific:** S01-S03, S08 pass (P0 items)
- **Cross-channel:** X01-X02 pass

---

*EndiorBot | SDLC Framework v6.3.1 | E2E Test Plan — Sprint 143*
