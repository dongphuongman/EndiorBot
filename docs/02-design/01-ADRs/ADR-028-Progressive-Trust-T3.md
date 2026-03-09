# ADR-028: Progressive Trust T3

**Status**: ACCEPTED
**Date**: 2026-03-09
**Sprint**: 97
**Author**: @coder (AI)
**Reviewers**: CTO (8.5/10 APPROVED), CPO (APPROVED)

## Context

Sprint 96 delivered cross-session context transfer with quality gates (4-dim scoring, 600-token budget, quality gate filtering). However, context lifecycle is manual — no automatic injection at session start, no mid-session refresh, no retention tracking.

Sprint 97 extends to T3 Autonomy: 120-minute sessions with $10 budget and ≥95% context retention across sessions. This requires automated context lifecycle management.

## Decision

### AD-1: T3 Gate Configuration — Gate C

DEFAULT_T3_CONFIG placed in `src/autonomy/types.ts` (same file as DEFAULT_T2_CONFIG, CTO C4: no new imports). Aligned with AUTONOMY_GATE_CONFIG.C: 120min timeout, $10 cost limit, 6 agents, 4 parallel tracks, mixed strategy.

### AD-2: Context Injection — Before First Task

ContextInjector calls ContextSelector.selectForSession() at session start, builds injection payload, prevents double-injection via session ID guard. Checkpoint save/restore for crash recovery.

### AD-3: Retention Tracking — ≥95% Target

RetentionTracker measures per-session retention rate using CTO F2 formula: `selectedTokens / gatedTokens` (not totalAvailableTokens). This makes ≥95% achievable because quality gate filters stale entries first. Three levels: pass (≥95%), warning (≥90%), critical (<80%).

### AD-4: Mid-Session Refresh — Dual Trigger

ContextLifecycleManager triggers refresh every 30 turns OR 30 minutes, whichever comes first. CTO F3: Swap threshold ≥0.1 composite improvement required to prevent context thrashing. Minimum refresh interval: 5 minutes.

### AD-5: Additive Hooks — No runLoop() Restructure

CTO F5: Integration with AutonomousSessionManager.runLoop() is additive:
1. **Before loop**: inject prior context via onSessionStart()
2. **Inside loop**: check shouldRefresh() + refreshContext() + incrementTurn()
3. **After loop**: extract context via onSessionEnd()

setContextLifecycle() is optional — backward compatible without lifecycle set.

### AD-6: Checkpoint Integration — partialResults

CTO F1: Context checkpoint stored in `ExecutionContext.partialResults["contextTransfer"]` (existing Record<string, unknown>). No modification to Sprint 69-71 checkpoint schema.

## Consequences

- 120-minute autonomous sessions with automatic context management
- ≥95% context retention achievable via gated retention formula
- Mid-session refresh prevents context staleness in long sessions
- Backward compatible — all existing 6,079 tests pass
- Crash recovery via checkpoint save/restore

## References

- Sprint 97 Plan: sprint-97-progressive-trust-t3.md
- ADR-027: Cross-Session Context Transfer (Sprint 96)
- AUTONOMY_GATE_CONFIG.C: 120 min, $10.00
- CLAUDE.md: 2K Token Budget Invariant
