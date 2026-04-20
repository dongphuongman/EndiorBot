# EndiorBot documentation index

**Framework:** MTS SDLC **6.3.0** · **Identity:** CEO Power Tool (solo dev, enterprise-grade discipline)

This folder is the **stage-shaped** home for product and engineering docs. **Command SSOT** lives in code (`./endiorbot.mjs`); **stage semantics** (WHY → WHAT → HOW → CONNECT → BUILD → VERIFY → …) are summarized in [`00-foundation/stage-command-workflow-spine.md`](00-foundation/stage-command-workflow-spine.md).

### Documentation language (SDLC Framework)

Per MTS SDLC **6.3.0**, **application development documentation** under `docs/` (stage READMEs, ADRs, technical specs, sprint plans, test plans, and reference templates) is authored in **English** so reviews, gates, and tooling stay consistent. Product-facing OTT strings or locale-specific runbooks may use other languages when explicitly scoped outside this tree.

---

## Core pipeline (00 → 05)

Design → build → test traceability is **mandatory** between these stages; stage **03** is the integration bridge (not optional for platform work).

| Stage | Folder | Key question | README |
|-------|--------|--------------|--------|
| **00** Foundation | [`00-foundation/`](00-foundation/) | **WHY** | [`README.md`](00-foundation/README.md) |
| **01** Planning | [`01-planning/`](01-planning/) | **WHAT** | [`README.md`](01-planning/README.md) |
| **02** Design | [`02-design/`](02-design/) | **HOW** (design) | [`README.md`](02-design/README.md) |
| **03** Integrate | [`03-integrate/`](03-integrate/) | **CONNECT** | [`README.md`](03-integrate/README.md) |
| **04** Build | [`04-build/`](04-build/) | **BUILD** | [`README.md`](04-build/README.md) |
| **05** Test | [`05-test/`](05-test/) | **VERIFY** | [`README.md`](05-test/README.md) |

**North star & autonomy:** [`00-foundation/product-vision.md`](00-foundation/product-vision.md)  
**Atomic CLI / OTT / Web vs workflows:** [`00-foundation/stage-command-workflow-spine.md`](00-foundation/stage-command-workflow-spine.md)  
**Command catalog (templates & agents):** [`reference/templates/COMMANDS.md`](reference/templates/COMMANDS.md)

---

## Extended lifecycle (06 → 09)

Same **thin-client** rule: operational docs describe *what* to run; execution goes through EndiorBot core where applicable (`ops`, `serve`, `compliance`, `gate`, …).

| Stage | Folder | Key question | README |
|-------|--------|--------------|--------|
| **06** Deploy | [`06-deploy/`](06-deploy/) | **SHIP** — release, envs, CI/CD | [`README.md`](06-deploy/README.md) |
| **07** Operate | [`07-operate/`](07-operate/) | **RUN** — monitoring, incidents | [`README.md`](07-operate/README.md) |
| **08** Collaborate | [`08-collaborate/`](08-collaborate/) | **ALIGN** — humans, compliance, handover | [`README.md`](08-collaborate/README.md) |
| **09** Govern | [`09-govern/`](09-govern/) | **IMPROVE** — RFCs, retros, process | [`README.md`](09-govern/README.md) |

---

## Naming note

Use **`03-integrate`** (folder name in this repo). Older docs may say `03-integration`; treat that as the same stage and prefer **`docs/03-integrate/`** in new links.

---

## Reference templates

Scaffold outputs and agent guidance: [`reference/templates/`](reference/templates/)

---

## Current state (Sprint 135, 2026-04-12)

| Metric | Value |
|--------|-------|
| Tests | 7,921 passing |
| CLI commands | ~35 |
| OTT commands | 30+ (Telegram + Zalo) |
| SOUL agents | 14 + preamble |
| AI providers | 6 (Anthropic, OpenAI, Gemini, GitHub, Ollama, Claude Code) |
| Channels | 4 (CLI, Web, Telegram, Zalo) + Desktop (Electron) |

### Sprint 131-135 capabilities (openclaw backport + surface parity)

| Capability | Backend | CLI | OTT | Web API | Ref |
|------------|---------|-----|-----|---------|-----|
| Command discovery | `cmd.list` RPC | `endiorbot commands` | `/commands` | JSON-RPC | Sprint 132 M0 |
| Exec-policy | 9-module cluster | 6 subcommands | `/exec-policy show\|preset\|audit` | `POST /api/config/exec-policy/preset` | Sprint 132 M1 |
| Active Memory | Cache-first context refresh | env toggle | `/config active-memory on\|off` | `POST /api/config/active-memory` | Sprint 133 S1 |
| SSRF defense | `safeFetch` + `http-validator.ts` | — | `/audit ssrf` | `GET /api/audit/ssrf` | Sprint 133 S2 |
| Config SSOT | `src/config/timeouts.ts` | env vars | `/config` view | `GET /api/config` | Sprint 134 |
| Webhooks ingress | `POST /api/webhooks/:triggerId` | — | `/webhooks list\|test` | `GET /api/audit/webhooks` | Sprint 134 |
| Unified audit | JSONL logs | `exec-policy audit` | `/audit exec-policy\|ssrf\|webhooks` | `GET /api/audit/:type` | Sprint 135 |

Key docs: [ADR-046 (exec-policy)](02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md) · [Deploy guide](06-deploy/README.md) · [Usage guide](07-operate/USAGE-GUIDE.md) · [Openclaw backport PRD](01-planning/openclaw-backport/PRD.md)

---

*EndiorBot | docs/ stage index | SDLC 6.3.0 | Updated Sprint 135*
