# Sprint 50 Detailed Plan - Composio Integration Phase 1: Security Foundation

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: 🔄 APPROVED - Ready to Start
**Authority**: CTO (Conditional Approval with P0 fixes applied)
**Pillar**: 2 - Sprint Governance
**Stage**: 04 - BUILD
**Prerequisites**:
- Sprint 49 Complete (Production Hardening)
- All 3,171+ tests passing
- ADR-011 Composio Integration approved
- TOOL-POLICY.md defined (10 curated tools)
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 50 implements **Composio Integration Phase 1**, establishing a **security-first tool execution foundation** for EndiorBot. This transforms EndiorBot from an "advisor" to an "executor" by enabling real-world actions through 10 curated external tools.

### Key Deliverables

1. **ToolControlPlane**: Trust boundary with policy-based approval system
2. **Tool Registry**: 10 curated tools (GitHub, Gmail, Calendar, Slack, Shell)
3. **Gateway Methods**: 6 new JSON-RPC methods for tool operations
4. **Principal Mapping**: UUID-based identity (not email)
5. **Audit System**: 100% tool execution logging
6. **Security Tests**: 30+ new test cases for tool security

**Critical Security Constraint**: Phase 1 does NOT integrate with Provider layer. Tools are executed via Gateway methods only, with ToolControlPlane enforcing approval.

---

## Sprint Goal

Build security-first tool execution infrastructure with ToolControlPlane, curated tool registry, and audit logging - WITHOUT provider integration.

---

## Architecture Overview

### Security-First Pattern

```
Desktop/CLI → Gateway (tools.execute)
                    ↓
        ToolControlPlane.evaluate()
                    ↓
    PolicyEngine → risk classification
                    ↓
READ tools → auto-execute
WRITE/DESTRUCTIVE → ApprovalQueue (CEO approval)
                    ↓
        ToolExecutor → Composio SDK
                    ↓
        AuditLogger + Brain Layer 1
```

**Key Invariant**: Provider layer ONLY returns `tool_calls` proposals. Execution happens separately via ToolControlPlane.

---

## Day 1-2: Setup & Dependencies

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add `@composio/core@0.6.3` to package.json | P0 | Exact version pin | ~5 |
| Create `src/tools/` module structure | P0 | 9 files (see structure below) | ~50 |
| Add `COMPOSIO_API_KEY` to secrets management | P0 | Optional at startup | ~30 |
| Update `secrets list` to show Composio key | P1 | CLI display | ~20 |
| Create principal mapping table schema | P0 | `composio_connections` table | ~80 |
| Document Composio optional startup | P1 | README update | ~40 |
| Verify EndiorBot runs without Composio | P0 | Graceful degradation | ~20 |

### Module Structure

```
src/tools/
├── control-plane.ts         # ToolControlPlane orchestrator
├── policy-engine.ts         # Risk classification (READ/WRITE/DESTRUCTIVE/MONEY/ADMIN)
├── approval-queue.ts        # Approval token management (5min expiry, one-time use)
├── composio-client.ts       # Composio SDK wrapper
├── tool-registry.ts         # Tool discovery with 10-tool whitelist
├── tool-executor.ts         # Execute after approval
├── auth-manager.ts          # Principal UUID mapping
├── audit-logger.ts          # Audit trail for all executions
├── types.ts                 # Tool-related types
└── index.ts                 # Exports
```

### Principal Mapping Schema

```sql
CREATE TABLE composio_connections (
  principal_id UUID PRIMARY KEY REFERENCES users(id),
  composio_entity_id VARCHAR(255) UNIQUE NOT NULL,
  connection_id VARCHAR(255),
  app_name VARCHAR(100),
  connection_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_composio_entity ON composio_connections(composio_entity_id);
CREATE INDEX idx_principal ON composio_connections(principal_id);
```

### Success Criteria

- [ ] `pnpm install` succeeds with `@composio/core@0.6.3`
- [ ] `src/tools/` directory exists with 9 files
- [ ] `./endiorbot.mjs secrets list` shows Composio API key (if set)
- [ ] EndiorBot starts normally when `COMPOSIO_API_KEY` is NOT set
- [ ] Principal mapping table created (or schema documented)

