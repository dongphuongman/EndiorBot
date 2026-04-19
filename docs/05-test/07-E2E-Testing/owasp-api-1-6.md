# OWASP API Security Top 10 — EndiorBot Gateway Review

**Sprint:** 137 P2-03
**Date:** 2026-04-19
**Identity constraint:** EndiorBot is **LOCAL-ONLY** (see `AGENTS.md` → "Handoff Boundary"). Findings about localhost exposure are **informational**, not actionable — remote hardening is MTClaw territory.

Legend:

| Status | Meaning |
|--------|---------|
| ✅ Mitigated | A concrete control is present in code |
| 🟡 Partial | Control exists but only covers some paths |
| ℹ️ LOCAL-ONLY | The risk is real *only* off-localhost; mitigation is "don't deploy EndiorBot remotely" |
| 🚫 Out of scope | Not EndiorBot's responsibility per the handoff boundary |

---

## API1 — Broken Object Level Authorization (BOLA)

**Risk:** an authenticated caller accesses or modifies another user's resources.

**EndiorBot reality:** single-user tool. CEO is the only principal — `~/.endiorbot/active-project.json`, `~/.endiorbot/repos.json`, and `~/.endiorbot/gate-confirmations/` live under the CEO's home dir; UNIX file permissions (0o600 on audit logs) are the primary ACL.

| Control | Location | Status |
|---------|----------|--------|
| Exec-policy approvals gated on current preset, not caller identity | `src/security/exec-approvals/` | ✅ Mitigated |
| Audit logs written 0o600 (CEO-only read) | `src/bridge/security/audit.ts` | ✅ Mitigated |
| `/api/config` and `/api/audit` bypass auth on localhost | `src/gateway/web-server.ts:332-341` | ℹ️ LOCAL-ONLY |

**Verdict:** BOLA is not a meaningful threat model in single-user LOCAL-ONLY deployment.

---

## API2 — Broken Authentication

**Risk:** an attacker poses as a legitimate user (credential stuffing, token theft, weak session management).

**EndiorBot auth surface:**

1. **Localhost bypass** for reads (`/api/status`, `/api/health`, `/api/config`, `/api/audit/:type`).
2. **`ENDIORBOT_GATEWAY_TOKEN`** — opaque bearer on `Authorization: Bearer` header. Required for:
   - All mutations (`POST /api/config/*`).
   - All reads when gateway is bound to a non-localhost interface.
3. **Webhook HMAC** — `ENDIORBOT_WEBHOOK_SECRET` signs `/api/webhooks/:triggerId` bodies; signature verified before dispatch.

| Control | Location | Status |
|---------|----------|--------|
| Token comparison uses `===` constant string (no bcrypt; opaque tokens) | `src/gateway/web-server.ts:336, 399, 431` | 🟡 Partial — timing-safe compare would be an upgrade |
| Webhook signature verification (HMAC-SHA256) | `src/gateway/webhooks/` | ✅ Mitigated |
| No session cookies, no JWT, no refresh tokens — stateless bearer only | — | ✅ Mitigated (simpler attack surface) |

