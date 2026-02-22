# Sprint 29-30 Detailed Plan

**Project:** EndiorBot
**Version:** 1.0.0
**Date:** 2026-02-22
**SDLC Stage:** 01-PLANNING

---

## Sprint Overview

| Sprint | Focus | Duration |
|--------|-------|----------|
| Sprint 29 | Phase 1 + Phase 2.1 + Documentation | 10 days |
| Sprint 30 | Phase 2.2 + Phase 3 | 10 days |

---

## Sprint 29: Foundation & Core Infrastructure

### Week 1 (Day 1-5)

#### Day 1-3: Phase 1 - Project Scaffolding ✅ COMPLETE

| Task | Status | Deliverable |
|------|--------|-------------|
| Create directory structure | ✅ | docs/, src/, tests/, skills/ |
| Initialize package.json | ✅ | package.json, tsconfig.json |
| Create SDLC config | ✅ | .sdlc-config.json |
| Create identity files | ✅ | IDENTITY.md, AGENTS.md, CLAUDE.md |
| Create ADR-001, ADR-002 | ✅ | docs/02-design/01-ADRs/ |

#### Day 4-5: Phase 2.1 - Core Config ✅ COMPLETE

| Task | Status | Deliverable |
|------|--------|-------------|
| Migrate paths.ts | ✅ | src/config/paths.ts (transformed) |
| Create types.ts | ✅ | src/config/types.ts |
| Migrate boolean.ts | ✅ | src/utils/boolean.ts |
| Migrate reasoning-tags.ts | ✅ | src/shared/text/reasoning-tags.ts |
| Verify build | ✅ | pnpm build passes |
| Commit Phase 2.1 | ✅ | af74a99 |

### Week 2 (Day 6-10)

#### Day 6-7: Documentation Work ✅ IN PROGRESS

| Task | Status | Deliverable |
|------|--------|-------------|
| Create problem-statement.md | ✅ | docs/00-foundation/ |
| Create business-case.md | ✅ | docs/00-foundation/ |
| Create requirements.md | ✅ | docs/01-planning/ |
| Create user-stories.md | ✅ | docs/01-planning/ |
| Create roadmap.md | ✅ | docs/01-planning/ |
| Create ADR-004 | ✅ | docs/02-design/01-ADRs/ |
| Create ADR-005 | ✅ | docs/02-design/01-ADRs/ |
| Create TS-001 (Provider) | ✅ | docs/02-design/14-Technical-Specs/ |
| Create TS-002 (Session) | ✅ | docs/02-design/14-Technical-Specs/ |
| Create TS-003 (Agent) | ✅ | docs/02-design/14-Technical-Specs/ |

#### Day 8-10: Phase 2.2 Preparation

| Task | Status | Deliverable |
|------|--------|-------------|
| Review OpenClaw providers/ | 📋 | Migration notes |
| Review OpenClaw sessions/ | 📋 | Migration notes |
| Review OpenClaw agents/ | 📋 | Migration notes |
| Create migration test cases | 📋 | tests/migration/ |

---

## Sprint 30: Agent Core & Finalize Docs

### Week 1 (Day 1-5): Phase 2.2 - Agent Core

#### Day 1-2: Providers Migration

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/providers/types.ts | P0 | Core types |
| Create src/providers/base-provider.ts | P0 | Abstract class |
| Create src/providers/provider-registry.ts | P0 | Registry |
| Create src/providers/anthropic/ | P0 | Anthropic adapter |
| Create src/providers/openai/ | P1 | OpenAI adapter |
| Create src/providers/google/ | P1 | Gemini adapter |
| Create unit tests | P0 | tests/providers/ |

**Acceptance Criteria:**
- [ ] All providers implement AIProvider interface
- [ ] Registry can list/get providers
- [ ] Anthropic provider passes integration test
- [ ] Build passes

