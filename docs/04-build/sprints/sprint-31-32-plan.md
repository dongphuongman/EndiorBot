# Sprint 31-32 Detailed Plan

**Version**: 1.0.0
**Date**: February 22, 2026
**Status**: ACTIVE - PLANNED
**Authority**: EndiorBot PM
**Pillar**: 2 - Sprint Governance
**Stage**: 01 - PLANNING
**Prerequisites**: Sprint 29-30 Complete
**SDLC**: Framework 6.1.1

---

## Sprint Overview

| Sprint | Focus | Duration |
|--------|-------|----------|
| Sprint 31 | Phase 4.4 (SDLC Governance) + Phase 5 (Skills) | 10 days |
| Sprint 32 | Phase 6 (CLI Commands) + Multi-Model Orchestrator | 10 days |

---

## Sprint 31: SDLC Governance & Skills

### Week 1 (Day 1-5): Phase 4.4 - SDLC Governance ✅ COMPLETE (Sprint 30)

**Note:** Phase 4.4 was completed ahead of schedule during Sprint 30.

#### Day 1-2: Gate Engine

| Task | Status | Deliverable |
|------|--------|-------------|
| Create src/sdlc/gates/gate-engine.ts | ✅ | G0.1-G4 evaluation |
| Create src/sdlc/gates/gate-checklist.ts | ✅ | Tier-specific checklists |
| Create src/sdlc/gates/index.ts | ✅ | Module exports |
| Create unit tests | 📋 | tests/sdlc/gates/ |

**Acceptance Criteria:**
- [x] Gate engine evaluates all gate types (G0-G4, G-Sprint)
- [x] Checklist items tier-aware (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)
- [x] Evidence collection integrated
- [x] Build passes

#### Day 3-4: CRP/MRP Services

| Task | Status | Deliverable |
|------|--------|-------------|
| Create src/sdlc/crp-service.ts | ✅ | Change Request Package |
| Create src/sdlc/mrp-service.ts | ✅ | Merge-Readiness Package |
| Create unit tests | 📋 | tests/sdlc/ |

**Acceptance Criteria:**
- [x] CRP generates and manages change requests
- [x] MRP validates PR readiness with checklists
- [x] Markdown export for both services
- [x] Build passes

#### Day 5: Vibecoding Index

| Task | Status | Deliverable |
|------|--------|-------------|
| Create src/sdlc/vibecoding/vibecoding-index.ts | ✅ | 0-100 quality score |
| Create src/sdlc/vibecoding/index.ts | ✅ | Module exports |
| Create unit tests | 📋 | tests/sdlc/vibecoding/ |

**Acceptance Criteria:**
- [x] 6 quality signals calculated
- [x] Score zones: Green (0-30), Yellow (31-60), Orange (61-80), Red (81-100)
- [x] Zone descriptions and gate pass checks
- [x] Build passes

### Week 2 (Day 6-10): Phase 5 - Skills Ecosystem

#### Day 6-7: Skills Framework

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/skills/types.ts | P0 | Skill interfaces |
| Create src/skills/skill-loader.ts | P0 | Skill discovery |
| Create src/skills/skill-registry.ts | P0 | Skill registration |
| Create skills/ directory structure | P0 | Skill templates |

**Acceptance Criteria:**
- [ ] Skills can be loaded from skills/ directory
- [ ] Skill metadata (name, description, commands) parsed
- [ ] Registry lists available skills
- [ ] Build passes

#### Day 8-9: Core Skills Migration

| Task | Priority | Deliverable |
|------|----------|-------------|
| Migrate coding-agent skill | P0 | skills/coding-agent/ |
| Migrate github skill | P0 | skills/github/ |
| Create skill templates | P1 | docs/reference/templates/skills/ |
| Create skill tests | P0 | tests/skills/ |

**Acceptance Criteria:**
- [ ] coding-agent skill works
- [ ] github skill integrates with gh CLI
- [ ] Skill templates documented
- [ ] Build passes

#### Day 10: G-Sprint Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Create ADR-007 (SDLC Governance) | P0 | docs/02-design/01-ADRs/ |
| Create TS-005 (Skills Architecture) | P0 | docs/02-design/14-Technical-Specs/ |
| G-Sprint Close checklist | P0 | Sprint approved |

---

## Sprint 32: CLI Commands & Multi-Model

### Week 1 (Day 1-5): Phase 6 - CLI Commands

#### Day 1-2: Core Commands

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/cli/commands/start.ts | P0 | Start project command |
| Create src/cli/commands/switch.ts | P0 | Switch context command |
| Create src/cli/commands/status.ts | P0 | Project status command |
| Update src/cli/index.ts | P0 | Command registration |

**Acceptance Criteria:**
- [ ] `endiorbot start <project>` initializes session
- [ ] `endiorbot switch <project>` preserves context
- [ ] `endiorbot status` shows project overview
- [ ] CLI help shows all commands

#### Day 3-4: SDLC Commands

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/cli/commands/gate.ts | P0 | Gate evaluation |
| Create src/cli/commands/sdlc.ts | P0 | SDLC status/validate |
| Create src/cli/commands/vibecoding.ts | P1 | Vibecoding index |
| Create unit tests | P0 | tests/cli/commands/ |

**Acceptance Criteria:**
- [ ] `endiorbot gate status` shows gate checklist
- [ ] `endiorbot gate propose <gate-id>` evaluates gate
- [ ] `endiorbot sdlc validate` checks compliance
- [ ] `endiorbot vibecoding <path>` calculates index
- [ ] Build passes

#### Day 5: Skills Commands

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/cli/commands/skill.ts | P0 | Skill management |
| Integration with skill registry | P0 | List/run skills |
| Create unit tests | P0 | tests/cli/commands/ |

