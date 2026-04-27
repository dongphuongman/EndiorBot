# M0 — `cmd.list` Unified Command Discovery — Technical Design

**Sprint:** 132 (opener)
**Owner:** @architect (design) → @coder (implementation)
**Authority:** Plan v3 (CTO G2 APPROVED 2026-04-11), PRD §3 M0, Sprint 132 plan Task 2
**Status:** DESIGN — awaiting @coder handoff
**Identity check:** Solo Developer Power Tool (LOCKED) — thin-client invariant preserved
**Framework:** SDLC 6.3.0

---

## 0. Ground-truth corrections (read first)

PM's Task 2 spec is directionally correct but contains four small inaccuracies that this design resolves:

| # | PM spec claim | Verified ground truth | Source |
|---|---|---|---|
| G1 | "RPC method `commands.list`" | Existing schema namespace is **`cmd.${string}`** (see `src/gateway/protocol/schema.ts` line 140, `GatewayMethod` union). Using `commands.list` would fork the namespace. **Corrected name: `cmd.list`.** | `src/gateway/protocol/schema.ts:140` |
| G2 | "wraps `CommandDispatcher.getRegisteredCommands()`" | That method is an **instance** method, not static: `dispatcher.getRegisteredCommands()`. Returns `string[]` — names only, no descriptions or params. | `src/commands/command-dispatcher.ts:130` |
| G3 | "each entry includes: name, description, surface availability, parameters, SDLC stage" | The dispatcher stores **no description or parameter metadata today**. Descriptions exist only as hard-coded strings inside `generateHelpMessage()` (`src/commands/handlers/ott-commands.ts:550`). A new thin metadata table must be introduced as part of this design. SDLC stage is not a dispatcher concept and is dropped to "optional, empty for now". | `src/commands/handlers/ott-commands.ts:550` |
| G4 | "docs/02-design/02-technical-specs/" path | Actual directory is **`docs/02-design/14-Technical-Specs/`**. This document is saved there. | `ls docs/02-design/` |
| G5 | "Telegram + Zalo `/commands` handler wiring" | OTT adapters are **already thin** — they call `GatewayIngress.handleInbound()` which routes through the same `CommandDispatcher`. Registering a new `commands` command inside `createCommandDispatcher()` gives Telegram + Zalo `/commands` **for free**. No new per-channel handler code. | `src/gateway/ingress.ts:80,117,152`; `src/channels/telegram/telegram-ott-adapter.ts:95`; `src/channels/zalo/zalo-ott-adapter.ts` |

G5 is the most important correction: it **shrinks the CTO effort estimate**, not inflates it. The design exploits the existing thin-client invariant instead of duplicating adapter code.

---

## 1. RPC method signature and response shape

### 1.1 Method name

**`cmd.list`** (not `commands.list`).

**Justification:** The gateway protocol already reserves the `cmd.${string}` namespace for bridge commands (Sprint 93, `GatewayMethod` union in `schema.ts`). `cmd.list` is the natural listing sibling of every other `cmd.*` method that already exists. Introducing `commands.list` would create a parallel namespace and invite confusion later when we add `cmd.describe` or `cmd.search`. This is a **naming divergence from openclaw** (which uses `commands.list`) and must be called out in the ADR trail so that future maintainers reading openclaw do not assume verbatim portage.

### 1.2 Request params

```ts
export interface CmdListParams {
  /** Optional channel filter — when present, only commands available on that surface are returned. */
  surface?: "web" | "telegram" | "zalo" | "cli";
  /** Include per-command parameter schema in each entry. Default: true. */
  includeArgs?: boolean;
  /** Include sensitivity flag (auth requirement). Default: true. */
  includeSensitivity?: boolean;
}
```

All fields optional — a bare `{"method":"cmd.list"}` call must succeed and return the full catalog for all surfaces. This is the shape exercised by the PoL probe.

### 1.3 Response shape (envelope-wrapped)

