# Sprint 116: P0 Security & Code Health Fixes

**Sprint Duration**: March 22-25, 2026
**Sprint Goal**: Fix all P0 security vulnerabilities (command injection, CORS, input sanitization) and critical code health issues (Zero Mock violations, layer violations, test failures) to raise compliance from 48% to 70-75%.
**Status**: COMPLETE
**Priority**: P0 (security + Zero Mock) | P1 (debt reduction)
**Framework**: SDLC 6.2.0
**Authority**: CTO APPROVED WITH AMENDMENTS (8.0/10) — Counter-proposal to original Admin UI plan
**Previous Sprint**: Sprint 115 — RL Prompt Injection + Async UX + RAG Integration
**Related ADRs**: ADR-006 (Checkpoint State Model), ADR-034 (CrossSystem Agent Protocol)
**Tests**: ~30 new/fixed tests planned

---

## Background

PM+PJM audit delivered **NO-GO at 48% compliance** with specific P0 blockers. CTO rejected the original Sprint 116 plan (Admin Web UI + Binary Packaging) because it proposed building features on a condemned foundation.

Key audit findings:
- **14 command injection sites** in `git-automation.ts` via `execSync` template string interpolation
- **7 Zero Mock violations** across 6 files, 3 BLOCKER-level (fake AI responses in production)
- **Wildcard CORS (`*`)** on all gateway HTTP endpoints
- **No input sanitization** on Web/WS gateway path (sanitizer exists but not wired)
- **Layer violations**: providers → gateway, agents → gateway (bidirectional coupling)
- **~160 gateway test failures** across 16 files
- **handlers.ts at 2088 lines** (God Object)
- **gates.passed: []** after 116 sprints

**Decision**: Fix P0s first (this sprint). Admin UI + Packaging → Sprint 117.

### CTO Amendments (Sprint 116 Plan Review)

| # | Amendment | Impact |
|---|-----------|--------|
| A1 | T5 expanded: 1 target → 3 BLOCKER-level Zero Mock sites | T5a/T5b/T5c |
| A2 | T7 must WIRE RateLimiter to HTTP endpoints, not just relocate | Security impact otherwise zero |
| A3 | T1 regression test immediately after implementation | Prevent git operation breakage |
| A4 | T6 time-boxed to 0.5d with escalation path | Avoid scope creep |

### CPO Conditions

| # | Condition |
|---|-----------|
| C1 | No new native addons (keytar) or custom crypto (AES) this sprint |
| C2 | 501/remove fake must have clear CEO-facing message, not silent error |
| C3 | Run compliance subset after Track A/B to prove 48% → ~70-75% |

---

## Sprint 116 Deliverables

### Track A: Security (CRITICAL — Day 1)

#### T1: Fix Command Injection in git-automation.ts (P0, 2h)

**Goal**: Replace all `execSync` template string interpolation with `execFileSync` argument arrays to eliminate command injection.

**File**: `src/sessions/checkpoint/git-automation.ts`

| # | Line | Vulnerable Pattern | Fix |
|---|------|--------------------|-----|
| 1 | 269 | `` execSync(`git diff-tree ... ${commitSha}`) `` | `execFileSync("git", ["diff-tree", ..., commitSha])` |
| 2 | 277 | `` execSync(`git show ... ${commitSha}`) `` | `execFileSync("git", ["show", ..., commitSha])` |
| 3 | 391 | `` execSync(`git add "${file}"`) `` | `execFileSync("git", ["add", file])` |
| 4 | 395 | `` execSync(`git commit -m "${message...}"`) `` | `execFileSync("git", ["commit", "-m", message])` |
| 5 | 476 | `` execSync(`git revert --no-edit ${sha}`) `` | `execFileSync("git", ["revert", "--no-edit", sha])` |
| 6 | 482 | `` execSync(`git commit --amend -m "${msg}"`) `` | `execFileSync("git", ["commit", "--amend", "-m", msg])` |
| 7 | 518 | `` execSync(`git rev-parse ${sha}^`) `` | `execFileSync("git", ["rev-parse", sha + "^"])` |
| 8 | 527 | `` execSync(`git checkout ${commit} -- "${file}"`) `` | `execFileSync("git", ["checkout", commit, "--", file])` |
| 9 | 539 | `` execSync(`git commit -m "${msg}"`) `` | `execFileSync("git", ["commit", "-m", msg])` |
| 10 | 612 | `` execSync(`${stashCmd} -m "${msg}"`) `` | `execFileSync("git", ["stash", "push", ...flags, "-m", msg])` |
| 11 | 716 | `` execSync(`git cat-file -e ${sha}`) `` | `execFileSync("git", ["cat-file", "-e", sha])` |
| 12 | 735 | `` execSync(`git reset --${strategy} ${sha}`) `` | `execFileSync("git", ["reset", "--" + strategy, sha])` |
| 13 | 789 | `` execSync(`git branch "${name}"`) `` | `execFileSync("git", ["branch", name])` |
| 14 | 841 | `` execSync(`git branch ${flag} "${name}"`) `` | `execFileSync("git", ["branch", flag, name])` |

