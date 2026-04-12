# Current Sprint — Pointer

> **This file is an SSOT pointer.** It should always reflect the sprint that is currently active or the most-recently-completed sprint if none is open. Historical sprint detail lives in `docs/04-build/sprints/sprint-NNN-*.md`.

## Active / Most Recent

- **Sprint 135** — Surface Parity (OTT + Web API for Sprint 131-134 features) — **PLANNED** (2026-04-12)
  - Plan: [sprint-135-surface-parity.md](sprints/sprint-135-surface-parity.md)
  - Authority: CTO G2 APPROVED + CPO 9.4/10 APPROVED

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

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.0 | Pointer updated 2026-04-11*
