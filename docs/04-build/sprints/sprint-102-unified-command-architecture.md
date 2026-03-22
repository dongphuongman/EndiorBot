# Sprint 102: Unified Command Architecture

**Sprint Duration**: March 11, 2026
**Sprint Goal**: Move shared command handlers out of `channels/telegram/` into `src/commands/`, extract shared `executeInitCommand()` for CLI/Gateway reuse
**Status**: COMPLETE
**Priority**: P1 (Architecture Hygiene)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED (0 MF, 2 SF, 4 Info, 5 Conditions)
**Previous Sprint**: Sprint 101 COMPLETE — Tier-Aware Routing + ClawVault Memory (+33/6,349)
**Tests**: +0 new, 3 fixed (6,349 cumulative — no regressions)
**ADR**: [ADR-030](../../02-design/01-ADRs/ADR-030-Unified-Command-Architecture.md)

---

## Background

After 101 sprints, EndiorBot's 17+ shared command handlers lived in `src/channels/telegram/telegram-commands.ts` despite being imported by ALL channels (Telegram, Zalo, Web, CLI gateway). This created:

1. **Misleading location**: `channels/telegram/` suggests Telegram-specific code
2. **CLI duplication**: `src/cli/commands/init.ts` had its own ~100-line init logic duplicating `handleInitCommand()`
3. **No structured return**: Gateway commands returned formatted strings; CLI needed raw data for spinners and colored output

CTO review confirmed: "The duplication is real, the risk is low, the payoff is clean architecture."

---

## System Architecture — Sprint 102 Changes

```
BEFORE:
  src/channels/telegram/telegram-commands.ts  ← shared by ALL channels
  src/channels/telegram/remote-commands.ts    ← shared by ALL channels
  src/cli/commands/init.ts                    ← duplicate init logic

AFTER:
  src/commands/handlers.ts         ← MOVED (git mv, preserves history)
  src/commands/remote-handlers.ts  ← MOVED (git mv, preserves history)
  src/commands/index.ts            ← Updated imports
  src/cli/commands/init.ts         ← Thin wrapper → executeInitCommand()
```

---

## Sprint 102 Deliverables

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | `git mv` telegram-commands.ts → src/commands/handlers.ts | DONE |
| 1 | `git mv` remote-commands.ts → src/commands/remote-handlers.ts | DONE |
| 1 | Update docstrings to "Shared Command Handlers" | DONE |
| 2 | Update all 13 imports (4 source + 9 test files) | DONE |
| 3 | Extract `executeInitCommand()` with structured return | DONE |
| 3 | Refactor CLI init.ts to thin wrapper | DONE |
| 3 | Add `handleInitCommand(args, workspace)` gateway wrapper | DONE |
| 4 | Fix 6 TypeScript build errors (exactOptionalPropertyTypes) | DONE |
| 4 | Fix 3 test files for async handleInitCommand() signature | DONE |
| 5 | Create ADR-030 | DONE |

---

## Phase 1: File Relocation

Two `git mv` operations preserving git history:

```bash
git mv src/channels/telegram/telegram-commands.ts src/commands/handlers.ts
git mv src/channels/telegram/remote-commands.ts src/commands/remote-handlers.ts
```

Docstrings updated from "Telegram Commands" to "Shared Command Handlers — used by ALL channels (Telegram, Zalo, Web, CLI)."

---

## Phase 2: Import Updates (13 files)

### Source Files (4)
| File | Old Import | New Import |
|------|-----------|------------|
| `src/commands/index.ts` | `../channels/telegram/telegram-commands.js` | `./handlers.js` |
| `src/commands/index.ts` | `../channels/telegram/remote-commands.js` | `./remote-handlers.js` |
| `src/channels/telegram/telegram-channel.ts` | `./telegram-commands.js` | `../../commands/handlers.js` |
| `src/channels/zalo/zalo-commands.ts` | `../telegram/telegram-commands.js` | `../../commands/handlers.js` |

### Test Files (9)
All test imports updated from `../channels/telegram/telegram-commands.js` to `../../../src/commands/handlers.js` (or equivalent relative path).

---

## Phase 3: Shared executeInitCommand()

### New Export: `executeInitCommand(options): Promise<ExecuteInitResult>`

Pure data function with **NO** CLI dependencies:
- No `console.log`, `process.exit`, spinners, or colors
- Returns structured `ExecuteInitResult` with detection, steps, tier, duration, messages

### Interface

```typescript
export interface ExecuteInitOptions {
  projectName: string;
  tier: string;
  targetPath: string;
  force?: boolean;
  analyze?: boolean;
  skipAnalysis?: boolean;
}

export interface ExecuteInitResult {
  success: boolean;
  detection: DetectionResult;
  tier: string;
  tierSource: string;
  techStackSummary: string;
  steps: Array<{ name: string; path: string; status: string; error?: string | undefined }>;
  durationMs: number;
  messages: string[];
  error?: string;
  snapshot?: ProjectSnapshot;
  migrated?: { from: string };
  backupPath?: string;
}
```

