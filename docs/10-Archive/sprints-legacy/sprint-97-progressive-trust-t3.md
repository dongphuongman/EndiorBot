---
spec_id: SPEC-04BUILD-SPRINT97
title: "Sprint 97: Progressive Trust T3 — 120min Autonomous Sessions"
spec_version: "1.0.0"
status: in_progress
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-08
last_updated: 2026-03-08
related_adrs: ["ADR-002", "ADR-027", "ADR-028"]
---

# Sprint 97: Progressive Trust T3 — 120min Autonomous Sessions

**Date:** 2026-03-08
**Gate:** G-Sprint
**Authority:** Sprint 96 CURRENT-SPRINT + ADR-027 + AUTONOMY_GATE_CONFIG.C
**Preceding sprint:** Sprint 96 (Cross-Session Context Transfer + Quality Gates)
**Est. effort:** ~6h
**Est. tests:** ~65

---

## Goal

Deliver **Progressive Trust Tier 3** — 120-minute autonomous sessions with $10 budget and **≥95% cross-session context retention**. Wire Sprint 96's context transfer infrastructure (scorer, gate, selector, extractor, store) into the autonomous session lifecycle: inject prior context at session start, extract context at session end, refresh mid-session for long runs, and track retention rate against the 95% target. Create T3-specific multi-agent configuration aligned with Gate C limits.

---

## Depends On

- Sprint 96 (Cross-Session Context Transfer) — ContextSelector, SessionContextExtractor, ContextTransferStore, ContextQualityScorer, ContextQualityGate
- Sprint 95 (Progressive Autonomy T2) — MultiAgentDispatcher, GoalDecomposer, SessionRelay, ResponseAggregator
- Sprint 72 (Autonomous Session Manager) — AutonomousSessionManager, SessionBudget, ModelSelector, AUTONOMY_GATE_CONFIG
- Sprint 69-71 (Session Resilience) — StateMachine, CheckpointScheduler, RecoveryEngine, FailureClassifier
- Sprint 65 (Context Anchoring) — AnchorBudget (800 tokens), maxTotalTokens=2000

---

## Scope

| In Scope | Out of Scope (deferred) |
|----------|------------------------|
| T3 config — DEFAULT_T3_CONFIG aligned with Gate C (120min, $10) | LLM-based context summarization (would improve retention but adds cost) |
| ContextInjector — inject prior session context at session start | Per-agent quality profiles (tier-specific scoring) |
| ContextLifecycleManager — coordinate inject/extract/refresh lifecycle | Context transfer UI dashboard |
| RetentionTracker — measure and validate ≥95% retention rate | Dynamic budget allocation between anchor + transfer |
| Mid-session context refresh — every 30 turns or 30 min for 2h sessions | Real-time context streaming between concurrent sessions |
| Checkpoint context — save/restore context selection in checkpoints | Cross-project context sharing |
| AutonomousSessionManager T3 integration — wire lifecycle into runLoop() | Opus time increase (keep 20min cap for cost control) |
| ADR-028 — Progressive Trust T3 architecture decision record | |

---

## Architecture

### Module Structure

```
autonomy/types.ts                        ← +DEFAULT_T3_CONFIG (Gate C aligned)
        │
context/transfer/context-injector.ts     ← NEW: inject prior context at session start
        │
context/transfer/context-lifecycle.ts    ← NEW: orchestrate inject → refresh → extract
        │
context/transfer/retention-tracker.ts    ← NEW: measure + validate ≥95% retention
        │
sessions/autonomous/manager.ts           ← MODIFIED: wire ContextLifecycleManager
sessions/autonomous/types.ts             ← MODIFIED: T3SessionConfig type
        │
context/transfer/index.ts               ← MODIFIED: barrel exports
context/index.ts                         ← MODIFIED: barrel re-exports
```

### Architecture Decisions

