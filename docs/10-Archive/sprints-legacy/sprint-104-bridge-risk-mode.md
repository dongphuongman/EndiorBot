# Sprint 104: Bridge Risk Mode + /fix Naming

**Sprint Duration**: TBD
**Sprint Goal**: Parse `--risk` flag in `/launch`, make `/mode` update session state, handle `/fix` naming evolution
**Status**: COMPLETE
**Priority**: P1 (Bridge UX)
**Framework**: SDLC 6.1.2
**Authority**: CTO 8.5/10 APPROVED WITH CONDITIONS (ADR-031), CPO APPROVED (C4-C6)
**Previous Sprint**: Sprint 103 — /fix Dry-Run on All Channels
**Tests**: 11 new (41/41 command tests pass)
**ADR**: [ADR-031](../../02-design/01-ADRs/ADR-031-Channel-Command-Feature-Matrix.md)

---

## Background

Sprint 103 closed GAP-001 (`/fix` display-only on OTT). But the Bridge mode redirect (`/launch claude <path> --risk patch`) doesn't work because:

- **GAP-002**: `handleLaunchCommand()` parses `--as` and `--as-team` but NOT `--risk`. Sessions always default to `read` mode.
- **GAP-004**: `/mode patch` returns confirmation text but doesn't mutate session state. The mode change is cosmetic.
- **GAP-005 (naming)**: `/fix` currently means "compliance fix" but will be overloaded. Sprint 103 added `/compliance fix` alias; Sprint 104 adds deprecation notice.

---

## System Architecture — Sprint 104 Changes

```
BEFORE (Sprint 103):
  /launch claude ~/project --risk patch
    → --risk flag IGNORED → session.riskMode = "read"
    → /send blocked: "Cannot /send to READ mode session"

  /mode patch
    → Returns text: "PATCH mode requested"
    → session.riskMode UNCHANGED (cosmetic only)

AFTER (Sprint 104):
  /launch claude ~/project --risk patch
    → --risk flag PARSED → launchOptions.riskMode = "patch"
    → session.riskMode = "patch" → /send works

  /mode patch
    → Mutates session.riskMode: "read" → "patch"
    → Response: "🔓 READ → PATCH (session `abc123`). Affects this session only."
```

---

## Gaps Closed

| Gap | Priority | Description |
|-----|----------|-------------|
| GAP-002 | P1 | `/launch --risk` flag not parsed |
| GAP-004 | P2 | `/mode` has no effect |
| GAP-005 | P1 | `/fix` naming evolution |

---

## Design Constraints (CPO C4-C6)

| # | Condition | Implementation |
|---|-----------|----------------|
| C4 | Single source of truth for risk mode | `session.riskMode` in `SessionInfo` (bridge/types.ts:90) is canonical. Both `/launch --risk` and `/mode` update this field |
| C5 | UX clarity for mode transitions | `/mode patch` responds with "READ → PATCH (session `abc123`)" + "Affects this session only" |
| C6 | `/fix` rename with deprecation alias | Keep `/fix` working, add one-per-session deprecation note: "Tip: use `/compliance fix` instead" |

---

## Phase 1: Parse `--risk` in `/launch`

