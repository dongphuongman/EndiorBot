# Gateway Architecture Review — Lessons from Sprint 143 CEO Testing

**Authors:** @pm + @architect
**Date:** 2026-04-27
**Trigger:** CEO real-world testing exposed 7 operational issues in a single session
**Status:** REVIEW — input for Sprint 144 planning

---

## Context

CEO tested EndiorBot via Telegram with OGA (Open-Generative-AI) repo across 2 hours.
Every issue hit in production, not synthetic tests. This review captures architectural
gaps the current design cannot prevent by configuration alone.

---

## Issues Discovered (chronological)

| # | Issue | Root cause | Fix applied | Structural? |
|---|-------|-----------|-------------|-------------|
| R01 | `/start` → "Unknown command" | No handler registered | `1b3b838` | No (trivial) |
| R02 | CC timeout → error (no fallback) | TIMEOUT case threw instead of falling back | `1b3b838` | **Yes** |
| R02b | Fallback chain missing OpenAI/Gemini | TIER_FALLBACK_CHAIN only had kimi+ollama | `8dfb618` | **Yes** |
| R02c | Kimi model name rejected | Provider validated "sonnet" against Anthropic model list | `47f2c0e` | **Yes** |
| R03 | Telegram swallows response silently | parse_mode "Markdown" + invalid entities → 400 | `23c681d` | **Yes** |
| R04 | Kimi SSE parsing error | doChat() didn't send `stream:false` → proxy streamed | `fc83c08` | **Yes** |
| R05 | @coder 60s timeout too short | Executor class hardcoded lower than advisory | `fc83c08` | No (config) |
| R06 | Duplicate messages on Telegram | Multiple serve processes + stale polling sessions | Manual kill | **Yes** |
| R07 | Agent called 3x → 3 CC processes | No session lock, each call spawns independently | `225364a` | **Yes** |

**5 of 7 structural issues** — cannot be prevented by testing in isolation.

---

## Architectural Gaps Identified

### Gap 1: No Centralized Provider Abstraction

**Current state:** Each provider path (callClaudeBridge, callKimiProvider, callCloudFallback, callRemoteOllama) is a separate function with its own:
- Model validation logic
- Error handling
- Timeout handling
- Response parsing

**Consequence:** R02c (model name validation), R04 (stream flag), R02b (missing providers in chain) all stem from inconsistent behavior across providers.

**Proposed fix (Sprint 144):** Unified `ProviderDispatcher` interface:
```typescript
interface ProviderDispatcher {
  dispatch(request: AgentRequest): Promise<AIResult>;
  // Handles: model resolution, timeout, fallback, error classification
  // Single code path regardless of provider
}
```

### Gap 2: No Message Delivery Guarantee

**Current state:** `sendMessage()` fires and returns boolean. On failure (R03 Markdown parse), the response is lost — CEO sees nothing.

**Consequence:** Silent failures. CEO thinks bot is broken when it actually produced a response that Telegram rejected.

**Proposed fix (Sprint 144):**
- Retry with degraded formatting (✅ done in R03 fix)
- Add delivery confirmation tracking (message_id returned → verify via getUpdates)
- Dead-letter queue for messages that fail all retries

### Gap 3: No Singleton Process Enforcement

**Current state:** Multiple `endiorbot serve` processes can coexist. Each creates its own Telegram polling connection → 409 conflicts → duplicate messages (R06).

**Consequence:** CEO restarts serve but old process lingers → duplicates until manual kill.

**Proposed fix (Sprint 144):**
- PID lockfile at `~/.endiorbot/serve.pid`
- On startup: check lockfile, kill stale process, acquire lock
- On shutdown: release lockfile
- `--force` flag to override (kill existing + take over)

### Gap 4: No Provider Health Circuit Breaker

**Current state:** Provider health checked only at startup. If a provider becomes unhealthy mid-session (Kimi auth expires, CC rate-limited), the router still tries it → waits full timeout → then falls back.

