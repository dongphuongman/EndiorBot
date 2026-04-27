# M1 — Exec-Policy Technical Design

**Feature:** openclaw `exec-policy` CLI + approvals cluster backport
**Owner:** @architect (design) → @coder (implementation)
**Sprint:** 132
**SDLC Stage:** 02-DESIGN
**Authority:** ADR-046 FULL (signed @cpo + @cto 2026-04-11)
**Status:** DRAFT — pending @pm review

---

## 0. Ground-Truth Corrections vs ADR-046

Applying SOUL-pm.md Rule 1 against current `main`:

1. **`AutonomousSessionManager` is not wired to any adapter today.** Ripgrep across `src/` shows zero production construction sites: only `src/sessions/autonomous/manager.ts` (self), `src/sessions/autonomous/index.ts` (re-export), `src/sessions/index.ts` (re-export), `src/context/transfer/context-injector.ts` (type-only). All instantiations (`new AutonomousSessionManager` / `createAutonomousSessionManager`) are inside `__tests__`. **Implication:** ADR-046's "~10 LoC of adapter threading at session construction" estimate assumes construction sites exist. They do not. M1 cannot thread `originChannel` from adapters that don't yet call the manager. See §3 for the mitigation (accept the field, default `"cli"`, thread it whenever the adapter ingress path is actually wired up in a future sprint; audit log records `"cli"` until then).
2. **Integration point location.** ADR-046 cites `src/sessions/autonomous/manager.ts:666` as the `executeTaskWork` line. Verified: `executeTaskWork` begins at **line 666** and `requiresGateC` check is lines **672–676**. The exec-policy hook must land **immediately at the top of `executeTaskWork`, before line 672**. Correct citation.
3. **openclaw lineage preset internal mapping** (`yolo` ↔ `open`, `cautious` ↔ `balanced`, `deny-all` ↔ `strict`) — verified against `openclaw/src/cli/exec-policy-cli.ts:28-56`. The `EXEC_POLICY_PRESETS` record there uses `host/security/ask/askFallback` as the resolved shape; EndiorBot's resolver will expose a simpler `{ allowlist, hardDeny, ask }` surface since we do not have openclaw's gateway/host abstraction.
4. **`src/security/` is flat today** (8 files, no sub-directories). Adding `src/security/exec-approvals/` is the first sub-directory — this is fine, but the `src/security/index.ts` re-export surface must be explicit about what it publishes (see §2.3).
5. **No prior exec-policy CLI exists.** `src/cli/commands/commands-list.ts` exists for M0; `exec-policy.ts` is genuinely new.

---

## 1. CLI Surface

**New file:** `src/cli/commands/exec-policy.ts`
**Registered in:** `src/cli/commands/register-all.ts` via new `registerExecPolicyCommand(program)` import alongside `registerCommandsListCommand`.
**Entry:** `./endiorbot.mjs exec-policy <subcommand>`

### Subcommands

| Subcommand | Purpose | Output (default / `--json`) |
|---|---|---|
| `show` | Current preset, effective allowlist, last-mutation timestamp, audit pointer | table / `ExecPolicyShowPayload` |
| `preset <open\|balanced\|strict>` | Set session-level preset; writes to store | confirm line / `{ preset, previousPreset, updatedAt }` |
| `allow <pattern>` | Add pattern to persistent allowlist (balanced/open presets only; strict ignores) | confirm line / `{ added: pattern }` |
| `deny <pattern>` | Add pattern to persistent hard-deny list | confirm line / `{ added: pattern }` |
| `list` | Dump effective allowlist + hard-deny list | list / `{ allowlist, hardDeny, preset }` |
| `audit [--tail N]` | Read last N records from `~/.endiorbot/audit-logs/exec-policy.log` (default 50) | table / `ExecPolicyAuditRecord[]` |

### Naming discipline (LOCKED per ADR-046)

- User-facing strings only ever use `open` / `balanced` / `strict`.
- Internal code **may** use lineage names (`yolo` / `cautious` / `deny-all`) only in code comments for cross-reference to openclaw source.
- Help text, error messages, audit log `preset` field, JSON output keys: all use locked names. A lint-style test in `__tests__` asserts the forbidden strings do not appear in any CLI output path.

---

## 2. Approvals Cluster Layout

