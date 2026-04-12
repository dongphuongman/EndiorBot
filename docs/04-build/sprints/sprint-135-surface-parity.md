---
sprint: 135
status: PLANNED — Awaiting CEO kickoff
start_date: 2026-04-12
planned_duration: 5 days
framework: "6.3.0"
authority: "Frontend-Backend Mismatch Plan (CTO G2 APPROVED + CPO APPROVED WITH GUARDRAILS 2026-04-12)"
previous_sprint: "Sprint 134 — Config Externalization + Webhooks (COMPLETE 2026-04-11)"
conditions: ["C-HARD-1: OTT mutation confirm prompt", "C-SOFT-1: localhost-only verified", "CPO-1: config.json persistence", "CPO-2: auth policy documented", "CPO-3: 2-step confirm flow", "CPO-4: webhooks.json persistence"]
---

# Sprint 135 — Surface Parity (OTT + Web API for Sprint 131-134 features)

## Context

Sprint 131-134 shipped 9 backend features. 7 of them are invisible to CEO on Telegram/Zalo/Web/Desktop. This sprint closes the gap by adding OTT commands + Web API endpoints for the most critical features.

**Identity:** CEO Power Tool — CEO controls everything from any channel (phone, terminal, web).

## Locked Scope — 5 Days

| # | Item | Effort | Priority | CTO/CPO condition |
|---|------|--------|----------|-------------------|
| 1 | `/exec-policy` OTT (show + preset mutation + audit) | 0.5d | P0 | C-HARD-1: confirm prompt |
| 2 | `/config` OTT (view + AM toggle + auto-handoff toggle) | 1d | P0 | CPO-1: persist to config.json, CPO-3: confirm |
| 3 | `/audit` OTT (exec-policy / ssrf / webhooks viewer) | 0.5d | P1 | — |
| 4 | Web API (`/api/config`, `/api/audit`, POST mutations) | 1d | P1 | CPO-2: auth on non-localhost |
| 5 | Webhook management CLI + OTT | 0.5d | P1 | CPO-4: webhooks.json persistence |
| 6 | Webhook test coverage (CTO Sprint 134 finding) | 0.5d | P1 | — |
| 7 | PATCH mode corruption fix (dogfooding P0) | 1d | P1 | — |
| 8 | Active Memory in `/status` (carry-over eligible) | 0.25d | P2 | — |

**Carry-over rule (CPO):** if behind >0.5d, defer item 8 to Sprint 136.

---

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.0 | Sprint 135 Plan*
