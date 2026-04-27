# ADR-044: Agentic OS Alignment — Research Outcome

**Status:** ACCEPTED
**Date:** 2026-04-03
**Sprint:** 129
**Authority:** PM + CTO (8/10 APPROVED) + CPO (APPROVED with conditions)
**SDLC Framework:** 6.3.0
**Traces:** ADR-036 (gstack), ADR-039 (Research Governance), ADR-042 (Execution Engine)
**Source:** Lâm Nguyễn — "Giải Phẫu Một Agentic Operating System" (18 Patterns)

---

## 1. Context

CEO directed the team to study Lâm Nguyễn's analysis of 18 architectural patterns observed in production agentic systems. The analysis was conducted across the NQH ecosystem's 3 products to validate existing architecture and identify gaps.

**Research question:** "Which patterns does EndiorBot already have, which should we adopt, and which don't apply?"

**CTO assessment (4/10 on initial adoption plan):** "8 sprints of uncommitted work sitting in working tree. Stop adopting patterns from a 513K LOC system that solve problems EndiorBot doesn't have." CTO validated 7 patterns already independently implemented; full analysis found 8/18 patterns present in EndiorBot (7 core + emergency prune). CTO rejected 4 adoption proposals and directed Sprint 129 = commit + push + stabilize.

---

## 2. Pattern Ownership Matrix — 3-Product Ecosystem (Federated AI OS)

The NQH ecosystem has 3 products implementing these patterns independently:

| Product | Role | Description |
|---------|------|-------------|
| **SDLC Orchestrator V2** | Control Plane | Gates, permissions, agent coordination (Python) |
| **MTClaw** | Runtime | Context compaction, token optimization, transcripts (Go) |
| **EndiorBot** | CLI + CEO Interface | Commands, chat, OTT channels (TypeScript) |

Each product remains independent. Cross-product interface alignment deferred to Framework 6.3.0.

### Pattern Distribution

| # | Agentic OS Pattern | V2 | MTClaw | EndiorBot | Notes |
|---|-------------------|-----|--------|-----------|-------|
| 1 | Async generator streaming | — | — | **Owner** | Provider chat() returns async |
| 2 | Microcompact (tool_use_id) | — | **Owner** | Future | ID-based compaction |
| 3 | Escalating recovery | S9b | — | **Implemented** | FailureClassifier → RecoveryEngine |
| 4 | Context compaction (LLM summarize) | — | **Owner** | **Implemented** | HistoryCompactor with provider-backed summarizer |
| 5 | CompactBoundaryEntry + Merkle hash | — | **Owner** | Future | Transcript integrity |
| 6 | Coordinator restriction | **S9a Owner** | — | **Implemented** | ChannelRouter orchestrates, agents execute |
| 7 | Worktree isolation | — | — | **Owner** | Claude Code Bridge tmux session isolation |
| 8 | Context defense (layered) | Constraints | Compact/summarize | **Implemented** | SessionIntelligenceEnvelope 3-layer |
| 9 | Permission classification | **S9a Owner** | — | **Implemented** | RiskClassifier 4-tier + DecisionReason |
| 10 | Skill discovery | — | — | **Owner** | CommandDispatcher + PHASE_1_WHITELIST |
| 11 | Concurrency partitioning | S10 | — | N/A | EndiorBot uses Promise.allSettled |
| 12 | Streaming tool execution | — | — | N/A | No tool_use blocks in EndiorBot streams |
| 13 | Context modifier chain | — | — | N/A | Premature abstraction for EndiorBot |
| 14 | Plugin architecture | — | — | N/A | Zero external users |
| 15 | Semantic pinning | — | S90 | Future | Pin active task objective in context |
| 16 | Emergency prune (truncation) | — | **Owner** | **Implemented** | MAX_HISTORY_TURNS=40 hard drop |
| 17 | Outcome metrics | — | S94 | Future | recovery_success_rate, completion_rate |
| 18 | Rollback per feature | — | — | **Implemented** | PatchManager commit/rollback |

**EndiorBot score: 8/18 independently implemented, 4 not applicable, 6 future/other product.**

---

## 3. EndiorBot's 7+1 Independently Validated Patterns

These patterns were built before the Agentic OS analysis — their presence validates EndiorBot's architecture:

