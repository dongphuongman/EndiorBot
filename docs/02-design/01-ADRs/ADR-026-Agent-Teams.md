---
spec_id: ADR-026
title: "Claude Code Agent Teams"
spec_version: "1.0.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024", "ADR-025"]
---

# ADR-026: Claude Code Agent Teams

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** CTO (9/10 APPROVED, 10/10 Final Sign-Off) + CPO (APPROVED)
**Authority:** Sprint 89-91

---

## Context

Claude Code supports experimental multi-agent delegation where a leader agent can spawn teammates as separate Claude sessions via the Agent tool. EndiorBot has 7 team archetypes (fullstack, planning, design, dev, qa, ops, executive) defined in `src/agents/types/team.ts` with team charters in `docs/reference/templates/teams/TEAM-*.md`. Sprint 84 created individual `.claude/agents/{role}.md` files for 13 agent roles. Sprint 89 extends this with team-aware agent files that include team context, delegation rules, and the Agent tool.

**Key constraint:** Agent Teams is experimental — Anthropic may change the API. All team-specific code must be isolated and gated behind the `AGENT_TEAMS` feature flag (default `false`).

---

## Decisions

### D1. Team files separate from agent files

**CTO Condition: C2**

**Decision**:
- Agent files: `{role}.md` (individual persona, Sprint 84) — 13 files, one per `AgentRole`
- Team files: `{teamId}-team.md` (team context + delegation, Sprint 89) — up to 6 files (fullstack excluded)
- Both coexist in `.claude/agents/` directory
- CEO chooses: `claude --agent pm` (solo) vs `claude --agent dev-team` (team mode)

**Rationale**: Team files augment, don't replace. CEO can switch between solo and team mode freely. Individual agent files remain unchanged (CTO C5 compliance) — Sprint 89 is purely additive.

### D2. AGENT_TEAMS feature flag gating

**CTO Condition: C1**

**Decision**:
- `AGENT_TEAMS: false` in `src/config/feature-flags.ts`
- Environment override: `ENDIORBOT_FF_AGENT_TEAMS=true`
- `team-installer.ts` MUST check flag before generating files (CTO A3)
- Agent launcher only detects team files when flag is `ON`

**Rationale**: Experimental feature, opt-in only, gradual rollout. If Anthropic changes the Agent Teams API, the flag ensures no CEO workflows are disrupted — all existing agent files and Strategy A/B paths from ADR-025 remain fully functional.

### D3. Fullstack team excluded from team files

**CTO Condition: C3**

**Decision**:
- fullstack = solo agent covering stages 00-07 (LITE tier composite)
- Fullstack team has no teammates to delegate to
- `installTeamFiles()` always skips fullstack regardless of tier
- Also skip any team where `teammates.length === 0` after filtering leader (e.g., qa at STANDARD)

**Rationale**: Team files exist for multi-agent delegation. Fullstack is inherently solo — a team file would be misleading and non-functional. The empty-teammates guard is a general safety net for edge cases.

### D4. Team file generation reuses existing SSOT

**Decision**: No new data sources. All team file content is derived from:

| Source | Location | Used For |
|--------|----------|----------|
| `TeamRegistry` | `src/agents/orchestrator/team-registry.ts` | Team resolution, charter loading |
| `TEAM-*.md` charters | `docs/reference/templates/teams/` | 7 charters with consistent structure |
| `AGENT_METADATA` | `src/bridge/intelligence/agent-installer.ts` | Leader model, tools, max-turns |
| `TeamDefinition`, `TeammateInfo`, `isValidTeamId()` | `src/agents/types/team.ts` | Type-safe team data |

**Rationale**: Reusing 100% of existing SSOT prevents data drift. Team file content stays in sync with team definitions automatically. No new registries, no parallel data structures.

### D5. Agent tool inclusion for delegation

**CTO Condition: C7**

**Decision**:
- Team files always include `"Agent"` in `allowed-tools`
- Enables leader to spawn teammate Claude sessions as subagents
- Individual agent files NEVER include `"Agent"` — solo agents must not self-spawn