---

## Day 3-4: ToolControlPlane (P0 - Expert 8)

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Implement `PolicyEngine` | P0 | Risk classification logic | ~200 |
| Implement `ApprovalQueue` | P0 | Token management + expiry | ~250 |
| Implement `AuditLogger` | P0 | Structured logging | ~150 |
| Add rate limiting (per-tool, per-principal) | P0 | Circuit breaker integration | ~180 |
| Add replay protection with idempotency keys | P0 | Prevent duplicate execution | ~120 |
| Wire ToolControlPlane orchestrator | P0 | Main entry point | ~200 |
| Tests for PolicyEngine | P0 | 10+ test cases | ~200 |
| Tests for ApprovalQueue | P0 | Token expiry, one-time use | ~180 |

### PolicyEngine Implementation

```typescript
// src/tools/policy-engine.ts
export type ToolRisk = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';

export interface PolicyDecision {
  action: 'allow' | 'deny' | 'require_approval';
  risk: ToolRisk;
  reason: string;
  approval_token?: string;  // If require_approval
  expires_at?: Date;        // If require_approval
}

export class PolicyEngine {
  private toolRiskMatrix: Map<string, ToolRisk>;

  constructor() {
    // Load from TOOL-POLICY.md
    this.toolRiskMatrix = new Map([
      ['github.get_repo', 'READ'],
      ['github.get_issue', 'READ'],
      ['github.create_issue', 'WRITE'],
      ['gmail.list_messages', 'READ'],
      ['gmail.send_message', 'WRITE'],
      ['google_calendar.list_events', 'READ'],
      ['google_calendar.create_event', 'WRITE'],
      ['slack.list_channels', 'READ'],
      ['slack.send_message', 'WRITE'],
      ['shell.execute_command', 'DESTRUCTIVE'],
    ]);
  }

  async evaluate(
    toolName: string,
    args: unknown,
    principal_id: string
  ): Promise<PolicyDecision> {
    const risk = this.toolRiskMatrix.get(toolName) ?? 'ADMIN';

    if (risk === 'READ') {
      return { action: 'allow', risk, reason: 'READ tools auto-approved' };
    }

    // WRITE/DESTRUCTIVE/MONEY/ADMIN require approval
    const approvalToken = await this.createApprovalToken(toolName, args, principal_id);
    return {
      action: 'require_approval',
      risk,
      reason: `${risk} tool requires CEO approval`,
      approval_token: approvalToken.token,
      expires_at: approvalToken.expires_at,
    };
  }

  private async createApprovalToken(
    toolName: string,
    args: unknown,
    principal_id: string
  ): Promise<{ token: string; expires_at: Date }> {
    // Implementation in ApprovalQueue
  }
}
```

### ApprovalQueue Implementation

```typescript
// src/tools/approval-queue.ts
import crypto from 'crypto';

export interface ApprovalToken {
  token: string;                   // UUID v4
  tool_name: string;               // Bound to specific tool
  args_hash: string;               // SHA256(args)
  principal_id: string;            // UUID
  connection_id: string;           // Composio connection
  expires_at: Date;                // 5 minutes from creation
  used: boolean;                   // One-time use
  idempotency_key: string;         // Prevent duplicate execution
  created_at: Date;
}

export class ApprovalQueue {
  private tokens: Map<string, ApprovalToken> = new Map();

  async enqueue(
    tool_name: string,
    args: unknown,
    principal_id: string,
    connection_id: string
  ): Promise<ApprovalToken> {
    const token: ApprovalToken = {
      token: crypto.randomUUID(),
      tool_name,
      args_hash: this.hashArgs(args),
      principal_id,
      connection_id,
      expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      used: false,
      idempotency_key: crypto.randomUUID(),
      created_at: new Date(),
    };

    this.tokens.set(token.token, token);
    return token;
  }

  async validate(token: string): Promise<ApprovalToken | null> {
    const approval = this.tokens.get(token);
    if (!approval) return null;
    if (approval.used) throw new Error('Approval token already used');
    if (approval.expires_at < new Date()) throw new Error('Approval token expired');

    // Mark as used (one-time use)
    approval.used = true;
    return approval;
  }

  private hashArgs(args: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
  }
}
```

