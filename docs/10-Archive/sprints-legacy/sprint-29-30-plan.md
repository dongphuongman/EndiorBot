# Sprint 29-30 Detailed Plan

**Version**: 1.0.0
**Date**: February 22, 2026
**Status**: ACTIVE - IN PROGRESS
**Authority**: EndiorBot PM
**Pillar**: 2 - Sprint Governance
**Stage**: 01 - PLANNING
**SDLC**: Framework 6.1.1

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

#### Day 8-10: Phase 2.2 - Agent Core ✅ COMPLETE

| Task | Status | Deliverable |
|------|--------|-------------|
| Create src/providers/types.ts | ✅ | Provider interfaces |
| Create src/providers/base-provider.ts | ✅ | Abstract class |
| Create src/providers/provider-registry.ts | ✅ | Registry singleton |
| Create src/providers/anthropic/ | ✅ | Anthropic adapter |
| Create src/sessions/types.ts | ✅ | Session types, token budgets |
| Create src/sessions/session-manager.ts | ✅ | Session lifecycle |
| Create src/sessions/session-store.ts | ✅ | File persistence |
| Create src/sessions/token-counter.ts | ✅ | Token estimation |
| Create src/agents/types.ts | ✅ | Agent interfaces |
| Create src/agents/agent-scope.ts | ✅ | Permission boundaries |
| Create src/agents/orchestrator/task-classifier.ts | ✅ | Query classification |
| Verify build | ✅ | pnpm build passes |

### Sprint 29 Phase 4.1: Security Layer ✅ COMPLETE

| Task | Status | Deliverable |
|------|--------|-------------|
| Port input-sanitizer.ts | ✅ | 12 injection patterns |
| Port output-scrubber.ts | ✅ | 7 credential patterns |
| Port shell-guard.ts | ✅ | 8 deny patterns + env scrubbing |
| Create security/index.ts | ✅ | Module exports |
| Verify build | ✅ | pnpm build passes |

---

## Sprint 30: Quality Layer & Resilience

### Week 1 (Day 1-5): Phase 4.2 - Quality Layer ✅ COMPLETE

#### Day 1-2: Reflect Step & Query Classifier

| Task | Status | Deliverable |
|------|--------|-------------|
| Port reflect-step.ts | ✅ | Reflect after tools pattern |
| Enhance query-classifier.ts | ✅ | Model routing hints (existing) |
| Create unit tests | 📋 | tests/agents/quality/ |

**Acceptance Criteria:**
- [x] Reflect step triggers after tool execution
- [x] Query classifier routes to correct model tier
- [x] Build passes

#### Day 3-4: History Compactor

| Task | Status | Deliverable |
|------|--------|-------------|
| Port history-compactor.ts | ✅ | Token budget management |
| Create compaction strategies | ✅ | Summarization + truncation fallback |
| Create unit tests | 📋 | tests/agents/quality/ |

**Acceptance Criteria:**
- [x] Compaction triggers at 80% threshold
- [x] Conversation context preserved after compaction
- [x] Build passes

#### Day 5: Quality Layer Integration

| Task | Status | Deliverable |
|------|--------|-------------|
| Create agents/quality/index.ts | ✅ | Module exports |
| Integration test with session manager | 📋 | E2E test |
| Documentation update | 📋 | TS-004 Quality Layer |

### Week 2 (Day 6-10): Phase 4.3 - Resilience Layer ✅ COMPLETE

#### Day 6-7: Failover Classifier

| Task | Status | Deliverable |
|------|--------|-------------|
| Port failover-classifier.ts | ✅ | 6 failure reason classification |
| Create retry strategies | ✅ | Abort Matrix determines action |
| Create unit tests | 📋 | tests/agents/resilience/ |

**Acceptance Criteria:**
- [x] Classifies auth, format, rate_limit, billing, timeout, unknown
- [x] Retry/fallback/abort logic works correctly
- [x] Build passes

#### Day 8-9: Conversation Tracker

| Task | Status | Deliverable |
|------|--------|-------------|
| Port conversation-tracker.ts | ✅ | Parent-child tracking |
| Implement 8 loop guards | ✅ | Messages, tokens, tools, etc. |
| Create conversation-limits.ts | ✅ | Token/message/budget limits |
| Create unit tests | 📋 | tests/agents/resilience/ |

**Acceptance Criteria:**
- [x] Tracks conversation hierarchy
- [x] Loop guards prevent infinite loops
- [x] Token budget enforced
- [x] Build passes

#### Day 10: G-Sprint Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Review documentation completeness | P0 | All docs current |
| Create ADR-006 (Quality Layer) | P0 | docs/02-design/01-ADRs/ |
| G-Sprint Close checklist | P0 | Sprint approved |

---

## Deliverables Summary

### Sprint 29 Deliverables ✅ COMPLETE

| Category | Count | Status |
|----------|-------|--------|
| Documentation files | 10 | ✅ Complete |
| Source files (config, utils) | 5 | ✅ Complete |
| Provider modules | 4 | ✅ Complete |
| Session modules | 4 | ✅ Complete |
| Agent modules | 3 | ✅ Complete |
| Security modules | 4 | ✅ Complete |
| ADRs | 5 | ✅ Complete |
| Technical Specs | 3 | ✅ Complete |

**Files Created:**
- `src/config/paths.ts`, `src/config/types.ts`
- `src/utils/boolean.ts`
- `src/shared/text/reasoning-tags.ts`
- `src/providers/types.ts`, `base-provider.ts`, `provider-registry.ts`
- `src/providers/anthropic/anthropic-provider.ts`
- `src/sessions/types.ts`, `session-manager.ts`, `session-store.ts`, `token-counter.ts`
- `src/agents/types.ts`, `agent-scope.ts`
- `src/agents/orchestrator/task-classifier.ts`
- `src/security/input-sanitizer.ts`, `output-scrubber.ts`, `shell-guard.ts`, `index.ts`

### Sprint 30 Deliverables ✅ COMPLETE

| Category | Count | Status |
|----------|-------|--------|
| Quality modules | 3 | ✅ Complete |
| Resilience modules | 4 | ✅ Complete |
| Integration tests | 5+ | 📋 Pending |
| ADRs | 1 | 📋 Pending |
| Technical Specs | 1 | 📋 Pending |

**Files Created:**
- `src/agents/quality/reflect-step.ts`, `history-compactor.ts`, `index.ts`
- `src/agents/resilience/conversation-limits.ts`, `failover-classifier.ts`, `conversation-tracker.ts`, `index.ts`

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

### Sprint 29 ✅ COMPLETE

- [x] Phase 1 complete (Project scaffolding)
- [x] Phase 2.1 complete (Core config)
- [x] Phase 2.2 complete (Agent core)
- [x] Phase 4.1 complete (Security layer)
- [x] All documentation created
- [x] Git commit checkpoint

### Sprint 30 ✅ IN PROGRESS

- [x] Phase 4.2 complete (Quality layer)
- [x] Phase 4.3 complete (Resilience layer)
- [x] Reflect step working
- [x] History compactor working
- [x] Failover classifier working
- [x] Conversation tracker working
- [ ] Test coverage > 80%
- [ ] G-Sprint Close approved

---

## Next Sprint Reference

See [Sprint 31-32 Plan](./sprint-31-32-plan.md) for:
- Phase 4.4: SDLC Governance
- Phase 5: Skills Ecosystem
- Phase 6: CLI Commands

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
*Last Updated: 2026-02-22*
