# Sprint 129 — Cleanup, Best Practices, Commit

**Date:** 2026-04-04
**Status:** COMPLETE
**Prerequisite:** Sprint 121-128 COMPLETE (8 sprints uncommitted)
**Framework:** SDLC 6.3.0
**Authority:** PM — CTO 9/10 APPROVED, CPO APPROVED with conditions
**ADRs:** ADR-044 (Agentic OS Alignment)

---

## Context

8 sprints (121-128) of uncommitted work sitting in working tree: 174 files, +9,537/-670 lines. CTO directed: "commit, push, stabilize — not adopting patterns from a 513K LOC system that solve problems EndiorBot doesn't have."

CEO also directed: combine stabilization with best practices from Lam Nguyen's "Giai Phau Mot Agentic Operating System" (18 patterns analysis), and align with sibling products (MTClaw S90-94, SDLC Orchestrator V2 S9-S11).

**Baseline:** 7,594 tests passing, 7 failures (5 pre-existing + 2 flaky port conflicts).

---

## CTO Conditions (binding)

| # | Condition | Status |
|---|-----------|--------|
| 1 | 7->0 test failures | DONE |
| 2 | Verify `.claude/settings.local.json` has no secrets | DONE — gitignored (contained real tokens) |
| 3 | Tag `pre-sprint-129-push` before pushing | DONE |
| 4 | Be careful normalizing provider names end-to-end | DONE — verified consult.ts, chat-handler.ts, pricing-registry.ts |

## CPO Conditions (binding)

| # | Condition | Status |
|---|-----------|--------|
| 1 | 0 test failures before commit | DONE — 7,601 pass, 0 fail |
| 2 | All untracked test files committed (~137 tests) | DONE — 174 files staged |
| 3 | Provider default change (consult -> OpenAI) noted in commit + README | DONE |
| 4 | Push after CEO approval only | AWAITING |

---

## Scope

### Phase 0: Documentation (PM directive: document first)

| Item | File | Status |
|------|------|--------|
| ADR-044: Agentic OS Alignment | `docs/02-design/01-ADRs/ADR-044-Agentic-OS-Alignment.md` | DONE |
| README: provider change + CSO agent + 14 SOUL count | `README.md` | DONE |
| Sprint 129 plan | `docs/04-build/sprints/sprint-129-cleanup-commit.md` | DONE |

### Phase 1: Stabilize Tests (7 -> 0)

| Test | Root Cause | Fix |
|------|-----------|-----|
| 3 OTT init tests (Telegram/Zalo/E2E) | `loadActiveProject()` returns real project on dev machine | Mock to return `undefined` |
| 2 agent-launcher SOUL tests | PREAMBLE injection (Sprint 87) adds `--append-system-prompt-file` to all launches | Updated assertions to accept brain-context injection |
| 1 gateway tools EADDRINUSE | Port range 18700-18800 conflicts with VSCode (port 18793) | Changed to 19100-20000 range |
| 1 compliance --tier (intermittent) | Passes in isolation, flaky in parallel | No change needed |

### Phase 2: Cleanup

| Item | Files | Change |
|------|-------|--------|
| Version strings v6.1.1 -> 6.3.0 | 10 files in src/sdlc/ | 25+ occurrences updated |
| FRAMEWORK_VERSION 6.2.0 -> 6.3.0 | `src/index.ts` | 1 line |
| Provider SSOT | `src/config/providers.ts` (new) | PROVIDERS constant, DEFAULT_CONSULT_PROVIDER |
| Model SSOT | `src/config/models.ts` (new) | MODELS constant per provider |
| Security: gitignore settings.local.json | `.gitignore` | Contains real API tokens |

### Phase 3: Agentic OS Alignment (ADR-044)

**Source:** Lam Nguyen — "Giai Phau Mot Agentic Operating System" (18 Patterns)

**3-Product Ecosystem (Federated AI OS):**

| Product | Role | Sprint |
|---------|------|--------|
| SDLC Orchestrator V2 | Control Plane (gates, permissions) | S9-S11 |
| MTClaw | Runtime (context compaction, tokens) | S90-S94 |
| EndiorBot | CLI + CEO Interface (commands, chat) | S121-S129 |

**Pattern Coverage:**
- 8/18 patterns independently implemented in EndiorBot
- 4 proposals rejected by CTO (P1-P4)
- 6 patterns owned by other products or N/A

**Key Learnings:**
- "Build what you need, validate against best practices, don't cargo-cult"
- Architecture validated: 8/18 patterns present before the analysis
- Cross-product alignment deferred to Framework 6.3.0

---

## Deliverables

| # | Deliverable | Status |
|---|------------|--------|
| 1 | ADR-044: Agentic OS Alignment | DONE |
| 2 | 7,601 tests passing, 0 failures | DONE |
| 3 | Version strings unified to 6.3.0 | DONE |
| 4 | Provider/Model SSOT constants | DONE |
| 5 | `.claude/settings.local.json` gitignored | DONE |
| 6 | README updated (14 agents, provider change) | DONE |
| 7 | Single commit: 174 files, +9,537/-670 | DONE |
| 8 | Tag: `pre-sprint-129-push` | DONE |
| 9 | Push to remote | AWAITING CEO |

---

## Verification

```bash
pnpm build                    # Clean
pnpm test                     # 7,601 pass, 0 fail, 10 skipped
git log --oneline -1          # 9128e22 feat(sprint-122-129): ...
git tag -l "pre-*"            # pre-sprint-129-push
git diff --cached --name-only | grep settings.local  # empty (not staged)
```

---

## References

- ADR-044: Agentic OS Alignment
- ADR-036: gstack Best Practices Adoption
- ADR-039: Research Artifacts Governance
- MTClaw Sprint 90-94 plan (CTO 9.4/10, all reviewers approved)
- SDLC Orchestrator V2 Sprint 9a-c plan (CTO approved, 6 hard conditions)
- Lam Nguyen, "Giai Phau Mot Agentic Operating System" (18 patterns)
