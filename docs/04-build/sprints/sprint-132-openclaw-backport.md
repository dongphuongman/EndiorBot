---
sprint: 132
status: ✅ COMPLETE — CTO 9.5/10, G3 APPROVED, zero conditions
start_date: 2026-04-11
complete_date: 2026-04-11
planned_duration: 4–5 days
actual_duration: 1 day (single session)
framework: "6.3.0"
authority: "CTO G2 APPROVED (Plan v3) + CPO Approved + CEO Decisions Locked 2026-04-11 + CTO Code Review 9.5/10 G3 APPROVED"
adrs: ["ADR-046 (Autonomous Execution Policy) — STUB → FULL + Amendment 1 (Finding #2 scope honesty)"]
commits: ["01c4ee1 (M0)", "4a07fed (governance docs)", "88588da (M1)"]
tests: "7786 passing (148 new from M1, 37 new from M0), 10 skipped, 0 failures"
feature_prd: "docs/01-planning/openclaw-backport/PRD.md"
scope_doc: "docs/01-planning/openclaw-backport/scope.md"
source_plan: "/Users/dttai/.claude/plans/glistening-nibbling-mist.md"
previous_sprint: "Sprint 131 — CRG Wiring + Auto-Handoff (COMPLETE 2026-04-10)"
---

# Sprint 132 — openclaw Backport (M0 + M1)

## Context

Plan v3 (openclaw backport survey) was CTO G2 APPROVED and CPO Approved on 2026-04-11 after three review rounds. Sprint 132 ships the two MUST items: **M0** (unified command discovery RPC, ships immediately) and **M1** (exec-policy CLI + approvals cluster, blocked on ADR-046 full expansion).

**Identity guard (unchanged):** Every item on this sprint passes the Solo Developer Power Tool (LOCKED) filter. No platform creep. No SDLC-enforcer features. See scope.md for the full out-of-scope list.

---

## Locked Scope

| # | Item | Ref | Effort | Priority | Blocker |
|---|------|-----|--------|----------|---------|
| 1 | **ADR-046 full expansion** (STUB → full; @cto drafts) | C-HARD-1 | 0.5d | P0 | None — @cto drafts in parallel with #2 |
| 2 | **M0 — `commands.list` RPC + CLI subcommand + 4-channel wiring** | PRD §3 M0 | 0.5–1d | P0 | None — first to ship |
| 3 | **M1 — `exec-policy` CLI + approvals cluster** | PRD §3 M1 | 2–3d | P0 | Blocked until #1 signed |
| 4 | @pjm hygiene: update `docs/04-build/CURRENT-SPRINT.md` to reflect Sprint 131 complete + Sprint 132 kickoff | CTO process observation | 0.25d | P1 | None |

**Total:** 3.25–4.75 days execution + CEO validation. Fits 4–5 day sprint.

---

## Task Breakdown

### Task 1 — ADR-046 full expansion (drafted by @cto)

**Owner:** @cto (SOUL advisory scope, no production code) → reviewed by @pm + @cpo
**Dependency:** None. Runs in parallel with Task 2.

**Deliverables:**
1. Expand `docs/02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy-STUB.md` from STUB → full.
2. Add section **"Exec-Policy Layering (Command Allowlist on top of Autonomy Gates A/B/C)"**.
3. Add the **6-cell matrix** (preset × `ENDIORBOT_AUTO_HANDOFF` flag):
   - Rows: preset = `strict` / `balanced` / `open` (locked naming)
   - Columns: `ENDIORBOT_AUTO_HANDOFF=false` (default) / `ENDIORBOT_AUTO_HANDOFF=true` (power mode)
   - Each cell answers: (a) routing permission, (b) tool-invocation permission, (c) CEO-visible UX
