# Sprint 45 Detailed Plan - Brain Architecture

**Version**: 2.0.0 (Option A Resequence)
**Date**: 2026-02-23
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Option A Resequence — Sprint 42 Scope Change)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 44 Complete (Gateway + Desktop Integration validated)
- ADR-006 (Checkpoint State) already references brainVersion, brainDigest
**SDLC**: Framework 6.1.1

> **Note**: Originally Sprint 44 (Brain Architecture). Shifted to Sprint 45 per CEO-approved Option A resequence (2026-02-23).

---

## Executive Summary

Sprint 45 implements **EndiorBot Brain** — a persistent, LLM-agnostic knowledge base per ADR-009 proposal. Brain stores events, patterns, structures, and mental models in an iceberg-style layered model; supports CEO profile and versioning; and integrates with checkpoint provenance (brain digest).

### Vision: Persistent Knowledge

```
Current:  Session-scoped context only; no cross-session memory
Sprint 45: Brain at ~/.endiorbot/brain/ → layers 1–4, CEO profile, versioning
Future:   Checkpoint restore uses brain context; agents query brain
```

Benefits:
- Cross-session learning (patterns, structures)
- CEO coding style and preferences in one place
- Checkpoint provenance: brain digest in CheckpointState (ADR-006)
- No ML in Brain storage — structured data only

---

## Sprint Goal

**Implement Brain storage (~/.endiorbot/brain/) with four layers (events, patterns, structures, mental-models), CEO profile, evolution/versioning, and CLI (brain status, brain export).**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 44** | Gateway + Desktop Integration validated | PLANNED | Sprint 45 start |
| **ADR-009** | Brain Architecture (proposal) | DRAFT | Day 1 approve or reference |
| **ADR-006** | Checkpoint State (brainVersion, brainDigest) | ✅ | Already approved |

---

## Sprint 45 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Brain Storage + Iceberg Layers | types, storage, layers 1–4 |
| **Week 2** | CEO Profile + Evolution | ceo-profile, evolution, CLI, checkpoint digest |

**Duration**: 10 working days (2 weeks from Sprint 44 close)

---

## Week 1: Brain Storage + Iceberg Layers (Day 1-5)

### Day 1: ADR-009 + Brain Types

**Goal**: Formalize Brain architecture and TypeScript interfaces.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create or update ADR-009 (Brain Architecture) | P0 | docs/02-design/01-ADRs/ADR-009-Brain-Architecture.md | ~400 |
| Create src/brain/types.ts | P0 | Brain, BrainLayer, BrainVersion, BrainDigest | ~120 |
| Define layer IDs: events, patterns, structures, mental-models | P0 | types.ts | ~40 |
| Create src/brain/storage.ts | P0 | Base path ~/.endiorbot/brain/, ensureDir, read/write JSON | ~150 |
| Create tests/brain/storage.test.ts | P1 | Path, read/write, version dirs | ~100 |

**Acceptance Criteria**:
- [ ] ADR-009 describes four layers and storage layout
- [ ] BrainVersion = semver or timestamp; BrainDigest = hash of layer contents (or manifest)
- [ ] storage.ts reads/writes under ~/.endiorbot/brain/
- [ ] Build passes

---

### Day 2: Layer 1 — Events

**Goal**: Raw events (session logs, fix attempts) stored in Layer 1.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/layers/events.ts | P0 | EventEntry type, appendEvent, getEvents(since?) | ~150 |
| EventEntry: id, timestamp, type (session_start, fix_attempt, escalation, etc.), payload | P0 | types or events.ts | ~60 |
| Storage: ~/.endiorbot/brain/events.json or events/ (sharded by date) | P0 | storage layout | ~40 |
| Integrate: SelfCorrectionEngine or FixLogger writes to Brain Layer 1 (optional hook) | P1 | integration point | ~60 |
| Create tests/brain/layers/events.test.ts | P1 | append, get, filter | ~100 |

**Acceptance Criteria**:
- [ ] Events can be appended and read back
- [ ] Optional: fix attempts from Sprint 41 flow into Layer 1
- [ ] Build passes

---

### Day 3: Layer 2 — Patterns