### Success Criteria

- [ ] PolicyEngine classifies all 10 tools correctly (READ/WRITE/DESTRUCTIVE)
- [ ] READ tools return `action: 'allow'` without approval token
- [ ] WRITE/DESTRUCTIVE tools return `action: 'require_approval'` with 5min expiry token
- [ ] ApprovalQueue tokens expire after 5 minutes
- [ ] Tokens are one-time use (second validation fails)
- [ ] Rate limiting enforced: 10/tool/min, 30/principal/min, 5 destructive/hour
- [ ] All tests pass (20+ tests for PolicyEngine + ApprovalQueue)

---

## Day 5-6: Tool Registry & Executor (Curated 10 Tools)

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Implement `ComposioClient` wrapper | P0 | SDK integration | ~180 |
| Implement `ToolRegistry` with 10-tool whitelist | P0 | Tool discovery + caching | ~220 |
| Implement `ToolExecutor` | P0 | Execute via Composio | ~250 |
| Add input validation with zod schemas | P0 | Schema validation (Expert 8 P0-5) | ~300 |
| Add input guards (payload size, allowlists) | P0 | Security constraints | ~180 |
| Brain Layer 1 event tracking | P0 | `src/brain/layers/events.ts` | ~120 |
| Tests for ToolRegistry | P1 | Discovery, caching | ~150 |
| Tests for ToolExecutor | P0 | Execution, validation | ~200 |

### ComposioClient Wrapper

```typescript
// src/tools/composio-client.ts
import { Composio } from '@composio/core';

export class ComposioClient {
  private composio: Composio;

  constructor(config: { apiKey: string }) {
    this.composio = new Composio(config);
  }

  async getTools(principal_id: string, toolkits: string[]): Promise<Tool[]> {
    const entityId = await this.getPrincipalEntity(principal_id);
    return this.composio.getTools({ entityId, toolkits });
  }

  async executeTool(
    toolCall: ToolCall,
    principal_id: string
  ): Promise<ToolResult> {
    const entityId = await this.getPrincipalEntity(principal_id);
    return this.composio.executeAction({
      action: toolCall.name,
      params: toolCall.arguments,
      entityId,
    });
  }

  async createConnection(
    app: string,
    principal_id: string
  ): Promise<ConnectionRequest> {
    const entityId = await this.getPrincipalEntity(principal_id);
    return this.composio.initiateConnection(app, entityId);
  }

  private async getPrincipalEntity(principal_id: string): Promise<string> {
    // Map principal_id (UUID) to Composio entity ID
    // Query composio_connections table
  }
}
```

### ToolRegistry with Whitelist

```typescript
// src/tools/tool-registry.ts
const PHASE_1_TOOLS = [
  'github.get_repo',
  'github.get_issue',
  'github.create_issue',
  'gmail.list_messages',
  'gmail.send_message',
  'google_calendar.list_events',
  'google_calendar.create_event',
  'slack.list_channels',
  'slack.send_message',
  'shell.execute_command',
];

export class ToolRegistry {
  private cache: Map<string, Tool[]> = new Map();

  async discoverTools(principal_id: string, apps?: string[]): Promise<Tool[]> {
    const cacheKey = `${principal_id}:${apps?.join(',')}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const allTools = await this.composioClient.getTools(principal_id, apps ?? []);

    // Filter to whitelist ONLY
    const allowedTools = allTools.filter(tool =>
      PHASE_1_TOOLS.includes(tool.name)
    );

    this.cache.set(cacheKey, allowedTools);
    return allowedTools;
  }

  async getToolByName(name: string, principal_id: string): Promise<Tool | null> {
    if (!PHASE_1_TOOLS.includes(name)) {
      throw new Error(`Tool ${name} not in Phase 1 whitelist`);
    }
    // Fetch from cache or Composio
  }
}
```

### ToolExecutor with Validation

```typescript
// src/tools/tool-executor.ts
import { z } from 'zod';

