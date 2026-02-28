# Sprint 41 Detailed Plan - Fix Logging + Pattern Review

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Sprint 38-46 Replan)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 40 Complete (Parallel Execution validated)
- ADR-011 Approved (Fix Logging Architecture) — to be written before Sprint 41 Day 1
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 41 implements **Fix Logging + Pattern Review** — structured logging of all fix attempts for manual pattern analysis, without adaptive ML.

### Vision: Learn from Fixes (Manual Pattern Updates)

```
Current (Sprint 40):  Fixes applied, no learning → same errors repeated
Sprint 41 Target:     Fixes logged → weekly review → manual pattern updates
Future (Post-41):     Pattern library grows → fix success rate improves
```

### Why Fix Logging (No ML)?

> **CPO/CTO Requirement**: "Log fixes in structured format. Weekly review CLI. NO adaptive ML. Manual pattern updates only."

Scope:
- **In Scope**: fix-log.json (append-only, structured), weekly review CLI, pattern analysis, manual pattern import/export
- **Out of Scope**: Adaptive ML, auto-learning, unsupervised pattern discovery, model fine-tuning

---

## Sprint Goal

**Implement structured fix logging with weekly review CLI for manual pattern analysis; no ML.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 40** | Parallel Execution validated | PLANNED | Sprint 41 start |
| **ADR-011** | Fix Logging Architecture | DRAFT | Day 1 |
| **No ML libraries** | No TensorFlow, PyTorch, etc. | ✅ DESIGN | Architecture |

### Validation Criteria

- [ ] fix-log.json captures all fixes (error, fix applied, outcome)
- [ ] Weekly review CLI analyzes patterns
- [ ] Manual pattern import/export works
- [ ] No ML libraries in dependencies
- [ ] Integration: fix logged → review shows pattern

---

## Sprint 41 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Fix Logger + Schema | ADR-011, fix-logging/types.ts, schema.ts, fix-log-writer.ts |
| **Week 2** | Review CLI + Pattern Manager | review-cli, pattern-analyzer, pattern-manager, endiorbot fixes --week/--patterns |

**Duration**: 10 working days (2 weeks from Sprint 40 close)

---

## Week 1: Fix Logger + Schema (Day 1-5)

### Day 1: ADR-011 + Fix Log Schema

**Goal**: Formalize ADR-011 and define fix log schema.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create ADR-011 draft | P0 | ADR-011-Fix-Logging-Architecture.md | ~450 |
| Create src/agents/fix-logging/types.ts | P0 | FixLogEntry, FixOutcome, etc. | ~250 |
| Create src/agents/fix-logging/schema.ts | P0 | Zod or JSON schema validation | ~200 |
| Create tests/agents/fix-logging/schema.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] ADR-011 defines format, storage path, review process
- [ ] FixLogEntry: id, timestamp, sessionId, trackId?, error{}, fix{}, outcome{}
- [ ] error: type, code, message, file, line, severity
- [ ] fix: patternId, strategy, diff, filesModified[], confidence
- [ ] outcome: success, verified, strikesUsed, escalated, antiCheatViolation
- [ ] No ML-related fields (no embeddings, no training data)
- [ ] Build passes

**Fix Log Entry (example)**:
```typescript
interface FixLogEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  trackId?: string;
  error: { type: 'build'|'lint'|'type'|'test'; code: string; message: string; file: string; line: number; severity: string; };
  fix: { patternId: string; strategy: string; diff?: string; filesModified: string[]; confidence: string; };
  outcome: { success: boolean; verified: boolean; strikesUsed: number; escalated: boolean; antiCheatViolation: boolean; };
}
```

---

### Day 2-3: Fix Log Writer + Integration with Self-Correction

**Goal**: Append-only writer and wire SelfCorrectionEngine to log every fix attempt.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/fix-logging/fix-log-writer.ts | P0 | append(entry), readRecent(n) | ~200 |
| Storage path: ~/.endiorbot/learning/fix-log.json (or fix-log.jsonl) | P0 | Configurable | - |
| Integrate with SelfCorrectionEngine (Sprint 37) | P0 | Log on every fix attempt | ~80 |
| Create tests/agents/fix-logging/fix-log-writer.test.ts | P0 | Unit tests | ~150 |
| Auto-rotation: max entries or max size | P1 | Optional | ~60 |

**Acceptance Criteria**:
- [ ] append(entry) writes to file (append-only)
- [ ] readRecent(n) returns last n entries
- [ ] SelfCorrectionEngine calls fix-logger on fix_attempt (success or fail)
- [ ] Build passes

---

### Day 4-5: Fix Logger Public API

**Goal**: Unified FixLogger API used by self-correction and CLI.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/fix-logging/fix-logger.ts | P0 | logFix(attempt), getStats(), getEntries(filter) | ~250 |
| Session filter, date range filter | P0 | getEntries({ sessionId?, from?, to? }) | - |
| Create tests/agents/fix-logging/fix-logger.test.ts | P0 | Unit tests | ~120 |

**Acceptance Criteria**:
- [ ] logFix(attempt) converts attempt to FixLogEntry and appends
- [ ] getStats() returns { total, byCategory, successRate, escalatedCount }
- [ ] getEntries(filter) returns matching entries
- [ ] Build passes

