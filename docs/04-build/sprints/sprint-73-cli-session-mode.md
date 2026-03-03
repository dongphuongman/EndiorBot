# Sprint 73: CLI Session Mode + L2 Compliance

**Date:** 2026-03-03
**Status:** PLANNED
**Duration:** 26h (18h session + 8h compliance)
**Prerequisites:** Sprint 72 ✅ Complete, E2E Testing Phase

---

## 1. Sprint Goal

Two deliverables:
1. **CLI Session Mode** — Interactive REPL (`endiorbot shell`) for persistent command sessions
2. **L2 Compliance Checks** — Content quality validation to fix BUG-011 (false positive on placeholder docs)

---

## 2. Context

- **Problem:** Each CLI invocation loads config, resolves state, creates engine instances (~60ms overhead). In E2E testing workflows, CEO runs 5-10 sequential commands.
- **Solution:** Persistent REPL that loads context once, dispatches commands interactively.
- **Design Docs:** [TS-011](../../02-design/14-Technical-Specs/TS-011-CLI-Session-Mode.md), [ADR-016](../../02-design/01-ADRs/ADR-016-CLI-Session-Mode.md)

---

## 3. Scope

### In Scope — Part A: CLI Session Mode (18h)
- `endiorbot shell` command with REPL
- `endiorbot -i` shorthand
- Session commands: `/exit`, `/quit`, `/clear`, `/reload`, `/history`, `/status`
- Reuse existing Commander.js commands via `exitOverride()`
- `process.exit()` interception for session safety
- Token parser for quoted strings with escape handling
- Graceful shutdown (Ctrl+C, Ctrl+D, SIGTERM)
- Welcome banner with project context
- 15 unit tests

### In Scope — Part B: L2 Compliance Content Checks (8h) — BUG-011 Fix
- Detect placeholder markers (`TODO: Add`, `TBD`, `<!-- Add stage-specific`)
- Require minimum content length per stage (not just README.md existence)
- Check required artifacts per stage (requirements.md, ADR-*.md, test-plan*.md)
- `--level L1|L2` flag (default L2 for score, L1 for backward compat)
- Separate score display: `L1: 100% (structure) | L2: 35% (content)`
- 10 unit tests

### Out of Scope (Future)
- Tab completion
- Color themes
- Plugin commands
- Session persistence across restarts
- L3 cross-stage traceability checks

---

## 4. File Structure

```
src/cli/commands/
├── shell.ts                    # NEW — REPL loop, banner, session commands
├── register-all.ts             # NEW — registerAllCommands(program) helper
├── index.ts                    # MODIFY — export registerShellCommand

src/cli/session/
├── context.ts                  # NEW — Module-scoped session state singleton
├── exit-interceptor.ts         # NEW — executeWithExitGuard(), SessionExitSignal
├── token-parser.ts             # NEW — parseTokens() with escape handling
├── index.ts                    # NEW — Barrel exports

src/cli/
├── index.ts                    # MODIFY — register shell, refactor to use registerAllCommands

src/sdlc/compliance/
├── content-checks.ts           # NEW — L2 placeholder/content checks (Part B)
├── types.ts                    # MODIFY — Add L2 types

tests/cli/
├── shell.test.ts               # NEW — 15 unit tests (Part A)
├── compliance-l2.test.ts       # NEW — 10 unit tests (Part B)
```

---

## 5. Task Breakdown

### Part A: CLI Session Mode (18h)

| # | Task | Hours | Status |
|---|------|-------|--------|
| A1 | Shell command skeleton + REPL engine | 4h | ⬜ |
| A2 | Command dispatcher + `exitOverride()` + process.exit guard | 4h | ⬜ |
| A3 | Session commands (/exit, /clear, /reload, /history, /status) | 2h | ⬜ |
| A4 | Token parser (quoted strings, escapes) | 1h | ⬜ |
| A5 | Banner + dynamic prompt (`endiorbot [project]>`) | 1h | ⬜ |
| A6 | Graceful shutdown (Ctrl+C, Ctrl+D, SIGTERM) | 2h | ⬜ |
| A7 | Unit tests (15 tests) | 2h | ⬜ |
| A8 | E2E manual testing | 2h | ⬜ |
| **Subtotal A** | | **18h** | |

### Part B: L2 Compliance Content Checks (8h) — BUG-011

| # | Task | Hours | Status |
|---|------|-------|--------|
| B1 | Define STAGE_CONTENT_REQUIREMENTS config (per-tier, per-stage) | 1.5h | ⬜ |
| B2 | Implement placeholder detection (TODO, TBD, template markers) | 1.5h | ⬜ |
| B3 | Implement min content length + required artifacts checks | 2h | ⬜ |
| B4 | Add `--level L1|L2` flag, dual score display | 1h | ⬜ |
| B5 | Unit tests (10 tests) | 1h | ⬜ |
| B6 | E2E validation on Dyad + EndiorBot + fresh project | 1h | ⬜ |
| **Subtotal B** | | **8h** | |

