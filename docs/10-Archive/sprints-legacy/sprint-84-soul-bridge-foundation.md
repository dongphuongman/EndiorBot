---
spec_id: SPEC-04BUILD-SPRINT84
title: "Sprint 84: SOUL Bridge Foundation"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024", "ADR-025"]
---

# Sprint 84: SOUL Bridge Foundation

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-025 (Session Intelligence Envelope), ADR-024 (Notification Bridge)
**Preceding sprint:** Sprint 83 (Copilot CLI Bridge + Repo Context + Managed Shell)
**CTO Review:** APPROVED 8/10 — 1 MF, 4 warnings, 3 conditions (all resolved)
**CPO Review:** APPROVED — Sequential roadmap (Option B)
**PJM Code Review:** 7.5/10 — 2 blockers resolved, 4 medium fixes applied

---

## Goal

Enable SOUL-aware agent launches via Claude Code Bridge. When CEO says `/launch claude-code ~/project --as pm`, the launched Claude Code session starts with the PM persona (SOUL template) injected — either via native `--agent` flag (Strategy A) or `--append-system-prompt-file` (Strategy B fallback).

**Key principle:** EndiorBot SOUL decides WHAT to build; Claude Code executes HOW.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| `soul-loader.ts` (SSOT for all modes) | /send command → Sprint 86 |
| `channel-router.ts` refactor to use soul-loader | Unified App Launcher → Sprint 89 |
| `agentRole` in LaunchOptions + BridgeSession | Permission Approval → Sprint 85 |
| SOUL-aware launch for claude-code (Strategy A/B) | Brain/Context/Evaluator → Sprint 87-88 |
| `/launch --as` Telegram command | |
| Agent Installer (`bridge install-agents`) — CTO MF-1 | |
| `SessionIntelligenceEnvelope` interface | |
| ADR-025 (3-layer context model) | |
| Orphan sweep for Strategy B temp files — CTO W-2 | |

---

## Architecture Artifacts

### ADR-025: Session Intelligence Envelope

3-layer context model for intelligence injection into Bridge sessions:

| Layer | When | Content | Mutability | Sprint |
|-------|------|---------|------------|--------|
| Launch-time | Session creation | SOUL, role, guardrails | Immutable | 84 |
| Turn-time | Each /send | Sprint goals, blockers | Mutable | 86 |
| Post-turn | After agent output | Evaluator score | Derived | 88 |

### SessionIntelligenceEnvelope Interface

```typescript
interface SessionIntelligenceEnvelope {
  persona: PersonaEnvelope;
  // Sprint 87+: brain, context, evaluator extend here
}
```

---

## Files

### Created (10 files)

| File | Purpose |
|------|---------|
| `src/bridge/intelligence/envelope.ts` | AgentRole type, VALID_AGENT_ROLES, PersonaEnvelope, SessionIntelligenceEnvelope |
| `src/bridge/intelligence/soul-loader.ts` | SoulLoader SSOT — filesystem first, inline fallback, cache, SHA256 hash |
| `src/bridge/intelligence/agent-installer.ts` | Generate `.claude/agents/*.md` for all 13 roles |
| `src/cli/commands/bridge.ts` | `endiorbot bridge install-agents <path>` CLI command |
| `docs/02-design/01-ADRs/ADR-025-Session-Intelligence-Envelope.md` | 3-layer context model ADR |
| `tests/bridge/intelligence/envelope.test.ts` | 10 tests |
| `tests/bridge/intelligence/soul-loader.test.ts` | 13 tests |
| `tests/bridge/intelligence/soul-loader.security.test.ts` | 10 tests |
| `tests/bridge/agent-launcher.soul.test.ts` | 13 tests |
| `tests/bridge/intelligence/agent-installer.test.ts` | 12 tests |
| `tests/agents/channel-router.soul-loader.test.ts` | 8 tests |

### Modified (7 files)

| File | Change |
|------|--------|
| `src/bridge/types.ts` | Added `LaunchOptions`, `AgentRole` import, `agentRole?: AgentRole` + `soulContentHash?` on BridgeSession, `soul_strategy_selected` audit event |
| `src/bridge/agent-launcher.ts` | SOUL-aware launch with Strategy A/B, temp file management, `escapeShellArg(agentRole)` |
| `src/bridge/session-registry.ts` | `sweepOrphanedSoulFiles()` — orphan cleanup on init |
| `src/bridge/index.ts` | Export `LaunchOptions` from types |
| `src/agents/channel-router.ts` | Replaced inline `AGENT_SOULS` with Proxy delegating to SoulLoader |
| `src/channels/telegram/telegram-commands.ts` | `--as <role>` flag parsing in `/launch` |
| `src/cli/commands/register-all.ts` + `index.ts` | Registered `bridge` command |

