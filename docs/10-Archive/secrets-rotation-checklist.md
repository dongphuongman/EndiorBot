# Secrets Rotation Checklist — Sprint 138 P3-01

**Urgency:** 🚨 **CRITICAL** (upgraded from HIGH after Sprint 138 git-history investigation). CEO action required on vendor consoles AND a decision on git-history rewrite.

**Exposure scope (updated 2026-04-19 during Sprint 138 authoring):**

Two separate exposure surfaces were found:

1. **Session context leak (Sprint 136, known):** 12 env-var values rendered in session transcripts during `grep` / `ps -wwE` diagnostic commands. Exposure audience: anyone who read those transcripts.
2. **🚨 GIT HISTORY LEAK (new finding, Sprint 138):** Commit `92cd19a` ("security(pre-oss): redact NQH private content") **deleted credential-bearing files from HEAD but did NOT rewrite history**. Commits `c81a54a`, `20dfaa2`, `0629bab`, and the deleted `SPRINT-38-*` files still contain real-value API keys in their diffs. The repo is on public GitHub (`Minh-Tam-Solution/EndiorBot`). Any clone can `git log -p` those commits. `git log -S` finds:
   - `sk-ant-` prefix: 6 matching commits (likely Anthropic keys)
   - `AIzaSy` prefix: 3 matching commits (likely Google/Gemini keys)
   - `sk-proj-` prefix: 1 matching commit (likely OpenAI project key)
   - Telegram bot tokens and Ollama tokens documented as present in the redaction commit's message.

**Assumption to act on:** treat every key from the sprint-38 era onward as **compromised**. The Sprint 136 session leak is narrower but overlapping. The union is the full 12-key inventory below.

**Status:** CEO acknowledged during Sprint 137 ("đã revoke rồi" for at least some). This document drives a CEO-driven tick-off to confirm **every** key's state AND makes an explicit decision on history rewrite.

## Decision required — git history rewrite

Because the keys are in history, rotating the live values is **necessary but not sufficient** if any of the exposed key types aren't fully revocable (e.g. webhook-signed requests replayed before rotation). Choose one:

