---
adr: 048
status: "FULL — @cto countersigned 2026-04-17 (9.5/10). Full expansion shipped Sprint 136 (2026-04-18)."
date: 2026-04-17
title: "Framework 6.3.1 Upgrade — Workspace Awareness (Agent Continuity) Adoption"
authority: "@pm proposal (retroactive). @cto countersign pending. Triggered by SDLC Framework 6.3.1 addendum (upstream commit cac8cdd) and MTClaw Workspace Awareness Notice (2026-04-17)."
sdlc_framework: "6.3.1"
supersedes: []
referenced_by: ["Sprint 135 P1 (Workspace Awareness)", "docs/reference/templates/souls/SOUL-coder.md", "docs/reference/templates/souls/SOUL-pm.md", "docs/reference/templates/souls/SOUL-architect.md", "docs/reference/templates/souls/SOUL-reviewer.md", "docs/reference/templates/souls/SOUL-tester.md"]
---

# ADR-048: Framework 6.3.1 Upgrade — Workspace Awareness (Agent Continuity) Adoption

**Status:** FULL. @cto countersigned 2026-04-17 (9.5/10). Full expansion shipped Sprint 136 (2026-04-18) — adds rollback detail, quality-gate alignment, sibling-pattern comparison (MTClaw Go vs Orchestrator Python vs EndiorBot TypeScript), and test evidence table.

## Context

On 2026-04-17, MTClaw Team escalated a P1 Agent Continuity gap: agents with filesystem tools asked users for workspace state (sprint number, backlog, tech stack) that was already discoverable from the workspace. SDLC Framework responded with 6.3.1 — an addendum, not a methodology change — adding a new SASE Artifact: `Agent-Continuity-Runtime-Guidance.md` (RECOMMENDED, SHOULD). See `.sdlc-framework/05-Templates-Tools/04-SASE-Artifacts/Agent-Continuity-Runtime-Guidance.md`.

EndiorBot's audit showed the gap: `src/agents/context/context-injector.ts` loaded SOUL + Brain L4 + project context but never auto-loaded `CLAUDE.md` / `AGENTS.md` / sprint docs. Agents launched via Claude Code Bridge inherited zero discovery directive. For a CEO Power Tool, this violates the <30s-answer promise — CEO shouldn't have to re-brief the agent on sprint state visible in the workspace.

## Decision