| **TOTAL** | | **26h** | |

---

## 6. Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `node:readline` | Built-in | No external deps needed |
| All existing commands | Internal | Reused via Commander.js |
| `loadActiveProject` | Internal | From `config/paths.ts` |

---

## 7. Definition of Done

### Part A: CLI Session Mode
- [ ] `endiorbot shell` launches interactive REPL
- [ ] `endiorbot -i` works as shorthand
- [ ] All existing commands work inside session (gate, ops, consult, etc.)
- [ ] Session commands work: /exit, /quit, /clear, /reload, /history, /status
- [ ] `process.exit()` in commands does NOT kill session
- [ ] Ctrl+C once shows warning, twice exits
- [ ] Ctrl+D exits cleanly
- [ ] Quoted strings parsed correctly (`consult "What is SDLC?"`)
- [ ] Banner shows project name, tier, gate summary
- [ ] `--no-banner` flag suppresses banner
- [ ] No changes to existing single-command mode behavior
- [ ] 15 unit tests pass

### Part B: L2 Compliance (BUG-011)
- [ ] `compliance score` shows L1 + L2 scores separately
- [ ] `compliance check --level L1` gives backward-compatible result
- [ ] `compliance check --level L2` detects placeholders and missing artifacts
- [ ] Dyad scores ~30-40% on L2 (not 100%)
- [ ] Fresh project scores ~20% on L2
- [ ] EndiorBot scores 85%+ on L2
- [ ] 10 unit tests pass

### Both
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes (no new errors)

---

## 8. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Commands with deep process.exit() | Medium | High | SessionExitSignal exception pattern |
| Memory leak from repeated Command instances | Low | Medium | GC handles; monitor in tests |
| Long-running commands block REPL | Low | Low | Documented behavior; Ctrl+C support |
| Commander.js exitOverride edge cases | Low | Medium | Comprehensive test coverage |

---

## 9. E2E Test Scenarios

| # | Scenario | Commands | Expected |
|---|----------|----------|----------|
| 1 | Gate workflow | `gate status` → `gate confirm G0 --confirm` → `gate status` | All work, state persists |
| 2 | DevOps workflow | `ops build --path ...` → `ops run --path ...` | Build then run |
| 3 | Error recovery | `gate confirm INVALID` → `gate status` | Error shown, session continues |
| 4 | Exit methods | `/exit`, Ctrl+C×2, Ctrl+D | All exit cleanly |
| 5 | Mixed workflow | `status` → `gate status` → `ops build` → `/status` | All interleave correctly |

---

## 10. Handoff to @coder

### Prerequisites
- [x] TS-011 Technical Spec (CTO reviewed, 3 blocking issues fixed)
- [x] ADR-016 Architecture Decision
- [x] Sprint 73 Plan (this document)
- [x] CTO Review: APPROVED WITH CONDITIONS (all conditions resolved in TS-011)
- [ ] E2E Testing Phase complete

### Key Implementation Notes (CTO-Reviewed)

**Architecture (must follow exactly):**
1. Create `src/cli/commands/register-all.ts` with `registerAllCommands(program)` — import all `register*Command` functions. Do NOT register `shell` here (avoids recursion)
2. Refactor `src/cli/index.ts` to use `registerAllCommands()` + `registerShellCommand()` — eliminate duplicate registration list
3. Session state via **module-scoped singleton** in `src/cli/session/context.ts` — NOT via `program.setOptionValue()` (Commander.js does not propagate to subcommand actions)
4. Use `program.exitOverride()` — critical for session survival
5. `process.exit` override must be scoped with `finally` restoration
6. `SessionExitSignal` is a custom Error class, not a real exit
7. Fresh `Command` per input — avoids stale state in Commander.js

**Token parser:**
8. Must handle escape sequences: `\"`, `\'`, `\\`, `\ ` (space), trailing `\`
9. See TS-011 Section 7 for complete implementation

**CTO Warnings (address during implementation):**
10. Add explicit `process.on("SIGTERM", ...)` handler in `startREPL()` (see TS-011 Section 10)
11. `/reload` must clear cached `GateEngine` to prevent stale state (`state.gateEngine = undefined`)
12. Fix `devops.ts:73` — replace `execSync(`cat "${pkgPath}"`)` with `readFileSync(pkgPath, "utf-8")` (shell injection risk)

**Patterns:**
13. Follow existing patterns in [devops.ts](../../../src/cli/commands/devops.ts) for command registration
14. Use `exactOptionalPropertyTypes` pattern: build object first, conditionally add optional properties

### Execution Order (Recommended)
```
A4 Token parser       → A1 Shell skeleton + REPL
A2 Dispatcher + guard → A3 Session commands
A5 Banner + prompt    → A6 Graceful shutdown
A7 Unit tests         → A8 Manual E2E
B1 Content config     → B2 Placeholder detection
B3 Content checks     → B4 --level flag
B5 Unit tests         → B6 E2E validation
```

---

*SDLC Framework v6.1.1 - Stage 04: Build*
