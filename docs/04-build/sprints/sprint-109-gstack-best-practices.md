# Sprint 109: gstack Best Practices Adoption — SOUL Governance + /sprint-close

**Sprint Duration**: March 2026
**Sprint Goal**: Apply gstack patterns to EndiorBot: `allowed-tools` governance metadata for all 13 SOUL files, `pnpm lint:souls` schema validator, and `/sprint-close` automated command (thin-client)
**Status**: ✅ COMPLETE
**Priority**: P0 (SOUL governance + lint:souls) | P0 (sprint-close automation)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED + CPO APPROVED — [plan approved 2026-03-15]
**Previous Sprint**: Sprint 108 PLANNED — Async Notifications (notifyFn + Zalo + metrics)
**Tests**: ~3 new tests (lint:souls validation)
**ADR**: N/A — gstack pattern adoption (governance, not architecture change)
**Plan**: [quiet-jumping-bee.md](~/.claude/plans/quiet-jumping-bee.md)

---

## Background

gstack research (2026-03-15) identified 7 patterns applicable to EndiorBot. CTO + CPO approved 3 immediate actions for Sprint 109:

| Gap | Symptom | Fix |
|-----|---------|-----|
| **GAP-109-1** | SOUL-*.md files lack `allowed-tools` metadata — no governance on which Claude Code tools each agent persona should use | Add `allowed-tools` YAML frontmatter to all 13 SOUL files |
| **GAP-109-2** | No schema validation for SOUL frontmatter — fields can drift without detection | `scripts/lint-souls.ts` + `pnpm lint:souls` |
| **GAP-109-3** | Sprint close requires manual steps (update docs, run tests, build, commit) — error-prone and slow | `/sprint-close` custom command: automated, thin-client, push opt-in |

**gstack reference**: `allowed-tools` YAML frontmatter per skill (enforced tool restrictions), `/ship` non-interactive automation.

---

## Sprint 109 Deliverables

### P0-1: `allowed-tools` in All 13 SOUL Files

Add `allowed-tools` field to existing YAML frontmatter in all 13 SOUL files. These are **documentation/governance metadata** — Phase 1 value. Phase 2 (runtime enforcement in `claude-code-bridge.ts`) is tracked as technical debt for Sprint 112+.

**Tool names** must match actual Claude Code tool identifiers: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `AskUserQuestion`

| # | File | Category | allowed-tools |
|---|------|----------|---------------|
| 1 | `SOUL-architect.md` | executor | Read, Write, Grep, Glob, WebFetch, AskUserQuestion |
| 2 | `SOUL-assistant.md` | router | Read, AskUserQuestion |
| 3 | `SOUL-ceo.md` | advisor | Read, Grep, Glob, AskUserQuestion |
| 4 | `SOUL-coder.md` | executor | Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion |
| 5 | `SOUL-cpo.md` | advisor | Read, Grep, Glob, AskUserQuestion |
| 6 | `SOUL-cto.md` | advisor | Read, Grep, Glob, AskUserQuestion |
| 7 | `SOUL-devops.md` | executor | Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion |
| 8 | `SOUL-fullstack.md` | executor | Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion |
| 9 | `SOUL-pjm.md` | executor | Read, Write, Glob, AskUserQuestion |
| 10 | `SOUL-pm.md` | executor | Read, Write, Glob, AskUserQuestion |
| 11 | `SOUL-researcher.md` | executor | Read, Grep, Glob, WebFetch, WebSearch, AskUserQuestion |
| 12 | `SOUL-reviewer.md` | executor | Read, Write, Grep, Glob, AskUserQuestion |
| 13 | `SOUL-tester.md` | executor | Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion |

**Design notes (CTO F1 addressed):**
- `advisor` roles (ceo, cpo, cto): Read-only + AskUserQuestion — no code writes, no shell
- `reviewer`: Write (for review documents/comments), no Edit/Bash (cannot modify source)
- `tester`: Edit included (to fix flaky tests, update assertions) — CTO F1 correction from plan
- `researcher`: WebFetch + WebSearch — no writes to codebase

**Files modified:** 13 × `docs/reference/templates/souls/SOUL-*.md`

---

### P0-2: `scripts/lint-souls.ts` Schema Validator

Validates SOUL frontmatter schema on every build. Catches missing fields and invalid tool names.

