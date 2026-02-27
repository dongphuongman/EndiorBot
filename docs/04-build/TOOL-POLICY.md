# Tool Policy - Composio Integration

**Date**: 2026-02-25
**Status**: LOCKED - Required for CTO Sign-Off
**Authority**: Expert 8, Expert 9, CTO Review
**Phase**: Sprint 50/51 (Phase 1)

---

## Overview

This document defines the **10 curated tools** approved for Composio integration in Sprint 50 (Phase 1), along with security policies, risk classifications, and execution constraints.

**Key Principles**:
1. **Curated Whitelist**: Only 10 tools in Phase 1 (not 500+)
2. **Policy-Based Approval**: READ auto-allowed, WRITE/DESTRUCTIVE require CEO approval
3. **Principal-Based**: All tools scoped to `principal_id` (UUID, not email)
4. **No Secrets in Brain**: OAuth tokens in Composio/keychain only
5. **Audit Trail**: 100% tool executions logged

---

## 10 Curated Tools (Phase 1)

### GitHub (3 tools)

#### 1. `github.get_repo`
- **Risk**: READ
- **Approval**: Auto-allowed
- **Description**: Get repository information
- **Arguments**:
  - `owner` (string, required, max 39 chars, alphanumeric + hyphens)
  - `repo` (string, required, max 100 chars, alphanumeric + hyphens/underscores)
- **Rate Limit**: 10 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 1KB
  allowlistFields: ['owner', 'repo']
  deniedPatterns: ['../', '..\\', 'file://']
  ```

#### 2. `github.get_issue`
- **Risk**: READ
- **Approval**: Auto-allowed
- **Description**: Get issue details
- **Arguments**:
  - `owner` (string, required, max 39 chars)
  - `repo` (string, required, max 100 chars)
  - `issue_number` (number, required, positive integer)
- **Rate Limit**: 10 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 1KB
  allowlistFields: ['owner', 'repo', 'issue_number']
  ```

#### 3. `github.create_issue`
- **Risk**: WRITE
- **Approval**: Require CEO approval (5min expiry token)
- **Description**: Create new issue
- **Arguments**:
  - `owner` (string, required, max 39 chars)
  - `repo` (string, required, max 100 chars)
  - `title` (string, required, max 256 chars)
  - `body` (string, optional, max 64KB)
  - `labels` (array of strings, optional, max 10 items, each max 50 chars)
- **Rate Limit**: 5 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 64KB
  allowlistFields: ['owner', 'repo', 'title', 'body', 'labels', 'assignees']
  sanitizeHtml: true  // Strip <script>, dangerous HTML
  deniedPatterns: ['<script', 'javascript:', 'data:text/html']
  ```

---

### Gmail (2 tools)

#### 4. `gmail.list_messages`
- **Risk**: READ
- **Approval**: Auto-allowed
- **Description**: List recent messages
- **Arguments**:
  - `max_results` (number, optional, default 10, max 100)
  - `query` (string, optional, max 512 chars, Gmail search syntax)
- **Rate Limit**: 10 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 1KB
  allowlistFields: ['max_results', 'query', 'label_ids']
  ```

#### 5. `gmail.send_message`
- **Risk**: WRITE
- **Approval**: Require CEO approval
- **Description**: Send email message
- **Arguments**:
  - `to` (string, required, valid email, max 254 chars)
  - `subject` (string, required, max 256 chars)
  - `body` (string, required, max 100KB)
  - `cc` (string, optional, valid email)
  - `bcc` (string, optional, valid email)
- **Rate Limit**: 3 req/min per principal (prevent spam)
- **Validation**:
  ```typescript
  maxPayloadSize: 100KB
  allowlistFields: ['to', 'subject', 'body', 'cc', 'bcc', 'attachments']
  emailValidation: true  // RFC 5322 validation
  deniedPatterns: ['<script', 'javascript:', 'data:text/html']
  sanitizeHtml: true
  ```

---

### Google Calendar (2 tools)