| # | Decision | Resolution |
|---|----------|-----------|
| AD-1 | T3 config source | `DEFAULT_T3_CONFIG` in `src/autonomy/types.ts` — aligned with `AUTONOMY_GATE_CONFIG.C` (120min, $10) |
| AD-2 | Context injection point | `ContextInjector.injectAtSessionStart()` called from `AutonomousSessionManager.runLoop()` before first task |
| AD-3 | Context extraction point | Reuse Sprint 96 `ContextExtractHook` on dispatcher + add session-end extraction via lifecycle manager |
| AD-4 | Mid-session refresh | Every 30 turns OR 30 minutes (whichever first) — re-score and swap stale context |
| AD-5 | Retention measurement | `RetentionTracker` — selected tokens / total available tokens per session, aggregate across sessions |
| AD-6 | Checkpoint integration | Save `ContextSelectionResult` in checkpoint state; restore on recovery |
| AD-7 | Opus allocation | Keep 20min/$3 Opus cap unchanged — T3 extends duration/budget but Opus remains scarce resource |
| AD-8 | ADR-002 compliance | New types in existing `src/context/transfer/types.ts` (ZERO imports from src/) |

### T3 Config (AD-1)

```typescript
// src/autonomy/types.ts
export const DEFAULT_T3_CONFIG: MultiAgentConfig = {
  maxAgents: 6,                        // T2: 4 → T3: 6 (longer sessions = more agents)
  maxParallelTracks: 4,                // T2: 3 → T3: 4
  timeoutMs: 2 * 60 * 60 * 1000,      // Gate C: 120 minutes
  costLimitUsd: 10.0,                  // Gate C: $10.00
  perSubtaskTimeoutMs: 2 * 60 * 1000, // T2: 60s → T3: 120s (complex tasks)
  defaultStrategy: "mixed",            // T2: sequential → T3: mixed (leverage parallelism)
};
```

### Context Lifecycle Flow (AD-2, AD-3, AD-4)

```
Session Start
    │
    ├──→ ContextInjector.injectAtSessionStart(projectId, goal, tags, stage)
    │        │
    │        ├── ContextSelector.selectForSession() → 600-token budget
    │        ├── buildInjectionPayload() → markdown sections
    │        └── RetentionTracker.recordInjection(selectionResult)
    │
    ├──→ [Task Loop — up to 120min]
    │        │
    │        ├── Every 30 turns / 30 min:
    │        │     └── ContextLifecycleManager.refreshContext()
    │        │           ├── Re-score existing injected context
    │        │           ├── Check for new high-quality context
    │        │           └── Swap stale → fresh (within 600-token budget)
    │        │
    │        └── Post-goal hook (Sprint 96):
    │              └── SessionContextExtractor → ContextTransferStore.save()
    │
    └──→ Session End
         │
         ├── ContextLifecycleManager.extractOnSessionEnd(session)
         │     ├── Extract remaining context from final state
         │     └── ContextTransferStore.saveBatch()
         │
         └── RetentionTracker.recordSessionEnd(retentionRate)
               └── Validate ≥95% target
```

### Retention Rate Calculation (AD-5)

```
retentionRate = selectedTokens / totalAvailableTokens

Where:
- selectedTokens = sum of tokenCount for all contexts that passed quality gate AND fit in budget
- totalAvailableTokens = sum of tokenCount for all non-expired contexts in project

Target: ≥ 0.95 (95%)
Warning: < 0.90 (90%)
Critical: < 0.80 (80%)
```

**Improving retention when below target:**
1. Lower quality gate thresholds (lenient mode)
2. Increase context budget (if anchor budget allows)
3. Summarize dropped contexts (future: LLM summarization)

### Checkpoint Context (AD-6)

```typescript
// Added to CheckpointState
interface ContextCheckpointState {
  injectedContextIds: string[];      // IDs of currently injected contexts
  selectionResult: ContextSelectionResult; // Last selection for restore
  retentionRate: number;             // Current retention rate
  refreshCount: number;              // How many mid-session refreshes occurred
  lastRefreshAt: string;             // ISO timestamp of last refresh
}
```

---

## Key Deliverables

### New Files (4)

