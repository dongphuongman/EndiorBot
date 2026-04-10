---
sprint: 131
status: ACTIVE
start_date: 2026-04-10
framework: "6.3.0"
authority: "CTO 8/10 APPROVED + CPO APPROVED with conditions"
adrs: ["ADR-045 (CRG Client)", "ADR-044 (Federated OS)", "ADR-046-STUB (Autonomous Execution Policy)"]
strategic_memo: "docs/02-design/strategic/2026-04-endiorbot-strategic-positioning.md"
multica_research: "docs/02-design/research/2026-04-multica-orchestration-patterns.md"
---

# Sprint 131 — CRG Wiring + Auto-Handoff (CEO Approved) + Small UX Wins

## Context

Sprint 131 executes existing roadmap + **one** Multica orchestration pattern (auto-handoff with CEO approval default). No strategic pivot. No scope creep. Both CTO and CPO reviewed and locked scope at 4 days.

**Key principle (CPO):** Treat Multica ADOPT as **executor plumbing**, not repositioning to "pipeline platform". Stays compatible with ADR-044 because **CEO approval remains the default** for anything that changes repo state or deploys. "Auto-handoff" = routing and scheduling, NOT silent autonomy.

**Deferred to Sprint 132 (blocked on ADR-046):**
- ParallelExecutor wiring into `runLoop`
- "Always auto" handoff mode
- Any autonomous chain execution without CEO in the loop

---

## Locked Scope — 4 Days

| # | Item | Source | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Wire `enrichWithCRG()` into agent-launcher | Sprint 130 backlog | 1d | P0 |
| 2 | **Auto-handoff from @mentions (CEO-approved default)** | Multica ADOPT 1 | 1d | P0 |
| 3 | **Per-task state machine (read-only visibility)** | Multica ADOPT 2 | 0.5d | P1 |
| 4 | Knowledge erosion review prompt (opt-out env var) | Sau Sheong | 0.5d | P1 |
| 5 | Decision velocity metric in `/status` | Sau Sheong | 0.5d | P2 |
| 6 | Chat tool usage tracking | Sprint 130 | 0.5d | P2 |

**Total: 4 days execution + CEO validation.**

---

## Binding Conditions (CTO + CPO)

| # | Source | Condition |
|---|--------|-----------|
| **C1** | CTO + CPO | **Auto-handoff = CEO-approved default.** Handoff JSON surfaced to CEO as `"@pm proposes handoff to @architect. Approve? [y/n]"`. On `y`, system dispatches. No silent chains. Opt-in auto mode via `ENDIORBOT_AUTO_HANDOFF=true` for power users only (documented but not default). |
| **C2** | CTO | **ParallelExecutor wiring → Sprint 132.** Blocked on ADR-046 "Autonomous Execution Policy". Sprint 131 does NOT touch parallel execution. |
| **C3** | CTO | **Per-task state machine = read-only visibility.** States update from existing execution flow. NO separate scheduler. NO auto-progression. For CEO observability only. |
| **C4** | CPO | **Mini-ADR sentence required:** "Auto-handoff = orchestration of proposed steps; destructive/merge/deploy actions remain gated." Captured in ADR-046-STUB below. |
| **C5** | CPO | **CTO sign-off required** before any Multica item touches `AutonomousSessionManager.runLoop`, `ParallelExecutor`, or global task state. Sprint 131 items stay within these boundaries. |
| **C6** | CTO (Sprint 130) | Knowledge erosion prompt opt-out via `ENDIORBOT_SKIP_REVIEW_PROMPT=true`. |
| **C7** | CTO (Sprint 130) | Tool usage counters stored in existing `ChatSessionData` session JSON, no new storage path. |

---

## Deliverable Detail

### P0.1 — Wire `enrichWithCRG()` Into Agent Launcher (1 day)

