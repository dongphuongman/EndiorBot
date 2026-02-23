# Autonomy Epic - Design Documents Index

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: ACTIVE
**SDLC**: Framework 6.1.1

---

## Overview

This directory contains design documents for the Autonomy Epic (Sprints 35-40). Each document provides comprehensive technical specifications for implementing 2+ hour autonomous runs.

---

## Document Structure

### Foundation Documents (`docs/00-foundation/autonomy-epic/`)

| Document | Purpose | Status |
|----------|---------|--------|
| `00-problem-statement.md` | Problem definition, current pain points, target state | ✅ COMPLETE |
| `01-business-case.md` | ROI analysis, value proposition, success metrics | ✅ COMPLETE |

### Design Documents (`docs/02-design/autonomy-epic/`)

| Document | Purpose | Sprint | Status |
|----------|---------|--------|--------|
| `00-system-architecture.md` | Overall system design, component diagram, data flow | All | ✅ COMPLETE |
| `01-checkpoint-design.md` | Checkpoint state model, serialization, conflict resolution | 35 | 📝 REF: ADR-006 |
| `02-budget-design.md` | Budget control, circuit breakers, cost estimation | 36 | 📝 REF: ADR-007 |
| `03-self-correction-design.md` | Error classification, fix patterns, anti-cheat | 37 | 📝 REF: Sprint 37 Plan |
| `04-resource-router-design.md` | Hybrid AI routing, quality gates, Ollama integration | 38 | 📝 REF: Sprint 38 Plan |
| `05-parallel-execution-design.md` | Track manager, file locks, dependency scheduling | 39 | 📝 REF: Sprint 39 Plan |
| `06-fix-logging-design.md` | Fix log schema, weekly review CLI, pattern manager | 40 | 📝 REF: Sprint 40 Plan |

### Integration Documents (`docs/03-integration/autonomy-epic/`)

| Document | Purpose | Status |
|----------|---------|--------|
| `00-integration-overview.md` | Integration strategy, timeline, validation | 📝 TO CREATE |
| `01-api-specifications.md` | API contracts for all autonomy modules | 📝 TO CREATE |
| `02-data-contracts.md` | Data structure schemas, validation rules | 📝 TO CREATE |
| `03-integration-tests.md` | Integration test scenarios, end-to-end flows | 📝 TO CREATE |

---

## Cross-Reference Matrix

### Design Documents → Sprint Plans

| Design Doc | Sprint Plan | ADR | Key Sections |
|------------|-------------|-----|--------------|
| `01-checkpoint-design.md` | Sprint 35 | ADR-006 | CheckpointState interface, Resume flow, Conflict detection |
| `02-budget-design.md` | Sprint 36 | ADR-007 | BudgetConfig, CircuitBreaker, CostEstimator, NotificationRateLimiter |
| `03-self-correction-design.md` | Sprint 37 | (Planned) | ErrorClassifier, DeterministicFixer, AntiCheatVerifier, 3-strike rule |
| `04-resource-router-design.md` | Sprint 38 | (Planned) | TaskClassifier, ModelSelector, QualityGates, Ollama fallback |
| `05-parallel-execution-design.md` | Sprint 39 | (Planned) | TrackManager, FileLockManager, DependencyScheduler |
| `06-fix-logging-design.md` | Sprint 40 | (Planned) | FixLogSchema, FixLogger, WeeklyReviewCLI, PatternManager |

### Sprint Plans → Design Documents

| Sprint | Plan Doc | Design Docs | ADRs |
|--------|----------|-------------|------|
| Sprint 35 | `sprint-35-plan.md` | `01-checkpoint-design.md` | ADR-006 (approved) |
| Sprint 36 | `sprint-36-plan.md` | `02-budget-design.md` | ADR-007 (draft) |
| Sprint 37 | `sprint-37-plan.md` | `03-self-correction-design.md` | ADR-008 (planned) |
| Sprint 38 | `sprint-38-plan.md` | `04-resource-router-design.md` | ADR-009 (planned) |
| Sprint 39 | `sprint-39-plan.md` | `05-parallel-execution-design.md` | ADR-010 (planned) |
| Sprint 40 | `sprint-40-plan.md` | `06-fix-logging-design.md` | ADR-011 (planned) |

---

## Design Artifacts

### Architecture Diagrams

Located in: `docs/02-design/autonomy-epic/diagrams/`

| Diagram | Format | Purpose |
|---------|--------|---------|
| `autonomy-system-overview.mermaid` | Mermaid | High-level architecture (4 layers) |
| `checkpoint-flow.mermaid` | Mermaid | Checkpoint creation + resume flow |
| `budget-enforcement.mermaid` | Mermaid | Budget check + limit handling |
| `self-correction-state-machine.mermaid` | Mermaid | Error fix state transitions |
| `resource-routing.mermaid` | Mermaid | Task complexity → model selection |
| `parallel-tracks.mermaid` | Mermaid | Track scheduling + file locking |
| `component-integration.mermaid` | Mermaid | Cross-module dependencies |

