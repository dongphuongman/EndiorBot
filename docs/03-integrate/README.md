# 03-integrate — Integration

**SDLC stage:** 03-INTEGRATE (CONNECT)  
**Project:** EndiorBot  
**Identity:** CEO Power Tool (LOCKED)

## Purpose

**Key question:** **HOW** do parts connect — contracts, channels, external systems — so **design (02)** and **build (04)** stay aligned?

Stage 03 is the **CTO bridge**: integration specs and runtime paths must match ADRs and remain testable in **05-test**. See the full stage ↔ command model in [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md).

---

## Alignment

- **Upstream:** [`../02-design/`](../02-design/) (ADRs, APIs), [`../01-planning/`](../01-planning/) (scope for external touchpoints)  
- **Downstream:** [`../04-build/`](../04-build/) (implements contracts), [`../05-test/`](../05-test/) (contract & channel verification)  
- **Gates:** **G2** (contracts aligned with design); **G3** smoke across channels where applicable  
- **Spine:** [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md)  
- **Stage index:** [`../README.md`](../README.md)

---

## Overview

This stage documents integration patterns between EndiorBot components and external systems (APIs, OTT channels, gateway, CLI parity).

### EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot serve` (unified ingress); `config`, `status`; OTT commands that hit the same handlers as CLI (thin client). |
| **Workflow** | Onboarding a repo end-to-end: `bootstrap` → `plan` → `sprint close` with integration checks per tier. |

Full catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

### Gates

- **G2** outputs (contracts, security boundaries) feed integration docs here.  
- **G3** evidence often includes cross-channel or API smoke paths defined in this stage.

## Contents

- `autonomy-epic/` — Autonomy epic integration plans
- `sprint-50-validation-plan.md` — Sprint 50 validation plan

## MVP Integrations (Tier 1)

| Integration | Priority | Status |
|-------------|----------|--------|
| Gemini API | P0 | Implemented |
| Anthropic API (Claude Opus) | P0 | Implemented |
| CLI → Gateway | P0 | Implemented |
| Web Channel | P1 | Implemented |
| Telegram (bidirectional) | P0 | Implemented |
| Zalo OA (bidirectional) | P1 | Implemented |

## Channel Integration

```
Browser  → WebSocket → Gateway → ChatHandler → AI Router → Response
Telegram → OTT Adapter → Gateway → Ingress → AI Router → Response
Zalo     → OTT Adapter → Gateway → Ingress → AI Router → Response
CLI      → Commander → ChatHandler → AI Router → Response
```

## Documentation index

All stages (00–09): [`../README.md`](../README.md).

## References

- [Stage & command spine](../00-foundation/stage-command-workflow-spine.md)
- [OTT Channels](../04-build/ott-channels.md)
- [ADR-029 Per-Chat Workspace](../02-design/01-ADRs/ADR-029-Per-Chat-Workspace.md)

---

*CEO Power Tool | SDLC Framework **6.3.0** — Stage 03: Integration*
