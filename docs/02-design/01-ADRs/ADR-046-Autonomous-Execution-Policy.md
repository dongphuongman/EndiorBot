---
adr: 046
status: "FULL — Sprint 132; @pm + @cpo reviewed + signed 2026-04-11; Amendment 1 (Finding #2 scope honesty) @cto 2026-04-11, @cpo re-acknowledged 2026-04-11; M1 UNBLOCKED with reduced Finding #2 scope; ready for @coder"
date: 2026-04-10
expanded: 2026-04-11
title: "Autonomous Execution Policy"
authority: "CTO 8/10 + CPO Approval (Sprint 131 review); Sprint 132 expansion drafted by @cto (SOUL advisory)"
sdlc_framework: "6.3.0"
supersedes: []
referenced_by: ["Sprint 131 plan", "Sprint 132 openclaw-backport", "ADR-042 (Autonomous Execution Engine)", "ADR-044 (Agentic OS Alignment)", "ADR-045 (CRG Client)"]
---

# ADR-046: Autonomous Execution Policy

**Status:** FULL — Sprint 132 expansion. @cpo reviewed + signed 2026-04-11. Pending @cto countersign. Drafted by @cto in SOUL advisory scope.

## Binding Sentence (CPO C4) — PRESERVED VERBATIM

> **Auto-handoff is orchestration of *proposed* steps. Destructive/merge/deploy/patch actions remain gated by explicit CEO approval. "Auto" means the system routes and schedules the next proposal; it does NOT mean the system executes without human review. ADR-044 (EndiorBot = ADVISOR) is preserved.**

## Why This ADR Exists

Sprint 131 introduced auto-handoff from `@mentions` (Multica ADOPT pattern) and landed the STUB. Sprint 132 ports openclaw's `exec-policy` cluster (CLI + effective-policy resolver + approvals store + allowlist pattern matcher + audit hooks). Before that code lands, CPO required a documented boundary for how command-level allowlists compose with existing autonomy controls (Gates A/B/C) and the handoff auto-dispatch flag. This ADR is that boundary.

Identity is LOCKED: EndiorBot is a **CEO Power Tool**. Nothing in this ADR frames exec-policy as an SDLC enforcer, a platform feature, or a multi-tenant capability. It is a command-allowlist layer for a single CEO driving a single workstation.

## Exec-Policy Layering (Command Allowlist on top of Autonomy Gates A/B/C)

EndiorBot already has two orthogonal autonomy controls in production. Sprint 132 adds a third. They MUST compose; they MUST NOT merge.

**Layer 1 — Autonomy Gates A/B/C (Sprint 72, `src/sessions/autonomous/manager.ts`):**
Time + cost + mode bounds on an autonomous session.
- **Gate A:** 30 min / $0.5 / read-only reconnaissance.
- **Gate B:** 30 min / $2 / write allowed, but `executeTaskWork()` blocks any task where `requiresGateC(task.type) === true` (i.e. PATCH-class work still fails closed).
- **Gate C:** 2 h / $10 / full autonomous PATCH. The only tier where autonomous code modification is permitted, and even then every patch flows through PatchManager (see Rollback section).

**Layer 2 — Handoff Auto-Dispatch (Sprint 131, `src/cli/commands/agent.ts:536-572`):**
Controls whether one agent's `HandoffRequest` → next-agent invocation requires CEO approval.
- **Default (`ENDIORBOT_AUTO_HANDOFF` unset or `false`):** prompts CEO `"Handoff proposed: @X → @Y. Approve?"` via `promptConfirmation`, dispatches only on `y`.
- **Power mode (`ENDIORBOT_AUTO_HANDOFF=true`):** logs `"⚡ Auto-handoff enabled → dispatching to @Y"` and recurses into `agentAction` without prompting. `MAX_HANDOFF_DEPTH` still caps the chain at 3.
- **Ground truth:** this flag controls **routing permission only**. It does NOT grant Bash/tool invocation, does NOT expand write scope, and does NOT bypass PATCH-mode risk gates in the agent command flow.

