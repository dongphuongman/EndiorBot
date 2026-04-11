---
sprint: 134
status: PLANNED — Awaiting CEO kickoff
start_date: TBD
planned_duration: 4–5 days
framework: "6.3.0"
authority: "Plan v3 COULD items (CEO Decisions Locked 2026-04-11) + Hardcoded Params Audit (CEO 2026-04-11)"
feature_prd: "docs/01-planning/openclaw-backport/PRD.md"
previous_sprint: "Sprint 133 — Active Memory + SSRF + Bug Fixes (2026-04-11)"
backlog_source: "CEO-directed hardcoded params audit + Plan v3 C2 webhooks + Sprint 133 streaming UX"
---

# Sprint 134 — Configuration Externalization + Webhooks Ingress + Streaming UX

## Context

Sprint 133 shipped S1 (Active Memory), S2 (SSRF defense), và 8 bug fixes. Trong quá trình live testing với CEO phát hiện nhiều hardcoded params cần externalize, plus C2 (Webhooks ingress) đã được CEO approve scope từ Plan v3.

**3 nguồn backlog:**
1. **Hardcoded Params Audit** (CEO-directed 2026-04-11) — 20 findings, 4 HIGH / 12 MEDIUM / 4 LOW
2. **C2 Webhooks Ingress** (Plan v3, CEO-locked scope: Zapier + Email forward only, no Slack)
3. **Streaming UX** (Sprint 133 discovery — idle hints implemented but needs refinement)

---

## Backlog — Hardcoded Parameters (from audit)

### HIGH — Must fix (blocks production deployment)

| # | File:Line | Current value | Fix | Env var |
|---|-----------|---------------|-----|---------|
| H1 | `src/tools/auth-manager.ts:108` | `http://localhost:18790/oauth/callback` | Externalize OAuth callback URL | `ENDIORBOT_OAUTH_CALLBACK_URL` |
| H2 | `src/agents/channel-router.ts:83` | `http://localhost:11434` | Ollama local URL fallback | `OLLAMA_URL` (partially done, needs consistency) |
| H3 | `src/agents/channel-router.ts:88` | `qwen3-coder:30b` | Remote Ollama model hardcoded | `OLLAMA_REMOTE_MODEL` |
| H4 | `src/gateway/types.ts:47-48` | Port `18790`, host `127.0.0.1` | Gateway binding for production | `ENDIORBOT_GATEWAY_HOST` (exists, needs adoption) |

### MEDIUM — Should fix (operational flexibility)

| # | File:Line | Current value | Fix | Env var |
|---|-----------|---------------|-----|---------|
| M1 | `src/gateway/chat-handler.ts:126` | `PER_MODEL_TIMEOUT_MS = 30000` | Per-model timeout | `ENDIORBOT_MODEL_TIMEOUT_MS` |
| M2 | `src/gateway/chat-handler.ts:129` | `TOTAL_TIMEOUT_MS = 60000` | Total chat timeout | `ENDIORBOT_CHAT_TIMEOUT_MS` |
| M3 | `src/mtclaw/mcp-client.ts:51` | `AGENT_CHAT_TIMEOUT_MS = 130_000` | MCP agent timeout | `MTCLAW_TIMEOUT_MS` |
| M4 | `src/mtclaw/config.ts:20` | `DEFAULT_TIMEOUT_MS = 30_000` | MCP tool timeout | `MTCLAW_DEFAULT_TIMEOUT_MS` |
| M5 | `src/channels/telegram/telegram-config.ts:68` | `pollingInterval: 3000` | Telegram polling | `ENDIORBOT_TELEGRAM_POLLING_MS` |
| M6 | `src/channels/zalo/zalo-config.ts:75` | `pollingInterval: 5000` | Zalo polling | `ENDIORBOT_ZALO_POLLING_MS` |
| M7 | `src/channels/ott/webhook-handler.ts:107` | `MAX_BODY_SIZE = 1MB` | Webhook body limit | `ENDIORBOT_WEBHOOK_MAX_BODY_SIZE` |
| M8 | `src/channels/ott/webhook-handler.ts:110` | `RATE_LIMIT_CLEANUP = 60_000` | Rate limit cleanup | `ENDIORBOT_RATE_LIMIT_CLEANUP_MS` |
| M9 | `src/providers/openai/index.ts:139` | `TIMEOUT_MS = 30000` | OpenAI timeout | `ENDIORBOT_OPENAI_TIMEOUT_MS` |
| M10 | `src/rl/session-tracker.ts:24` | `IDLE_TIMEOUT = 30min` | RL session idle | `ENDIORBOT_SESSION_IDLE_TIMEOUT_MS` |
| M11 | `src/rl/session-tracker.ts:27` | `FEEDBACK_WINDOW = 2h` | RL feedback window | `ENDIORBOT_FEEDBACK_WINDOW_MS` |
| M12 | `src/security/exec-approvals/audit.ts` | `MAX_LOG_SIZE = 10MB` | Audit log rotation | `ENDIORBOT_AUDIT_MAX_LOG_SIZE` |