- **Option A (recommended):** Rotate every key AND rewrite history using `git filter-repo --invert-paths --path docs/04-build/sprints/SPRINT-38-*.md` (plus any other credential-bearing paths), then force-push. **Cost:** breaks existing clones, invalidates PR refs, requires every consumer to re-clone.
- **Option B (minimum viable):** Rotate every key, accept the history as-is, and treat the old keys as permanently burned (they're not reusable anyway once revoked). **Cost:** the fact of a leak stays in the public record; no cryptographic damage since the keys are dead.
- **Option C:** Contact GitHub support to request secret invalidation + DMCA-adjacent takedown of specific commits. Has worked in documented cases but requires vendor cooperation.

**Recommendation:** **Option B now + Option A later.** Option B makes the attack surface zero immediately (dead keys). Option A cleans the narrative when there's a good time for the forced rewrite.

> ⚠️ **RULE:** Do not paste secret *values* into this document, into chat, or into any tool output. All verification commands below are redaction-safe (test presence or call the vendor console — never echo).

## Inventory (12 keys)

| # | Env var | Vendor | Provides |
|---|---------|--------|----------|
| 1 | `ANTHROPIC_API_KEY` | Anthropic | Claude API fallback (primary path is Claude Code OAuth) |
| 2 | `OPENAI_API_KEY` | OpenAI | OpenAI provider + `/consult` multi-model |
| 3 | `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Google AI Studio | Gemini provider (rate-limit fallback after Sprint 136 A11) |
| 4 | `GITHUB_TOKEN` | GitHub | PAT / fine-grained token for gh CLI |
| 5 | `MTCLAW_API_KEY` | MTClaw (internal) | Cross-system `@mtclaw.*` agent bridge |
| 6 | `AI_PLATFORM_API_KEY` | AI-Platform (internal) | RAG bridge + CRG (code-review-graph) |
| 7 | `ENDIORBOT_TELEGRAM_BOT_TOKEN` | Telegram BotFather | Telegram channel adapter |
| 8 | `ENDIORBOT_ZALO_BOT_TOKEN` | Zalo for Developers | Zalo channel adapter |
| 9 | `ENDIORBOT_GATEWAY_TOKEN` | EndiorBot-generated | Web API mutation auth |
| 10 | `OLLAMA_REMOTE_API_KEY` | Self-hosted (CEO controls) | Remote Ollama fallback |
| 11 | `ENDIORBOT_WEBHOOK_SECRET` | EndiorBot-generated | Webhook ingress HMAC verification |
| 12 | *(12th key TBD — one of the MTClaw vendor tokens cited in Sprint 136 close; confirm during rotation)* | TBD | TBD |

## Per-key rotation procedure

### 1. `ANTHROPIC_API_KEY` — Anthropic

- **Console:** https://console.anthropic.com/settings/keys
- **Revoke:** Find the exposed key in "API keys" → click the key → **Delete** or **Disable**.
- **Create replacement:** Click **Create Key** → name it (e.g. `endiorbot-2026-04-19`) → copy once → paste into `.env`.
- **Verify old key is dead (no value echo):** `curl -sS -o /dev/null -w "%{http_code}\n" https://api.anthropic.com/v1/messages -H "x-api-key: $OLD_KEY_VAR" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-haiku-4-5","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}'` → expect `401`.
  - Substitute `$OLD_KEY_VAR` by hand (don't reference the leaked value).

### 2. `OPENAI_API_KEY` — OpenAI

- **Console:** https://platform.openai.com/api-keys
- **Revoke:** Click the exposed key → **Revoke**.
- **Create replacement:** **Create new secret key** → scope to `/v1/chat/completions` if using restricted scopes → store.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" https://api.openai.com/v1/models -H "Authorization: Bearer $OLD_KEY_VAR"` → expect `401`.

### 3. `GOOGLE_API_KEY` / `GEMINI_API_KEY` — Google AI Studio

- **Console:** https://aistudio.google.com/apikey
- **Revoke:** Delete the exposed key.
- **Create replacement:** **Create API key** → restrict to Generative Language API.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" "https://generativelanguage.googleapis.com/v1beta/models?key=$OLD_KEY_VAR"` → expect `403` or `400`.

### 4. `GITHUB_TOKEN` — GitHub PAT

- **Console:** https://github.com/settings/tokens (classic) or https://github.com/settings/personal-access-tokens (fine-grained).
- **Revoke:** **Delete** the exposed token.
- **Create replacement:** Scope to minimum needed (repo read, maybe `workflow`). Set expiration ≤ 90 days.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_KEY_VAR" https://api.github.com/user` → expect `401`.

### 5. `MTCLAW_API_KEY` — MTClaw internal

- **Console:** MTClaw admin panel (ask MTClaw @pm).
- **Revoke:** Rotate via MTClaw's own admin flow.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_KEY_VAR" <mtclaw-health-endpoint>` → expect `401`.

### 6. `AI_PLATFORM_API_KEY` — AI-Platform internal

- **Console:** AI-Platform admin panel.
- **Revoke:** Rotate via AI-Platform's admin flow.
- **Verify:** hit `/health` with old token — expect `401`.

### 7. `ENDIORBOT_TELEGRAM_BOT_TOKEN` — Telegram BotFather

- **Console:** Message `@BotFather` on Telegram → `/mybots` → pick bot → **API Token** → **Revoke current token**.
- **Create replacement:** BotFather automatically issues a new token.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" https://api.telegram.org/bot$OLD_KEY_VAR/getMe` → expect `401` or `404`.

### 8. `ENDIORBOT_ZALO_BOT_TOKEN` — Zalo for Developers

- **Console:** https://developers.zalo.me — pick the bot app → **Rotate Access Token**.
- **Verify:** hit Zalo Bot API `/me` with old token — expect non-success.

### 9. `ENDIORBOT_GATEWAY_TOKEN` — self-generated

- **Rotation:** just generate a new opaque string: `openssl rand -hex 32 | pbcopy` (don't print to shell history: `unset HISTFILE` first in the shell, or paste into password manager).
- **Update:** set the new value in `.env`; restart `endiorbot serve`.
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_KEY_VAR" http://127.0.0.1:18790/api/config/exec-policy/preset -X POST -H "Content-Type: application/json" -d '{"preset":"balanced"}'` → expect `401`.

### 10. `OLLAMA_REMOTE_API_KEY` — self-hosted

- **Rotation:** rotate on the remote Ollama host (CEO controls that box).
- **Verify:** `curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_KEY_VAR" <ollama-remote-url>/api/tags` → expect `401`.

### 11. `ENDIORBOT_WEBHOOK_SECRET` — self-generated

- **Rotation:** `openssl rand -hex 32` into `.env`; if any external services POST to `/api/webhooks/:triggerId` they need the new secret too.
- **Verify:** POST a test webhook with the old secret's HMAC — expect `401`.

### 12. *(TBD 12th key)*

- Confirm during rotation. If none materializes, update the inventory to 11.

## CEO tick-off

Mark each key as **done** after revoking + rotating. If a key is not used (e.g. no remote Ollama deployed), mark **N/A**.

```
[ ] 1. ANTHROPIC_API_KEY          — revoked + rotated | N/A
[ ] 2. OPENAI_API_KEY             — revoked + rotated | N/A
[ ] 3. GOOGLE_API_KEY             — revoked + rotated | N/A
[ ] 4. GITHUB_TOKEN               — revoked + rotated | N/A
[ ] 5. MTCLAW_API_KEY             — revoked + rotated | N/A
[ ] 6. AI_PLATFORM_API_KEY        — revoked + rotated | N/A
[ ] 7. ENDIORBOT_TELEGRAM_BOT_TOKEN — revoked + rotated
[ ] 8. ENDIORBOT_ZALO_BOT_TOKEN   — revoked + rotated | N/A
[ ] 9. ENDIORBOT_GATEWAY_TOKEN    — rotated
[ ] 10. OLLAMA_REMOTE_API_KEY     — rotated | N/A
[ ] 11. ENDIORBOT_WEBHOOK_SECRET  — rotated | N/A
[ ] 12. (TBD) ______________
```

## Post-rotation hygiene

1. **Run `endiorbot serve`** — confirm it boots clean. Secrets scrubber (`src/bridge/security/redactor.ts`) redacts outputs automatically, but live-smoke the OTT adapters:
   - Telegram: send `ping` — expect reply within a few seconds.
   - Gateway: `curl http://127.0.0.1:18790/api/health` → 200.
2. **Check `~/.endiorbot/audit-logs/` for any entry that pre-dated the rotation and still echoes a key.** If so, truncate the log. (The scrubber should prevent this, but verify.)
3. **Run `git log -S "sk-ant-"` and `git log -S "AIzaSy"` etc.** on common key prefixes — expected result: zero hits. (Sprint 136 leaks were in tool outputs, not commits; this is confirmation.)
4. **Shell history hygiene:** `history | grep -E "OPENAI|ANTHROPIC|BOT_TOKEN"` — if any key values appear there (e.g. from a past `export FOO=...`), use `history -d <n>` on each, then `history -w`.

## How this document was produced

- Investigation only. **No secret values were read, printed, or committed during authoring.** All verification commands use `$OLD_KEY_VAR` placeholders so CEO can substitute locally without leaving values in shell history.
- Inventory from Sprint 136 close (`docs/04-build/sprints/sprint-136-close.md`) + Sprint 137 partial close (`sprint-137-partial-close.md`).
- Per-vendor rotation procedures are the vendors' documented flows — no EndiorBot-specific magic.

---

*EndiorBot | Solo Developer Power Tool (LOCKED, LOCAL-ONLY) | Sprint 138 P3-01 | Authored 2026-04-19*
