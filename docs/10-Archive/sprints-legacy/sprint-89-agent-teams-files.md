---
spec_id: SPEC-04BUILD-SPRINT89
title: "Sprint 89: Agent Teams — Team File Generation"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-025", "ADR-026"]
---

# Sprint 89: Agent Teams — Team File Generation

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-026 (Agent Teams), ADR-025 (Session Intelligence Envelope)
**Preceding sprint:** Sprint 84 (SOUL Bridge Foundation) ✅ + Sprint 86 (hooks prereq)
**CTO Review:** APPROVED 9/10 → 10/10 (all conditions resolved)
**CPO Review:** APPROVED
**Est. effort:** ~30h
**Est. tests:** ~25

---

## Goal

Generate `.claude/agents/{teamId}-team.md` files that enable Claude Code Agent Teams. The leader agent receives full team context — charter, teammate identities, and delegation rules — plus access to the `Agent` tool, enabling it to spawn and coordinate sub-agents during a session.

**Key principle:** EndiorBot SOUL decides WHAT to build; Claude Code Agent Teams execute HOW as coordinated units.

---

## Authority

### CTO Conditions (7)

| ID | Condition |
|----|-----------|
| C1 | `AGENT_TEAMS` feature flag must default to `false` |
| C2 | Generated files must be named `{teamId}-team.md` (not `{role}.md`) |
| C3 | Fullstack team excluded — too broad for sub-agent delegation |
| C4 | Strategy B (inline SOUL injection) must always work as fallback |
| C5 | Sprint 84 source files must NOT be modified — additive only |
| C6 | Regression gate: all existing tests continue to pass |
| C7 | `Agent` tool must appear ONLY in team leader files, not solo agent files |

### CTO Advisory A3

Team-installer MUST check `AGENT_TEAMS` flag before generating any files. If the flag is `false`, the command must exit with a clear user-facing message rather than silently skipping.

### CPO Advisories

| ID | Advisory |
|----|----------|
| CA1 | Team UX messaging: CLI output must clearly describe what was generated and why |
| CA2 | Cost visibility: generated team file must include a comment noting that team mode multiplies token cost |

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `AGENT_TEAMS` feature flag (default `false`) in `feature-flags.ts` | `/launch --as-team` Telegram command — Sprint 90 |
| `team-installer.ts` — calls `createTeamRegistry()`, generates `{teamId}-team.md` | Team monitoring dashboard — Sprint 91 |
| `bridge install-teams <path>` CLI subcommand | Cost tracking per team member — Sprint 91 |
| Agent launcher enhancement: detect `{teamId}-team.md` and select Strategy A | Unified launcher process — Sprint 92 |
| Skip criteria: fullstack team (C3) or teams with 0 non-leader teammates | Full ML-based task routing |
| Unit + security + CLI tests (~25) | Changes to Sprint 84 source files (C5) |

---

## Architecture

### SSOT Reuse

Team files are generated from existing project-level SSOTs — no new data sources are introduced:

| SSOT | Used For |
|------|---------|
| `TeamRegistry` / `createTeamRegistry()` | Team definitions and member lists |
| `TeamDefinition` type | Team ID, leader role, member roles |
| `TEAM-*.md` charter files | Team context body in generated file |
| `AGENT_METADATA` | Per-role descriptions for teammate entries |

### Generated File Format

```
---
name: {teamId}-team
model: claude-sonnet-4-5
description: "{teamName} leader with team coordination context. NOTE: Team mode multiplies token cost."
allowed-tools:
  - Agent
  - Read
  - Write
  - Edit
  - Bash
max-turns: 25
---

# {teamName} Team — Leader Context

## Charter
{charter body from TEAM-{teamId}.md}

## Teammates
{teammate list with role, description from AGENT_METADATA}

## Delegation Rules
- Spawn teammates using the Agent tool with their role name.
- Delegate atomic subtasks only — do not delegate ambiguous work.
- Collect teammate outputs before reporting final result to CEO.
```

### Strategy A/B for Team Files

