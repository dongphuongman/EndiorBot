# ADR-020: OTT Channel Completion — Zalo Command Parity

**Status:** Accepted
**Date:** 2026-03-04
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** 77

---

## Context

Sprint 76 (ADR-019) delivered 14 OTT slash commands and webhook support to **Telegram only**. Manual testing of the Zalo Bot channel revealed:

1. **Zalo has zero command support** — `createZaloAgentHandler()` only checks `hasMention()`; slash commands are silently ignored
2. **WhatsApp has zero implementation** — only a type placeholder (`OTTChannelSource = 'whatsapp'`)
3. **Ollama Remote fallback** — CEO configured the full fallback chain independently

CTO Review (6/10 APPROVED WITH CONDITIONS) identified:
- **P0-1:** Baileys WhatsApp library violates WhatsApp ToS (reverse-engineered protocol, risk of permanent phone ban) — Track B BLOCKED
- **C1:** Hidden work in Zalo command dispatch layer (not just reusing handlers)
- **C2:** Two unsanitized echo vulnerabilities in `handleFixCommand` and `handleConsultCommand`
- **W1:** Zalo READ-only enforcement is comment-based, needs runtime assertion

---

## Decisions

### 1. Zalo Command Dispatch Layer

Add command detection **before** agent mention check in `createZaloAgentHandler()`:

```typescript
// In createZaloAgentHandler() return handler:
if (message.sanitized.startsWith("/")) {
  const handled = await handleZaloCommand(message.sanitized, sendFn);
  if (handled) return;
}
// ... existing hasMention() flow
```

**Rationale:** Commands take priority over mentions. Unknown commands fall through to the mention handler (no error response).

**New file:** `src/channels/zalo/zalo-commands.ts` containing:
- `handleZaloCommand(text, sendFn)` — parse command, route to shared handler, strip Markdown
- `stripMarkdown(text)` — remove Telegram Markdown (`*`, `_`, `` ` ``, `[]()`) for Zalo plain text
- `generateZaloHelpMessage()` — plain text command list for Zalo

### 2. Reuse Shared Command Handlers

10 command handlers from `src/channels/telegram/telegram-commands.ts` return `CommandResult { success, response }` and are **channel-agnostic** in logic, but **Telegram-specific** in formatting (Markdown with `*bold*`, `` `code` ``).

**Approach:** Import handlers directly, then apply `stripMarkdown()` to the response before sending via Zalo.

| Shared Handler | Zalo Adaptation |
|---------------|----------------|
| `handleAgentsCommand()` | `stripMarkdown(result.response)` |
| `handleTeamsCommand()` | `stripMarkdown(result.response)` |
| `handleGateCommand(args)` | `stripMarkdown(result.response)` |
| `handleComplianceCommand(args)` | `stripMarkdown(result.response)` |
| `handleFixCommand(args)` | `stripMarkdown(result.response)` |
| `handleConsultCommand(args)` | `stripMarkdown(result.response)` |
| `handleConfigCommand()` | `stripMarkdown(result.response)` |
| `handleInitCommand()` | `stripMarkdown(result.response)` |

**Not shared:** `/approve`, `/reject`, `/status` — these are currently private methods on `TelegramChannel` class (tied to `this.approvalQueue`). Sprint 77 creates lightweight Zalo equivalents that return info messages directing users to Telegram or CLI for approval actions.

### 3. Commands Excluded from Zalo

| Command | Reason for Exclusion |
|---------|---------------------|
| `/mode` | Zalo is intentionally READ-only (CTO P1-5). Zalo OA API lacks inline keyboards for 2-step PATCH confirmation. |
| `/webhook` | Telegram-specific feature (Telegram Bot API `setWebhook`/`deleteWebhook`). Zalo OA webhooks are configured in the admin panel, not via API. |

### 4. stripMarkdown() Specification

```typescript
function stripMarkdown(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, "$1")           // *bold* → bold
    .replace(/_([^_]+)_/g, "$1")             // _italic_ → italic
    .replace(/`([^`]+)`/g, "$1")             // `code` → code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link](url) → link
    .replace(/\\([*_`\[\]()~>#+\-=|{}.!])/g, "$1"); // unescape
}
```

**Zalo text limit:** 2000 characters. Long responses are automatically chunked by `ZaloBotChannel.sendTextMessage()` (existing, Sprint 51).

### 5. Telegram Command Sanitization Fix (C2)

Two unsanitized echo vulnerabilities in `telegram-commands.ts`:

| Location | Current | Fix |
|----------|---------|-----|
| `handleFixCommand` line 169 | `` `Stage: \`${stage}\`` `` | `` `Stage: \`${sanitizeForEcho(stage)}\`` `` |
| `handleFixCommand` line 174 | `--stage ${stage}` | `--stage ${sanitizeForEcho(stage)}` |
| `handleConsultCommand` line 198 | `Query: ${query.slice(0, 200)}` | `Query: ${sanitizeForEcho(query.slice(0, 200))}` |

