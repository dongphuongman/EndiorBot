---
spec_id: ADR-025
title: "Session Intelligence Envelope + 3-Layer Context Model"
spec_version: "1.0.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024"]
---

# ADR-025: Session Intelligence Envelope + 3-Layer Context Model

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** CTO (8/10 APPROVED) + CPO (APPROVED) + Synthesis (GO)
**Authority:** Sprint 84–88

---

## Context

ADR-024 established the Notification Bridge — tmux-based multi-agent session management controllable from Telegram. However, Bridge sessions launch agents **bare**: no SOUL template, no Brain context, no Code Search, no skills injection. All 10 intelligence systems (Brain L4, SOUL Templates, Code Search, Skills, Context Anchoring, Vibecoding, Gate Engine, Compliance, Session Resilience, Evaluator) are wired to **API Mode** (`claude -p --append-system-prompt`) but **zero** are connected to Bridge Mode.

| Problem | Impact |
|---------|--------|
| Bridge sessions launch without persona | Agent has no role awareness — generic responses |
| No SOUL template in Bridge Mode | Same @pm/@architect experience from VSCode missing in Telegram |
| Intelligence systems disconnected | 10 systems built but unused in the primary interactive mode |
| CEO cannot distinguish modes | Expects seamless experience regardless of Telegram vs VSCode |

**Key constraint**: Sprint 84 extends ADR-024 (adds SOUL layer to Bridge). It does **NOT** replace ADR-024's planned Sprint 85 (Permission Approval via §8.4) or Sprint 86 (Hook Installer via §8.5). Those remain on schedule.

---

## Decisions

### D1. SessionIntelligenceEnvelope as extensible contract

**Context**: 10 intelligence systems need to inject context into Bridge sessions. Without a unified contract, each system would wire in ad-hoc.

**Decision**: Define `SessionIntelligenceEnvelope` interface as the single container for all intelligence injected into a Bridge session. Sprint 84 populates `persona` only. Sprint 87+ extends with `brain`, `context`, `evaluator`, `guardrails`.

```typescript
interface SessionIntelligenceEnvelope {
  persona: PersonaEnvelope;     // Sprint 84
  // brain?: BrainEnvelope;     // Sprint 87
  // context?: ContextEnvelope; // Sprint 87
  // evaluator?: EvaluatorEnvelope; // Sprint 88
}
```

**Rationale**: Single interface prevents fragmentation. Each sprint adds one layer without breaking existing code. Type system enforces the contract.

### D2. 3-Layer Context Model

**Context**: Different intelligence has different lifecycles — SOUL is set once at launch, task context changes per /send, evaluator scores are derived post-turn.

**Decision**: Three distinct layers with explicit mutability and token budgets:

| Layer | When | Content | Mutability | Method | Token Budget |
|-------|------|---------|------------|--------|-------------|
| **Launch-time** | Session creation | SOUL, role, guardrails | Immutable | CLI flag (`--agent` or `--append-system-prompt-file`) | 7K ceiling |
| **Turn-time** | Each `/send` (Sprint 86) | Sprint goals, blockers, fix hints | Mutable | sendKeys prefix | 2K per task |
| **Post-turn** | After agent output (Sprint 88) | Evaluator score, vibecoding | Derived | Capture → store | 0 (no agent tokens) |

**Rationale**: Separation prevents SOUL re-injection on every turn (wasteful), keeps task context fresh, and evaluator output never consumes agent tokens.

### D3. SoulLoader as Single Source of Truth

**Context**: SOUL templates exist in two places: `docs/reference/templates/souls/SOUL-*.md` (13 full files) and `AGENT_SOULS` constant in `channel-router.ts` (13 one-liner strings). This duplication causes drift.

**Decision**: Create `SoulLoader` class as SSOT. Loads from filesystem first, falls back to inline strings. Both API Mode (`channel-router.ts`) and Bridge Mode (`agent-launcher.ts`) use the same loader.

**Persona Source Resolution Priority:**

| Priority | Source | Condition | Strategy |
|----------|--------|-----------|----------|
| 1 | `.claude/agents/{role}.md` in project | File exists | A (native `--agent` flag) |
| 2 | `docs/reference/templates/souls/SOUL-{role}.md` | File exists, agent file missing | B (`--append-system-prompt-file`) |
| 3 | Inline `AGENT_SOULS` fallback | Both files missing | B (inline content to temp file) |
| 4 | Bare launch (no SOUL) | `--as` not specified | None |

**Rationale**: Filesystem-first ensures full SOUL content (100-237 lines). Inline fallback ensures graceful degradation. Never throws — always returns a result.

### D4. SOUL content integrity — no blanket sanitization

**Context**: Earlier proposals suggested stripping shell metacharacters, backticks, and `$()` from SOUL content. However, both injection strategies (Strategy A: `--agent` file read by Claude Code; Strategy B: `--append-system-prompt-file`) use **file-based** injection — content never passes through a shell interpreter.

**Decision**: Do NOT strip metacharacters from SOUL content body. Input validation is on `agentRole` (strict allowlist of 13 known roles), not on content body. Stripping would destroy legitimate SOUL content (code examples with backticks in SOUL-coder.md, command examples in SOUL-devops.md).

If inline `--append-system-prompt "<content>"` injection is ever needed in the future, sanitization happens at the **injection point**, not in the loader.