**Acceptance Criteria:**
- [ ] `endiorbot skill list` shows available skills
- [ ] `endiorbot skill run <skill-name>` executes skill
- [ ] `endiorbot skill info <skill-name>` shows details
- [ ] Build passes

### Week 2 (Day 6-10): Multi-Model Orchestrator

#### Day 6-7: Core Orchestrator

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/agents/orchestrator/multi-model-orchestrator.ts | P0 | Core orchestrator |
| Create src/agents/orchestrator/consultation-manager.ts | P0 | Consultation lifecycle |
| Create unit tests | P0 | tests/agents/orchestrator/ |

**Acceptance Criteria:**
- [ ] Can query multiple providers in parallel
- [ ] Timeout handling works (30s per model, 60s total)
- [ ] Fallback to available responses
- [ ] Build passes

#### Day 8-9: Response Consolidation

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/agents/orchestrator/response-consolidator.ts | P0 | Response merging |
| Create src/agents/orchestrator/consensus-analyzer.ts | P1 | Agreement detection |
| Create src/cli/commands/consult.ts | P0 | Consult command |
| Create integration tests | P0 | tests/integration/ |

**Acceptance Criteria:**
- [ ] Consensus points extracted from multiple responses
- [ ] Disagreements identified with positions
- [ ] SDLC compliance check applied
- [ ] `endiorbot consult <query>` works end-to-end
- [ ] Build passes

#### Day 10: G-Sprint Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Create ADR-008 (Multi-Model Orchestrator) | P0 | docs/02-design/01-ADRs/ |
| Create TS-006 (CLI Architecture) | P0 | docs/02-design/14-Technical-Specs/ |
| Test coverage report | P0 | > 80% coverage |
| G-Sprint Close checklist | P0 | Sprint approved |

---

## Deliverables Summary

### Sprint 31 Deliverables

| Category | Count | Status |
|----------|-------|--------|
| SDLC Gate modules | 3 | ✅ Complete (Sprint 30) |
| SDLC Service modules | 2 | ✅ Complete (Sprint 30) |
| Vibecoding modules | 2 | ✅ Complete (Sprint 30) |
| Skills framework | 3 | 📋 Planned |
| Core skills | 2 | 📋 Planned |
| ADRs | 1 | 📋 Planned |
| Technical Specs | 1 | 📋 Planned |

**Phase 4.4 Files Created (Sprint 30):**
- `src/sdlc/gates/gate-checklist.ts` - Tier-specific checklists (505 lines)
- `src/sdlc/gates/gate-engine.ts` - Gate evaluation engine (636 lines)
- `src/sdlc/gates/index.ts` - Module exports (46 lines)
- `src/sdlc/vibecoding/vibecoding-index.ts` - Vibecoding calculator (417 lines)
- `src/sdlc/vibecoding/index.ts` - Module exports (28 lines)
- `src/sdlc/crp-service.ts` - Change Request Package (424 lines)
- `src/sdlc/mrp-service.ts` - Merge-Readiness Package (492 lines)
- `src/sdlc/index.ts` - Main SDLC module exports (90 lines)

### Sprint 32 Deliverables

| Category | Count | Status |
|----------|-------|--------|
| CLI commands | 7 | 📋 Planned |
| Orchestrator modules | 4 | 📋 Planned |
| Integration tests | 5+ | 📋 Planned |
| ADRs | 1 | 📋 Planned |
| Technical Specs | 1 | 📋 Planned |

---

## Dependencies

### Sprint 31 Dependencies

```
src/sdlc/gates/gate-engine.ts
    └── src/sessions/session-manager.ts (✅ Sprint 29)
    └── src/agents/types.ts (✅ Sprint 29)

src/skills/skill-loader.ts
    └── src/config/paths.ts (✅ Sprint 29)
```

### Sprint 32 Dependencies

```
src/cli/commands/
    └── src/sdlc/gates/gate-engine.ts (Sprint 31)
    └── src/skills/skill-registry.ts (Sprint 31)
    └── src/sessions/session-manager.ts (✅ Sprint 29)

src/agents/orchestrator/multi-model-orchestrator.ts
    └── src/providers/provider-registry.ts (✅ Sprint 29)
    └── src/agents/orchestrator/task-classifier.ts (✅ Sprint 29)
```

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Gate complexity | Medium | Start with basic checklist, iterate |
| Skill compatibility | Low | Use OpenClaw skill format |
| Multi-model latency | Medium | Configurable timeouts, parallel queries |
| Test coverage gap | Medium | TDD approach, CI enforcement |

---

## Success Criteria

### Sprint 31

- [x] Phase 4.4 complete (SDLC Governance) - Done in Sprint 30
- [ ] Phase 5 complete (Skills Ecosystem)
- [x] Gate engine evaluates all gate types
- [ ] 2+ skills migrated and working
- [ ] Test coverage > 75%
- [ ] G-Sprint Close approved

### Sprint 32

- [ ] Phase 6 complete (CLI Commands)
- [ ] Multi-Model Orchestrator working
- [ ] All CLI commands functional
- [ ] Response consolidation working
- [ ] Test coverage > 80%
- [ ] G-Sprint Close approved
- [ ] Ready for Phase 7 (Desktop) planning

---

## Next Sprint Reference

After Sprint 32 completion, Phase 7 (Desktop Interface) will be planned in Sprint 33-35.

Prerequisites for Desktop phase:
- [ ] CLI stability verified (14 days no breaking changes)
- [ ] All core features functional
- [ ] Test coverage > 80%
- [ ] Documentation complete

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
*Created: 2026-02-22*
