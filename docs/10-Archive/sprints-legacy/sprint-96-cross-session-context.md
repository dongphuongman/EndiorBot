---
spec_id: SPEC-04BUILD-SPRINT96
title: "Sprint 96: Cross-Session Context Transfer + Quality Gates"
spec_version: "1.0.0"
status: complete
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-08
last_updated: 2026-03-08
related_adrs: ["ADR-002", "ADR-027"]
---

# Sprint 96: Cross-Session Context Transfer + Quality Gates

**Date:** 2026-03-08
**Gate:** G-Sprint
**Authority:** Sprint 95 CURRENT-SPRINT + ADR-002 + ADR-027 + AUTONOMY_GATE_CONFIG.C
**Preceding sprint:** Sprint 95 (Progressive Autonomy T2 — Multi-Agent Routing)
**Est. effort:** ~5h
**Est. tests:** ~70

---

## Goal

Deliver **quality-scored cross-session context transfer** with a 600-token budget. When a session ends, extract and persist high-value context (decisions, architecture, error patterns) with 4-dimensional quality scoring. On session start, select the best prior context within a strict 600-token cap (sharing the 2K CLAUDE.md invariant with AnchorBudget's 800 tokens). This bridges Sprint 95's ephemeral multi-agent routing to Sprint 97's 120-minute autonomous sessions with 95% context retention.

---

## Depends On

- Sprint 95 (Progressive Autonomy T2) — MultiAgentDispatcher, SessionRelay with `summarizeForHandoff()`.
- Sprint 94 (Canonical Types) — ADR-002 zero-import pattern for `types.ts`.
- Sprint 72 (Autonomous Session Manager) — AUTONOMY_GATE_CONFIG, SessionBudget patterns.
- Sprint 69-71 (Session Resilience) — TokenCounter (`count()`, `willFit()`, `truncateToFit()`).
- AnchorBudget (Sprint 87) — 800-token anchor injection, maxTotalTokens=2000.

---

## Scope

| In Scope | Out of Scope (deferred) |
|----------|------------------------|
| TransferableContext types (ADR-002 compliant) | LLM-based context summarization → Sprint 97 |
| 4-dimensional quality scoring (relevance, recency, confidence, completeness) | Per-agent quality profiles → Sprint 97+ |
| Quality gate with per-type thresholds | UI dashboard for context retention → Sprint 97+ |
| File-based context store (`~/.endiorbot/context-transfer/`) | Database-backed store → future |
| SessionContextExtractor via `summarizeForHandoff()` | Real-time context streaming → T3+ |
| ContextSelector with 600-token budget (CTO F1) | Dynamic budget allocation → Sprint 97 |
| MultiAgentDispatcher post-goal hook (fire-and-forget) | Pre-goal context injection wiring → Sprint 97 |

---

## Review Synthesis

**CTO Plan 8.5/10 APPROVED → Code Review 9/10 APPROVED**
**CPO: APPROVED unconditionally**

### CTO Plan Findings — All 5 Addressed

| # | Type | Issue | Resolution |
|---|------|-------|-----------|
| F1 | Medium | Token budget conflict (2K + 800 = 2.8K) | `maxInjectionTokens = 600`; total 800+600 = 1,400 < 2,000 (types.ts:205) |
| F2 | Low | Fire-and-forget promise safety | `void hook().catch(() => {})` in multi-agent-dispatcher.ts:155 |
| F3 | Info | Context types not enumerated | `ALL_TRANSFER_CONTEXT_TYPES` with 6 values (types.ts:74-81) |
| F4 | Info | Stage proximity parameter | `currentStage?: string` on `score()` method (quality-scorer.ts:90) |
| F5 | Info | ADR-027 number available | ADR-027-Cross-Session-Context-Transfer.md created |

### CTO Conditions — All 5 Met

| # | Condition | Resolution |
|---|-----------|-----------|
| C1 | Resolve F1 before implementation | maxInjectionTokens = 600 |
| C2 | types.ts ZERO imports + test | `grep -n "^import" types.ts` returns empty; test validates |
| C3 | Fire-and-forget must catch | `void this.contextExtractHook(...).catch(() => {})` |
| C4 | Quality weights sum to 1.0 + test | 0.35+0.25+0.25+0.15=1.0; test uses `toBeCloseTo(1.0, 10)` |
| C5 | 5,994 existing tests must not decrease | 6,079 total (5,994 + 85 new) |

### CTO Code Review Findings (Post-Implementation)

| # | Severity | Issue | Notes |
|---|----------|-------|-------|
| F1 | Info | `idCounter` module-level state in session-context-extractor.ts:27 | Same pattern as Sprint 95 (goal-decomposer.ts). Date.now() prefix prevents collisions. |
| F2 | Info | HIGH_CONFIDENCE_PROVIDERS uses broad "claude" match (quality-scorer.ts:63) | All Claude models treated as high-confidence. Acceptable for T2; T3 may want tier-specific scoring. |
| F3 | Info | ContextSelector sorts by type priority THEN composite (context-selector.ts:128-133) | A low-scoring "decision" beats a high-scoring "task_output". By design per AnchorBudget pattern. |
| F4 | Info | saveBatch() uses sequential await (context-transfer-store.ts:67-69) | Fine for typical batch size (2-4 entries per goal). |
| F5 | Info | evaluate() re-scores context via scorer.score() even though quality.composite is stored (quality-gate.ts:71) | Correct — recency changes over time, so re-scoring ensures freshness. |

---

## Architecture

### Module Structure — `src/context/transfer/`

```
context/transfer/types.ts                ← ZERO imports from src/ (ADR-002)
                │
context/transfer/quality-scorer.ts       ← 4-dim scoring: relevance, recency, confidence, completeness
                │
context/transfer/quality-gate.ts         ← per-type threshold gating + violation detection
                │
context/transfer/context-transfer-store.ts ← file-based persistence (~/.endiorbot/context-transfer/)
                │
context/transfer/session-context-extractor.ts ← extract from completed goals via summarizeForHandoff()
                │
context/transfer/context-selector.ts     ← score → gate → sort → fill 600-token budget
                │
context/transfer/index.ts               ← barrel exports
                │
autonomy/multi-agent-dispatcher.ts       ← post-goal hook (fire-and-forget with .catch())
```

### Architecture Decisions

| # | Decision | Resolution |
|---|----------|-----------|
| AD-1 | Module location | `src/context/transfer/` — sub-module of existing `src/context/` |
| AD-2 | ADR-002 compliance | `src/context/transfer/types.ts` imports ZERO modules from `src/` |
| AD-3 | Quality scoring model | 4-dim weighted: relevance (0.35) + recency (0.25) + confidence (0.25) + completeness (0.15) = 1.0 |
| AD-4 | Context selection budget | 600 tokens (CTO F1: shares 2K total with AnchorBudget's 800) |
| AD-5 | Quality gate | Separate `ContextQualityGate` — different domain from `QualityGatesEvaluator` |
| AD-6 | Storage | `~/.endiorbot/context-transfer/{projectId}/` — separate from session files |
| AD-7 | SessionRelay integration | Compose on top via `summarizeForHandoff()`; do NOT modify SessionRelay |

### Quality Scoring Model (AD-3)

```
Composite Score = relevance × 0.35 + recency × 0.25 + confidence × 0.25 + completeness × 0.15
                  (always 0.0–1.0)
```

| Dimension | Weight | Signal |
|-----------|--------|--------|
| Relevance | 0.35 | Tag overlap + SDLC stage proximity + goal keyword overlap |
| Recency | 0.25 | Exponential decay `2^(-age/halfLife)`, per-type half-lives |
| Confidence | 0.25 | Model tier (claude=high) + task success + quality gate pass |
| Completeness | 0.15 | Content length vs minimum + truncation detection |

Stage proximity (CTO F4): same=1.0, adjacent=0.7, 2-apart=0.4, else=0.1.

### Recency Decay — Per-Type Half-Lives

| Type | Half-Life |
|------|-----------|
| decision | 24h |
| architecture | 24h |
| goal_result | 12h |
| blocker_resolution | 12h |
| error_pattern | 12h |
| task_output | 4h |

### Quality Gate Thresholds (AD-5)

| Type | Threshold |
|------|-----------|
| decision | 0.70 |
| architecture | 0.70 |
| goal_result | 0.60 |
| blocker_resolution | 0.60 |
| error_pattern | 0.50 |
| task_output | 0.50 |

Per-dimension minimums: relevance=0.15, recency=0.05, confidence=0.2, completeness=0.2.

### Context Selection Algorithm

```
Load all contexts for projectId
    → Re-score each (recency changes over time)
    → Gate: reject below threshold
    → Sort: type priority (decision > architecture > goal_result > blocker_resolution > error_pattern > task_output)
           then composite score (descending)
    → Fill: greedily add until 600-token budget exhausted
    → Return: ContextSelectionResult with selected, dropped, retentionRate
```

### Dispatcher Integration (AD-7)

```typescript
// MultiAgentDispatcher — fire-and-forget context extraction (CTO F2)
export type ContextExtractHook = (goalId: string, results: SubtaskResult[]) => Promise<void>;

// After dispatch:complete event:
if (this.contextExtractHook) {
  void this.contextExtractHook(decomposition.goalId, results).catch(() => {
    // Silently ignore extraction errors — non-critical path
  });
}
```

---

## Key Deliverables

### New Files (8)

| # | File | Description | Lines |
|---|------|-------------|-------|
| 1 | `src/context/transfer/types.ts` | TransferableContext, ContextQualityScore, 6 TransferContextType values, DEFAULT_TRANSFER_CONFIG (600 tokens) — ZERO imports (ADR-002) | 232 |
| 2 | `src/context/transfer/quality-scorer.ts` | 4-dimensional scoring: tag overlap, stage proximity (F4), exponential decay, model tier, completeness | 245 |
| 3 | `src/context/transfer/quality-gate.ts` | Per-type threshold gating, violation detection with recommendations | 188 |
| 4 | `src/context/transfer/context-transfer-store.ts` | File-based CRUD at `~/.endiorbot/context-transfer/{projectId}/`, cleanup, stats | 175 |
| 5 | `src/context/transfer/session-context-extractor.ts` | Extract from completed goals/relays, classify output type, score and persist | 215 |
| 6 | `src/context/transfer/context-selector.ts` | Score → gate → sort → fill 600-token budget, build injection payload | 175 |
| 7 | `src/context/transfer/index.ts` | Barrel export for all types + classes | 85 |
| 8 | `docs/02-design/01-ADRs/ADR-027-Cross-Session-Context-Transfer.md` | Architecture decision record (AD-1 through AD-7) | 78 |

### Modified Files (2)

| # | File | Changes |
|---|------|---------|
| 9 | `src/context/index.ts` | +40 lines: barrel re-exports for `transfer/` sub-module |
| 10 | `src/autonomy/multi-agent-dispatcher.ts` | +15 lines: `ContextExtractHook` type, `setContextExtractHook()`, fire-and-forget call with `.catch()` |

### Key Interfaces

```typescript
// src/context/transfer/types.ts — ZERO imports (ADR-002)

type TransferContextType =
  | "goal_result" | "decision" | "architecture"
  | "error_pattern" | "task_output" | "blocker_resolution";

interface ContextQualityScore {
  relevance: number;   // 0-1
  recency: number;     // 0-1
  confidence: number;  // 0-1
  completeness: number; // 0-1
  composite: number;   // weighted sum
}

interface TransferableContext {
  id: string;
  projectId: string;
  sourceSessionId: string;
  type: TransferContextType;
  content: string;
  tokenCount: number;
  quality: ContextQualityScore;
  tags: string[];
  createdAt: string;   // ISO 8601
  expiresAt?: string;
  goalId?: string;
  sdlcStage?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_TRANSFER_CONFIG: ContextTransferConfig = {
  weights: { relevance: 0.35, recency: 0.25, confidence: 0.25, completeness: 0.15 },
  maxInjectionTokens: 600,  // CTO F1: 800 + 600 = 1,400 < 2,000
  taskOutputExpiryMs: 7 * DAY,
  decisionExpiryMs: 30 * DAY,
  basePath: "~/.endiorbot/context-transfer",
};

interface ContextSelectionResult {
  selected: TransferableContext[];
  dropped: TransferableContext[];
  totalTokens: number;
  budgetUtilization: number; // 0-1
  retentionRate: number;     // 0-1
}
```

---

## Test Plan (~70 tests)

### Types (12 tests)

| Test | Description |
|------|-------------|
| ADR-002 ZERO imports | `grep -n "^import"` validates zero imports from src/ |
| Weight sum = 1.0 (C4) | `toBeCloseTo(1.0, 10)` — high precision |
| All 4 dimensions present | relevance, recency, confidence, completeness |
| Positive weights | All > 0 |
| 6 types enumerated (F3) | ALL_TRANSFER_CONTEXT_TYPES length = 6 |
| Type values match | All 6 string literal values present |
| Default config maxInjectionTokens (F1) | 600 tokens |
| Default config basePath | ~/.endiorbot/context-transfer |
| Threshold ordering | decision ≥ architecture > goal_result ≥ blocker_resolution > task_output ≥ error_pattern |
| Context construction (required) | All required fields |
| Context construction (optional) | goalId, sdlcStage, expiresAt |
| Weight sum test with toBeCloseTo | Floating-point precision guard |

### Quality Scorer (25 tests)

| Group | Tests | Description |
|-------|-------|-------------|
| Relevance | 8 | Tag overlap (high/low), baseline (decision/task_output), stage proximity (same/adjacent/distant, CTO F4), goal keywords |
| Recency | 5 | Fresh (≈1.0), half-life 24h, half-life 4h, old (→0), future (clamp 1.0) |
| Confidence | 4 | High-tier+success, baseline, failure penalty, success boost |
| Completeness | 4 | Above minimum, truncated, short, truncation marker |
| Composite | 2 | Weighted calculation, bounds [0,1] |
| Decay | 1 | applyDecay reduces scores over time |
| Singleton | 1 | getContextQualityScorer() consistency |

### Quality Gate (12 tests)

| Group | Tests | Description |
|-------|-------|-------------|
| Threshold enforcement | 4 | Pass above threshold, all 6 types, strict > lenient, reject low |
| Violations | 3 | Recency below minimum, confidence below minimum, recommendations |
| Batch | 2 | evaluateBatch multiple contexts, mixed pass/fail |
| Filter | 2 | filterByQuality returns only passing, empty input |
| Singleton | 1 | getContextQualityGate() consistency |

### Context Transfer Store (14 tests)

| Group | Tests | Description |
|-------|-------|-------------|
| CRUD | 5 | Save/load, load null for missing, delete, saveBatch, overwrite |
| Listing | 4 | All entries, empty project, filter by type, exclude expired |
| Cleanup | 2 | Expired entries, by age threshold |
| Stats | 2 | Populated project, empty project |
| Singleton | 1 | getContextTransferStore() consistency |

### Session Context Extractor (11 tests)

| Group | Tests | Description |
|-------|-------|-------------|
| Goal extraction | 6 | Multi-agent results, skip failures, goalId tracking, sdlcStage, empty results, classify output type |
| Relay | 2 | Extract from relay context, empty relay |
| Summarize | 1 | summarizeAndScore with metadata |
| Scoring | 1 | Quality scores present and valid |
| Expiry | 1 | expiresAt calculated from type-specific config |

### Context Selector (11 tests)

| Group | Tests | Description |
|-------|-------|-------------|
| Budget | 3 | 600-token cap (F1), all under budget, max enforcement |
| Priority | 1 | Decisions prioritized over task_output |
| Empty | 1 | Empty project → zero results |
| Retention | 3 | Correct calculation, zero total, estimateRetentionRate |
| Payload | 2 | Formatted injection with headers, empty → "" |
| Singleton | 1 | getContextSelector() consistency |

---

## Results

| Metric | Value |
|--------|-------|
| New tests | 85 (`it()` blocks across 6 test files) |
| Total tests | 6,079 (6,079 passing + 10 skipped) |
| Regressions | 0 |
| Build | Clean (0 TS errors) |
| CTO Plan Review | 8.5/10 APPROVED |
| CTO Code Review | 9/10 APPROVED |
| CPO | APPROVED unconditionally |

### Build Fixes Applied

| Issue | Fix |
|-------|-----|
| `exactOptionalPropertyTypes` in session-context-extractor.ts | Build params object first, then `if (sdlcStage) params.sdlcStage = sdlcStage` (3 occurrences) |
| Unused import `ALL_TRANSFER_CONTEXT_TYPES` in context-transfer-store.ts | Removed unused import |
| Unused variable `now` in session-context-extractor.ts | Removed unused const |
| Floating-point precision in quality-scorer.test.ts | Changed `toBe(1.0)` to `toBeCloseTo(1.0, 5)` for confidence sum |

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
| **96** | **Cross-Session Context Transfer + Quality Gates (persistence layer)** |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 97 | Progressive Trust T3 — 120min sessions, $10 budget, 95% context retention |