| Pattern | EndiorBot Implementation | File |
|---------|------------------------|------|
| Async generator streaming | Provider chat() async interface | `src/providers/types.ts` |
| Escalating recovery | FailureClassifier + RecoveryEngine | `src/sessions/failure/`, `src/sessions/recovery/` |
| Coordinator restriction | ChannelRouter orchestrates, agents execute only | `src/agents/channel-router.ts` |
| Worktree isolation | Claude Code Bridge tmux session management | `src/bridge/launcher/` |
| Context defense | SessionIntelligenceEnvelope 3-layer (SOUL + project + workspace) | `src/bridge/intelligence/envelope.ts` |
| Permission classification | RiskClassifier 4-tier (READ/PATCH/INTERACTIVE) + DecisionReason | `src/agents/safety/risk-classifier.ts` |
| Skill discovery | CommandDispatcher + PHASE_1_WHITELIST + CHAT_SAFE_COMMANDS | `src/commands/command-dispatcher.ts` |
| Emergency prune | MAX_HISTORY_TURNS=40 hard drop in chat mode | `src/commands/handlers/chat-session-handler.ts` |

---

## 4. Rejected Proposals (CTO Rationale)

| # | Proposal | CTO Verdict | Rationale |
|---|----------|-------------|-----------|
| P1 | Concurrency partitioning | **REJECTED** | Promise.allSettled already handles concurrency; no shared mutable state in EndiorBot |
| P2 | Streaming tool execution | **REJECTED** | EndiorBot delegates tool execution to Claude Code Bridge; no tool_use blocks in its own streams |
| P3 | Context modifier chain | **DEFERRED** | buildTaskContext() reads completedTasks directly; adding a modifier chain is premature abstraction |
| P4 | Plugin architecture | **REJECTED** | Zero external users, zero plugin demand. Revisit only when external adoption materializes |

---

## 5. Cross-Product Alignment Decisions

### Terminology

- EndiorBot's history truncation aligns with MTClaw's "emergency prune" (renamed from "reactive compact")
- "Context compaction" = LLM-backed summarization (both EndiorBot HistoryCompactor and MTClaw implement this)
- "Context defense" has 3 owners at different layers: V2 = constraint rules, MTClaw = compact/summarize, EndiorBot = UI-level shaping (SessionIntelligenceEnvelope)

### Deferred Items

| Item | When | Why |
|------|------|-----|
| Shared CompactBoundaryEntry schema | Framework 6.3.0 | 3 products not yet integrated; premature to define shared transcript format |
| Governance Contract API (V2 ↔ MTClaw ↔ EndiorBot) | Post-pilot | Products operate independently per ADR-039; contract needed when they integrate |
| Pattern Ownership Matrix with team escalation | Team growth | Currently CEO owns all 3 products; team assignment unnecessary at current scale |

### Boundary Principles

- EndiorBot **MAY** operate fully standalone for CLI/OTT tasks
- EndiorBot **MAY** call MTClaw for context optimization in future sprints
- EndiorBot **MUST NOT** bypass V2 for destructive operations when integrated
- Each product has its own release cycle; no cross-product blocking dependencies

---

## 6. Key Insights

### "Build what you need, validate against best practices, don't cargo-cult"

EndiorBot independently implemented 8/18 patterns before the analysis. This proves the architecture is sound — driven by real requirements (Solo Developer Power Tool use cases), not by copying a reference system.

### "Federated AI OS" Mental Model

GPT's framing (from V2 review) provides a useful mental model for stakeholders:
- **V2 = Control Plane** (Kubernetes-like: gates, permissions, agent scheduling)
- **MTClaw = Runtime** (container-like: context management, token optimization, transcript integrity)
- **EndiorBot = CLI + Interface** (kubectl-like: user commands, chat, OTT channels)

This is a positioning model, not an architecture contract. No formal API between products exists yet.

### 3 Products Implementing Independently → Align Later

All 3 products are building the same patterns from the same book but in different languages (TypeScript, Python, Go) for different roles. This is intentional divergent evolution — each product solves its own domain problems. Convergence on shared interfaces (CompactBoundaryEntry, Governance Contract) will happen in Framework 6.3.0 when the products actually need to interoperate.

---

## Consequences

### Positive
- Architecture validated against industry-recognized patterns (8/18 independently present)
- Clear ownership boundaries prevent pattern duplication across products
- Research outcome documented for future reference

### Negative
- 3 cross-product items remain open (CompactBoundaryEntry, Governance Contract, escalation matrix)
- No immediate code changes from this ADR — research outcome only

### Risks
- Products may diverge further before Framework 6.3.0 alignment → mitigated by this ADR documenting shared terminology
- "Federated AI OS" framing may create premature integration expectations → mitigated by explicit "positioning model, not architecture contract" note

---

## References

- Lâm Nguyễn, "Giải Phẫu Một Agentic Operating System" (18 patterns analysis)
- MTClaw Sprint 90-94 plan (CTO 9.4/10, all 4 reviewers approved)
- SDLC Orchestrator V2 Sprint 9a-c plan (CTO approved with 6 hard conditions)
- ADR-036: gstack Best Practices Adoption
- ADR-039: Research Artifacts Governance
