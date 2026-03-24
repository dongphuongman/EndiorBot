# Sprint 117: Ship to Production

**Sprint Duration**: March 22, 2026
**Sprint Goal**: Make EndiorBot installable via `npx endiorbot`, containerized, CI/CD-enabled, OSS-ready
**Status**: COMPLETE
**Priority**: P0 (Ship Readiness)
**Framework**: SDLC 6.2.0
**Authority**: PM Plan + CPO APPROVED (with 5 adjustments)
**Previous Sprint**: Sprint 116 COMPLETE — P0 Security & Code Health (48% → 70-75% compliance)
**CPO Review**: APPROVED WITH MINOR ADJUSTMENTS
**Tests**: +11 new (6,593 cumulative), 3 pre-existing failures (unchanged from Sprint 116)

---

## Background

Sprint 116 fixed all P0 security blockers (command injection, fake endpoints, wildcard CORS, layer violations). Foundation is now clean. CEO's vision: EndiorBot as publishable product for solo entrepreneurs/devs.

**Goal**: Compliance 70-75% → ~85%. Ship infrastructure + security hardening + OSS distribution.

### Key Findings (Pre-Sprint)

| Finding | Status |
|---------|--------|
| No CI/CD pipeline (`.github/workflows/` empty) | To fix |
| No LICENSE file (`package.json` says UNLICENSED) | To fix |
| Missing `files`/`publishConfig` in package.json | To fix |
| Missing security headers (CSP, X-Frame-Options, etc.) | To fix |
| No Dockerfile | To fix |
| FRAMEWORK_VERSION still '6.1.1' in src/index.ts | To fix |
| npm package name "endiorbot" available | Confirmed |
| `.env.example` already exists (104 lines) | OK |

---

## CPO Adjustments (Incorporated)

1. **HSTS**: Only behind HTTPS reverse proxy — skip for localhost
2. **npm publish safety**: Add `npm pack --dry-run` before publish in CI
3. **License**: MIT for now; CEO/CTO to finalize dual-track before actual public publish
4. **Rate limiting scope**: Exclude `/health` and `/api/health` endpoints
5. **Test baseline**: Separate Sprint 117 new tests from pre-existing failures

---

## Track A: Ship Infrastructure

### A1: Fix FRAMEWORK_VERSION (src/index.ts)

**Change**: `'6.1.1'` → `'6.2.0'` at line 214

### A2: Configure package.json for npm Publishing

**Changes**:
- `files: ["dist/", "endiorbot.mjs", ".env.example", "README.md", "LICENSE"]`
- `publishConfig: { "access": "public" }`
- `license: "MIT"`
- Verify `bin`, `engines` fields

### A3: GitHub Actions CI Pipeline

**File**: `.github/workflows/ci.yml`
- Triggers: push to main, all PRs
- Jobs: install → build → test → lint

### A4: GitHub Actions npm Publish Workflow

