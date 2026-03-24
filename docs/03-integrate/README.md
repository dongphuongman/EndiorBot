# Stage 03: Integration

**SDLC Stage**: 03-INTEGRATE (CONNECT)
**Project:** EndiorBot
**Purpose**: Integration specifications, API contracts, external system connections
**Identity:** CEO Power Tool (LOCKED)

---

## Overview

This stage documents integration patterns between EndiorBot components and external systems.

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

## References

- [OTT Channels](../04-build/ott-channels.md)
- [ADR-029 Per-Chat Workspace](../02-design/01-ADRs/ADR-029-Per-Chat-Workspace.md)

---

*CEO Power Tool | SDLC Framework v6.2.0 — Stage 03: Integration*