**New directory:** `src/security/exec-approvals/` (first sub-dir under `src/security/`).

### 2.1 Modules

| File | Purpose | Pattern source (openclaw) |
|---|---|---|
| `types.ts` | `Preset` enum, `EffectivePolicy`, `PolicyDecision`, `AllowlistPattern`, `ExecPolicyAuditRecord` | `exec-approvals.types.ts` |
| `presets.ts` | Hard-coded `open` / `balanced` / `strict` policy definitions (allowlist + hardDeny lists per preset) | `exec-policy-cli.ts:37-56` |
| `allowlist-pattern.ts` | Glob + regex matcher (simple substring+glob; no dependency on `minimatch` — reuse the placeholder-style matcher pattern already used in Sprint 68 glob code) | `exec-allowlist-pattern.ts` |
| `effective-policy.ts` | Resolves preset + persistent store overrides → `EffectivePolicy` (allowlist, hardDeny, askMode) | `exec-approvals-effective.ts` |
| `store.ts` | Persistent JSON at `~/.endiorbot/exec-policy/approvals.json`. CRUD on preset + extra allowlist/hardDeny entries. File locking via atomic-write (tmp → rename). | `exec-approvals.ts` save/restore |
| `check.ts` | Primary entry: `checkCommand(cmd: string, ctx: PolicyContext): PolicyDecision` — calls effective-policy + pattern matcher, returns `{ decision: "allow" | "deny" | "prompt", reason, matchedPattern? }`. Writes audit record as a side effect. | `exec-approvals.ts` `evaluateCommand` |
| `audit.ts` | Append-only JSONL writer to `~/.endiorbot/audit-logs/exec-policy.log`. Format defined in §6. Secrets scrubbed via existing `src/security/output-scrubber`. | (EndiorBot-native, modeled on `src/security/ott-audit.ts`) |
| `prompt.ts` | CEO prompt adapter. Wraps terminal `promptConfirmation` (CLI) today; accepts injectable `PromptFn` so OTT channel callers can pass a channel-specific prompter later. | (EndiorBot-native) |
| `index.ts` | Public surface: **only** `checkCommand`, `Preset`, `EffectivePolicy`, `setPreset`, `getEffectivePolicy`, `readAuditTail`. Nothing else re-exported. | — |

### 2.2 Public API (the only symbols the rest of the codebase imports)

```ts
// from src/security/exec-approvals/index.ts
export { checkCommand } from "./check.js";
export { setPreset, getPreset } from "./store.js";
export { getEffectivePolicy } from "./effective-policy.js";
export { readAuditTail } from "./audit.js";
export type { Preset, EffectivePolicy, PolicyDecision, PolicyContext, ExecPolicyAuditRecord } from "./types.js";
```

All other modules (`allowlist-pattern`, `presets`, `prompt`) are cluster-internal. Enforced by ESLint rule or a `__tests__/public-surface.test.ts` that imports `index.ts` and asserts the exported key set equals this list.

### 2.3 `src/security/index.ts` re-export

Add one line: `export * as execApprovals from "./exec-approvals/index.js";` — namespaced to prevent flat-namespace collisions.

---

## 3. Integration With `AutonomousSessionManager`

### 3.1 Exact hook point

**File:** `src/sessions/autonomous/manager.ts`
**Function:** `executeTaskWork()` (lines **666–723**)
**Insertion:** new block inserted **immediately at the top of the method body, before the current line 672 `requiresGateC` check.**

Call sequence post-change:

```
executeTaskWork(task, tier, modelId)
  1. [NEW] exec-policy check  ← fires FIRST
  2. requiresGateC(task.type)  ← existing Gate B/C boundary (line 672)
  3. isEfficiencyTask shortcut (line 679)
  4. provider dispatch (line 705 callCloudFallback)
```

The exec-policy check receives a `PolicyContext` built from:
- `command`: the normalized command string that would be executed (M1 note: `executeTaskWork` does not actually emit Bash today — it calls `callCloudFallback`. The check is wired for the PATCH-class future where Bash commands flow through it. For M1, the check MUST still run — with the `task.type` + `task.description` used as the candidate command for coarse allow/deny matching — so that the layering invariant and audit trail are correct from day one and tests exercise the hook. The finer-grained per-Bash-invocation hook will land when a tool-use adapter calls `checkCommand` directly, tracked as a follow-up inside M1 scope.)
- `sessionId`, `taskId`, `agent` (via `taskTypeToAgent(task.type)`)
- `gate`: `this.config.gate`
- `autoHandoff`: `process.env.ENDIORBOT_AUTO_HANDOFF === "true"`
- `originChannel`: `this.config.originChannel ?? "cli"`