| # | File | Description | Est. Lines |
|---|------|-------------|------------|
| 1 | `src/context/transfer/context-injector.ts` | Inject prior session context at session start; uses ContextSelector + builds payload | ~120 |
| 2 | `src/context/transfer/context-lifecycle.ts` | Orchestrate inject → refresh → extract across session lifecycle | ~180 |
| 3 | `src/context/transfer/retention-tracker.ts` | Track per-session retention rate, validate ≥95% target, aggregate metrics | ~130 |
| 4 | `docs/02-design/01-ADRs/ADR-028-Progressive-Trust-T3.md` | Architecture decision record for T3 autonomy | ~80 |

### Modified Files (5)

| # | File | Changes |
|---|------|---------|
| 5 | `src/autonomy/types.ts` | +DEFAULT_T3_CONFIG (Gate C: 120min, $10, 6 agents, mixed strategy) |
| 6 | `src/sessions/autonomous/manager.ts` | Wire ContextLifecycleManager into runLoop(): inject at start, refresh mid-session, extract at end |
| 7 | `src/sessions/autonomous/types.ts` | +T3SessionConfig type with contextLifecycle options |
| 8 | `src/context/transfer/index.ts` | Barrel exports for new modules |
| 9 | `src/context/index.ts` | Barrel re-exports for new modules |

---

## Test Plan (~65 tests)

### T3 Config (5 tests)

| Test | Description |
|------|-------------|
| DEFAULT_T3_CONFIG alignment | Gate C: 120min, $10.00 |
| DEFAULT_T3_CONFIG agents | maxAgents=6, maxParallelTracks=4 |
| DEFAULT_T3_CONFIG strategy | defaultStrategy="mixed" |
| DEFAULT_T3_CONFIG perSubtask | perSubtaskTimeoutMs=120_000 |
| T3 vs T2 comparison | T3 > T2 on all limits |

### ContextInjector (12 tests)

| Test | Description |
|------|-------------|
| injectAtSessionStart — with prior context | Returns injection payload within 600 tokens |
| injectAtSessionStart — empty project | Returns empty string, retentionRate=0 |
| injectAtSessionStart — all contexts expired | Returns empty string |
| injectAtSessionStart — budget exactly 600 | Fills to 600, no overflow |
| injectAtSessionStart — records retention | RetentionTracker receives selectionResult |
| injectAtSessionStart — with goal/tags/stage | Passes params to ContextSelector |
| injectAtSessionStart — respects quality gate | Low-quality contexts rejected |
| getInjectedContextIds | Returns IDs of injected contexts |
| getInjectionResult | Returns full ContextSelectionResult |
| re-injection prevention | Cannot inject twice in same session |
| cleanup after extraction | Resets state for next session |
| singleton | getContextInjector() consistency |

### ContextLifecycleManager (18 tests)

| Test | Description |
|------|-------------|
| onSessionStart — injects context | Calls ContextInjector.injectAtSessionStart() |
| onSessionStart — no prior context | Handles gracefully, empty injection |
| onSessionEnd — extracts context | Calls SessionContextExtractor, saves to store |
| onSessionEnd — skip on empty session | No extraction if no completed goals |
| onSessionEnd — validates retention | RetentionTracker.validateRetention() called |
| refreshContext — triggers on turn count | Refreshes at turn 30, 60, 90 |
| refreshContext — triggers on time | Refreshes at 30min, 60min, 90min |
| refreshContext — swaps stale for fresh | Re-scores, replaces stale context |
| refreshContext — no swap if all fresh | Keeps existing context |
| refreshContext — respects budget | Refresh stays within 600 tokens |
| shouldRefresh — turn-based trigger | Returns true at multiples of 30 |
| shouldRefresh — time-based trigger | Returns true after 30 min |
| shouldRefresh — minimum interval | No refresh within 5 min of last |
| getLifecycleStatus | Returns injection/extraction/refresh state |
| checkpoint — save state | Serializes context state for checkpoint |
| checkpoint — restore state | Restores injected context from checkpoint |
| checkpoint — restore after crash | Recovery re-injects context |
| singleton | getContextLifecycleManager() consistency |

### RetentionTracker (14 tests)

