# Sprint 50 Requirements - Composio Integration Phase 1

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: APPROVED
**Authority**: CTO
**Stage**: 01 - DEFINE
**Related**: Sprint 50 Plan, ADR-011, TOOL-POLICY.md
**SDLC**: Framework 6.1.1

---

## Overview

This document defines functional and non-functional requirements for **Composio Integration Phase 1**, establishing the security-first foundation for external tool execution in EndiorBot.

---

## Business Requirements

### BR-1: Action Execution Capability
**Priority**: P0
**Description**: EndiorBot must transform from "advisor" to "executor" by enabling real-world actions through external tools.
**Success Criteria**: CEO can execute real GitHub, Gmail, Calendar, Slack operations through EndiorBot
**Stakeholder**: CEO

### BR-2: Security-First Architecture
**Priority**: P0
**Description**: All tool executions must be subject to policy-based approval to prevent unauthorized or destructive actions.
**Success Criteria**: 0 unauthorized tool executions possible; all WRITE/DESTRUCTIVE tools require CEO approval
**Stakeholder**: CTO, Security Team

### BR-3: Audit Trail
**Priority**: P0
**Description**: All tool executions must be logged for compliance and debugging.
**Success Criteria**: 100% tool executions logged with principal_id, tool_name, result, timestamp
**Stakeholder**: CTO, Compliance

---

## Functional Requirements

### FR-1: Tool Discovery
**Priority**: P0
**Description**: Users must be able to list available tools for their principal account.
**Acceptance Criteria**:
- Gateway method `tools.discover` returns list of available tools
- Only 10 whitelisted tools visible (Phase 1 constraint)
- Tools filtered by principal's connected accounts