Adopt Framework 6.3.1 via **Pattern A — System Prompt Injection** (per the SASE artifact's three options: A layered composer, B tool-use preamble, C per-agent config flag):

- **Runtime:** Added `src/agents/context/workspace-awareness.ts` exporting `WORKSPACE_AWARENESS_SECTION` as a module-level `as const` string literal. Injected at **Layer 1.25** of the context-injector pipeline — between SOUL (layer 1) and Brain L4 (layer 2). Explicitly emitted in `buildSystemPrompt` so the directive reaches the agent regardless of manifest truncation.
- **SOUL templates:** Added `## Workspace Awareness (MANDATORY)` section to the 5 executor SOULs (coder, pm, architect, reviewer, tester). Section cites the CEO Power Tool <30s guarantee explicitly — framing is productivity-first, not SDLC-enforcer-first.
- **Version bump:** `framework_version` 6.3.0 → 6.3.1 in `.sdlc-config.json`, `CLAUDE.md`, `AGENTS.md`, and 5 SOUL frontmatter blocks. Historical section markers (TDD, Coverage Targets introduced in 6.3.0) preserved — they describe when features were added, not the active framework claim.

## Threat Model (Static Constant)

The workspace-awareness directive is trust-elevating — it tells the agent to fetch workspace content and rely on it. To prevent runtime prompt-building code paths from concatenating attacker-controlled input (env vars, config, user messages) into the directive, the constant is a hardcoded string literal with no template interpolation. This is a code-hygiene property, not a filesystem-ACL mitigation — SOUL file mutation is a separate trust boundary governed by exec-policy audit logs (ADR-046). Verified by `tests/agents/context/workspace-awareness.test.ts` (11 tests).

## Back-Compat Guarantee

6.3.1 is **additive only**:
- No Mental Model revision, no Pillar restructure, no protected-path edit.
- No breaking API change. `context-injector` public surface unchanged (`InjectionRequest` / `InjectionResult`). New item `workspace_awareness` appended to `ContextSource` union (TypeScript discriminated union — existing consumers unaffected).
- Rollback is single-file revert of `context-injector.ts` + delete `workspace-awareness.ts`. SOUL sections are markdown-only; ignorable by agents that don't have filesystem tools.
- All 995 tests in `tests/agents/` pass post-change. 11 new tests added.

## Why No Version Bump to 6.3.2

Per CPO Method Steward classification: 6.3.1 addendum is a new SASE Artifact (SHOULD recommendation) — not a methodology change. No upstream bump to 6.3.2. EndiorBot mirrors upstream: `framework_version: "6.3.1"`.

## Debt

This ADR is **retroactive** — shipped after the bump, not before. Recorded as the 4th instance in Sprint 135 of the "propose versioned artifact without adjacent-artifact enumeration" pattern (v1 plan assumed `docs/evidence/`, v2 plan missed ADR-046 collision, Sprint 135 missed `SENSITIVE_COMMANDS`, framework bump missed ADR stub). Follow-up item for SOUL-pm v1.3.0: add Ground-Truth Rule 4 — "For any versioned artifact (framework, ADR-NNN, Sprint-NNN), PM confirms CTO sign-off explicitly before writing the bump." That rule would have caught all 4 instances. **(Resolved Sprint 136 — SOUL-pm v1.3.0 Rule 4 shipped.)**

## Rollback Plan (FULL expansion)

Rollback is intentionally cheap — the entire 6.3.1 adoption can be reverted in one of three atomic operations:

### Level 1 — Disable via config (zero code change, seconds)

If workspace-awareness injection causes operational issues (e.g., prompt size blowout, unexpected token spend), the SOUL-level sections still inform the agent behavior but the runtime injection is decoupled. To disable the runtime-level directive temporarily, add a guard around the injection call site in `context-injector.ts`:

```typescript
// Guard at Layer 1.25 — emergency off-switch
if (process.env.ENDIORBOT_DISABLE_WORKSPACE_AWARENESS !== "true") {
  items.push(createContextItem(WORKSPACE_AWARENESS_SOURCE_ID, "MUST", ...));
}
```

This guard is **not shipped by default** — adding it is a 3-line surgical edit if needed. The SOUL sections remain visible to any agent that reads them directly (e.g., Workspace Awareness discovery itself causes the agent to read its own SOUL).

### Level 2 — Code revert (single-commit rollback, ~5 min)

The core injection lives in three files. `git revert` on Sprint 135 P1 commit `9df591f` cleanly reverses:

- **DELETE** `src/agents/context/workspace-awareness.ts` (static constant module)
- **REVERT** `src/agents/context/context-injector.ts` — remove Layer 1.25 push in `inject()` + remove explicit emission in `buildSystemPrompt`
- **REVERT** `src/agents/context/context-manifest.ts` — remove `workspace_awareness` from `ContextSource` union
- **REVERT** 5 executor SOULs — remove `## Workspace Awareness (MANDATORY)` sections
- **REVERT** `.sdlc-config.json`, `CLAUDE.md`, `AGENTS.md`, 5 SOUL frontmatter — `framework_version: "6.3.1"` → `"6.3.0"`

All 11 workspace-awareness tests are in a dedicated file (`tests/agents/context/workspace-awareness.test.ts`); the revert deletes the file, no scattered removals.

### Level 3 — Keep code, opt-out per agent (fine-grained)

If a specific agent should not receive the workspace-awareness directive (e.g., an advisory SOUL that doesn't have filesystem tools), either:

1. Remove the `## Workspace Awareness (MANDATORY)` section from that SOUL's markdown (context-injector reads the SOUL body verbatim).
2. Add the agent role to a denylist in `context-injector.ts` before the Layer 1.25 push.

No executor SOUL is expected to opt out — the CEO Power Tool <30s guarantee depends on every executor discovering workspace state.

## Quality Gate Alignment

Per the SASE artifact guidance (lines 142–149 of `Agent-Continuity-Runtime-Guidance.md`), EndiorBot's adoption aligns with the recommended gate-level checks:

| Gate | Check | How EndiorBot satisfies |
|------|-------|------------------------|
| **G0 (Design)** | Agent configuration documents workspace-discovery mechanism | This ADR (ADR-048) documents Pattern A adoption; Sprint 135 P1 commit body cross-references the upstream SASE artifact. |
| **G3 (Test)** | Tests verify agents read expected files before answering project-state queries | `tests/agents/context/workspace-awareness.test.ts` — 11 tests: static-constant immutability, exact header match, interpolation-safety (no `${}`, no `%s`), and injection ordering (`soul → workspace_awareness → brain_l4`). Full suite: `pnpm vitest run` 7946/7956 pass post-change. |
| **G4 (Approve)** | Human reviewer confirms no regression in agent discovery behavior | @cto countersigned 2026-04-17 (9.5/10). Field-test evidence: CEO's Telegram `@tester` invocation on BetterBox-TTS discovered existing `docs/05-test/test-plans/smoke-test-plan-s1-s5.md` via workspace awareness (not prompted path) — recorded in Sprint 136 session log, 2026-04-18 18:27. |

## Sibling-Pattern Comparison

SDLC 6.3.1's SASE artifact documents **three implementation patterns** (A/B/C). Each of the three reference runtimes chose a different pattern; comparison below clarifies why EndiorBot chose A.

| Aspect | MTClaw (Pattern B) | SDLC Orchestrator (Pattern A) | EndiorBot (Pattern A) |
|--------|-------------------|------------------------------|----------------------|
| Language / runtime | Go — `internal/agent/systemprompt_sections.go` | Python — `backend/app/services/agent_team/prompt_builder.py` | TypeScript — `src/agents/context/context-injector.ts` |
| Pattern | Tool-Use Preamble: runtime emits a preamble step that performs discovery reads itself and injects results into context before agent reasoning begins | System Prompt Injection (Layer 1.25): dedicated layer between role SOUL and project config, appended at prompt composition time | System Prompt Injection (Layer 1.25): dedicated item between SOUL and Brain L4 in the context-injection pipeline |
| Upstream commit (trigger) | `5b1463e` (2026-04-17) — `buildWorkspaceAwarenessSection()` | Sprint 59 (Python) — ADR-015 | Sprint 135 P1 (`9df591f`) — Sprint 136 (`4d46c11`, `e1e3064`) |
| Safety property | Preamble runs in isolated tool-call frame; agent receives pre-fetched content, cannot skip | Static-constant insertion at Layer 1.25 — cannot be mutated at runtime (tested via module-attribute assertion) | Same static-constant + `as const` + interpolation-safe pattern (11 tests) |
| Agent compliance cost | Low — agent sees pre-fetched results, no discovery work | Low — agent reads injected directive, runs its own reads on first prompt | Same as Orchestrator |
| Why this pattern chosen | Go runtime already has tool-use preamble flow; natural fit | Layered prompt composer already exists (4 layers); simplest addition | ChannelRouter / context-injector already implements layered injection (SOUL → Brain L4 → Project → Search → Anchors); adding Layer 1.25 required no new architecture |

**Implementation-plurality preserved** per CPO Method Steward condition (SDLC 6.3.1 non-normative note line 30–33): "Runtime implementors SHOULD adopt this pattern but MAY implement equivalent workspace discovery via alternative mechanisms provided the behavioral outcome — agent reads project state before querying user — is preserved."

## Test Evidence Table (FULL)

| Test file | Tests | Property verified | Run cost |
|-----------|-------|-------------------|----------|
| `tests/agents/context/workspace-awareness.test.ts` | 11 | Static-constant immutability; exact header text; no template interpolation (`${}`, `%s`, `{N}`); injection ordering (SOUL → workspace_awareness → brain_l4); full emission in `buildSystemPrompt`; CEO Power Tool <30s linkage in section text; Mental Model #7 reference | <1s |
| `tests/integration/sprint-99-workspace-channel.test.ts` (Phase 5) | 3 | SOUL frontmatter bump post-Sprint-123 continues to reflect 6.3.x references (test relaxed to `/6\.3\.\d+/` regex to survive future addendum bumps without edits) | <1s |
| `tests/agents/context/cross-project.test.ts` | 10 | Repo-registry + workspace resolution still works after new context source was added to the union | <1s |
| Full repository regression | 7946 | Zero regression after Sprint 135 P1 + Sprint 136 ADR-048-adjacent fixes | ~45s |

## Operational Notes

1. **OAuth CLI integration (Sprint 136 B5 discovery).** During field test 2026-04-18, Claude Code CLI was observed to emit `"Waiting for permission to write..."` on Write/Edit tool use. EndiorBot bridge spawns CLI with `stdio: ["ignore", ...]`, so the prompt could not be answered — causing 60s timeouts. Fix: `--permission-mode=bypassPermissions` added to non-interactive bridge invocations. The Workspace Awareness directive is unchanged by B5 — this is a CLI-level non-interactivity fix, not an agent-behavior change. Recorded here so future readers understand why bridge invocations look permissive at the CLI but are constrained by `--disallowed-tools` at the orchestrator layer.

2. **Historical 6.3.0 markers preserved.** SOUL sections such as `## TDD Workflow (SDLC 6.3.0 — MANDATORY)` retain the `6.3.0` marker because those features were introduced in 6.3.0. Updating them to 6.3.1 would mislead readers into thinking the TDD workflow itself changed. Only the **active framework claim** (`framework_version`, identity sentences) was bumped.

3. **Addendum vs methodology change (CPO classification).** 6.3.1 is explicitly an **addendum** under the existing 6.3 line, not a new minor. This is a CPO Method Steward distinction — a methodology change (new Mental Model, Pillar restructure, protected-path edit) requires version bump to 6.4 and a full PR through `02-Core-Methodology/` or `03-AI-GOVERNANCE/`. The 6.3.1 SASE-artifact addition stayed in `05-Templates-Tools/04-SASE-Artifacts/`, which is runtime guidance — hence the minor-patch bump.

## References

- **Upstream addendum:** `.sdlc-framework/05-Templates-Tools/04-SASE-Artifacts/Agent-Continuity-Runtime-Guidance.md`
- **Upstream commit:** SDLC Framework `cac8cdd` (6.3.1 addendum)
- **Trigger:** MTClaw Workspace Awareness Notice (2026-04-17), MTClaw commit `5b1463e`
- **Sibling implementation:** SDLC Orchestrator Sprint 59, ADR-015 (Python Layer 1.25)
- **EndiorBot implementation:** Sprint 135 P1 — `src/agents/context/workspace-awareness.ts`, `context-injector.ts` Layer 1.25
- **Test evidence:** `tests/agents/context/workspace-awareness.test.ts` (11 tests, all passing)
