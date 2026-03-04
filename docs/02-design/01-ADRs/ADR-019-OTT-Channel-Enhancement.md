# ADR-019: OTT Channel Enhancement — Full Agent & Team Parity + Webhook

**Status:** Accepted
**Date:** 2026-03-04
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** 76

---

## Context

OTT channels (Telegram + Zalo) were built in Sprint 38/46/57 with limited functionality: 4 agents on keyboard, 4 commands, polling-only delivery, no team support, and hardcoded READ mode. Sprint 74 added 13 agents + 7 teams to the core, and Sprint 75 added the Compliance Fix Engine. OTT channels have none of these capabilities.

CEO Audit Reports identified 5 gaps:
1. Agent keyboard shows only 4/13 agents (31%)
2. Team support is completely absent (0/7)
3. Only 4 commands available (vs 14 needed)
4. Hardcoded READ mode (no PATCH escalation)
5. Outdated help message

Additionally, the CEO requires webhook support for both Telegram and Zalo to replace polling (lower latency, lower resource usage), and the Telegram Diagnostic Report identified bridge timeout issues with large Claude Code sessions.

**CTO Review:** 8/10 APPROVED WITH CONDITIONS (C1-C3 below)
**CPO Review:** APPROVED

---

## Decisions

### 1. Update `hasMention()` to accept `teamRegistry` (CTO C1)

`hasMention()` at `mention-parser.ts:367` currently calls `parseMention(input)` without teamRegistry. This means team names like `@planning` are not recognized, and the message is never processed as a mention in OTT handlers.

**Fix:** Add optional `teamRegistry?` parameter to `hasMention()` and forward it to `parseMention()`. This is backward compatible — callers without teamRegistry continue to work unchanged.

### 2. Webhook via existing WebGatewayServer

Reuse the existing HTTP server at `gateway/web-server.ts:131` (port 18790) instead of creating a new server. Add two POST routes:
- `POST /webhook/telegram` — Telegram Bot API webhook
- `POST /webhook/zalo` — Zalo OA webhook

**CTO C2 addressed:** The existing `handleHttpRequest()` only handles GET routes. A new `WebhookHandler` class handles POST body parsing: chunk accumulation via `req.on('data')`/`req.on('end')`, 1MB size limit (413 if exceeded), JSON parse with error handling (400 on invalid JSON).

### 3. Zalo uses OA (Official Account), not Bot API (CTO C3)

The existing `zalo-bot-api.ts:setWebhook()` is for the Zalo Bot platform (personal accounts). EndiorBot uses Zalo OA, where webhook URLs are registered in the Zalo OA admin panel, not via API.

**Fix:** No programmatic webhook registration for Zalo. The webhook endpoint receives events and verifies them via HMAC-SHA256 MAC signature. ADR-019 documents the admin panel setup process for CEO reference.

### 4. Telegram webhook with polling fallback

Telegram webhook requires HTTPS. Since EndiorBot runs locally (HTTP on port 18790), a reverse proxy (nginx, Cloudflare Tunnel, or ngrok) is required.

- `/webhook on` → calls Telegram Bot API `setWebhook(url, secret_token)`, stops polling
- `/webhook off` → calls `deleteWebhook()`, resumes polling
- Polling remains the default and fallback mode

### 5. Webhook security

| Measure | Telegram | Zalo |
|---------|----------|------|
| Authentication | `X-Telegram-Bot-Api-Secret-Token` header | HMAC-SHA256 MAC signature |
| CORS | No wildcard CORS on webhook routes (W4) | Same |
| Rate limiting | 100 req/min per IP (W5) | Same |
| Replay protection | Telegram handles this server-side | Timestamp freshness check: reject events > 5 min old (W6) |
| Chat ID guard | Validate sender matches CEO chat ID | Validate OA ID matches config |

### 6. Mode escalation with CEO confirmation

