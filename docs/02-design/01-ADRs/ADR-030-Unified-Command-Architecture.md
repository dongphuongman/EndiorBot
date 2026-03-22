# ADR-030: Unified Command Architecture

**Status**: ACCEPTED
**Date**: 2026-03-11
**Sprint**: 102
**Author**: @architect (AI)
**Reviewers**: CTO (8.5/10 APPROVED)

## Context

After 101 sprints, EndiorBot's command handlers lived in `src/channels/telegram/telegram-commands.ts` despite being shared across ALL channels (Telegram, Zalo, Web, CLI). This naming created false assumptions:

1. **Misleading location**: `channels/telegram/` suggests Telegram-specific code, but ALL channels import from it
2. **CLI duplication**: `src/cli/commands/init.ts` had its own init logic (~100 lines) duplicating `handleInitCommand()`
3. **No structured return**: Gateway commands returned formatted strings; CLI needed raw data for spinners/colors

## Decision

### AD-1: Move Shared Handlers to `src/commands/`

Rename and relocate:
- `src/channels/telegram/telegram-commands.ts` → `src/commands/handlers.ts`
- `src/channels/telegram/remote-commands.ts` → `src/commands/remote-handlers.ts`

All channel adapters (Telegram, Zalo, Web) and the gateway ingress import from `src/commands/`.

### AD-2: Extract `executeInitCommand()` Shared Handler

Create `executeInitCommand(options): ExecuteInitResult` — a pure data function with:
- **No** `console.log`, `process.exit`, spinners, or colors
- **Structured return**: `{ success, detection, tier, steps[], durationMs, messages[], error? }`
- CLI wraps with spinners/colors; Gateway wraps with Markdown formatting

### AD-3: CLI as Thin Wrapper

`src/cli/commands/init.ts` calls `executeInitCommand()` and adds CLI-specific UX:
- Spinner for codebase analysis
- Colored step display (green/blue/yellow)
- `process.exit(1)` for invalid tier
- `saveActiveProject()` after successful init

### AD-4: Gateway Init as Thin Wrapper

`handleInitCommand(args, workspace)` in `src/commands/handlers.ts` calls `executeInitCommand()` and formats the result as Markdown for OTT channels.

## Architecture

```
src/commands/
├── handlers.ts          ← ALL shared command handlers (17+)
├── remote-handlers.ts   ← Remote command handlers (repos, focus, sh, cp, etc.)
├── command-dispatcher.ts ← CommandDispatcher registry
└── index.ts             ← Barrel export + factory

src/cli/commands/init.ts  ← CLI wrapper (spinners, colors, process.exit)
src/channels/telegram/    ← Telegram-specific adapters only
src/channels/zalo/        ← Zalo-specific adapters only
```

## Consequences

### Positive
- Clear ownership: `src/commands/` = shared logic, `src/channels/` = vendor-specific adapters
- Single source of truth for init logic (no duplication)
- CLI and Gateway can present init results differently from the same data
- New channels (Discord, Slack) import from `src/commands/` without touching Telegram code

### Negative
- One-time migration cost (13 import updates across source and test files)
- Tests for `/init` needed updating (async signature change, workspace parameter required)

## Files Changed

| File | Change |
|------|--------|
| `src/commands/handlers.ts` | Moved from `channels/telegram/telegram-commands.ts`, docstring updated |
| `src/commands/remote-handlers.ts` | Moved from `channels/telegram/remote-commands.ts`, docstring updated |
| `src/commands/index.ts` | Import paths updated |
| `src/cli/commands/init.ts` | Refactored to call `executeInitCommand()` |
| `src/channels/telegram/telegram-channel.ts` | Import path updated |
| `src/channels/zalo/zalo-commands.ts` | Import path updated |
| 3 test files | Import paths + `/init` test assertions updated |

## CTO Conditions Met

| # | Condition | Status |
|---|-----------|--------|
| C1 | `git mv` for rename (preserve history) | Done |
| C2 | Docstrings updated to "Shared Command Handlers" | Done |
| C3 | All 13 imports updated | Done |
| C4 | `executeInitCommand()` has NO CLI imports | Done |
| C5 | Regression gate: test count maintained | Done (6187-6192 pass, variance is pre-existing gateway flakiness) |

## PJM Conditions Met

| # | Condition | Status |
|---|-----------|--------|
| C1 | Zalo /init missing workspacePath — fallback to `loadActiveProject()` | Done |
| C2 | Duplicate CommandResult — handlers.ts re-exports from command-dispatcher.ts | Done |
| C3 | handlers.ts imports from channels/telegram/keyboards.js | Deferred (tech debt) |

## Known Technical Debt

- **handlers.ts imports `keyboards.js` from `channels/telegram/`**: The `handleComplexityGateCallback()` and `handleTeamCostCallback()` functions use `InlineKeyboardMarkup`, `createComplexityGateKeyboard()`, and `createTeamCostKeyboard()` from `channels/telegram/keyboards.js`. These callback handlers are Telegram-specific and should eventually move to `channels/telegram/` or the keyboard helpers should move to `src/ui/keyboards.ts`. Not blocking since these functions are only consumed by `telegram-channel.ts`.