```ts
export interface CmdListResult {
  /** Normalized command entries. Always an array (may be empty). */
  commands: CmdEntry[];
  /** Metadata envelope — preserved across all four surfaces. */
  meta: {
    /** Total count BEFORE any surface filter. Used by the five-equal-numbers PoL test. */
    total: number;
    /** Count AFTER surface filter. Equal to commands.length. */
    filteredCount: number;
    /** Surface that was requested (null when no filter). */
    surface: string | null;
    /** Dispatcher version — enables cache invalidation. Initially the CommandDispatcher instance UID or a monotonic counter. */
    dispatcherVersion: string;
    /** ISO-8601 timestamp of generation. */
    generatedAt: string;
  };
}

export interface CmdEntry {
  /** Lowercase command name as registered in dispatcher. Primary key. */
  name: string;
  /** One-line human description. Sourced from the co-located metadata table (see §5). */
  description: string;
  /** Category label (e.g., "workflow", "sdlc", "bridge", "remote", "system"). Mirrors generateHelpMessage() groupings. */
  category: string;
  /** Which surfaces expose this command. "all" = all four. Otherwise specific list. */
  surfaceAvailability: SurfaceList;
  /** Parameter definitions — empty array when command takes no positional args. */
  parameters: CmdParamSpec[];
  /** Authentication requirement — true means `userId` is required via Gateway (SENSITIVE_COMMANDS set). */
  sensitive: boolean;
  /** Whether the command requires a linked actor identity (LINKED_COMMANDS set). */
  requiresLink: boolean;
  /** Optional SDLC stage hint. Empty string when unknown. Reserved for future expansion; do NOT block the design on populating this. */
  sdlcStage?: string;
}

export type SurfaceList = "all" | Array<"web" | "telegram" | "zalo" | "cli">;

export interface CmdParamSpec {
  name: string;
  description: string;
  type: "string" | "number" | "enum" | "flag";
  required: boolean;
  choices?: string[];
}
```

**Why an envelope with `meta`:** this is the lesson from openclaw commit `360955a7c8` ("preserve commands.list metadata"). If the RPC returns a bare array (`CmdEntry[]`), the follow-up fix later that added `dispatcherVersion` or `total` has nowhere to land without a breaking shape change. We wrap from day one. The `meta.total` field is also what the "five equal numbers" PoL assertion reads — it is invariant to the `surface` filter, unlike `commands.length`.

**Surface availability semantics:** default is `"all"` (literal string). Commands that should NOT appear in a particular surface — e.g., `launch` is a bridge command that makes sense on CLI, Web, Telegram but not Zalo — use an explicit array. The initial mapping is conservative: `"all"` for every command, and future sprints tighten it as needed. This field exists in the schema now so that we do not have to rev the schema later.

---

## 2. Integration point in `src/gateway/methods/bridge-commands.ts`

### 2.1 Current state (verified)

```ts
// src/gateway/methods/bridge-commands.ts (lines 26-57)
export function registerBridgeCommandMethods(server, dispatcher) {
  for (const cmdName of dispatcher.getRegisteredCommands()) {
    const methodName = `cmd.${cmdName}`;
    server.registerMethod(methodName, async (params) => { /* ... */ });
  }
}
```

This function iterates the dispatcher and registers one `cmd.<name>` per command.

### 2.2 Proposed modification

Add a **single, separate method registration** for `cmd.list` **before** the loop, so it is not itself iterated over as a regular command:

```
registerBridgeCommandMethods(server, dispatcher):
  1. register cmd.list  ← NEW, handled by new normalization helper (see §5)
  2. existing for-loop: register cmd.<name> for each dispatcher command
```

The new registration calls a helper `buildCmdListResult(dispatcher, params)` from the normalization layer (§5). Business logic stays out of `bridge-commands.ts`; that file remains a thin registration shim.

### 2.3 Schema update

`src/gateway/protocol/schema.ts` line 139–140 currently has:

```ts
// Sprint 93: Bridge commands (dynamic cmd.* namespace)
| `cmd.${string}`
```

This template-literal type already admits `cmd.list` — **no schema change is strictly required for the union to compile**. However we should:

1. Add explicit `CmdListParams`, `CmdListResult`, `CmdEntry`, `CmdParamSpec`, `SurfaceList` type exports to the schema file.
2. Add a doc comment noting that `cmd.list` is the canonical discovery method and is guaranteed non-sensitive (no auth required).

---

## 3. CLI subcommand design

### 3.1 New file: `src/cli/commands/commands-list.ts`