### Data Models

Located in: `docs/02-design/autonomy-epic/schemas/`

| Schema | Format | Purpose |
|--------|--------|---------|
| `checkpoint-state.schema.json` | JSON Schema | CheckpointState validation |
| `budget-config.schema.json` | JSON Schema | BudgetConfig validation |
| `approval-request.schema.json` | JSON Schema | ApprovalRequest validation |
| `event-log.schema.json` | JSON Schema | EventLog validation |
| `fix-log.schema.json` | JSON Schema | FixLogEntry validation |

---

## Usage Guidelines

### For Developers

**Before Sprint N**:
1. Read `docs/01-planning/sprint-N-plan.md` (acceptance criteria, tasks)
2. Read `docs/02-design/autonomy-epic/0N-[module]-design.md` (detailed specs)
3. Review relevant ADR (architecture decisions, rationale)

**During Sprint N**:
1. Implement to design spec
2. Reference sprint plan for daily tasks
3. Update design doc if deviations occur (with approval)

**After Sprint N**:
1. Validate implementation against design doc
2. Update design doc with as-built details
3. Mark sprint as complete in this README

### For Reviewers

**Design Review Checklist**:
- [ ] Design doc aligns with sprint plan acceptance criteria
- [ ] Component diagram shows all integration points
- [ ] Data flow diagrams cover happy path + error cases
- [ ] Non-functional requirements specified (performance, reliability)
- [ ] Security considerations addressed (anti-cheat, sanitization)
- [ ] Rollback/recovery strategy defined
- [ ] Cross-references to ADRs accurate

**Implementation Review Checklist**:
- [ ] Code structure matches design doc component diagram
- [ ] API contracts match `01-api-specifications.md`
- [ ] Data structures match schema files
- [ ] Integration tests cover scenarios in `03-integration-tests.md`
- [ ] Performance meets targets in design doc

---

## Design Principles (Autonomy Epic)

### 1. Safety First (Iceberg Layer 1)

**Principle**: Checkpoint/resume and budget control MUST be in place before increasing autonomy.

**Application**:
- Sprint 35: Checkpoint before self-correction
- Sprint 36: Budget limits before parallel tracks
- All features: Circuit breakers, 3-strike rules, anti-cheat

### 2. Single Process Model

**Principle**: No multi-process complexity, async/await only.

**Application**:
- Sprint 39: Parallel tracks via async/await (not workers)
- All modules: Single Node.js process
- Integration: Event loop scheduling (no IPC)

### 3. Fail-Safe by Default

**Principle**: When in doubt, escalate to CEO. Never make risky autonomous decisions.

**Application**:
- Sprint 36: Escalation router blocks architecture changes
- Sprint 37: 3 strikes → escalate (don't loop forever)
- Sprint 38: Quality gates enforce model tier

### 4. Cost-Conscious

**Principle**: Optimize for solo developer budgets ($2 session, $10 daily).

**Application**:
- Sprint 36: Hard budget limits (non-negotiable)
- Sprint 38: Hybrid AI (Ollama for simple tasks)
- All modules: Track costs, warn at 80%

### 5. Manual Control > Black Box ML

**Principle**: CEO must understand and control autonomy behavior.

**Application**:
- Sprint 37: Deterministic fix patterns (not ML-based)
- Sprint 40: Manual pattern updates (not adaptive learning)
- All modules: Explainable decisions, logged reasoning

### 6. Incremental Value

**Principle**: Each sprint delivers standalone value, not just foundation.

**Application**:
- Sprint 35: Usable checkpoint/resume (30-min sessions)
- Sprint 36: Usable budget control (cost predictability)
- Sprint 37: Usable auto-fix (70-90% success rate)
- Not: "Wait until Sprint 40 for value"

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-02-22 | 1.0.0 | Initial design document structure | @pm |

---

## Related Documents

### SDLC Framework

- **Stage 00 - Foundation**: Problem statement, business case
- **Stage 01 - Planning**: Sprint plans (35-40)
- **Stage 02 - Design**: This directory (design specs, ADRs)
- **Stage 03 - Integration**: Integration specs, API contracts
- **Stage 04 - Build**: Implementation (code)
- **Stage 06 - Test**: Test scenarios, E2E tests

### External References

- **MTS Framework 6.1.1**: `docs/SDLC-Framework/`
- **ADRs**: `docs/02-design/01-ADRs/` and `docs/02-design/approved/`
- **Sprint Plans**: `docs/01-planning/sprint-35-plan.md` through `sprint-40-plan.md`

---

**Maintained By**: @pm + @architect
**Last Updated**: 2026-02-22
**Status**: ACTIVE - Living document

---

*Autonomy Epic - Design Index v1.0.0*
*EndiorBot SDLC Framework 6.1.1*