```
if AGENT_TEAMS flag is true AND teamId is not "fullstack":
  if .claude/agents/{teamId}-team.md exists in project:
    → Strategy A: claude --agent {teamId}-team
  else:
    → Strategy B: --append-system-prompt-file {temp}  (C4 guarantee)
else:
  → Skip team file generation, log reason
```

---

## Key Deliverables

1. **`src/bridge/intelligence/feature-flags.ts`** — Add `AGENT_TEAMS: false` as a named export alongside existing flags. Default must be `false` (C1).

2. **`src/bridge/intelligence/team-installer.ts`** — Core generator: calls `createTeamRegistry()`, iterates team definitions, applies skip criteria (fullstack, zero teammates), generates `{teamId}-team.md` with frontmatter + team context body, writes to `.claude/agents/` in target project path. Validates `AGENT_TEAMS` flag before any file I/O (A3).

3. **`src/cli/commands/bridge.ts` extension** — Add `install-teams <path>` subcommand with `--tier` (LITE/STANDARD/PROFESSIONAL) and `--force` (overwrite existing) flags. CLI output must list generated and skipped files with reasons (CA1).

4. **`src/bridge/agent-launcher.ts` enhancement** — Detect `{teamId}-team.md` files and apply Strategy A if present, Strategy B as fallback. No changes to Sprint 84 logic paths (C5 — additive only).

5. **`Agent` tool restriction** — `allowed-tools` in team leader files includes `Agent`; solo agent files generated by Sprint 84's `agent-installer.ts` must not include `Agent` (C7). Add a lint check in team-installer to verify this invariant.

6. **Skip logic** — Skip generation for: (a) fullstack team (C3), (b) any team where non-leader member count is 0. Log skip reason to CLI output.

---

## Test Plan (~25 tests)

### team-installer.ts (12 tests)

| Test | Description |
|------|-------------|
| Flag check | Returns early with message when `AGENT_TEAMS` is `false` |
| Fullstack skip | Fullstack team definition produces no output file |
| Zero-member skip | Team with 0 non-leader members is skipped |
| Happy path | Valid 3-member team generates correctly named file |
| Frontmatter | Generated file has correct `name`, `model`, `allowed-tools`, `max-turns` |
| Agent tool | `Agent` appears in leader file `allowed-tools` |
| Charter content | Charter body from `TEAM-*.md` is present in output |
| Teammate section | All non-leader members listed with role + description |
| Cost comment | CA2 cost note appears in file description |
| Force flag | `--force` overwrites existing file |
| No force | Without `--force`, existing file is preserved and skip is logged |
| Path traversal | `{teamId}` containing `../` is rejected before write |

### Security (4 tests)

| Test | Description |
|------|-------------|
| Team ID sanitization | `{teamId}` with shell metacharacters is rejected |
| Path confinement | Output path must stay within `.claude/agents/` |
| File permission | Generated file written with mode `0o644` |
| AGENT_TEAMS gate | Flag check uses strict equality, not truthiness |

### agent-launcher.team (5 tests)

| Test | Description |
|------|-------------|
| Strategy A detection | `{teamId}-team.md` present → Strategy A selected |
| Strategy B fallback | File absent → Strategy B used (C4) |
| Solo file unchanged | Solo `{role}.md` launch path unchanged (C5 regression) |
| Invalid team ID | Unknown teamId rejected before launch |
| No Agent tool in solo | Solo agent file does not contain `Agent` in allowed-tools (C7) |

### CLI (4 tests)

| Test | Description |
|------|-------------|
| Subcommand exists | `bridge install-teams --help` succeeds |
| --tier flag | Filters teams by tier |
| --force flag | Passed through to team-installer |
| Output format | CLI lists generated and skipped files with reasons (CA1) |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 90 | Agent Teams — Telegram Integration + Smart Routing (ADR-026) |
| 91 | Agent Teams — Monitoring + Lifecycle (ADR-026) |
| 92 | Unified App Launcher (ADR-024) |