**Layer 3 — Exec-Policy Command Allowlist (Sprint 132, porting openclaw `exec-policy-cli.ts` + `exec-approvals*`):**
Per-command allow/deny enforcement. Presets: `strict` / `balanced` / `open` (locked, see Preset Naming).
- Strict: deny-by-default; every Bash invocation requires explicit approval.
- Balanced: curated allowlist (git read, pnpm test, ls/cat/rg, etc.); mutating commands prompt.
- Open: permissive allowlist; destructive patterns (`rm -rf`, `git push --force`, `DROP TABLE`) still hard-denied.

**Composition rule (CRITICAL):**

```
exec-policy check  →  Gate A/B/C time+cost check  →  PATCH/risk gate  →  execute
      FIRST                       THEN                     THEN          LAST
```

exec-policy fires **before** Gate A/B/C time/cost logic in `executeTaskWork()`. Rationale: if a command is denied by the allowlist, we should never burn time or budget evaluating it. A command that passes exec-policy still has to pass Gate B (for non-PATCH work) or Gate C (for PATCH work) — exec-policy does not upgrade the autonomy gate. Conversely, a command the CEO pre-approved at `open` preset still dies at the Gate B barrier if `requiresGateC(task.type)` returns true.

This is the "compose, not merge" invariant. Three independent policy surfaces, evaluated in sequence, each failing closed.

## The 6-Cell Matrix: Preset × Auto-Handoff

Rows are exec-policy preset. Columns are `ENDIORBOT_AUTO_HANDOFF` value. Each cell answers three questions:
**(a) Routing** — can the agent dispatch a handoff proposal without prompting CEO?
**(b) Tool-invocation** — upon arriving at the next agent, can it invoke Bash tools?
**(c) UX** — what does the CEO see?

| | `ENDIORBOT_AUTO_HANDOFF=false` (default) | `ENDIORBOT_AUTO_HANDOFF=true` (power mode) |
|---|---|---|
| **strict** | (a) **No.** CEO sees `"Handoff proposed: @X → @Y. Approve?"` prompt. (b) **No.** Upon approval + arrival, every Bash tool call hits exec-policy deny-by-default and prompts `"Approve command: <cmd>?"`. (c) CEO sees handoff prompt, then per-command prompts. Two-prompt friction, maximum safety. | (a) **Yes.** Dispatcher logs `"⚡ Auto-handoff enabled → @Y"` and skips handoff prompt. (b) **No.** Next agent's Bash calls still hit deny-by-default; CEO sees per-command prompts. (c) Handoff is silent, but every command still prompts. Intended "I trust the chain, not the commands" power-user mode. |
| **balanced** | (a) **No.** Handoff prompt shown. (b) **Partial.** Upon approval, allowlisted commands (git read, pnpm test, ls, rg) run silently; mutating/unknown commands prompt. (c) Handoff prompt + prompts only for risky commands. Recommended default for CEO. | (a) **Yes.** Handoff auto-dispatches. (b) **Partial.** Same as left: allowlisted runs silently, risky commands prompt. (c) Silent routing, selective command prompts. **Recommended for `serve` with active CEO oversight** — the power-user sweet spot. |
| **open** | (a) **No.** Handoff prompt shown. (b) **Yes (modulo hard-deny).** Upon approval, all commands in the permissive allowlist run silently; only hard-denied patterns (`rm -rf /`, `git push --force`, etc.) block. Gate B still blocks PATCH-class tasks. (c) One handoff prompt, then largely silent execution. | (a) **Yes.** Handoff auto-dispatches. (b) **Yes (modulo hard-deny).** Largely silent execution. (c) Near-fully-autonomous within the session — **but Gate B still blocks PATCH, and Gate C time/cost caps still enforce**. The closest EndiorBot gets to L3 autonomy, and it remains bounded by ADR-044 (ADVISOR) because destructive actions (merge, deploy, force-push) are hard-denied at exec-policy layer regardless of preset. |

**No cell is undefined.** Every cell answers all three questions. The `open` + `true` cell is the most permissive but still composes with three hard boundaries: exec-policy hard-deny list, Gate B PATCH block, and Gate C time/cost caps.

## In-Scope / Out-of-Scope for M1 Exec-Policy Cluster (CPO lock-in #1)