#### Day 3-4: Sessions Migration

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/sessions/types.ts | P0 | Session types |
| Create src/sessions/session-manager.ts | P0 | Manager class |
| Create src/sessions/session-store.ts | P0 | File persistence |
| Create src/sessions/token-counter.ts | P1 | Token counting |
| Create src/sessions/compactor.ts | P1 | History compaction |
| Create unit tests | P0 | tests/sessions/ |

**Acceptance Criteria:**
- [ ] Session create/save/load works
- [ ] Token counting accurate
- [ ] Compaction triggers at threshold
- [ ] Build passes

#### Day 5: Agents Core

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/agents/types.ts | P0 | Agent types |
| Create src/agents/agent-scope.ts | P0 | Permission boundaries |
| Create src/agents/orchestrator/task-classifier.ts | P1 | Task classification |
| Create unit tests | P0 | tests/agents/ |

**Acceptance Criteria:**
- [ ] Task classifier routes correctly
- [ ] Agent scope enforces boundaries
- [ ] Build passes

### Week 2 (Day 6-10): Integration & Quality

#### Day 6-7: Multi-Model Orchestrator

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create orchestrator/multi-model-orchestrator.ts | P0 | Core orchestrator |
| Create orchestrator/response-consolidator.ts | P1 | Response merging |
| Create integration tests | P0 | tests/integration/ |

**Acceptance Criteria:**
- [ ] Can query multiple providers in parallel
- [ ] Response consolidation works
- [ ] Timeout handling works

#### Day 8-9: CLI Integration

| Task | Priority | Deliverable |
|------|----------|-------------|
| Create src/cli/commands/start.ts | P0 | Start command |
| Create src/cli/commands/switch.ts | P0 | Switch command |
| Create src/cli/commands/consult.ts | P1 | Consult command |
| Update src/cli/index.ts | P0 | Command registration |

**Acceptance Criteria:**
- [ ] `endiorbot start <project>` works
- [ ] `endiorbot switch <project>` works
- [ ] `endiorbot consult <query>` works
- [ ] CLI help shows all commands

#### Day 10: G-Sprint Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Review documentation completeness | P0 | All docs current |
| Commit Phase 2.2 | P0 | Clean commit |
| G-Sprint Close checklist | P0 | Sprint approved |

---

## Deliverables Summary

### Sprint 29 Deliverables

| Category | Count | Status |
|----------|-------|--------|
| Documentation files | 10 | ✅ In Progress |
| Source files | 5 | ✅ Complete |
| ADRs | 4 | ✅ Complete |
| Technical Specs | 3 | ✅ Complete |

### Sprint 30 Deliverables

| Category | Count | Status |
|----------|-------|--------|
| Provider modules | 6 | 📋 Planned |
| Session modules | 5 | 📋 Planned |
| Agent modules | 4 | 📋 Planned |
| CLI commands | 3 | 📋 Planned |
| Test files | 10+ | 📋 Planned |

---

## Dependencies

### External Dependencies

| Dependency | Required By | Risk |
|------------|-------------|------|
| @anthropic-ai/sdk | Anthropic provider | Low |
| openai | OpenAI provider | Low |
| @google/generative-ai | Google provider | Low |
| tiktoken | Token counting | Low |

### Internal Dependencies

```
src/config/paths.ts (✅)
    └── src/sessions/session-store.ts
        └── src/sessions/session-manager.ts
            └── src/agents/orchestrator/

src/providers/
    └── src/agents/orchestrator/multi-model-orchestrator.ts
        └── src/cli/commands/consult.ts
```

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Provider API changes | Low | Pin SDK versions |
| Token counting accuracy | Medium | Use official tiktoken |
| Multi-model timeout | Medium | Configurable timeouts |
| Build failures | Low | Incremental commits |

---

## Success Criteria

### Sprint 29

- [x] Phase 1 complete
- [x] Phase 2.1 complete
- [ ] All documentation created
- [ ] Git commit checkpoint

### Sprint 30

- [ ] All providers working
- [ ] Session management working
- [ ] Multi-model consultation working
- [ ] CLI commands functional
- [ ] Test coverage > 80%
- [ ] G-Sprint Close approved

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