**Goal**: Recurring errors, common fixes (from Fix Logging patterns).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/layers/patterns.ts | P0 | PatternEntry type, addPattern, getPatterns, updatePattern | ~150 |
| PatternEntry: id, signature (e.g. error fingerprint), fixHint, count, lastSeen | P0 | types | ~60 |
| Storage: ~/.endiorbot/brain/patterns.json | P0 | storage | ~40 |
| Import from ~/.endiorbot/learning/patterns.json (Sprint 41) if exists | P1 | migration or sync | ~80 |
| Create tests/brain/layers/patterns.test.ts | P1 | add, get, update | ~100 |

**Acceptance Criteria**:
- [ ] Patterns can be added and queried
- [ ] Compatible with Sprint 41 pattern manager (import path or format)
- [ ] Build passes

---

### Day 4: Layer 3 — Structures

**Goal**: Project architecture, module map (static structure).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/layers/structures.ts | P0 | StructureEntry type, setStructure, getStructure | ~120 |
| StructureEntry: projectId, type (module_map, file_tree, etc.), data (JSON), updatedAt | P0 | types | ~60 |
| Storage: ~/.endiorbot/brain/structures.json or by project | P0 | storage | ~60 |
| Optional: ingest from codebase scan (list files, simple module graph) | P2 | scanner.ts | ~100 |
| Create tests/brain/layers/structures.test.ts | P1 | set, get | ~80 |

**Acceptance Criteria**:
- [ ] Structures can be stored and retrieved by project/type
- [ ] Build passes

---

### Day 5: Layer 4 — Mental Models

**Goal**: Decision heuristics (e.g. "prefer X when Y").

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/layers/mental-models.ts | P0 | MentalModelEntry type, setModel, getModels | ~120 |
| MentalModelEntry: id, domain, rule (text or structured), source (ceo_import, derived), updatedAt | P0 | types | ~60 |
| Storage: ~/.endiorbot/brain/mental-models.json | P0 | storage | ~40 |
| Create src/brain/index.ts | P0 | Re-export layers, storage, types; getBrain() facade | ~80 |
| Create tests/brain/layers/mental-models.test.ts | P1 | set, get | ~80 |
| Compute BrainDigest: hash of layer manifests or concatenated content | P0 | brain/digest.ts | ~80 |

**Acceptance Criteria**:
- [ ] All four layers implemented and tested
- [ ] BrainDigest computable for checkpoint provenance (ADR-006)
- [ ] Build passes

---

## Week 2: CEO Profile + Evolution (Day 6-10)

### Day 6-7: CEO Profile

**Goal**: CEO coding style, preferences, conventions in one place.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/ceo-profile.ts | P0 | CEOProfile type: style (indent, quotes), preferences (testing, docs), conventions (naming) | ~150 |
| Storage: ~/.endiorbot/brain/ceo-profile.json | P0 | storage | ~40 |
| loadCEOProfile(), saveCEOProfile() | P0 | ceo-profile.ts | ~80 |
| Optional: merge with mental-models (CEO rules) | P1 | Same file or link | ~40 |
| Create tests/brain/ceo-profile.test.ts | P1 | load, save, default | ~80 |
| Document: how to edit ceo-profile (manual or future CLI) | P1 | docs | ~40 |

**Acceptance Criteria**:
- [ ] CEO profile load/save works
- [ ] Profile can drive style hints (e.g. for code gen) in future sprints
- [ ] Build passes

---

### Day 8: Evolution + Versioning

**Goal**: Brain versioning and migration.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/brain/evolution.ts | P0 | getCurrentVersion(), bumpVersion(), migrate(from, to) | ~150 |
| Version stored in ~/.endiorbot/brain/version.json or manifest | P0 | storage | ~40 |
| Migration: when schema changes, migrate old brain dir to new layout | P1 | evolution.ts | ~100 |
| CheckpointState integration: save brainVersion + brainDigest in checkpoint (ADR-006) | P0 | CheckpointManager or createCheckpoint | ~80 |
| loadBrainContext(version?) for restore: return snapshot of brain at version | P0 | brain/context.ts | ~100 |
| Create tests/brain/evolution.test.ts | P1 | version bump, digest change | ~80 |

**Acceptance Criteria**:
- [ ] Brain has current version and digest
- [ ] Checkpoint creation records brainVersion and brainDigest
- [ ] loadBrainContext(version) returns brain snapshot for that version
- [ ] Build passes

---

### Day 9: CLI (brain status, brain export)

