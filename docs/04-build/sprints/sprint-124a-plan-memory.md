# Sprint 124a — Plan Command + Memory Integration

**Date:** 2026-03-31
**Status:** COMPLETE
**Prerequisite:** Sprint 123 COMPLETE (7,501 tests, bootstrap + polyglot + Docker)
**Framework:** SDLC 6.2.1 (bumped in Sprint 123 session, confirmed by CEO)
**Authority:** PM + Architect
**Reviews:** CTO 5/10 (split directive) + CPO (6 conditions)

---

## Context

CEO vision: *Seamless workflows for AI-assisted application development — EndiorBot growing more autonomous over time.*

Original Sprint 124 proposed 3 tracks. CTO verified code and found:
- T2 (AutonomousSessionManager) has `executeTaskWork() → throw NOT_WIRED` — **core is stub, 10-15h not 3-4h**
- T1 (plan command) and T3 (memory) are deliverable — **~12h total**

**Split:** 124a = T1 + T3 (immediate CEO value). 124b = T2 (real model execution, separate sprint).

---

## CTO Conditions (binding)

1. **C1 — Split 124a/124b.** This sprint = T1 (plan display-only) + T3 (memory injection). T2 deferred.
2. **C2 — T2 must wire to real providers.** No shipping buttons that call NOT_WIRED code.
3. **C3 — Gate B = "CEO approves every task."** True assisted autonomy after validation.
4. **C4 — Plan is display-only.** Show plan, save to disk, NO [Execute] until T2 complete.
5. **C5 — ADR-038 before implementation.**

## CPO Conditions (binding)

1. **C-CPO-1 — SDLC version 6.2.0.** No 6.2.1 without version bump ADR.
2. **C-CPO-2 — Memory safety policy.** Allowlist types, scrubber before persist/inject, TTL/eviction, opt-out flag.
3. **C-CPO-3 — Testable ACs.** Use deterministic metadata (`injectedFactsCount`, `factsWrittenCount`), not subjective output.
4. **C-CPO-4 — Scope clarity.** No checkpoint resume in 124a — retry+escalate only.
5. **C-CPO-5 — Plan saves to drafts.** `docs/04-build/sprints/drafts/`, not directly to sprints/.
6. **C-CPO-6 — Non-interactive defaults.** `--save-only` default, `--execute` requires T2.

---

## Scope (124a only)

### IN SCOPE

| Track | What | Est. |
|-------|------|------|
| T1 | `endiorbot plan "description"` — display-only, save to drafts | 6-8h |
| T3 | ClawVault memory → SOUL context injection + observation capture | 5-7h |

### OUT OF SCOPE (deferred to 124b)

| Item | Why |
|------|-----|
| `workflow execute` / AutonomousSessionManager | CTO C1: executeTaskWork() is stub, needs 10-15h |
| [E]xecute option in plan command | CTO C4: display-only until T2 complete |
| Resume from checkpoint | CPO C-CPO-4: Sprint 125+ |
| Bootstrap auto-comply | Depends on execution engine |
| SDLC 6.2.1 version bump | CPO C-CPO-1: needs version bump ADR |

---

## Track 1: `endiorbot plan` Command (Display-Only)

**CEO says idea → EndiorBot creates structured plan with tasks + agents.**

```bash
endiorbot plan "add payment gateway with Stripe integration"
```

**Output:**
```
┌─────────────────────────────────────────────────────────────┐
│  📋 Development Plan                                        │
├─────────────────────────────────────────────────────────────┤
│  Goal: Add payment gateway with Stripe integration          │
│  Tasks: 4 | Agents: @architect @coder @tester @reviewer     │
├─────────────────────────────────────────────────────────────┤
│  1. [@architect] Design payment API + write ADR              │
│  2. [@coder] Implement Stripe SDK integration               │
│  3. [@tester] Write payment flow tests                      │
│  4. [@reviewer] Security review (PCI compliance)            │
└─────────────────────────────────────────────────────────────┘

📝 Full plan:
────────────────────────────────────────────────────────────
[Full plan text from OpenAI expert]
────────────────────────────────────────────────────────────

Plan saved to: docs/04-build/sprints/drafts/plan-2026-03-31-payment-gateway.md
```

**Implementation:**
- CREATE: `src/commands/handlers/plan-handler.ts` — shared handler
  - Uses `consult` (OpenAI) with structured prompt for task decomposition
  - Uses GoalDecomposer (existing, `src/agents/orchestrator/`) for dependency ordering
  - Injects project context (IDENTITY.md + workspace) same as consult
  - Returns `PlanResult` with tasks array
- CREATE: `src/cli/commands/plan.ts` — CLI wrapper
  - Display-only (CTO C4)
  - Saves to `docs/04-build/sprints/drafts/` (CPO C-CPO-5)
  - Flags: `--save-only` (default), `--json`, `--tier`
  - No `--execute` flag until T2 is complete

**OTT parity:**
```
/plan add payment gateway with Stripe
→ "📋 Plan: 4 tasks (@architect → @coder → @tester → @reviewer). Saved to drafts."
```

**Files:**
| Action | File |
|--------|------|
| CREATE | `src/commands/handlers/plan-handler.ts` |
| CREATE | `src/cli/commands/plan.ts` |
| MODIFY | `src/cli/commands/register-all.ts` — register plan |
| MODIFY | `src/cli/commands/index.ts` — export |
| MODIFY | `src/commands/command-dispatcher.ts` — add /plan OTT |

