# EndiorBot Autonomy Epic v2.0.0

**Status**: ✅ APPROVED - CPO/CTO Final Review
**Date**: 2026-02-22
**Duration**: 6 Sprints (Sprint 35-40)
**Total LOC**: ~4,900

---

## Foundational Principle

> **"Do Stage 00-01 Well, Automate the Rest"**

Nếu Stage 00 (Foundation) và Stage 01 (Planning) được làm rất kỹ, việc tự động hoá các stages sau cho đến khi hoàn thiện project là hoàn toàn khả thi với sức mạnh của AI codex tools hiện nay.

```
Stage 00-01: HUMAN-INTENSIVE (80% human, 20% AI)
    │
    │ G0, G1 Gates (Quality Check)
    │
    ▼
Stage 02-08: AI-AUTOMATABLE (20% human, 80% AI)
```

---

## Executive Summary

Transform EndiorBot from human-supervised execution to **autonomous multi-agent orchestration** capable of running 1-2+ hours with minimal human intervention.

### Vision: Software Engineering 3.0

```
Level 0 (Current): Human triggers each action
Level 1 (Sprint 35-36): Auto-commit, checkpoint, resume + SAFETY NET
Level 2 (Sprint 37-38): Self-correction (scoped), cost optimization
Level 3 (Sprint 39-40): Parallel tracks, fix logging
Level 4 (Future): Full autonomy, human coach only for strategy
```

---

## Phase Order (Safety First)

| Order | Phase | Sprint | Focus |
|-------|-------|--------|-------|
| 1 | Checkpoint + Resume | 35 | Foundation |
| 2 | Escalation + Budget | 36 | Safety net |
| 3 | Self-Correction | 37 | Build/lint/type fixes |
| 4 | Hybrid AI/Ollama | 38 | Cost optimization |
| 5 | Parallel Tracks | 39 | Concurrent work |
| 6 | Fix Logging | 40 | Pattern analysis |

---

## Phase 1: Checkpoint + Resume (Sprint 35)

**Goal**: Enable long-running sessions with persistence
**LOC**: ~800

### Components

- `src/sessions/checkpoint.ts` - Save/restore state
- `src/infra/git-automation.ts` - Auto-commit on milestones
- `src/sessions/resume-handler.ts` - Recover from interruption

### CEO Experience

| Touchpoint | What CEO Does | What EndiorBot Does |
|------------|---------------|---------------------|
| Start | `endiorbot start --resume` | Load checkpoint |
| Interrupt | Ctrl+C | Save checkpoint |
| Next day | `endiorbot resume` | Restore full context |

### Acceptance Criteria

- [ ] Session persists across restarts
- [ ] Auto-commit on gate pass
- [ ] Resume with full context
- [ ] Build + tests pass

---

## Phase 2: Escalation + Budget (Sprint 36)

**Goal**: Safety net BEFORE increasing autonomy
**LOC**: ~800

### Budget Control

```yaml
budget:
  daily_limit: $10
  per_session_limit: $2
  warning_threshold: 80%
  on_limit_reached: pause_and_notify
  fallback: switch_to_ollama
```

### Escalation Levels

```
Level 1: Agent Retry (auto)
    ↓ fail
Level 2: Multi-Model Consultation
    ↓ fail
Level 3: Human Coach (CEO)
```

### Human Intervention Required

| Decision | Auto | Notify | Block |
|----------|------|--------|-------|
| Bug fix | ✅ | - | - |
| Architecture change | - | ✅ | ✅ |
| Security-related | - | ✅ | ✅ |
| Budget threshold | - | ✅ | ✅ |

### CEO Experience

| Touchpoint | What CEO Does | What EndiorBot Does |
|------------|---------------|---------------------|
| Budget alert | Receive notification | Pause, show summary |
| Approval request | `endiorbot approve <id>` | Continue after approval |
| Morning review | `endiorbot queue` | Show pending approvals |

---

## Phase 3: Self-Correction (Sprint 37)

**Goal**: Auto-fix BUILD/LINT/TYPE errors
**Scope**: Deterministic fixes only. Test failures are EXPERIMENTAL.
**LOC**: ~1,200

