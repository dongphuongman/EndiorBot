# EndiorBot Roadmap

> **CEO Power Tool** — AI assistant that answers in <30s instead of 30-60 min

---

## Three Tiers (Scope-Locked per Master Plan v2.0)

### Tier 1 — MVP (Current: 2-3 weeks)

**Status**: IN PROGRESS (Sprint 54)

```bash
endiorbot consult "<question>"  # 2 models, primary_with_notes
endiorbot gate status G2        # Read-only checklist
endiorbot switch <project>      # Minimal context
```

**Features:**
- [x] CLI foundation
- [x] Project switching
- [ ] 2-model consultation (Gemini + Opus)
- [ ] Gate status read-only
- [ ] ActionControlPlane stub
- [ ] Context Budget (2K tokens/turn)
- [ ] Brain L4 injection

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Decision time | <30s |
| Context switch | <2s |
| No copy/paste | 0 app switches |

---

### Tier 2 — Pro (4-6 weeks after MVP)

**Prerequisites:** CEO validates MVP for 2-4 weeks

**Features:**
- [ ] Auto-generate ADR template (CEO approve)
- [ ] Gate evidence manifest
- [ ] History compaction + session resume
- [ ] OTT approvals via magic link
- [ ] Brain provenance (schema_version)

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Session resume | No context loss |
| Context drift | <5% re-explanations |

---

### Tier 3 — Productization (After 2-4 weeks CEO usage)

**Prerequisites:** Pro tier stable, CEO feedback collected

**Features:**
- [ ] Desktop shell (Electron)
- [ ] Skills gateway
- [ ] Dynamic context overlay
- [ ] Junior hub
- [ ] Full multi-model (4+)
- [ ] SDLC enforcement

---

## Sprint Timeline

| Sprint | Focus | Status |
|--------|-------|--------|
| 54 | MVP: 2-model, ActionControlPlane, Context Budget | IN PROGRESS |
| 55 | Brain provenance, session resume | PLANNED |
| 56 | Magic link approvals | PLANNED |
| 57-58 | Pro features | PLANNED |
| 59+ | Productization | FUTURE |

---

## What's NOT in Roadmap

Per Master Plan v2.0, explicitly excluded:

| Feature | Reason |
|---------|--------|
| Enterprise team features | Solo developer focus |
| Complex RBAC | Just CEO + Junior roles |
| Heavy infrastructure | No DB, Redis, MinIO |
| Usage billing | Not needed |

---

## References

- [Master Plan v2.0](./docs/00-foundation/master-plan.md) - Identity & scope
- [Requirements](./docs/01-planning/requirements.md) - Detailed requirements
- [Sprint 54](./docs/04-build/sprints/sprint-54-ai-chat-integration.md) - Current sprint

---

*EndiorBot v2.0 | CEO Power Tool | Identity: LOCKED (2026-02-28)*
