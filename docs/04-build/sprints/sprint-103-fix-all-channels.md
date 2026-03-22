# Sprint 103: /fix Dry-Run on All Channels

**Sprint Duration**: March 11, 2026
**Sprint Goal**: Make `/fix` execute ComplianceFixEngine dry-run on OTT/Web; `/fix --yes` redirects to Bridge mode
**Status**: IN PROGRESS
**Priority**: P0 (CEO Workflow Gap)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED (R2), CPO APPROVED WITH CONDITIONS
**Previous Sprint**: Sprint 102 COMPLETE — Unified Command Architecture (+0/6,349)
**Tests**: TBD
**ADR**: [ADR-031](../../02-design/01-ADRs/ADR-031-Channel-Command-Feature-Matrix.md)

---

## Background

Sprint 102 established the ADR-030 pattern: shared command handlers in `src/commands/handlers.ts` with structured returns, CLI wraps with spinners, OTT wraps with Markdown. However, `/fix` was left as display-only on OTT/Web — it returns instructions ("Use: @pm run compliance fix") instead of executing the ComplianceFixEngine.

When testing on the paperclip project, CEO discovered that switching from CLI to Telegram/Web breaks the SDLC compliance workflow. This is GAP-001 (P0) in the ADR-031 feature matrix.

### Design Decision: Strategy A (CTO C2)

The ComplianceFixEngine calls Claude Code `invokePatch()` per-task: O(N) calls, 60-180s total duration. OTT channels have no progress streaming — CEO would see silence for 2+ minutes.

**Strategy A** (approved by CTO R2):
- `/fix` (default) = **dry-run** via `createComplianceFixEngine({dryRun: true})` — safe, read-only, <3s
- `/fix --yes` = **redirect to Bridge mode** — avoids latency + security concerns

---

## System Architecture — Sprint 103 Changes

```
BEFORE (Sprint 102):
  /fix on OTT → handleFixCommand() → returns instruction text
  /fix on CLI → executeComplianceFix() → ComplianceFixEngine → invokePatch()

AFTER (Sprint 103):
  /fix on OTT → executeFixCommand() → dry-run engine result → Markdown summary
  /fix --yes on OTT → executeFixCommand() → Bridge mode redirect
  /fix on CLI → executeComplianceFix() → delegates dry-run to shared handler
  /compliance fix → alias → executeFixCommand() (CPO C3)
```

---

## Sprint 103 Deliverables

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Create `executeFixCommand()` shared handler | PENDING |
| 1 | Implement `formatFixResult()` OTT-friendly formatter | PENDING |
| 2 | Update `/fix` command registration to async handler | PENDING |
| 2 | Register `/compliance fix` alias (CPO C3) | PENDING |
| 3 | Refactor CLI compliance.ts dry-run path | PENDING |
| 4 | Tests: 8+ new | PENDING |
| 5 | Manual test: Web + Telegram | PENDING |

---

## Phase 1: Shared Handler

### `executeFixCommand()` — Correct API (CTO C1)

**Key corrections from CTO R2:**
- Use `createComplianceFixEngine()` factory, NOT `new ComplianceFixEngine(workspace)`
- Call `detectProject()` + extract `configTier`/`structureTier` for tier detection
- `ComplianceFixResult` uses `scoreBefore`/`scoreAfter` field names (not `before.score`)
- `determineTier()` is NOT exported — inline the tier logic

**Files:**
- `src/commands/handlers.ts` — Replace `handleFixCommand()` with `executeFixCommand()`
- Import: `detectProject` from `../../sdlc/scaffold/project-detector.js`
- Import: `createComplianceFixEngine` from `../../sdlc/compliance/fix-engine.js`

### Invariants (CTO + CPO conditions)

| Invariant | Source |
|-----------|--------|
| No `fmt` or CLI-specific imports in shared handler | CTO observation |
| Tier detection required before engine creation | CTO C1 |
| `--yes` on OTT redirects to Bridge mode (no autoConfirm) | CTO C2 / CPO C1 |
| `exactOptionalPropertyTypes` pattern for optional fields | Memory |
| Dry-run result includes bounded summary (CPO C2) | CPO C2 |

---

## Phase 2: Command Registration

```
/fix → executeFixCommand(args, workspace)          // async shared handler
/compliance fix → executeFixCommand(args.slice(1))  // alias (CPO C3)
/compliance → handleComplianceCommand(args)          // existing check
```

---

## Phase 3: CLI Refactor

Refactor `src/cli/commands/compliance.ts` dry-run path to call `executeFixCommand()`. CLI adds:
- Spinner during engine execution
- Colored output with `fmt`
- `process.exit(1)` for errors

---

## Phase 4: Tests

| # | Test | Assertion |
|---|------|-----------|
| 1 | `/fix` with workspace → dry-run | Returns ComplianceFixResult summary |
| 2 | `/fix --yes` → Bridge mode redirect | Response contains `/launch` + `/send` instructions |
| 3 | `/fix --stage 01-planning` → filtered dry-run | Only stage 01 results |
| 4 | `/fix` without workspace → error | "No workspace focused" |
| 5 | `/fix` with invalid project (no .sdlc-config) → error | "Cannot detect project tier" |
| 6 | `/compliance fix` alias → same as `/fix` | Alias works |
| 7 | `/compliance` (no "fix") → existing check | Existing behavior preserved |
| 8 | CLI dry-run delegates to shared handler | Same result, CLI formatting |

---

## CTO Conditions (all resolved in ADR-031 R2)

| # | Condition | Resolution |
|---|-----------|------------|
| C1 | Wrong ComplianceFixEngine API | Fixed: `createComplianceFixEngine()` factory + tier detection |
| C2 | OTT latency 60-180s | Strategy A: dry-run direct, --yes → Bridge |
| C3 | autoConfirm security | Resolved by C2 |
| C4 | GAP-005 naming | `/compliance fix` alias in Sprint 103 |

## CPO Conditions (Sprint 103 scope)

| # | Condition | Resolution |
|---|-----------|------------|
| C1 | Explicit confirmation for --yes | Redirects to Bridge mode |
| C2 | Progressive Trust T3 alignment | Bounded summary in formatFixResult() |
| C3 | Keep /fix, add alias | `/compliance fix` alias registered |

---

## Files Modified

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/commands/handlers.ts` | 1 | Replace `handleFixCommand()` → `executeFixCommand()` + `formatFixResult()` |
| 2 | `src/commands/index.ts` | 2 | Async `/fix` registration + `/compliance fix` alias |
| 3 | `src/cli/commands/compliance.ts` | 3 | Delegate dry-run to shared handler |
| 4 | `tests/commands/fix-command.test.ts` | 4 | New: 8+ tests |

---

## Definition of Done

- [ ] `/fix` on OTT executes ComplianceFixEngine dry-run (not display instructions)
- [ ] `/fix --yes` on OTT redirects to Bridge mode with clear instructions
- [ ] `/fix --stage 01-planning` works on OTT (dry-run filtered)
- [ ] `/compliance fix` alias registered (CPO C3)
- [ ] No `fmt` or CLI-specific imports in shared handler
- [ ] Tier detection via `detectProject()` before engine creation (CTO C1)
- [ ] No-workspace returns helpful error
- [ ] CLI compliance fix still works (regression)
- [ ] 8+ new tests passing
- [ ] `pnpm build && pnpm test` passes

---

**Last Updated**: 2026-03-11 (by @pm — Sprint 103 IN PROGRESS)
