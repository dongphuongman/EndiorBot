# Sprint 122 — gstack Best Practices Adoption

**Date:** 2026-03-29
**Status:** COMPLETE
**Prerequisite:** Sprint 121 COMPLETE (7,446 tests passing, CTO 9.1/10 + CSO integration)
**Framework:** SDLC 6.2.0
**Authority:** PM — CTO APPROVED 7.5/10, CPO APPROVED with conditions

---

## Context

gstack (Garry Tan, YC CEO) is an open-source AI engineering workflow system with 28 skills, persistent browser daemon, three-tier testing, and "Boil the Lake" philosophy. CEO requested research into best practices adoptable by EndiorBot.

After PM + Architect research, CTO + CPO reviewed the 5-recommendation plan. Three items approved for Sprint 122, two deferred.

**CEO Directive:** Thinking framework (System Thinking + Design Thinking + Crisis-to-Pattern) must align with SDLC Framework 6.2.0 Pillar 0 — not gstack's ethos. Port into AGENTS.md, not a separate ETHOS.md.

**Goal:** Add AI-oriented error messages, inject shared thinking framework into AGENTS.md + SOUL preamble, add investigation protocol to @coder.

**Baseline:** 7,446 tests passing, 10 skipped, 0 failing, build clean.

---

## CTO Conditions (binding)

1. **C1 — No SDLC 6.3.0 references** unless version bump ADR written. Current is 6.2.0
2. **C2 — R1+R2 must ship together** (thinking framework dead without preamble injection)
3. **C3 — Preamble capped at 150 tokens** — add lint check to enforce
4. **C4 — /careful REJECTED** — redundant with existing RiskClassifier.dangerousCommandPatterns
5. **C5 — /freeze DEFERRED** — OTT session model ambiguity
6. **C6 — R5 LLM-as-Judge DEFERRED** — low ROI at 14 SOULs
7. **C7 — Total effort ≤ 10h**

## CPO Conditions (binding)

1. **C1-CPO — SE4H doc editing** — Preamble should allow SE4H agents to edit docs/ADR/evidence, only forbid production code
2. **C4-CPO — SDLC version consistency** — Reference 6.2.0, not 6.3.0

---

## Scope

### IN SCOPE

| Track | What | Est. | ADR |
|-------|------|------|-----|
| T1 — AI Error Messages (R3) | Add `agentGuidance` field to error hierarchy | 2-3h | ADR-036 |
| T2 — Thinking Framework (R1+R2) | Port System Thinking + Design Thinking into AGENTS.md generator + SOUL preamble | 4-6h | ADR-036 |
| T3 — Investigation Protocol (R4 partial) | Add structured debug workflow to SOUL-coder.md | 1h | — |

### OUT OF SCOPE

| Item | Why | When |
|------|-----|------|
| /careful command | REJECTED — redundant with RiskClassifier (CTO C4) | Never |
| /freeze command | DEFERRED — OTT session model unclear (CTO C5) | Sprint 124+ |
| LLM-as-Judge (R5) | DEFERRED — low ROI at 14 SOULs (CTO C6) | When SOUL count > 20 |
| ETHOS.md separate file | CEO directive — port into AGENTS.md instead | — |
| Persistent browser daemon | Not aligned with CEO Power Tool identity | — |
| Skill template build system | Preamble pattern gives 80% benefit at 10% cost | — |

---

## Track 1: AI-Oriented Error Messages (R3)

**Problem:** EndiorBot errors have codes, categories, severity — all for programmatic handling. When an AI agent encounters an error, it has no guidance on recovery.

**Solution:** Add optional `agentGuidance` field to `EndiorBotErrorOptions`. Populate in factory functions.

