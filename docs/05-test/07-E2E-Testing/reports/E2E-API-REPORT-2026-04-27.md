# *-CyEyes-* E2E API Test Report

**Generated**: 2026-04-27T03:45:00Z
**Project**: EndiorBot
**Environment**: Local (macOS, port 18791)
**Tier**: STANDARD
**Coverage**: 3/9 REST endpoints reachable (33%)
**SDLC Framework**: 6.3.1

## Executive Summary

| Metric | Count | Percentage |
|--------|-------|------------|
| Total REST Endpoints (documented) | 9 | 100% |
| Passed (2xx) | 3 | 33% |
| Not Found (404) | 6 | 67% |
| Server Errors | 0 | 0% |

## CRITICAL FINDING — Sprint 135 Web API routes unreachable

**Root cause:** Sprint 135 T4 Web API endpoints (`/api/config`, `/api/audit/:type`, `POST /api/config/*`) were implemented in `src/gateway/web-server.ts`, but the actual gateway uses `src/gateway/server.ts` (via `createGatewayServer()`). The `web-server.ts` class is NOT instantiated by `endiorbot serve`.

**Impact:** All Sprint 135 Web API endpoints return 404. OTT commands (`/config`, `/audit`, `/exec-policy`) work because they route through CommandDispatcher, not HTTP. Desktop app (Sprint 136) would be unable to call these endpoints.

**Fix required:** Move Sprint 135 route handlers from `web-server.ts:329-458` to `server.ts:handleHttpRequest()`. ~130 LoC to relocate. Priority: P0 for Sprint 145.

## Detailed Results

| # | Method | Path | Status | Code | Time(ms) | Notes |
|---|--------|------|--------|------|----------|-------|
| 1 | GET | `/` | PASS | 200 | <5 | HTML page served |
| 2 | GET | `/api/status` | PASS | 200 | <5 | Bus metrics, uptime, version |
| 3 | GET | `/api/health` | PASS | 200 | <5 | `{"status":"healthy"}` |
| 4 | GET | `/api/config` | FAIL | 404 | <5 | **Route in wrong server file** |
| 5 | GET | `/api/audit/exec-policy` | FAIL | 404 | <5 | **Route in wrong server file** |
| 6 | GET | `/api/audit/ssrf` | FAIL | 404 | <5 | **Route in wrong server file** |
| 7 | GET | `/api/audit/webhooks` | FAIL | 404 | <5 | **Route in wrong server file** |
| 8 | POST | `/api/config/exec-policy/preset` | FAIL | 404 | <5 | **Route in wrong server file** |
| 9 | POST | `/api/config/active-memory` | FAIL | 404 | <5 | **Route in wrong server file** |

## JSON-RPC Surface

The JSON-RPC methods (47 registered per OpenAPI spec from Sprint 137) are accessible via WebSocket at `ws://127.0.0.1:18791/ws`. Not tested in this HTTP-only scan — requires WebSocket client.

## Gateway Port Discrepancy

Log says `Gateway started on http://127.0.0.1:18790` but actual listening port is **18791**. Likely off-by-one between web gateway and JSON-RPC gateway. Log message misleading.

## Tier Exit Criteria Check

| Criterion | Required (STANDARD) | Actual | Status |
|-----------|---------------------|--------|--------|
| E2E endpoint coverage | 90%+ | 33% | **FAIL** |
| OWASP coverage | API1-6 | Not testable (routes 404) | **FAIL** |
| Report freshness | Within 14 days | Today | PASS |

## Recommended Fix Priority

1. **P0:** Move Sprint 135 routes from `web-server.ts` → `server.ts` (handleHttpRequest)
2. **P1:** Fix gateway port log message (cosmetic but confusing)
3. **P1:** Add E2E smoke test asserting all documented endpoints return non-404

## Cross-Reference

- **OpenAPI Spec**: [openapi.json](../../03-integrate/02-API-Specifications/openapi.json)
- **Sprint 135 Implementation**: `src/gateway/web-server.ts:329-458` (unreachable routes)
- **Actual Gateway**: `src/gateway/server.ts:550-622` (missing routes)

---

*EndiorBot | E2E API Test Report | Sprint 144 | *-CyEyes-* marker*