**File:** [handlers.ts:904-935](src/commands/handlers.ts#L904-L935)

Add `--risk` to the flag parsing loop alongside `--as` and `--as-team`:

```typescript
// In the for loop parsing args:
} else if (args[i] === "--risk" && i + 1 < args.length) {
  const mode = args[i + 1]?.toLowerCase() ?? "";
  if (mode === "read" || mode === "patch") {
    riskMode = mode as SessionRiskMode;
  } else {
    return { success: false, response: `Unknown risk mode: ${mode}\nValid: read, patch` };
  }
  i++;
}
```

Then pass to launcher:

```typescript
// Line ~1040 — launchOptions construction:
if (riskMode) {
  launchOptions.riskMode = riskMode;
}
```

**Note:** `LaunchOptions.riskMode` already exists in `bridge/types.ts:126` and `AgentLauncher` already uses it (defaults to `"read"` at line 216). Only the parsing is missing.

---

## Phase 2: `/mode` Mutates Session State

**File:** [handlers.ts:710-740](src/commands/handlers.ts#L710-L740)

Current `handleModeCommand(args, currentMode)` is sync and stateless. Must change to accept session context:

```typescript
export function handleModeCommand(
  args: string[],
  actorId: string,
): CommandResult {
  const registry = getSessionRegistry();
  const sessionId = activeSessionMap.get(actorId);
  const session = sessionId ? registry.get(sessionId) : null;

  if (!session) {
    return { success: false, response: "No active session. Use /launch first." };
  }

  const requestedMode = args[0]?.toLowerCase();
  if (!requestedMode) {
    return { success: true, response: `🔒 *Current Mode:* ${session.riskMode}` };
  }

  if (requestedMode !== "read" && requestedMode !== "patch") {
    return { success: false, response: `Unknown mode: ${requestedMode}\nValid: read, patch` };
  }

  const previousMode = session.riskMode;
  // CPO C4: mutate canonical field
  session.riskMode = requestedMode;

  // CPO C5: show transition + scope
  const icon = requestedMode === "patch" ? "🔓" : "🔒";
  return {
    success: true,
    response: `${icon} ${previousMode.toUpperCase()} → ${requestedMode.toUpperCase()} (session \`${session.id}\`)\nAffects this session only.`,
  };
}
```

**Command registration change** in [index.ts](src/commands/index.ts):

```typescript
// BEFORE:
d.register("mode", async (ctx) => handleModeCommand(ctx.args, "read"));

// AFTER (needs linked actor for session lookup):
d.register("mode", withLinkedActor(async (ctx, actorId) => {
  return handleModeCommand(ctx.args, actorId);
}));
```

---

## Phase 3: `/fix` Deprecation Note

Add one-per-session deprecation tracking:

```typescript
const fixDeprecationShown = new Set<string>();

// In executeFixCommand(), after building result:
if (!fixDeprecationShown.has(workspace)) {
  fixDeprecationShown.add(workspace);
  result.response += "\n\n💡 _Tip: use `/compliance fix` instead — `/fix` will be renamed in a future release._";
}
```

---

## Phase 3b: Fix Bridge Redirect Instructions (CTO C1)

**File:** [handlers.ts — executeFixCommand()](src/commands/handlers.ts)

Sprint 103 bug surfaced by Sprint 104 design review: the Bridge redirect text in `executeFixCommand()` says:

```
2. `/send compliance fix --yes`
```

But `handleSendCommand()` expects the first arg to be a `sessionId`. Passing `"compliance"` targets a nonexistent session.

**Fix:**

```typescript
// BEFORE (Sprint 103 — wrong)
`2. \`/send compliance fix --yes${stageHint}\``

// AFTER (Sprint 104 — correct)
`2. \`/send <session-id> compliance fix --yes${stageHint}\``,
`   _(use \`/sessions\` to see session-id after step 1)_`,
```

---

## Phase 4: `/send` Error Message Improvement

**File:** [handlers.ts:1281-1284](src/commands/handlers.ts#L1281-L1284)

```typescript
// BEFORE:
response: `Cannot /send to READ mode session.\n\nUse /mode patch to change mode, or /launch with --risk patch.`,

// AFTER (CPO C5: mention current mode):
response: `Cannot /send to READ mode session (session \`${session.id}\`).\n\n` +
  `Current mode: ${session.riskMode.toUpperCase()}\n` +
  `Use \`/mode patch\` to change, or relaunch with \`--risk patch\`.`,
```

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| T1 | Parse `--risk [read\|patch]` flag in `handleLaunchCommand()` | 1h |
| T2 | Wire `riskMode` to `launchOptions` (already supported in AgentLauncher) | 0.5h |
| T3 | Refactor `/mode` to mutate `session.riskMode` (CPO C4) | 2h |
| T4 | Update `/mode` registration to `withLinkedActor` | 0.5h |
| T5 | UX: mode transition response "READ → PATCH" + scope (CPO C5) | 0.5h |
| T6 | `/send` error message improvement (CPO C5) | 0.5h |
| T7 | `/fix` deprecation note, one-per-session (CPO C6) | 0.5h |
| T8 | Fix Bridge redirect instructions in `executeFixCommand()` (CTO C1) | 0.5h |
| T9 | Tests: 8+ (launch --risk, mode change, send after mode, deprecation, redirect text) | 2h |
| T10 | Manual test: `/launch --risk patch` → `/send` works end-to-end | 1h |

**Total: ~10h**

---

## Test Plan

| # | Test | Assertion |
|---|------|-----------|
| 1 | `/launch claude ~/project --risk patch` | `session.riskMode === "patch"` |
| 2 | `/launch claude ~/project --risk read` | `session.riskMode === "read"` |
| 3 | `/launch --risk invalid` | Error: "Unknown risk mode" |
| 4 | `/launch` without `--risk` | Defaults to `"read"` (backward compat) |
| 5 | `/mode patch` with active session | `session.riskMode` mutated, response shows "READ → PATCH" |
| 6 | `/mode` without active session | Error: "No active session" |
| 7 | `/send` after `/mode patch` | Send succeeds (not blocked by READ mode) |
| 8 | `/fix` shows deprecation note (first call only) | Contains "Tip: use /compliance fix" |
| 9 | Bridge redirect text `/fix --yes` | Contains `<session-id>` and `/sessions` hint (CTO C1) |

---

## Definition of Done

- [ ] `--risk [read|patch]` parsed in `/launch`, passed to AgentLauncher
- [ ] `/mode` mutates canonical `session.riskMode` (CPO C4)
- [ ] `/mode` response shows "READ → PATCH (session X)" + scope (CPO C5)
- [ ] `/send` error mentions current mode and fix options (CPO C5)
- [ ] `/fix` shows deprecation note once per session (CPO C6)
- [ ] `/launch` without `--risk` still defaults to `read` (backward compat)
- [ ] Bridge redirect in `executeFixCommand()` uses `<session-id>` + `/sessions` hint (CTO C1)
- [ ] `/mode` registration documented: now requires linked identity (CTO C2 — breaking change)
- [ ] 9+ new tests passing
- [ ] `pnpm build && pnpm test` passes

---

## Files Modified

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/commands/handlers.ts` | 1,2,3,4 | `--risk` parsing, `/mode` refactor, deprecation note, `/send` error |
| 2 | `src/commands/index.ts` | 2 | `/mode` → `withLinkedActor` |
| 3 | `src/commands/handlers.ts` | 3b | Fix Bridge redirect text (CTO C1) |
| 4 | `tests/commands/bridge-risk-mode.test.ts` | 4 | New: 9+ tests |

---

## CTO Review Conditions

| # | Type | Condition | Resolution |
|---|------|-----------|------------|
| C1 | 🔴 Bug | `executeFixCommand()` Bridge redirect passes "compliance" as sessionId — wrong. Fix to `<session-id>` + `/sessions` hint | Phase 3b + T8 + DoD |
| C2 | 🟡 Doc | `/mode` with `withLinkedActor` is a breaking change — unlinked users get "Not linked" instead of help text | DoD checkpoint added |

---

**Last Updated**: 2026-03-11 (by @pm — CTO C1/C2 addressed)
