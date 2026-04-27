# Product Roadmap

**Project:** EndiorBot
**Version:** 2.0.0
**Date:** 2026-02-28
**SDLC Stage:** 01-PLANNING
**Identity:** Solo Developer Power Tool (LOCKED)

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

## Tier 4 — Bridge & Intelligence (Sprint 82-92)

**Timeline:** Sprint 82-92
**Prerequisites:** Agent Orchestration (Sprint 55) complete
**CTO Reviews:** ADR-024 (10/10), ADR-025 (8/10), ADR-026 (9/10→10/10 Final Sign-Off)

### Phase 1: Bridge Foundation (Sprint 82-84) ✅ COMPLETE

| Sprint | Scope | Status |
|--------|-------|--------|
| 82 | TmuxBridge + SessionRegistry + Telegram `/launch`, `/sessions`, `/kill` | ✅ |
| 83 | Copilot CLI Bridge + Repo Context + Managed Shell | ✅ |
| 84 | SOUL Bridge Foundation — persona injection via Strategy A/B | ✅ |

### Phase 2: Bridge Completion (Sprint 85-86) ✅ COMPLETE

| Sprint | Scope | Status |
|--------|-------|--------|
| 85 | Permission Approval via Telegram — hook verification + relay | ✅ |
| 86 | /send Command + Turn Context — sendKeys relay + context injection | ✅ |

ADR-024 complete at Sprint 86.

### Phase 3: Intelligence Integration (Sprint 87-88) ✅ COMPLETE

| Sprint | Scope | Status |
|--------|-------|--------|
| 87 | Brain L4 + Context Anchoring in Bridge — 3-layer envelope injection | ✅ |
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline — 5-signal scoring | ✅ |

Intelligence parity at Sprint 88. 3-layer context model complete.

### Phase 4: Agent Teams (Sprint 89-91) ✅ COMPLETE

| Sprint | Scope | Status |
|--------|-------|--------|
| 89 | Team file generation — `install-teams` CLI + team installer | ✅ |
| 90 | Telegram `/launch --as-team` + complexity gate + smart routing | ✅ |
| 91 | Team monitoring, cost tracking, `/team-health`, `/kill-team` | ✅ |

### Phase 5: Infrastructure (Sprint 92) ✅ COMPLETE

| Sprint | Scope | Status |
|--------|-------|--------|
| 92 | Unified App Launcher — lock file + PID tracking + crash recovery | ✅ |

**Tier 4 COMPLETE** — All 11 sprints (82-92) delivered. 5,859 tests passing.

### ADR List (Bridge & Intelligence)

| ADR | Title | Sprint |
|-----|-------|--------|
| ADR-024 | Notification Bridge + Multi-Agent Session Management | 82-86 |
| ADR-025 | Session Intelligence Envelope + 3-Layer Context Model | 84-88 |
| ADR-026 | Claude Code Agent Teams | 89-91 |

### Intelligence Injection Map

| System | Layer | Sprint | Method |
|--------|-------|--------|--------|
| SOUL Templates | Launch-time | 84 ✅ | `--agent` / `--append-system-prompt-file` |
| Permission Approval | Turn-time | 85 ✅ | Async polling via Telegram |
| /send + Hooks | Turn-time | 86 ✅ | sendKeys task prefix |
| Brain L4 + Context | Launch+Turn | 87 ✅ | Envelope → CLI + sendKeys |
| Evaluator + Vibecoding | Post-turn | 88 ✅ | Capture → pipeline → store |
| Agent Teams (files) | Launch-time | 89 ✅ | Team-aware agent files |
| Agent Teams (Telegram) | Turn-time | 90 ✅ | `/launch --as-team` |
| Team Monitoring | Post-turn | 91 ✅ | Dashboard, cost tracking |
| Unified Launcher | Infrastructure | 92 ✅ | Single process + PID |

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

| Milestone | Target | Criteria | Status |
|-----------|--------|----------|--------|
| **M1: MVP CLI** | End Sprint 54 | consult, gate, switch work | ✅ DONE |
| **M2: Brain Integration** | End Sprint 55 | L4 injection, provenance | ✅ DONE |
| **M3: Pro Features** | End Sprint 58 | Session resume, magic links | ✅ DONE |
| **M4: Desktop** | End Sprint 62 | Desktop app functional | ✅ DONE |
| **M5: Notification Bridge** | End Sprint 86 | tmux bridge, permissions, /send | ✅ DONE |
| **M6: Intelligence** | End Sprint 88 | SOUL + Brain + Context + Evaluator | ✅ DONE |
| **M7: Agent Teams** | End Sprint 91 | Team launch, monitoring, cost | ✅ DONE |
| **M8: Unified Launcher** | End Sprint 92 | PID tracking, crash recovery, lock | ✅ DONE |
| **M9: Kimi2.6 Fallback** | Sprint 140 | Kimi API + OAuth proxy as first fallback for all agents | 🔄 IN PROGRESS |

---

## Current Sprint

**Sprint 140 (Kimi2.6 Fallback Integration)** — IN PROGRESS
- Scope: [FR-011](./requirements.md) + [ADR-051](../02-design/01-ADRs/ADR-051-kimi-proxy-subprocess-orchestrator.md)
- Status: Implementation complete, awaiting G3 test evidence

Next sprint: TBD

---

## References

- [Master Plan v2.0](../00-foundation/master-plan.md) - Identity & scope
- [Sprint 92 Plan](../04-build/sprints/sprint-92-unified-launcher.md) - Latest completed sprint

---

*Solo Developer Power Tool | SDLC Framework v6.2.0 - Stage 01: Planning*
*Identity: LOCKED (2026-03-08)*
