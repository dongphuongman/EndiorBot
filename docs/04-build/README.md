# 04-build — Build

## Purpose

**Key question:** Are we **building right** — implementation matches design and requirements?

This stage is where **code** and **delivery artifacts** land. It must remain traceable to **02-design** and verifiable in **05-test**.

---

## Alignment

- **Upstream:** `docs/02-design/`, `docs/03-integrate/` (contracts)  
- **Downstream:** `docs/05-test/` (evidence, regression), `docs/06-deploy/` (release inputs after G4)  
- **Gates:** G-Sprint, **G3** (build/test readiness)  
- **Stage index:** [`../README.md`](../README.md)

---

## Build ↔ design ↔ test

| Link | Rule |
|------|------|
| Code → design | Significant behavior changes require ADR update or approved waiver. |
| Code → requirements | Features map to acceptance criteria from planning. |
| Build → test | CI / `pnpm test` (or project equivalent) green before claiming G3. |

Spine: [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md).

---

## EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot ops build`, `endiorbot ops run` (polyglot); `fix --dry-run` / `compliance fix`; Bridge `launch` / `send` for Claude Code execution. |
| **Workflow** | `bootstrap` (new repo path); `endiorbot sprint close` (verify → docs → commit); future **workflow execute** (124b+) chains tasks with CEO checkpoints. |

Catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

---

## Stage artifacts (living)

| Artifact | Location | Owner |
|----------|----------|-------|
| Sprint plans / drafts | `docs/04-build/sprints/` | @pjm |
| OTT / build notes | `docs/04-build/` | @coder |

---

## Documentation index

All stages (00–09): [`../README.md`](../README.md).

---

*EndiorBot | SDLC Framework **6.3.0** — Stage 04: Build*