**In-scope for Sprint 132 M1 port:**
- CLI surface (`exec-policy` subcommand: `check`, `approve`, `deny`, `list`, `preset`)
- Effective-policy resolver (merges preset + per-user overrides + per-session overrides)
- Approvals store (persistent JSON at `~/.endiorbot/exec-approvals.json`)
- Allowlist pattern matcher (glob + regex patterns from openclaw `exec-allowlist-pattern.ts`)
- Audit hooks (every check/approve/deny writes to `~/.endiorbot/audit-logs/exec-policy.log`)
- Integration point with `AutonomousSessionManager.executeTaskWork()` (Bash tool call → exec-policy check before Gate A/B/C evaluation)

**Out-of-scope (hard line — prevents scope creep to mini-platform):**
- Plugin SDK for custom policy providers
- Extension-style modularity / dynamic policy loading
- Third-party policy providers (remote fetch, policy-as-code from Git, OPA, etc.)
- Remote policy sync across machines
- Multi-tenancy / multi-user policy namespaces
- Policy marketplace, policy templates beyond the 3 locked presets
- Web UI for policy management (CLI-only in M1)
- Any framing of exec-policy as an "SDLC governance" surface

If any of the out-of-scope items is later requested, it requires a new ADR and CEO re-approval. Do not smuggle them into M1 under the existing ADR.

## Gate B vs Gate C Boundaries

- **Gate B = autonomous read + deterministic write to non-source artifacts.** `executeTaskWork()` calls `requiresGateC(task.type)` and throws if the task type requires PATCH-class work. Permitted at Gate B: retrieval, analysis, spec authoring, docs, report generation, test execution (read-only result capture).
- **Gate C = autonomous PATCH.** Code modification, test authoring that writes new files, refactors, dep upgrades. Gate C is the only tier where `task.type ∈ {code_generation, refactor, bugfix, test_authoring}` executes autonomously. Even then, every file change flows through PatchManager and is individually rollback-able.
- **Exec-policy orthogonality:** a command allowed by `open` preset that targets a source file still dies at Gate B if the session is Gate B. The CEO cannot unlock Gate C via exec-policy — Gate C is a session-level escalation that requires the explicit cost/time budget.

## ParallelExecutor Wiring Policy

`ParallelExecutor` was explicitly deferred in Sprint 131 and remains deferred in Sprint 132 M1. This ADR now specifies the conditions under which it can be wired in a future sprint:

1. Exec-policy must be shipped and stable (M1 complete).
2. Parallel chains execute **only** at Gate C (Gate A/B run sequentially to preserve CEO oversight on cheap sessions).
3. Each parallel branch inherits the same exec-policy preset; branches cannot escalate independently.
4. `ENDIORBOT_AUTO_HANDOFF=true` is required for parallel dispatch (otherwise each branch would block on a CEO prompt, defeating the purpose).
5. Branch count hard-capped at 3 (matches `MAX_HANDOFF_DEPTH`).
6. A single hard-deny or Gate-C cost-cap breach in any branch aborts all sibling branches.

These rules are not implemented in Sprint 132; they are the pre-conditions for a future ADR-046 amendment when `ParallelExecutor` is wired.

