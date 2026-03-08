---
spec_id: SPEC-04BUILD-SPRINT88
title: "Sprint 88: Evaluator + Vibecoding in Bridge Output Pipeline"
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

# Sprint 88: Evaluator + Vibecoding in Bridge Output Pipeline

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-025 (Post-turn layer)
**Preceding sprint:** Sprint 87 (Brain L4 + Context Anchoring in Bridge)
**Est. effort:** ~40h
**Est. tests:** ~25
**Milestone:** 3-layer context model complete. Intelligence parity at Sprint 88.

---

## Goal

Capture agent output from tmux, run it through an evaluator pipeline, compute the vibecoding index from 5 quality signals, and store results per session. Post-turn Telegram notifications give CEO instant quality feedback after each agent turn — no manual review required.

**Key principle:** The loop closes here. Launch-time injects context; post-turn measures quality. Every agent turn is scored automatically.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `EvaluatorEnvelope` in `SessionIntelligenceEnvelope` | Agent Teams — Sprint 89 |
| Output capture from tmux pane (text scrape) | Full vibecoding UI dashboard |
| Evaluator pipeline (5-signal vibecoding index) | Real-time streaming output capture |
| Post-turn result storage (`.endiorbot/sessions/{id}/evaluations.jsonl`) | Brain L2 pattern matching on failures |
| Telegram summary notification after each scored turn | Long-form evaluator report generation |
| `output-evaluator.ts` with 5 signals | |

---

## Architecture

### SessionIntelligenceEnvelope — Final Shape

```typescript
interface SessionIntelligenceEnvelope {
  persona: PersonaEnvelope;       // Sprint 84 — immutable, launch-time
  brain?: BrainEnvelope;          // Sprint 87 — L4 mental models
  context?: ContextEnvelope;      // Sprint 87 — sprint goals, vision, snapshot
  evaluator?: EvaluatorEnvelope;  // Sprint 88 — post-turn scores
}
```

All 4 layers are now complete. The 3-layer context model from ADR-025 is fully implemented.

### Post-turn Pipeline

```
tmux capture-pane -p (last N lines)
→ output-evaluator.ts
→ 5-signal vibecoding index (0–100)
→ EvaluatorEnvelope
→ append to evaluations.jsonl
→ Telegram summary notification to CEO
```

### Vibecoding Index — 5 Signals

| Signal | Weight | Description |
|--------|--------|-------------|
| Code/test ratio | 25% | Test lines relative to implementation lines changed |
| Comment density | 15% | JSDoc/inline comment coverage on new public APIs |
| Error patterns | 25% | Presence of `console.error`, unhandled rejections, `any` types |
| Complexity | 20% | Cyclomatic complexity estimate from control-flow keywords |
| Lint compliance | 15% | Lint error/warning count in captured output (zero = full score) |

Score range: 0–100. Scores below 60 trigger a warning flag in the Telegram notification.

### Storage Schema

```jsonl
// .endiorbot/sessions/{sessionId}/evaluations.jsonl
{"turn": 1, "timestamp": "...", "score": 82, "signals": {...}, "summary": "..."}
{"turn": 2, "timestamp": "...", "score": 74, "signals": {...}, "summary": "..."}
```

---

## Key Deliverables

1. **`EvaluatorEnvelope` type** in `src/bridge/intelligence/envelope.ts` — turn number, timestamp, vibecoding score (0–100), per-signal breakdown, summary string.
2. **`src/bridge/intelligence/output-evaluator.ts`** — Captures tmux pane output, runs 5-signal scoring pipeline, returns `EvaluatorEnvelope`. Stateless: called once per completed turn.
3. **Post-turn storage** — Appends `EvaluatorEnvelope` as JSONL line to `.endiorbot/sessions/{sessionId}/evaluations.jsonl`. Session directory created if absent.
4. **Telegram summary notification** — Sends scored turn summary to CEO channel after each evaluation: score badge (PASS ≥60 / WARN <60), top signal breakdown, session ID.
5. **Post-turn hook integration** — `agent-launcher.ts` registers a post-turn callback that triggers `output-evaluator.ts` after each agent turn completes; result stored and notified.

---

## Test Plan (~25 tests)

| Test Area | Cases |
|-----------|-------|
| Output capture parsing | Valid tmux output, empty output, multi-line capture |
| Code/test ratio signal | Files with tests score higher, no tests score 0 on signal |
| Comment density signal | JSDoc present scores full, absent scores 0 on signal |
| Error patterns signal | `any` type detected penalizes score, clean output scores full |
| Complexity signal | High keyword density lowers score, simple output scores full |
| Lint compliance signal | Lint errors in output penalize score, clean output scores full |
| Vibecoding index composition | Weighted average computed correctly across all 5 signals |
| JSONL storage | First turn creates file, second turn appends, file format valid |
| Telegram notification | PASS badge when score ≥60, WARN badge when <60 |
| Post-turn callback | Fires after turn complete, not during active turn |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 89 | Unified App Launcher (infrastructure) |
| 90 | Agent Teams — Files |