#### 6. `google_calendar.list_events`
- **Risk**: READ
- **Approval**: Auto-allowed
- **Description**: List calendar events
- **Arguments**:
  - `calendar_id` (string, optional, default 'primary')
  - `time_min` (ISO8601 datetime, optional)
  - `time_max` (ISO8601 datetime, optional)
  - `max_results` (number, optional, default 10, max 100)
- **Rate Limit**: 10 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 1KB
  allowlistFields: ['calendar_id', 'time_min', 'time_max', 'max_results', 'q']
  dateValidation: true  // ISO8601 format
  ```

#### 7. `google_calendar.create_event`
- **Risk**: WRITE
- **Approval**: Require CEO approval
- **Description**: Create calendar event
- **Arguments**:
  - `calendar_id` (string, optional, default 'primary')
  - `summary` (string, required, max 256 chars)
  - `start` (ISO8601 datetime, required)
  - `end` (ISO8601 datetime, required)
  - `description` (string, optional, max 8KB)
  - `attendees` (array of emails, optional, max 50)
- **Rate Limit**: 5 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 10KB
  allowlistFields: ['calendar_id', 'summary', 'start', 'end', 'description', 'attendees', 'location']
  dateValidation: true
  emailValidation: true  // For attendees
  timeRangeCheck: true  // end > start
  ```

---

### Slack (2 tools)

#### 8. `slack.list_channels`
- **Risk**: READ
- **Approval**: Auto-allowed
- **Description**: List Slack channels
- **Arguments**:
  - `exclude_archived` (boolean, optional, default true)
  - `limit` (number, optional, default 100, max 1000)
- **Rate Limit**: 10 req/min per principal
- **Validation**:
  ```typescript
  maxPayloadSize: 512 bytes
  allowlistFields: ['exclude_archived', 'limit', 'types']
  ```

#### 9. `slack.send_message`
- **Risk**: WRITE
- **Approval**: Require CEO approval
- **Description**: Send Slack message
- **Arguments**:
  - `channel` (string, required, channel ID or name)
  - `text` (string, required, max 40KB)
  - `thread_ts` (string, optional, timestamp for threading)
- **Rate Limit**: 3 req/min per principal (Slack rate limit)
- **Validation**:
  ```typescript
  maxPayloadSize: 40KB
  allowlistFields: ['channel', 'text', 'thread_ts', 'blocks']
  deniedPatterns: ['@channel', '@here', '@everyone']  // Prevent mass pings without approval
  sanitizeMarkdown: true
  ```

---

### Shell (1 tool) - HIGH RISK

#### 10. `shell.execute_command`
- **Risk**: DESTRUCTIVE
- **Approval**: Require CEO approval + additional warning
- **Description**: Execute shell command (sandboxed)
- **Arguments**:
  - `command` (string, required, max 1KB)
  - `cwd` (string, optional, must be within project directory)
  - `timeout` (number, optional, default 30000ms, max 300000ms)
- **Rate Limit**: 2 req/min per principal (very restrictive)
- **Validation**:
  ```typescript
  maxPayloadSize: 1KB
  allowlistFields: ['command', 'cwd', 'timeout', 'env']

  // Command allowlist (explicit whitelist approach)
  allowedCommands: [
    'ls', 'cat', 'grep', 'find', 'echo', 'pwd',
    'git status', 'git log', 'git diff',
    'npm list', 'npm outdated',
    'pnpm list', 'pnpm outdated'
  ]

  // Command denylist (defense-in-depth)
  deniedPatterns: [
    'rm -rf', 'sudo', 'chmod +x', 'curl | sh',
    'wget | sh', '> /dev/', 'dd if=', 'mkfs',
    ':(){:|:&};:', 'fork bomb patterns',
    '/etc/passwd', '/etc/shadow'
  ]

  // Sandbox constraints
  cwdRestriction: true  // Must be within project directory
  networkAccess: false  // No network commands
  fileSystemAccess: 'readonly'  // Read-only by default
  ```

