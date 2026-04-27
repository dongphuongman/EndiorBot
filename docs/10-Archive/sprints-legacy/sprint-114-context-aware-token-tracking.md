# Sprint 114: Context-Aware Token Tracking & RL Enrichment

**Sprint Duration**: March 22-23, 2026
**Sprint Goal**: Add token usage tracking to agent calls, inject dynamic workspace context, expose `/cost` OTT command, and lay RL→SOUL prompt enrichment foundation.
**Status**: IN PROGRESS
**Priority**: P1
**Framework**: SDLC 6.2.0
**Authority**: CTO APPROVED (Sprint 113 review session)
**Previous Sprint**: Sprint 113 ✅ COMPLETE — Cross-System Agent Communication
**Related ADRs**: ADR-033 (RL Feedback), ADR-034 (Cross-System Protocol)

---

## Background

CTO reviewed @pm + @architect analysis of Claude Code architecture (10 components) and distilled 4 actionable deliverables for this sprint. Key insight: EndiorBot lacks token-level observability and workspace-aware context — both critical for cost governance and intelligent agent routing.

### CTO Decisions (from review)

| # | PM/Architect Proposal | CTO Verdict | Rationale |
|---|----------------------|-------------|-----------|
| 1 | Token tracking per call | ✅ APPROVED (T1) | P1 — must have for cost governance |
| 2 | Dynamic workspace context | ✅ APPROVED (T2) | P1 — `git branch + recent commits + diff stats` |
| 3 | `/cost` OTT command | ✅ APPROVED (T3) | P2 — aggregate from RL JSONL |
| 4 | RL→SOUL prompt enrichment | ✅ APPROVED (T4) | P2 — foundation only |
| 5 | Structured output parsing | ❌ REJECTED | Over-engineering — `JSON.parse` sufficient |
| 6 | Advanced context window mgmt | ❌ REJECTED | YAGNI — 2K token budget already works |
| 7 | Parallel tool execution | ❌ REJECTED | No real bottleneck yet |
| 8 | Permission escalation tiers | ❌ REJECTED | READ/PATCH/INTERACTIVE already sufficient |

---

## Sprint 114 Deliverables

### T1: Token Usage Tracking in Agent Calls (P1, 0.5d)

**Goal**: Every AI call records `inputTokens`, `outputTokens`, `totalTokens` in `AIResult`.

**New/Modified Files:**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/agents/channel-router.ts` | Parse `usage` from provider responses → populate `AIResult.tokenUsage` |
| MODIFY | `src/agents/types.ts` or relevant type file | Add `tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number }` to `AIResult` |
| MODIFY | `src/rl/data-store.ts` | Include `tokenUsage` in `RLRecord` JSONL output |

**Implementation Notes:**
- Anthropic API returns `usage.input_tokens` + `usage.output_tokens`
- OpenAI-compatible (AI-Platform) returns `usage.prompt_tokens` + `usage.completion_tokens`
- Ollama local: may not return usage — default to `{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }`
- MTClaw bridge: parse from MCP result if available, else estimate

**AC:**
- `RLRecord` JSONL includes `tokenUsage` field for every agent call
- `pnpm build` clean, existing tests pass

---

### T2: Dynamic Workspace Context Injection (P1, 1d)

**Goal**: Agent calls include workspace-aware context: current git branch, recent commits, diff stats.

**New Files:**

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/agents/intelligence/workspace-context.ts` | `getWorkspaceContext(repoPath)` → `{ branch, recentCommits, diffStats }` |