**Goal**: CEO can inspect and export Brain.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| `endiorbot brain status` | P0 | Print version, digest, layer counts (events N, patterns N, etc.) | ~120 |
| `endiorbot brain export [--output path]` | P0 | Export all layers + ceo-profile to JSON or tarball | ~150 |
| `endiorbot brain layers [layerId]` | P1 | List or show layer content (e.g. patterns) | ~100 |
| Wire to CLI router (bin or src/cli) | P0 | brain subcommand | ~60 |
| Create tests/cli/brain.test.ts | P1 | status, export | ~100 |
| Document: ADR-009 and user guide snippet | P1 | doc | ~40 |

**Acceptance Criteria**:
- [ ] `endiorbot brain status` runs and prints version + layer summary
- [ ] `endiorbot brain export` produces export file
- [ ] Build passes

---

### Day 10: Integration + G-Sprint-45

**Goal**: Checkpoint digest E2E; gate validation.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: create checkpoint → checkpoint state includes brainVersion, brainDigest | P0 | Test or manual | — |
| E2E: add pattern → brain digest changes → new checkpoint has new digest | P0 | Test | ~60 |
| G-Sprint-45 checklist | P0 | All criteria below | — |
| Tech debt: src/ceo/ module placeholder (optional) | P2 | README or stub | ~20 |

**Acceptance Criteria**:
- [ ] Checkpoint creation reads current brain version and digest from Brain module
- [ ] Brain digest reflects layer content
- [ ] `endiorbot brain status` and `brain export` work
- [ ] Build and lint pass

---

## Files Created (Sprint 45)

| File / Dir | Est. LOC | Purpose |
|------------|----------|---------|
| docs/02-design/01-ADRs/ADR-009-Brain-Architecture.md | ~400 | ADR |
| src/brain/types.ts | ~160 | Interfaces |
| src/brain/storage.ts | ~150 | File-based storage |
| src/brain/layers/events.ts | ~250 | Layer 1 |
| src/brain/layers/patterns.ts | ~270 | Layer 2 |
| src/brain/layers/structures.ts | ~240 | Layer 3 |
| src/brain/layers/mental-models.ts | ~220 | Layer 4 |
| src/brain/digest.ts | ~80 | BrainDigest |
| src/brain/context.ts | ~100 | loadBrainContext |
| src/brain/ceo-profile.ts | ~270 | CEO profile |
| src/brain/evolution.ts | ~330 | Versioning, migration |
| src/brain/index.ts | ~80 | Facade |
| tests/brain/*.test.ts | ~620 | Tests |
| CLI brain commands | ~430 | status, export, layers |
| **Total** | **~2,000** | |

---

## Modified Files (Sprint 45)

| File | Changes |
|------|---------|
| src/checkpoints/* (or session checkpoint creation) | Write brainVersion, brainDigest to CheckpointState |
| package.json | No new deps (file-based) |
| docs (user guide) | Brain section |

---

## Success Criteria (Sprint 45)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Brain storage at ~/.endiorbot/brain/ | 100% | Manual |
| Four layers readable/writable | 100% | Tests |
| CEO profile load/save | 100% | Tests |
| Checkpoint has brainVersion + brainDigest | 100% | Test |
| `endiorbot brain status` / `brain export` | 100% | CLI tests |
| Build + lint | Pass | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 44 complete | PLANNED | Gateway + Desktop Integration |
| ADR-006 (Checkpoint State) | ✅ | brainVersion, brainDigest |
| Fix Logging / patterns (Sprint 41) | ✅ | Pattern format compatibility |
| No ML | ✅ | Structured data only |

---

## Next Sprint Preview (Sprint 46)

**Sprint Goal**: Full OTT Ecosystem (Zalo + conversational)

**Key Deliverables**:
- Bidirectional channels; Zalo channel
- Conversational escalation (multi-turn via Telegram/Zalo)
- Channel preference config

**Prerequisite**: Sprint 45 PASS (Brain Architecture validated)

---

## Approval Checklist (G-Sprint-45)

- [ ] ADR-009 approved or referenced
- [ ] Brain storage at ~/.endiorbot/brain/ with four layers
- [ ] CEO profile load/save
- [ ] Brain version and digest; checkpoint records both
- [ ] loadBrainContext(version) for restore
- [ ] `endiorbot brain status`, `brain export` (and optional `brain layers`)
- [ ] Build and lint pass

---

**Last Updated**: 2026-02-23
**Sprint Status**: DRAFT — Option A Resequence (shifted from Sprint 44)
**Blocking**: Sprint 44 close

---

*Sprint 45 Plan - Brain Architecture*
*EndiorBot - Persistent Knowledge*
*SDLC Framework 6.1.1*