---

## Track 3: Memory Integration (ClawVault → SOUL)

**Make agents learn from past sessions.**

### T3-A: Observation Capture (after agent execution)

After each agent response, score + save to FactStore:

```typescript
// After agent execution in channel-router.ts or bridge handler:
const observation: StructuredFact = {
  entity: projectId,
  relation: "agent_decision",
  value: summary,   // scrubbed (CPO C-CPO-2)
  metadata: {
    agent: agentRole,
    type: "decision" | "bugfix" | "discovery",
    sessionId,
    timestamp: new Date().toISOString(),
  },
};
factStore.addFact(observation);
```

**Memory safety policy (CPO C-CPO-2):**
- **Allowlist types:** decision, bugfix, discovery, architecture_choice. NO raw code, NO credentials.
- **Scrubber:** Run output-redactor (existing `src/bridge/security/output-redactor.ts`) before persist.
- **TTL:** Facts older than 30 days auto-evicted on next load.
- **Max facts per project:** 500 (FIFO eviction).
- **Opt-out:** `ENDIORBOT_MEMORY_DISABLED=true` in .env disables all memory.

### T3-B: Fact Injection (before agent launch)

Before loading SOUL, query FactStore for relevant context:

```typescript
// In context-builder.ts, after loading project context:
const facts = factStore.queryFacts(projectId, { limit: 5, minScore: 0.5 });
if (facts.length > 0) {
  const memoryBlock = formatFactsForInjection(facts); // max 300 tokens
  // Append to system message
}
```

**Budget:** max 300 tokens from memory (within 2K turn budget).

**Testable metadata (CPO C-CPO-3):**
- `injectedFactsCount: number` — returned in agent response metadata
- `factsWrittenCount: number` — returned after observation capture
- `factIdsUsed: string[]` — which facts were injected

**Files:**
| Action | File |
|--------|------|
| MODIFY | `src/agents/channel-router.ts` — add observation capture after AI response |
| MODIFY | `src/bridge/intelligence/context-builder.ts` — add fact injection |
| CREATE | `src/memory/memory-policy.ts` — allowlist, TTL, scrubber, opt-out |
| MODIFY | `src/memory/fact-store.ts` — add eviction, TTL |
| CREATE | `tests/memory/memory-integration.test.ts` |

---

## Execution Order

```
Sprint 124a (~12h):
├── ADR-038: Autonomous workflow design (CTO C5)           [1h]
├── T1: plan command (display-only)                         [6-8h]
│   ├── plan-handler.ts (task decomposition via consult)
│   ├── plan.ts (CLI + OTT parity)
│   ├── Save to drafts/ (CPO C-CPO-5)
│   └── Test: plan creates structured output
├── T3: Memory integration                                   [5-7h]
│   ├── memory-policy.ts (allowlist, scrubber, TTL)
│   ├── Observation capture after agent execution
│   ├── Fact injection before agent launch
│   └── Test: facts persisted + injected (deterministic metadata)
├── Build + full test suite
└── E2E: plan → save → next session has memory
```

---

## Acceptance Criteria (Testable — CPO C-CPO-3)

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | `endiorbot plan "X"` returns structured task list | Command output has `tasks[]` with `agent` + `description` fields |
| AC2 | Plan saved to `docs/04-build/sprints/drafts/` | File exists after command |
| AC3 | No `--execute` flag available | `endiorbot plan --help` shows no execute option |
| AC4 | OTT `/plan X` returns plan summary | Test via command dispatcher |
| AC5 | After agent execution, observation written to FactStore | **DEFERRED to 124a.1** — write path requires channel-router hot path wiring |
| AC6 | Before agent launch, facts injected into context | `context-builder.ts` loads from FactStore, `injectedFactsCount` tracked |
| AC7 | Memory policy scrubber function exists and strips secrets | `memory-policy.ts` `scrubFactValue()` unit testable |
| AC8 | `ENDIORBOT_MEMORY_DISABLED=true` disables all memory | Test: env set → no reads or writes |
| AC9 | Facts > 30 days evicted on load | Test: old fact not returned |

---

## Verification

```bash
# T1: Plan command
endiorbot plan "add user authentication with JWT"
# Verify: structured output, saved to drafts/

# T3: Memory
# Run any agent command, then check:
ls ~/.endiorbot/memory/  # facts.jsonl exists
endiorbot plan "related follow-up"
# Verify: response metadata includes injectedFactsCount

# Memory safety
ENDIORBOT_MEMORY_DISABLED=true endiorbot plan "test"
# Verify: no facts read or written

# Full suite
pnpm build && pnpm test  # 7,501+ tests
```

---

## Sprint 124b (Future — T2: Real Execution Engine)

Deferred per CTO C1. Requires:
- Wire `executeTaskWork()` to real providers (Claude Code Bridge for SE4A, OpenAI for consult)
- Gate B: CEO approves every task before execution
- Budget enforcement ($5 default)
- Failure recovery (FailureClassifier → RecoveryEngine → retry or escalate)
- Estimated: 10-15h separate sprint

---

## ADR Reference

- **ADR-038**: Autonomous Workflow Integration — plan → execute → verify → remember (MUST write before implementation per CTO C5)
