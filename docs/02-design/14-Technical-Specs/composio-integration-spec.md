# Composio Integration Technical Specification

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: APPROVED
**Authority**: CTO
**Stage**: 02 - DESIGN
**Related**: ADR-011, TOOL-POLICY.md, Sprint 50 Plan
**SDLC**: Framework 6.1.1

---

## Overview

This document provides detailed technical specifications for implementing Composio tool integration Phase 1 in EndiorBot, focusing on architecture, APIs, data models, and security constraints.

---

## Architecture

### System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                         EndiorBot System                         │
│                                                                  │
│  ┌──────────────┐         ┌─────────────────────────────────┐  │
│  │   Desktop    │◄────────┤   Gateway (JSON-RPC 2.0)        │  │
│  │   or CLI     │         │   ws://127.0.0.1:19000          │  │
│  └──────────────┘         └─────────────────────────────────┘  │
│                                      │                          │
│                                      ▼                          │
│                           ┌──────────────────┐                 │
│                           │ ToolControlPlane │                 │
│                           └──────────────────┘                 │
│                                      │                          │
│           ┌──────────────────────────┼──────────────────┐      │
│           ▼                          ▼                   ▼      │
│    ┌────────────┐           ┌──────────────┐    ┌────────────┐│
│    │  Policy    │           │  Approval    │    │   Tool     ││
│    │  Engine    │           │   Queue      │    │ Executor   ││
│    └────────────┘           └──────────────┘    └────────────┘│
│           │                          │                   │      │
│           └──────────────────────────┼───────────────────┘      │
│                                      ▼                          │
│                          ┌──────────────────┐                  │
│                          │ ComposioClient   │                  │
│                          └──────────────────┘                  │
└──────────────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │  Composio Platform  │
                        │  (External Service) │
                        └─────────────────────┘
                                   │
           ┌───────────────────────┼──────────────────────┐
           ▼                       ▼                       ▼
      ┌────────┐            ┌───────────┐          ┌──────────┐
      │ GitHub │            │   Gmail   │          │  Slack   │
      │  API   │            │    API    │          │   API    │
      └────────┘            └───────────┘          └──────────┘
```

### Component Hierarchy

```
src/tools/
├── index.ts                      # Public exports
├── types.ts                      # Type definitions
├── control-plane.ts              # Orchestrator (ToolControlPlane)
│   ├── PolicyEngine
│   ├── ApprovalQueue
│   ├── ToolExecutor
│   └── AuditLogger
├── policy-engine.ts              # Risk classification & rules
├── approval-queue.ts             # Approval token management
├── tool-executor.ts              # Execution logic
├── composio-client.ts            # Composio SDK wrapper
├── tool-registry.ts              # Tool discovery + caching
├── auth-manager.ts               # Principal UUID ↔ Composio entity
└── audit-logger.ts               # Structured logging
```

---

## Data Models

### Principal Mapping

```typescript
// Database schema: composio_connections
interface ComposioConnection {
  principal_id: string;            // UUID (primary key)
  composio_entity_id: string;      // Composio entity ID (unique)
  connection_id: string;           // OAuth connection ID
  app_name: string;                // 'github', 'gmail', 'slack', etc.
  connection_status: 'pending' | 'active' | 'revoked';
  auth_mode: 'oauth' | 'api_key';  // Future: API key auth
  created_at: Date;
  updated_at: Date;
}
```

### Tool Definition

```typescript
// Tool schema from Composio
interface Tool {
  name: string;                    // e.g., 'github.create_issue'
  app: string;                     // e.g., 'github'
  description: string;
  parameters: ToolParameter[];     // JSON Schema
  response_schema: JSONSchema;
  tags: string[];                  // ['read', 'write', 'destructive']
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;                // Regex validation
}
```

### Tool Call

```typescript
interface ToolCall {
  id: string;                      // UUID
  name: string;                    // Tool name (e.g., 'github.create_issue')
  arguments: Record<string, unknown>;  // Validated input
  principal_id: string;            // UUID
  connection_id?: string;          // OAuth connection
  metadata?: Record<string, unknown>;
}
```

### Tool Result

```typescript
interface ToolResult {
  id: string;                      // Matches ToolCall.id
  success: boolean;
  output?: unknown;                // Tool output
  error?: {
    code: string;                  // Error code
    message: string;               // Human-readable
    details?: unknown;
  };
  duration_ms: number;
  cost_usd?: number;               // If applicable
  metadata?: {
    provider: string;              // 'github', 'gmail', etc.
    rate_limit_remaining?: number;
    retry_count?: number;
  };
}
```

### Approval Token

```typescript
interface ApprovalToken {
  token: string;                   // UUID v4
  tool_name: string;               // Bound to specific tool
  args_hash: string;               // SHA256(JSON.stringify(args))
  principal_id: string;            // UUID
  connection_id: string;           // Composio connection
  expires_at: Date;                // 5 minutes from creation
  used: boolean;                   // One-time use flag
  idempotency_key: string;         // Prevent duplicate execution
  created_at: Date;
}
```

### Policy Decision

```typescript
type ToolRisk = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';
type PolicyAction = 'allow' | 'deny' | 'require_approval';