On `decision === "deny"`: throw `new Error(\`exec-policy denied command: ${reason}\`)`; the existing retry/escalation machinery in `executeTask` (lines 531–584) will pick this up, `failureClassifier` will classify as DESIGN_ISSUE (via a new pattern), escalation fires. No new escalation path needed.
On `decision === "prompt"`: M1 uses the injectable `PromptFn`. CLI default is terminal `promptConfirmation`; if `originChannel !== "cli"`, the prompt is logged-and-denied in M1 with an explicit "OTT prompt routing deferred — awaiting adapter wiring" audit record. This keeps the ADR-044 fail-closed guarantee and matches the Finding #1 correction: we do not fabricate an OTT prompt we cannot deliver.
On `decision === "allow"`: proceed to the existing `requiresGateC` check unchanged.

### 3.2 New `originChannel` field on session state

**Type addition** in `src/sessions/autonomous/types.ts`:

```ts
export type OriginChannel = "web" | "telegram" | "zalo" | "cli";

export interface AutonomousSessionConfig {
  // ... existing fields
  /** Channel that initiated this autonomous session. Default "cli". */
  originChannel?: OriginChannel;
}
```

Add to `DEFAULT_AUTONOMOUS_CONFIG`: `originChannel: "cli" as const`.

`AutonomousSessionManager.config` is `Required<AutonomousSessionConfig>`, so the default lands automatically; construction sites that want a specific channel pass it explicitly.

### 3.3 Adapter threading — GROUND-TRUTH CORRECTION

ADR-046 estimates "~10 LoC of adapter threading". **Ripgrep confirms zero production call sites construct `AutonomousSessionManager` today** (see §0.1). There is nothing to thread in M1. The field is added, the default is `"cli"`, the audit log records the field, and the threading happens in the sprint that actually wires an adapter to launch an autonomous session. M1 scope:

- Add the field + default.
- Add one unit test that constructs with `originChannel: "telegram"` and asserts audit records carry `"telegram"`.
- Add one unit test that constructs without the field and asserts audit records carry `"cli"`.
- **Defer** actual multi-adapter threading to whichever sprint wires autonomous sessions from OTT (likely Sprint 133+ during S1/S2, or a dedicated "autonomous-from-OTT" sprint).

This is not a scope cut — it is a correction to an estimate based on a codebase state that does not match the ADR's implicit assumption. The ADR decision (prompts surface on origin channel; field mechanism) is preserved intact; the implementation effort is smaller than ADR-046 claims for M1 and larger for the future adapter-wiring sprint.

Flag for @pm / @cpo awareness: if CPO's intent behind Finding #2 was "M1 must ship a working OTT-initiated autonomous prompt loop", that is not achievable in M1 because no OTT adapter constructs an `AutonomousSessionManager`. The field, audit plumbing, and prompt injection interface are shippable in M1; the end-to-end OTT→autonomous flow is not.

---

## 4. 6-Cell Matrix → Code Semantics

| Cell | Routing check (handoff) | Tool-invocation check (exec-policy) | UX rendering |
|---|---|---|---|
| **strict × false** | `agent.ts:556-565` `autoMode=false` branch → `promptConfirmation` on originating channel (CLI today) | `checkCommand` in `executeTaskWork` returns `"prompt"` → `PromptFn` → two-prompt friction | CEO sees handoff prompt, then per-command prompts |
| **strict × true** | `agent.ts:559-561` `autoMode=true` branch → silent dispatch log | Same as above: `checkCommand` returns `"prompt"` | Silent handoff, per-command prompts |
| **balanced × false** | Handoff prompt via `promptConfirmation` | `checkCommand` returns `"allow"` for allowlist match, `"prompt"` for mutating, `"deny"` for hard-deny | Handoff prompt + selective command prompts |
| **balanced × true** | Silent handoff | Same as above | Silent routing + selective prompts — recommended `serve` mode |
| **open × false** | Handoff prompt | `checkCommand` returns `"allow"` for allowlist, `"deny"` for hard-deny only; no prompts | One handoff prompt, then silent |
| **open × true** | Silent handoff | Same as above | Near-silent, bounded by Gate B PATCH block + Gate C cost cap + hard-deny list |

