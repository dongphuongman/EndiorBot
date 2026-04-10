---
adr: 046
status: STUB — Full ADR Pending Sprint 132
date: 2026-04-10
title: "Autonomous Execution Policy"
authority: "CTO 8/10 + CPO Approval (Sprint 131 review)"
sdlc_framework: "6.3.0"
supersedes: []
referenced_by: ["Sprint 131 plan", "ADR-042 (Autonomous Execution Engine)", "ADR-044 (Agentic OS Alignment)"]
---

# ADR-046 (STUB): Autonomous Execution Policy

**Status:** STUB — binding sentence only. Full ADR to be written before Sprint 132.

## Binding Sentence (CPO C4)

> **Auto-handoff is orchestration of *proposed* steps. Destructive/merge/deploy/patch actions remain gated by explicit CEO approval. "Auto" means the system routes and schedules the next proposal; it does NOT mean the system executes without human review. ADR-044 (EndiorBot = ADVISOR) is preserved.**

## Why This Stub Exists

Sprint 131 introduces auto-handoff from `@mentions` (Multica ADOPT pattern). CPO required a documented boundary before allowing the wiring to land. CTO agreed: Sprint 131 ships the stub + CEO-approved default; full ADR follows in Sprint 132 when `ParallelExecutor` wiring is considered.

## What Sprint 131 Actually Implements

The stub binds Sprint 131 implementation to these rules:

1. **Handoff propagation requires CEO approval by default.** When an agent emits `HandoffRequest` JSON, the system surfaces it to CEO as `"@X proposes handoff to @Y. Approve? [y/n]"` and dispatches only on `y`.
2. **Opt-in power mode via env var.** `ENDIORBOT_AUTO_HANDOFF=true` skips the prompt, for CEO power users who trust specific workflows. NOT the default.
3. **Destructive actions still pass through existing gates.** PATCH mode, merges, deploys, and CRG-block operations remain gated regardless of handoff auto-dispatch.
4. **No parallel autonomous chains in Sprint 131.** `ParallelExecutor` wiring is explicitly deferred to Sprint 132 (blocked on full ADR-046).
5. **Gate B still holds.** Per Sprint 124b: CEO approves every task touching repo state before execution. Handoff proposals don't bypass Gate B.

## What Full ADR-046 Will Cover (Sprint 132)

- Gate B vs Gate C boundaries (what can auto-progress, under what conditions)
- `ParallelExecutor` wiring policy — when is parallel execution safe without CEO in the loop
- "Always auto" handoff mode per-agent allowlist (if any)
- Rollback policy for autonomous chains
- Relationship to Sprint 72 Autonomy Gates A/B/C
- Integration with PatchManager rollback primitives
- Audit trail requirements for any autonomous step

## Scope NOT Covered (Now or Sprint 132)

- Full autonomy at L4/L5 (Sau Sheong's levels)
- Cross-session learning / skill sharing
- Multi-CEO or team-level delegation (EndiorBot stays single-user per ADR-044)

---

## References

- **ADR-042** — Autonomous Execution Engine (Sprint 124b wiring)
- **ADR-044** — Agentic OS Alignment (ADVISOR boundary, LOCKED identity)
- **ADR-045** — Code Knowledge Graph Client (CRG for `@reviewer` / `@architect`)
- **Sprint 131 plan** — `docs/04-build/sprints/sprint-131-crg-wiring-knowledge-velocity.md`
- **Multica research** — `docs/02-design/research/2026-04-multica-orchestration-patterns.md`

---

*EndiorBot | SDLC Framework 6.3.0 — ADR-046 STUB | Full ADR pending Sprint 132*