4. Add **explicit in-scope / out-of-scope** for the M1 cluster (per CPO lock-in #1 — prevents scope creep to mini-platform).
5. Cover the remaining items from the STUB's "What Full ADR-046 Will Cover" list: Gate B vs Gate C boundaries, ParallelExecutor wiring policy, PatchManager rollback integration, audit trail requirements, Autonomy Gates A/B/C relationship.

**Acceptance:** CTO + CPO sign the expanded ADR. PM reviews and confirms all 6 cells are filled (no undefined cells). Any undefined cell = M1 handoff blocked until resolved.

### Task 2 — M0: `commands.list` RPC + CLI subcommand + 4-channel wiring

**Owner:** @architect (design pass) → @coder (implementation)
**Handoff status:** APPROVED immediately after this sprint plan is committed. No ADR dependency.

**Subtasks:**
1. **RPC method + schema** (~10 LoC + typings)
   - Add `commands.list` method to `src/gateway/protocol/schema.ts`
   - Wire into `src/gateway/methods/bridge-commands.ts`
   - Wrap `CommandDispatcher.getRegisteredCommands()` from `src/commands/index.ts`
2. **New CLI subcommand** (~30–50 LoC)
   - Create `src/cli/commands/commands-list.ts`
   - Register in `src/cli/commands/register-all.ts`
   - Output formatting (table or list, respect `--json` flag)
3. **Telegram + Zalo `/commands` handlers** (~20 LoC each)
   - Extend existing `/help` adapter pattern in each channel
4. **Normalization layer** (~30 LoC)
   - Ensure all 4 surfaces consume the same RPC output
   - Shape: `{ name, description, surface_availability, parameters, sdlc_stage? }`
5. **Tests** (~100 LoC)
   - RPC response shape
   - CLI subcommand output
   - Channel adapter output
   - Five-number equality test (CLI == Web == Telegram == Zalo == dispatcher count)

**Total:** ~150–200 LoC incl. tests. Effort: **S (0.5–1 day).**

**Reference:** `openclaw/src/gateway/server-methods/commands.ts` (`723dec0432`, 2026-04-10, #62656) + follow-up fix `360955a7c8` (#64147, "preserve commands.list metadata").

**PoL probe (required for merge):**
```bash
# All five numbers MUST be equal
curl $WEB/rpc -d '{"method":"commands.list"}' | jq '.result | length'
endiorbot commands --json | jq 'length'
# /commands in Telegram (manual check, count output lines)
# /commands in Zalo (manual check, count output lines)
# vs dispatcher registry count
```

### Task 3 — M1: `exec-policy` CLI + approvals cluster

**Owner:** @architect (design pass, blocked on Task 1) → @coder (implementation)
**Handoff status:** BLOCKED until ADR-046 full is signed (Task 1 complete).

**Subtasks (pending @architect design post ADR-046):**
1. **CLI surface:** new `src/cli/commands/exec-policy.ts`
   - Subcommands: `show`, `preset <open|balanced|strict>`, `set <rule>`
   - Uses locked preset names (no openclaw lineage names in UI)
2. **Approvals cluster:** new directory `src/security/exec-approvals/`
   - Effective-policy resolver (port pattern from `openclaw/src/infra/exec-approvals-effective.ts`)
   - Approvals store (persistent)
   - Allowlist pattern matcher (port from `openclaw/src/infra/exec-allowlist-pattern.ts`)
   - Audit hooks to `.endiorbot/audit/`
3. **Integration at `src/sessions/autonomous/manager.ts` `executeTaskWork()`**
   - Approvals check fires BEFORE Gate A time/cost check
   - Composes with Sprint 131 `ENDIORBOT_AUTO_HANDOFF` per the 6-cell matrix
4. **Tests:**
   - All 6 matrix cells exercised
   - Preset switching end-to-end
   - Audit log format
   - Allow-list + block-list commands
   - Integration with existing autonomy gates (no regression)

**Effort: M–L (2–3 days)** — CLI is small; the approvals cluster and test surface are the real work.

**Reference files to read BEFORE design:**
- `openclaw/src/cli/exec-policy-cli.ts` (443 LoC)
- `openclaw/src/infra/exec-approval*` cluster (~18–20 non-test module files, ~30 tests, ~51 total). Primary entries: `exec-approvals.ts`, `exec-approvals-effective.ts`. Also: `exec-allowlist-pattern.ts`, `exec-approvals-store.ts` (if exists), `exec-approval-surface.ts`, `exec-approval-forwarder.ts`, `exec-approval-channel-runtime.ts`, `exec-approval-reply.ts`, `exec-safe-bin-*` subset.
- EndiorBot: `src/sessions/autonomous/manager.ts` for integration point

**PoL probe (required for merge):**
```bash
# Strict preset blocks Bash calls BEFORE Gate A
endiorbot exec-policy preset strict
# Attempt autonomous task invoking Bash
# → should be blocked by approvals layer, logged in .endiorbot/audit/
# → Gate A time/cost logic should NOT fire

# Open preset allows under Gate A/B/C bounds only
endiorbot exec-policy preset open
# Same task → allowed subject to time/cost bounds

# All 6 matrix cells exercised in test suite
```

### Task 4 — @pjm hygiene: update CURRENT-SPRINT.md

**Owner:** @pjm
**Dependency:** Sprint 132 kickoff confirmed by CEO.

**Action:** Update `docs/04-build/CURRENT-SPRINT.md` to reflect:
- Sprint 131 — COMPLETE (2026-04-10, post-merge accepted by CPO)
- Sprint 132 — ACTIVE with this sprint's scope

**Rationale:** CTO process observation — 7-day SSOT drift in `CURRENT-SPRINT.md` (it still marks Sprint 129 COMPLETE from 2026-04-04). Fix same day as Sprint 132 kickoff to break the pattern.

---

## Success Criteria (Sprint-level) — ALL MET ✅

- [x] ADR-046 expanded from STUB → full, signed by CTO + CPO, all 6 matrix cells defined, M1 in-scope/out-of-scope explicit. Plus Amendment 1 (Finding #2 scope honesty) authored + re-acknowledged.
- [x] M0 shipped (commit `01c4ee1`), PoL probe passes (five equal numbers) — `tests/commands/five-equal-numbers.test.ts`
- [x] M1 shipped (commit `88588da`), PoL probes pass — strict blocks < 100ms, open allows, open + `rm -rf /` hard-denies. 6-cell matrix test covers all cells.
- [x] `CURRENT-SPRINT.md` no longer stale (both top-level and sprints/ versions updated)
- [x] Zero regressions — 7638 prior tests green, 148 new M1 + 37 new M0 tests
- [x] All tests green: 7786/7786 passing, 10 skipped, 0 failures
- [x] No new TypeScript errors under `exactOptionalPropertyTypes` (0 errors on `pnpm tsc --noEmit`)
- [x] CTO code review: 9.5/10, G3 APPROVED, zero conditions

---

## Out of Sprint 132 Scope

- **S1 (Active Memory)** → Sprint 133
- **S2 (SSRF audit)** → Sprint 133
- **C2 (Webhooks ingress)** → Sprint 134+ pending further CEO-confirmed scope (email forward mechanism is still open)
- **C1 (evidence linter)** → DROPPED 2026-04-11, no use case
- Everything in the WON'T list (see scope.md)

---

## References

- [Plan v3 (CTO G2 APPROVED)](/Users/dttai/.claude/plans/glistening-nibbling-mist.md)
- [openclaw-backport PRD](../../01-planning/openclaw-backport/PRD.md)
- [openclaw-backport scope](../../01-planning/openclaw-backport/scope.md)
- [ADR-046 STUB](../../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy-STUB.md)
- [Sprint 131 (prior)](./sprint-131-crg-wiring-knowledge-velocity.md)
- [Sprint 72 (Autonomous SDLC Agent — Gates A/B/C context)](./sprint-72-autonomous-sdlc-agent.md) *(if path differs, see sprint-index.md)*

---

*EndiorBot | Solo Developer Power Tool (LOCKED) | SDLC 6.3.0 | Sprint 132 Plan*
*Generated by @pm 2026-04-11 post G2 approval*