### CLI Wrapper (init.ts)
Calls `executeInitCommand()` then adds:
- Spinner for codebase analysis
- Colored step display (green +, blue ~, yellow -)
- `process.exit(1)` for invalid tier
- `saveActiveProject()` after success

### Gateway Wrapper (handlers.ts)
Calls `executeInitCommand()` then formats as Markdown for OTT channels.

---

## Phase 4: Build & Test Fixes

### Build Errors Fixed (6)

All `exactOptionalPropertyTypes` violations — used conditional object building pattern:

```typescript
// ✅ GOOD: conditional assignment
const initOpts: ExecuteInitOptions = { projectName: name, tier, targetPath };
if (options.force) initOpts.force = options.force;
if (options.analyze) initOpts.analyze = options.analyze;
```

### Test Fixes (3 files)

`handleInitCommand()` signature changed to `(args: string[], workspacePath?: string)` (async). Three tests called it with no args:

| Test File | Fix |
|-----------|-----|
| `tests/channels/ott/ott-enhancement.test.ts` | `await handleInitCommand([], undefined)` + assert workspace-required |
| `tests/integration/telegram-ott-complete-flow.test.ts` | Same fix |
| `tests/channels/zalo/zalo-commands.test.ts` | Assert `/focus` required message |

---

## CTO Review Summary (8.5/10)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| SF-1 | Should-Fix | Import count claim (17 → actual 13) | Corrected to 13 |
| SF-2 | Should-Fix | --refresh overstated as CLI-specific | Acknowledged — no --refresh impl yet |
| F1 | Info | Zalo /init test will break | Fixed: assert workspace-required |
| F2 | Info | Phase 2+3 should merge | Merged in implementation |
| F3 | Info | Gateway /init still works post-move | Verified via test suite |
| F4 | Info | No new tests needed (refactor) | 3 existing tests updated |

**CTO Conditions:**
- C1: `pnpm build` passes (0 errors) ✅
- C2: Docstrings updated to "Shared Command Handlers" ✅
- C3: All imports updated (verified 13/13) ✅
- C4: `executeInitCommand()` has NO CLI imports ✅
- C5: Test count maintained (6,349 — no regressions) ✅

---

## PJM Review (7.5/10) — 3 Conditions

| # | Condition | Resolution | Status |
|---|-----------|------------|--------|
| C1 | Zalo/Telegram /init missing workspacePath | Fallback to `loadActiveProject()` in `handleInitCommand()` | ✅ FIXED |
| C2 | Duplicate CommandResult type | handlers.ts re-exports from command-dispatcher.ts; `reply_markup` → `replyMarkup` | ✅ FIXED |
| C3 | handlers.ts imports from channels/telegram/keyboards.js | Documented as tech debt in ADR-030 | DEFERRED |

**Non-blocking observations addressed:**
- `tests/manual/mt-76-ott-enhancement.mjs:168` noted for future cleanup
- `executeApprovedRun` allowlist validation confirmed via approval gate

---

## Files Modified (~12)

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/commands/handlers.ts` | 1,3,PJM | MOVED + executeInitCommand() + loadActiveProject fallback + CommandResult re-export |
| 2 | `src/commands/remote-handlers.ts` | 1 | MOVED, docstring updated |
| 3 | `src/commands/index.ts` | 2 | Import paths updated |
| 4 | `src/cli/commands/init.ts` | 3 | Refactored to thin wrapper |
| 5 | `src/channels/telegram/telegram-channel.ts` | 2,PJM | Import updated + reply_markup → replyMarkup |
| 6 | `src/channels/zalo/zalo-commands.ts` | 2 | Import path updated |
| 7 | `tests/channels/ott/ott-enhancement.test.ts` | 4 | handleInitCommand() test updated |
| 8 | `tests/integration/telegram-ott-complete-flow.test.ts` | 4 | handleInitCommand() test updated |
| 9 | `tests/channels/zalo/zalo-commands.test.ts` | 4 | handleInitCommand() test updated |
| 10 | `tests/channels/telegram/team-launch.test.ts` | PJM | reply_markup → replyMarkup |
| 11 | `tests/channels/telegram/team-monitoring.test.ts` | PJM | reply_markup → replyMarkup |
| 12 | `docs/02-design/01-ADRs/ADR-030-Unified-Command-Architecture.md` | 5 | ADR created + PJM tech debt doc |

---

## Deferred to Sprint 103+

| Item | Reason |
|------|--------|
| Hard tier gating (reject agent at tier) | Need monitoring data from soft gating first |
| Wire memory module into ConversationStore | Memory foundation must settle first |
| `--refresh` option for gateway /init | Needs design — what does refresh mean in OTT context? |
| Discord/Slack channel adapters | Future channels import from `src/commands/` |
| Move keyboard helpers to `src/ui/keyboards.ts` | PJM C3 — decouple handlers from Telegram |

---

**Last Updated**: 2026-03-11 (by @pm — Sprint 102 COMPLETE)
**Sprint Owner**: @coder (AI)
**Sprint Status**: COMPLETE