**Validation helper**:
```typescript
function validateGitRef(ref: string): string {
  if (!/^[a-zA-Z0-9._\-/~^]+$/.test(ref)) throw new Error(`Invalid git ref: ${ref}`);
  return ref;
}
```

**Tests**: Run `pnpm test tests/sessions/checkpoint/` immediately after — CTO A3.

---

#### T2: Add sanitize() to Gateway Ingress (P0, 1h)

**Goal**: Wire existing `src/security/input-sanitizer.ts` to gateway Web/WS inbound path.

**Files Modified**:
- `src/gateway/ingress.ts` — import + call `sanitize()` on `msg.content` before processing
- `src/gateway/methods/router-chat.ts` (line 65) — sanitize chat input

---

#### T3: Replace Wildcard CORS (P0, 1h)

**Goal**: Replace `Access-Control-Allow-Origin: *` with configurable allowed origins.

**Files Modified**:
- `src/gateway/server.ts` (line 551) — origin validation against whitelist
- `src/gateway/config.ts` — add `corsOrigins?: string[]` + env `ENDIORBOT_CORS_ORIGINS`

---

### Track A continued: Security (P1 — Day 1-2)

#### T4: Env Validation at Startup (P1, 1.5h)

**Goal**: Validate critical env vars at serve startup. Warn when `host=0.0.0.0` widens attack surface.

**Files**:
- New: `src/config/env-schema.ts` — validation schema (Zod if available, manual if not)
- Modified: `src/cli/commands/serve.ts` — validate before startup

---

### Track B: Code Health (CRITICAL — Day 1-2)

#### T5a: Remove simulateConsultation() → 501 (P0, 0.25d)

**Goal**: Delete fake AI responses on production `agents.consult` endpoint.

**File**: `src/gateway/methods/agents.ts`
- Delete `simulateConsultation()` function (lines 388-412)
- Replace call at line 230 with: `{ error: "Multi-model consultation not yet available. Use single-agent chat instead.", code: "NOT_WIRED" }`
- CPO C2: Clear CEO-facing message

---

#### T5b: control-plane.ts mockExecute Guard (P0, 0.25d)

**Goal**: Prevent `mockExecute()` from silently no-oping tool execution in production.

**File**: `src/tools/control-plane.ts` (line 118)
- Add guard: `if (process.env.NODE_ENV !== "test") throw new Error("mockExecute not allowed in production")`
- Verify all test configs set `NODE_ENV=test`

---

#### T5c: Autonomous Manager Feature Flag (P0, 0.25d)

**Goal**: Gate `AutonomousSessionManager` behind feature flag, exclude fake cost metrics from budget tracking.

**File**: `src/sessions/autonomous/manager.ts` (line 627)
- `executeTaskWork()` returns `Math.random()` costs — poison for AER metrics
- Add feature flag guard or remove fake cost calculation

---

#### T6: Fix Gateway Test Failures (P0, time-boxed 0.5d)

**Goal**: Fix ~160 failing gateway tests. Root cause: WS 400 errors from `tools.test.ts` cascading.

**Files**: `tests/gateway/*.test.ts` (7 test files)
- Fix server teardown first (root cause)
- Triage mock interface mismatches (`as never` casts)
- Priority: ingress > auth > server > events
- **CTO A4**: Time-box to 0.5d. Escalate if not resolved.

---

#### T7: Extract RateLimiter + Wire to HTTP (P0, 2h)

**Goal**: Fix layer violations AND actually wire rate limiting to HTTP endpoints.

**Phase 1 — Extract**:
- Move `RateLimiter` class from `src/gateway/auth.ts` → `src/security/rate-limiter.ts`
- Re-export from `src/gateway/auth.ts` (temporary backwards compat)
- Update all provider imports: `../../gateway/auth.js` → `../../security/rate-limiter.js`

**Phase 2 — Wire** (CTO A2):
- Instantiate RateLimiter in `server.ts` for `/api/*` endpoints
- Wire to `handleHttpRequest()` — reject requests exceeding rate limit

**Phase 3 — Fix agents → gateway violation**:
- `src/agents/channel-router.ts:23` imports from `../gateway/methods/approval.js`
- Extract approval interface to `src/agents/types/` or use event bus

---

### Track B continued (P1 — Day 2)

#### T8: Record Gates Passed (P1, 0.5h)

**Goal**: Update `.sdlc-config.json` gates to reflect actual project state.

After 116 sprints: G0.1 (Foundation), G1 (Planning), G2 (Design) are clearly passed. Evaluate G3.

---

### Track C: Debt Reduction (P1 — Day 2-3)

#### T9: Split handlers.ts (P1, 3h)

**Goal**: Split 2088-line God Object into domain-grouped files.