| Test | Description |
|------|-------------|
| recordInjection — calculates rate | retentionRate = selected / total tokens |
| recordInjection — 100% retention | All contexts selected |
| recordInjection — partial retention | Some contexts dropped (budget/quality) |
| recordInjection — zero contexts | retentionRate = 0 |
| validateRetention — passes at 95% | Returns pass=true |
| validateRetention — fails below 95% | Returns pass=false with warning |
| validateRetention — critical at 80% | Returns critical level |
| getSessionMetrics — current session | Returns current retention, refresh count |
| getAggregateMetrics — across sessions | Returns average retention across N sessions |
| getAggregateMetrics — empty | Returns defaults for no history |
| recordRefresh — updates rate | Mid-session refresh updates retention |
| recordSessionEnd — persists history | Saves session metrics to store |
| retentionHistory — last N sessions | Returns retention trend |
| singleton | getRetentionTracker() consistency |

### Integration (11 tests)

| Test | Description |
|------|-------------|
| AutonomousSessionManager — T3 gate | Uses Gate C limits (120min, $10) |
| AutonomousSessionManager — inject at start | Context injected before first task |
| AutonomousSessionManager — refresh at 30 turns | Mid-session refresh triggered |
| AutonomousSessionManager — extract at end | Context extracted on session completion |
| AutonomousSessionManager — checkpoint includes context | Context state in checkpoint |
| AutonomousSessionManager — restore context | Context restored from checkpoint |
| MultiAgentDispatcher — T3 config | Uses DEFAULT_T3_CONFIG for Gate C |
| Retention ≥95% golden path | Full session with high retention |
| Retention warning path | Session with < 90% retention logs warning |
| Budget exhaustion — context preserved | Context extracted even on budget stop |
| Time limit — context preserved | Context extracted even on timeout |

### Types (5 tests)

| Test | Description |
|------|-------------|
| T3SessionConfig construction | All required fields |
| ContextCheckpointState construction | injectedContextIds, selectionResult, retentionRate |
| RetentionMetrics construction | sessionId, rate, target, pass |
| RetentionLevel enum | pass, warning, critical values |
| ADR-002 compliance | New types import ZERO from src/ |

---

## Implementation Phases

| Phase | Deliverable | Tests |
|-------|-------------|-------|
| Phase 1 | T3 Config + Types | 10 |
| Phase 2 | ContextInjector | 12 |
| Phase 3 | RetentionTracker | 14 |
| Phase 4 | ContextLifecycleManager | 18 |
| Phase 5 | AutonomousSessionManager integration | 11 |
| Phase 6 | Barrel exports + ADR-028 | — |
| Phase 7 | Full suite verification | — |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Retention < 95% with 600-token budget | Monitor in tests; future: LLM summarization or dynamic budget |
| Mid-session refresh disrupts context coherence | Only swap if new context scores significantly higher (≥0.1 improvement) |
| Checkpoint size growth from context state | Context IDs only (not full content) in checkpoint; content stays in store |
| 120-min sessions exceed Opus budget ($3 cap) | Keep 20min/$3 Opus cap; ModelSelector auto-downgrades |
| Recovery from checkpoint loses context | ContextLifecycleManager.restoreFromCheckpoint() re-injects |

---

## Milestone

| Sprint | Capability |
|--------|-----------|
| 82-86 | Notification Bridge + Remote Shell + Permission Approval |
| 87-88 | Session Intelligence + Evaluator |
| 89-91 | Agent Teams (Files, Telegram, Monitoring) |
| 92 | Unified App Launcher (PID + lock + crash recovery) |
| 93 | Gateway-Centric Unified App (single `serve` command) |
| 94 | Canonical Types + Channel Policy Engine (abstraction layer) |
| 95 | Progressive Autonomy T2 — Multi-Agent Routing (intelligence layer) |
| 96 | Cross-Session Context Transfer + Quality Gates (persistence layer) |
| **97** | **Progressive Trust T3 — 120min Autonomous Sessions (integration layer)** |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 98 | TBD — Context summarization (LLM-based) or T3 hardening |
