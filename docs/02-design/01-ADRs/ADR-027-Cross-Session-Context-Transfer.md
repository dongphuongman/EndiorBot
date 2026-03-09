# ADR-027: Cross-Session Context Transfer

**Status**: ACCEPTED
**Date**: 2026-03-08
**Sprint**: 96
**Author**: @coder (AI)
**Reviewers**: CTO (8.5/10 APPROVED), CPO (APPROVED)

## Context

Sprint 95 delivered multi-agent routing (GoalDecomposer, SessionRelay, MultiAgentDispatcher), but context is ephemeral — each session starts from scratch. SessionRelay propagates context between agents within a single goal, but when a session ends, all accumulated knowledge is lost.

Sprint 97 (T3 Autonomy) requires 120min+ sessions with $10 budget and 95% context retention across sessions. Sprint 96 bridges this gap.

## Decision

### AD-1: Module Location — `src/context/transfer/`

Place cross-session transfer logic as a sub-module of `src/context/` (which already owns anchors, budget, spec snapshots, and git context). Not in `src/sessions/` (which focuses on session lifecycle).

### AD-2: ADR-002 Compliance

`src/context/transfer/types.ts` imports ZERO modules from `src/`. All types are self-contained with primitives and string literal unions.

### AD-3: 4-Dimensional Quality Scoring

| Dimension | Weight | Signal |
|-----------|--------|--------|
| Relevance | 0.35 | Tag overlap + SDLC stage proximity + goal keyword overlap |
| Recency | 0.25 | Exponential decay (half-life: 4-24h per type) |
| Confidence | 0.25 | Model tier + task success + quality gate pass |
| Completeness | 0.15 | Content length vs minimum + truncation detection |

Composite = weighted sum (always 0-1). Mirrors RoutingConfidenceCalculator pattern.

### AD-4: Context Selection Budget — 600 Tokens

CTO F1 resolution: maxInjectionTokens = 600. Shares 2K total with AnchorBudget's 800 tokens. Total: 800 + 600 = 1,400 < 2,000 (CLAUDE.md invariant).

### AD-5: Separate Quality Gate

ContextQualityGate is separate from QualityGatesEvaluator (different domain: knowledge retention vs model selection). Thresholds per type: decision=0.7, architecture=0.7, goal_result=0.6, blocker_resolution=0.6, error_pattern=0.5, task_output=0.5.

### AD-6: Storage — `~/.endiorbot/context-transfer/{projectId}/`

Separate from session files to avoid bloat. Per-project directories. JSON files per entry. Expiry: 7 days (task_output), 30 days (decision/architecture).

### AD-7: SessionRelay Integration — Compose, Don't Modify

Extract from completed relay via `summarizeForHandoff()`. Do NOT modify SessionRelay. MultiAgentDispatcher calls post-goal hook (fire-and-forget with `.catch()`).

## Consequences

- Cross-session context survives session restart
- Quality gates prevent stale/degraded context pollution
- 600-token budget ensures no CLAUDE.md invariant violation
- T3 can build on top (120min, $10, 95% retention target)
- Backward compatible — all existing 5,994 tests pass

## References

- Sprint 96 Plan: CURRENT-SPRINT.md
- ADR-002: Zero Runtime Coupling
- CLAUDE.md: 2K Token Budget Invariant
- AUTONOMY_GATE_CONFIG.C: 120 min, $10.00 (T3 target)