| New File | Commands | ~Lines |
|----------|----------|--------|
| `src/commands/handlers/sdlc-commands.ts` | /gate, /compliance, /consult, /init | ~400 |
| `src/commands/handlers/bridge-commands.ts` | /link, /launch, /unlink, /session | ~400 |
| `src/commands/handlers/ott-commands.ts` | /start, /help, /status, /team, etc. | ~600 |
| `src/commands/handlers/system-commands.ts` | /health, /config, /debug | ~300 |
| `src/commands/handlers/index.ts` | Re-export all + barrel | ~50 |

---

#### T10: Structured Logger (P1, 2h)

**Goal**: Replace `console.*` with JSON structured logger in top 10 security-sensitive files.

**New**: `src/utils/logger.ts` — `createLogger(module)` with info/warn/error + JSON output.

---

## Files Summary

| Action | File | Track | Est. Lines |
|--------|------|-------|-----------|
| MODIFY | `src/sessions/checkpoint/git-automation.ts` | T1 | ~80 changed |
| MODIFY | `src/gateway/ingress.ts` | T2 | +5 |
| MODIFY | `src/gateway/methods/router-chat.ts` | T2 | +3 |
| MODIFY | `src/gateway/server.ts` | T3 | +15 |
| MODIFY | `src/gateway/config.ts` | T3 | +10 |
| CREATE | `src/config/env-schema.ts` | T4 | ~60 |
| MODIFY | `src/cli/commands/serve.ts` | T4 | +10 |
| MODIFY | `src/gateway/methods/agents.ts` | T5a | -30 (delete fake) |
| MODIFY | `src/tools/control-plane.ts` | T5b | +5 |
| MODIFY | `src/sessions/autonomous/manager.ts` | T5c | +10 |
| MODIFY | `tests/gateway/*.test.ts` (7 files) | T6 | ~150 fixed |
| CREATE | `src/security/rate-limiter.ts` | T7 | ~80 |
| MODIFY | `src/gateway/auth.ts` | T7 | +5 (re-export) |
| MODIFY | `src/providers/{5 files}` | T7 | ~10 each |
| MODIFY | `src/agents/channel-router.ts` | T7 | +15 |
| MODIFY | `.sdlc-config.json` | T8 | ~5 |
| CREATE | `src/commands/handlers/sdlc-commands.ts` | T9 | ~400 |
| CREATE | `src/commands/handlers/bridge-commands.ts` | T9 | ~400 |
| CREATE | `src/commands/handlers/ott-commands.ts` | T9 | ~600 |
| CREATE | `src/commands/handlers/system-commands.ts` | T9 | ~300 |
| CREATE | `src/commands/handlers/index.ts` | T9 | ~50 |
| CREATE | `src/utils/logger.ts` | T10 | ~40 |
| MODIFY | 10 files (console → logger) | T10 | ~20 each |
| **Total** | **~35 files** | | **~2,400 lines** |

---

## Execution Order (CTO Amended)

```
Day 1 — CRITICAL Security:
├── T1: Command injection fix (largest blast radius)
│   └── Immediately: pnpm test tests/sessions/checkpoint/
├── T2: Gateway sanitization (one-line wire)
└── T3: CORS wildcard → configurable

Day 1-2 — Security + Zero Mock:
├── T4: Env validation
├── T5a: agents.consult → 501
├── T5b: control-plane mockExecute guard
└── T5c: autonomous manager feature flag

Day 2-3 — Code Health:
├── T6: Fix 160 test failures (time-box 0.5d)
├── T7: Extract + WIRE RateLimiter
└── T9: Split handlers.ts

Day 3 — Debt:
├── T8: Gate records
└── T10: Structured logger
```

**Gate**: Do NOT start Track C until Track A passes `pnpm build && pnpm test`.

---

## Acceptance Criteria

- [ ] `grep -n 'execSync(\`' src/sessions/checkpoint/git-automation.ts` returns 0 matches
- [ ] `grep -rn 'simulateConsultation' src/` returns 0 matches
- [ ] `grep -n '"\\*"' src/gateway/server.ts` does not find CORS wildcard
- [ ] `grep -n 'sanitize' src/gateway/ingress.ts` finds import + usage
- [ ] `grep -rn 'from.*gateway' src/providers/` returns 0 matches (layer violation fixed)
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — 0 failures
- [ ] `pnpm test tests/gateway/` — all pass
- [ ] `.sdlc-config.json` gates.passed includes at least G0.1, G1
- [ ] Compliance estimate: 48% → 70-75%

---

## Definition of Done

1. All P0 tasks (T1-T3, T5a-T5c, T6-T7) completed and verified
2. `pnpm build` clean, `pnpm test` green
3. Sprint doc updated with actual results
4. CTO sign-off on foundation readiness for Sprint 117 (Admin UI)

---

## Deferred to Sprint 117

| Feature | Rationale |
|---------|-----------|
| Admin Web UI (Settings tab) | Build on clean foundation |
| Binary Packaging (npx + Docker) | Package a compliant product |
| Docs Cleanup (consolidate + archive) | After code stabilizes |
| SDLC 6.2.0 Full Audit | After P0 gaps closed |