**No cell is undefined.** Routing permission lives in `src/cli/commands/agent.ts:540-578`. Tool-invocation permission lives in the new `checkCommand` called from `manager.ts:666`. They are two call sites; they never merge. Tests in §7 exercise all six cells.

---

## 5. Preset Definitions (Concrete)

Defined in `src/security/exec-approvals/presets.ts` as constants. These are the M1 seed values; `store.ts` can layer user-added patterns on top via `allow`/`deny` subcommands.

### `strict`

```ts
{
  allowlist: [],           // empty — deny-by-default
  hardDeny: HARD_DENY_BASE,
  askMode: "always",       // every command prompts
}
```

### `balanced`

```ts
{
  allowlist: [
    // Read-only FS
    "ls", "ls *", "cat *", "pwd", "tree", "stat *", "file *",
    // Search
    "rg *", "grep *", "find * -name *", "find * -type *",
    // Git read
    "git status", "git log", "git log *", "git diff", "git diff *",
    "git show *", "git branch", "git branch -a", "git remote -v",
    // Node ecosystem read
    "pnpm test", "pnpm test *", "pnpm build", "pnpm lint", "pnpm typecheck",
    "node --version", "pnpm --version",
    // EndiorBot self
    "./endiorbot.mjs status", "./endiorbot.mjs gate *",
    "./endiorbot.mjs compliance *", "./endiorbot.mjs commands",
  ],
  hardDeny: HARD_DENY_BASE,
  askMode: "on-miss",      // prompt for anything not matched
}
```

### `open`

```ts
{
  allowlist: [
    ...BALANCED.allowlist,
    // Write-ish but reversible via PatchManager
    "git add *", "git commit *", "git checkout *", "git stash *",
    "pnpm install", "pnpm add *", "pnpm remove *",
    "mkdir *", "mkdir -p *", "touch *",
    // Editors' save path is file writes via tool use, not Bash
  ],
  hardDeny: HARD_DENY_BASE,
  askMode: "off",          // never prompt; allow or hard-deny only
}
```

### `HARD_DENY_BASE` (applies to all presets)

```ts
[
  "rm -rf /", "rm -rf /*", "rm -rf ~", "rm -rf $HOME",
  "git push --force *", "git push -f *",
  "git push * main --force", "git push * master --force",
  "git reset --hard origin/main", "git reset --hard origin/master",
  "sudo *",
  "curl * | sh", "curl * | bash", "wget * | sh", "wget * | bash",
  "DROP TABLE *", "DROP DATABASE *",
  ":(){ :|:& };:",         // fork bomb
  "dd if=* of=/dev/*",
  "mkfs *", "mkfs.*",
  "chmod -R 777 /", "chown -R * /",
  "> /dev/sda*", "> /dev/nvme*",
]
```

Pattern-match semantics documented in `allowlist-pattern.ts`: simple wildcard `*` → greedy non-whitespace-boundary match; patterns are matched against the full normalized command string (whitespace collapsed, quoted args preserved). Hard-deny wins over allow. Exact-match always beats wildcard.

---

## 6. Audit Trail Format

**File:** `~/.endiorbot/audit-logs/exec-policy.log`
**Format:** JSONL append-only, one record per line.
**Rotation:** Size-based, rotate at 10 MB → `exec-policy.log.1`, keep 5 rotations. (Matches the `ott-audit.ts` daily-file pattern conceptually but size-based here because exec-policy volume is command-driven, not message-driven.)

### Record schema

```ts
interface ExecPolicyAuditRecord {
  timestamp: string;             // ISO 8601
  sessionId: string;
  taskId?: string;
  agent: string;                 // e.g. "coder"
  command: string;               // scrubbed via output-scrubber
  preset: "open" | "balanced" | "strict";
  decision: "allow" | "deny" | "prompt" | "approved-by-ceo" | "denied-by-ceo";
  reason?: string;               // e.g. "hard-deny matched: rm -rf /"
  matchedPattern?: string;
  gate: "A" | "B" | "C";
  autoHandoff: boolean;
  originChannel: "web" | "telegram" | "zalo" | "cli";
  traceId?: string;              // optional correlation
}
```

