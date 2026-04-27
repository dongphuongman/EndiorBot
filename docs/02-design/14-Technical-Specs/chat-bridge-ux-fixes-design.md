# Chat & Bridge UX Fixes — Technical Design

**Sprint:** 133 (hotfix batch)
**Owner:** @devops (diagnosis) → @coder (fixes)
**Status:** IMPLEMENTED — committed `d0fc613`, pending follow-up commit for streaming + idle hints
**Identity check:** Solo Developer Power Tool (LOCKED)
**Framework:** SDLC 6.3.0

---

## Problem Statement

EndiorBot chat mode (`endiorbot chat`) và agent bridge (`endiorbot agent @coder`) có nhiều vấn đề UX khiến CEO không sử dụng được:

1. **Chat mode hoàn toàn không hoạt động** — "No AI provider available" dù có API keys
2. **Agent bridge dùng sai auth path** — dùng API key (hết credit) thay vì OAuth ($200 subscription)
3. **Không có feedback** — user chờ 300s không biết chuyện gì đang xảy ra
4. **Project context sai** — hiện DeepTutor dù đang ở EndiorBot repo
5. **SSRF false positive** — chặn Ollama localhost:11434

Tất cả phát hiện qua **live testing trực tiếp với CEO** (2026-04-11), không phải automated tests.

---

## Architecture Decisions

### AD-1: Provider initialization phải explicit

**Before:** `chat.ts` gọi `getProviderRegistry()` trực tiếp → registry rỗng vì không ai gọi `initializeProvidersFromEnv()`.

**After:** `chat.ts` gọi `initializeProvidersFromEnv()` trước khi dùng registry.

**Root cause analysis:** `serve.ts` và `consult.ts` đều gọi init, nhưng `chat.ts` (Sprint 127) bị quên. Pattern violation — không có guard đảm bảo registry đã init.

**Files:** `src/cli/commands/chat.ts`

```typescript
// BEFORE (broken)
async function chatAction(options) {
  const projectPath = resolveActiveProjectDir();
  // registry.get() → empty → fail

// AFTER (fixed)
async function chatAction(options) {
  const { initializeProvidersFromEnv } = await import("../../providers/init.js");
  await initializeProvidersFromEnv();  // ← was missing
  const projectPath = resolveActiveProjectDir();
```

**Future guard:** Mọi CLI command dùng AI providers phải gọi `initializeProvidersFromEnv()`. Consider adding to a shared CLI middleware.

---

### AD-2: OAuth vs API Key — force OAuth khi có subscription

**Before (bridge):** `claude-code-bridge.ts` giữ `ANTHROPIC_API_KEY` trong env → Claude CLI dùng API key → "credit balance too low".

**After:** Strip `ANTHROPIC_API_KEY: undefined` → Claude CLI dùng OAuth session (Max $200).

**Before (provider):** `claude-code/index.ts` đã strip key đúng.

**Why bridge khác provider:** Bridge code có comment giải thích "stripping key causes 300s hang khi stdin=ignore" — đúng nếu OAuth session expired. Nhưng thực tế OAuth session valid (`claude auth status` → `loggedIn: true`).

**Decision:** Strip key. Nếu OAuth expired → error message rõ ràng "run claude login" (thay vì silent hang).

**Files:** `src/agents/invoke/claude-code-bridge.ts`

```typescript
env: {
  ...process.env,
  CLAUDECODE: undefined,
  ANTHROPIC_API_KEY: undefined,  // Force OAuth (Max $200)
},
```

---

### AD-3: Claude CLI `--session-id` bug workaround

**Discovery:** `claude -p --session-id <custom-id>` trả 0 bytes stdout trong CLI v2.1.101. Không có `--session-id` → hoạt động bình thường.

**Fix:** Không pass `--session-id` trên first turn. Để Claude tạo session ID tự động. Parse `session_id` từ JSON response, dùng `--resume <id>` cho turns tiếp theo.

**Files:** `src/providers/claude-code/index.ts`

```typescript
// BEFORE
if (this.turnCount === 0) {
  args.push("--session-id", this.sessionId!);  // ← causes empty output
} else {
  args.push("--resume", this.sessionId!);
}

// AFTER
if (this.turnCount > 0 && this.sessionId) {
  args.push("--resume", this.sessionId);  // only resume, never custom session-id
}
```

`parseResponse()` extended to extract `data.session_id` from Claude's JSON response.

---

### AD-4: CLI chat prefer cwd over active-project.json

**Before:** `resolveActiveProjectDir()` always returns `active-project.json` path → shows "DeepTutor" even when cwd is EndiorBot.

**After:** If cwd contains `.git/`, use cwd. Fallback to active-project.json only if cwd is not a repo.

**Rationale:** Khi user `cd ~/EndiorBot && endiorbot chat`, intent rõ ràng là muốn dùng EndiorBot, không phải project nào đó set từ tuần trước.

**Files:** `src/cli/commands/chat.ts`

```typescript
const cwd = process.cwd();
const cwdIsRepo = existsSync(join(cwd, ".git"));
const projectPath = cwdIsRepo ? cwd : resolveActiveProjectDir();
```

**Trade-off:** Nếu user muốn chat về project khác từ EndiorBot repo → phải `endiorbot start <project>` trước. Acceptable vì CLI convention là "cwd wins".

---

### AD-5: SSRF allowlist cho configured Ollama endpoints

**Discovery:** S2 SSRF defense (`safeFetch`) block `localhost` by default. Ollama có thể chạy local (`localhost:11434`) hoặc remote (`api.endior.net`).