**Current state:**
- `src/graph/client.ts` — CRG HTTP client (shipped Sprint 130)
- `src/cli/commands/devops.ts` — `ops graph status/impact/find/overview` CLI commands
- `src/bridge/intelligence/context-builder.ts:111` — `enrichWithCRG()` function defined but no caller

**Work:**
1. `src/bridge/agent-launcher.ts` — after `buildContextEnvelope()`, call `enrichWithCRG(envelope, agentRole, repoId, changedFiles)` when `agentRole` ∈ `GRAPH_AWARE_AGENTS` (reviewer, architect, coder, tester)
2. `src/bridge/intelligence/envelope-builder.ts` — propagate `envelope.graphContext` into final serialized context string injected to agent
3. Determine `changedFiles` best-effort via `git diff --name-only HEAD` in current project (fail-soft if not a git repo)

**Kill criteria (ADR-045):** 10-session evaluation. If average token reduction < 3x → remove `graphContext` injection (keep CLI commands for manual use).

### P0.2 — Auto-Handoff from @Mentions (CEO-Approved Default) (1 day)

**Current state:**
- `src/agents/orchestrator/mention-parser.ts` — parses `@agent` / `@team` mentions (ACTIVE Sprint 74)
- `src/agents/types/handoff.ts` — `HandoffRequest` schema + `ALLOWED_TRANSITIONS` map + `maxDepth=3` guard
- `src/sessions/autonomous/manager.ts` — `AutonomousSessionManager` has `addTask()` and event system
- **Gap:** when an agent output contains `HandoffRequest` JSON, it's ignored. CEO must manually run the next agent.

**Work:**
1. `src/agents/orchestrator/mention-parser.ts` — add `parseHandoffFromAgentOutput(output: string): HandoffRequest | null` helper. Looks for `"handoffs": [...]` JSON block or trailing `@agent ...` mentions.
2. `src/sessions/autonomous/manager.ts` — after `executeTask()` returns, call new `processHandoffsFromResult()`:
   - Extract handoffs from result
   - Validate each against `ALLOWED_TRANSITIONS` + `maxDepth` + self-mention guard + duplicate-task guard
   - For each valid handoff, emit `handoff:proposed` event with `{from, to, intent, priority}`
3. `src/cli/commands/chat.ts` + `src/commands/handlers/chat-session-handler.ts` — listen for `handoff:proposed` events, show prompt:
   ```
   📋 Handoff proposed: @pm → @architect
   Task: "Design caching layer for auth service"
   Approve? [y] yes  [n] skip  [d] show details
   ```
4. On `y`, enqueue the handoff as a new task via existing `addTask()` path.
5. **Opt-in power mode:** If `ENDIORBOT_AUTO_HANDOFF=true`, skip the prompt and auto-enqueue. NOT default. Document in `.env.example` with warning.

**Kill criteria:** If auto-handoff causes > 3 unintended agent invocations across 10 sessions → revert to purely manual (no handoff proposal events).

**Reuses:**
- `ALLOWED_TRANSITIONS` map (already validates SE4H advisors cannot delegate, coder→reviewer/tester, etc.)
- `HandoffRequest` schema
- `AutonomousSessionManager.addTask()` + event system

### P1.1 — Per-Task State Machine (Read-Only Visibility) (0.5 day)

**Current state:** Tasks transition `pending → executing → complete` with no intermediate visibility. `WorkflowEngine` has step-level states but not per-task.

**Work:**
1. `src/autonomy/types.ts` — add `TaskState` enum: `queued | dispatched | running | verifying | completed | failed | cancelled`. Add `state: TaskState` field to `Subtask`.
2. `src/sessions/autonomous/manager.ts` — emit state transitions at existing flow points:
   - `addTask()` → `queued`
   - `getNextTask()` returns task → `dispatched`
   - `executeTask()` start → `running`
   - After `callCloudFallback()` returns → `verifying` (briefly, during budget recording + event emission)
   - On success → `completed`
   - On error → `failed`