**Modified Files:**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/bridge/intelligence/turn-context.ts` | Inject workspace context into `TurnContext.dynamicContext` |

**`getWorkspaceContext()` returns:**
```typescript
interface WorkspaceContext {
  branch: string;              // current git branch
  recentCommits: string[];     // last 5 commit subjects
  diffStats: {                 // uncommitted changes summary
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  activeSprint?: string;       // from CURRENT-SPRINT.md (if parseable)
}
```

**Implementation Notes:**
- Use `child_process.execSync` for git commands (already used in codebase)
- `git rev-parse --abbrev-ref HEAD` → branch
- `git log --oneline -5 --format=%s` → recent commits
- `git diff --stat HEAD` → diff stats
- Non-git repos → return empty/null context (graceful)
- Cache for 60s (avoid repeated git calls in same turn)

**AC:**
- Agent calls include workspace context in system prompt when available
- Non-git directories work without errors
- Tests mock `execSync` — no real git dependency

---

### T3: `/cost` OTT Command (P2, 0.5d)

**Goal**: OTT users can check token usage and estimated cost via `/cost` command.

**New/Modified Files:**

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/commands/handlers.ts` | Add `executeCostCommand()` handler |
| MODIFY | `src/commands/index.ts` | Register `/cost` command |
| MODIFY | `src/commands/remote-handlers.ts` | Wire `/cost` for Telegram/Zalo |

**`/cost` output format:**
```
Token Usage (last 24h):
  Input:  12,340 tokens
  Output:  8,210 tokens
  Total:  20,550 tokens

Estimated Cost: ~$0.12
  Anthropic Sonnet: $0.09 (15,200 tokens)
  AI-Platform:      $0.00 (5,350 tokens, local)

Session tokens: 4,280 (this chat)
```

**Implementation Notes:**
- Read from `~/.endiorbot/rl-training-data/rl-*.jsonl` — aggregate `tokenUsage` fields
- Filter by timestamp (last 24h default, optional `--period 7d`)
- Cost estimation: use `src/budget/pricing-registry.ts` rates
- No new dependencies

**AC:**
- `/cost` returns token usage summary in Telegram/Zalo/Web
- Empty data → "No usage data available yet"
- Tests with mock JSONL data

---

### T4: RL → SOUL Prompt Enrichment Foundation (P2, 1d)

**Goal**: Create foundation for using RL feedback data to improve SOUL agent prompts dynamically.

**New Files:**

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/rl/prompt-enrichment.ts` | `getPromptEnrichment(agentKey)` → successful patterns for agent |

**Interface:**
```typescript
interface PromptEnrichment {
  agentKey: string;
  topPatterns: string[];       // successful response patterns (from +1 feedback)
  avoidPatterns: string[];     // failed patterns (from -1 feedback)
  sampleCount: number;         // total records analyzed
  lastUpdated: Date;
}

function getPromptEnrichment(
  agentKey: string,
  dataDir?: string,
): PromptEnrichment;
```

**Implementation Notes:**
- Read RL JSONL → filter by agent + feedback label
- Extract patterns: first 100 chars of successful responses → cluster by similarity (simple string overlap for now)
- Cache enrichment per agent (TTL 10min)
- Foundation only — actual prompt injection deferred to Sprint 115
- No ML dependencies — simple frequency analysis

**AC:**
- `getPromptEnrichment("sop")` returns patterns from RL data
- Empty data → returns empty patterns array
- Tests with fixture JSONL files

---

## Files Summary

| Action | File | Est. Lines |
|--------|------|-----------|
| CREATE | `src/agents/intelligence/workspace-context.ts` | ~80 |
| CREATE | `src/rl/prompt-enrichment.ts` | ~120 |
| MODIFY | `src/agents/channel-router.ts` | +20 |
| MODIFY | `src/agents/types.ts` (or relevant) | +10 |
| MODIFY | `src/rl/data-store.ts` | +5 |
| MODIFY | `src/bridge/intelligence/turn-context.ts` | +15 |
| MODIFY | `src/commands/handlers.ts` | +60 |
| MODIFY | `src/commands/index.ts` | +5 |
| MODIFY | `src/commands/remote-handlers.ts` | +10 |
| CREATE | `tests/agents/intelligence/workspace-context.test.ts` | ~100 |
| CREATE | `tests/rl/prompt-enrichment.test.ts` | ~80 |
| CREATE | `tests/commands/cost-command.test.ts` | ~60 |

**Total:** 4 new + 5 modified + 3 test files = 12 files, ~565 lines.

---

## CTO Constraints

| # | Constraint | Implementation |
|---|-----------|---------------|
| C1 | Token tracking must not break existing flow | Optional `tokenUsage` field — undefined if unavailable |
| C2 | No new npm dependencies | Git calls via `execSync`, JSONL parsing via built-in |
| C3 | RL enrichment = foundation only | No prompt injection in this sprint, just data extraction |
| C4 | `/cost` reads existing data | Aggregate from RL JSONL, no new storage |
| C5 | `exactOptionalPropertyTypes` | Conditional assignment pattern for all optional fields |

---

## Acceptance Criteria

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — no regressions
- [ ] T1: `RLRecord` includes `tokenUsage` for Anthropic + AI-Platform calls
- [ ] T2: `getWorkspaceContext()` returns branch/commits/diff in git repos
- [ ] T3: `/cost` command shows token usage summary in OTT channels
- [ ] T4: `getPromptEnrichment()` extracts patterns from RL JSONL

---

## Definition of Done

- [ ] All 4 deliverables implemented and tested
- [ ] 10+ new tests across 3 test files
- [ ] Sprint doc updated with final status
- [ ] CTO review score >= 8/10

---

**Created by**: @pm (following @cto Sprint 113 review decisions)
**Date**: 2026-03-22
