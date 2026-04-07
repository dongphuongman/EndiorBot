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

## Documentation index

All stages (00–09): [`../README.md`](../README.md).

---

*EndiorBot | SDLC Framework **6.3.0** — Stage 01: Planning*