**Rationale**: The `Agent` tool in solo files would break SDLC handoff control — agents could bypass orchestration and spawn arbitrary subagents outside EndiorBot governance. The strict separation (team files have Agent, agent files do not) enforces this boundary at the configuration layer.

### D6. Strategy B compatibility guarantee

**CTO Condition: C4**

**Decision**:
- Team files work with Strategy A (`claude --agent {teamId}-team`) — preferred path
- Strategy B (`--append-system-prompt-file`) always works as fallback
- Sprint 84 code not modified (CTO C5) — only additive changes to `agent-launcher.ts`

**Strategy selection for team files follows the same priority as ADR-025 D3:**

| Priority | Source | Condition | Strategy |
|----------|--------|-----------|----------|
| 1 | `.claude/agents/{teamId}-team.md` in project | File exists | A (native `--agent` flag) |
| 2 | Generated team content | File missing | B (`--append-system-prompt-file`) |
| 3 | Bare launch (no team context) | `AGENT_TEAMS` flag OFF | None |

**Rationale**: Zero-downgrade guarantee. If the Agent Teams experiment fails, Strategy A still works for individual agents, Strategy B provides universal fallback. No CEO workflow is broken.

### D7. Basic complexity gating for team mode

**BLOCK-1 Resolution**

**Decision**: Sprint 90 — when CEO uses `/launch --as-team`, check task complexity:
- If trivially simple (< 50 chars, no multi-step keywords), warn: `"This task may not benefit from team mode. Continue?"`
- Telegram inline keyboard: **Yes** / **Switch to solo**
- NOT full ML-based routing — basic heuristic only

**Multi-step keyword examples**: `implement`, `build`, `design`, `refactor`, `migrate`, `integrate`, `architect`, `create`, `set up`, `configure`

**Rationale**: Prevents wasted multi-agent resources on simple tasks. A single-sentence read-only question should not spin up a 4-agent team. The heuristic keeps implementation simple while addressing the core cost concern.

---

## Consequences

### Positive

- CEO can launch multi-agent team sessions with a single command (`claude --agent dev-team`)
- Team context (charter, teammates, delegation rules) automatically injected via team files
- Feature flag gating ensures safe experimental rollout — no CEO workflow disruption
- Reuses 100% existing SSOT — no new data sources, no drift risk
- Backward compatible — individual agent files unchanged (Sprint 84 untouched)
- Strategy A/B compatibility from ADR-025 extended to team files

### Constraints

- Limited to Claude Code — other agents (cursor, codex, gemini) do not support the Agent tool
- Experimental — Anthropic may change the Agent Teams API
- Cost multiplier: team sessions use multiple Claude instances simultaneously
- Fullstack team and zero-teammate teams are excluded from team file generation

### Risks

| Risk | Mitigation |
|------|-----------|
| Anthropic changes Agent Teams API | Code isolated in `team-installer.ts`; files are natural language; flag `OFF` by default (W1) |
| Team cost exceeds expectations | Cost threshold $5/team-session (A4); cost visibility notification (CA2) |
| Teammates fail to coordinate | Charter includes delegation rules; leader has explicit guidelines in team file |
| CEO accidentally spawns team for trivial tasks | Basic complexity gating (D7) with Telegram confirmation |

---

## Implementation Plan

| Sprint | Scope |
|--------|-------|
| 89 | Team file generation (`team-installer.ts`), `AGENT_TEAMS` feature flag, `bridge install-teams` CLI command, agent launcher team file detection |
| 90 | Telegram `/launch --as-team` command, team session display, basic complexity gating (BLOCK-1 resolution) |
| 91 | Team monitoring dashboard, cost tracking ($5 threshold alert), team health check, `/kill-team` command |

---

## References

- **ADR-024**: Notification Bridge + Multi-Agent Session Management
- **ADR-025**: Session Intelligence Envelope + 3-Layer Context Model
- `src/agents/types/team.ts` — `TeamId`, `TeamDefinition`, `TeammateInfo`
- `src/agents/orchestrator/team-registry.ts` — `TeamRegistry` SSOT
- `docs/reference/templates/teams/TEAM-*.md` — 7 team charters
- `src/bridge/intelligence/agent-installer.ts` — Sprint 84 agent installer pattern
