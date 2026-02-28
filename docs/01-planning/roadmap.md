# Product Roadmap

**Project:** EndiorBot
**Version:** 2.0.0
**Date:** 2026-02-28
**SDLC Stage:** 01-PLANNING
**Identity:** CEO Power Tool (LOCKED)

---

## Three Tiers (Per Master Plan v2.0)

```
┌───────────────────────────────────────────────────────────────────┐
│                    EndiorBot Roadmap                              │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tier 1 — MVP (2-3 weeks)                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  endiorbot consult "<question>"  ← 2 models consultation   │  │
│  │  endiorbot gate status G2        ← Read-only checklist     │  │
│  │  endiorbot switch <project>      ← Minimal context         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│                            ▼                                      │
│  Tier 2 — Pro (4-6 weeks after MVP)                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Auto-generate ADR template (CEO approve)                   │  │
│  │  Gate evidence manifest                                     │  │
│  │  History compaction + session resume                        │  │
│  │  OTT approvals via magic link                               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│                            ▼                                      │
│  Tier 3 — Productization (after 2-4 weeks CEO usage)              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Desktop shell                                              │  │
│  │  Skills gateway                                             │  │
│  │  Dynamic context overlay                                    │  │
│  │  Junior hub                                                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Tier 1 — MVP (Current)

**Timeline:** 2-3 weeks
**Status:** In Progress (Sprint 54)

### Sprint 54: CEO Tool MVP

| Task | Hours | Priority | Status |
|------|-------|----------|--------|
| ChatHandler (2-model) | 2h | P0 | PENDING |
| AIRouter (Gemini + Opus) | 1.5h | P0 | PENDING |
| primary_with_notes consolidation | 1h | P0 | PENDING |
| ActionControlPlane stub | 1h | P0 | PENDING |
| Context Budget governance | 1h | P0 | PENDING |
| Gate status read-only | 0.5h | P0 | PENDING |
| CLI `consult` command | 1h | P0 | PENDING |
| Testing & documentation | 2h | P0 | PENDING |

### MVP Features

| Feature | Command | Status |
|---------|---------|--------|
| 2-Model Consultation | `endiorbot consult` | Sprint 54 |
| Gate Status | `endiorbot gate status` | Sprint 54 |
| Project Switch | `endiorbot switch` | ✅ Implemented |
| Brain L4 Injection | Auto at session start | Sprint 54 |

### MVP Success Criteria

| Metric | Target |
|--------|--------|
| Decision time | <30s (not 30-60 min) |
| Context switch | <2s |
| No copy/paste | 0 app switches |
| Gate status | At a glance |

---

## Tier 2 — Pro (Future)

**Timeline:** 4-6 weeks after MVP
**Prerequisites:** CEO validates MVP for 2-4 weeks

### Sprint 55-56

| Feature | Priority |
|---------|----------|
| Brain provenance (schema_version) | P0 |
| Session resume with Brain | P0 |
| Telegram magic link approvals | P1 |
| Auto-ADR generation | P1 |

### Sprint 57-58

| Feature | Priority |
|---------|----------|
| Gate evidence manifest | P1 |
| History compaction | P1 |
| OTT bidirectional chat | P1 |

### Pro Success Criteria

| Metric | Target |
|--------|--------|
| Session resume | No context loss |
| Context drift | <5% re-explanations |

---

## Tier 3 — Productization (Later)

**Timeline:** After 2-4 weeks CEO usage
**Prerequisites:** Pro tier stable, CEO feedback collected

### Features

| Feature | Description |
|---------|-------------|
| Desktop shell | Electron app with full UI |
| Skills gateway | Extensible skill system |
| Dynamic context overlay | Real-time context injection |
| Junior hub | Task delegation and training |
| Full multi-model (4+) | All providers |
| SDLC enforcement | Not just checklist |

---

## What's NOT in Roadmap

Per Master Plan v2.0, these are explicitly excluded:

| Feature | Reason |
|---------|--------|
| Enterprise team features | Solo developer focus |
| Complex RBAC | Just CEO + Junior roles |
| Heavy infrastructure | No DB, Redis, MinIO |
| Usage billing | Not needed |

---

## Milestones

| Milestone | Target | Criteria |
|-----------|--------|----------|
| **M1: MVP CLI** | End Sprint 54 | consult, gate, switch work |
| **M2: Brain Integration** | End Sprint 55 | L4 injection, provenance |
| **M3: Pro Features** | End Sprint 58 | Session resume, magic links |
| **M4: Desktop** | End Sprint 62 | Desktop app functional |

---

## References

- [Master Plan v2.0](../00-foundation/master-plan.md) - Identity & scope
- [Sprint 54 Plan](../04-build/sprints/sprint-54-ai-chat-integration.md) - Current sprint

---

*CEO Power Tool | SDLC Framework v6.1.1 - Stage 01: Planning*
*Identity: LOCKED (2026-02-28)*