**Additional Warning**:
> ⚠️ **HIGH RISK TOOL**: Executing shell commands can modify system state, delete files, or cause security issues. CEO approval required with explicit confirmation of command intent.

---

## Risk Classification Matrix

| Risk Level | Auto-Execute | Approval Required | Rate Limit | Audit Level |
|------------|--------------|-------------------|------------|-------------|
| **READ** | ✅ Yes | ❌ No | 10/min | Standard |
| **WRITE** | ❌ No | ✅ CEO (5min token) | 5/min | Enhanced |
| **DESTRUCTIVE** | ❌ No | ✅ CEO + Warning | 2/min | Full |
| **MONEY** | ❌ No | ✅ CEO + 2FA | 1/min | Full |
| **ADMIN** | ❌ No | ✅ CEO + 2FA | 1/min | Full |

**Risk Assignment**:
- **READ**: Tools 1, 2, 4, 6, 8 (5 tools)
- **WRITE**: Tools 3, 5, 7, 9 (4 tools)
- **DESTRUCTIVE**: Tool 10 (1 tool)
- **MONEY**: None in Phase 1 (reserved for Phase 2+)
- **ADMIN**: None in Phase 1 (reserved for Phase 2+)

---

## Approval Flow

### READ Tools (Auto-Allowed)
```
Provider.chat() → tool_calls: [github.get_repo]
                        ↓
ToolControlPlane.evaluate() → risk=READ → ALLOW
                        ↓
ToolExecutor.execute() → Composio → GitHub API
                        ↓
Brain.recordEvent() → Layer 1
```

### WRITE/DESTRUCTIVE Tools (Approval Required)
```
Provider.chat() → tool_calls: [github.create_issue]
                        ↓
ToolControlPlane.evaluate() → risk=WRITE → REQUIRE_APPROVAL
                        ↓
ApprovalQueue.enqueue() → approval_token (5min expiry)
                        ↓
OTT Channel (Telegram/Zalo) → CEO notification
                        ↓
CEO approves → /approve <token>
                        ↓
ApprovalQueue.validate() → check token, expiry, principal
                        ↓
ToolExecutor.execute() → Composio → GitHub API
                        ↓
Brain.recordEvent() → Layer 1
                        ↓
OTT Channel → Result notification
```

---

## Rate Limits

### Per-Tool Limits
| Tool | Limit | Window | Reason |
|------|-------|--------|--------|
| github.get_repo | 10 | 1 min | GitHub API limit |
| github.get_issue | 10 | 1 min | GitHub API limit |
| github.create_issue | 5 | 1 min | Prevent spam |
| gmail.list_messages | 10 | 1 min | Gmail API limit |
| gmail.send_message | 3 | 1 min | Prevent spam |
| google_calendar.list_events | 10 | 1 min | Calendar API limit |
| google_calendar.create_event | 5 | 1 min | Prevent spam |
| slack.list_channels | 10 | 1 min | Slack API limit |
| slack.send_message | 3 | 1 min | Slack rate limit |
| shell.execute_command | 2 | 1 min | Safety |

### Global Limits (Per Principal)
- **Total tool calls**: 30/min (across all tools)
- **WRITE operations**: 10/min
- **DESTRUCTIVE operations**: 5/hour

### Circuit Breaker
- **50% limit**: Warning logged
- **80% limit**: CEO notified via OTT
- **100% limit**: Tool execution paused for 5 minutes

---

## Security Constraints

### 1. Input Validation (All Tools)
```typescript
interface ToolInputGuard {
  maxPayloadSize: number;         // Max input size
  allowlistFields: string[];      // Only these fields allowed
  deniedPatterns: string[];       // Blocked patterns (injection)
  sanitizeHtml?: boolean;         // Strip dangerous HTML
  emailValidation?: boolean;      // RFC 5322 validation
  dateValidation?: boolean;       // ISO8601 validation
  timeRangeCheck?: boolean;       // Logical time ranges
}
```

