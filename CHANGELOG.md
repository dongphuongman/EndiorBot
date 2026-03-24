# Changelog

All notable changes to EndiorBot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0-beta.1] - 2026-03-23

### Added
- GitHub Actions CI pipeline (build + test on Node 20/22)
- GitHub Actions npm publish workflow (on release)
- Dockerfile with multi-stage Alpine build (~150MB)
- Security headers on all HTTP responses (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- HTTP rate limiting (100 req/min per IP, health endpoint exempt)
- MIT LICENSE file
- CONTRIBUTING.md with DCO policy
- SECURITY.md with vulnerability disclosure policy
- EXEC_ALLOWLIST.md documenting all shell execution calls
- GitHub PR template and issue templates (bug report, feature request)
- vitest.e2e.config.ts for integration tests
- npm publishing configuration (files, publishConfig)

### Changed
- FRAMEWORK_VERSION updated from 6.1.1 to 6.2.0
- License changed from UNLICENSED to MIT
- Node.js engine requirement relaxed from >=22 to >=20
- Version bumped from 1.0.0 to 0.1.0-beta.1 (semver-correct for beta)

### Security
- **CRITICAL**: Fixed 14 command injection sites in git-automation.ts — replaced `execSync` template strings with `execFileSync` argument arrays (Sprint 116)
- **CRITICAL**: Fixed 13 additional command injection sites across 6 files — all interpolated `execSync` converted to `execFileSync` with argument arrays (Sprint 118)
- Removed `simulateConsultation()` fake production endpoint — returns 501 (Sprint 116)
- Replaced wildcard CORS (`*`) with configurable origins (Sprint 116)
- Added input sanitization on gateway ingress paths (Sprint 116)
- Extracted RateLimiter from gateway to shared security module — fixed 5 layer violations (Sprint 116)
- Added Zod env validation at serve startup (Sprint 116)

### Fixed
- Gateway WebSocket tests: fixed missing `/ws` path in URLs (Sprint 116)
- Split 2088-line handlers.ts into 8 domain-specific files (Sprint 116)
- Updated .sdlc-config.json gates to reflect actual compliance (G0.1, G1, G2 passed)
- Fixed `sanitizeForEcho` URL stripping — handles markdown links, http(s) and www. URLs (Sprint 118)
- Fixed SOUL version test expectation: 6.1.2 → 6.2.0 (Sprint 118)
- Fixed code-search e2e glob API mismatch: `globs` array → `glob` string (Sprint 118)

## [1.0.0] - 2026-03-22

### Added
- Initial release
- 4-channel support: Web, Telegram, Zalo, CLI
- 13 SOUL-based agents with tier-aware model selection
- 30 unified OTT commands
- SDLC Framework 6.2.0 integration (LITE/STANDARD/PROFESSIONAL/ENTERPRISE)
- Per-chat workspace resolution (ADR-029)
- Claude Code Bridge with tmux session management
- MessageBus with debounce and dedup
- Multi-agent dispatcher with goal decomposition
- 6,500+ tests passing
