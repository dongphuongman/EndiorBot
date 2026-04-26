# 01-planning — Planning

## Purpose

**Key question:** **WHAT** are we building — scope, requirements, acceptance criteria, backlog?

Planning **feeds design (02)** and is **tested against (05)** via acceptance criteria. No feature work without traceable requirements.

---

## Alignment

- **Upstream:** [`../00-foundation/product-vision.md`](../00-foundation/product-vision.md), [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md)  
- **Downstream:** `docs/02-design/` (ADRs, specs), `docs/03-integrate/` (contracts)  
- **Gates:** G0.1 (problem), G1 (requirements)  
- **Stage index:** [`../README.md`](../README.md)

---

## EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot plan "…"` / `/plan` — structured task draft → `docs/04-build/sprints/drafts/`; `consult` / `/consult` — multi-model input (CEO decides). |
| **Workflow** | `init` + compliance **check** after scope change; sprint planning with PJM in agent layer. |

Catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

---

## Stage artifacts (living)

| Artifact | Status | Owner |
|----------|--------|-------|
| Requirements / user stories | Populate under `docs/01-planning/` | @pm + @pjm |
| Gate evidence | G0.1 / G1 | @cpo / @ceo per tier config |

---

## Sprint History (Recent)

| Sprint | Focus | Status |
|--------|-------|--------|
| 139 | OpenMythos evaluator optimization (#1-4) | CLOSED |
| 140 | Kimi k2.6 integration + ADR-052 tier mapping | CLOSED |
| 141 | Cost telemetry + Ollama confidence + Kimi resilience | CLOSED |
| 142 | Anti-drift improvements + vendor-agnostic provider refactor | CLOSED |
| 143 | Brain L2 activation + 17th mechanism docs + OGA handoff | CLOSED (Track A) |

Full sprint index: [`../04-build/sprints/SPRINT-INDEX.md`](../04-build/sprints/SPRINT-INDEX.md)

## Current Stats

- **8,111+ tests** passing (8,121 total, 10 skipped)
- **35+ CLI commands**, 30+ OTT commands
- **14 SOUL agents** across 3 tiers
- **6 providers** (Claude Code, Kimi proxy, Kimi API, OpenAI, Gemini, Ollama)

---

*EndiorBot | SDLC Framework **6.3.1** — Stage 01: Planning — Updated Sprint 143 (2026-04-26)*
