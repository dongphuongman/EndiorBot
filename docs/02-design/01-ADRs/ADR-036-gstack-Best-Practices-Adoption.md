# ADR-036: gstack Best Practices Adoption

**Status:** ACCEPTED
**Date:** 2026-03-29
**Sprint:** 122
**Authority:** PM — CTO 7.5/10 APPROVED, CPO APPROVED with conditions
**Supersedes:** None
**SDLC Framework:** 6.2.0

---

## Context

gstack (Garry Tan, YC CEO) is an open-source AI engineering workflow system with 28 skills that transforms Claude Code into a virtual engineering team. CEO requested research into adoptable best practices for EndiorBot.

After PM + Architect research, 5 recommendations were proposed. CTO + CPO reviewed and approved 3 items (R3, R1+R2, R4 partial), deferred 2 (R4 /careful+/freeze, R5 LLM-as-Judge).

**CEO Directive:** Thinking framework must align with SDLC Framework 6.2.0 Pillar 0 (System Thinking + Design Thinking + Crisis-to-Pattern), not gstack's "Boil the Lake" ethos. Content ported into AGENTS.md, not a separate ETHOS.md file.

---

## Decision

### Adopted (3 items)

#### 1. AI-Oriented Error Messages (`agentGuidance` field)

Add optional `agentGuidance: string` to `EndiorBotErrorOptions`. When an AI agent encounters an error, the guidance tells it exactly what to try next.

**Rationale:** Errors are currently designed for programmatic handling (codes, retry flags). AI agents consuming these errors lack actionable recovery instructions.

**gstack precedent:** Error messages written for AI agents, not humans. Include next-step instructions.

#### 2. Shared Thinking Framework (AGENTS.md + SOUL Preamble)

Port SDLC 6.2.0 Pillar 0 thinking foundations into two injection points:
- **AGENTS.md generator** — `generateThinkingFrameworkSection()` adds System Thinking, Design Thinking, Crisis-to-Pattern to generated AGENTS.md
- **SOUL preamble** — `PREAMBLE.md` (≤150 tokens per CTO C3) prepended to every SOUL at load time via `SoulLoader`

**Rationale:** 14 SOUL templates have independent instructions with no shared decision-making framework. Agents can give inconsistent advice.

**gstack precedent:** Every skill starts with identical preamble (update check, session tracking, completeness intro). EndiorBot adapts this pattern with SDLC-native content instead.

#### 3. Investigation Protocol (@coder SOUL amendment)

Add structured debugging workflow to SOUL-coder.md: Reproduce → Hypothesize → Verify → Fix → Regression Test. Stop after 3 failed attempts.

**gstack precedent:** `/investigate` skill's "Iron Law: no fixes without investigation."

### Rejected

| Item | Reason |
|------|--------|
| `/careful` command | Redundant with `RiskClassifier.dangerousCommandPatterns` (lines 125-137) |
| `/freeze` command | OTT session model ambiguity — what scope does "freeze" apply to? |
| LLM-as-Judge (R5) | Low ROI at 14 SOULs. Defer until count > 20 or regression escapes |
| ETHOS.md file | CEO: don't create new file. Port content into AGENTS.md |
| Browser daemon | Not aligned with Solo Developer Power Tool identity |
| Skill template build system (.tmpl) | Preamble gives 80% benefit at 10% cost |
| Dual-host support | EndiorBot is Claude-native |

---

## Consequences

### Positive
- All 14 agents share a common decision-making framework (Iceberg Model, Design Thinking, Crisis-to-Pattern)
- Error recovery becomes actionable for AI agents, not just humans
- @coder follows structured debugging instead of trial-and-error

### Negative
- SOUL loading adds ~150 tokens per agent session (preamble overhead)
- `agentGuidance` strings must be maintained alongside error messages

### Risks
- Preamble drift: if SDLC framework updates, preamble must be updated too
- Mitigation: preamble loaded from file (PREAMBLE.md), not hardcoded

---

## References

- gstack repository: research source for patterns
- SDLC 6.2.0 System-Thinking-Foundation.md (Iceberg Model, 8 Mental Models)
- SDLC 6.2.0 Design-Thinking-Principles.md (5 Phases, DT Gates)
- SDLC 6.2.0 Crisis-To-Pattern-Methodology.md (5-Step Pipeline)
- SDLC 6.2.0 13-AGENTIC-CORE-PRINCIPLES.md (SASE Dual-Modality)