### Error Categories

| Category | Auto-Fix | Target Rate |
|----------|----------|-------------|
| Build Error | ✅ | 80% |
| Lint Error | ✅ | 90% |
| Type Error | ✅ | 70% |
| Test Failure | ⚠️ Experimental | 30% |
| Runtime Error | ❌ Escalate | 0% |

### Self-Correction Loop

```
Error → Classify → Build/Lint/Type? → Auto-fix (max 3 attempts)
                         ↓ no
                    Escalate
```

### CEO Experience

| Touchpoint | What CEO Does | What EndiorBot Does |
|------------|---------------|---------------------|
| Build error | Nothing | Fix, verify, continue |
| 3 failures | `endiorbot review` | Show attempts |

---

## Phase 4: Hybrid AI (Sprint 38)

**Goal**: Cost optimization with Cloud + Ollama
**LOC**: ~1,000

### Resource Strategy

| Task | AI Resource |
|------|-------------|
| Lint/Format | Ollama (free) |
| Code Gen | Claude Haiku ($) |
| Architecture | Claude Opus ($$$) |
| Overnight bulk | Ollama + Haiku |

### Quality Gates

| Task Type | Check |
|-----------|-------|
| Lint/Format | Build only |
| Code Gen | Build + Test |
| Architecture | **Cloud only** |

### CEO Experience

| Touchpoint | What CEO Does | What EndiorBot Does |
|------------|---------------|---------------------|
| Overnight | Start, sleep | Use Ollama |
| Morning | `endiorbot summary` | Show cost saved |

---

## Phase 5: Parallel Tracks (Sprint 39)

**Goal**: 2-3 concurrent work tracks
**LOC**: ~800

### Concurrency Model

- Single-process with `Promise.all`
- File-level locks for writes
- Shared: Logger, Config (read-only)

### Track Types

| Track | Can Parallel With |
|-------|-------------------|
| Research | All |
| Design | Research |
| Implement | Research, Design |

### CEO Experience

| Touchpoint | What CEO Does | What EndiorBot Does |
|------------|---------------|---------------------|
| Start | `endiorbot run --parallel` | Show dashboard |
| Conflict | Notified | Pause track |

---

## Phase 6: Fix Logging (Sprint 40)

**Goal**: Store fix attempts for review (NO adaptive ML)
**LOC**: ~300

### What We Store

```json
{
  "fixes": [{
    "id": "fix-001",
    "errorType": "type_error",
    "attemptedFixes": [
      { "strategy": "add_type", "success": false },
      { "strategy": "import_type", "success": true }
    ],
    "resolution": "import_type"
  }]
}
```

### What We DON'T Build

- ❌ Adaptive ML
- ❌ Pattern prioritization
- ❌ Performance prediction

---

## Success Metrics

| Metric | Current | M1 (S35) | M3 (S37) | M5 (S40) |
|--------|---------|----------|----------|----------|
| Autonomous duration | 5 min | 30 min | 1 hr | 2+ hr |
| Interventions/hr | 10+ | 4 | 2 | 0.5 |
| Auto-fix (build/lint) | 0% | 50% | 80% | 90% |
| Cost per deliverable | $X | $0.9X | $0.6X | $0.4X |

---

## Required ADRs (Hard Gates)

| ADR | Blocks | Due |
|-----|--------|-----|
| ADR-006: Checkpoint State | Sprint 35 | Before Phase 1 |
| ADR-007: Budget Model | Sprint 36 | Before Phase 2 |
| ADR-008: Concurrency | Sprint 39 | Before Phase 5 |

---

## Validation Gates

### Phase 2 → Phase 3
- [ ] Budget tracker pauses at $2 limit
- [ ] Escalation blocks architecture changes
- [ ] Notification works
- [ ] Ollama fallback integration test

### Phase 3 → Phase 4
- [ ] Build fix ≥ 70%
- [ ] Lint fix ≥ 80%
- [ ] Type fix ≥ 60%
- [ ] Fix-log.json populated

---

*Autonomy Epic v2.0.0*
*CPO/CTO Approved: 2026-02-22*