**API**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.discover",
  "params": {
    "principal_id": "uuid-123",
    "apps": ["github", "gmail"]
  },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      { "name": "github.get_repo", "risk": "READ", "description": "..." },
      { "name": "github.create_issue", "risk": "WRITE", "description": "..." }
    ],
    "total": 3
  },
  "id": 1
}
```

### FR-2: Tool Execution (READ Tools)
**Priority**: P0
**Description**: READ-classified tools must execute automatically without approval.
**Acceptance Criteria**:
- Gateway method `tools.execute` auto-executes READ tools
- No approval token required for READ tools
- Result returned immediately

**Example**: `github.get_repo`, `gmail.list_messages`, `slack.list_channels`

### FR-3: Tool Execution (WRITE/DESTRUCTIVE Tools)
**Priority**: P0
**Description**: WRITE/DESTRUCTIVE tools must require approval before execution.
**Acceptance Criteria**:
- Gateway method `tools.execute` returns `pending_approval` status
- Approval token generated with 5-minute expiry
- Token is one-time use
- Execution blocked until approval

**Example**: `github.create_issue`, `gmail.send_message`, `shell.execute_command`

### FR-4: Approval Workflow
**Priority**: P0
**Description**: CEO must be able to approve pending tool executions.
**Acceptance Criteria**:
- Gateway method `tools.approve` accepts approval token
- Token validated (not expired, not used, matches principal)
- Tool executed after validation
- Approval token marked as used

### FR-5: OAuth Connection
**Priority**: P0
**Description**: Users must connect external accounts (GitHub, Gmail, etc.) via OAuth.
**Acceptance Criteria**:
- Device Code Flow supported
- User redirected to provider authorization page
- Connection stored in `composio_connections` table
- Connection status: pending → active

### FR-6: Connection Management
**Priority**: P1
**Description**: Users must view and disconnect OAuth connections.
**Acceptance Criteria**:
- Gateway method `tools.connections` lists all connections
- Gateway method `tools.disconnect` removes connection
- Disconnected tools unavailable for execution

### FR-7: Dry-Run Simulation
**Priority**: P1 (Expert 9 recommendation)
**Description**: Users must simulate tool execution without side effects.
**Acceptance Criteria**:
- Gateway method `tools.dry-run` validates input
- Returns risk classification
- Returns approval requirement
- Does NOT execute tool

### FR-8: Brain Event Tracking
**Priority**: P0
**Description**: All tool executions must be tracked in Brain Layer 1.
**Acceptance Criteria**:
- Event type `tool_execution` recorded
- Fields: `tool_name`, `principal_id` (UUID), `success`, `duration`, `provider`
- NO secrets stored (only hashed inputs, truncated outputs)

---

## Non-Functional Requirements

### NFR-1: Performance
**Priority**: P0
**Target**:
- `tools.discover` < 300ms (cached)
- `tools.execute` (READ) < 1000ms
- `tools.execute` (WRITE) < 100ms (pending approval response)
- `tools.approve` < 1500ms (execution + logging)

### NFR-2: Security
**Priority**: P0
**Constraints**:
- ToolControlPlane trust boundary enforced
- No tool execution without policy evaluation
- Input validation with zod schemas
- SQL injection, XSS, path traversal patterns blocked
- OAuth tokens stored in Composio/keychain (NOT Brain)
- Principal UUID mapping (NOT email)

### NFR-3: Reliability
**Priority**: P0
**Constraints**:
- Approval tokens expire after 5 minutes (prevent stale approvals)
- One-time use tokens (prevent replay attacks)
- Idempotency keys prevent duplicate execution
- Connection scoping validated (principal owns connection)

### NFR-4: Scalability
**Priority**: P1
**Constraints**:
- Rate limiting: 10 req/min per tool
- Rate limiting: 30 req/min per principal
- Rate limiting: 5 destructive operations per hour
- Circuit breaker at 80% limit

### NFR-5: Maintainability
**Priority**: P1
**Constraints**:
- Composio SDK version pinned to `0.6.3` (exact)
- 80%+ test coverage for `src/tools/` module
- All public APIs documented with JSDoc
- ADR-011 and TOOL-POLICY.md maintained

### NFR-6: Compatibility
**Priority**: P0
**Constraints**:
- EndiorBot runs without COMPOSIO_API_KEY (graceful degradation)
- All 3,171+ existing tests must pass (regression-free)
- No breaking changes to Gateway protocol

---

## Tool-Specific Requirements

### GitHub Tools (3 tools)

#### TR-1: github.get_repo
- **Risk**: READ
- **Approval**: Not required
- **Input**: owner (max 39 chars), repo (max 100 chars)
- **Validation**: Alphanumeric + hyphens only
- **Rate Limit**: 10 req/min

#### TR-2: github.get_issue
- **Risk**: READ
- **Approval**: Not required
- **Input**: owner, repo, issue_number (positive integer)
- **Rate Limit**: 10 req/min

#### TR-3: github.create_issue
- **Risk**: WRITE
- **Approval**: Required (5min expiry token)
- **Input**: owner, repo, title (max 256), body (max 64KB), labels (max 10, each max 50 chars)
- **Validation**: HTML sanitization, XSS pattern blocking
- **Rate Limit**: 5 req/min

### Gmail Tools (2 tools)

#### TR-4: gmail.list_messages
- **Risk**: READ
- **Approval**: Not required
- **Input**: max_results (default 10, max 100), query (max 512 chars)
- **Rate Limit**: 10 req/min

#### TR-5: gmail.send_message
- **Risk**: WRITE
- **Approval**: Required
- **Input**: to (valid email, max 254), subject (max 256), body (max 100KB)
- **Validation**: RFC 5322 email validation, HTML sanitization
- **Rate Limit**: 3 req/min (prevent spam)

### Google Calendar Tools (2 tools)

#### TR-6: google_calendar.list_events
- **Risk**: READ
- **Approval**: Not required
- **Input**: calendar_id (default 'primary'), time_min (ISO8601), time_max (ISO8601)
- **Rate Limit**: 10 req/min

#### TR-7: google_calendar.create_event
- **Risk**: WRITE
- **Approval**: Required
- **Input**: summary (max 256), start (ISO8601), end (ISO8601), attendees (max 50)
- **Validation**: ISO8601 date format, end > start
- **Rate Limit**: 5 req/min

### Slack Tools (2 tools)

#### TR-8: slack.list_channels
- **Risk**: READ
- **Approval**: Not required
- **Input**: exclude_archived (bool), limit (max 1000)
- **Rate Limit**: 10 req/min

#### TR-9: slack.send_message
- **Risk**: WRITE
- **Approval**: Required
- **Input**: channel (ID or name), text (max 40KB)
- **Validation**: Block @channel/@here/@everyone (prevent mass pings)
- **Rate Limit**: 3 req/min (Slack limit)

### Shell Tool (1 tool)

#### TR-10: shell.execute_command
- **Risk**: DESTRUCTIVE
- **Approval**: Required + additional warning
- **Input**: command (max 1KB), cwd (within project dir), timeout (max 300s)
- **Validation**: Command whitelist (ls, cat, grep, git, npm, pnpm only), denylist (rm -rf, sudo, curl | sh)
- **Sandbox**: Read-only filesystem, no network access
- **Rate Limit**: 2 req/min (very restrictive)

---

## Constraints

### C-1: Scope Constraint (Phase 1)
**Phase 1 does NOT include**:
- Provider integration (no BaseProvider.chat extension)
- ToolAwareOrchestrator
- Evaluator toolEffectiveness dimension
- Mental models for tool preferences
- CEO approval via OTT channels (manual approval only)
- Brain Layer 2 pattern recognition

**Rationale**: Security-first foundation must be solid before AI-driven automation.

### C-2: Tool Whitelist Constraint
**Phase 1 allows ONLY 10 tools** (see TOOL-POLICY.md):
- github.get_repo, github.get_issue, github.create_issue
- gmail.list_messages, gmail.send_message
- google_calendar.list_events, google_calendar.create_event
- slack.list_channels, slack.send_message
- shell.execute_command

**Rationale**: Curated set prevents LLM context bloat and maintains control.

### C-3: No Secrets in Brain Constraint
**Brain stores ONLY**: events (hashed inputs, truncated outputs), patterns, mental models
**Brain does NOT store**: OAuth tokens, API keys, credentials, PII

**Rationale**: Brain is a learning system, not a secret vault. Tokens go to Composio/keychain.

### C-4: Principal UUID Constraint
**All tool operations use `principal_id` (UUID)**, NOT email or username.

**Rationale**: Email changes over time, UUID is stable and unique.

---

## Acceptance Criteria (Sprint 50 Complete)

### AC-1: Functional Completeness
- [ ] All 10 tools discoverable via `tools.discover`
- [ ] READ tools (5 tools) auto-execute
- [ ] WRITE/DESTRUCTIVE tools (5 tools) require approval
- [ ] Approval workflow functional (token generation, validation, execution)
- [ ] OAuth connection successful for GitHub and Gmail

### AC-2: Security Validation
- [ ] 0 unauthorized tool executions possible
- [ ] 100% tool calls validated with zod schemas
- [ ] 100% tool executions logged in audit trail
- [ ] No secrets stored in Brain
- [ ] Connection scoping enforced (principal owns connection)

### AC-3: Quality Assurance
- [ ] All 3,171+ existing tests pass
- [ ] 30+ new tool security tests pass
- [ ] Test coverage > 80% for `src/tools/` module
- [ ] No regressions in existing functionality

### AC-4: Documentation
- [ ] ADR-011 Composio Integration complete ✅
- [ ] TOOL-POLICY.md complete ✅
- [ ] `tools-integration.md` user guide complete
- [ ] Configuration reference updated

### AC-5: Performance
- [ ] `tools.discover` responds < 300ms
- [ ] `tools.execute` (READ) responds < 1000ms
- [ ] Gateway methods handle 30 req/min per principal

### AC-6: Production Readiness
- [ ] EndiorBot runs without COMPOSIO_API_KEY
- [ ] Manual OAuth flow tested end-to-end
- [ ] G-Sprint-50 gate evaluation PASS

---

## Out of Scope (Phase 2)

The following requirements are **deferred to Sprint 52 (Phase 2)**:

- **R-Phase2-1**: Provider integration with ToolAwareOrchestrator
- **R-Phase2-2**: Evaluator toolEffectiveness dimension (5% weight)
- **R-Phase2-3**: CEO approval via OTT channels (Telegram/Zalo)
- **R-Phase2-4**: Mental models for tool auto-approval
- **R-Phase2-5**: Brain Layer 2 pattern recognition
- **R-Phase2-6**: Multi-model tool routing

---

## Dependencies

### External Dependencies
- Composio SDK v0.6.3 (exact version)
- OAuth providers: GitHub, Gmail, Google Calendar, Slack

### Internal Dependencies
- Sprint 49 complete (Production Hardening)
- Gateway WebSocket server operational
- Brain Layer 1 (`src/brain/layers/events.ts`)
- Secrets management (keytar + environment variables)
- Database (PostgreSQL or equivalent for `composio_connections` table)

---

## Risks & Mitigations

| Risk ID | Risk | Probability | Impact | Mitigation |
|---------|------|-------------|--------|------------|
| R-1 | Composio API breaking changes | Medium | High | Pin exact version 0.6.3, monitor changelog |
| R-2 | OAuth flow user friction | Low | Medium | Device Code Flow simplifies UX |
| R-3 | Rate limit exhaustion | Low | Medium | Circuit breaker + rate limits per TOOL-POLICY.md |
| R-4 | Security vulnerability | Low | Critical | 30+ security tests, input validation, approval system |
| R-5 | Tool execution failures | Medium | Medium | Dry-run mode, error handling, retry logic |

---

## References

- ADR-011: Composio Integration
- TOOL-POLICY.md: 10 Curated Tools + Risk Matrix
- Sprint 50 Plan: Day-by-day implementation
- Expert 8 (Security-First SDLC): P0 Security Requirements
- Expert 9 (System Architect): Dry-run mode requirement
- CTO Review: Conditional approval (all fixes applied)

---

**Status**: APPROVED - Ready for Implementation
**Next Review**: G-Sprint-50 Gate Evaluation
**Owner**: PM + Architect

*SDLC Framework 6.1.1*
*Stage 01 - DEFINE*
