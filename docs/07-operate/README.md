# 07-operate — Operate

## Purpose

**Key question:** **RUN** reliably — monitoring, incidents, cost/usage, and runbooks so production behavior stays within design and compliance?

Operations **closes feedback** into **09-govern** (improvement) and may trigger **04-build** / **05-test** hotfixes.

---

## Alignment

- **Upstream:** [`../06-deploy/`](../06-deploy/) (what was shipped), [`../03-integrate/`](../03-integrate/) (live integrations, channels)  
- **Downstream:** [`../09-govern/`](../09-govern/) (retros, RFCs), [`../04-build/`](../04-build/) (fixes)  
- **Spine:** [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md)  
- **Stage index:** [`../README.md`](../README.md)

---

## EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot serve` — unified runtime; `gateway` — WebSocket server; `analytics`, `performance` — usage/cost signals; `brain`, `checkpoint` — session continuity. |
| **Workflow** | Incident + fix loop: diagnose → `fix` / `compliance` → re-verify tests (documented runbook, not ad hoc). |

Catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

---

## Stage artifacts (living)

| Artifact | Location | Owner |
|----------|----------|-------|
| Runbooks / on-call | `docs/07-operate/` | @devops |
| SLO / incident templates | `docs/07-operate/` | @cto |

---

*EndiorBot | SDLC Framework **6.2.1** — Stage 07: Operate*
