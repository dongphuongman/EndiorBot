# Autonomy Epic - Problem Statement

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: APPROVED
**Authority**: CEO + CTO
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 00 - FOUNDATION
**SDLC**: Framework 6.1.1

---

## Executive Summary

EndiorBot currently operates in 5-10 minute sessions before requiring manual intervention. To serve as an effective solo developer tool for enterprise-scale projects, we need 2+ hour autonomous runs with minimal human oversight.

This document defines the core problem, constraints, and target state for the Autonomy Epic (Sprints 35-40).

---

## Current State

### Session Duration Limitations

```
Current Reality:
┌─────────────────────────────────────────────┐
│ 5-10 minute autonomous run                  │
├─────────────────────────────────────────────┤
│ ✓ Code generation works                     │
│ ✗ Interruption (context lost)               │
│ ✗ Manual restart required                   │
│ ✗ CEO must fix all errors                   │
│ ✗ No budget control → runaway costs         │
│ ✗ No error recovery → escalate everything   │
└─────────────────────────────────────────────┘

CEO Pain Points:
• Every 5-10 minutes: Check status, resume work
• Every error: Manual debugging and fixing
• Every decision: Approval interrupt
• Unpredictable costs: No budget limits
• Notification spam: No rate limiting
```

### Concrete Examples

**Example 1: Feature Implementation** (Current)
```
00:00 - Start: endiorbot start myproject
00:05 - Build error → INTERRUPT → CEO fixes manually
00:10 - Type error → INTERRUPT → CEO fixes manually
00:15 - Test failure → INTERRUPT → CEO decides to skip
00:20 - Budget unknown → Session continues → $5 spent
RESULT: 20 min of CEO time, 4 interrupts, unpredictable cost
```

**Example 2: Architecture Decision** (Current)
```
00:00 - Agent proposes refactor
00:01 - INTERRUPT for approval → CEO unavailable
00:?? - Session paused, waiting indefinitely
RESULT: Deadlock, no progress
```

### Quantified Pain

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Session duration | 5-10 min | 120+ min | **12x** |
| CEO interrupts/hour | 6-12 | 0-2 | **6x reduction** |
| Error auto-fix rate | 0% | 70-90% | **+70-90%** |
| Cost predictability | None | $2 session, $10 daily | **Full control** |
| Notification rate | Unlimited | 4/hour max | **Rate limited** |

---

## Root Causes

### 1. No State Persistence (Checkpoint/Resume)

**Problem**: Session state lost on interruption
**Impact**: Cannot resume from where it left off
**Example**: Ctrl+C → all context lost → start from scratch

### 2. No Budget Control

**Problem**: No session or daily cost limits
**Impact**: Runaway costs (potential $50+ per session)
**Example**: Complex task → 100 LLM calls → unknown cost → CEO surprised

### 3. No Error Recovery (Self-Correction)

**Problem**: Every error escalates to CEO
**Impact**: 80% of CEO time spent fixing build/lint/type errors
**Example**: Missing import → agent stuck → CEO adds import manually

### 4. No Decision Escalation Strategy

**Problem**: Agent doesn't know when to ask CEO vs. proceed
**Impact**: Either too many interrupts OR risky decisions made autonomously
**Example**: Architecture change → agent proceeds without approval → CEO unhappy

### 5. No Resource Optimization (Hybrid AI)

**Problem**: All tasks use expensive models (Claude)
**Impact**: Budget depleted quickly on simple tasks
**Example**: Format code with Claude ($0.10) vs. Ollama (free)

### 6. Sequential Execution Only

**Problem**: No parallel task execution
**Impact**: 2x+ slower than necessary
**Example**: Implementation (10 min) → Tests (5 min) sequential = 15 min, could be 10 min parallel

---

## Target State

### Autonomous Duration: 120+ Minutes

```
Target State:
┌─────────────────────────────────────────────┐
│ 120+ minute autonomous run                   │
├─────────────────────────────────────────────┤
│ ✓ Auto-checkpoint every 10 min              │
│ ✓ Auto-fix 70-90% of errors                 │
│ ✓ Budget control: $2 session, $10 daily     │
│ ✓ Smart escalation: only critical decisions │
│ ✓ Hybrid AI: Ollama for simple tasks        │
│ ✓ Parallel tracks: 2-3 concurrent tasks     │
│ ✓ Fix logging: learn patterns over time     │
└─────────────────────────────────────────────┘

CEO Experience:
• Start session, work autonomously for 2 hours
• 0-2 interrupts for critical decisions only
• Budget alert at 80%, pause at 100%
• Notification rate limited (4/hour max)
• Resume next day from exact checkpoint
```

### Feature Implementation (Target)