interface PolicyDecision {
  action: PolicyAction;
  risk: ToolRisk;
  reason: string;
  approval_token?: string;         // If require_approval
  expires_at?: Date;               // If require_approval
  metadata?: {
    rate_limit_remaining: number;
    estimated_duration_ms: number;
  };
}
```

### Audit Log Entry

```typescript
interface ToolAuditLog {
  id: string;                      // UUID
  principal_id: string;            // UUID (NOT email)
  tool: string;                    // Tool name
  args_hash: string;               // SHA256(args) - privacy
  connection_id: string;           // OAuth connection
  result_summary: string;          // Truncated (256 chars max)
  duration_ms: number;
  status: 'success' | 'failure' | 'denied' | 'pending_approval';
  risk: ToolRisk;
  approval_token?: string;         // If approved
  error_code?: string;             // If failed
  timestamp: Date;
}
```

### Brain Event (Layer 1)

```typescript
// src/brain/layers/events.ts
interface ToolExecutionEvent extends BrainEvent {
  type: 'tool_execution';
  tool_name: string;
  principal_id: string;            // UUID (NOT email)
  input_hash: string;              // SHA256(input) - privacy
  output_summary: string;          // Truncated (256 chars max)
  success: boolean;
  latency_ms: number;
  cost_usd: number;
  connection_id: string;           // Reference ONLY (not token)
  timestamp: Date;

  // NO SECRETS ALLOWED
  // ❌ oauth_token
  // ❌ api_key
  // ❌ password
  // ❌ full_input (may contain PII)
  // ❌ full_output (may contain PII)
}
```

---

## API Specifications

### Gateway Methods

#### 1. tools.discover

**Description**: List available tools for principal.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.discover",
  "params": {
    "principal_id": "uuid-123e4567-e89b-12d3-a456-426614174000",
    "apps": ["github", "gmail"]  // Optional filter
  },
  "id": 1
}
```

**Response** (Success):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "github.get_repo",
        "app": "github",
        "risk": "READ",
        "description": "Get repository information",
        "requires_approval": false
      },
      {
        "name": "github.create_issue",
        "app": "github",
        "risk": "WRITE",
        "description": "Create new issue",
        "requires_approval": true
      }
    ],
    "total": 3
  },
  "id": 1
}
```

**Errors**:
- `-32600`: Invalid principal_id format
- `-32603`: Internal error (Composio unavailable)

---

#### 2. tools.execute

**Description**: Execute tool call with policy enforcement.

**Request** (READ tool):
```json
{
  "jsonrpc": "2.0",
  "method": "tools.execute",
  "params": {
    "principal_id": "uuid-123",
    "tool_name": "github.get_repo",
    "arguments": {
      "owner": "anthropics",
      "repo": "anthropic-sdk-typescript"
    }
  },
  "id": 2
}
```

**Response** (READ tool - auto-executed):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "success",
    "result": {
      "id": "call-456",
      "success": true,
      "output": {
        "name": "anthropic-sdk-typescript",
        "full_name": "anthropics/anthropic-sdk-typescript",
        "stars": 1250,
        "language": "TypeScript"
      },
      "duration_ms": 850
    }
  },
  "id": 2
}
```