export class ToolExecutor {
  async execute(
    toolCall: ToolCall,
    principal_id: string,
    context: ExecutionContext
  ): Promise<ToolResult> {
    // 1. Validate input schema
    const validation = await this.validateInput(toolCall.name, toolCall.arguments);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    // 2. Execute via Composio
    const startTime = Date.now();
    const result = await this.composioClient.executeTool(toolCall, principal_id);
    const duration = Date.now() - startTime;

    // 3. Track in Brain Layer 1
    await this.trackExecution({
      tool_name: toolCall.name,
      principal_id,
      input_hash: this.hashInput(toolCall.arguments),
      output_summary: this.truncate(result.output, 256),
      success: result.success,
      duration,
    });

    // 4. Audit log
    await this.auditLogger.log({
      principal_id,
      tool: toolCall.name,
      args_hash: this.hashInput(toolCall.arguments),
      duration_ms: duration,
      status: result.success ? 'success' : 'failure',
    });

    return result;
  }

  private async validateInput(toolName: string, input: unknown): Promise<ValidationResult> {
    const schema = this.getToolSchema(toolName);
    return schema.safeParse(input);
  }

  private getToolSchema(toolName: string): z.ZodSchema {
    // Load from TOOL-POLICY.md constraints
    const schemas: Record<string, z.ZodSchema> = {
      'github.create_issue': z.object({
        owner: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/),
        repo: z.string().max(100).regex(/^[a-zA-Z0-9_-]+$/),
        title: z.string().max(256),
        body: z.string().max(64 * 1024).optional(),
        labels: z.array(z.string().max(50)).max(10).optional(),
      }),
      // ... other tools
    };
    return schemas[toolName] ?? z.unknown();
  }
}
```

### Success Criteria

- [ ] ToolRegistry returns ONLY 10 whitelisted tools
- [ ] Attempting non-whitelisted tool throws error
- [ ] ToolExecutor validates all inputs with zod schemas
- [ ] Invalid inputs rejected BEFORE Composio execution
- [ ] Brain Layer 1 tracks all tool executions with `principal_id` (UUID)
- [ ] Audit logger records 100% of tool calls
- [ ] **NO SECRETS** stored in Brain (only event data)
- [ ] All tests pass (15+ tests for Registry + Executor)

---

## Day 7-8: Gateway Methods

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create `src/gateway/methods/tools.ts` | P0 | 6 gateway methods | ~350 |
| `tools.discover` method | P0 | List available tools | ~80 |
| `tools.execute` method | P0 | Execute with policy check | ~120 |
| `tools.approve` method | P0 | Approve pending execution | ~90 |
| `tools.connections` method | P1 | List connected accounts | ~60 |
| `tools.disconnect` method | P1 | Remove connection | ~50 |
| `tools.dry-run` method | P1 | Simulate execution (Expert 9) | ~80 |
| Register in `methods/index.ts` | P0 | Export + count | ~20 |
| Add authentication for tool methods | P0 | Require auth | ~40 |
| Tests for gateway methods | P1 | 12+ test cases | ~250 |

### Gateway Method Signatures

```typescript
// src/gateway/methods/tools.ts

// 1. tools.discover - List available tools
interface ToolsDiscoverParams {
  principal_id: string;
  apps?: string[];  // e.g., ['github', 'gmail']
}
interface ToolsDiscoverResult {
  tools: Tool[];
  total: number;
}

// 2. tools.execute - Execute tool call
interface ToolsExecuteParams {
  principal_id: string;
  tool_name: string;
  arguments: unknown;
  connection_id?: string;
  approval_token?: string;  // Required for WRITE/DESTRUCTIVE
}
interface ToolsExecuteResult {
  result: ToolResult;
  status: 'success' | 'failure' | 'pending_approval';
  approval_token?: string;  // If pending_approval
  expires_at?: Date;
}

// 3. tools.approve - Approve pending execution
interface ToolsApproveParams {
  approval_token: string;
}
interface ToolsApproveResult {
  result: ToolResult;
  executed_at: Date;
}