**Finding:** token comparison isn't constant-time. In a single-user local deployment, timing attacks aren't a realistic threat. Informational only; upgrade to `crypto.timingSafeEqual` if remote exposure ever happens (which it shouldn't).

---

## API3 — Broken Object Property Level Authorization (Mass Assignment / Excessive Data Exposure)

**Risk:** API hands back or accepts more fields than the client is entitled to.

| Control | Location | Status |
|---------|----------|--------|
| Output scrubbing (API keys, secrets) on bridge / router output | `src/security/output-scrubber.ts`, `src/bridge/security/redactor.ts` | ✅ Mitigated |
| Mutation endpoints validate body shape explicitly (e.g. `{ preset }` only) | `src/gateway/web-server.ts:408-416, 440-446` | ✅ Mitigated |
| `/api/config` response hand-picks fields (execPolicy/activeMemory/…), not `...config` spread | `src/gateway/web-server.ts:345-351` | ✅ Mitigated |

---

## API4 — Unrestricted Resource Consumption

**Risk:** callers exhaust server CPU/memory/storage (oversized payloads, infinite loops, concurrent runs).

| Control | Location | Status |
|---------|----------|--------|
| Webhook body size capped via `ENDIORBOT_WEBHOOK_MAX_BODY_SIZE` (default 1 MB) | `src/gateway/web-server.ts:283-293` | ✅ Mitigated |
| Per-model API call timeout (`ENDIORBOT_MODEL_TIMEOUT_MS`, default 30s) | `src/config/timeouts.ts` | ✅ Mitigated |
| Total chat handler timeout (`ENDIORBOT_CHAT_TIMEOUT_MS`, default 60s) | `src/config/timeouts.ts` | ✅ Mitigated |
| Claude Code per-agent timeout (Sprint 137 B6: executor 60s / advisory 180s / adr-writer 600s) | `src/agents/router/agent-constants.ts` | ✅ Mitigated |
| Audit log rotation at 10 MB, 0o600 | `src/bridge/security/audit.ts` | ✅ Mitigated |
| BusDedup eviction of stale in-flight entries | `src/bus/dedup.ts` | ✅ Mitigated |

**No rate limiter on REST endpoints.** Informational in single-user deployment; would be a real concern if exposed remotely.

---

## API5 — Broken Function Level Authorization

**Risk:** admin-only endpoints reachable without admin role.

**EndiorBot reality:** flat authorization — either localhost (trusted) or token-bearer (trusted). No role hierarchy.

| Control | Location | Status |
|---------|----------|--------|
| Mutations always require token, even on localhost | `src/gateway/web-server.ts:397-403, 429-435` | ✅ Mitigated |
| Reads allow localhost bypass but require token off-localhost | `src/gateway/web-server.ts:332-341` | ✅ Mitigated |

**Verdict:** the model is "all-or-nothing" but appropriate for a single-user power tool.

---

## API6 — Unrestricted Access to Sensitive Business Flows

**Risk:** an attacker automates a legit flow (e.g. gate confirmation, patch approval) at scale to abuse the system.

| Control | Location | Status |
|---------|----------|--------|
| Gate confirmation requires explicit `--confirm` flag at CLI, even from CEO | `src/cli/commands/gate.ts:347-358` | ✅ Mitigated |
| PATCH mode requires CEO approval (timed, TTL'd confirmation) | `src/agents/router/patch-flow.ts`, `src/security/exec-approvals/` | ✅ Mitigated |
| Exec-policy presets (open / balanced / strict) gate shell command execution | `src/security/exec-approvals/` | ✅ Mitigated |

Automated business-flow abuse presupposes an attacker already has local CEO credentials — at that point the attack surface is the CEO's MacBook, not EndiorBot.

---

## Triage Summary

| Category | Status | Action |
|----------|--------|--------|
| API1 BOLA | ℹ️ LOCAL-ONLY | No action |
| API2 Broken Auth | 🟡 Partial | Future: `timingSafeEqual` IF gateway ever binds non-localhost (shouldn't per identity lock) |
| API3 Property-level AuthZ | ✅ Mitigated | No action |
| API4 Resource Consumption | ✅ Mitigated | No action; B6 per-agent timeouts just landed |
| API5 Function-level AuthZ | ✅ Mitigated | No action |
| API6 Business-flow abuse | ✅ Mitigated | No action |

**Non-localhost findings:** none. All residual risks are gated by the LOCAL-ONLY identity.

---

## Cross-references

- Identity lock: [`../../08-collaborate/01-SDLC-Compliance/CLAUDE.md`](../../08-collaborate/01-SDLC-Compliance/CLAUDE.md) "Identity (LOCKED, LOCAL-ONLY)"
- Handoff boundary: [`../../08-collaborate/01-SDLC-Compliance/AGENTS.md`](../../08-collaborate/01-SDLC-Compliance/AGENTS.md) "Handoff Boundary"
- API spec: [`../../03-integrate/02-API-Specifications/openapi.json`](../../03-integrate/02-API-Specifications/openapi.json)
- Contract tests: [`tests/e2e/openapi/openapi-contract.test.ts`](../../../tests/e2e/openapi/openapi-contract.test.ts)
