---
spec_id: SPEC-04BUILD-SPRINT87
title: "Sprint 87: Brain L4 + Context Anchoring in Bridge"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-025"]
---

# Sprint 87: Brain L4 + Context Anchoring in Bridge

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-025 (Launch-time and Turn-time layers)
**Preceding sprint:** Sprint 86 (/send Command + Hook Installer)
**Est. effort:** ~50h
**Est. tests:** ~30
**CTO W2:** Largest sprint in roadmap — consider splitting into 87a/87b if scope creeps during implementation.

---

## Goal

Inject Brain L4 mental models and Context Anchoring data into Bridge sessions. Extends `SessionIntelligenceEnvelope` with two new layers: `brain` (L4 decision heuristics) and `context` (sprint goals, vision, spec snapshot reference). After this sprint, every launched agent session carries persistent intelligence from EndiorBot's Brain.

**Key principle:** Agents launched via Bridge are never context-blind — they receive the same decision heuristics CEO uses.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `BrainEnvelope` (L4 mental models, max 2K tokens) | Evaluator pipeline — Sprint 88 |
| `ContextEnvelope` (sprint goals, vision, spec snapshot ref) | Agent Teams — Sprint 89 |
| Brain L4 injection at launch-time | Brain L2 pattern matching |
| Context refresh on `/send` (every 10th turn) | Full vibecoding UI dashboard |
| Spec Snapshot reference in ContextEnvelope | Real-time streaming output |
| Refresh triggers: gate change, stage transition | Brain L1 event injection (too noisy) |
| Envelope builder (`envelope-builder.ts`) | Brain L3 structure maps |

---

## Architecture

### SessionIntelligenceEnvelope Extension

```typescript
interface SessionIntelligenceEnvelope {
  persona: PersonaEnvelope;   // Sprint 84 — immutable, launch-time
  brain?: BrainEnvelope;      // Sprint 87 — L4 mental models
  context?: ContextEnvelope;  // Sprint 87 — sprint goals, vision, snapshot
  // evaluator — Sprint 88
}
```

### Injection Timing

| Layer | When Injected | Mutability | Token Budget |
|-------|--------------|------------|--------------|
| `persona` | Session creation | Immutable | No cap (SOUL template) |
| `brain` | Session creation | Immutable per session | Max 2K tokens |
| `context` | Session creation + refresh | Mutable | Max 2K tokens |

### Context Refresh Triggers

```
Refresh ContextEnvelope when:
  - Every 10th /send turn
  - Gate status changes (G-Sprint → G-Review, etc.)
  - SDLC stage transitions detected in active.json
```

### Envelope Builder Flow

```
brain = BrainLoader.loadL4MentalModels()   → BrainEnvelope (≤2K tokens)
context = ContextBuilder.build(active.json) → ContextEnvelope
envelope = EnvelopeBuilder.build({ persona, brain, context })
→ inject at launch (Strategy A/B as in Sprint 84)
```

---

## Key Deliverables

1. **`BrainEnvelope` type** in `src/bridge/intelligence/envelope.ts` — L4 mental models array, token count, source path, hash.
2. **`ContextEnvelope` type** in `src/bridge/intelligence/envelope.ts` — sprint name, goals array, blockers array, vision summary, spec snapshot reference (path + hash).
3. **`src/bridge/intelligence/brain-loader.ts`** — Loads Brain L4 from `~/.endiorbot/brain/L4-mental-models.md`; trims to 2K tokens; returns `BrainEnvelope` with SHA256 hash.
4. **`src/bridge/intelligence/context-builder.ts`** — Reads `~/.endiorbot/active.json` and latest spec snapshot; composes `ContextEnvelope`; enforces 2K token cap.
5. **`src/bridge/intelligence/envelope-builder.ts`** — Assembles complete `SessionIntelligenceEnvelope` from persona + brain + context; used by `agent-launcher.ts` at session creation.
6. **Refresh hook in `/send` handler** — `turn-context.ts` triggers `ContextEnvelope` refresh on every 10th turn, gate change, and stage transition; updates live session record in `session-registry.ts`.

---

## Test Plan (~30 tests)

| Test Area | Cases |
|-----------|-------|
| BrainEnvelope serialization | Valid L4 file, missing file uses empty fallback, hash computed correctly |
| Brain token budget | Content trimmed when >2K tokens, trim preserves whole lines |
| ContextEnvelope composition | Sprint name, goals, blockers populated from active.json |
| Context spec snapshot | Snapshot path and hash included when file exists, omitted when absent |
| Context token cap | Combined goals + blockers + vision truncated at 2K tokens |
| Envelope builder integration | All 3 layers assembled, missing optional layers tolerated |
| Refresh triggers | Counter increments per /send, refresh fires at turn 10, 20, 30 |
| Gate-change refresh | Simulated gate change triggers context rebuild |
| Stage-transition refresh | Stage change in active.json detected and context rebuilt |
| Launch injection | Envelope serialized and appended to agent prompt correctly |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline (ADR-025 Post-turn) |
| 89 | Unified App Launcher (infrastructure) |
| 90 | Agent Teams — Files |
