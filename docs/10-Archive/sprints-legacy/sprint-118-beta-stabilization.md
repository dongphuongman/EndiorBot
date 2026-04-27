# Sprint 118 — Beta Stabilization + Public Readiness

**Date:** 2026-03-23
**Status:** COMPLETE
**Prerequisite:** Sprint 117 COMPLETE (CI/CD, Docker, security headers, OSS docs)
**CEO Decision:** Option B — Public repo + npm `0.x-beta`

## Context

CEO approved Option B for OSS release. CPO defined 4 mandatory gates (Security, Quality, Legal, Product Messaging). CTO review corrected false AGPL claim — `@composio/core` is ISC/MIT, not AGPL-3.0. Sprint scope adjusted accordingly.

## Gate Results

| Gate | Status | Details |
|------|--------|---------|
| Security | PASS | 0 interpolated `execSync` remaining, SECURITY.md published, EXEC_ALLOWLIST.md complete |
| Quality | PASS | 6595 tests passing (+2), 0 new failures, 3 pre-existing bugs fixed |
| Legal | PASS | 0 AGPL/GPL in dependency tree, LICENSE-AUDIT.md confirms all-clear |
| Product | PASS | Version 0.1.0-beta.1 consistent across 5 files, README has beta disclaimer + Known Limitations |

## Deliverables

### Gate 1: Security
- **T1.1:** Fixed 13 interpolated `execSync` calls across 6 files → `execFileSync` with argument arrays
- **T1.2:** Created `SECURITY.md` with disclosure policy and response timeline
- **EXEC_ALLOWLIST.md:** Complete inventory of all 39 `exec*` calls in `src/` with risk assessment

### Gate 2: Quality
- **T2.1:** Fixed `sanitizeForEcho` — now strips markdown links, http(s) URLs, and www. URLs
- **T2.2:** Fixed SOUL version test: `6.1.2` → `6.2.0` (Sprint 112 bump)
- **T2.3:** Fixed code-search e2e glob API: `globs` array → `glob` string
- **T2.4:** Full regression: 6595 tests passing, 1 pre-existing EADDRINUSE port conflict (not Sprint 118)
- Fixed CLI smoke test regex to support semver pre-release suffix

### Gate 3: Legal
- **T3.1:** DROPPED — CTO audit confirmed `@composio/core` is ISC/MIT, not AGPL-3.0
- **T3.2:** License audit: `npx license-checker --failOn AGPL/GPL` — PASS (0 copyleft)
- **T3.3:** Added DCO section to CONTRIBUTING.md (CLI + GitHub UI guidance)
- **T3.4:** Created GitHub templates: PR template, bug report, feature request

### Gate 4: Product Messaging
- **T4.1:** Version bump `1.0.0` → `0.1.0-beta.1` across 5 locations
- **T4.2:** README: added beta disclaimer, Prerequisites, Known Limitations, removed internal jargon
- **T4.3:** CHANGELOG: moved Unreleased → 0.1.0-beta.1, added Sprint 118 entries
- **T4.4:** Package description: added "(beta)" suffix

## Files Changed

| File | Action |
|------|--------|
| `src/context/git-context.ts` | 7 `execSync` → `execFileSync` |
| `src/skills/skill-loader.ts` | 1 `execSync` → `execFileSync` |
| `src/agents/context/project-verifier.ts` | 1 `execSync` → `execFileSync` |
| `src/agents/intelligence/workspace-context.ts` | 1 `execSync` → `execFileSync` |
| `src/cli/commands/evidence.ts` | 1 `execSync` → `execFileSync` |
| `src/cli/commands/sprint-close.ts` | 2 `execSync` → `execFileSync` |
| `src/commands/handlers/shared.ts` | `sanitizeForEcho` URL stripping |
| `package.json` | Version, description, files array |
| `src/index.ts` | VERSION constant |
| `src/cli/index.ts` | VERSION constant |
| `src/cli/commands/shell.ts` | VERSION constant |
| `src/sdlc/vibecoding/baseline.ts` | VERSION constant |
| `README.md` | Beta cleanup |
| `CHANGELOG.md` | 0.1.0-beta.1 release |
| `CONTRIBUTING.md` | DCO section |
| `SECURITY.md` | New |
| `docs/08-collaborate/EXEC_ALLOWLIST.md` | New |
| `docs/08-collaborate/LICENSE-AUDIT.md` | New |
| `.github/PULL_REQUEST_TEMPLATE.md` | New |
| `.github/ISSUE_TEMPLATE/bug_report.md` | New |
| `.github/ISSUE_TEMPLATE/feature_request.md` | New |
| `tests/agents/intelligence/workspace-context.test.ts` | Mock updated for `execFileSync` |
| `tests/integration/sprint-99-workspace-channel.test.ts` | Version expectation fix |
| `tests/e2e/code-search.e2e.test.ts` | Glob API fix |
| `tests/cli/cli-smoke.test.ts` | Semver pre-release regex |

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Interpolated `execSync` sites | 13 | 0 |
| Test failures (Sprint 118 related) | 4 | 0 |
| AGPL dependencies | 0 (false alarm) | 0 (confirmed) |
| Tests passing | 6593 | 6595 (+2) |
| Version | 1.0.0 | 0.1.0-beta.1 |

## Next Steps

- CTO sign-off on Sprint 118 deliverables
- CPO go/no-go for `npm publish --tag beta`
- Generate Go/No-Go Gate Report (1 page) for CEO publish decision