Writer is `src/security/exec-approvals/audit.ts`: synchronous `appendFileSync` with pre-scrub, mkdir-p on first write, newline-terminated. Reader is `readAuditTail(n)` — reverse-read up to N lines.

Exposed via `./endiorbot.mjs exec-policy audit --tail 100`.

---

## 7. Test Plan

### Unit tests (under `src/security/exec-approvals/__tests__/`)

| File | Coverage |
|---|---|
| `allowlist-pattern.test.ts` | Glob matching: exact, wildcard, quoted-arg preservation, boundary edge cases |
| `presets.test.ts` | Each preset's allowlist/hardDeny/askMode matches spec; `HARD_DENY_BASE` present in all three |
| `effective-policy.test.ts` | Preset + store layering; user-added `allow` entries merge into preset allowlist; hard-deny takes precedence |
| `store.test.ts` | Atomic write, round-trip, corrupted-file recovery (fallback to defaults with error log) |
| `check.test.ts` | Decision matrix: allow-match, prompt-on-miss, hard-deny-wins, audit side-effect fires |
| `audit.test.ts` | JSONL write, scrubbing hook invoked, tail reader, rotation at size threshold |
| `public-surface.test.ts` | Assert `index.ts` exports exactly the locked symbol set |
| `naming-lock.test.ts` | Grep forbidden `yolo`/`cautious`/`deny-all` strings in any non-comment output path |

### Integration test (new file)

`src/sessions/autonomous/__tests__/manager.exec-policy.test.ts` — exercises the `manager.ts:666` hook:

