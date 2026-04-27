---
sprint: 145
status: DRAFT — awaiting CEO kickoff
start_date: TBD
planned_duration: 1-2d
framework: "6.3.1"
authority:
  proposer: "@pm"
  countersigners: ["@cto G2 approved 2026-04-27"]
  trigger: "Sprint 144 OSS publish readiness — CTO 9/10 + CPO GO"
previous_sprint: "Sprint 144 — Gateway Hardening + Community Publish Cleanup"
references:
  - docs/04-build/sprints/sprint-144-gateway-hardening.md
---

# Sprint 145 — Pre-Publish Hardening

## Context

Sprint 144 shipped community publish cleanup (198 files, commit `4760a8d`). CTO approved G3 for publish with one condition: rotate all keys before flipping public. CPO confirmed GO with condition: CI green + secrets rotation.

This sprint closes all blockers before the repo goes public on GitHub.

**Identity guard:** No new features. Only hardening, security, and tech debt reduction.

---

## P0 — Must Complete Before Public (blocks launch)

### T1: Rotate ALL API Keys (~30min)

**Why:** ADR-049 documents historical credential exposure. Keys were rotated post-rewrite but should be freshly rotated before public flip (CTO: "belt and suspenders").

**Keys to rotate:**
- Anthropic API key (if using one)
- OpenAI API key (`sk-proj-...`)
- Google/Gemini API key (`AIzaSy...`)
- Kimi API key
- GitHub PAT (`github_pat_...`)
- Telegram bot token
- Zalo bot tokens
- Ollama remote API keys
- MCP Gateway API key
- Gateway token (`ENDIORBOT_GATEWAY_TOKEN`)

**After rotation:**
- Update `.env` locally (not committed)
- Verify `endiorbot serve` starts with new keys
- Test one Telegram message to confirm bot works

**Owner:** CEO
**Success:** All keys in `.env` are fresh. Old keys are dead.

---

### T2: Update SECURITY.md with Rotation Evidence (~15min)

**What:**
- Add rotation date to SECURITY.md incident timeline
- Confirm "all pre-publish keys rotated on YYYY-MM-DD"
- Verify `security@endior.net` email works (or update to working email)

**Owner:** @cso
**Files:** `SECURITY.md`

---

### T3: GitHub Actions CI/CD Pipeline (~2h)

**What:** Create `.github/workflows/ci.yml`:
- Trigger on push to `main` + PRs
- Node.js 20 + pnpm
- Steps: `pnpm install` → `pnpm build` → `pnpm test`
- Badge in README.md (already has badge placeholder pointing to CI)

**Files:**
- `.github/workflows/ci.yml` (NEW)
- `README.md` — verify CI badge URL matches workflow

**Owner:** @devops
**Success:** CI badge shows green on GitHub repo page.

---

### T4: Fix 2 Moderate Vulnerabilities (~30min)

**What:** Dependabot reports 2 moderate vulnerabilities:
- `vite` path traversal (<=6.4.1 → patch to >=6.4.2)
- `brace-expansion` ReDoS (already has pnpm override — verify effective)

**Files:**
- `package.json` — add/update `pnpm.overrides` for vite
- `pnpm-lock.yaml` — regenerate after override

**Owner:** @coder
**Success:** `pnpm audit` shows 0 high/critical, ≤2 moderate (dev-only acceptable).

---

## P1 — Should Complete (tech debt, improves community experience)

### T5: God Class Refactoring — Top 3 (~4h)

**CSO audit finding:** 11 files >900 lines. Refactor the top 3:

| File | Lines | Extract |
|------|-------|---------|
| `src/sessions/autonomous/manager.ts` | 1,269 | `TaskQueue`, `AutonomyGateManager` |
| `src/channels/telegram/telegram-channel.ts` | 1,211 | `TelegramFormatter`, `TelegramCommandRouter` |
| `src/budget/budget-tracker.ts` | 1,104 | `BudgetAlertService`, `BudgetReporter` |

**Constraint:** Extract only. No behavior change. All existing tests must pass unchanged.

**Owner:** @coder
**Success:** No file >1,000 lines in these 3 modules. All tests pass.

---

### T6: Circular Dependency Fix — Approval Module (~1h)

**CSO audit finding:** `src/agents/router/patch-flow.ts` imports runtime value from `src/gateway/methods/approval.ts` — agents should not depend on gateway internals.

**Fix:** Extract `createApprovalRequest()` + `waitForApproval()` + `approvalQueue` to `src/approval/queue.ts`. Both `agents/` and `gateway/` import from this neutral module.

**Files:**
- `src/approval/queue.ts` (NEW)
- `src/approval/index.ts` (NEW — barrel export)
- `src/agents/router/patch-flow.ts` — update import
- `src/gateway/methods/approval.ts` — delegate to `src/approval/`
- `src/commands/remote-handlers.ts` — update import
- `src/tools/ott-approval.ts` — update import

**Owner:** @architect + @coder
**Success:** `grep -rn "from.*gateway/methods/approval" src/agents/` returns 0 results.

---

### T7: README Polish (~1h)

**What:**
- Verify all markdown links in README.md resolve (no 404s)
- Add Desktop app screenshot (capture from running app)
- Verify `npx endiorbot --help` output matches README examples
- Add "Star this repo" CTA

**Owner:** @pm
**Success:** README renders correctly on GitHub with working links and screenshot.

---

## P2 — Nice to Have (defer to Sprint 146 if time-constrained)

| Task | Effort | Notes |
|------|--------|-------|
| Update CHANGELOG.md with Sprint 139-144 entries | 30min | Currently stops at Sprint 135 |
| Add `CODEOWNERS` file for auto-review assignment | 15min | GitHub feature |
| Create `ROADMAP.md` for community contributors | 1h | Public-facing roadmap |

---

## Sequencing

```
Day 1:
  T1 (rotate keys, CEO, 30min)
  T2 (SECURITY.md, @cso, 15min)
  T3 (CI/CD, @devops, 2h)
  T4 (vuln fix, @coder, 30min)

Day 2 (if time):
  T5 (god classes, @coder, 4h)
  T6 (circular dep, @architect, 1h)
  T7 (README polish, @pm, 1h)
```

---

## Test Plan

| Change | Tests |
|--------|-------|
| Key rotation | Manual: `endiorbot serve` + Telegram message |
| CI pipeline | Verify GitHub Actions badge green |
| Vuln fix | `pnpm audit` clean |
| God class refactoring | All 8,124+ existing tests pass unchanged |
| Circular dep fix | Build clean + import grep = 0 |

---

## Exit Criteria (Gate G4 — Release)

- [ ] All API keys rotated (T1)
- [ ] SECURITY.md updated with rotation date (T2)
- [ ] CI pipeline green on GitHub (T3)
- [ ] 0 high/critical vulnerabilities (T4)
- [ ] Build clean, 8,124+ tests pass
- [ ] README links verified (T7)

**After exit:** Sprint 146 flips repo public + npm publish.

---

*EndiorBot | Solo Developer Power Tool | SDLC 6.3.1 | Sprint 145 Draft — 2026-04-27*