### LOW — Nice-to-have (reasonable defaults, already has fallback)

| # | File | Current value | Note |
|---|------|---------------|------|
| L1 | `src/agents/channel-router.ts:84` | `qwen3.5:9b` | Has env fallback, OK |
| L2 | `src/budget/cost-estimator.ts:81` | `claude-sonnet-4` | Reasonable default |
| L3 | `src/gateway/types.ts:50` | `pingInterval: 30000` | Standard WebSocket |
| L4 | `src/gateway/types.ts:51` | `pingTimeout: 10000` | Standard WebSocket |

---

## Locked Scope — 4–5 Days

| # | Item | Effort | Priority |
|---|------|--------|----------|
| 1 | **Task 1: Config externalization (HIGH items)** — H1-H4 | 0.5d | P0 |
| 2 | **Task 2: Timeout centralization (MEDIUM timeouts)** — M1-M4, M9 | 1d | P1 |
| 3 | **Task 3: Channel polling config (MEDIUM)** — M5-M8 | 0.5d | P1 |
| 4 | **Task 4: C2 Webhooks Ingress** (Zapier + Email forward) | 2d | P1 |
| 5 | **Task 5: Streaming UX refinement** + Sprint 133 bug fix commit | 0.5d | P2 |

**Total:** 4.5 days. Fits 4–5 day sprint.

---

## Task Breakdown

### Task 1 — Config externalization (HIGH, 0.5d, P0)

Fix 4 HIGH hardcoded params. Pattern: read from `process.env[KEY]` with fallback to current hardcoded value (backward compatible).

**H1. OAuth callback URL**
- File: `src/tools/auth-manager.ts:108`
- Fix: `process.env["ENDIORBOT_OAUTH_CALLBACK_URL"] ?? "http://localhost:18790/oauth/callback"`
- Add to `.env.example`

**H2. Ollama local URL consistency**
- File: `src/agents/channel-router.ts:83`
- Fix: consolidate all Ollama URL reads to use same env var priority: `OLLAMA_URL ?? OLLAMA_HOST ?? OLLAMA_BASE_URL ?? "http://localhost:11434"`
- Verify consistency with `src/providers/ollama/index.ts` and `src/security/http-validator.ts`

**H3. Remote Ollama model**
- File: `src/agents/channel-router.ts:88`
- Fix: `process.env["OLLAMA_REMOTE_MODEL"] ?? "qwen3-coder:30b"`
- Already in `.env.local` — just needs code to read it

**H4. Gateway host binding**
- File: `src/gateway/types.ts:47-48`
- Fix: `process.env["ENDIORBOT_GATEWAY_HOST"] ?? "127.0.0.1"`, port already configurable
- Production: set `ENDIORBOT_GATEWAY_HOST=0.0.0.0` to allow remote connections

**Tests:** Verify each env var is read, fallback works, `.env.example` updated.

### Task 2 — Timeout centralization (1d, P1)

Create `src/config/timeouts.ts` — single source of truth for all timeout values:

```typescript
export const TIMEOUTS = {
  /** Per-model API call timeout */
  modelCall: envInt("ENDIORBOT_MODEL_TIMEOUT_MS", 30_000),
  /** Total chat handler timeout */
  chatTotal: envInt("ENDIORBOT_CHAT_TIMEOUT_MS", 60_000),
  /** MCP agent chat timeout */
  mtclawAgent: envInt("MTCLAW_TIMEOUT_MS", 130_000),
  /** MCP tool call timeout */
  mtclawTool: envInt("MTCLAW_DEFAULT_TIMEOUT_MS", 30_000),
  /** OpenAI provider timeout */
  openai: envInt("ENDIORBOT_OPENAI_TIMEOUT_MS", 30_000),
  /** Claude Code CLI timeout */
  claudeCode: envInt("ENDIORBOT_CLAUDE_TIMEOUT_MS", 300_000),
  /** RL session idle timeout */
  sessionIdle: envInt("ENDIORBOT_SESSION_IDLE_TIMEOUT_MS", 30 * 60_000),
  /** RL feedback window */
  feedbackWindow: envInt("ENDIORBOT_FEEDBACK_WINDOW_MS", 2 * 60 * 60_000),
} as const;
```

Then replace all hardcoded timeouts across 8+ files with `TIMEOUTS.xxx`. One import, one constant, one env var override.

**Tests:** Verify env overrides work, verify current defaults unchanged.

### Task 3 — Channel polling config (0.5d, P1)

Externalize channel-specific params:

| Param | Env var | Default |
|-------|---------|---------|
| Telegram polling | `ENDIORBOT_TELEGRAM_POLLING_MS` | `3000` |
| Zalo polling | `ENDIORBOT_ZALO_POLLING_MS` | `5000` |
| Webhook max body | `ENDIORBOT_WEBHOOK_MAX_BODY_SIZE` | `1048576` (1MB) |
| Rate limit cleanup | `ENDIORBOT_RATE_LIMIT_CLEANUP_MS` | `60000` |
| Audit log max size | `ENDIORBOT_AUDIT_MAX_LOG_SIZE` | `10485760` (10MB) |