// 4. tools.connections - List connected accounts
interface ToolsConnectionsParams {
  principal_id: string;
}
interface ToolsConnectionsResult {
  connections: Connection[];
}

// 5. tools.disconnect - Remove connection
interface ToolsDisconnectParams {
  principal_id: string;
  connection_id: string;
}

// 6. tools.dry-run - Simulate execution (Expert 9)
interface ToolsDryRunParams {
  tool_name: string;
  arguments: unknown;
}
interface ToolsDryRunResult {
  valid: boolean;
  validation_errors?: string[];
  risk: ToolRisk;
  requires_approval: boolean;
}
```

### Implementation

```typescript
// src/gateway/methods/tools.ts
export function registerToolsMethods(server: GatewayServer): void {
  const controlPlane = new ToolControlPlane();

  server.registerMethod("tools.discover", async (params, clientInfo) => {
    const { principal_id, apps } = params as ToolsDiscoverParams;
    const tools = await controlPlane.discoverTools(principal_id, apps);
    return { tools, total: tools.length };
  });

  server.registerMethod("tools.execute", async (params, clientInfo) => {
    const { principal_id, tool_name, arguments: args, approval_token } = params as ToolsExecuteParams;

    const decision = await controlPlane.evaluate(tool_name, args, principal_id);

    if (decision.action === 'allow') {
      // Auto-execute READ tools
      const result = await controlPlane.execute(tool_name, args, principal_id);
      return { result, status: 'success' };
    }

    if (decision.action === 'require_approval') {
      if (approval_token) {
        // Execute with approval token
        const result = await controlPlane.executeWithApproval(approval_token);
        return { result, status: 'success' };
      }
      // Return pending approval
      return {
        status: 'pending_approval',
        approval_token: decision.approval_token,
        expires_at: decision.expires_at,
      };
    }

    throw new Error(`Tool execution denied: ${decision.reason}`);
  });

  server.registerMethod("tools.approve", async (params, clientInfo) => {
    const { approval_token } = params as ToolsApproveParams;
    const result = await controlPlane.executeWithApproval(approval_token);
    return { result, executed_at: new Date() };
  });

  // ... other methods
}
```

### Success Criteria

- [ ] All 6 gateway methods registered
- [ ] `tools.discover` returns 10 whitelisted tools
- [ ] `tools.execute` auto-executes READ tools
- [ ] `tools.execute` returns `pending_approval` for WRITE/DESTRUCTIVE
- [ ] `tools.approve` executes with valid token
- [ ] `tools.dry-run` validates without executing
- [ ] METHOD_COUNTS updated in `methods/index.ts`
- [ ] Authentication required for all tool methods
- [ ] All tests pass (12+ gateway method tests)

---

## Day 9: OAuth & Principal Mapping

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Implement Device Code Flow for OAuth (Expert 9) | P0 | OAuth connection | ~200 |
| Create `composio_connections` table | P0 | Database schema | ~50 |
| Implement principal UUID mapping | P0 | AuthManager | ~150 |
| Add connection scoping validation | P0 | Security check | ~80 |
| Test OAuth flow end-to-end | P0 | Manual verification | - |
| Document OAuth setup process | P1 | User guide | ~100 |

### Device Code Flow (Expert 9 Recommendation)

```typescript
// src/tools/auth-manager.ts
export class AuthManager {
  async initiateConnection(
    app: string,
    principal_id: string
  ): Promise<{ device_code: string; user_code: string; verification_url: string }> {
    // 1. Create Composio entity if not exists
    const entityId = await this.getOrCreateEntity(principal_id);

    // 2. Initiate device code flow
    const connection = await this.composioClient.initiateConnection(app, entityId);

    // 3. Store in composio_connections table
    await this.storeConnection({
      principal_id,
      composio_entity_id: entityId,
      app_name: app,
      connection_status: 'pending',
    });

    return {
      device_code: connection.deviceCode,
      user_code: connection.userCode,
      verification_url: connection.verificationUrl,
    };
  }