OTT channels default to `mode: "READ"`. PATCH mode requires explicit CEO confirmation:
1. CEO sends `@agent PATCH: task` (or `/mode patch`)
2. OTT shows confirmation keyboard: `[Confirm PATCH] [Cancel]`
3. Only on confirm → invoke with `mode: "PATCH"`
4. After apply/reject → auto-reset to READ

This reuses the existing `createPatchConfirmKeyboard()` from `keyboards.ts:96-113`.

### 7. OTT bridge timeout: 300s (5 minutes)

CEO noted that Claude Code sessions with large context and multiple agents can take several minutes. The OTT default timeout is set to 300 seconds (5 minutes), matching the CLI default.

Configurable via `ENDIORBOT_OTT_TIMEOUT` environment variable. Do NOT reduce to 90s.

### 8. Tier-aware keyboards

Agent keyboard shows 12 agents (assistant excluded — it's a router, not user-facing):
- SE4A row (9): researcher, pm, pjm, architect, coder, reviewer, tester, devops, fullstack
- SE4H row (3): ceo, cpo, cto — STANDARD+ tier only
- 3 agents per row for mobile readability

Team keyboard is tier-aware:
- LITE: fullstack only
- STANDARD: + planning, dev, qa
- PROFESSIONAL: + design, executive
- ENTERPRISE: + ops

---

## Consequences

### Positive

- Full OTT parity with Sprint 74 teams + Sprint 75 compliance fix
- Webhook mode reduces latency (instant vs 3s polling) and resource usage
- Security-first: PATCH requires 2-step confirm, webhooks validate tokens/signatures
- Backward compatible: `hasMention()` change is additive (optional param)
- Unified OTT layer: same changes apply to both Telegram and Zalo

### Negative

- Telegram webhook requires reverse proxy (HTTPS) — additional setup for CEO
- Zalo webhook URL must be set manually in OA admin panel
- 10 new commands increase handler complexity
- Rate limiting is basic (per-IP, not per-token) — sufficient for v1

---

## Webhook Setup Guide

### Telegram Webhook Setup

1. **Start EndiorBot gateway** (port 18790)
2. **Set up reverse proxy** (one of):
   - nginx: `proxy_pass http://localhost:18790/webhook/telegram`
   - ngrok: `ngrok http 18790` (for dev)
   - Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:18790`
3. **Enable webhook via OTT**: Send `/webhook on` in Telegram chat
   - EndiorBot calls `setWebhook(https://your-domain/webhook/telegram, secretToken)`
   - Polling stops automatically
4. **Disable webhook**: Send `/webhook off` → polling resumes

### Zalo OA Webhook Setup

1. **Log into Zalo OA admin panel** (https://oa.zalo.me)
2. **Navigate to:** Settings → Webhook Configuration
3. **Set webhook URL:** `https://your-domain/webhook/zalo`
4. **Copy the webhook secret** → set as `ENDIORBOT_ZALO_WEBHOOK_SECRET` env var
5. **Start EndiorBot gateway** — Zalo events are routed to `handleWebhookEvent()`

---

## Alternatives Considered

### A. Separate webhook server (REJECTED)
Create a new HTTP server dedicated to webhooks. Rejected because WebGatewayServer already has `http.createServer()` and adding 2 routes is minimal.

### B. Express.js for webhook routing (REJECTED)
Add Express dependency for POST body parsing. Rejected — Node.js `http` module is sufficient for 2 routes. No need for additional dependency.

### C. Telegram Bot API library (REJECTED)
Use `node-telegram-bot-api` or `telegraf`. Rejected — existing Telegram channel implementation works directly with HTTP API. Adding a library for webhook support is unnecessary.

---

## References

- Sprint 76 Plan: `docs/04-build/sprints/sprint-76-ott-channel-enhancement.md`
- Sprint 74 ADR: [ADR-017](ADR-017-Team-Agent-System.md) (Team Agent System)
- Sprint 75 ADR: [ADR-018](ADR-018-AI-Generated-Compliance-Content.md) (Compliance Fix Engine)
- Telegram Bot API: Webhook documentation
- Zalo OA API: Webhook event format
- WebGatewayServer: `src/gateway/web-server.ts`