Pattern: read in config file, fallback to current default.

### Task 4 — C2 Webhooks Ingress (2d, P1)

**Scope (CEO-locked 2026-04-11):** Zapier / generic HTTPS webhook + Email forward. **No Slack** (identity-lock boundary).

**What:** Port the openclaw webhooks plugin pattern. External systems POST to EndiorBot gateway → trigger a command/workflow → CEO receives result on preferred channel.

**Subtasks:**

| # | Subtask | Scope |
|---|---|---|
| 4a | **Webhook endpoint** — `POST /api/webhooks/:triggerId` on existing gateway. Auth via shared secret (`ENDIORBOT_WEBHOOK_SECRET` env var). Parse JSON body → extract action + payload. | ~100 LoC |
| 4b | **Trigger registry** — `src/gateway/webhooks/trigger-registry.ts`. Register named triggers (e.g. `summarize-email`, `run-plan`) with handler functions. | ~80 LoC |
| 4c | **Email forward handler** — parse forwarded email (subject → task description, body → context). Dispatch to `@pm plan` or `@assistant summarize`. Result sent to CEO's Telegram. | ~120 LoC |
| 4d | **Zapier/generic handler** — accept arbitrary JSON payload, map to EndiorBot command. Config via `~/.endiorbot/webhooks.json` (trigger name → command mapping). | ~80 LoC |
| 4e | **Audit + security** — log webhook events to `~/.endiorbot/audit-logs/webhooks.log`. Validate webhook secret. Rate limit per trigger (10 req/min default). | ~60 LoC |
| 4f | **Tests** — webhook auth (valid/invalid secret), trigger dispatch, email parsing, rate limiting, audit logging. | ~200 LoC |

**Total C2 estimate:** ~640 LoC.

**Acceptance criteria (from PRD §3 C2):**
```
Given a Zapier/generic HTTPS webhook POST to the EndiorBot gateway
When the payload matches a registered trigger
Then a command/workflow is dispatched and CEO receives result on preferred channel

Given an email is forwarded to EndiorBot (via webhook from email service)
When the email is parsed
Then the same trigger flow fires
```

**Read first:** `openclaw/extensions/webhooks/` for pattern reference.

### Task 5 — Streaming UX refinement + commit (0.5d, P2)

- Polish the idle hint messages (currently basic `⏳` dot)
- Add elapsed time display for chat mode: `⏳ (15s...)` → `⏳ (30s...)` → `⏳ (45s...)`
- Commit all Sprint 133 remaining changes (streaming, design doc, Ollama SSRF env-based fix)
- Update `.env.example` with all new env vars from Task 1-3

---

## Success Criteria (Sprint-level)

- [ ] H1-H4 (HIGH hardcoded params) all externalized with env var + fallback
- [ ] `src/config/timeouts.ts` created, 8+ files migrated to use it
- [ ] Channel polling intervals configurable via env
- [ ] C2 webhooks endpoint operational with auth + rate limiting
- [ ] Email forward → EndiorBot → Telegram result flow works end-to-end
- [ ] `.env.example` updated with all new env vars
- [ ] All tests green (7909+ baseline)
- [ ] No new TypeScript errors under `exactOptionalPropertyTypes`

---

## Out of Sprint 134 Scope

- **LOW severity hardcoded params** (L1-L4) — reasonable defaults, defer
- **M10-M11 RL timeouts** — defer to Sprint 135 (lower priority, RL module less actively used)
- **Slack inbound webhook** — rejected by CEO (identity-lock boundary)
- **Per-agent preset override** — deferred to Sprint 135+ (ADR-046 ambiguity #1)
- **Fine-grained tool-use dispatcher** — future sprint (M1 coarse hook + shell metachar protection sufficient)
- **OTT→autonomous session wiring** — future sprint (ADR-046 Amendment 1)

---

## Dependencies

- **Task 4 (C2)** depends on Task 1 (H4 gateway host binding) — webhook endpoint lives on the gateway
- **Task 5** depends on Task 2 (timeout centralization) — Claude Code timeout should come from `TIMEOUTS.claudeCode`
- Task 1, 2, 3 are independent — can run in parallel

---

## References

- [Hardcoded Params Audit](../../02-design/14-Technical-Specs/chat-bridge-ux-fixes-design.md) — AD-5 (Ollama env-based allowlist)
- [Plan v3 C2 Webhooks](../../01-planning/openclaw-backport/PRD.md) §3 C2
- [Plan v3 Scope](../../01-planning/openclaw-backport/scope.md) — C2 locked scope
- [openclaw webhooks reference](/Users/dttai/Documents/Python/01.NQH/openclaw/extensions/webhooks/)
- [Sprint 133](./sprint-133-active-memory-ssrf.md)
- [ADR-046](../../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md)

---

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.0 | Sprint 134 Plan*
*Generated by @pm 2026-04-11*