```
00:00 - Start: endiorbot start myproject
00:10 - Build error → AUTO-FIX (add import) → Continue
00:15 - Type error → AUTO-FIX (add type annotation) → Continue
00:20 - Test failure → AUTO-FIX (update test) → Continue
00:30 - Architecture decision → ESCALATE → Approval queue
00:35 - Budget warning: 80% of $2 session limit → Continue
01:00 - Feature complete → Auto-commit → Checkpoint
RESULT: 60 min autonomous, 1 approval request, $1.80 cost
```

---

## Business Value

### Time Savings (CEO Perspective)

**Current**: 20 min of work requires 60 min of CEO time (coding + fixing + reviewing)
**Target**: 120 min of work requires 30 min of CEO time (approval + review only)
**Gain**: **4x productivity multiplier**

### Cost Optimization

**Current**: $2-5 per 20 min (all tasks use Claude)
**Target**: $2 per 120 min (simple tasks use Ollama)
**Saving**: **60-80% cost reduction**

### Quality Improvement

**Current**: Errors accumulate, CEO fixes reactively
**Target**: Errors caught and fixed immediately
**Gain**: **Fewer bugs in production**

### Focus Time

**Current**: Context switching every 5-10 min
**Target**: Deep work for 2+ hours
**Gain**: **CEO can focus on architecture, not fixing imports**

---

## Mental Model: Iceberg 4-Layer Evolution

```
┌──────────────────────────────────────────────────────┐
│                    ICEBERG MODEL                      │
│           (Layer 1 → Layer 4 Evolution)              │
└──────────────────────────────────────────────────────┘

LAYER 1: FOUNDATION (Sprints 35-36) ✅ CRITICAL
─────────────────────────────────────────────────
Checkpoint + Resume (Sprint 35)
Budget Control + Escalation (Sprint 36)

WITHOUT THIS: No autonomy possible
• Can't pause/resume → session lost on interrupt
• Can't control costs → runaway spending
• Can't escalate decisions → either chaos or deadlock

LAYER 2: RELIABILITY (Sprints 37-38) ✅ HIGH VALUE
─────────────────────────────────────────────────
Self-Correction (Sprint 37)
Hybrid AI/Ollama Router (Sprint 38)

WITHOUT THIS: Autonomy fragile
• Can't fix errors → stuck on every build error
• Can't optimize costs → budget depleted quickly

LAYER 3: PERFORMANCE (Sprint 39) ⚠️ NICE-TO-HAVE
─────────────────────────────────────────────────
Parallel Tracks (Sprint 39)

WITHOUT THIS: Slower but still autonomous
• Sequential execution → 2x slower
• But still completes work autonomously

LAYER 4: LEARNING (Sprint 40) 📊 FUTURE IMPROVEMENT
─────────────────────────────────────────────────
Fix Logging (Sprint 40)

WITHOUT THIS: Doesn't improve over time
• Manual pattern updates required
• But still functional
```

### Layer Prioritization

| Layer | Priority | Reason |
|-------|----------|--------|
| Layer 1 | **P0 - BLOCKING** | Foundation for ALL autonomy |
| Layer 2 | **P1 - HIGH VALUE** | Makes autonomy reliable + cost-effective |
| Layer 3 | **P2 - PERFORMANCE** | Nice-to-have, not critical |
| Layer 4 | **P3 - FUTURE** | Incremental improvement |

---

## Success Criteria

### Phase 1 (Sprint 35): Foundation - Checkpoint

**Metric**: Can resume from checkpoint after interruption
**Test**: Create checkpoint → close terminal → resume next day → continue from exact state
**Pass Criteria**: 95% resume success rate

### Phase 2 (Sprint 36): Safety Net - Budget + Escalation

**Metric**: Budget enforced, decisions escalated correctly
**Test**: Run task → hit $2 session limit → pause + notify
**Pass Criteria**: 100% budget enforcement, 90% escalation accuracy

### Phase 3 (Sprint 37): Reliability - Self-Correction

**Metric**: Auto-fix rate for build/lint/type errors
**Test**: Introduce 10 common errors → measure auto-fix success
**Pass Criteria**: 70-90% auto-fix success rate

### Phase 4 (Sprint 38): Cost Optimization - Hybrid AI

**Metric**: Cost reduction for simple tasks
**Test**: Run 10 simple tasks → measure Ollama vs. Claude usage
**Pass Criteria**: 60-80% cost reduction

### Phase 5 (Sprint 39): Performance - Parallel Tracks

**Metric**: Wall-clock time reduction
**Test**: Run 3 independent tasks → measure sequential vs. parallel time
**Pass Criteria**: 50-60% time reduction

### Phase 6 (Sprint 40): Learning - Fix Logging

**Metric**: Fix patterns logged and analyzable
**Test**: Run weekly review CLI → see pattern frequency reports
**Pass Criteria**: All fixes logged, patterns exportable

---