**Request** (WRITE tool - requires approval):
```json
{
  "jsonrpc": "2.0",
  "method": "tools.execute",
  "params": {
    "principal_id": "uuid-123",
    "tool_name": "github.create_issue",
    "arguments": {
      "owner": "anthropics",
      "repo": "claude-code",
      "title": "Feature: Add dark mode",
      "body": "Add dark mode support to UI"
    }
  },
  "id": 3
}
```

**Response** (WRITE tool - pending approval):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "pending_approval",
    "approval_token": "token-789abc",
    "expires_at": "2026-02-25T12:35:00Z",
    "message": "WRITE tool requires CEO approval. Use tools.approve with this token within 5 minutes."
  },
  "id": 3
}
```

**Request** (WRITE tool - with approval token):
```json
{
  "jsonrpc": "2.0",
  "method": "tools.execute",
  "params": {
    "principal_id": "uuid-123",
    "tool_name": "github.create_issue",
    "arguments": { /* same args */ },
    "approval_token": "token-789abc"
  },
  "id": 4
}
```

**Response** (WRITE tool - approved and executed):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "success",
    "result": {
      "id": "call-def",
      "success": true,
      "output": {
        "issue_number": 456,
        "url": "https://github.com/anthropics/claude-code/issues/456",
        "state": "open"
      },
      "duration_ms": 1250
    }
  },
  "id": 4
}
```

**Errors**:
- `-32602`: Invalid params (validation failed)
- `-32001`: Tool not in whitelist
- `-32002`: Connection not found (OAuth required)
- `-32003`: Approval token expired
- `-32004`: Approval token already used
- `-32005`: Rate limit exceeded

---

#### 3. tools.approve

**Description**: Approve and execute pending tool call.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.approve",
  "params": {
    "approval_token": "token-789abc"
  },
  "id": 5
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "result": {
      "id": "call-ghi",
      "success": true,
      "output": { /* tool output */ },
      "duration_ms": 1180
    },
    "executed_at": "2026-02-25T12:33:45Z"
  },
  "id": 5
}
```

---

#### 4. tools.connections

**Description**: List OAuth connections for principal.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.connections",
  "params": {
    "principal_id": "uuid-123"
  },
  "id": 6
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "connections": [
      {
        "connection_id": "conn-github-123",
        "app_name": "github",
        "status": "active",
        "created_at": "2026-02-20T10:00:00Z"
      },
      {
        "connection_id": "conn-gmail-456",
        "app_name": "gmail",
        "status": "active",
        "created_at": "2026-02-22T14:30:00Z"
      }
    ],
    "total": 2
  },
  "id": 6
}
```

---

#### 5. tools.disconnect

**Description**: Remove OAuth connection.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.disconnect",
  "params": {
    "principal_id": "uuid-123",
    "connection_id": "conn-github-123"
  },
  "id": 7
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "message": "Connection conn-github-123 removed"
  },
  "id": 7
}
```

---

#### 6. tools.dry-run

**Description**: Simulate tool execution without side effects.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools.dry-run",
  "params": {
    "tool_name": "gmail.send_message",
    "arguments": {
      "to": "ceo@example.com",
      "subject": "Test",
      "body": "Hello"
    }
  },
  "id": 8
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "valid": true,
    "risk": "WRITE",
    "requires_approval": true,
    "validation_errors": [],
    "estimated_duration_ms": 1200
  },
  "id": 8
}
```

---

## Security Specifications

### Input Validation Rules

All tool inputs MUST pass validation before execution:

