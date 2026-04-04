# ADR-038: Autonomous Workflow Integration

**Status:** ACCEPTED
**Date:** 2026-03-31
**Sprint:** 124a (plan + memory), 124b (execution engine)
**Authority:** PM + Architect — CTO split directive, CPO approved
**SDLC Framework:** 6.2.1 (CEO confirmed bump from 6.2.0 — all source/SOULs/config updated in Sprint 123 session)

---

## Context

CEO needs seamless "idea → plan → build → verify" workflows. EndiorBot has all building blocks (14 agents, AutonomousSessionManager, ClawVault memory, ComplianceFixEngine) but they run in isolation. CEO must manually chain: consult → invoke @coder → check compliance → close sprint.

CTO verified: `AutonomousSessionManager.executeTaskWork()` throws `NOT_WIRED` — core execution is a stub. Realistic split needed.

---

## Decision

### Phase 1 (Sprint 124a): Plan + Memory

**1.1 `endiorbot plan` command — display-only**

CEO says idea → EndiorBot decomposes into structured tasks with agent assignments, dependency ordering, and effort estimates.

- Uses OpenAI (consult) for task decomposition with project context injection
- Uses GoalDecomposer (existing) for dependency ordering
- Saves to `docs/04-build/sprints/drafts/` (NOT directly to sprints/)
- No `--execute` flag until Phase 2
- OTT parity: `/plan <description>` → summary response

**1.2 ClawVault memory integration**

Agents learn from past sessions via read-path injection + memory safety policy.

**Sprint 124a (shipped): Read path + policy**
- Query FactStore for project-relevant facts (max 5, min score 0.5)
- Format as context block (max 300 tokens)
- Inject into system message alongside SOUL + Brain + project context
- Memory safety policy: allowlist types, scrubber, 30-day TTL, 500 max, opt-out

**Sprint 124a.1 or 124b (deferred): Write path**
- Score observation (relevance, impact) via ObservationScorer (existing)
- Scrub secrets via output-redactor (existing) before persist
- Save to FactStore — requires wiring into channel-router hot path
- Metadata: `factsWrittenCount`, `factIdsUsed` — N/A until write path ships

**Memory safety policy (shipped in 124a):**
- Allowlist types: decision, bugfix, discovery, architecture_choice
- Scrubber: output-redactor strips secrets before persist
- TTL: 30 days, auto-evict on load
- Max: 500 facts per project (FIFO eviction)
- Opt-out: `ENDIORBOT_MEMORY_DISABLED=true` disables all reads/writes
- Read metadata: `injectedFactsCount` in response (shipped)
- Write metadata: `factsWrittenCount` — deferred to write-path sprint

### Phase 2 (Sprint 124b): Execution Engine

Wire `executeTaskWork()` to real providers:
- Claude Code Bridge for SE4A executor tasks (@coder, @tester, @devops)
- OpenAI for consultation tasks
- Gate B: CEO approves every task before execution
- Budget enforcement ($5 default, configurable)
- Failure: FailureClassifier → RecoveryEngine → retry (max 3) or escalate to CEO
- Checkpoint after each task for resume capability

**CEO sovereignty:** Every task execution requires explicit CEO approval at Gate B. True assisted autonomy (Gate C) only after Gate B is validated in production.

---

## Failure Recovery (Phase 2)

```
Task fails
  → FailureClassifier categorizes: TRANSIENT / FIXABLE / DESIGN_ISSUE
  → TRANSIENT: retry with exponential backoff (max 3)
  → FIXABLE: retry with modified approach
  → DESIGN_ISSUE: escalate to CEO with root cause + suggestion
  → After 3 failures: pause session, save checkpoint, notify CEO
```

**Rollback path:**
- Each task produces a checkpoint before execution
- On critical failure: restore to last good checkpoint
- CEO can `/workflow rollback` to undo last task

---

## Alternatives Considered

### A: Ship execution engine in 124a (rejected by CTO)
- `executeTaskWork()` is a stub. Shipping fake Execute button violates trust.
- CTO: "No shipping a button that calls NOT_WIRED code."

### B: Skip plan command, go straight to execution (rejected)
- Plan command has immediate CEO value even without execution
- CEO can review + modify plan before committing to execution

### C: Use external planning tool (rejected)
- Violates Thin Client Pattern (Invariant #1)
- EndiorBot should own the workflow end-to-end

---

## Consequences

### Positive
- CEO goes from "idea" to "structured plan with agent assignments" in one command
- Agents remember past decisions — reduced context loss across sessions
- Foundation for Phase 2 autonomous execution

### Negative
- Plan without Execute may feel incomplete to CEO (mitigated: clear "124b will add Execute")
- Memory adds ~300 tokens per agent call (within 2K budget)
- Memory persistence adds I/O (JSONL append, mitigated by async write)

### Risks
- Memory could store sensitive data → mitigated by scrubber + allowlist
- Plan quality depends on OpenAI response → mitigated by structured prompt + GoalDecomposer
- Memory facts could become stale → mitigated by 30-day TTL + relevance scoring

---

## References

- CTO review Sprint 124: "executeTaskWork() throws NOT_WIRED — core is stub"
- Sprint 72: AutonomousSessionManager, ModelSelector, FailureClassifier
- Sprint ~80: ClawVault memory (FactStore, SessionHandoff, ObservationScorer)
- ADR-001: Multi-Model Consultation (amended: OpenAI primary for consult)
- CLAUDE.md: 2K tokens/turn budget constraint