NOTE: future amendment to cross-reference strict-preset behaviour from the 6-cell matrix (CPO Finding #3, non-blocking). A strict + parallel future session would still prompt per-command on every branch, which may be undesirable UX; the amendment should resolve whether strict-preset parallel dispatch is allowed, coalesces prompts, or is disallowed.

## PatchManager Rollback Integration

Every autonomous code change must flow through PatchManager (Sprint 68, `src/sdlc/patches/`):
- `patchManager.start(taskId)` before any file write.
- `patchManager.record(fileChange)` per file (with SHA256 content hash).
- `patchManager.commit()` on task success; `patchManager.rollback()` on task failure.
- Exec-policy audit log references the patch ID so that a denied follow-up command can trigger `rollback(patchId)` without CEO intervention.
- Rollback is idempotent and restores file content from the pre-change hash.

This means the worst-case blast radius of an `open` + `true` Gate C session is: "every file written in the session, atomically reversible via `patchManager.rollback(sessionId)`." That is the safety net that makes the `open` cell acceptable under the ADR-044 ADVISOR identity.

## Audit Trail Requirements

Every exec-policy decision MUST be logged with:
- Timestamp (ISO 8601)
- Session ID + task ID
- Agent (e.g. `@coder`)
- Full command string (after redaction of secrets via `src/security/output-scrubber`)
- Preset in effect
- Decision: `allow` / `deny` / `prompt` / `approved-by-ceo` / `denied-by-ceo`
- Gate in effect (A/B/C)
- `ENDIORBOT_AUTO_HANDOFF` value at time of decision
- `originChannel` — populated when the session was initiated from an OTT channel (`web` / `telegram` / `zalo`); `null` for CLI-origin sessions. Enables post-hoc CEO review of which channel an approval came from. (Added per @cpo Finding #2, 2026-04-11; depends on the `originChannel` field added to `AutonomousSessionManager` session state under the Ambiguity #2 resolution above.)

Log file: `~/.endiorbot/audit-logs/exec-policy.log` (JSONL, append-only). Retention matches existing audit-log retention policy. CEO can review via `./endiorbot.mjs exec-policy log --tail 100`.

## Relationship to Sprint 72 Autonomy Gates A/B/C

Summarized as a single invariant:

> exec-policy and Autonomy Gates are **orthogonal fail-closed layers**. A command must pass BOTH to execute. Neither layer can upgrade the other. The CEO approves the Gate (session budget); the preset approves the command (allowlist). The handoff flag controls routing only.

## Preset Naming (LOCKED)

Preset names exposed to the CEO and in all CLI output: **`open` / `balanced` / `strict`**.

openclaw lineage names (`yolo` / `cautious` / `deny-all`) exist only as internal code comments inside the ported files for cross-reference. They MUST NOT appear in:
- CLI help text
- Error messages
- Documentation aimed at the CEO
- Audit log `preset` field

Any PR that surfaces a lineage name to the CEO is rejected in review.

## Ambiguities Flagged (Not Resolved in This Draft)

1. **Per-agent preset override.** Whether `@coder` should be able to run at `balanced` while `@reviewer` runs at `strict` within the same session is unspecified. **CTO recommendation:** defer to Sprint 133; M1 uses session-level preset only. Reviewers should flag if they want per-agent granularity earlier.
2. **Prompt routing under `serve` (multi-channel).** If an exec-policy prompt fires during a Telegram-initiated session, which channel displays the prompt? **CTO recommendation (revised 2026-04-11 post-@cpo review):** prompt appears on the originating channel. **Mechanism correction:** the original draft of this paragraph claimed "ChannelRouter already tracks `originChannel` per session" — that claim was false. @cpo applied SOUL-pm.md Rule 1 (ground-truth verification) against `src/agents/channel-router.ts` and confirmed no such field exists on the `ChannelRouter` class; channel context today flows via per-request `ChannelSendFn` passed through adapters, with no persistent per-session origin tracking. The correct mechanism: Sprint 132 M1 adds a new `originChannel: "web" | "telegram" | "zalo" | "cli"` field to `AutonomousSessionManager` session state (`src/sessions/autonomous/manager.ts`) and threads it from the invoking adapter at session construction — roughly ~10 LoC of adapter wiring plus the field itself. This keeps 4-channel parity for OTT-initiated autonomous exec-policy prompts without a channel-class regression. Credit to @cpo for the Rule 1 catch; the original draft misreferenced `ChannelRouter` as the tracking surface and has been corrected here rather than silently rewritten.

**Second mechanism correction (2026-04-11, post-@architect M1 design pass):** When @architect applied Rule 1 against `AutonomousSessionManager` to plan the M1 implementation, ripgrep over `src/` showed **zero production construction sites for `new AutonomousSessionManager(...)`**. Every construction site is inside `src/sessions/autonomous/__tests__/manager.test.ts`; the only non-test instantiation is inside the `createAutonomousSessionManager(...)` factory at `src/sessions/autonomous/manager.ts:1078`, and that factory itself has zero non-test callers (re-exported through `src/sessions/index.ts` and `src/sessions/autonomous/index.ts`, but never invoked from any adapter, CLI command, or serve path). I re-verified this myself on the countersign branch before writing this correction — do not take it on faith. The implication: the "~10 LoC of adapter threading" my prior correction promised **cannot be implemented in M1**, because there are no production adapters that construct autonomous sessions today. OTT-initiated autonomous sessions are themselves a future capability that does not exist yet; exec-policy prompt routing to Telegram/Zalo/Web cannot land before the channel→session construction path lands. The CEO-locked M1 scope (2026-04-11) is therefore: **M1 ships the `originChannel: "web" | "telegram" | "zalo" | "cli"` field on `AutonomousSessionConfig` with default `"cli"`, plumbs it into the exec-policy audit log, and exposes a `PromptFn` interface that a future OTT adapter can wire through. Until that wiring exists, any non-CLI `originChannel` fails closed (deny) at the exec-policy layer.** A working Telegram→autonomous→exec-policy prompt loop is explicitly NOT in M1 scope; it ships in the future sprint that first wires an OTT channel to construct an autonomous session. Honest scope, no fake feature. Credit to @architect for the second Rule 1 catch — this is the second time in ~24 hours that the PM ground-truth discipline has surfaced a load-bearing assumption error before it became implementation pain. EndiorBot stays a CEO Power Tool: we ship what actually works from the CLI today and keep the OTT seam honest for when the rest of the path lands.

Both items are flagged for explicit @pm + @cpo resolution in review rather than silently decided by @cto.

## Scope NOT Covered (Now or Sprint 132)

- Full autonomy at L4/L5 (Sau Sheong's levels)
- Cross-session learning / skill sharing between autonomous runs
- Multi-CEO or team-level delegation (EndiorBot stays single-user per ADR-044)
- Policy-as-code in Git
- Remote exec-policy enforcement (all enforcement is local to the CEO's workstation)

## Review Chain

Drafted by **@cto** (SOUL advisory scope, documentation only, no production code touched).
Review by **@pm + @cpo**.
Sign by **@cto + @cpo**.

Status field reflects pending state until both reviews + both signatures are recorded. @cto does not auto-sign own draft.

---

## References

- **ADR-042** — Autonomous Execution Engine (Sprint 124b wiring)
- **ADR-044** — Agentic OS Alignment (ADVISOR boundary, LOCKED identity)
- **ADR-045** — Code Knowledge Graph Client (CRG for `@reviewer` / `@architect`)
- **Sprint 131 plan** — `docs/04-build/sprints/sprint-131-crg-wiring-knowledge-velocity.md`
- **Sprint 132 plan** — `docs/04-build/sprints/sprint-132-openclaw-backport.md`
- **openclaw reference cluster** — `openclaw/src/cli/exec-policy-cli.ts`, `openclaw/src/infra/exec-approvals*.ts`, `openclaw/src/infra/exec-allowlist-pattern.ts`
- **Ground-truth code** — `src/cli/commands/agent.ts:536-572` (ENDIORBOT_AUTO_HANDOFF), `src/sessions/autonomous/manager.ts:666` (executeTaskWork + Gate B/C)

---

*EndiorBot | SDLC Framework 6.3.0 — ADR-046 FULL | Sprint 132 openclaw-backport M1*
*Identity: CEO Power Tool (LOCKED) — Not a platform, not an SDLC enforcer.*

---

## CPO Sign — 2026-04-11

**Verdict:** SIGNED. Expansion clears all four CPO lock-ins from the Plan v3 review chain (preset naming, in/out of scope for M1 cluster, composition-not-merger layering, no automatic kill-switch bypass). Ground-truth cites for `src/cli/commands/agent.ts:536-572` and `src/sessions/autonomous/manager.ts:666` verified accurate against current `main`. Binding Sentence C4 preserved verbatim. The 6-cell matrix has no undefined cell. PatchManager rollback integration is the right safety net for the `open + true` Gate C cell; that is the hinge that keeps ADR-044 (ADVISOR) intact.

**Ambiguity #1 — Per-agent preset override: DEFER (endorse CTO recommendation).**
Session-level preset only in M1. Per-agent granularity (`@coder=balanced`, `@reviewer=strict`) is a UX and effective-policy-resolver complication that will leak into every CLI surface if we ship it alongside the initial port. Ship M1 with a single `open/balanced/strict` for the session. If CEO hits a real workflow where one agent in the chain needs a different preset, file a Sprint 133+ amendment — do not retrofit into M1. Risk of shipping without it: low; risk of shipping with it: medium (scope creep + resolver complexity).

**Ambiguity #2 — Multi-channel prompt routing: ENDORSE THE INTENT, CORRECT THE MECHANISM.**
Decision: the exec-policy prompt MUST surface on the originating channel (Telegram in, Telegram prompts; Web in, Web prompts; CLI in, CLI prompts). A prompt appearing on a different channel than the one that initiated the autonomous session is a UX failure and a security smell (the CEO may not be watching the other channel).

**Ground-truth correction (important):** The CTO draft states *"ChannelRouter already tracks `originChannel` per session"*. I verified against `src/agents/channel-router.ts` (`ChannelRouter` class at line 96) and the autonomy types — **no `originChannel` property exists on `ChannelRouter` or on the autonomous session state**. Channel context today flows via per-request `ChannelSendFn` passed through adapters; there is no persistent per-session origin channel tracking that an exec-policy prompt could look up mid-run.

**Implication for M1:** Telegram-initiated autonomous exec-policy prompts are NOT free. Sprint 132 M1 must either (a) add an `originChannel: "web" | "telegram" | "zalo" | "cli"` field to `AutonomousSessionManager` session state and thread it from the invoking adapter, or (b) scope M1 exec-policy to CLI-only and explicitly defer OTT-initiated autonomous exec-policy prompts to Sprint 133. CPO preference: **option (a)** — the field is a few lines, keeps 4-channel parity, and avoids a channel-class regression. Either way, the ADR's claim "already tracks" must be corrected before @cto countersign.

**Findings on record (not blocking sign, to be addressed in countersign revision or follow-up):**
1. The "ChannelRouter already tracks originChannel" sentence in Ambiguities Flagged #2 is factually wrong against current code. Replace with "requires new `originChannel` field on autonomous session state, ~10 LoC in `AutonomousSessionManager` + adapter threading" per the resolution above.
2. Audit trail spec should add `originChannel` to the logged fields once the mechanism exists — needed for post-hoc CEO review of "which channel did I approve from".
3. ParallelExecutor pre-condition #4 (requires `ENDIORBOT_AUTO_HANDOFF=true`) is correct but worth cross-referencing against the `strict` preset cell in the matrix — a strict + parallel future session would still prompt per-command on every branch, which may be undesirable. Not a blocker now; flag for the future ParallelExecutor amendment.

**Lock-in verification:**
- Preset naming `open/balanced/strict` in UI only: PASS (lineage names appear only in the "Preset Naming (LOCKED)" section explaining they are code-comment-only).
- M1 in/out of scope explicit: PASS (plugin SDK, remote sync, multi-tenancy, third-party providers all explicitly OUT).
- Layering: exec-policy BEFORE Gate A/B/C: PASS (composition rule diagram + rationale).
- Audit trail every decision: PASS (8 required fields + JSONL append-only + retention).
- No automatic kill-switch bypass: PASS (nothing in the ADR auto-bypasses exec-policy; Gate B still blocks PATCH at `open + true`; hard-deny list still enforces).
- S1/S2 CEO-only kill-switch rule: Not touched by this ADR (S1/S2 are Sprint 133 and out of scope here). No conflict.

**Sign:** @cpo — 2026-04-11. @cto countersign pending, blocked only on the Ambiguity #2 mechanism correction (finding #1 above). If @cto revises that one paragraph and countersigns, M1 is unblocked.

---

## CTO Countersign — 2026-04-11

**Verdict:** COUNTERSIGNED. @cpo's three findings addressed as follows.

**Finding #1 (blocker) — FIXED.** The Ambiguity #2 paragraph under "Ambiguities Flagged" has been rewritten in place. The false "ChannelRouter already tracks `originChannel` per session" claim is explicitly acknowledged, retracted, and replaced with the correct mechanism: M1 adds `originChannel: "web" | "telegram" | "zalo" | "cli"` to `AutonomousSessionManager` session state (`src/sessions/autonomous/manager.ts`) with ~10 LoC of adapter threading at session construction. I verified the ground truth myself before writing the correction: `src/agents/channel-router.ts` `ChannelRouter` class (line 96) has no `originChannel` property, and `AutonomousSessionManager` exists at `src/sessions/autonomous/manager.ts` (class declared at line 95) as the correct surface for the new field. The correction is visible in the ADR rather than silently rewritten, to preserve an honest review trail.

**Finding #2 (non-blocking) — INCORPORATED.** `originChannel` added as a ninth bullet to the Audit Trail Requirements field list, with a note that it is `null` for CLI-origin sessions and depends on the new session-state field landing in M1.

**Finding #3 (non-blocking) — NOTED.** One-liner added at the end of the ParallelExecutor Wiring Policy section marking strict-preset × parallel behaviour as a future amendment item. No design change in this ADR; flagged so the future ParallelExecutor amendment author does not miss it.

**Process note — SOUL-pm.md Rule 1 worked.** @cpo caught a factually wrong mechanism claim in my draft by verifying against actual code rather than trusting my prose. This is exactly the ground-truth discipline the new PM soul is supposed to enforce, and it caught a real error before countersign. Recording the positive signal here so future review passes remember that Rule 1 is load-bearing, not ceremonial. I applied Rule 1 myself on this correction pass to avoid making the same class of mistake in reverse.

**Binding Sentence C4:** Verified present verbatim in the "Binding Sentence (CPO C4) — PRESERVED VERBATIM" section at the top of the ADR. Survived @cpo sign, survives @cto countersign. No edits near it.

**Scope constraints honored:** No production `.ts` / `.js` code touched. No M1 implementation files touched. No new ADR created. SOUL advisory scope respected.

**M1 status:** UNBLOCKED. @pm may now dispatch @architect for the M1 design pass (exec-policy CLI + approvals cluster port from openclaw, plus the small `originChannel` session-state addition specified in the Ambiguity #2 resolution). M1 implementation itself is out of scope for this countersign.

**Sign:** @cto — 2026-04-11.

---

## Amendment 1 — 2026-04-11 — Finding #2 Scope Honesty

**Summary.** M1 exec-policy ships the `originChannel` field on `AutonomousSessionConfig` + audit-log plumbing + a `PromptFn` interface, and nothing more on the channel-routing axis. The working Telegram/Zalo/Web → autonomous → exec-policy prompt loop is explicitly deferred to the future sprint that first wires an OTT channel to construct an autonomous session. Until then, any non-CLI `originChannel` fails closed (deny) at the exec-policy layer.

**Reason.** @architect applied SOUL-pm.md Rule 1 against `AutonomousSessionManager` during the M1 design pass and found **zero production construction sites**. My prior Finding #1 fix had promised "~10 LoC of adapter threading at session construction" — but there are no production adapters that construct autonomous sessions today, so there is nothing to thread through. This is the second Rule-1 catch on the same paragraph in ~24 hours and it is load-bearing.

**Ground-truth verification (self-applied, not taken on @architect's word).**
- Command: `rg -n "new AutonomousSessionManager" src/`
- Result: 26 hits inside `src/sessions/autonomous/__tests__/manager.test.ts`, 1 hit in a JSDoc comment at `src/sessions/autonomous/manager.ts:71`, and 1 non-test instantiation at `src/sessions/autonomous/manager.ts:1078` inside the `createAutonomousSessionManager(...)` factory. I then ran `rg -n "createAutonomousSessionManager" src/` and found only two barrel re-exports (`src/sessions/index.ts:257`, `src/sessions/autonomous/index.ts:39`) plus test-only callers — **no adapter, CLI command, or serve path invokes the factory**.
- Line-number sanity check: `rg -n "executeTaskWork" src/sessions/autonomous/manager.ts` → the private method is declared at line 666 (`private async executeTaskWork(` on line 666), and is called from line 534. The `src/sessions/autonomous/manager.ts:666` cite in the original ADR body is accurate.

**Impact on M1 scope (compared to the original Finding #1 fix).**
- `originChannel` field on session config: **still in.** Defaulted to `"cli"`.
- Audit-log `originChannel` row (the ninth bullet added under Finding #2 in my countersign): **still in.** Logs `"cli"` by default for M1; logs the real channel once OTT adapters wire through.
- Adapter threading at session construction: **dropped from ~10 LoC to ~0 LoC**, because there are no production adapters to thread from. The seam is specified; the wiring is deferred.
- New: `PromptFn` interface exposed on `AutonomousSessionConfig` so a future OTT adapter can inject a channel-aware prompter. M1 ships a CLI prompter implementation only.
- New: **exec-policy fails closed for any `originChannel !== "cli"` until the adapter seam is wired.** This is the "honest scope, no fake feature" safeguard.
- Unchanged: the exec-policy CLI + effective-policy resolver + approvals store + allowlist pattern matcher + audit hooks + integration point with `executeTaskWork()` at `src/sessions/autonomous/manager.ts:666` all ship as originally in-scope. The cluster backport from openclaw is untouched by this amendment.

**Impact on the 6-cell Preset × Auto-Handoff matrix.** The matrix semantics on paper remain correct — the cells describe the intended steady-state behaviour across all four channels. In M1, however, every cell collapses to the CLI-origin row in practice: a Telegram- or Zalo- or Web-originated session cannot reach the matrix at all, because the exec-policy layer denies non-CLI `originChannel` before Gate A/B/C evaluation. This is a deliberate, visible gap, not a bug. The matrix becomes fully live when the future sprint wires an OTT channel into `createAutonomousSessionManager`.

**Status.** Amendment authored by @cto in SOUL advisory scope. **This is NOT a re-sign.** The original @cpo sign (2026-04-11) and @cto countersign (2026-04-11) stand as-is and are preserved above, unedited. Amendment 1 is a recorded clarification of the Finding #2 implementation mechanism, not a re-litigation of the ADR. Requires @cpo **re-acknowledgment** (light-touch — "yes, I see the scope correction, no objection") rather than a full review pass. If @cpo's re-acknowledgment lands, Sprint 132 M1 proceeds with the reduced Finding #2 scope.

**Identity check.** Nothing in this amendment frames exec-policy as a platform feature, a multi-channel router, or an SDLC enforcer. EndiorBot is a CEO Power Tool (LOCKED). The honest admission is: the CLI surface works today, the OTT seam is specified but not wired, and we will not pretend otherwise in the ADR that governs the port.

**Sign:** @cto — 2026-04-11 (amendment author). @cpo re-acknowledgment: pending.

---

## CPO Re-Acknowledgment of Amendment 1 — 2026-04-11

**Verdict:** RE-ACKNOWLEDGED (light-touch). Amendment 1 reviewed against the original CPO sign criteria. The second mechanism correction is an honest scope clarification, not a re-litigation of Finding #2's policy intent (originating-channel prompt routing remains correct in spirit); only the implementation mechanism collapsed once ground-truth surfaced that `AutonomousSessionManager` has zero production construction sites. Reduced M1 scope (`originChannel` field on `AutonomousSessionConfig` + audit-log plumbing + `PromptFn` interface + non-CLI fail-closed deny) is faithful to the CEO-locked scope decision, keeps the OTT seam honest, and does not smuggle in out-of-scope work.

**Lock-in re-check:** preset naming `open/balanced/strict` still LOCKED; M1 in/out-of-scope still excludes plugin SDK / remote sync / multi-tenancy / third-party providers; no automatic kill-switch bypass introduced; exec-policy still fires BEFORE Gate A/B/C; CEO Power Tool identity visible and intact. The 6-cell matrix note ("correct on paper, collapses to CLI-only in M1") is the right framing — deliberate visible gap, not a bug. Credit to @architect for the second Rule 1 catch; three Rule-1 applications in <24 hours on the same load-bearing paragraph is a strong positive process signal and exactly what SOUL-pm.md Rule 1 exists to produce. Original CPO Sign and CTO Countersign above are untouched.

**Re-Acknowledgment:** @cpo — 2026-04-11.
