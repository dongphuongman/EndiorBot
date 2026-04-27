# Sprint 74: Team Agent System

**Date:** 2026-03-03
**Status:** PLANNED
**Duration:** 21h (revised from 20h per CTO review)
**Prerequisites:** Sprint 73 ✅ Complete (CLI Session + L2 Compliance, 4645 tests)

---

## 1. Sprint Goal

Implement **teams as first-class routing concept** in EndiorBot. CEO can delegate to teams (`@planning`, `@dev`, `@qa`) instead of only individual agents. Teams resolve to leader agents with enriched context (charter, teammates, delegation rules).

---

## 2. Context

- **Problem:** CEO can only talk to individual agents (`@pm`, `@coder`). For complex tasks spanning multiple SDLC stages, CEO must manually coordinate handoffs between agents.
- **Solution:** Teams resolve to leader agents with context injection. `@planning` → PM (leader) who knows teammates and can delegate.
- **Design Docs:** [ADR-017](../../02-design/01-ADRs/ADR-017-Team-Agent-System.md)
- **CTO Review:** APPROVED WITH CONDITIONS (3 blocking resolved, 4 advisory addressed)
- **CPO Review:** APPROVED

---

## 3. Scope

### In Scope

| # | Task | Hours | Deliverable |
|---|------|-------|-------------|
| 1 | Team types (`src/agents/types/team.ts`) | 1.5h | TeamId, TeamDefinition, TeamContext, transitions |
| 2 | Team registry (`src/agents/orchestrator/team-registry.ts`) | 3h | TeamRegistry class with load, lookup, resolve |
| 3 | Team registry tests | 2h | ~12 tests: load, lookup, per-tier, charter, resolution |
| 4 | Mention parser extension | 2h | Add teamId to ParsedMention, team detection via TeamRegistry |
| 5 | Mention parser team tests | 1.5h | ~8 tests: team formats, agent priority, edge cases |
| 6 | Agent router team routing | 2.5h | routeTeam(), context injection into SOUL |
| 7 | Team charter templates (7 files) | 1.5h | TEAM-{planning,design,dev,qa,ops,fullstack,executive}.md |
| 8 | Tier config JSON reconciliation | 1.5h | LITE rename, STANDARD +qa, PRO +design, ENT +design+ops |
| 9 | Shell @mention dispatch | 1.5h | @mention handling before Commander dispatch |
| 10 | Exports + integration tests | 1.5h | Barrel exports, ~5 integration tests |
| 11 | Build + full test suite | 1h | pnpm build + pnpm test pass |

**Total: 21h, ~50 new tests**

### Out of Scope

- Parallel teammate execution (sequential delegation only for v1)
- Team-level conversation tracking
- Team visualizer TUI
- Config-driven team transitions
- `@govern` team (needs governance stage work first)
- Business Analyst role (PM + Researcher is sufficient)

---

## 4. Acceptance Criteria

### AC-1: Team Routing
```
Given CEO types "@planning design auth system"
When the mention parser processes the input
Then it detects "planning" as a team (not an agent)
And resolves to PM (leader) with team context injected
```

### AC-2: Agent Priority
```
Given CEO types "@pm design auth system"
When the mention parser processes the input
Then it routes directly to PM (agent takes priority over team)
And no team context is injected
```

### AC-3: Tier-Dependent Teams
```
Given the project is configured as LITE tier
When CEO types "@planning task"
Then routing fails with "Team 'planning' is not available in LITE tier"
And "@fullstack" is the only available team
```

### AC-4: Team Context Injection
```
Given a team mention is detected for @dev
When routing to the leader (coder)
Then the SOUL template includes a "## Team Context" section
And the section lists teammates with their roles and descriptions
And delegation instructions are provided
```

### AC-5: Shell @mention
```
Given CEO is in endiorbot shell
When CEO types "@dev implement feature X"
Then the shell dispatches to AgentRouter.route()
And displays routing result (team, leader, classification)
```

---

## 5. CTO Blocking Conditions (Resolved)

| # | Condition | Resolution |
|---|-----------|------------|
| B1 | Config reconciliation table | ADR-017 Section "Tier Config Reconciliation" |
| B2 | Missing ADR-017 | Created: `docs/02-design/01-ADRs/ADR-017-Team-Agent-System.md` |
| B3 | teamId/isTeam redundancy | isTeam set from teamId detection during parsing (not independently) |

## 6. CTO Advisory Items (Addressed)

| # | Advisory | Action |
|---|----------|--------|
| A1 | Step 8 hours underestimated | Revised to 1.5h |
| A2 | Shell lazy-load router | AgentRouter lazy-loaded on first @mention |
| A3 | Test count low | Revised to ~50 tests |
| A4 | Transitions location | Hardcoded in team.ts (matching handoff.ts pattern) |

---

## 7. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Teams resolve to leaders | Not parallel execution | Simpler for v1; leader coordinates delegation |
| Agent-first namespace | `@pm` → PM directly | Backward compatibility |
| No new AgentRole values | Teams use existing roles | Avoids type explosion |
| isTeam derived from teamId | Not stored independently | CTO B3: prevents state mismatch |
| Charter injection | Append to SOUL content | Non-destructive, ~200-300 tokens |

---

## 8. Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| ADR-017 | ✅ Created | `docs/02-design/01-ADRs/ADR-017-Team-Agent-System.md` |
| Team charter templates | ✅ Created | `docs/reference/templates/teams/TEAM-*.md` |
| Tier config JSONs | ✅ Updated | `docs/reference/templates/configs/endiorbot-*.json` |
| SOUL-coder Design-First Gate | ✅ Strengthened | `docs/reference/templates/souls/SOUL-coder.md` |
| SOUL-pm Post-Approval Doc Gate | ✅ Added | `docs/reference/templates/souls/SOUL-pm.md` |
| mention-parser.ts (isTeam field) | ✅ Exists | `src/agents/orchestrator/mention-parser.ts` |
| resolveTemplatesRoot() | ✅ Exists | `src/config/paths.ts` |

---

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LITE config rename breaks existing tests | Medium | Grep for "dev" team references before rename |
| Charter injection increases token count | Low | ~200-300 tokens, well within budget |
| Shell startup latency | Low | Lazy-load router on first @mention |

---

## 10. Definition of Done

- [ ] `pnpm build` passes with zero errors
- [ ] All 4645+ existing tests pass
- [ ] ~50 new tests pass
- [ ] Manual E2E: `@planning "task"` routes to PM with team context
- [ ] Manual E2E: `@pm "task"` routes directly (no team)
- [ ] Manual E2E: LITE tier only shows `@fullstack`
- [ ] ADR-017 documented and approved
- [ ] Team charters in `docs/reference/templates/teams/`
- [ ] Tier configs updated per reconciliation table
