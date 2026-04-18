---
sprint: 136
status: DRAFT — Scope partially TBD, awaiting CEO confirmation on Desktop + Web dashboard specifics
start_date: TBD (after Sprint 135 formal close + CEO scope confirmation)
planned_duration: TBD — ~1h verified trivia + Desktop/Web scope (@pm claim: 5.5d, unverified)
framework: "6.3.1"
authority: "@pm draft 2026-04-17 (structural). Desktop/Web scope requires CEO confirmation before binding."
previous_sprint: "Sprint 135 — Surface Parity + P1 Workspace Awareness (IMPLEMENTATION COMPLETE 2026-04-17, awaiting formal close)"
---

# Sprint 136 — Desktop + Web Dashboard + Sprint 135 Carry-Overs

## Context

Sprint 135 closed with P1 Workspace Awareness added on top of the original 8-item scope (commits `2959517`, `b6b192e`, `0da795a`, `9fcdfcb`, `835f5f4`, `9df591f`, `999c325`). This sprint handles the **documentation debt** from Sprint 135 (ADR-048 full expansion, SOUL-pm v1.3.0 rule) plus **new scope** for Desktop + Web dashboard.

**Identity:** CEO Power Tool (LOCKED) — Desktop + Web dashboard must serve CEO's <30s-answer guarantee, not grow into a multi-user platform.

## Scope

### Part A — Verified carry-over from Sprint 135 (~1h total)

| # | Item | Effort | Priority | Authority |
|---|------|--------|----------|-----------|
| A1 | L2 Handoff Completion — `## Handoff Completion (MANDATORY)` section in 4 executor SOULs (coder, pm, architect, tester; reviewer excluded — deliverable is review verdict, not file) | ~15 min | P1 | CPO approval 2026-04-17 |
| A2 | SOUL-pm v1.3.0 — add Ground-Truth Rule 4: "For versioned artifacts (framework, ADR-NNN, Sprint-NNN), PM confirms CTO sign-off explicitly before writing bump" | ~15 min | P1 | @pm carryover note 2026-04-17 (would have caught 4 pattern instances in Sprint 135) |
| A3 | L1 @pm CRG polish — add `crg_architecture_overview` + `crg_graph_status` guidance to SOUL-pm Capabilities | ~10 min | P3 | @pm backlog |
| A4 | ADR-048 full expansion — convert STUB → FULL; fill in: rollback plan detail, quality-gate alignment, sibling-pattern comparison (MTClaw Go vs Orchestrator Python vs EndiorBot TS) | ~30 min | P2 | @cto countersign requires full expansion by Sprint 136 close |
| A5 | Formal Sprint 135 close — pnpm test + build + summary doc + push 3 commits (`9df591f`, `999c325`, `d10e288`) | Unknown | P0 | @pjm maintenance |

**Already shipped, removed from backlog:**

- ~~SENSITIVE_COMMANDS "exec-policy"~~ — already in Set at `src/commands/command-dispatcher.ts:59` (Sprint 135 C-HARD-1)
- ~~Fetch boundary test~~ — already exists at `tests/architecture/fetch-boundary.test.ts` (Sprint 133 S2, 126 lines, active)

### Part B — Desktop + Web Dashboard (SCOPE TBD — CEO input required)

**@pm claim (unverified):** *"original Sprint 136 scope, 5.5d — from surface-parity plan"*

**Ground-truth status:** Claim cannot be verified. The only upstream reference is `docs/07-operate/USAGE-GUIDE.md:746` — *"upcoming Desktop app (Sprint 136)"* — aspirational, not scoped. No master roadmap doc with "5.5d Desktop + Web" was found.

**Before this part becomes binding, CEO must confirm:**

| Question | Why it matters |
|----------|----------------|
| Desktop tech stack — Tauri 2, Electron, or native? | Determines build pipeline, bundle size, update mechanism |
| Which pages for Web dashboard? (config view, audit logs, status, all three?) | Affects effort 1d–3d |
| Does Desktop wrap the Web dashboard, or is it standalone? | Shared vs separate code paths |
| Auth model for Desktop: local-only, or remote + GATEWAY_TOKEN? | Security boundary |
| Is this a "view" dashboard only, or "view + mutate"? | Mutate needs the same confirm-flow Sprint 135 added for OTT |

**Placeholder scope (pending CEO answers):**

| # | Item | Effort estimate | Priority |
|---|------|-----------------|----------|
| B1 | Desktop shell (tech TBD) wrapping existing Web API | TBD | TBD |
| B2 | Web dashboard — read-only pages for `/api/config`, `/api/audit`, `/api/status` | TBD | TBD |
| B3 | Mutate flow (preset change, AM toggle) in dashboard with confirm | TBD | TBD |

**Acceptance gate for Part B binding:** CEO writes answers to the 5 questions above in this doc (or a linked scope doc) before sprint kickoff.

## Out of scope (explicitly)

- L3 Group History — deferred per Sprint 135 decision (identity lock)
- Multi-user Desktop/Web — CEO Power Tool identity lock prohibits
- Methodology changes to SDLC 6.3.1 framework (ADR-048 full expansion is a **documentation** task, not a framework edit)

## Success criteria

- Part A (5 items) shipped; all SOULs at 6.3.1 consistency; ADR-048 status FULL.
- Part B: either shipped with CEO-confirmed scope, or deferred to Sprint 137 if CEO scope pending at kickoff.
- No scope bleed between A and B — separate commits per part.

---

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.1 | Sprint 136 Draft Plan — structural; Part B pending CEO scope confirmation*
