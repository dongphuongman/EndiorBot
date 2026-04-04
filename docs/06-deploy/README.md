# 06-deploy — Deploy

## Purpose

**Key question:** **SHIP** safely — how do we release to production (or staging) with repeatable pipelines and clear rollback?

Deployment consumes **verified** artifacts from **05-test** and **G4**-ready evidence. It must not bypass gates or untested configuration.

---

## Alignment

- **Upstream:** [`../05-test/`](../05-test/) (verification), [`../04-build/`](../04-build/) (artifacts), [`../02-design/`](../02-design/) (NFRs, runbooks in design where applicable)  
- **Downstream:** [`../07-operate/`](../07-operate/) (monitoring, incidents)  
- **Gates:** **G4** (deploy readiness); operational sign-off per tier  
- **Spine:** [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md)  
- **Stage index:** [`../README.md`](../README.md)

---

## EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot ops build`, `endiorbot ops run` — local/staging verification; `config`, `secrets` — environment posture (no secrets in docs). |
| **Workflow** | Project CI/CD remains SSOT for cloud deploy; EndiorBot `serve` / gateway for channel surfaces — document *when* each path applies. |

Catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

---

## Stage artifacts (living)

| Artifact | Location | Owner |
|----------|----------|-------|
| Release notes / runbooks | Populate under `docs/06-deploy/` | @devops + @cto |
| Environment & pipeline specs | Repo CI config + this folder | @devops |

---

*EndiorBot | SDLC Framework **6.2.1** — Stage 06: Deploy*