```typescript
interface InputGuard {
  maxPayloadSize: number;          // Reject oversized inputs
  allowlistFields: string[];       // Only these fields allowed
  deniedPatterns: RegExp[];        // Block injection patterns
  sanitizeHtml?: boolean;          // Strip dangerous HTML
  emailValidation?: boolean;       // RFC 5322 validation
  dateValidation?: boolean;        // ISO8601 validation
  timeRangeCheck?: boolean;        // Logical time ranges
}

// Example: github.create_issue
const githubCreateIssueGuard: InputGuard = {
  maxPayloadSize: 64 * 1024,  // 64KB
  allowlistFields: ['owner', 'repo', 'title', 'body', 'labels', 'assignees'],
  deniedPatterns: [
    /<script/i,              // XSS
    /javascript:/i,          // XSS
    /data:text\/html/i,      // Data URI XSS
    /\.\.\//,                // Path traversal
    /'.*OR.*'/i,             // SQL injection
  ],
  sanitizeHtml: true,
};
```

### Connection Scoping

```typescript
async function validateConnectionOwnership(
  connection_id: string,
  principal_id: string
): Promise<boolean> {
  const connection = await db.query(
    'SELECT principal_id FROM composio_connections WHERE connection_id = $1',
    [connection_id]
  );

  if (connection.rows.length === 0) {
    throw new Error('Connection not found');
  }

  if (connection.rows[0].principal_id !== principal_id) {
    throw new SecurityError('Connection not owned by principal');
  }

  return true;
}
```

### Rate Limiting

```typescript
interface RateLimit {
  per_tool_per_minute: number;
  per_principal_per_minute: number;
  destructive_per_hour: number;
}

const RATE_LIMITS: RateLimit = {
  per_tool_per_minute: 10,      // 10 calls/tool/min
  per_principal_per_minute: 30,  // 30 calls/principal/min
  destructive_per_hour: 5,       // 5 destructive ops/hour
};

// Implementation uses circuit breaker from Sprint 49
```

### Audit Logging Format

```typescript
// Structured JSON log
{
  "timestamp": "2026-02-25T12:34:56.789Z",
  "level": "info",
  "event": "tool_execution",
  "principal_id": "uuid-123",
  "tool": "github.create_issue",
  "args_hash": "sha256:abc123...",
  "connection_id": "conn-github-123",
  "duration_ms": 1250,
  "status": "success",
  "risk": "WRITE",
  "approval_token": "token-789abc",
  "result_summary": "Created issue #456 in anthropics/claude-code"
  // NO SECRETS LOGGED
}
```

---

## Error Handling

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32600 | Invalid Request | Malformed JSON-RPC request |
| -32602 | Invalid Params | Parameter validation failed |
| -32001 | Tool Not Whitelisted | Tool not in Phase 1 whitelist |
| -32002 | Connection Required | OAuth connection not found |
| -32003 | Approval Expired | Approval token expired (>5min) |
| -32004 | Approval Used | Approval token already used |
| -32005 | Rate Limit Exceeded | Too many requests |
| -32006 | Execution Failed | Tool execution error |
| -32007 | Validation Failed | Input validation error |

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32007,
    "message": "Input validation failed",
    "data": {
      "field": "body",
      "error": "Exceeds maximum length of 64KB",
      "constraint": "maxPayloadSize"
    }
  },
  "id": 9
}
```

---

## Performance Specifications

### Latency Targets

| Operation | Target | P95 | P99 |
|-----------|--------|-----|-----|
| tools.discover (cached) | 100ms | 200ms | 300ms |
| tools.discover (uncached) | 500ms | 800ms | 1200ms |
| tools.execute (READ) | 800ms | 1500ms | 2500ms |
| tools.execute (pending approval) | 80ms | 150ms | 250ms |
| tools.approve | 1000ms | 1800ms | 3000ms |
| tools.connections | 50ms | 100ms | 200ms |
| tools.dry-run | 20ms | 50ms | 100ms |

### Caching Strategy

```typescript
class ToolRegistry {
  private cache: Map<string, CacheEntry<Tool[]>> = new Map();
  private TTL = 5 * 60 * 1000;  // 5 minutes