**Consequence:** 180s wasted on dead provider before fallback kicks in. CEO waits 3 minutes for no reason.

**Proposed fix (Sprint 144):**
- Track consecutive failures per provider
- After N failures → mark provider "circuit-open" for cooldown period
- Skip circuit-open providers immediately → fall to next in chain
- Half-open: try one request after cooldown → if success, close circuit
- Pattern exists in Active Memory (Sprint 133) — reuse `CircuitBreaker` class

### Gap 5: No Request Deduplication at Gateway Level

**Current state:** Message-bus has dedup (Sprint 107, `dedupKey`), but:
- Only for bus path (async)
- Sync fallback path has no dedup
- Same message arriving twice (Telegram retry on slow response) spawns two agent calls

**Consequence:** Duplicate progress messages, double billing, competing CC processes.

**Proposed fix (Sprint 144):**
- Gateway-level dedup: hash(senderId + content + 60s window) → reject duplicate
- Independent of bus path (covers both sync and async)
- Return "already processing" response to duplicate

### Gap 6: Kimi Proxy Lifecycle is Fragile

**Current state:**
- Subprocess spawner tries to start proxy at dynamic port
- Health check has 10s timeout — proxy often fails (auth expired, slow startup)
- Stale proxy processes from previous sessions hold ports
- Auth tokens have short TTL (~15 min) requiring frequent `kimi auth login`

**Consequence:** Kimi is the primary fallback but frequently unavailable. CEO had to manually kill stale processes + re-auth.

**Proposed fix (Sprint 144):**
- External proxy pattern (already working: `ENDIORBOT_KIMI_PROXY_URL`)
- Document as recommended setup: CEO runs `claude-code-proxy serve` separately
- Remove subprocess spawner from EndiorBot (simplify — let user manage proxy lifecycle)
- Or: add auth-refresh automation (detect 401 → prompt CEO via Telegram for re-auth link)

---

## Recommended Sprint 144 Scope

| Priority | Item | Effort | Addresses |
|----------|------|--------|-----------|
| P0 | PID lockfile (singleton serve) | 1h | Gap 3, R06 |
| P0 | Provider health circuit breaker | 3h | Gap 4 |
| P1 | Gateway-level request dedup | 2h | Gap 5, R07 partial |
| P1 | Deprecate Kimi subprocess spawner, document external proxy | 1h | Gap 6 |
| P2 | Unified ProviderDispatcher refactor | 4-6h | Gap 1, future-proofing |
| P2 | Message delivery dead-letter queue | 2h | Gap 2 |

**Total P0+P1:** ~7h (~2 days). P2 can carry to Sprint 145.

---

## What Worked Well

Despite the issues, the fix velocity was high:
- 7 issues discovered → 7 fixes committed → verified in production within 2 hours
- The fallback chain architecture (once fixed) proved resilient
- Per-agent session lock was designed + implemented + deployed in 15 minutes
- Progressive fix deployment (commit → build → restart → CEO tests immediately)
- The `ENDIORBOT_KIMI_PROXY_URL` external pattern proved more reliable than subprocess

---

## CEO Testing Observations for Architecture

1. **CEO uses agents conversationally** — sends 2-3 messages to same agent rapidly. Architecture must handle this gracefully (session lock is minimum; queuing would be better).

2. **CEO switches between repos** (EndiorBot ↔ OGA) mid-session. Workspace resolution per-chat works but CC Bridge sessions don't follow — the tmux session stays bound to the workspace it was created in.

3. **CEO expects <30s response** (identity promise). Current architecture cannot guarantee this when CC Bridge is the primary provider and rate-limited. The fallback must be faster-to-trigger — 180s is too long to wait before trying Kimi.

4. **Reduced timeout proposal:** For OTT (Telegram/Zalo), consider a 60s CC timeout with immediate Kimi fallback, rather than 180s. CLI can keep 180s (user is at terminal, expects longer waits). OTT users expect chat-like responsiveness.

---

*EndiorBot | Sprint 143 Architecture Review | @pm + @architect | 2026-04-27*
