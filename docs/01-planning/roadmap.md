# Product Roadmap

**Project:** EndiorBot
**Version:** 1.0.0
**Date:** 2026-02-21
**SDLC Stage:** 01-PLANNING

---

## Release Timeline

```
Sprint 29 ─────────────────────────────────────────────────────────────►
│ Phase 1: Scaffolding    │ Phase 2.1: Core Config                     │
│ (Day 1-3)               │ (Day 4-10)                                  │
│ ✅ DONE                 │ ✅ DONE                                      │
└─────────────────────────┴─────────────────────────────────────────────┘

Sprint 30 ─────────────────────────────────────────────────────────────►
│ Phase 2.2: Agent Core   │ Phase 3: Documentation                     │
│ providers, sessions     │ SDLC docs, ADRs                            │
│                         │                                             │
└─────────────────────────┴─────────────────────────────────────────────┘

Sprint 31 ─────────────────────────────────────────────────────────────►
│ Phase 4.1-4.2: Security + Quality Layer                              │
│ input-sanitizer, output-scrubber, shell-guard                        │
│ reflect-step, history-compactor, query-classifier                    │
└──────────────────────────────────────────────────────────────────────┘

Sprint 32 ─────────────────────────────────────────────────────────────►
│ Phase 4.3-4.4: Resilience + SDLC Governance                          │
│ failover-classifier, conversation-tracker                            │
│ gate-engine, crp-service, vibecoding-index                           │
└──────────────────────────────────────────────────────────────────────┘

Sprint 33-35 (Optional) ───────────────────────────────────────────────►
│ Phase 6: Desktop Interface                                           │
│ Electron + React + Gateway integration                               │
│ (Requires CLI stability)                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase Details

### Phase 1: Project Scaffolding ✅ COMPLETE

**Sprint:** 29 (Day 1-3)
**Status:** Done

| Deliverable | Status |
|-------------|--------|
| Directory structure | ✅ |
| package.json, tsconfig.json | ✅ |
| SDLC config | ✅ |
| IDENTITY.md, AGENTS.md, CLAUDE.md | ✅ |
| ADR-001, ADR-002 | ✅ |

---

### Phase 2.1: Core Infrastructure ✅ COMPLETE

**Sprint:** 29 (Day 4-10)
**Status:** Done

| Deliverable | Status |
|-------------|--------|
| src/config/paths.ts (transformed) | ✅ |
| src/config/types.ts | ✅ |
| src/utils/boolean.ts | ✅ |
| src/shared/text/reasoning-tags.ts | ✅ |
| Build verification | ✅ |

---

### Phase 2.2: Agent Core 📋 PLANNED

**Sprint:** 30
**Status:** Design Phase

| Deliverable | ADR Required |
|-------------|--------------|
| src/providers/ | ADR-006 (Provider Architecture) |
| src/sessions/ | ADR-007 (Session Management) |
| src/agents/ (core) | ADR-008 (Agent Orchestration) |

**Dependencies:**
- Technical specs for each module
- API design documentation

---

### Phase 3: Documentation 📋 PLANNED

**Sprint:** 30
**Status:** In Progress

| Deliverable | Status |
|-------------|--------|
| docs/00-foundation/ | ✅ In Progress |
| docs/01-planning/ | ✅ In Progress |
| docs/02-design/14-Technical-Specs/ | 📋 Planned |
| ADR-004 (Gate Engine) | 📋 Planned |
| ADR-005 (Port Strategy) | 📋 Planned |

---

### Phase 4: SDLC Orchestrator Patterns 📋 PLANNED

**Sprint:** 31-32

#### 4.1 Security Layer (Sprint 31)

| Module | Source | LOC |
|--------|--------|-----|
| input-sanitizer.ts | input_sanitizer.py | ~120 |
| output-scrubber.ts | output_scrubber.py | ~200 |
| shell-guard.ts | shell_guard.py | ~180 |

#### 4.2 Quality Layer (Sprint 31)

| Module | Source | LOC |
|--------|--------|-----|
| reflect-step.ts | reflect_step.py | ~100 |
| history-compactor.ts | history_compactor.py | ~350 |
| query-classifier.ts | query_classifier.py | ~140 |

#### 4.3 Resilience Layer (Sprint 32)

| Module | Source | LOC |
|--------|--------|-----|
| failover-classifier.ts | failover_classifier.py | ~210 |
| conversation-tracker.ts | conversation_tracker.py | ~480 |

#### 4.4 SDLC Governance (Sprint 32)

| Module | Purpose |
|--------|---------|
| gate-engine.ts | G0-G4 evaluation |
| crp-service.ts | Change Request Package |
| vibecoding-index.ts | Quality scoring |

---

### Phase 5: Skills & Build (Sprint 32)

| Deliverable | Status |
|-------------|--------|
| skills/ (selective migration) | Planned |
| Build scripts | Planned |
| CI/CD workflows | Planned |

---

### Phase 6: Desktop Interface (Sprint 33-35) - OPTIONAL

**Prerequisites:** CLI stable, core features working

| Sprint | Focus |
|--------|-------|
| 33 | Electron + React setup, Gateway integration |
| 34 | Chat interface, Dashboard |
| 35 | Gates view, Expert panel, Packaging |

---

## Milestones

| Milestone | Target | Criteria |
|-----------|--------|----------|
| M1: Core CLI | End Sprint 30 | CLI runs, project switch works |
| M2: SDLC Automation | End Sprint 32 | Gates, CRP, Vibecoding work |
| M3: Multi-Model | End Sprint 32 | Expert consultation works |
| M4: Desktop (Optional) | End Sprint 35 | Desktop app functional |

---

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|------------|-------|
| Migration complexity | Incremental phases, build verification | Coder |
| TypeScript port issues | Behavioral test suite | Coder |
| Scope creep | Strict phase boundaries, PM review | PM |
| API cost overrun | Configurable model selection | Architect |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Build time | < 30 sec | `pnpm build` |
| Test coverage | > 80% | `pnpm test:coverage` |
| CLI startup | < 1 sec | Manual timing |
| Context switch | < 2 sec | Manual timing |

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