### 2. Connection Scoping
```typescript
async function executeWithScope(request: ToolExecutionRequest): Promise<ToolResult> {
  // Verify connection belongs to principal
  const connection = await getConnection(request.connection_id);
  if (connection.principal_id !== request.principal_id) {
    throw new SecurityError('Connection not owned by principal');
  }
  // Execute
}
```

### 3. Audit Logging (All Executions)
```typescript
interface ToolAuditLog {
  principal_id: UUID;              // Who executed
  tool: string;                    // Which tool
  args_hash: string;               // SHA256(args) - privacy
  connection_id: string;           // Which connection
  result_summary: string;          // Truncated result (256 chars)
  duration_ms: number;             // Execution time
  status: 'success' | 'failure' | 'denied' | 'pending_approval';
  timestamp: Date;
}
```

### 4. Replay Protection
```typescript
interface ApprovalToken {
  token: string;                   // UUID v4
  tool_name: string;               // Bound to specific tool
  args_hash: string;               // SHA256(args)
  principal_id: UUID;              // Bound to principal
  connection_id: string;           // Bound to connection
  expires_at: Date;                // 5 minutes from creation
  used: boolean;                   // One-time use
  idempotency_key: string;         // Prevent duplicate execution
}
```

### 5. Prompt Injection Defense
```typescript
const TOOL_SYSTEM_PROMPT = `
You have access to the following 10 tools:
- github.get_repo (READ)
- github.get_issue (READ)
- github.create_issue (WRITE - requires approval)
- gmail.list_messages (READ)
- gmail.send_message (WRITE - requires approval)
- google_calendar.list_events (READ)
- google_calendar.create_event (WRITE - requires approval)
- slack.list_channels (READ)
- slack.send_message (WRITE - requires approval)
- shell.execute_command (DESTRUCTIVE - requires approval + warning)

NEVER use tools not in this list.
NEVER execute commands that:
- Access files outside the project directory
- Send data to external URLs not explicitly allowed
- Modify system configuration
- Use sudo, rm -rf, or other destructive commands without explicit approval

All tool calls are subject to policy enforcement and may require CEO approval.
`;
```

---

## Phase 1 Expansion Policy

### Adding New Tools (Beyond 10)
To add tools beyond the initial 10, the following process is required:

1. **Security Review**: CTO + Expert 8 review
2. **Risk Classification**: Assign READ/WRITE/DESTRUCTIVE/MONEY/ADMIN
3. **Constraint Definition**: Define input guards, rate limits, validation
4. **Testing**: Minimum 5 test cases (success, failure, edge cases)
5. **Documentation**: Add to this policy document
6. **Approval**: PM/CEO sign-off

### Phase 2 Tool Categories (Future)
- **Money Tools**: Stripe, PayPal (charge, refund)
- **Admin Tools**: AWS, GCP (infrastructure management)
- **Database Tools**: PostgreSQL, MongoDB (read/write)
- **Code Tools**: GitHub Actions (trigger workflows)

---

## Monitoring & Compliance

### Dashboard Metrics
- Total tool calls (per principal, per tool, per day)
- Success rate (per tool)
- Approval rate (% requiring approval, % approved)
- Rate limit violations
- Security events (injection attempts, unauthorized access)

### Audit Requirements
- 100% tool executions logged
- Principal ID tracked (UUID, not email)
- Connection ID tracked
- Retention: 90 days minimum

### Compliance Checklist
- [ ] All 10 tools have risk classification
- [ ] All tools have input validation guards
- [ ] All tools have rate limits defined
- [ ] All tools have audit logging
- [ ] Approval flow tested for WRITE/DESTRUCTIVE
- [ ] Prompt injection defense in place
- [ ] Connection scoping validated
- [ ] Replay protection implemented

---

## References

- ADR-011: Composio Integration
- Expert 8 (Security-First SDLC): P0 Security Issues
- Expert 9 (System Architect): Tool Architecture Review
- CTO Review: Conditional Approval with Corrections

---

**Status**: LOCKED - Ready for CTO Sign-Off
**Version**: 1.0
**Last Updated**: 2026-02-25