3. `src/cli/commands/status.ts` — display current task states in `status` output under "Active tasks:" section

**Constraint (C3):** NO auto-progression, NO separate scheduler. States are updated from existing execution flow only. Pure observability.

**Kill criteria:** If state machine adds log noise without improving CEO decision-making → simplify back to `pending/running/complete`.

### P1.2 — Knowledge Erosion Review Prompt (0.5 day)

**Trigger:** After agent task completes in chat mode AND `result` indicates file modifications.

**UX:**
```
Agent completed: modified config.yaml (3 lines changed)
Brief: Updated api.model to translategemma:12b for AI-Platform integration
Understood? [y] yes  [d] show diff  [e] explain more
```

**Branches:**
- `y` → continue to next prompt
- `d` → show git diff, then re-prompt
- `e` → ask agent to explain in plain language, then re-prompt

**Opt-out (C6):** `ENDIORBOT_SKIP_REVIEW_PROMPT=true` env var disables the prompt entirely.

**File:** `src/cli/commands/chat.ts` — after `processChatTurn` returns, check result for modifications and env var

**Risk accepted:** Prototype without persistence. If scaled to production, needs separate storage + analytics (future sprint).

### P2.1 — Decision Velocity Metric (0.5 day)

**Definition (exact):** For each `endiorbot plan` invocation in last 7 days, measure time until first `endiorbot agent` command references any task from that plan (match by slug). Report median. Skip plans with no matching execution.

**Work:**
1. `src/metrics/aer-calculator.ts` — add `computeDecisionVelocity(windowDays: number): number | null` method. Reuses existing audit log.
2. `src/cli/commands/status.ts` — add one line:
   ```
   Decision velocity: 12 min (median plan → first execution, last 7 days)
   ```

**Kill criteria:** If CEO doesn't check the metric in 2 weeks → remove line.

### P2.2 — Chat Tool Usage Tracking (0.5 day)

**Work:**
1. `src/commands/handlers/chat-session-handler.ts` — add `toolUsage: { read: number; grep: number; glob: number; ls: number }` field to `ChatSessionData`, initialize to zeros
2. `src/cli/commands/chat.ts` — in each tool case (`/read`, `/grep`, `/glob`, `/ls`), increment the counter before dispatch
3. **Privacy (CPO refinement 5):** Counters are integers only. No content logged. Stored locally at `~/.endiorbot/sessions/chat-<uuid>.json`. Retention: indefinite until CEO deletes.

**Constraint (C7):** Reuses existing session JSON path. No new storage.

---

## ADR-046-STUB — Autonomous Execution Policy (CPO C4)

**This sentence is binding until ADR-046 is fully written (target: before Sprint 132):**

> Auto-handoff is orchestration of **proposed** steps. Destructive/merge/deploy/patch actions remain gated by explicit CEO approval. "Auto" means the system routes and schedules the next proposal; it does NOT mean the system executes without human review. ADR-044 (EndiorBot = ADVISOR) is preserved.

**File to create:** `docs/02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy-STUB.md` — placeholder pointing to full ADR in Sprint 132.

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `docs/02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy-STUB.md` | **CREATE** | CPO C4 binding sentence |
| `docs/02-design/research/2026-04-multica-orchestration-patterns.md` | **CREATE** | Research findings (this memo + plan file excerpt) |
| `src/bridge/agent-launcher.ts` | MODIFY | P0.1 CRG enrichment |
| `src/bridge/intelligence/envelope-builder.ts` | MODIFY | P0.1 propagate graphContext |
| `src/agents/orchestrator/mention-parser.ts` | MODIFY | P0.2 parseHandoffFromAgentOutput |
| `src/sessions/autonomous/manager.ts` | MODIFY | P0.2 processHandoffsFromResult + P1.1 state transitions |
| `src/cli/commands/chat.ts` | MODIFY | P0.2 handoff prompt + P1.2 knowledge prompt + P2.2 counters |
| `src/commands/handlers/chat-session-handler.ts` | MODIFY | P0.2 handoff event listener + P2.2 toolUsage field |
| `src/autonomy/types.ts` | MODIFY | P1.1 TaskState enum |
| `src/cli/commands/status.ts` | MODIFY | P1.1 task states + P2.1 velocity metric |
| `src/metrics/aer-calculator.ts` | MODIFY | P2.1 computeDecisionVelocity |
| `.env.example` | MODIFY | Document ENDIORBOT_AUTO_HANDOFF + ENDIORBOT_SKIP_REVIEW_PROMPT |

