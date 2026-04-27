---
spec_id: SPEC-04BUILD-SPRINT90
title: "Sprint 90: Agent Teams — Telegram Integration + Smart Routing"
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

# Sprint 90: Agent Teams — Telegram Integration + Smart Routing

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-026 (Agent Teams)
**Preceding sprint:** Sprint 89 (Agent Teams — Team File Generation)
**Est. effort:** ~28h
**Est. tests:** ~18

---

## Goal

CEO launches team-mode sessions from Telegram with a single command — `/launch claude-code ~/project --as-team dev`. The launched session starts the leader agent with the team file generated in Sprint 89, with basic complexity gating that warns when a task is too simple to justify team mode cost (BLOCK-1 resolution).

**Key principle:** CEO gets team power from Telegram without terminal access, with a guardrail that prevents accidental cost amplification on trivial tasks.

---

## Depends On

- Sprint 89 (team file generation) — `{teamId}-team.md` files and `AGENT_TEAMS` flag must be in place.
- Sprint 86 (hook installer + `/send` command) — Telegram session interaction must be operational.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `/launch --as-team <teamId>` Telegram command | Team monitoring dashboard — Sprint 91 |
| Team-aware session display in `/sessions` | Cost tracking per team member — Sprint 91 |
| Team role info in `/capture` output | Unified launcher process — Sprint 92 |
| **BLOCK-1: Basic complexity gating** (warn on simple tasks) | Full ML-based task complexity classification |
| Audit events: `team_launch` | Cross-team orchestration |
| `AGENT_TEAMS` flag check in Telegram handler | |

---

## Architecture

### `--as-team` Flag Parsing Flow

```
CEO: /launch claude-code ~/project --as-team dev "Refactor auth module"

1. Parse --as-team flag → teamId = "dev"
2. Validate teamId exists in TeamRegistry
3. Check AGENT_TEAMS feature flag → error if false
4. Complexity gate: analyze task string (see below)
5. If gate WARN: send Telegram inline keyboard
6. If gate PASS or CEO confirms: launch with {teamId}-team.md (Strategy A/B)
7. Audit: team_launch event
```

### Complexity Gating (BLOCK-1)

A task is flagged as potentially too simple for team mode if it meets either criterion:

| Criterion | Threshold |
|-----------|-----------|
| Task length | Fewer than 50 characters |
| Complexity keywords absent | None of: `and`, `then`, `also`, `multiple`, `all`, `each`, `refactor`, `migrate`, `integrate`, `orchestrate` |

When flagged, the Telegram bot sends a warning message with an inline keyboard:

```
Warning: This task may be too simple for team mode (est. 3x token cost).

Task: "Fix typo"

[Yes, use team mode]   [Switch to solo]
```

- **Yes, use team mode** → proceeds with `--as-team` launch.
- **Switch to solo** → re-launches with `--as pm` (or the team leader role) as a solo session.

CEO choice is recorded in the audit log under `complexity_gate_decision`.

### Team-Aware Session Display

`/sessions` output for a team session:

```
Session #3 [ACTIVE]
  Type:    team (dev-team)
  Leader:  @coder (claude-sonnet-4-5)
  Members: @reviewer, @architect
  Project: ~/project
  Started: 14:32
```

### `/capture` Team Role Info

When `/capture` is called on a team session, the summary includes the team ID and leader role so the CEO understands which agent produced the output.

---

## Key Deliverables

1. **`--as-team` flag in `telegram-commands.ts`** — Parse `--as-team <teamId>` alongside the existing `--as <role>` flag. Validate `teamId` against `TeamRegistry`. Check `AGENT_TEAMS` flag and return a user-friendly error if disabled. Extract task string from remaining arguments for complexity gating.

2. **Complexity gate (`src/bridge/intelligence/complexity-gate.ts`)** — `assessComplexity(task: string): ComplexityAssessment` returning `{ level: "simple" | "complex", reason: string }`. Applies length and keyword rules. Stateless and pure — no I/O.

3. **Team-aware launch in `agent-launcher.ts`** — Accept `teamId` in `LaunchOptions` alongside existing `agentRole`. Select `{teamId}-team.md` as the agent file for Strategy A, or build team context for Strategy B. Additive only — existing `agentRole` path unchanged.

4. **Telegram inline keyboard for complexity warning** — Reuse the permission inline keyboard pattern from Sprint 85. Two buttons: "Yes, use team mode" and "Switch to solo". Pending response stored with 5-minute timeout (auto-proceed as solo on timeout).

5. **Team session metadata in `BridgeSession`** — Add `teamId?: string` and `teamMembers?: AgentRole[]` fields to `BridgeSession` type. Populated on team launch. Displayed in `/sessions` and `/capture`.

6. **Audit events** — `team_launch` (on successful team session start), `complexity_gate_decision` (when CEO is prompted and responds), `team_launch_aborted` (when CEO selects solo or timeout fires).

---

## Test Plan (~18 tests)

### `--as-team` Parsing (4 tests)

| Test | Description |
|------|-------------|
| Valid teamId | Parses `--as-team dev` and resolves against TeamRegistry |
| Unknown teamId | Returns user-facing error for unregistered team |
| AGENT_TEAMS disabled | Returns clear error when flag is `false` |
| Coexistence | `--as-team` and `--as` cannot be used together in one command |

### Team Launch (3 tests)

| Test | Description |
|------|-------------|
| Strategy A | `{teamId}-team.md` present → Strategy A launch |
| Strategy B fallback | File absent → Strategy B inline content |
| Existing solo path | `--as pm` (solo) still works unchanged (regression) |

### Session Display (2 tests)

| Test | Description |
|------|-------------|
| `/sessions` team entry | Shows type, leader, members, project |
| `/capture` role info | Output includes team ID and leader role |

### Complexity Gating (5 tests)

| Test | Description |
|------|-------------|
| Simple task (short) | Fewer than 50 chars → level `simple` |
| Simple task (no keywords) | No complexity keywords → level `simple` |
| Complex task | Multi-step keywords present → level `complex` |
| CEO confirms team | Inline keyboard "Yes" → team launch proceeds |
| CEO switches to solo | Inline keyboard "Switch to solo" → solo launch |

### Audit Events (2 tests)

| Test | Description |
|------|-------------|
| `team_launch` event | Written with teamId, leader, members, projectPath |
| `complexity_gate_decision` event | Written with CEO choice and task assessment |

### Timeout (2 tests)

| Test | Description |
|------|-------------|
| Gate timeout | No CEO response in 5 min → auto-proceed as solo |
| Timeout audit | `team_launch_aborted` event written on timeout |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 91 | Agent Teams — Monitoring + Lifecycle (ADR-026) |
| 92 | Unified App Launcher (ADR-024) |
