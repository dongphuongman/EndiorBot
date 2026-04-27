# Sprint 101: Tier-Aware Routing + ClawVault Memory Foundation

**Sprint Duration**: March 11, 2026
**Sprint Goal**: Wire tier-aware model routing into production, port ClawVault memory foundation
**Status**: COMPLETE
**Priority**: P1 (Architecture Alignment + Memory Foundation)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED (0 MF, 2 SF, 3 Info) + CPO APPROVED
**Previous Sprint**: Sprint 100 COMPLETE — SASE 6.1.2 Full Alignment (+29/6,316)
**Tests**: +33 new (6,349 cumulative)

---

## Background

Two priorities converge in Sprint 101:

1. **CTO Sprint 100 F1**: `getAgentModel(agent, tier?)` defined in Sprint 100 but NOT called in production — `AGENT_MODEL_MAP[agent]` still used directly at `channel-router.ts:439` and `telegram-ott-adapter.ts:114`.

2. **CEO directive**: Research ClawVault structured memory system (v3.2.0, 466 tests) for EndiorBot adoption. Fit analysis completed: ADOPT observation scoring + fact store + session handoff; SKIP markdown vault, knowledge graph, hybrid search, workgraph; MODIFY wake/sleep lifecycle + fact conflict resolution.

---

## System Architecture — Sprint 101 Components

```
Layer 3: AGENT ROUTING (channel-router.ts — SSOT)
  ★ Wire getAgentModel(agent, tier) into callClaudeBridge()
  ★ New: workspace-tier-resolver.ts (reads .sdlc-config.json, local cache)

Layer 6: CONTEXT & MEMORY STACK
  ★ New: src/memory/ module (standalone — C5, no integration)
    ├── types.ts          — MemoryType, ScoredObservation, StructuredFact, SessionHandoff
    ├── observation-scorer.ts — importance scoring (confidence + importance)
    ├── fact-store.ts     — entity-relation-value + conflict resolution (per-project JSONL)
    ├── session-handoff.ts — workingOn/blocked/nextSteps/decisions/openQuestions
    └── index.ts          — barrel export
```

---

## Sprint 101 Deliverables

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Workspace Tier Resolver — local Map cache, sync read | DONE |
| 2 | Wire getAgentModel() in callClaudeBridge() — soft gating (warn + fallback) | DONE |
| 2 | Update telegram-ott-adapter.ts to use getAgentModel() | DONE |
| 3 | Memory types (MemoryType, ScoredObservation, StructuredFact, SessionHandoff) | DONE |
| 3 | Observation scorer — type-based importance defaults | DONE |
| 3 | Fact store — per-project JSONL, conflict resolution, in-memory indices | DONE |
| 3 | Session handoff — create, save, load latest | DONE |
| 3 | Memory barrel export | DONE |

---

## Phase 1: Workspace Tier Resolver

**New file**: `src/agents/workspace-tier-resolver.ts`

- `resolveWorkspaceTier(workspacePath)` → `ProjectTier`
- Local `Map<string, { tier: ProjectTier; expiresAt: number }>` — 10-min TTL (CTO SF-1: no perf module dependency)
- Pattern: `existsSync` + `readFileSync` + `JSON.parse` from `project-verifier.ts:244-255`
- Default: `ENTERPRISE` when no `.sdlc-config.json` or invalid tier

---

## Phase 2: Wire getAgentModel() into Production

### channel-router.ts (line ~439)

Before: `const model = AGENT_MODEL_MAP[agent] ?? "sonnet";`
After: `resolveWorkspaceTier(workspace) → getAgentModel(agent, tier) → soft gating (warn + sonnet fallback)`

### telegram-ott-adapter.ts (line ~114)

Before: `const model = AGENT_MODEL_MAP[agentName] ?? "sonnet";`
After: `getAgentModel(agentName) ?? "sonnet"` (no tier = ENTERPRISE default)

---

## Phase 3: ClawVault Memory Foundation

Port core ClawVault patterns into `src/memory/` module. **Standalone — no integration with existing systems (C5).**

| Pattern | ClawVault Source | EndiorBot Target |
|---------|-----------------|------------------|
| Memory types | `src/types.ts:157-170` | `src/memory/types.ts` |
| Observation scoring | `src/lib/observation-format.ts` | `src/memory/observation-scorer.ts` |
| Fact store | `src/lib/fact-store.ts` | `src/memory/fact-store.ts` |
| Session handoff | `src/commands/sleep.ts` | `src/memory/session-handoff.ts` |

Storage: `~/.endiorbot/memory/{projectId}/` (per-project scoping — CTO F2/F3)

---

## CTO Review Summary (8.5/10)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| SF-1 | Should-Fix | tierConfigCache async API mismatch | Local Map cache in resolver |
| SF-2 | Should-Fix | Phase 3 scope is large | Single sprint (option B), Phase 3 standalone (C5) |
| F1 | Info | OTT adapter change is cosmetic | Acknowledged — consistency improvement |
| F2 | Info | FactStore global vs per-workspace | Per-project scoping applied |
| F3 | Info | FactStore/handoff scoping consistency | Both per-project at `~/.endiorbot/memory/{projectId}/` |

**CTO Conditions:**
- C1: `pnpm build` passes (0 errors)
- C2: Existing 6,316 tests not decreased
- C3: `AGENT_MODEL_MAP` flat export unchanged
- C4: `getAgentModel()` without tier → ENTERPRISE default
- C5: Memory module standalone (no coupling to existing systems)
- C6: Soft gating only — log warning, never reject agent

**CPO Advisory:**
- CA1: Post-ship dogfood to verify tier mismatch logs
- CA2: Sprint 102 must clarify fact store vs Cross-Session Transfer roles

---

## Files Modified (~8)

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/agents/workspace-tier-resolver.ts` | 1 | NEW — resolveWorkspaceTier(), local cache |
| 2 | `src/agents/channel-router.ts` | 2 | callClaudeBridge() uses getAgentModel(agent, tier) |
| 3 | `src/channels/telegram/telegram-ott-adapter.ts` | 2 | Progress display uses getAgentModel() |
| 4 | `src/memory/types.ts` | 3 | NEW — MemoryType, ScoredObservation, StructuredFact, SessionHandoff |
| 5 | `src/memory/observation-scorer.ts` | 3 | NEW — scoreObservation(), filterByImportance() |
| 6 | `src/memory/fact-store.ts` | 3 | NEW — FactStore class, per-project JSONL, conflict resolution |
| 7 | `src/memory/session-handoff.ts` | 3 | NEW — createHandoff(), saveHandoff(), loadLatestHandoff() |
| 8 | `src/memory/index.ts` | 3 | NEW — barrel export |

---

## Deferred to Sprint 102+

| Item | Reason |
|------|--------|
| Hard tier gating (reject agent at tier) | Need monitoring data from soft gating |
| Wire memory into ConversationStore | Foundation must exist first |
| Observation compression pipeline (LLM) | Requires provider integration |
| Knowledge graph (wiki-links) | Complex — needs design sprint |
| Hybrid search (BM25 + semantic) | Requires embedding model |
| Context injection orchestration | Needs unified budget model |

---

**Last Updated**: 2026-03-11 (by @coder — Sprint 101 COMPLETE)
**Sprint Owner**: @coder (AI)
**Sprint Status**: COMPLETE
