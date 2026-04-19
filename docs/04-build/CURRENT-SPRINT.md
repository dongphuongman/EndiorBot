# Current Sprint — Pointer

> **This file is an SSOT pointer.** It should always reflect the sprint that is currently active or the most-recently-completed sprint if none is open. Historical sprint detail lives in `docs/04-build/sprints/sprint-NNN-*.md`.

## Active / Most Recent

- **Sprint 137** — Polish + Identity Refinement + E2E Quality — **PARTIAL CLOSE** (2026-04-19, CTO 9.5/10 across P0/P1/P2; P2 spikes + P3 governance carry forward)
  - Plan: [sprint-137-plan.md](sprints/sprint-137-plan.md)
  - Close report: [sprint-137-partial-close.md](sprints/sprint-137-partial-close.md)
  - Shipped (11 of 21 backlog items, 9 commits on origin/main):
    - P0 (3 items, `27115d3` + `d146246`): BusConsumer dual-emit fix, bridge post-output drain, gate cwd resolution, @pjm/@devops sonnet assertion catch-up
    - P1 Identity+Docs (4 items, `b3fd048` + `5207083`): CLAUDE.md + AGENTS.md LOCAL-ONLY, SOUL PREAMBLE scope, stage 06-07 realignment
    - P1 UX (3 items): B6 per-agent timeouts (`5b38fa2`), A8 Telegram editMessageText (`ede2253`), A9 Zalo throttle + WebUI/CLI/Desktop stubs (`a6779f9`)
    - P2 E2E API testing (4 items, `ed46a81`): OpenAPI 3.0 spec (9 REST + 47 JSON-RPC), contract tests with bidirectional drift detection, OWASP API1-6 triage + control tests (zero non-localhost findings), G3 evidence manifest with SHA256 integrity
  - Tests: +45 (1726 → 1822 on focused sweep; last full run 7974/7984 pass, 10 skipped, 0 regressions).
  - Carry forward to Sprint 138: P2 spikes (3 items, 1-2 days), P3 governance (3 items — **12 leaked secrets rotation flagged HIGH urgency per CTO 2026-04-19**, ADR-048 `authority:` audit, `.sdlc-framework/` gitignore tweak).
  - Outstanding CTO obligation: ADR-048 countersign retroactive expansion.

- **Sprint 136** — Part A governance + Part A' UX hardening — **CLOSED** (2026-04-18, impl complete, awaiting CEO post-close review)
  - Plan: [sprint-136-desktop-web-dashboard.md](sprints/sprint-136-desktop-web-dashboard.md)
  - Close report: [sprint-136-close.md](sprints/sprint-136-close.md)
  - Delivered: A1+A2+A3+A4 governance (109022d), A10 Anthropic opt-out (60d92fb), A11 rate-limit-only fallback (4d46c11), B3 timeout wiring (dbb6e4c), B4/B4b error surfacing (e14299f, 1053026), B5 bypassPermissions root-cause fix (e1e3064), A6+A7 progress + fallback status (ceea4e1), preToolUse case fix (bcc07de).
  - Deferred: A8 Telegram editMessageText (append-ticker is acceptable interim), A9 Zalo/WebUI/CLI/Desktop progress stubs, Part B Desktop+Web dashboard (CEO scope confirmation pending).
  - Trigger incident resolved: CEO's 2026-04-18 Telegram test (10-min silent → "Internal error") now returns `⚡ @tester` response in 1 min end-to-end.

- **Sprint 135** — Surface Parity + P1 Workspace Awareness — **CLOSED** (2026-04-17)
  - Plan: [sprint-135-surface-parity.md](sprints/sprint-135-surface-parity.md)
  - Authority: CTO G2 APPROVED + CPO 9.4/10 APPROVED (original scope); CPO 9.5/10 + @cto countersign (P1 addition)
  - Original scope (items 1-8): shipped — `2959517`, `b6b192e`, `0da795a`, `9fcdfcb`, `835f5f4`
  - P1 addition: SDLC 6.3.1 adoption, Layer 1.25 workspace-awareness injection — `9df591f` + `999c325`. ADR: [ADR-048](../02-design/01-ADRs/ADR-048-framework-6-3-1-workspace-awareness.md) (FULL expansion shipped Sprint 136).

- **Sprint 134** — Config Externalization + Webhooks Ingress — **✅ COMPLETE** (2026-04-11, CTO 9/10)
  - [sprint-134-config-webhooks.md](sprints/sprint-134-config-webhooks.md)

- **Sprint 133** — Active Memory + SSRF + Bug Fixes — **✅ COMPLETE** (2026-04-11, CTO 9.5/10)
  - [sprint-133-active-memory-ssrf.md](sprints/sprint-133-active-memory-ssrf.md)

- **Sprint 132** — openclaw Backport M0 + M1 — **✅ COMPLETE** (2026-04-11, CTO 9.5/10)
  - Plan: [sprint-132-openclaw-backport.md](sprints/sprint-132-openclaw-backport.md)
  - PRD: [openclaw-backport PRD](../01-planning/openclaw-backport/PRD.md)
  - Scope: [openclaw-backport scope](../01-planning/openclaw-backport/scope.md)
  - Authority: CTO G2 APPROVED (Plan v3) + CPO Approved + CEO Decisions Locked 2026-04-11

- **Sprint 131** — CRG Wiring + Auto-Handoff + UX Wins — **✅ COMPLETE** (2026-04-10, CPO accepted post-merge)
  - Plan: [sprint-131-crg-wiring-knowledge-velocity.md](sprints/sprint-131-crg-wiring-knowledge-velocity.md)
  - Key deliverables: `enrichWithCRG()` wiring, auto-handoff from @mentions (CEO-approved default), per-task state machine, knowledge erosion prompt, decision velocity metric, chat tool usage tracking
  - ADR-046 STUB landed; full expansion moved to Sprint 132 Task 1
  - Commits: `ce8af90` (CRG wiring + auto-handoff) · `b922286` (decision-velocity refinement)

## Previous Sprints

Historical sprint summaries live in their own docs. See [sprints/sprint-index.md](sprints/sprint-index.md) for the full catalog.

Recent highlights:
- Sprint 130 — Security + ADR + Chat ([sprint-130-security-adr-chat.md](sprints/sprint-130-security-adr-chat.md))
- Sprint 129 — Commit + Push + Stabilize (Sprint 121–128 consolidation)
- Sprint 72  — v2.0 Autonomous SDLC Agent (Gates A/B/C, AER metrics, model tiering) ([sprint-72-autonomy.md](sprints/sprint-72-autonomy.md))

## Maintenance Rule (@pjm)

This file must be updated **on the same day** as each sprint kickoff / close. Past drift (7+ days behind) was flagged by CTO during Plan v3 G2 review on 2026-04-11; this refresh resolves that debt. The SOUL-pm.md adjacent-artifact enumeration rule being added in the same batch helps prevent future drift.

---

*EndiorBot | CEO Power Tool (LOCKED, LOCAL-ONLY) | SDLC 6.3.1 | Pointer updated 2026-04-19*
