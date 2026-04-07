# Sprint 124b — Autonomous Execution Engine

**Date:** 2026-04-03
**Status:** PLANNED
**Prerequisite:** Sprint 124a COMPLETE (plan command + memory), Sprint 126 COMPLETE (prompt caching + allowlist)
**Framework:** SDLC 6.3.0
**Authority:** PM + Architect — CTO 8/10 APPROVED
**ADR:** ADR-042

---

## CTO Conditions (binding)

1. **C1:** `callCloudFallback()` directly, NOT `callAI()`
2. **C2:** All 18 TaskType→Agent mappings defined
3. **C3:** `buildTaskContext()` = SOUL + sprint goal + dependency outputs + workspace
4. **C4:** PATCH guard: deployment/infrastructure/monitoring/configuration → throw
5. **C5:** Constructor injection of ChannelRouter

---

## Scope

| Track | What | Est. |
|-------|------|------|
| T1 | `task-agent-mapper.ts` — mappings + context builder + file extractor | 2h |
| T2 | `manager.ts` — wire executeTaskWork + constructor injection | 3h |
| T3 | Tests | 2-3h |

**Total: 6-8h**

---

## Files

| Action | File | Change |
|--------|------|--------|
| CREATE | `src/sessions/autonomous/task-agent-mapper.ts` | 18 mappings, buildTaskContext, extractFileReferences |
| MODIFY | `src/sessions/autonomous/manager.ts` | Wire executeTaskWork, constructor injection (C5) |
| MODIFY | `src/sessions/autonomous/types.ts` | Add `output?: string` to return type |
| CREATE | `tests/sessions/autonomous/task-agent-mapper.test.ts` | Mapping + context tests |
| CREATE | `tests/sessions/autonomous/execution-engine.test.ts` | executeTaskWork integration tests |

---

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | `executeTaskWork()` no longer throws NOT_WIRED | Unit test |
| AC2 | All 18 TaskType values map to correct agent | Unit test: each type |
| AC3 | PATCH tasks (deployment, infrastructure, monitoring, config) throw error | Unit test |
| AC4 | `callCloudFallback()` invoked with correct model tier | Mock test |
| AC5 | `buildTaskContext()` includes SOUL + sprint + deps (first 500 chars) | Unit test |
| AC6 | Budget enforcement still works after wiring | Existing tests pass |
| AC7 | Failure classification works end-to-end | Test: provider fails → retry |
| AC8 | Constructor accepts ChannelRouter | Type check + unit test |

---

## Verification

```bash
pnpm vitest run tests/sessions/autonomous/
pnpm build && pnpm test  # 7,530+ tests, 0 failures
```
