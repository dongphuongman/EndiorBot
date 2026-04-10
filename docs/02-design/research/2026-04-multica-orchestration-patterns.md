---
document_type: "Research Memo"
stage: "02 - DESIGN"
status: "ACCEPTED — ADOPT/ADAPT/REJECT decisions locked"
owner: "@pm + @architect"
reviewers: ["@cto (8/10 APPROVED with 3 binding conditions)", "@cpo (APPROVED with 5 conditions)"]
created: "2026-04-10"
source_repo: "https://github.com/multica-ai/multica"
sdlc_framework: "6.3.0"
related: ["ADR-044 (Federated OS)", "ADR-045 (CRG Client)", "ADR-046-STUB (Autonomous Execution Policy)", "Sprint 131 plan"]
---

# Multica Orchestration Patterns — Research & Portability Decisions

## Context

CEO asked @pm + @architect to research [Multica](https://github.com/multica-ai/multica) (5.4K stars, Apache-2.0, Go+TypeScript) before starting Sprint 131. Goal: identify porting-worthy patterns for orchestrating a seamless workflow between SDLC agents — **architectural patterns only, NOT a fork**.

---

## 1. Multica — Key Facts

| Dimension | Value |
|-----------|-------|
| Repo | https://github.com/multica-ai/multica |
| Stars | 5,433 (Apr 2026) |
| License | Modified Apache 2.0 (commercial SaaS restrictions) |
| Backend | Go (Chi + WebSocket + PostgreSQL + pgvector) |
| Frontend | TypeScript Next.js 16 + Electron |
| Architecture | Distributed daemon + central server |
| Agent providers | Claude Code CLI, Codex, OpenCode, OpenClaw, Hermes |
| Task coordination | @mention in comments → task queue |
| State management | Task state machine in PostgreSQL + WebSocket broadcast |

**One-liner:** *"Manages AI coding agents as autonomous team members, like assigning GitHub issues to teammates."*

---

## 2. 8 Core Multica Patterns

### Pattern 1 — Task Lifecycle State Machine

```
Queued → Dispatched → Running → Completed
                   ↘ Failed ↗
```

Stored in PostgreSQL, broadcast via WebSocket. Source: `server/internal/service/task.go`.

### Pattern 2 — Daemon Polling + Task Claim

Local daemon polls server every 3s, claims tasks with rotation fairness, spawns agent CLI in isolated workspace, streams output. Source: `server/internal/daemon/daemon.go`.

### Pattern 3 — @Mention-Driven Handoff ⭐ (Key Insight)

**Agents do NOT message each other directly.** They comment in issue threads with `@NextAgent` mentions. A handler detects mentions, validates permissions, and enqueues tasks.

```
Agent A finishes → comments "@AgentB please run tests"
→ System parses mention → enqueues task for AgentB
→ AgentB picks up same issue thread (context preserved)
```

**Safeguards:**
- Private agents require owner/admin mention permission
- Self-mentions blocked
- Duplicate pending tasks prevented
- Max handoff depth guarded

Source: `server/internal/handler/comment.go` + `handler/issue.go`.

### Pattern 4 — Unified Backend Interface

```go
type Backend interface {
    Execute(ctx, prompt, opts) (Session, Result)
}
```

Each provider (Claude/Codex/etc) is a separate subprocess driver with streaming message protocol. Source: `server/pkg/agent/`.

### Pattern 5 — WebSocket Event Bus

In-process event bus (`events/bus.go`) → WebSocket Hub (`realtime/hub.go`) broadcasts to connected clients. Slow-client detection prevents queue buildup.

### Pattern 6 — Isolated Workspace per Task

Daemon creates temp directory per task, injects:
- `CLAUDE.md` (agent persona/instructions)
- Issue details + trigger metadata
- Skill files (provider-specific)
- Repo URLs (cloned on-demand)

Source: `server/internal/daemon/execenv/execenv.go`.

### Pattern 7 — Skills Framework

PostgreSQL schema for versioned, shareable skills with metadata. Imports from ClawHub/skills.sh. Agents accumulate and share learned solutions across runs.

### Pattern 8 — Real-Time Streaming UI

WebSocket broadcasts all state changes to web + desktop (Electron) clients. Shows task queue, running agents, message streams, cost tracking.

---

## 3. EndiorBot Current State (from @architect audit)

EndiorBot already has substantial overlap with Multica's orchestration primitives, built across Sprint 40/74/106/124b. The detailed audit is in the exploration report; summary:

| Multica Pattern | EndiorBot Status | Key File |
|-----------------|------------------|----------|
| Task state machine | **PARTIAL** — session-level only, no per-task states | `sessions/autonomous/manager.ts` |
| Daemon polling + claim | **NO** — in-process only, no external daemon | N/A |
| @mention parsing | **ACTIVE** — regex + Ollama inference | `agents/orchestrator/mention-parser.ts` |
| @mention → handoff execution | **PARTIAL** — parsed but not auto-executed (CEO gate) | `agents/types/handoff.ts` |
| Unified backend interface | **ACTIVE** — ChannelRouter with fallback chain | `agents/channel-router.ts` |
| WebSocket event bus | **NO** — only in-process EventEmitter | `bus/` |
| Isolated workspace per task | **NO** — only file-level locking | `agents/parallel/file-lock-manager.ts` |
| Skills framework | **PARTIAL** — SOUL templates are static, no versioning | `bridge/intelligence/soul-loader.ts` |
| Real-time streaming UI | **NO** — CLI/OTT only, no dashboard | N/A |
| Goal decomposition | **ACTIVE** — 11 patterns, dependency graphs | `autonomy/goal-decomposer.ts` |
| Parallel execution | **EXISTS BUT UNWIRED** — engine not called by runLoop | `agents/parallel/` |
| Task → agent mapping | **ACTIVE** — 18 TaskTypes mapped | `sessions/autonomous/task-agent-mapper.ts` |
| Budget tracking | **ACTIVE** — tier-aware per-session | `sessions/autonomous/manager.ts` |
| Failure recovery | **ACTIVE** — FailureClassifier + RecoveryEngine | `sessions/recovery/` |

**Gap diagnosis (confirmed by CPO):** *"Primitives exist, not wired"* — the core insight. Closing gaps is **wiring work**, not feature work.

**On "~70%" figure:** CPO asked for a rubric or drop the number. Replacement phrasing: **"substantial overlap"**. No percentage claimed without a scoring rubric.

---

## 4. ADOPT — Patterns Worth Porting

Principles: (1) must fit ADR-044 boundary (EndiorBot = ADVISOR, not daemon), (2) must NOT fork Multica code, (3) must close a real EndiorBot gap.

### ADOPT 1 — Automatic @Mention-Driven Handoff (CEO-APPROVED DEFAULT)

**Decision:** APPROVED by CTO + CPO with CEO-approval default (not silent auto).

**Gap it closes:** `@pm` emits `HandoffRequest` JSON → sits waiting for CEO to manually run next agent. Pattern: parse the handoff in agent output, surface to CEO as proposal, dispatch on approval.

**Boundary (CPO C4, codified in ADR-046-STUB):**
> Auto-handoff = orchestration of **proposed** steps. Destructive/merge/deploy/patch actions remain gated by explicit CEO approval.

**Sprint 131 implementation:** CEO-approval default. Opt-in power mode via `ENDIORBOT_AUTO_HANDOFF=true`.

### ADOPT 2 — Per-Task State Machine (Read-Only Visibility)

**Decision:** APPROVED by CTO (C3) — read-only, no separate scheduler, no auto-progression.

**Gap it closes:** Tasks jump `pending → complete` with no visibility. CEO can't answer "what's happening right now?"

**Sprint 131 implementation:** Add `TaskState` enum, emit transitions from existing execution flow, display in `status` output. Pure observability.

### ADOPT 3 — Wire ParallelExecutor Into runLoop ⏸ DEFERRED TO SPRINT 132

**Decision:** CONDITIONAL — blocked on full ADR-046 (CTO C2).

**Rationale:** Wiring `ParallelExecutor` into `AutonomousSessionManager.runLoop()` changes autonomous execution behavior. CPO flagged this as crossing sovereignty lines without a written policy. Deferred until ADR-046 is complete.

---

## 5. ADAPT — Patterns with Modification (Deferred)

### ADAPT 1 — Skills Framework (DEFERRED INDEFINITELY)

**Decision:** CTO + CPO agreed — premature abstraction. SOUL templates change monthly, not daily. Versioning is speculative until a real problem surfaces.

### ADAPT 2 — Backend Interface (ALREADY DONE)

EndiorBot's `ChannelRouter` with provider fallback chain + Sprint 130's `ClaudeCodeProvider` is functionally equivalent. No work needed.

---

## 6. REJECT — Patterns NOT Worth Porting

### REJECT 1 — Daemon Architecture

EndiorBot is single-user, single-machine. No distributed execution. Adopting daemon would bloat product 2-3x solving a problem we don't have.

### REJECT 2 — WebSocket Streaming UI + Electron Desktop

ADR-044 scope violation. EndiorBot has Web UI (Gateway) + 3 OTT channels + CLI. Adding a dashboard is scope creep per [CLAUDE.md](../../../CLAUDE.md).

### REJECT 3 — PostgreSQL + pgvector Storage

Violates "no native deps" principle. Duplicates ClawVault. Adds sysadmin burden for single-user tool. Existing storage is sufficient for ADVISOR role.

---

## 7. Sprint 131 Locked Scope (4 Days)

Per CTO 8/10 + CPO approval:

| # | Item | Source | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Wire `enrichWithCRG()` into agent-launcher | Sprint 130 backlog | 1d | P0 |
| 2 | Auto-handoff from @mentions (CEO-approved default) | Multica ADOPT 1 | 1d | P0 |
| 3 | Per-task state machine (read-only visibility) | Multica ADOPT 2 | 0.5d | P1 |
| 4 | Knowledge erosion review prompt (opt-out) | Sau Sheong | 0.5d | P1 |
| 5 | Decision velocity metric in `/status` | Sau Sheong | 0.5d | P2 |
| 6 | Chat tool usage tracking | Sprint 130 | 0.5d | P2 |

**Full details:** `docs/04-build/sprints/sprint-131-crg-wiring-knowledge-velocity.md`

---

## 8. Binding Conditions Summary

| # | Source | Condition |
|---|--------|-----------|
| CTO C1 | CTO | Auto-handoff default = CEO approval. Opt-in auto via env var only. |
| CTO C2 | CTO | ParallelExecutor wiring → Sprint 132, blocked on ADR-046. |
| CTO C3 | CTO | Per-task state machine = read-only, no auto-progression. |
| CPO C4 | CPO | Mini-ADR (ADR-046-STUB) with binding sentence before code changes. |
| CPO C5 | CPO | CTO sign-off for any item touching `runLoop` or global task state. |

---

## 9. Decision Log

| Date | Decision | Authority |
|------|----------|-----------|
| 2026-04-10 | Research memo approved | CEO |
| 2026-04-10 | ADOPT 1 (auto-handoff) approved with CEO-approval default | CTO 8/10 + CPO |
| 2026-04-10 | ADOPT 2 (state machine) approved as read-only | CTO + CPO |
| 2026-04-10 | ADOPT 3 (parallel wiring) deferred to Sprint 132 | CTO + CPO |
| 2026-04-10 | ADAPT 1 (skills versioning) deferred indefinitely | CTO + CPO |
| 2026-04-10 | REJECT daemon + WebSocket + PostgreSQL | CTO + CPO |
| 2026-04-10 | ADR-046-STUB created with binding sentence | CPO C4 |

---

## References

- **Multica repo:** https://github.com/multica-ai/multica
- **ADR-044** — Agentic OS Alignment (ADVISOR boundary)
- **ADR-045** — Code Knowledge Graph Client
- **ADR-046-STUB** — Autonomous Execution Policy (binding sentence)
- **Sprint 131 plan** — `docs/04-build/sprints/sprint-131-crg-wiring-knowledge-velocity.md`
- **Sau Sheong article research** — `docs/02-design/strategic/2026-04-endiorbot-strategic-positioning.md`

---

*EndiorBot | SDLC Framework 6.3.0 — Multica Research Memo | 2026-04-10*