`sanitizeForEcho()` (already exists at line 25) strips Markdown special chars and limits to 50 chars.

### 6. Zalo READ-Only Runtime Assertion (W1)

Add explicit guard in `invokeZaloAgent()`:

```typescript
const invokeRequest: InvokeRequest = {
  mode: "READ",
  // ...
};

// Runtime assertion — defense-in-depth
if (invokeRequest.mode !== "READ") {
  throw new Error("Zalo channel is READ-only (CTO P1-5)");
}
```

### 7. WhatsApp Decision Record

**Decision:** DEFERRED to future sprint.

**Alternatives Evaluated:**

| Option | Risk | Decision |
|--------|------|----------|
| A. Baileys (WhatsApp Web protocol) | HIGH — violates WhatsApp ToS, risk of permanent phone ban, Meta C&D history | REJECTED by CTO (P0-1) |
| B. WhatsApp Cloud API (Meta official) | LOW — official, free tier, webhook-based | CANDIDATE — pending CEO setup of Meta Business account |
| C. Defer entirely | NONE | SELECTED for Sprint 77 |

**Future Sprint Requirements (when revisited):**
- CEO must create Meta Developer App + WhatsApp Business account
- Use official Cloud API (`graph.facebook.com/v21.0/{phone_number_id}/messages`)
- Webhook verification via `hub.verify_token` challenge
- HMAC-SHA256 signature validation for incoming webhooks

### 8. Ollama Remote Fallback — Documentation Only

CEO independently configured the full AI model fallback chain:

```
Router:   🏠 Local Ollama (qwen3.5:9b)     — ~2s, think:false
Primary:  ⚡ Claude Code Bridge (Max 200)    — High quality
Fallback: 🔄 Gemini/OpenAI (4 providers)    — Cloud APIs
Last:     🏢 AI-Platform (qwen3-coder:30b)  — NQH remote
```

**Env vars added to `.env.local`:**
```
OLLAMA_REMOTE_URL=https://api.nqh-internal.example
OLLAMA_REMOTE_API_KEY=nqh-ollama-dev-...
OLLAMA_REMOTE_MODEL=qwen3-coder:30b
```

No code changes needed — `OllamaProvider` already supports `baseUrl` + `apiKey` config, and `ResourceRouter` (Sprint 39) has fallback chain support.

---

## Consequences

### Positive
- Zalo channel reaches 12/14 command parity with Telegram
- CEO can use `/help`, `/agents`, `/gate`, etc. directly from Zalo
- Agent mentions continue to work unchanged
- Telegram sanitization vulnerabilities fixed before porting
- READ-only enforcement hardened with runtime assertion

### Negative
- WhatsApp support deferred (CEO lacks immediate multi-channel coverage)
- Zalo still cannot do PATCH operations (API limitation, not a code issue)
- 2 commands (`/mode`, `/webhook`) remain Telegram-exclusive

---

## Alternatives Considered

### A. OTT Command Abstraction Layer (REJECTED)

Create a shared `OTTCommandHandler` base class that both Telegram and Zalo inherit from.

**Rejected because:** Over-engineering for 2 channels. The current approach (import shared handlers + stripMarkdown) is simpler, fewer files, and the handlers are already stateless functions.

### B. Zalo Markdown Support (REJECTED)

Zalo OA API supports some formatting via HTML-like tags. Could format responses with Zalo-native styling.

**Rejected because:** Zalo Bot Platform (zapps.me) is plain-text only — no formatting support. ZaloChannel (OA) has limited formatting but we use ZaloBotChannel (personal bot).

---

## References

- [ADR-019: OTT Channel Enhancement](ADR-019-OTT-Channel-Enhancement.md) — Sprint 76 predecessor
- [ADR-017: Team Agent System](ADR-017-Team-Agent-System.md) — 13 agents + 7 teams
- [Sprint 77 Plan](../../04-build/sprints/sprint-77-ott-completion.md)
- CTO Verdict: 6/10 APPROVED WITH CONDITIONS (2026-03-04)