## Constraints

### Hard Constraints (Non-Negotiable)

1. **No Multi-Process**: Single Node.js process only (no workers, no child processes)
2. **No ML Libraries**: No TensorFlow, PyTorch, etc. (only structured logging)
3. **Budget Limits**: $2 session max, $10 daily max (hardcoded, CEO can override)
4. **Notification Rate**: 4/hour max (prevent CEO overwhelm)
5. **Security**: Anti-cheat verifier blocks rule disabling (no `@ts-ignore`, etc.)

### Soft Constraints (Preferred)

1. **Max 3 Parallel Tracks**: Avoid context switching overhead
2. **Max 3 Retries**: Self-correction 3-strike rule
3. **Max 10 Checkpoints**: Garbage collection keeps last 10
4. **Max 10MB Fix Log**: Rotation when file exceeds 10MB

---

## Out of Scope (Explicitly Deferred)

| Feature | Reason | Future Sprint |
|---------|--------|---------------|
| **Adaptive ML** | Too complex, CEO wants manual pattern updates | Post-40 |
| **Multi-model fine-tuning** | Expensive, diminishing returns | Post-40 |
| **Desktop UI** | Separate epic (Phase 7) | Sprint 41+ |
| **Skills framework** | Lower priority, basic autonomy first | Sprint 41+ |
| **Embedding-based code search** | Nice-to-have, not critical | Post-40 |
| **Logic/semantic error fixing** | Too risky, only build/lint/type in scope | Post-40 |

---

## Risk Assessment

### Critical Risks (Must Mitigate)

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Runaway costs** | $50+ session | Budget tracker with hard limits (Sprint 36) |
| **Infinite loops** | Agent stuck retrying | 3-strike circuit breaker (Sprint 36) |
| **State corruption** | Checkpoint restore fails | Conflict detection + rollback (Sprint 35) |
| **Quality regression** | Ollama makes mistakes | Quality gates enforce model tier (Sprint 38) |
| **File conflicts** | Parallel tracks corrupt files | File lock manager (Sprint 39) |

### Medium Risks (Monitor)

| Risk | Impact | Mitigation |
|------|--------|------------|
| **CEO approval deadlock** | Work stops | Timeout + escalation (Sprint 36) |
| **Notification fatigue** | CEO ignores alerts | Rate limiting (Sprint 36) |
| **Checkpoint size bloat** | Disk usage | Compression + garbage collection (Sprint 35) |
| **Fix pattern drift** | Success rate declines | Weekly review + manual updates (Sprint 40) |

---

## Stakeholder Alignment

### CEO Requirements

- ✅ "I need 2+ hour autonomous runs"
- ✅ "Max 4 notifications per hour, no spam"
- ✅ "Budget limits: $2 session, $10 daily, non-negotiable"
- ✅ "No black box ML, I want manual control"

### CTO Requirements

- ✅ "Safety-first: checkpoint/resume before increasing autonomy"
- ✅ "Budget control before self-correction (prevent runaway loops)"
- ✅ "3-strike rule for error retries"
- ✅ "Anti-cheat verifier: no rule disabling"

### Architect Requirements

- ✅ "Single process model (no multi-process complexity)"
- ✅ "Ollama fallback explicit, not automatic"
- ✅ "Quality gates for critical tasks (architecture, security)"

---

## Related Documents

- **Epic Plan**: `docs/01-planning/sprint-35-40-autonomy-epic.md`
- **Sprint Plans**: `docs/01-planning/sprint-35-plan.md` through `sprint-40-plan.md`
- **ADRs**:
  - ADR-006: Checkpoint State Model (Sprint 35)
  - ADR-007: Autonomous Execution Budget (Sprint 36)
  - ADR-008: Self-Correction Architecture (Sprint 37)
  - ADR-009: Hybrid AI/Ollama Architecture (Sprint 38)
  - ADR-010: Parallel Tracks Architecture (Sprint 39)
  - ADR-011: Fix Logging Architecture (Sprint 40)

---

## References

### Industry Patterns

- **LangGraph**: Agent checkpoint/resume patterns
- **Temporal.io**: Durable workflow execution model
- **Aider**: Error classification and fixing (deterministic patterns)
- **OpenDevin**: Autonomous agent architecture

### Expert Consultations

- Expert #1: Versioning, rollback, cost tracking
- Expert #2: Execution provenance, idempotency
- Expert #3: State machine, retry budget
- Critical Review: 5 lỗ thủng chết người (security holes)

---

**Approved By**: CEO + CTO
**Date**: 2026-02-22
**Status**: ACTIVE - Foundation for Sprints 35-40
**Next Review**: Sprint 40 Close (May 27, 2026)

---

*Autonomy Epic - Problem Statement v1.0.0*
*EndiorBot SDLC Framework 6.1.1*