  async discoverTools(principal_id: string, apps?: string[]): Promise<Tool[]> {
    const cacheKey = `${principal_id}:${apps?.join(',') ?? 'all'}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.value;
    }

    const tools = await this.fetchTools(principal_id, apps);
    this.cache.set(cacheKey, { value: tools, timestamp: Date.now() });
    return tools;
  }
}
```

---

## Testing Specifications

### Unit Test Coverage

**Target**: 80%+ coverage for `src/tools/` module

**Critical Paths**:
1. PolicyEngine: 100% coverage (all risk classifications)
2. ApprovalQueue: 100% coverage (expiry, one-time use, replay)
3. ToolExecutor: 95%+ coverage (validation, execution, error handling)
4. ComposioClient: 85%+ coverage (SDK integration)
5. AuthManager: 95%+ coverage (principal mapping, connection scoping)

### Integration Tests

**Scenarios**:
1. End-to-end OAuth flow (GitHub)
2. End-to-end OAuth flow (Gmail)
3. READ tool execution (auto-approved)
4. WRITE tool execution (approval required)
5. DESTRUCTIVE tool execution (approval + warning)
6. Approval token expiry
7. Approval token one-time use
8. Rate limiting enforcement
9. Connection scoping validation
10. Input validation (XSS, SQL injection, path traversal)

### Security Tests

**Attack Vectors**:
1. SQL injection in tool arguments
2. XSS in tool arguments
3. Path traversal in file paths
4. Replay attack with used approval token
5. Connection hijacking (principal mismatch)
6. Rate limit bypass
7. Oversized payload
8. Invalid email format
9. Invalid date format
10. Command injection in shell tool

---

## Deployment Specifications

### Environment Variables

```bash
# Required
COMPOSIO_API_KEY=          # Composio API key (OPTIONAL at startup)

# Database
DATABASE_URL=              # PostgreSQL connection string

# Feature Flags
ENABLE_TOOL_EXECUTION=true # Feature flag (default: true)
TOOL_DRY_RUN_MODE=false    # Global dry-run mode (default: false)
```

### Database Migrations

```sql
-- Migration: 001_create_composio_connections.sql
CREATE TABLE composio_connections (
  principal_id UUID PRIMARY KEY,
  composio_entity_id VARCHAR(255) UNIQUE NOT NULL,
  connection_id VARCHAR(255),
  app_name VARCHAR(100),
  connection_status VARCHAR(50),
  auth_mode VARCHAR(50) DEFAULT 'oauth',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_composio_entity ON composio_connections(composio_entity_id);
CREATE INDEX idx_principal ON composio_connections(principal_id);
CREATE INDEX idx_app_name ON composio_connections(app_name);

-- Migration: 002_create_approval_tokens.sql
CREATE TABLE approval_tokens (
  token VARCHAR(255) PRIMARY KEY,
  tool_name VARCHAR(100) NOT NULL,
  args_hash VARCHAR(64) NOT NULL,
  principal_id UUID NOT NULL,
  connection_id VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_principal_token ON approval_tokens(principal_id);
CREATE INDEX idx_expires_at ON approval_tokens(expires_at);
```

---

## Monitoring & Observability

### Metrics

```typescript
// Prometheus metrics
const toolExecutionDuration = new Histogram({
  name: 'endiorbot_tool_execution_duration_seconds',
  help: 'Tool execution duration',
  labelNames: ['tool_name', 'risk', 'status'],
});

const toolExecutionTotal = new Counter({
  name: 'endiorbot_tool_execution_total',
  help: 'Total tool executions',
  labelNames: ['tool_name', 'risk', 'status'],
});

const approvalQueueSize = new Gauge({
  name: 'endiorbot_approval_queue_size',
  help: 'Number of pending approvals',
});
```

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High error rate | >10% tool failures in 5min | Warning |
| Approval queue growing | >50 pending approvals | Warning |
| Rate limit exceeded | >100 rate limit rejections/hour | Info |
| Composio unavailable | >5 consecutive Composio API failures | Critical |

---

## References

- ADR-011: Composio Integration
- TOOL-POLICY.md: 10 Curated Tools + Risk Matrix + Constraints
- Sprint 50 Plan: Day-by-day implementation
- Sprint 50 Requirements: Functional & non-functional requirements
- Composio SDK Documentation: https://docs.composio.dev/

---

**Status**: APPROVED - Ready for Implementation
**Next Review**: Code Review (Sprint 50 Day 10)
**Owner**: PM + Architect

*SDLC Framework 6.1.1*
*Stage 02 - DESIGN*