---

## Verification

```bash
# Build + tests must stay green
pnpm build
pnpm test  # baseline: 7,601 tests, 0 failures

# P0.1 — CRG enrichment
endiorbot agent @reviewer "review src/graph/client.ts" --verbose
# Expected: verbose output shows graphContext with blast radius info

# P0.2 — Auto-handoff (CEO-approved default)
endiorbot chat
# User: "@pm plan sprint 132 and hand off to architect for design"
# Expected: PM completes → prompt "Handoff proposed: @pm → @architect. Approve? [y/n/d]"
# On y → architect auto-enqueues and runs
# On n → no architect invocation

# P0.2 — Opt-in power mode
ENDIORBOT_AUTO_HANDOFF=true endiorbot chat
# Expected: handoffs dispatch without prompt

# P1.1 — Task state machine
endiorbot status
# Expected: "Active tasks: task-123 [running], task-124 [queued]"

# P1.2 — Knowledge prompt
endiorbot chat
# User: "fix the typo in config.yaml"
# Expected: agent modifies, then prompt "Understood? [y/d/e]"

# P1.2 — Opt-out
ENDIORBOT_SKIP_REVIEW_PROMPT=true endiorbot chat
# Expected: no review prompt

# P2.1 — Decision velocity
endiorbot status
# Expected: "Decision velocity: N min (median plan → first execution, last 7 days)"

# P2.2 — Tool counters
endiorbot chat
# User runs /read, /grep, /glob, /ls
# Check ~/.endiorbot/sessions/chat-*.json — toolUsage counters incremented
```

---

## NOT In Scope (Explicit)

Per CTO C2 and CPO:
- ParallelExecutor wiring into `runLoop` (Sprint 132, blocked on ADR-046)
- "Always auto" handoff mode (default is CEO approval; opt-in only via env var)
- Autonomous chain execution without CEO in the loop
- Strategic pivot based on Sau Sheong article
- Option A/B/C commitment
- Full ADR-046 (stub only in Sprint 131)
- Skills versioning (deferred indefinitely)
- WebSocket streaming UI
- PostgreSQL persistence
- Daemon architecture
- New agent capabilities beyond CRG enrichment
- Citizen dev surface (Web UI)

---

## Sprint 132 Pre-Commitments (Blocked on ADR-046)

These are noted here for continuity but NOT part of Sprint 131:

1. Write full ADR-046 "Autonomous Execution Policy" (Gate B vs Gate C, what can auto-progress)
2. Wire `ParallelExecutor` into `AutonomousSessionManager.runLoop()`
3. Evaluate whether "always auto" handoff mode can be enabled per-agent

---

## Privacy Statement

- Chat session JSON: `~/.endiorbot/sessions/chat-<uuid>.json` (local only, no telemetry)
- Tool usage counters: integers only, no content logged
- CRG queries: go to AI-Platform via existing `AI_PLATFORM_API_KEY` (same trust boundary as MTClaw bridge)
- Handoff proposals: stored in-memory in session, not persisted beyond session end
- Task states: in-memory only, logged to audit trail like existing task events

---

*EndiorBot Sprint 131 | SDLC Framework 6.3.0 | CTO 8/10 + CPO Approved with Conditions*
