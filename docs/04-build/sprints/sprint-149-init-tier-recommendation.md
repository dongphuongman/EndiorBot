# Sprint 149 — Init Tier Auto-Recommendation

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| **Date**    | 2026-05-20                             |
| **Goal**    | `endiorbot init` scans project and recommends correct tier |
| **ADR**     | ADR-054                                |
| **Status**  | COMPLETE                               |

## Problem

`endiorbot init` defaults to STANDARD tier for all projects. VatDownload (5 Python
files) gets over-scaffolded with 7 stages + 6 agents.

## Deliverables

### D1: Tier Recommender Module
- `src/sdlc/scaffold/tier-recommender.ts`
- 7 signals: source files, tests, CI/CD, deps, monorepo, team, compliance
- Weighted score → tier mapping
- Fast FS scan (depth-limited, skip node_modules etc.)

### D2: Init Command Integration
- Remove hardcoded `"STANDARD"` default from `--tier` CLI option
- New priority: explicit > config/docs > recommended > fallback LITE
- Display recommendation reason in CLI output

### D3: Test Coverage
- `tests/sdlc/scaffold/tier-recommender.test.ts`
- Signal collection tests (mock FS)
- Score computation tests
- Integration: verify VatDownload-like project → LITE

## Acceptance Criteria

- [x] `endiorbot init` on a 5-file Python project → recommends LITE
- [x] `endiorbot init --tier STANDARD` still forces STANDARD
- [x] Existing projects with .sdlc-config.json → use config tier (unchanged)
- [x] CLI displays recommendation reason
- [x] All existing tests pass (18 new tests, 18/18 pass)
- [x] Build succeeds