Exports `registerCommandsListCommand(program: Command): void` following the same Commander convention as all other files in `src/cli/commands/`.

Subcommand name: **`commands`** (singular `command` would clash with Commander's internal vocabulary). CLI invocation:

```
endiorbot commands              # human-readable grouped table
endiorbot commands --json       # raw JSON (full CmdListResult envelope)
endiorbot commands --surface cli
endiorbot commands --category bridge
```

### 3.2 Critical invariant: CLI must call the same normalization helper, NOT re-implement

The PoL's "five equal numbers" test only holds if all four surfaces consume a single source of truth. The CLI subcommand **does not** hit the HTTP gateway over localhost (that would require the server to be running); instead it imports `buildCmdListResult()` directly from the normalization module and calls it with a freshly constructed `createCommandDispatcher()`. Same function, same dispatcher, same numbers.

This mirrors how the CLI today uses `createCommandDispatcher()` directly for other commands rather than round-tripping through the gateway.

### 3.3 Registration in `register-all.ts`

Add:

```ts
export { registerCommandsListCommand } from "./commands-list.js";  // in index.ts barrel
```

```ts
import { ..., registerCommandsListCommand } from "./index.js";

export function registerAllCommands(program) {
  // ... existing registrations ...
  registerCommandsListCommand(program);  // new
}
```

Placement: alphabetically near `registerConfigCommand`. Two line-edits total in `register-all.ts` (import + call).

### 3.4 Output formatting (human mode)

Group by `category`, emit a Markdown-ish table to stdout. Reuse `generateHelpMessage()`'s category ordering exactly so CLI output visually matches OTT `/help` output. **Do NOT** call `generateHelpMessage()` directly — this design intentionally replaces the hard-coded help text as the long-term plan; M0 just stops short of deleting it.

---

## 4. Telegram + Zalo `/commands` handler wiring

### 4.1 The shortcut: register `commands` in the dispatcher

Because OTT adapters forward every command through `CommandDispatcher.dispatch()` via `GatewayIngress.handleInbound()` (verified `src/gateway/ingress.ts:117, 152`), adding a new `commands` handler inside `createCommandDispatcher()` makes `/commands` work on Telegram and Zalo **with zero per-channel edits**.

### 4.2 New registration in `src/commands/index.ts`

Add a single block near the `help` registration (line 275):

```ts
// ── Unified command discovery (M0, Sprint 132) ──
d.register("commands", async (ctx) => {
  const result = buildCmdListResult(d, { surface: ctx.channel as SurfaceFilter });
  return {
    success: true,
    response: renderCmdListForChannel(result, ctx.channel),
    format: "markdown",
  };
});
```

Two helpers imported from the normalization module:
- `buildCmdListResult(dispatcher, params)` — the SSOT (§5).
- `renderCmdListForChannel(result, channelName)` — surface-specific rendering (Telegram Markdown, Zalo plain, Web raw).

**Thin-client invariant preserved:** all logic lives in core (`src/commands/normalize-commands.ts`), adapters remain dumb pipes.

### 4.3 Why not a new Telegram-specific slash-command

Telegram bot-father slash registration is a cosmetic UX nicety that Telegram shows in the keyboard autocomplete. It is **separate from** how the bot actually handles inbound `/commands` text. The handler already works via the dispatcher flow above. Updating the Telegram BotFather slash-command list is a **configuration** change (`telegram-config.ts` or the bot command setup script) — documented here as a **follow-up sub-task** but not in the critical path for the PoL probe. Same reasoning applies to Zalo.

---

## 5. Normalization layer

### 5.1 New file: `src/commands/command-catalog.ts`

Single source of truth for everything `cmd.list` returns. Two exports:

```ts
export function buildCmdListResult(
  dispatcher: CommandDispatcher,
  params?: CmdListParams,
): CmdListResult;

export function renderCmdListForChannel(
  result: CmdListResult,
  channel: string,
): string;
```

### 5.2 Metadata table

Since the dispatcher stores no descriptions, we introduce a **small co-located metadata table** keyed on command name:

```ts
// src/commands/command-catalog.ts
const COMMAND_METADATA: Record<string, {
  description: string;
  category: string;
  parameters: CmdParamSpec[];
  surfaceAvailability: SurfaceList;
  sdlcStage?: string;
}> = {
  agents:      { description: "List all agents",                      category: "ai",        parameters: [], surfaceAvailability: "all" },
  teams:       { description: "List tier teams",                      category: "ai",        parameters: [], surfaceAvailability: "all" },
  gate:        { description: "Quality gate status",                  category: "sdlc",      parameters: [{ name: "gateId", description: "Gate identifier", type: "string", required: false }], surfaceAvailability: "all" },
  compliance:  { description: "Compliance score / check / fix",       category: "sdlc",      parameters: [{ name: "subcommand", description: "score|check|fix", type: "enum", required: false, choices: ["score","check","fix"] }], surfaceAvailability: "all" },
  // ... one entry per command registered in createCommandDispatcher()
};
```

### 5.3 Build algorithm

```
buildCmdListResult(dispatcher, params):
  names = dispatcher.getRegisteredCommands()   // string[]
  total = names.length
  entries = []
  for name in names:
    meta = COMMAND_METADATA[name] ?? fallbackMetadata(name)  // warn once on miss
    if params.surface and not surfaceMatches(meta.surfaceAvailability, params.surface):
      continue
    entries.push({
      name,
      description: meta.description,
      category: meta.category,
      surfaceAvailability: meta.surfaceAvailability,
      parameters: params.includeArgs === false ? [] : meta.parameters,
      sensitive: dispatcher.isSensitive(name),
      requiresLink: dispatcher.requiresLink(name),
      sdlcStage: meta.sdlcStage ?? "",
    })
  return {
    commands: entries,
    meta: {
      total,                                   // UNfiltered — drives PoL
      filteredCount: entries.length,
      surface: params.surface ?? null,
      dispatcherVersion: hashOf(names),        // simple SHA-1 over sorted names
      generatedAt: new Date().toISOString(),
    }
  }
```

### 5.4 Unknown-command fallback

If a new command is registered but its entry is missing from `COMMAND_METADATA`, the builder returns a synthetic entry `{ description: "(undocumented)", category: "uncategorized", parameters: [], surfaceAvailability: "all" }` and logs a single warning on startup. This prevents stale metadata from breaking the `cmd.list` flow — it just downgrades UX.

### 5.5 Surface-availability semantics

Initial rollout: **every command gets `surfaceAvailability: "all"`**. The schema exists so the refinement can happen in Sprint 133+ without another breaking change. The `--surface <name>` filter is therefore functional but does not remove anything in v1 — it is infrastructure for later.

---

## 6. Test plan

Four new vitest files (PM spec names "vitest" generically; these are the concrete files):

| # | File | Asserts |
|---|---|---|
| T1 | `tests/commands/command-catalog.test.ts` | `buildCmdListResult()` returns `meta.total === dispatcher.getRegisteredCommands().length`; every dispatcher command has a metadata entry (catch unregistered additions); `meta` envelope fields are populated; `surface` filter is order-preserving. |
| T2 | `tests/gateway/methods/cmd-list-rpc.test.ts` | `cmd.list` method is registered; the JSON-RPC response passes `isJsonRpcSuccess` and its `result` matches `CmdListResult` shape; `cmd.list` itself is **not** sensitive (`userId` not required); params are validated (unknown field rejected). |
| T3 | `tests/cli/commands-list.test.ts` | `endiorbot commands --json` emits parseable JSON whose `meta.total` equals `dispatcher.getRegisteredCommands().length`; human-mode output groups by category and lists every command name at least once; `--surface cli` filter produces a subset. |
| T4 | `tests/commands/five-equal-numbers.test.ts` | **The PoL invariant test.** Builds one `CommandDispatcher` via `createCommandDispatcher()`, then derives four numbers: (a) `dispatcher.getRegisteredCommands().length`, (b) `cmd.list` RPC via in-process `GatewayServer.invoke()`, (c) CLI code path via `buildCmdListResult()` directly, (d) OTT code path by dispatching `commands` via `dispatcher.dispatch("commands", ctx)` with `ctx.channel = "telegram"` then with `ctx.channel = "zalo"` and parsing the rendered response. Asserts all five equal. |

T4 is the single critical test — it encodes the PoL acceptance criterion in code. It does **not** stand up a real HTTP server, nor does it launch real Telegram/Zalo clients; it exercises the same code paths those surfaces would hit.

Total test LoC estimate: ~180 (bigger than the PM's ~100 because T4's four-path assertion takes ~40 alone). Still well within the S envelope.

---

## 7. Risks and open questions for @coder

1. **`dispatcherVersion` strategy.** I chose `hashOf(sortedNames)`. Alternative: a package.json version bump. Hash is automatic, version bump is explicit. Pick whichever fits your taste — it does not affect the PoL.
2. **Category names in the metadata table.** I suggest: `workflow / sdlc / ai / bridge / remote / system`. If you prefer different cuts, keep it stable across `generateHelpMessage()` and `command-catalog.ts` so users see the same grouping in `/help` and `/commands`.
3. **BotFather slash-command sync.** Out of scope for M0 critical path but nice to add as a follow-up task in the same PR: have the Telegram adapter call `setMyCommands` on startup with the output of `cmd.list`. This is where `surfaceAvailability` starts earning its keep.
4. **Deleting `generateHelpMessage()` hard-coded text.** Do **not** do this in M0. Sprint 133+ should replace `/help` rendering to consume `buildCmdListResult()`. Tracked here as a follow-up, not blocked on for sprint 132.
5. **Sensitivity of `cmd.list` itself.** Decision: **non-sensitive**. Listing command metadata leaks no secrets (no argument values, no audit data, no tokens). The follow-up commit `360955a7c8` in openclaw was about metadata preservation, not about locking the method down — so we follow that precedent.
6. **`SurfaceList = "all" | string[]`** is a small type-discrimination hazard with `exactOptionalPropertyTypes`. Use a discriminated union helper if TS complains, rather than assigning `undefined`.

---

## 8. Effort estimate reconfirmation

Plan v3 says **S (0.5–1 day, ~150–200 LoC incl. tests)**. After ground-truthing:

| Component | LoC (excl. tests) | Notes |
|---|---|---|
| `src/gateway/protocol/schema.ts` — add 5 type exports | ~40 | mostly interface bodies |
| `src/gateway/methods/bridge-commands.ts` — add one registration | ~10 | thin shim |
| `src/commands/command-catalog.ts` — new file, builder + renderer + metadata table | ~120 | the metadata table is the bulk |
| `src/commands/index.ts` — register `commands` in dispatcher | ~8 | |
| `src/cli/commands/commands-list.ts` — new file, Commander registration + formatter | ~60 | |
| `src/cli/commands/index.ts` + `register-all.ts` — wire new subcommand | ~4 | |
| **Production subtotal** | **~242** | ~20% above PM's 150 LoC ceiling |
| Tests T1–T4 | ~180 | |
| **Grand total** | **~422** | ~2× PM's estimate |

**Verdict: GO on S effort, but with a caveat.** The LoC count is ~2× the PM's quick-math figure because (a) the `COMMAND_METADATA` table has ~33 entries and each entry is ~4 lines, (b) the envelope type + param type + entry type + param-spec type are four separate interfaces, (c) T4 is a multi-path assertion. None of these are hard engineering — they are data entry plus plumbing. **A focused 1-day @coder session comfortably delivers this.** I am not escalating to M. If a Sprint 131 tail-end surprise compresses Sprint 132 opener to < 1 day, the only corner to cut is the metadata richness in §5.2 (start with name/description only, add categories later) — the PoL still passes.

---

## 9. References

- Plan v3 (CTO G2 APPROVED): `/Users/dttai/.claude/plans/glistening-nibbling-mist.md`
- PRD §3 M0: `docs/01-planning/openclaw-backport/PRD.md`
- Sprint 132 plan Task 2: `docs/04-build/sprints/sprint-132-openclaw-backport.md`
- openclaw reference (pattern, not verbatim): `openclaw/src/gateway/server-methods/commands.ts` (`723dec0432`, 2026-04-10, #62656)
- openclaw follow-up (envelope lesson): `360955a7c8` ("preserve commands.list metadata")
- EndiorBot ground truth files cited throughout (with line numbers in §0)

---

*EndiorBot | Solo Developer Power Tool (LOCKED) | SDLC 6.3.0 | M0 @architect design pass | 2026-04-11*