**Rationale**: Defense at the right layer. Path traversal guard + role allowlist prevent malicious input. Content is trusted (authored by EndiorBot team, stored in repo).

### D5. Two SOUL injection strategies for Claude Code

**Context**: Claude Code natively supports custom agents via `.claude/agents/` directory with `--agent` flag. This provides model selection, tool restrictions, persistent memory, and skills — all handled natively. However, not all projects have `.claude/agents/` set up.

**Decision**: Two strategies with automatic selection:

**Strategy A (preferred): `--agent` flag — native integration**
- Condition: `.claude/agents/{role}.md` exists in the target project
- Command: `claude --agent {role}`
- Benefits: Native persona, model, tools, memory — zero EndiorBot overhead

**Strategy B (fallback): `--append-system-prompt-file`**
- Condition: Agent file missing in target project
- Command: `claude --append-system-prompt-file {soulPath}`
- SOUL content written to `~/.endiorbot/sessions/{sessionId}/soul.md`
- File permissions: `mode: 0o600` (owner read/write only)
- Cleanup: on `/kill` + orphan sweep on startup

**Note on `memory: project`**: Claude Code's native persistent memory complements (does not replace) Brain L4 injection. Brain provides structured mental models; `memory: project` provides Claude Code's native cross-session context.

**Rationale**: Strategy A is the cleanest path — the agent file IS the SOUL. Strategy B ensures SOUL injection works for any project without pre-setup. Agent Installer (Sprint 84, Task 5b) enables Strategy A for all projects.

### D6. Non-Claude agents launch bare (Sprint 84)

**Context**: cursor, codex-cli, and gemini-cli may support system prompt injection flags, but these are unverified.

**Decision**: Sprint 84 implements SOUL injection for Claude Code only. Other agents launch bare (same as today). CLI flag research for non-Claude agents deferred to Sprint 86.

**Rationale**: Ship working solution for primary agent. Don't block Sprint 84 on unresearched flags.

---

## Consequences

### Positive

- Bridge sessions gain persona awareness — @pm and @architect work the same in Telegram as in VSCode
- Single source of truth for SOUL loading eliminates duplication between API Mode and Bridge Mode
- Extensible envelope enables progressive intelligence integration (Sprint 87-88) without re-architecture
- 3-layer model prevents wasteful SOUL re-injection on every turn
- Strategy A/B approach works for any project regardless of `.claude/agents/` setup

### Constraints

- Sprint 84 is persona-only — brain, context, evaluator layers are empty stubs
- Non-Claude agents (cursor, codex, gemini) have no SOUL injection until Sprint 86
- Strategy B temp files require cleanup lifecycle management

### Risks

| Risk | Mitigation |
|------|-----------|
| `--agent` flag may not work in interactive tmux mode | Manual verification required before implementation (CTO C3) |
| Strategy B temp file accumulation | Cleanup on /kill + orphan sweep on startup |
| SOUL content drift between templates and agent files | Agent Installer regenerates from SOUL templates |

---

## Implementation Plan

### Sprint 84 (THIS SPRINT): SOUL Bridge Foundation

| Task | Description |
|------|------------|
| T1.1 | `SessionIntelligenceEnvelope` interface (`src/bridge/intelligence/envelope.ts`) |
| T1.2 | This ADR (ADR-025) |
| Task 1 | `SoulLoader` class (`src/bridge/intelligence/soul-loader.ts`) |
| Task 2 | Refactor `channel-router.ts` to use SoulLoader |
| Task 3 | `agentRole` + `soulContentHash` in `BridgeSession` + `LaunchOptions` |
| Task 4 | SOUL-aware launch in `agent-launcher.ts` (Strategy A/B) |
| Task 5 | `/launch --as` Telegram command |
| Task 5b | Agent Installer (`install-agents` command) |
| Task 6 | ~31 tests across 6 test files |

### Sprint 85–88: Progressive Intelligence Integration

| Sprint | Layer | Scope |
|--------|-------|-------|
| 85 | Turn | Permission Approval via Telegram (ADR-024 §8.4) |
| 86 | Turn | /send Command + Hook Installer (ADR-024 §8.5) |
| 87 | Launch+Turn | Brain L4 + Context Anchoring in Envelope |
| 88 | Post-turn | Evaluator + Vibecoding in Bridge Output Pipeline |

### Sprint 89–91: Claude Code Agent Teams (ADR-026)

| Sprint | Scope |
|--------|-------|
| 89 | Team file generation (`team-installer.ts`), `AGENT_TEAMS` flag, `bridge install-teams` CLI |
| 90 | Telegram `/launch --as-team`, basic complexity gating |
| 91 | Team monitoring, cost tracking, `/kill-team` lifecycle |

### Sprint 92: Unified App Launcher (infrastructure)

---

## References

- **ADR-024**: Notification Bridge + Multi-Agent Session Management
- **Sprint 84 Plan**: v5-final (CTO APPROVED 8/10, CPO APPROVED)
- **Claude Code Docs**: [Best Practices](https://code.claude.com/docs/en/best-practices), [Sub-agents](https://code.claude.com/docs/en/sub-agents), [CLI Reference](https://code.claude.com/docs/en/cli-reference)
- **SOUL Templates**: `docs/reference/templates/souls/SOUL-*.md` (13 files)