**Files:**
| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/errors/base.ts` | Add `agentGuidance?: string` to options + class + toJSON() |
| MODIFY | `src/errors/agent.ts` | Add guidance to 11 factory functions |
| MODIFY | `src/errors/budget.ts` | Add guidance to 4 factory functions |
| MODIFY | `src/errors/provider.ts` | Add guidance to 4 factory functions |

**Guidance examples:**
- `AGENT_NOT_FOUND` → "Try /help to see available agents. Agent may require a higher tier."
- `BUDGET_EXCEEDED` → "Switch to sonnet model or use /cost to check budget. Request CEO approval to extend."
- `PROVIDER_RATE_LIMITED` → "Wait and retry. Fallback providers are auto-selected."
- `HANDOFF_BLOCKED` → "Check ALLOWED_TRANSITIONS. Use /team-status to see valid handoff paths."

---

## Track 2: Thinking Framework Injection (R1+R2)

**Problem:** 14 SOUL templates have independent instructions — no shared decision-making framework. Agents can give inconsistent advice.

**Solution (two parts, must ship together per CTO C2):**

### T2-A: AGENTS.md Generator Enhancement

Add a "Thinking Framework" section to the generated AGENTS.md:
- System Thinking: Iceberg Model (4 layers) + 8 Mental Models
- Design Thinking: 5 phases (Empathize → Test)
- Crisis-to-Pattern: 5-step pipeline (Diagnose → Document)
- Effort Compression Table (from SDLC 6.2.0)

**File:** `src/sdlc/scaffold/templates/agents-md.ts` — add `generateThinkingFrameworkSection()` function

### T2-B: SOUL Preamble

Create a shared preamble prepended to every SOUL at load time.

**Constraint (CTO C3):** ≤ 150 tokens. Content:
```
## Shared Context
- System Thinking: Events → Patterns → Structures → Mental Models (Iceberg)
- Design Thinking: Empathize → Define → Ideate → Prototype → Test
- Crisis → Pattern: Diagnose → Policy → Automate → Enforce → Document
- SE4H: advise only, may edit docs/ADR/evidence, MUST NOT write production code
- SE4A: execute within gates, produce MRP evidence
- Budget: Sonnet default. Opus for architecture only.
```

**Files:**
| Action | File | Change |
|--------|------|--------|
| CREATE | `docs/reference/templates/souls/PREAMBLE.md` | Shared context block (≤150 tokens) |
| MODIFY | `src/bridge/intelligence/soul-loader.ts` | Prepend preamble in `load()`, add `preambleHash` |
| MODIFY | `src/sdlc/scaffold/templates/agents-md.ts` | Add thinking framework section to generator |

---

## Track 3: Investigation Protocol (R4 partial)

**Problem:** @coder jumps to fixes without diagnosing root cause. gstack's Iron Law: "no fixes without investigation."

**Solution:** Add investigation protocol section to SOUL-coder.md:
1. **Reproduce** — Confirm the bug exists, capture exact steps
2. **Hypothesize** — Form 2-3 hypotheses about root cause
3. **Verify** — Test each hypothesis with targeted reads/greps
4. **Fix** — Apply fix to the confirmed root cause only
5. **Regression test** — Write test that would have caught this bug
6. **Stop rule** — After 3 failed fix attempts, escalate to @architect

**File:** `docs/reference/templates/souls/SOUL-coder.md` — add `## Investigation Protocol` section

---

## Execution Order

```
Sprint 122:
├── T1: agentGuidance in base.ts + agent.ts + budget.ts + provider.ts  [2-3h]
├── T2-A: agents-md.ts thinking framework section                      [2-3h]
├── T2-B: PREAMBLE.md + soul-loader.ts preamble injection             [2h]
├── T3: SOUL-coder.md investigation protocol                           [1h]
├── Build + test suite verification
└── Sprint doc close
```

---

## Verification

```bash
# T1: agentGuidance field exists and populated
grep "agentGuidance" src/errors/base.ts src/errors/agent.ts src/errors/budget.ts src/errors/provider.ts

# T2-A: AGENTS.md generator includes thinking framework
pnpm vitest tests/sdlc/scaffold/ --reporter=verbose

# T2-B: Preamble injected into SOUL loading
pnpm vitest tests/bridge/intelligence/soul-loader.test.ts --reporter=verbose

# T3: Investigation protocol in SOUL-coder
grep "Investigation Protocol" docs/reference/templates/souls/SOUL-coder.md

# Preamble token count check (CTO C3: ≤150 tokens)
wc -w docs/reference/templates/souls/PREAMBLE.md  # rough: words ≈ tokens × 0.75

# Full suite
pnpm build && pnpm test  # 7,446+ tests, 0 failures
```

---

## ADR Reference

- **ADR-036**: gstack Best Practices Adoption (see `docs/02-design/01-ADRs/ADR-036-gstack-Best-Practices-Adoption.md`)
