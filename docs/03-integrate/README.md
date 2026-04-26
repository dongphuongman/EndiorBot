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
| Kimi API (Moonshot) | P0 | Implemented |
| Kimi OAuth Proxy (claude-code-proxy) | P1 | Implemented |
| Anthropic API (Claude Opus) | P0 | Implemented |
| OpenAI API (Codex / GPT) | P0 | Implemented |
| CLI → Gateway | P0 | Implemented |
| Web Channel | P1 | Implemented |
| Telegram (bidirectional) | P0 | Implemented |
| Zalo OA (bidirectional) | P1 | Implemented |

**Note:** Gemini API removed from active fallback chain per CEO directive 2026-04-23. Provider module retained for backward compatibility.

## Channel Integration

```
Browser  → WebSocket → Gateway → ChatHandler → AI Router → Response
Telegram → OTT Adapter → Gateway → Ingress → AI Router → Response
Zalo     → OTT Adapter → Gateway → Ingress → AI Router → Response
CLI      → Commander → ChatHandler → AI Router → Response
```

## Documentation index

All stages (00–09): [`../README.md`](../README.md).

## Integration Points (Sprint 142-143)

### Provider Enrichment Pipeline

```
buildEnrichedPrompt() → 5 provider functions (pure transport)
    ├── callClaudeBridge (CC CLI + tmux)
    ├── callKimiProvider (kimi-proxy/kimi-api)
    ├── callCloudFallback (OpenAI)
    ├── callRemoteOllama (AI-Platform)
    └── [future provider] — register + done
```

### Kimi Proxy Integration (Sprint 140-141)

- `ENDIORBOT_KIMI_PROXY_URL` → reuse external `claude-code-proxy`
- SSRF allowlist for configured local providers
- Rate-limit monitoring: 429 auto-fallback kimi-proxy → kimi-api

### Brain L2 → Recovery Engine (Sprint 143)

- `RecoveryEngine.findMatchingPattern()` queries Brain L2 error patterns
- `patternHint` injected into retry prompt via `AutonomousSessionManager`
- Conservative threshold: pattern count ≥ 2 (no one-off false positives)

## References

- [Stage & command spine](../00-foundation/stage-command-workflow-spine.md)
- [OTT Channels](../04-build/ott-channels.md)
- [ADR-029 Per-Chat Workspace](../02-design/01-ADRs/ADR-029-Per-Chat-Workspace.md)
- [ADR-052 Agent-Model Tier Mapping](../02-design/01-ADRs/ADR-052-agent-model-tier-mapping.md)
- [Sprint 139 Integration Spec](sprint-139-integration-spec.md)

---

*CEO Power Tool | SDLC Framework **6.3.1** — Stage 03: Integration — Updated Sprint 143 (2026-04-26)*