---

## Strategy A/B Decision Logic

```
if agentRole specified AND agentType === "claude-code":
  if .claude/agents/{role}.md exists in project:
    → Strategy A: claude --agent {role}  (native integration)
  else:
    → Strategy B: claude --append-system-prompt-file {temp}
else:
  → Bare launch (no SOUL injection)
```

**Persona Source Resolution:**

| Priority | Source | Strategy |
|----------|--------|----------|
| 1 | `.claude/agents/{role}.md` in project | A (native `--agent`) |
| 2 | `SOUL-{role}.md` template file | B (`--append-system-prompt-file`) |
| 3 | Inline fallback string | B (content to temp file) |
| 4 | No `--as` specified | Bare launch |

---

## CTO Conditions Resolution

| Condition | Resolution |
|-----------|-----------|
| MF-1: Agent Installer required | `installAgents()` + CLI command `endiorbot bridge install-agents` |
| W-1: Verify --agent in tmux | Documented as prerequisite; manual verification pending |
| W-2: Strategy B temp file cleanup | `mode: 0o600` + cleanup on `/kill` + orphan sweep on startup |
| W-3: Don't sanitize SOUL content | Content integrity preserved — no metacharacter stripping |
| W-4: Use existing agent schema | `allowed-tools`, `max-turns` from `.claude/agents/architect.md` |
| C1: Regression gate | 5,605 tests pass, clean build |
| C2: ADR-025 preserves ADR-024 | Explicit preservation note in ADR-025 |

---

## PJM Code Review — Resolution

| Finding | Severity | Status |
|---------|----------|--------|
| H-1: Agent Installer not wired to CLI | High | FIXED — `src/cli/commands/bridge.ts` |
| H-2: Orphan sweep missing | High | FIXED — `sweepOrphanedSoulFiles()` in SessionRegistry |
| M-1: LaunchOptions not in types.ts | Medium | FIXED — moved to `src/bridge/types.ts` |
| M-2: console.warn in soul-loader | Medium | FIXED — injectable `logWarn` callback |
| M-3: Duplicated frontmatter regex | Medium | FIXED — agent-installer uses `createSoulLoader()` |
| M-4: agentRole not shell-quoted | Medium | FIXED — `escapeShellArg(agentRole)` |
| L-1: agentRole typed as string | Low | FIXED — `AgentRole` type from envelope |
| L-2: Unused `_role` parameter | Low | FIXED — removed from `buildAgentFile()` |

---

## Test Results

| Test File | Count | Coverage |
|-----------|-------|----------|
| `envelope.test.ts` | 10 | 13 roles, type guard, case sensitivity |
| `soul-loader.test.ts` | 13 | File/fallback, frontmatter strip, SHA256, cache |
| `soul-loader.security.test.ts` | 10 | Path traversal (4 variants), content integrity |
| `agent-launcher.soul.test.ts` | 13 | Strategy A/B, bare launch, invalid role, kill cleanup |
| `agent-installer.test.ts` | 12 | 13 files, schema, skip/force, fallback |
| `channel-router.soul-loader.test.ts` | 8 | Proxy delegation, all 13 roles |
| **Total** | **66** | |

**Regression:** 5,605 tests pass (66 new + 5,539 existing), 0 failures.

---

## Next Sprints

| Sprint | Scope | Authority |
|--------|-------|-----------|
| 85 | Permission Approval via Telegram | ADR-024 §8.4 |
| 86 | /send Command + Hook Installer | ADR-024 §8.5 |
| 87 | Brain L4 + Context Anchoring in Bridge | ADR-025 |
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline | ADR-025 |
| 89 | Agent Teams — Team File Generation | ADR-026 |
| 90 | Agent Teams — Telegram Integration + Smart Routing | ADR-026 |
| 91 | Agent Teams — Monitoring + Lifecycle | ADR-026 |
| 92 | Unified App Launcher | ADR-024 |
