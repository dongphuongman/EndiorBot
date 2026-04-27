---
sprint: 146
status: DRAFT — blocked by Sprint 145 exit
start_date: TBD
planned_duration: 2-3d
framework: "6.3.1"
authority:
  proposer: "@pm"
  countersigners: []
  trigger: "Sprint 145 dual-launch complete (both repos public, npm published)"
previous_sprint: "Sprint 145 — Dual-Launch: SDLC Framework + EndiorBot"
references:
  - docs/04-build/sprints/sprint-145-dual-launch.md
---

# Sprint 146 — Post-Launch: Community Growth + Tech Debt

## Context

Sprint 145 launched both SDLC Framework 6.3.1 (sdlcframework.org) and EndiorBot (endior.net) as open-source. This sprint focuses on community experience, tech debt from CSO audit, and documentation site.

**No new features.** Community quality + developer experience only.

---

## P0 — Community Experience (blocks adoption)

### T1: Documentation Site — endior.net (~3h)

**Options (pick one at sprint start):**
- **A. GitHub Pages** — Static site from `docs/` with nav
- **B. Docusaurus** — Full docs site with search, versioning
- **C. Simple redirect** — endior.net → GitHub repo README (5min, defer real site)

Recommended: Option C for immediate, upgrade to B in Sprint 147.

**Also:**
- sdlcframework.org → SDLC Framework GitHub repo
- sdlcframework.dev → "SDLC Orchestrator — Coming Soon" placeholder

**Owner:** @devops + CEO (DNS)

---

### T2: Community README Enhancements (~2h)

- Record 30s GIF demo: `endiorbot init` → `endiorbot serve` → Telegram chat
- Add "Why EndiorBot?" comparison section
- Add "Star History" badge
- Add "Contributors" section with Contributing quick-start

**Owner:** @pm

---

### T3: CHANGELOG Sprint 139-144 Entries (~30min)

EndiorBot CHANGELOG.md currently stops at Sprint 135. Add entries for:
- Sprint 139: OpenMythos evaluator optimization
- Sprint 140: Kimi k2.6 integration + ADR-052
- Sprint 141: Cost telemetry + Ollama confidence
- Sprint 142: Anti-drift improvements + vendor-agnostic enrichment
- Sprint 143: Brain L2 + gate mark + CC-first routing + 7 hotfixes
- Sprint 144: Gateway hardening + community publish cleanup

**Owner:** @pm

---

## P1 — Tech Debt (CSO audit items)

### T4: God Class Refactoring — Top 3 (~4h)

CSO audit finding: 11 files >900 lines.

| File | Lines | Extract |
|------|-------|---------|
| `src/sessions/autonomous/manager.ts` | 1,269 | `TaskQueue`, `AutonomyGateManager` |
| `src/channels/telegram/telegram-channel.ts` | 1,211 | `TelegramFormatter`, `TelegramCommandRouter` |
| `src/budget/budget-tracker.ts` | 1,104 | `BudgetAlertService`, `BudgetReporter` |

**Constraint:** Extract only. No behavior change. All tests pass unchanged.

**Owner:** @coder

---

### T5: Circular Dependency Fix — Approval Module (~1h)

CSO audit: `src/agents/router/patch-flow.ts` imports from `src/gateway/methods/approval.ts`.

**Fix:** Extract to `src/approval/queue.ts`. Both `agents/` and `gateway/` import from neutral module.

**Owner:** @architect + @coder

---

### T6: Desktop Release Build (~2h)

Build distributable binaries:
- `EndiorBot-1.0.0-arm64.dmg` (macOS Apple Silicon)
- `EndiorBot-1.0.0-x64.dmg` (macOS Intel)
- Attach to GitHub Release as assets

Windows/Linux deferred to Sprint 147 (needs CI matrix).

**Owner:** @devops

---

## P2 — Backlog (Sprint 147+)

| Task | Sprint | Notes |
|------|--------|-------|
| Docusaurus full docs site on endior.net | 147 | Replace redirect with real docs |
| Windows/Linux desktop builds | 147 | CI matrix for electron-builder |
| `endiorbot create-app` scaffolding | 147 | Create projects from templates |
| Dev.to article | 147 | "Building an AI Agent Orchestrator" |
| Semantic versioning automation | 148 | `semantic-release` + conventional commits |
| Plugin system for custom SOUL agents | 148 | Community extensibility |
| ADR status cleanup (5 PROPOSED → ACCEPTED) | 146 or 147 | CSO finding: shipped code with draft ADRs |

---

## Success Metrics (end of Sprint 146)

| Metric | Target |
|--------|--------|
| GitHub stars (EndiorBot) | 50+ |
| GitHub stars (Framework) | 100+ |
| npm weekly installs | 50+ |
| First community Issue | ✅ (within 1 week of launch) |
| CI green on both repos | ✅ |
| All 3 domains resolving | ✅ |
| God classes: top 3 below 1,000 lines | ✅ |

---

*EndiorBot | Solo Developer Power Tool | SDLC 6.3.1 | Sprint 146 Draft — 2026-04-27*