1. Mock `checkCommand` via module mock.
2. Construct manager with `originChannel: "telegram"`, preset `strict`, task type `documentation` (non-Gate-C).
3. Assert `checkCommand` called before `requiresGateC`.
4. Assert audit record carries `originChannel: "telegram"`.
5. Assert `deny` decision throws before provider dispatch.
6. Regression: assert existing Sprint 72 Gate B/C tests still pass (do not modify `manager.test.ts` beyond ensuring the new call doesn't break defaults; the CLI-default `"cli"` path must be backward-compatible).

### 6-cell matrix tests (new file)

`tests/security/exec-policy-matrix.test.ts` — one `describe` per cell, six cells total:

```
describe("strict × false") { ... assert handoff prompt + per-command prompt }
describe("strict × true")  { ... assert silent handoff + per-command prompt }
describe("balanced × false") { ... }
describe("balanced × true")  { ... }
describe("open × false")     { ... }
describe("open × true")      { ... assert hard-deny still blocks rm -rf / }
```

Each test sets `process.env.ENDIORBOT_AUTO_HANDOFF` and calls a fake `executeTaskWork` harness + a fake handoff dispatcher to observe both call sites.

### PoL probe

Three one-liners documented in the sprint plan:

1. `./endiorbot.mjs exec-policy preset strict && <autonomous run that triggers a Bash call>` → blocked, audit log shows `"deny"` with preset `"strict"` BEFORE any Gate A time was consumed.
2. `./endiorbot.mjs exec-policy preset open` + same run → audit log shows `"allow"`, Gate A/B/C time actually accrues.
3. `./endiorbot.mjs exec-policy preset open` + an `rm -rf /` task → hard-deny, audit log shows `"deny"` with `reason: "hard-deny matched"`.

### Regression surface

- `pnpm test:security` still green
- Sprint 72 autonomy gate tests still green (`src/sessions/autonomous/__tests__/manager.test.ts`)
- Sprint 131 auto-handoff tests still green (`src/cli/commands/agent.ts` handoff depth cap behavior unchanged)

---

## 8. Effort Verdict

Plan v3 estimate: **M–L (2–3 days).** Breakdown:

| Component | Estimate |
|---|---|
| Types + presets + allowlist-pattern | 2 h |
| Store (+ file locking, recovery) | 3 h |
| Effective-policy resolver | 2 h |
| `checkCommand` + audit hook | 3 h |
| Prompt adapter (CLI default + injectable) | 2 h |
| CLI surface (`src/cli/commands/exec-policy.ts`) + `register-all.ts` wiring | 4 h |
| `manager.ts:666` integration + `originChannel` field + `types.ts` addition | 2 h |
| Unit tests (8 files) | 5 h |
| Integration test (manager hook) | 2 h |
| 6-cell matrix test | 3 h |
| Naming-lock test + public-surface test | 1 h |
| PoL probe wiring + docs | 1 h |
| Buffer / review cycle | 3 h |
| **Total** | **~33 h ≈ 2.5 days** |

**Verdict: CONFIRM M–L (2–3 days).** The ground-truth correction at §0.1 (adapter threading is ~0 LoC today, not ~10) trims a small amount of work; it does not change the tier. The cluster port is the bulk of the effort and that part is unchanged.

---

## 9. Risks + Open Questions for @coder

1. **`executeTaskWork` doesn't emit Bash today.** It calls `callCloudFallback`. The M1 `checkCommand` hook fires against `task.type + task.description` as a coarse proxy. When a real tool-use/Bash dispatcher lands, it must call `checkCommand` directly per-invocation. @coder should add a code comment at the hook site referencing this design doc so the finer-grained hook is a natural follow-up.
2. **OTT prompt routing is audit-only in M1.** The `prompt.ts` adapter accepts an injectable `PromptFn` but M1 ships only the CLI `promptConfirmation` implementation. For `originChannel !== "cli"`, the decision in M1 is fail-closed `"deny"` with an audit record noting "OTT prompt routing deferred". This matches ADR-044 fail-closed and is honest about the adapter-threading gap.
3. **Store corruption recovery.** If `~/.endiorbot/exec-policy/approvals.json` is corrupt, fall back to `balanced` default and emit an error to `stderr` + audit log. Do not crash the session.
4. **Pattern matcher complexity.** Simple wildcard is enough for M1. If @coder finds a test case that needs regex, push back on adding regex in M1 — regex patterns go through a Sprint 133 amendment.
5. **Hard-deny list completeness.** The list in §5 is a seed. @coder should not expand it in M1; additions go through CEO approval in a follow-up.
6. **`FailureClassifier` pattern.** The new `exec-policy denied` error should classify as DESIGN_ISSUE so it escalates rather than retrying. Confirm the existing classifier sees the error message text; if not, add a pattern entry.
7. **Test isolation.** `process.env.ENDIORBOT_AUTO_HANDOFF` mutations in the 6-cell test must use `beforeEach` / `afterEach` restore to avoid cross-test leak.

---

## 10. Out-of-Scope Reminders (CPO Lock)

- ❌ Plugin SDK / dynamic policy providers
- ❌ Remote policy sync / multi-machine
- ❌ Multi-tenancy / multi-user policy namespaces
- ❌ Third-party policy providers (OPA, policy-as-code from Git)
- ❌ Policy marketplace, templates beyond the 3 locked presets
- ❌ Web UI for policy management
- ❌ Per-agent preset override (deferred Sprint 133)
- ❌ Automatic kill-switch bypass (CEO-only)
- ❌ Interaction with ParallelExecutor (deferred, future ADR-046 amendment)
- ❌ Framing exec-policy as an "SDLC governance" surface

Identity lock: **Solo Developer Power Tool**. Nothing in M1 creeps toward platform.

---

## References

- **ADR-046 FULL** — `docs/02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md`
- **PRD M1** — `docs/01-planning/openclaw-backport/PRD.md` §3 M1
- **Sprint 132 plan** — `docs/04-build/sprints/sprint-132-openclaw-backport.md`
- **Ground-truth files read**:
  - `src/sessions/autonomous/manager.ts` (lines 95, 136, 455, 666, 1074)
  - `src/sessions/autonomous/types.ts` (full)
  - `src/cli/commands/agent.ts` (lines 500–620)
  - `src/cli/commands/register-all.ts`
  - `src/security/` (flat dir listing, `ott-audit.ts`)
- **openclaw reference cluster** — `openclaw/src/cli/exec-policy-cli.ts:28-56`, `openclaw/src/infra/exec-approvals*.ts`, `openclaw/src/infra/exec-allowlist-pattern.ts`

---

*EndiorBot | SDLC Framework 6.3.0 | Sprint 132 openclaw-backport M1 design note*
*Identity: Solo Developer Power Tool (LOCKED)*