**Validation rules:**
1. File has YAML frontmatter (between `---` markers)
2. Required fields present: `role`, `category`, `version`, `allowed-tools`
3. `category` ∈ `["executor", "advisor", "router"]`
4. `allowed-tools` is a list, all items ∈ valid Claude Code tools set
5. No unknown `allowed-tools` values (typos caught immediately)

**Valid tools set:**
```
Bash, Read, Write, Edit, Grep, Glob, WebFetch, WebSearch, Agent, AskUserQuestion
```

**Output format:**
```
✅ SOUL-architect.md — OK
✅ SOUL-coder.md — OK
❌ SOUL-pm.md — missing required field: allowed-tools
❌ SOUL-reviewer.md — unknown tool: Reade (did you mean Read?)
Errors: 2
```

**Files created:**
- `scripts/lint-souls.ts` (~60 lines)
- `package.json` — add `"lint:souls": "tsx scripts/lint-souls.ts"` (uses existing tsx, not bun — consistency with build toolchain)

**Tests:** `tests/scripts/lint-souls.test.ts` — 3 tests:
- T1: Valid SOUL passes lint
- T2: Missing `allowed-tools` → error
- T3: Unknown tool name → error with suggestion

---

### P0-3: `/sprint-close` Custom Command

Automates sprint close workflow. Thin-client pattern: `.md` calls `./endiorbot.mjs sprint close`.

**CLI wiring pattern (CTO C1 + SF-1 confirmed):**
```
src/cli/commands/sprint-close.ts     ← NEW (registerSprintCloseCommand)
src/cli/commands/index.ts            ← ADD export
src/cli/commands/register-all.ts     ← ADD import + registerSprintCloseCommand(program)
.claude/commands/sprint-close.md     ← NEW (thin wrapper → ./endiorbot.mjs sprint close)
```

**Command interface:**
```
./endiorbot.mjs sprint close [--sprint <N>] [--score <score>] [--push]
```

**Workflow steps (abort on failure — CPO C2):**
```
1. pnpm build          → if fail: print error, EXIT 1
2. pnpm test           → if fail: print error, EXIT 1
3. Detect sprint number from CURRENT-SPRINT.md (or --sprint <N>)
4. Update sprint-{N}.md: Status → COMPLETE
5. Update SPRINT-INDEX.md: 🚧 PLANNED → ✅ COMPLETE
6. Update CURRENT-SPRINT.md: clear active sprint (optional)
7. git add docs/04-build/sprints/
8. git commit -m "docs(sprint-{N}): mark sprint complete"
9. Print: "Sprint {N} closed. Run with --push to push to remote."
10. If --push: git push origin main (ONLY after steps 1-8 succeed)
```

**Safety (CPO C2):**
- Default: commits locally, does NOT push — always shows push reminder
- `--push` flag: pushes only if steps 1–9 all succeeded
- Never auto-pushes on failure at any step

**Files created/modified:**

| # | File | Change |
|---|------|--------|
| 1 | `src/cli/commands/sprint-close.ts` | NEW — `registerSprintCloseCommand(program)` |
| 2 | `src/cli/commands/index.ts` | ADD `export { registerSprintCloseCommand }` |
| 3 | `src/cli/commands/register-all.ts` | ADD import + `registerSprintCloseCommand(program)` |
| 4 | `.claude/commands/sprint-close.md` | NEW — thin wrapper calling `./endiorbot.mjs sprint close` |

---

## Files Modified/Created

| # | File | Change | Priority |
|---|------|--------|----------|
| 1–13 | `docs/reference/templates/souls/SOUL-*.md` (×13) | ADD `allowed-tools` field to frontmatter | P0 |
| 14 | `scripts/lint-souls.ts` | NEW — frontmatter schema validator | P0 |
| 15 | `package.json` | ADD `lint:souls` script | P0 |
| 16 | `tests/scripts/lint-souls.test.ts` | NEW — 3 tests | P0 |
| 17 | `src/cli/commands/sprint-close.ts` | NEW — CLI command + workflow | P0 |
| 18 | `src/cli/commands/index.ts` | ADD export | P0 |
| 19 | `src/cli/commands/register-all.ts` | ADD registration | P0 |
| 20 | `.claude/commands/sprint-close.md` | NEW — thin wrapper | P0 |

