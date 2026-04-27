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
| 143 | Brain L2 activation + gate mark + gateway resilience hotfixes (7 issues) | CLOSED |
| **144** | **Gateway hardening: PID lockfile + circuit breaker + OTT timeout + Kimi deprecation** | **PLANNED** |

Full sprint index: [`../04-build/sprints/SPRINT-INDEX.md`](../04-build/sprints/SPRINT-INDEX.md)

## Sprint 143 Planning Highlights

### Gate Mark — Team-Level Gate Progression

**Problem:** 10 gate checklist items with `autoCheck: false` required CEO `--force` override — no team-level mechanism existed. CEO quote: *"đã confirm mà phải dùng force luôn luôn là không đúng"*.

**Solution:** New `gate mark` subcommand enables teams to mark manual items as complete with evidence trail:

```bash
endiorbot gate mark G1 g1-stakeholder-signoff --pass --evidence "CEO approved via Telegram 2026-04-26"
endiorbot gate confirm G1 --confirm   # succeeds without --force
```

- Evidence persisted in `~/.endiorbot/evidence/<projectId>/gate-marks.json`
- `--evidence` flag mandatory for audit trail
- CEO `--force` override unchanged — `gate mark` is the team-level path

### CC-First Routing (ADR-052 Amendment)

All Tier 2 SDLC agents now use Claude Code (sonnet) as primary provider. Kimi is fallback on rate-limit only. CEO directive: *"dù dùng CC hay Kimi thì vẫn phải đọc codebase"* — workspace context injected for ALL intents, not PATCH-only.

### OGA Sprint 1 (Track B — Separate Project)

NQH Creative Studio (Open-Generative-AI) Sprint 1 kicked off — fork, rebrand, provider abstraction, local image generation via mflux on Apple Silicon. Managed by EndiorBot via `endiorbot repos add oga`.

## Current Stats

- **8,142 tests** passing (8,152 total, 10 skipped)
- **35+ CLI commands**, 30+ OTT commands
- **14 SOUL agents** across 3 tiers (CC-first for Tier 2)
- **5 active providers** (Claude Code, Kimi proxy, Kimi API, OpenAI, Ollama)
- **2 moderate vulnerabilities** (dev-only, down from 37)

---

*EndiorBot | SDLC Framework **6.3.1** — Stage 01: Planning — Updated Sprint 143 close (2026-04-26)*