**Design:** Đọc TẤT CẢ Ollama env vars (`OLLAMA_URL`, `OLLAMA_HOST`, `OLLAMA_BASE_URL`, `OLLAMA_REMOTE_URL`) + default `localhost:11434`. Mọi configured endpoint được trust — đây là CEO/DevOps configuration, không phải user input.

**Files:** `src/security/http-validator.ts`

```typescript
function getConfiguredOllamaOrigins(): Set<string> {
  const origins = new Set<string>();
  const envKeys = ["OLLAMA_URL", "OLLAMA_HOST", "OLLAMA_BASE_URL", "OLLAMA_REMOTE_URL"];
  for (const key of envKeys) {
    const val = process.env[key];
    if (val) {
      const parsed = new URL(val);
      origins.add(`${parsed.hostname}:${parsed.port || defaultPort}`);
    }
  }
  origins.add("localhost:11434"); // Ollama default — always included
  return origins;
}

function isConfiguredOllamaEndpoint(url: string): boolean {
  // Match host:port against configured origins
}
```

**Risk assessment:** Low — configured URLs are from `.env.local` (CEO-controlled file with `0o600` permissions). Attacker would need filesystem access to inject a malicious Ollama URL, at which point SSRF is moot.

---

### AD-6: Streaming output + idle hints (responsive UX)

**Before:** Claude Code output buffered until process exits. User sees nothing for up to 300s.

**After (bridge):**
- stdout streams to `process.stderr` in real-time
- Idle check every 10s: if no output for 30s → show `⏳ Claude Code working (Xs elapsed)...`
- Total timeout unchanged (300s default, configurable via `--timeout`)

**After (chat provider):**
- Idle check every 10s: if no output for 20s → show `⏳` dot
- Gives user confidence system is alive

**Files:** `src/agents/invoke/claude-code-bridge.ts`, `src/providers/claude-code/index.ts`

**Design principle:** "No silent waits > 20s". User should always see *something* — output, a progress hint, or an error.

---

### AD-7: Timeout increase 120s → 300s

**Before:** `claude-code` provider timeout = 120s. Complex queries (e.g., "có vấn đề gì cần chú ý không?") trigger full codebase scan → timeout.

**After:** 300s (5 min). Matches bridge default. Complex queries need time for Claude to read files, analyze, synthesize.

**Files:** `src/providers/claude-code/index.ts`

---

## Env Var Architecture (Updated)

```
ANTHROPIC_API_KEY
├── Used by: AnthropicProvider (direct API, src/providers/anthropic/)
├── NOT used by: claude-code provider (stripped, force OAuth)
├── NOT used by: claude-code-bridge (stripped, force OAuth)
└── Loaded from: .env.local (dotenv, src/cli/index.ts:38)

OLLAMA_URL / OLLAMA_HOST / OLLAMA_BASE_URL
├── Used by: OllamaProvider (src/providers/ollama/)
├── May point to REMOTE (e.g. api.endior.net)
├── SSRF validator: localhost:11434 always allowed regardless of env var value
└── Fallback: OLLAMA_REMOTE_URL for remote Ollama (AI-Platform)

Claude OAuth Session
├── Managed by: claude login (CLI)
├── Check status: claude auth status
├── Used by: claude -p (print mode) when ANTHROPIC_API_KEY is absent
└── Subscription: Max $200/month
```

---

## Testing Strategy

These fixes are primarily UX/integration fixes that are hard to unit-test (they depend on Claude CLI behavior, OAuth session state, running Ollama server). Testing approach:

| Fix | Test type | How |
|-----|-----------|-----|
| Provider init | **Manual** — `endiorbot chat` shows "✓ Registered" | Verified live with CEO 2026-04-11 |
| OAuth force | **Manual** — no more "credit balance too low" | Verified by stripping key + `claude auth status` |
| Session-id workaround | **Manual** — response is non-empty | Verified: `claude -p` without `--session-id` returns JSON |
| Cwd-prefer | **Manual** — "Project: EndiorBot" shows when in EndiorBot dir | Verified live |
| Ollama SSRF | **Automated** — `http-validator.test.ts` has `localhost:11434` allow test | In test suite |
| Streaming + idle | **Manual** — user sees `⏳` after 20-30s of silence | Pending live test |
| Timeout 300s | Config change, no test needed | — |

**Future:** Consider adding integration tests that spawn a mock Claude CLI to test provider init + session management.

---

## Files Changed (Summary)

| File | Changes |
|------|---------|
| `src/cli/commands/chat.ts` | +`initializeProvidersFromEnv()`, cwd-prefer logic, better error msg |
| `src/providers/claude-code/index.ts` | Remove `--session-id`, capture `session_id` from response, timeout 300s, idle hint |
| `src/agents/invoke/claude-code-bridge.ts` | Strip `ANTHROPIC_API_KEY`, streaming output, idle check + hint |
| `src/security/http-validator.ts` | `isLocalOllamaPort()` — allow localhost:11434 for Ollama |
| `src/providers/ollama/index.ts` | Last bare `fetch()` → `safeFetch()` |

---

## Lessons Learned

1. **Live testing with CEO > automated tests** for UX issues. Unit tests didn't catch "no provider init" because tests mock the registry.
2. **OAuth vs API key** is a deployment-specific concern — code should document which auth path it uses and why.
3. **Env var names can collide** — `OLLAMA_URL` points to both local and remote depending on override order. Use behavior-based checks (port 11434) not env-var-based checks.
4. **`--session-id` regression** in Claude CLI 2.1.x — pin to workaround, not fix. External dependency.
5. **Silent waits kill trust** — "no output for 300s" = user thinks system crashed. Always show *something*.

---

*EndiorBot | Solo Developer Power Tool | SDLC 6.3.0 | Chat & Bridge UX Fixes Design*
*Discovered through live CEO testing session 2026-04-11*
