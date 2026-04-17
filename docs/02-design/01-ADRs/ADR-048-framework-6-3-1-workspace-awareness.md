---
adr: 048
status: "STUB — @cto countersigned 2026-04-17 (9.5/10). Retroactive documentation for 6.3.0 → 6.3.1 bump. Full expansion deferred to Sprint 136."
date: 2026-04-17
title: "Framework 6.3.1 Upgrade — Workspace Awareness (Agent Continuity) Adoption"
authority: "@pm proposal (retroactive). @cto countersign pending. Triggered by SDLC Framework 6.3.1 addendum (upstream commit cac8cdd) and MTClaw Workspace Awareness Notice (2026-04-17)."
sdlc_framework: "6.3.1"
supersedes: []
referenced_by: ["Sprint 135 P1 (Workspace Awareness)", "docs/reference/templates/souls/SOUL-coder.md", "docs/reference/templates/souls/SOUL-pm.md", "docs/reference/templates/souls/SOUL-architect.md", "docs/reference/templates/souls/SOUL-reviewer.md", "docs/reference/templates/souls/SOUL-tester.md"]
---

# ADR-048: Framework 6.3.1 Upgrade — Workspace Awareness (Agent Continuity) Adoption

**Status:** STUB. Retroactive documentation for a version bump that shipped 2026-04-17 ahead of the ADR. Full expansion deferred; this stub captures the delta, rationale, and back-compat guarantee so the bump is not undocumented. Scheduled for @cto countersign before Sprint 136 kickoff.

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

This ADR is **retroactive** — shipped after the bump, not before. Recorded as the 4th instance in Sprint 135 of the "propose versioned artifact without adjacent-artifact enumeration" pattern (v1 plan assumed `docs/evidence/`, v2 plan missed ADR-046 collision, Sprint 135 missed `SENSITIVE_COMMANDS`, framework bump missed ADR stub). Follow-up item for SOUL-pm v1.3.0: add Ground-Truth Rule 4 — "For any versioned artifact (framework, ADR-NNN, Sprint-NNN), PM confirms CTO sign-off explicitly before writing the bump." That rule would have caught all 4 instances.

## References

- **Upstream addendum:** `.sdlc-framework/05-Templates-Tools/04-SASE-Artifacts/Agent-Continuity-Runtime-Guidance.md`
- **Upstream commit:** SDLC Framework `cac8cdd` (6.3.1 addendum)
- **Trigger:** MTClaw Workspace Awareness Notice (2026-04-17), MTClaw commit `5b1463e`
- **Sibling implementation:** SDLC Orchestrator Sprint 59, ADR-015 (Python Layer 1.25)
- **EndiorBot implementation:** Sprint 135 P1 — `src/agents/context/workspace-awareness.ts`, `context-injector.ts` Layer 1.25
- **Test evidence:** `tests/agents/context/workspace-awareness.test.ts` (11 tests, all passing)