---

## Key Design Decisions

### `allowed-tools` = Phase 1 Metadata Only

SOUL-*.md files live in `docs/reference/templates/souls/` — they are scaffold templates, not Claude Code commands. `allowed-tools` in YAML frontmatter has **documentation value** (governance, developer reference) but does NOT automatically enforce tool restrictions at runtime.

Phase 2 (runtime enforcement): Wire `allowedTools` array into `src/agents/invoke/claude-code-bridge.ts` when spawning claude subprocess. Tracked as technical debt — Sprint 112+ after Phase 1 is stable.

### `pnpm lint:souls` vs Template Generator

gstack uses `gen-skill-docs.ts` (generated from code). EndiorBot SOUL files are hand-written governance documents changing ~once/month — a generator adds tooling overhead with minimal benefit. `pnpm lint:souls` validator catches drift without any generation complexity.

### `/sprint-close` Implementation Scope

`sprint-close.ts` reads/updates 3 doc files (CURRENT-SPRINT.md, sprint-{N}.md, SPRINT-INDEX.md) via regex. It does NOT parse full Markdown AST — simple string replacement for status fields is sufficient and robust.

**Regex pattern for CURRENT-SPRINT.md active sprint detection:**
```
/^\*\*Status\*\*:.*PLANNED/m  →  extract sprint number from filename reference
```

---

## Test Plan (3 new tests)

### `tests/scripts/lint-souls.test.ts`

| T# | Test |
|----|------|
| T1 | Valid SOUL file with all required fields + valid tools → passes |
| T2 | SOUL file missing `allowed-tools` → exits with error mentioning field name |
| T3 | SOUL file with unknown tool name (`Reade`) → exits with error + suggestion |

---

## Definition of Done

**P0-1 (SOUL files):**
- [x]All 13 SOUL-*.md have `allowed-tools` field in frontmatter
- [x]Tool names match exactly: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `AskUserQuestion`
- [x]`pnpm build` clean after SOUL edits

**P0-2 (lint:souls):**
- [x]`pnpm lint:souls` passes: `13 SOUL files checked — OK`
- [x]T1, T2, T3 tests pass
- [x]`pnpm test` passes after adding lint-souls.test.ts

**P0-3 (/sprint-close):**
- [x]`./endiorbot.mjs sprint close --help` shows command
- [x]Step 1 (build fail) → aborts before any doc updates
- [x]Step 2 (test fail) → aborts before any doc updates
- [x]Default: commits locally, prints push reminder
- [x]`--push` flag: pushes after all steps succeed
- [x]`pnpm build && pnpm test` clean after CLI wiring

**Continuous (CTO C2):**
- [x]`pnpm build && pnpm test` after P0-1 complete
- [x]`pnpm build && pnpm test` after P0-2 complete
- [x]`pnpm build && pnpm test` after P0-3 complete

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| T1 | Add `allowed-tools` to 13 SOUL-*.md files | 1.5h |
| T2 | `pnpm build && pnpm test` checkpoint | 15m |
| T3 | Create `scripts/lint-souls.ts` + add `lint:souls` to package.json | 45m |
| T4 | Create `tests/scripts/lint-souls.test.ts` (3 tests) | 30m |
| T5 | `pnpm build && pnpm test && pnpm lint:souls` checkpoint | 15m |
| T6 | Create `src/cli/commands/sprint-close.ts` | 1.5h |
| T7 | Wire: update `src/cli/commands/index.ts` + `register-all.ts` | 15m |
| T8 | Create `.claude/commands/sprint-close.md` | 15m |
| T9 | `pnpm build && pnpm test` final checkpoint | 15m |

**Total: ~5.5h**

---

## Sprint 110 Preview

- **Action 4** (deferred): `tests/helpers/session-runner.ts` — subprocess-based E2E tests with real Claude Code invocations, `pnpm test:e2e` opt-in, budget cap
- **allowed-tools Phase 2**: Wire `allowedTools` into `claude-code-bridge.ts` invocation layer (runtime enforcement)

---

**CTO Review**: 9/10 APPROVED — 2026-03-15 (SF-1 fixed post-review)
**CPO Review**: APPROVED — 2026-03-15

**Last Updated**: 2026-03-15 (Sprint 109 COMPLETE — CTO 9/10 + CPO APPROVED)
