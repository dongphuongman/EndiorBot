---
spec_id: SPEC-04BUILD-SPRINT91
title: "Sprint 91: Agent Teams — Monitoring + Lifecycle"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-026"]
---

# Sprint 91: Agent Teams — Monitoring + Lifecycle

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-026 (Agent Teams)
**Preceding sprint:** Sprint 90 (Agent Teams — Telegram Integration + Smart Routing)
**Est. effort:** ~35h
**Est. tests:** ~20

---

## Goal

Monitor team sessions, track cost across all team members, manage team health, and provide graceful team shutdown. CEO can see the full team's status and cost from Telegram and can kill a team in one command — without needing to track each sub-agent individually.

**Key principle:** CEO visibility into team cost and health must require zero terminal access. All lifecycle management flows through Telegram.

---

## Depends On

- Sprint 90 (Telegram integration + team session metadata) — `teamId`, `teamMembers`, and `BridgeSession` team fields must be populated.
- Sprint 85 (Permission Approval) — Audit logger and sendKeys infrastructure must be operational.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| Team session dashboard (`/team-status <sessionId>`) | Unified launcher process — Sprint 92 |
| Cost aggregation per team member + total team cost | Cross-team orchestration |
| Health check: alive / stuck / crashed detection | ML-based performance scoring |
| Graceful team shutdown (`/kill-team <sessionId>`) | Enterprise multi-project team management |
| **CTO A4: Cost threshold $5/team-session** (configurable, CPO CA2) | |
| Audit events for all lifecycle transitions | |

---

## Architecture

### Team Session Dashboard

`/team-status <sessionId>` returns a structured Telegram message:

```
Team Session #3 — dev-team [ACTIVE]
Leader:   @coder    alive   $0.42
Member 1: @reviewer alive   $0.18
Member 2: @architect stuck  $0.31  (idle 4m 12s)

Total cost: $0.91 / $5.00 limit
```

Status values: `alive` (responding), `stuck` (idle > threshold), `crashed` (process exited unexpectedly).

### Cost Aggregation

Token usage is collected per team member from existing `BridgeSession` metrics (input tokens, output tokens, model tier pricing). A `TeamCostAggregator` sums member costs and compares against the configurable threshold.

| Role | Source | Update Frequency |
|------|--------|-----------------|
| Per-member cost | `BridgeSession.tokenUsage` + model pricing | On each turn completion |
| Total team cost | Sum of member costs | On each member update |
| Threshold check | `policy.teamCostThresholdUsd` (default: `5.0`) | On each total update |

When total cost exceeds the threshold, the CEO receives a Telegram warning with two inline buttons:

```
Team session #3 has reached $5.00.
Continue or stop?

[Continue (+$2 limit)]   [Stop team]
```

### Health Check

Health is checked on a polling interval (default: 30s per team session) or on demand via `/team-status`.

| State | Condition |
|-------|-----------|
| `alive` | tmux pane responding; last output within 60s |
| `stuck` | No output for > `policy.teamStuckIdleThresholdSec` (default: 180s); pane still running |
| `crashed` | tmux pane exited; process no longer found by PID |

On `crashed` detection, an audit event `team_member_crashed` is written and the CEO is notified via Telegram. No automatic restart in this sprint (restart logic is in Sprint 92 unified launcher).

### Graceful Team Shutdown — `/kill-team`

```
/kill-team <sessionId>

1. Send SIGTERM to leader process (PID from BridgeSession.providerPid)
2. Enumerate teamMembers from BridgeSession
3. For each member: send SIGTERM to member process PID
4. Wait 5s for graceful exit
5. Send SIGKILL to any remaining processes
6. Remove all temp SOUL files for this team session (Strategy B cleanup)
7. Update BridgeSession.status = "killed"
8. Write audit event: team_killed (sessionId, reason: "user_command", memberCount)
9. Confirm to CEO via Telegram
```

The command is idempotent — calling `/kill-team` on an already-stopped session returns a confirmation with no error.

---

## Key Deliverables

1. **`src/bridge/teams/team-cost-aggregator.ts`** — `TeamCostAggregator` class: collects per-member token usage, computes total cost using model tier pricing table, compares against configurable `teamCostThresholdUsd` (default `5.0`). Emits `cost_threshold_exceeded` event when threshold is crossed.

2. **`src/bridge/teams/team-health-monitor.ts`** — `TeamHealthMonitor` class: polls tmux pane activity per team member on 30s interval, classifies each member as `alive` / `stuck` / `crashed`, emits `team_member_crashed` on crash detection. Uses existing `TmuxAdapter` from Sprint 83.

3. **`/team-status` Telegram command** — Renders team dashboard message with per-member status, cost, idle time, and total cost vs. threshold. Pulls data from `TeamCostAggregator` and `TeamHealthMonitor`. Available to active team sessions only.

4. **Cost threshold warning** — Inline keyboard sent when total team cost exceeds `teamCostThresholdUsd`. Two options: "Continue (+$2 limit)" extends threshold by $2 and resets warning; "Stop team" triggers graceful shutdown. CEO choice written to audit log.

5. **`/kill-team` Telegram command** — Sends SIGTERM → SIGKILL sequence to all team processes (leader + members), cleans up Strategy B temp files, updates `BridgeSession` status, writes `team_killed` audit event, confirms to CEO.

6. **Policy configuration** — Readable from `policy` object in `.sdlc-config.json`:
   - `teamCostThresholdUsd`: Default `5.0`. Must be a positive number; reject non-numeric values with clear error.
   - `teamStuckIdleThresholdSec`: Default `180` (3 minutes). Configurable idle timeout before a member is classified as `stuck`. Must be a positive integer.

---

## Test Plan (~20 tests)

### Dashboard Rendering (4 tests)

| Test | Description |
|------|-------------|
| Active team session | Shows leader + all members with status and cost |
| No team session | Returns "no active team session" message |
| Partial members | Handles team with 1 member (leader only) gracefully |
| Cost display | Per-member and total costs formatted to 2 decimal places |

### Cost Aggregation (4 tests)

| Test | Description |
|------|-------------|
| Per-member sum | Token usage converted to USD per model tier |
| Total accumulation | Member costs sum correctly |
| Threshold warning | Warning sent when total exceeds `teamCostThresholdUsd` |
| Continue extends | "Continue" option raises threshold by $2 and resets warning |

### Health Check (4 tests)

| Test | Description |
|------|-------------|
| Alive detection | Pane with recent output classified `alive` |
| Stuck detection | Pane idle > 3 minutes classified `stuck` |
| Crashed detection | Exited pane classified `crashed`, CEO notified |
| Poll interval | Health monitor polls at configured 30s interval |

### `/kill-team` Lifecycle (5 tests)

| Test | Description |
|------|-------------|
| SIGTERM sent to all | Leader and all member PIDs receive SIGTERM |
| SIGKILL fallback | Remaining processes after 5s grace receive SIGKILL |
| Temp file cleanup | Strategy B temp SOUL files removed for the team session |
| Idempotent | Calling `/kill-team` on stopped session returns confirmation |
| Audit event | `team_killed` event written with sessionId + memberCount |

### Cost Threshold Configuration (3 tests)

| Test | Description |
|------|-------------|
| Default $5.00 | Threshold reads `5.0` when not in policy config |
| Custom value | Policy `teamCostThresholdUsd: 10` applies correctly |
| Invalid value | Non-numeric policy value rejected with clear error |
| Stuck threshold | `teamStuckIdleThresholdSec: 300` changes stuck detection to 5 minutes |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 92 | Unified App Launcher — single process for all sessions, PID tracking, crash recovery (ADR-024) |