**File**: `.github/workflows/publish.yml`
- Trigger: GitHub Release created
- Includes `npm pack --dry-run` safety check (CPO adjustment #2)

### A5: Dockerfile (Multi-stage Alpine)

**Files**: `Dockerfile`, `.dockerignore`
- Stage 1: Build (node:20-alpine, pnpm)
- Stage 2: Runtime (non-root user, ~150MB)
- Exposes port 18790

### A6: vitest.e2e.config.ts

- Separate config for e2e tests with longer timeouts
- Referenced in `package.json` scripts but missing

---

## Track B: Security Hardening

### B1: Security Headers on HTTP Responses

**File**: `src/gateway/server.ts`
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- Content-Security-Policy: default-src 'self' (unsafe-inline for now, backlog to tighten)
- No HSTS on localhost (CPO adjustment #1)

### B2: HTTP Rate Limiting Middleware

**File**: `src/gateway/server.ts`
**Reuses**: `src/security/rate-limiter.ts` (Sprint 116 T7)
- 100 req/min per IP
- Excludes `/api/health` (CPO adjustment #4)
- Returns 429 Too Many Requests

### B3: Security Header + Rate Limit Tests

**File**: `tests/gateway/security-headers.test.ts`
- Verify all security headers present
- Verify rate limiting returns 429
- Verify health endpoint exempt from rate limiting

---

## Track C: OSS Distribution

### C1: MIT LICENSE File

**File**: `LICENSE`
- Standard MIT license text
- Note: CEO/CTO final decision on dual-track licensing before public publish (CPO adjustment #3)

### C2: CONTRIBUTING.md

Setup instructions, PR process, code style, testing requirements.

### C3: CHANGELOG.md

Keep a Changelog format documenting Sprint 116 + 117 changes.

### C4: README.md Update

Add badges (CI, npm version), npx install instructions, Docker usage.

### C5: Sprint Documentation

This file.

---

## Sprint Structure

| # | Task | Track | Priority | Est. |
|---|------|-------|----------|------|
| A1 | Fix FRAMEWORK_VERSION 6.1.1 → 6.2.0 | A | P0 | 5min |
| A2 | Configure package.json for npm | A | P0 | 15min |
| A3 | GitHub Actions CI pipeline | A | P0 | 30min |
| A4 | GitHub Actions npm publish workflow | A | P1 | 20min |
| A5 | Dockerfile (multi-stage Alpine) | A | P1 | 30min |
| A6 | Create vitest.e2e.config.ts | A | P1 | 10min |
| B1 | Security headers on HTTP responses | B | P0 | 30min |
| B2 | HTTP rate limiting middleware | B | P1 | 30min |
| B3 | Security header + rate limit tests | B | P1 | 30min |
| C1 | Add MIT LICENSE | C | P0 | 5min |
| C2 | Add CONTRIBUTING.md | C | P1 | 20min |
| C3 | Add CHANGELOG.md | C | P1 | 15min |
| C4 | Update README.md | C | P1 | 30min |
| C5 | Sprint documentation | C | P1 | 15min |

**P0 total**: ~1.5h | **P1 total**: ~3.5h | **Grand total**: ~5h

---

## Verification Plan

```bash
# Build + test pass
pnpm build && pnpm test

# Verify FRAMEWORK_VERSION
grep "FRAMEWORK_VERSION" src/index.ts  # → '6.2.0'

# Verify package.json config
node -e "const p=require('./package.json'); console.log(p.files, p.license, p.publishConfig)"

# Verify security headers
grep -n "X-Content-Type-Options\|X-Frame-Options\|Referrer-Policy" src/gateway/server.ts

# npm pack dry-run
npm pack --dry-run

# Docker build
docker build -t endiorbot:test .

# Security header tests
pnpm test tests/gateway/security-headers.test.ts
```

---

## Expected Outcome

| Metric | Before (Sprint 116) | After (Sprint 117) |
|--------|---------------------|-------------------|
| CI/CD pipeline | None | GitHub Actions (build+test+publish) |
| npm installable | No | `npx endiorbot` works |
| Docker image | None | Multi-stage Alpine ~150MB |
| Security headers | Partial (2) | Full (5+) |
| HTTP rate limiting | None | 100 req/min per IP |
| LICENSE | UNLICENSED | MIT |
| FRAMEWORK_VERSION | 6.1.1 | 6.2.0 |
| OSS docs | Minimal | CONTRIBUTING, CHANGELOG, improved README |
| **Compliance estimate** | **70-75%** | **~85%** |

---

## Deferred to Sprint 118

| Feature | Rationale |
|---------|-----------|
| Stricter CSP (remove unsafe-inline) | Backlog per CPO — tighten incrementally |
| HSTS header | Enable behind HTTPS reverse proxy |
| Observability (Prometheus metrics) | Post-ship monitoring |
| Release cadence & versioning | After first public release |
| Admin Web UI (Settings tab) | Build on shipped foundation |