  async pollConnection(principal_id: string, app: string): Promise<ConnectionStatus> {
    // Poll Composio for connection status
    const entityId = await this.getEntity(principal_id);
    const status = await this.composioClient.getConnectionStatus(app, entityId);

    if (status === 'active') {
      await this.updateConnectionStatus(principal_id, app, 'active');
    }

    return status;
  }

  async validateConnection(connection_id: string, principal_id: string): Promise<boolean> {
    // Security check: connection belongs to principal
    const connection = await this.getConnection(connection_id);
    return connection.principal_id === principal_id;
  }

  private async getOrCreateEntity(principal_id: string): Promise<string> {
    // Check if principal already has entity
    const existing = await db.query(
      'SELECT composio_entity_id FROM composio_connections WHERE principal_id = $1 LIMIT 1',
      [principal_id]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].composio_entity_id;
    }

    // Create new entity (use principal_id as entity ID for simplicity)
    return `entity-${principal_id}`;
  }
}
```

### Success Criteria

- [ ] Device Code Flow successfully connects to GitHub
- [ ] Device Code Flow successfully connects to Gmail
- [ ] Principal UUID correctly mapped to Composio entity ID
- [ ] Connection scoping validated (reject mismatched principal/connection)
- [ ] OAuth tokens stored in Composio (NOT in Brain)
- [ ] Manual end-to-end test: Connect GitHub, execute `github.get_repo`

---

## Day 10: Testing & Documentation

### Task List

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Write 30+ security tests for tools module | P0 | Full coverage | ~600 |
| Document tool integration | P0 | `docs/04-build/tools-integration.md` | ~400 |
| Update configuration reference | P1 | `docs/04-build/configuration-reference.md` | ~100 |
| Verify ADR-011 complete | P0 | Already created ✅ | - |
| Verify TOOL-POLICY.md complete | P0 | Already created ✅ | - |
| Run full test suite | P0 | 3,171+ existing + 30+ new | - |
| G-Sprint-50 gate evaluation | P0 | All gates pass | - |

### Security Test Coverage

```typescript
// tests/tools/security.test.ts
describe('Tool Security', () => {
  describe('Policy Enforcement', () => {
    it('should auto-allow READ tools', async () => { /* ... */ });
    it('should require approval for WRITE tools', async () => { /* ... */ });
    it('should require approval for DESTRUCTIVE tools', async () => { /* ... */ });
    it('should deny tools not in whitelist', async () => { /* ... */ });
  });

  describe('Input Validation', () => {
    it('should reject oversized payloads', async () => { /* ... */ });
    it('should reject SQL injection patterns', async () => { /* ... */ });
    it('should reject path traversal patterns', async () => { /* ... */ });
    it('should reject XSS patterns', async () => { /* ... */ });
    it('should validate email addresses', async () => { /* ... */ });
    it('should validate ISO8601 dates', async () => { /* ... */ });
  });

  describe('Approval System', () => {
    it('should create approval tokens with 5min expiry', async () => { /* ... */ });
    it('should reject expired tokens', async () => { /* ... */ });
    it('should enforce one-time use tokens', async () => { /* ... */ });
    it('should prevent replay attacks', async () => { /* ... */ });
  });

  describe('Connection Scoping', () => {
    it('should reject connection from different principal', async () => { /* ... */ });
    it('should validate principal UUID format', async () => { /* ... */ });
  });

  describe('Rate Limiting', () => {
    it('should enforce per-tool rate limits', async () => { /* ... */ });
    it('should enforce per-principal rate limits', async () => { /* ... */ });
    it('should enforce destructive operation limits', async () => { /* ... */ });
  });

  describe('Audit Logging', () => {
    it('should log all tool executions', async () => { /* ... */ });
    it('should NOT log secrets in audit', async () => { /* ... */ });
    it('should log principal_id (UUID)', async () => { /* ... */ });
  });

  describe('Brain Integration', () => {
    it('should track tool events in Layer 1', async () => { /* ... */ });
    it('should NOT store OAuth tokens in Brain', async () => { /* ... */ });
    it('should use principal_id (not email)', async () => { /* ... */ });
  });
});
```

### Success Criteria

- [ ] All 3,171+ existing tests pass
- [ ] 30+ new tool security tests pass
- [ ] Test coverage > 80% for `src/tools/` module
- [ ] Documentation complete: `tools-integration.md`
- [ ] Configuration reference updated
- [ ] G-Sprint-50 gate PASS

---

## Success Metrics (Phase 1 - Security Foundation)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Safety** | 0 unauthorized executions | ToolControlPlane enforces approval for WRITE/DESTRUCTIVE |
| **Correctness** | 100% validation | All tool calls pass schema validation before execution |
| **Audit** | 100% logging | Every tool execution logged with principal_id, tool_name, success, duration |
| **Brain Layer 1** | 100% tracking | All tool events in `src/brain/layers/events.ts` |
| **Regression** | 0 broken tests | All 3,171+ existing tests pass + 30+ new tests |
| **Performance** | < 300ms | Gateway methods (tools.discover, tools.execute) respond in < 300ms (cached) |

---

## NOT in Phase 1

The following features are explicitly **deferred to Phase 2** (Sprint 51/52):

- ❌ Provider integration (BaseProvider.chat extension)
- ❌ ToolAwareOrchestrator
- ❌ Evaluator toolEffectiveness dimension
- ❌ Mental models for tool preferences
- ❌ Multi-model tool routing
- ❌ CEO approval via OTT channels (Telegram/Zalo)
- ❌ Brain Layer 2 pattern recognition

**Phase 1 Scope**: ToolControlPlane + Gateway methods + Audit only. Tools executed manually via Gateway, NOT automatically by AI.

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Composio API changes | Medium | High | Pin exact version (0.6.3), monitor changelog |
| OAuth flow complexity | Low | Medium | Use Composio Device Code Flow, manual testing |
| Rate limit conflicts | Low | Medium | Composio respects provider limits |
| Tool execution failures | Medium | Medium | Proper error handling, dry-run mode |
| Version incompatibility | Medium | High | Lock exact 0.6.3, test before any upgrade |

---

## Dependencies

### External
- `@composio/core@0.6.3` (exact version pin)

### Internal
- Sprint 49 complete (Production Hardening)
- All 3,171+ tests passing
- Gateway WebSocket server operational
- Brain Layer 1 (`src/brain/layers/events.ts`)
- Secrets management system (keytar + env)

---

## Gate Evaluation Criteria (G-Sprint-50)

### G1: Code Complete
- [ ] All 9 files in `src/tools/` implemented
- [ ] All 6 gateway methods registered
- [ ] Principal mapping table created

### G2: Tests Pass
- [ ] 3,171+ existing tests pass
- [ ] 30+ new tool security tests pass
- [ ] Test coverage > 80% for `src/tools/`

### G3: Documentation Complete
- [ ] ADR-011 Composio Integration ✅
- [ ] TOOL-POLICY.md ✅
- [ ] `tools-integration.md` user guide
- [ ] Configuration reference updated

### G4: Security Validation
- [ ] ToolControlPlane enforces policy
- [ ] No unauthorized tool executions possible
- [ ] 100% audit logging
- [ ] No secrets in Brain

### G5: Production Ready
- [ ] EndiorBot runs without COMPOSIO_API_KEY (graceful degradation)
- [ ] Manual OAuth flow tested (GitHub + Gmail)
- [ ] Gateway methods respond < 300ms
- [ ] All P0 security constraints verified

---

## References

- ADR-011: Composio Integration
- TOOL-POLICY.md: 10 Curated Tools + Risk Matrix
- Sprint 49: Production Hardening (complete)
- Expert 8 (Security-First SDLC): P0 Security Issues
- Expert 9 (System Architect): Tool Architecture Review
- CTO Review: Conditional Approval (all fixes applied)

---

**Status**: Ready to start Day 1
**Next Sprint**: Sprint 51 - Context Engineering (deferred from Sprint 47)
**Future Sprint**: Sprint 52 - Composio Phase 2 (Provider integration, Evaluator, OTT approval)

*SDLC Framework 6.1.1*
*Sprint Governance Pillar 2*
