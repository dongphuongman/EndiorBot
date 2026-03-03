# ADR-017: Team Agent System

**Status:** Accepted
**Date:** 2026-03-03
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** 74

---

## Context

EndiorBot has 13 individual agents (9 SE4A + 3 SE4H + 1 Router) but no concept of **teams**. CEO can only talk to individual agents (`@pm`, `@coder`). For complex tasks spanning multiple SDLC stages, CEO must manually coordinate handoffs between agents.

TinySDLC (LITE community version) has a working 4-team system (planning, dev, qa, fullstack). CEO wants EndiorBot to adopt and extend this concept to cover the full SDLC Framework across all tiers.

**User request:** "chúng ta vẫn cần agent đại diện cho 1 team và gọi được các thành viên là các agent riêng lẻ"

**CTO Review:** Approved with conditions (B1: config reconciliation, B3: teamId/isTeam redundancy).

---

## Decision

### Teams resolve to leader agents with enriched context

```
CEO → @planning "design auth system"
       ↓
  mention-parser detects "planning" is a team (via TeamRegistry)
       ↓
  agent-router resolves planning → leader: pm
       ↓
  PM's SOUL template enriched with team charter + teammates list
       ↓
  PM executes task, can delegate: [@researcher: investigate OAuth providers]
```

### Key Design Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Team routing model | Leader with context injection | Simpler than parallel execution; leader coordinates delegation |
| Namespace resolution | Agent first, team second | `@pm` always routes to PM directly; `@planning` resolves via team |
| New agent types | None | Teams resolve to existing AgentRole values; avoids type explosion |
| Team definitions source | Tier config JSON files | Same `endiorbot-{TIER}.json` files AgentRouter already uses |
| Charter storage | `TEAM-{id}.md` files | Follows `SOUL-{role}.md` pattern using `resolveTemplatesRoot()` |
| isTeam derivation | `teamId !== undefined` | Avoids boolean/string state mismatch (CTO B3 condition) |
| Team transitions | Hardcoded in types | Matches `ALLOWED_TRANSITIONS` pattern for agent transitions |

### Namespace Resolution Order

1. Check `isValidRole(candidate)` → agent route (direct)
2. Check `teamRegistry.isTeam(candidate)` → team route (resolve to leader)
3. Unknown → warning/error

This ensures backward compatibility: existing `@pm "task"` commands work unchanged.

### Context Injection Strategy

When routing to a team leader, the router appends a `## Team Context` section to the SOUL template:

```markdown
## Team Context

**Team:** Planning Team
**Your Role:** Team Leader

### Teammates
- @researcher — Discovery and user research
- @pjm — Sprint coordination

### Delegation Rules
You can delegate to teammates using: [@agent: task description]
Only delegate to agents listed above.
```

This enriches the leader's prompt without changing the SOUL template on disk.

---

## Tier Config Reconciliation (B1)

### Current State → Target State

| Tier | Current Teams | Target Teams | Changes |
|------|--------------|--------------|---------|
| **LITE** | `dev` (archetype: fullstack, leader: coder) | `fullstack` (archetype: fullstack, leader: fullstack) | Rename id `dev` → `fullstack`; change leader/members to `fullstack` agent |
| **STANDARD** | `planning`, `dev` | `planning`, `dev`, `qa` | Add `qa` team (leader: reviewer, members: [reviewer]) |
| **PROFESSIONAL** | `planning`, `dev`, `qa`, `executive` | `planning`, `design`, `dev`, `qa`, `executive` | Add `design` team (leader: architect, members: [architect, pm, coder]) |
| **ENTERPRISE** | `planning`, `dev`, `qa`, `executive` | `planning`, `design`, `dev`, `qa`, `ops`, `executive` | Add `design` + `ops` teams |

### Agent List Updates

| Tier | Current Agents | Change |
|------|---------------|--------|
| LITE | assistant, coder | Replace `coder` with `fullstack` |
| STANDARD | (no change) | — |
| PROFESSIONAL | (no change) | — |
| ENTERPRISE | (no change) | — |

### Breaking Change: LITE `dev` → `fullstack`

This is a team ID rename. Since team IDs are only used in tier config JSON (no external consumers yet), this is safe. The TeamRegistry reads from config at startup — no migration needed.

---

## Team Definitions

| Team | Leader | Members | SDLC Stages | Gates |
|------|--------|---------|-------------|-------|
| **fullstack** | fullstack | [fullstack] | 00-07 | All |
| **planning** | pm | [researcher, pm, pjm, architect] | 00-01 | G0.1, G1 |
| **design** | architect | [architect, pm, coder] | 02-03 | G2 |
| **dev** | coder | [coder, reviewer] | 04 | G-Sprint |
| **qa** | tester | [tester, reviewer] | 05 | G3 |
| **ops** | devops | [devops, coder] | 06-07 | G4 |
| **executive** | cto | [ceo, cpo, cto] | advisory | All |

### Teams Per Tier

| Tier | Available Teams |
|------|----------------|
| LITE | fullstack |
| STANDARD | planning, dev, qa |
| PROFESSIONAL | planning, design, dev, qa, executive |
| ENTERPRISE | planning, design, dev, qa, ops, executive |

---

## Consequences

### Positive

- CEO can delegate to teams without knowing individual agent assignments
- Team leaders receive enriched context (charter, teammates) for better delegation
- Backward compatible: all existing `@agent` commands work unchanged
- Follows existing patterns (discriminated unions, singleton registry, tier configs)

### Negative

- Sequential delegation only (no parallel teammate execution in v1)
- Team transitions are hardcoded (not config-driven)
- LITE tier `dev` → `fullstack` rename may confuse users who read raw config

### Risks

- Charter injection increases SOUL template token count (~200-300 tokens)
- Lazy-load TeamRegistry on first `@team` mention to avoid startup latency

---

## Not In Scope (Future)

- Parallel teammate execution
- Team-level conversation tracking
- Team visualizer TUI
- Config-driven team transitions
- `@govern` team (needs governance stage work first)

---

## References

- [TinySDLC Team System](../../../tinysdlc/) — 4-team model for LITE tier
- [ADR-001: Multi-Model Orchestrator](./ADR-001-Multi-Model-Orchestrator.md)
- [ADR-016: CLI Session Mode](./ADR-016-CLI-Session-Mode.md) — Shell integration point