---

## Week 2: Review CLI + Pattern Manager (Day 6-10)

### Day 6-7: Weekly Review CLI

**Goal**: endiorbot fixes --week, --patterns, --export csv|json.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add endiorbot fixes --week | P0 | Weekly summary (last 7 days) | ~150 |
| Add endiorbot fixes --patterns | P0 | Recurring issues (group by error code/pattern) | ~200 |
| Add endiorbot fixes --export csv | P0 | CSV export for spreadsheet | ~80 |
| Add endiorbot fixes --export json | P0 | JSON export | ~40 |
| Add --session to filter current session | P1 | Optional filter | ~40 |
| Create tests/cli/commands/fixes.test.ts | P0 | CLI tests (extend existing if any) | ~120 |

**Acceptance Criteria**:
- [ ] --week shows: total fixes, success rate, top error codes, top patterns
- [ ] --patterns shows: error code → count, patternId → count, suggested focus areas
- [ ] --export csv produces valid CSV
- [ ] --export json produces valid JSON array
- [ ] Build passes

---

### Day 8-9: Pattern Manager (Manual)

**Goal**: Import/export pattern library; CEO can add patterns manually.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/fix-logging/pattern-manager.ts | P0 | loadPatterns(), savePatterns(), addPattern() | ~200 |
| Pattern format: { id, description, errorCode, strategy, confidence } | P0 | types | - |
| Storage: ~/.endiorbot/learning/patterns.json | P0 | Optional file | - |
| CLI: endiorbot fixes patterns list | P1 | List loaded patterns | ~60 |
| CLI: endiorbot fixes patterns add (interactive or file) | P1 | Add pattern | ~80 |
| Create tests/agents/fix-logging/pattern-manager.test.ts | P0 | Unit tests | ~100 |

**Acceptance Criteria**:
- [ ] Patterns loaded from file if present
- [ ] addPattern(pattern) appends and persists
- [ ] No ML: patterns are explicit rules only
- [ ] Build passes

---

### Day 10: Integration + E2E + G-Sprint-41

**Goal**: End-to-end: apply fix → log entry → review shows pattern.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: run self-correction → fix applied → fix-log has entry | P0 | tests/e2e/fix-logging-e2e.test.ts | ~120 |
| E2E: endiorbot fixes --week shows entry | P0 | Same or separate | ~80 |
| G-Sprint-41 checklist | P0 | All criteria below | - |

**Acceptance Criteria**:
- [ ] All Sprint 41 acceptance criteria met
- [ ] Build passes, lint clean
- [ ] No ML dependencies in package.json

---

## Files Created (Sprint 41)

| File | Est. LOC | Purpose |
|------|----------|---------|
| docs/02-design/01-ADRs/ADR-011-Fix-Logging-Architecture.md | ~450 | ADR |
| src/agents/fix-logging/types.ts | ~250 | Types |
| src/agents/fix-logging/schema.ts | ~200 | Validation |
| src/agents/fix-logging/fix-log-writer.ts | ~200 | Append writer |
| src/agents/fix-logging/fix-logger.ts | ~250 | Public API |
| src/agents/fix-logging/pattern-manager.ts | ~200 | Manual patterns |
| tests/agents/fix-logging/*.test.ts | ~520 | Unit tests |
| tests/e2e/fix-logging-e2e.test.ts | ~200 | E2E |
| **Total** | **~1,200** | |

---

## Modified Files (Sprint 41)

| File | Changes |
|------|---------|
| src/self-correction/self-correction-engine.ts | Call FixLogger on each fix attempt |
| src/cli/commands/fix.ts or fix-stats.ts | Extend with fixes --week, --patterns, --export |
| src/cli/index.ts | Register fixes subcommands if new |

---

## Success Criteria (Sprint 41)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| fix-log captures all fixes | 100% | E2E |
| Weekly CLI works | 100% | CLI tests |
| Pattern import/export | 100% | Unit tests |
| No ML deps | 0 | package.json |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 40 complete | PLANNED | Parallel Execution |
| ADR-011 | DRAFT | Write before Day 1 |
| SelfCorrectionEngine | ✅ | Sprint 37 |
| FixLogger (Sprint 37) | ✅ | May exist; align with this schema |

---

## Next Sprint Preview (Sprint 42)

**Sprint Goal**: Desktop Foundation (ClawX Port)

**Key Deliverables**:
- Electron main + preload + renderer
- React 19 app shell, dashboard, chat, checkpoint viewer
- IPC to EndiorBot core (no gateway yet)

**Prerequisite**: Sprint 41 PASS (Fix Logging validated)

---

## Approval Checklist (G-Sprint-41)

- [ ] Build passes
- [ ] All tests pass (~80 new)
- [ ] fix-log.json format documented
- [ ] Weekly review CLI works
- [ ] Manual pattern manager works
- [ ] No ML libraries added
- [ ] SelfCorrectionEngine logs to fix-log

---

**Last Updated**: 2026-02-22
**Sprint Status**: DRAFT - Sprint 38-46 Replan
**Blocking**: Sprint 40 close + ADR-011

---

*Sprint 41 Plan - Fix Logging + Pattern Review*
*EndiorBot - Learn from fixes, no ML*
*SDLC Framework 6.1.1*
