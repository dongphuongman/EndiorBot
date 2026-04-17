# Current Sprint — Pointer

> **This file is an SSOT pointer.** It should always reflect the sprint that is currently active or the most-recently-completed sprint if none is open. Historical sprint detail lives in `docs/04-build/sprints/sprint-NNN-*.md`.

## Active / Most Recent

- **Sprint 135** — Surface Parity + P1 Workspace Awareness — **IMPLEMENTATION COMPLETE** (2026-04-17, awaiting formal close)
  - Plan: [sprint-135-surface-parity.md](sprints/sprint-135-surface-parity.md)
  - Authority: CTO G2 APPROVED + CPO 9.4/10 APPROVED (original scope); CPO 9.5/10 + @cto countersign (P1 addition)
  - Original scope (items 1-8): all shipped — commits `2959517` (t1-t3), `b6b192e` (t4-t5-t8), `0da795a` (t6-t7), `9fcdfcb` + `835f5f4` (135a CPO review fixes)
  - P1 addition (triggered by MTClaw Workspace Awareness Notice 2026-04-17): SDLC Framework 6.3.1 adoption, Layer 1.25 workspace-awareness injection, 5 executor SOULs updated, framework bump, 11 new tests. Commits `9df591f` + `999c325`. ADR: [ADR-048](../02-design/01-ADRs/ADR-048-framework-6-3-1-workspace-awareness.md).
  - Pending for Sprint 136 kickoff: formal sprint close (@pjm), scope confirmation for Desktop + Web dashboard (CEO input needed), backlog items (L2 Handoff Completion, L1 CRG @pm polish, SOUL-pm v1.3.0 Rule 4, fetch boundary test).

- **Sprint 134** — Config Externalization + Webhooks Ingress — **✅ COMPLETE** (2026-04-11, CTO 9/10)
  - [sprint-134-config-webhooks.md](sprints/sprint-134-config-webhooks.md)

- **Sprint 133** — Active Memory + SSRF + Bug Fixes — **✅ COMPLETE** (2026-04-11, CTO 9.5/10)
  - [sprint-133-active-memory-ssrf.md](sprints/sprint-133-active-memory-ssrf.md)

- **Sprint 132** — openclaw Backport M0 + M1 — **✅ COMPLETE** (2026-04-11, CTO 9.5/10)
  - Plan: [sprint-132-openclaw-backport.md](sprints/sprint-132-openclaw-backport.md)
  - PRD: [openclaw-backport PRD](../01-planning/openclaw-backport/PRD.md)
  - Scope: [openclaw-backport scope](../01-planning/openclaw-backport/scope.md)
  - Authority: CTO G2 APPROVED (Plan v3) + CPO Approved + CEO Decisions Locked 2026-04-11

- **Sprint 131** — CRG Wiring + Auto-Handoff + UX Wins — **✅ COMPLETE** (2026-04-10, CPO accepted post-merge)
  - Plan: [sprint-131-crg-wiring-knowledge-velocity.md](sprints/sprint-131-crg-wiring-knowledge-velocity.md)
  - Key deliverables: `enrichWithCRG()` wiring, auto-handoff from @mentions (CEO-approved default), per-task state machine, knowledge erosion prompt, decision velocity metric, chat tool usage tracking
  - ADR-046 STUB landed; full expansion moved to Sprint 132 Task 1
  - Commits: `ce8af90` (CRG wiring + auto-handoff) · `b922286` (decision-velocity refinement)

## Previous Sprints

Historical sprint summaries live in their own docs. See [sprints/sprint-index.md](sprints/sprint-index.md) for the full catalog.

Recent highlights:
- Sprint 130 — Security + ADR + Chat ([sprint-130-security-adr-chat.md](sprints/sprint-130-security-adr-chat.md))
- Sprint 129 — Commit + Push + Stabilize (Sprint 121–128 consolidation)
- Sprint 72  — v2.0 Autonomous SDLC Agent (Gates A/B/C, AER metrics, model tiering) ([sprint-72-autonomy.md](sprints/sprint-72-autonomy.md))

## Maintenance Rule (@pjm)

This file must be updated **on the same day** as each sprint kickoff / close. Past drift (7+ days behind) was flagged by CTO during Plan v3 G2 review on 2026-04-11; this refresh resolves that debt. The SOUL-pm.md adjacent-artifact enumeration rule being added in the same batch helps prevent future drift.

---

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.1 | Pointer updated 2026-04-17*
