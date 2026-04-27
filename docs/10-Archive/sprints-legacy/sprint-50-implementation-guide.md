# Sprint 50 Implementation Guide - Composio Integration Phase 1

**Version**: 1.0.0
**Date**: 2026-02-27
**Status**: READY TO START
**Stage**: 04 - BUILD
**Authority**: CTO (Approved)
**SDLC**: Framework 6.1.1

---

## Overview

Sprint 50 implements **Composio Integration Phase 1: Security Foundation** - establishing a secure tool execution infrastructure for EndiorBot with 10 curated external tools.

**Key Deliverables**:
1. ToolControlPlane (trust boundary)
2. 10 curated tools (GitHub, Gmail, Calendar, Slack, Shell)
3. 6 Gateway methods
4. OAuth connection management
5. 100% audit logging

---

## Prerequisites

Before starting Sprint 50:

- [ ] Sprint 49 complete (Production Hardening)
- [ ] All 3,171+ tests passing
- [ ] ADR-011 approved (docs/02-design/01-ADRs/ADR-011-Composio-Integration.md)
- [ ] TOOL-POLICY.md created (docs/04-build/TOOL-POLICY.md)
- [ ] CTO sign-off received

---

## Quick Start

### Day 1-2: Setup & Dependencies

```bash
# 1. Add Composio SDK (exact version pin)
pnpm add @composio/core@0.6.3

# 2. Create module structure
mkdir -p src/tools
touch src/tools/{index,types,control-plane,policy-engine,approval-queue,composio-client,tool-registry,tool-executor,auth-manager,audit-logger}.ts

# 3. Add COMPOSIO_API_KEY to secrets (OPTIONAL)
# Note: EndiorBot runs without this key
export COMPOSIO_API_KEY="your-key-here"

# 4. Verify installation
pnpm build
pnpm test
```

---

## Implementation Guide

### 1. Types Definition

**File**: `src/tools/types.ts`

```typescript
/**
 * Tool-related type definitions for Composio integration
 * Phase 1: Security Foundation
 */

// Risk classification
export type ToolRisk = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';

// Policy decision
export type PolicyAction = 'allow' | 'deny' | 'require_approval';

export interface PolicyDecision {
  action: PolicyAction;
  risk: ToolRisk;
  reason: string;
  approval_token?: string;
  expires_at?: Date;
}

// Tool definition (from Composio)
export interface Tool {
  name: string;
  app: string;
  description: string;
  parameters: ToolParameter[];
  tags: string[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
  pattern?: string;
}

// Tool call
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  principal_id: string;
  connection_id?: string;
}

// Tool result
export interface ToolResult {
  id: string;
  success: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  duration_ms: number;
}

// Approval token
export interface ApprovalToken {
  token: string;
  tool_name: string;
  args_hash: string;
  principal_id: string;
  connection_id: string;
  expires_at: Date;
  used: boolean;
  idempotency_key: string;
  created_at: Date;
}

// Connection (OAuth)
export interface ComposioConnection {
  principal_id: string;
  composio_entity_id: string;
  connection_id: string;
  app_name: string;
  connection_status: 'pending' | 'active' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

// Audit log entry
export interface ToolAuditLog {
  id: string;
  principal_id: string;
  tool: string;
  args_hash: string;
  connection_id: string;
  result_summary: string;
  duration_ms: number;
  status: 'success' | 'failure' | 'denied' | 'pending_approval';
  risk: ToolRisk;
  approval_token?: string;
  error_code?: string;
  timestamp: Date;
}

// Brain event (Layer 1)
export interface ToolExecutionEvent {
  type: 'tool_execution';
  tool_name: string;
  principal_id: string;
  input_hash: string;
  output_summary: string;
  success: boolean;
  latency_ms: number;
  cost_usd: number;
  connection_id: string;
  timestamp: Date;
}
```

---

### 2. PolicyEngine Implementation

**File**: `src/tools/policy-engine.ts`

```typescript
/**
 * PolicyEngine - Risk classification and policy enforcement
 * P0 requirement from Expert 8
 */

import type { ToolRisk, PolicyDecision } from './types.js';
import { ApprovalQueue } from './approval-queue.js';

// Phase 1: 10 curated tools only
const TOOL_RISK_MATRIX: Map<string, ToolRisk> = new Map([
  // READ tools (auto-approved)
  ['github.get_repo', 'READ'],
  ['github.get_issue', 'READ'],
  ['gmail.list_messages', 'READ'],
  ['google_calendar.list_events', 'READ'],
  ['slack.list_channels', 'READ'],

  // WRITE tools (require approval)
  ['github.create_issue', 'WRITE'],
  ['gmail.send_message', 'WRITE'],
  ['google_calendar.create_event', 'WRITE'],
  ['slack.send_message', 'WRITE'],

  // DESTRUCTIVE tools (require approval + warning)
  ['shell.execute_command', 'DESTRUCTIVE'],
]);

// Rate limiting state
interface RateLimitState {
  toolCounts: Map<string, number>;
  principalCounts: Map<string, number>;
  destructiveCounts: Map<string, number>;
  lastReset: Date;
}

export class PolicyEngine {
  private approvalQueue: ApprovalQueue;
  private rateLimitState: RateLimitState;

  // Rate limits from TOOL-POLICY.md
  private static readonly PER_TOOL_PER_MINUTE = 10;
  private static readonly PER_PRINCIPAL_PER_MINUTE = 30;
  private static readonly DESTRUCTIVE_PER_HOUR = 5;

  constructor(approvalQueue: ApprovalQueue) {
    this.approvalQueue = approvalQueue;
    this.rateLimitState = {
      toolCounts: new Map(),
      principalCounts: new Map(),
      destructiveCounts: new Map(),
      lastReset: new Date(),
    };
  }

  async evaluate(
    toolName: string,
    args: unknown,
    principal_id: string,
    connection_id?: string
  ): Promise<PolicyDecision> {
    // 1. Check whitelist
    if (!TOOL_RISK_MATRIX.has(toolName)) {
      return {
        action: 'deny',
        risk: 'ADMIN',
        reason: `Tool ${toolName} not in Phase 1 whitelist`,
      };
    }

    // 2. Validate principal_id format (UUID)
    if (!this.isValidUUID(principal_id)) {
      return {
        action: 'deny',
        risk: 'ADMIN',
        reason: 'Invalid principal_id format (must be UUID)',
      };
    }

    // 3. Check rate limits
    const rateLimitCheck = this.checkRateLimits(toolName, principal_id);
    if (!rateLimitCheck.allowed) {
      return {
        action: 'deny',
        risk: TOOL_RISK_MATRIX.get(toolName)!,
        reason: rateLimitCheck.reason,
      };
    }

    // 4. Get risk classification
    const risk = TOOL_RISK_MATRIX.get(toolName)!;

    // 5. Record rate limit usage
    this.recordUsage(toolName, principal_id, risk);

    // 6. Apply policy based on risk
    if (risk === 'READ') {
      return {
        action: 'allow',
        risk,
        reason: 'READ tools auto-approved',
      };
    }

    // WRITE/DESTRUCTIVE/MONEY/ADMIN require approval
    const token = await this.approvalQueue.enqueue(
      toolName,
      args,
      principal_id,
      connection_id ?? ''
    );

    return {
      action: 'require_approval',
      risk,
      reason: `${risk} tool requires CEO approval`,
      approval_token: token.token,
      expires_at: token.expires_at,
    };
  }

  private isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private checkRateLimits(
    toolName: string,
    principal_id: string
  ): { allowed: boolean; reason: string } {
    this.maybeResetRateLimits();

    const toolKey = `${principal_id}:${toolName}`;
    const toolCount = this.rateLimitState.toolCounts.get(toolKey) ?? 0;
    const principalCount = this.rateLimitState.principalCounts.get(principal_id) ?? 0;
    const risk = TOOL_RISK_MATRIX.get(toolName);
    const destructiveCount = this.rateLimitState.destructiveCounts.get(principal_id) ?? 0;

    if (toolCount >= PolicyEngine.PER_TOOL_PER_MINUTE) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${toolName} (${PolicyEngine.PER_TOOL_PER_MINUTE}/min)`,
      };
    }

    if (principalCount >= PolicyEngine.PER_PRINCIPAL_PER_MINUTE) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: principal (${PolicyEngine.PER_PRINCIPAL_PER_MINUTE}/min)`,
      };
    }

    if (risk === 'DESTRUCTIVE' && destructiveCount >= PolicyEngine.DESTRUCTIVE_PER_HOUR) {
      return {
        allowed: false,
        reason: `Destructive operation limit exceeded (${PolicyEngine.DESTRUCTIVE_PER_HOUR}/hour)`,
      };
    }

    return { allowed: true, reason: '' };
  }

  private recordUsage(toolName: string, principal_id: string, risk: ToolRisk): void {
    const toolKey = `${principal_id}:${toolName}`;
    this.rateLimitState.toolCounts.set(
      toolKey,
      (this.rateLimitState.toolCounts.get(toolKey) ?? 0) + 1
    );
    this.rateLimitState.principalCounts.set(
      principal_id,
      (this.rateLimitState.principalCounts.get(principal_id) ?? 0) + 1
    );
    if (risk === 'DESTRUCTIVE') {
      this.rateLimitState.destructiveCounts.set(
        principal_id,
        (this.rateLimitState.destructiveCounts.get(principal_id) ?? 0) + 1
      );
    }
  }

  private maybeResetRateLimits(): void {
    const now = new Date();
    const elapsed = now.getTime() - this.rateLimitState.lastReset.getTime();

    // Reset tool and principal counts every minute
    if (elapsed >= 60 * 1000) {
      this.rateLimitState.toolCounts.clear();
      this.rateLimitState.principalCounts.clear();
      this.rateLimitState.lastReset = now;
    }

    // Reset destructive counts every hour
    if (elapsed >= 60 * 60 * 1000) {
      this.rateLimitState.destructiveCounts.clear();
    }
  }
}
```

---

### 3. ApprovalQueue Implementation

**File**: `src/tools/approval-queue.ts`

```typescript
/**
 * ApprovalQueue - Approval token management with expiry
 * P0 requirement: 5min expiry, one-time use
 */

import crypto from 'crypto';
import type { ApprovalToken } from './types.js';

export class ApprovalQueue {
  private tokens: Map<string, ApprovalToken> = new Map();
  private static readonly TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

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
      expires_at: new Date(Date.now() + ApprovalQueue.TOKEN_EXPIRY_MS),
      used: false,
      idempotency_key: crypto.randomUUID(),
      created_at: new Date(),
    };

    this.tokens.set(token.token, token);
    return token;
  }

  async validate(tokenId: string): Promise<ApprovalToken | null> {
    const token = this.tokens.get(tokenId);

    if (!token) {
      return null;
    }

    if (token.used) {
      throw new Error('Approval token already used');
    }

    if (token.expires_at < new Date()) {
      this.tokens.delete(tokenId);
      throw new Error('Approval token expired');
    }

    // Mark as used (one-time use)
    token.used = true;
    return token;
  }

  async getTokenDetails(tokenId: string): Promise<ApprovalToken | null> {
    return this.tokens.get(tokenId) ?? null;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let removed = 0;

    for (const [tokenId, token] of this.tokens) {
      if (token.expires_at < now || token.used) {
        this.tokens.delete(tokenId);
        removed++;
      }
    }

    return removed;
  }

  private hashArgs(args: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
  }
}
```

---

### 4. ToolRegistry Implementation

**File**: `src/tools/tool-registry.ts`

```typescript
/**
 * ToolRegistry - Tool discovery with 10-tool whitelist
 * Phase 1: Only curated tools allowed
 */

import type { Tool } from './types.js';
import { ComposioClient } from './composio-client.js';

// Phase 1 whitelist (from TOOL-POLICY.md)
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

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class ToolRegistry {
  private composioClient: ComposioClient;
  private cache: Map<string, CacheEntry<Tool[]>> = new Map();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(composioClient: ComposioClient) {
    this.composioClient = composioClient;
  }

  async discoverTools(principal_id: string, apps?: string[]): Promise<Tool[]> {
    const cacheKey = `${principal_id}:${apps?.join(',') ?? 'all'}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ToolRegistry.CACHE_TTL_MS) {
      return cached.value;
    }

    // Fetch from Composio
    const allTools = await this.composioClient.getTools(principal_id, apps ?? []);

    // Filter to whitelist ONLY
    const allowedTools = allTools.filter((tool) => PHASE_1_TOOLS.includes(tool.name));

    // Cache result
    this.cache.set(cacheKey, { value: allowedTools, timestamp: Date.now() });

    return allowedTools;
  }

  async getToolByName(name: string, principal_id: string): Promise<Tool | null> {
    if (!PHASE_1_TOOLS.includes(name)) {
      throw new Error(`Tool ${name} not in Phase 1 whitelist`);
    }

    const tools = await this.discoverTools(principal_id);
    return tools.find((t) => t.name === name) ?? null;
  }

  isToolAllowed(name: string): boolean {
    return PHASE_1_TOOLS.includes(name);
  }

  clearCache(principal_id?: string): void {
    if (principal_id) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(principal_id)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
```

---

### 5. ToolExecutor Implementation

**File**: `src/tools/tool-executor.ts`

```typescript
/**
 * ToolExecutor - Execute tools with validation
 * Includes input validation, Brain tracking, audit logging
 */

import crypto from 'crypto';
import { z } from 'zod';
import type { ToolCall, ToolResult, ToolExecutionEvent } from './types.js';
import { ComposioClient } from './composio-client.js';
import { AuditLogger } from './audit-logger.js';

// Input validation schemas (from TOOL-POLICY.md)
const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  'github.get_repo': z.object({
    owner: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/),
    repo: z.string().max(100).regex(/^[a-zA-Z0-9_-]+$/),
  }),
  'github.get_issue': z.object({
    owner: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/),
    repo: z.string().max(100).regex(/^[a-zA-Z0-9_-]+$/),
    issue_number: z.number().int().positive(),
  }),
  'github.create_issue': z.object({
    owner: z.string().max(39).regex(/^[a-zA-Z0-9-]+$/),
    repo: z.string().max(100).regex(/^[a-zA-Z0-9_-]+$/),
    title: z.string().max(256),
    body: z.string().max(64 * 1024).optional(),
    labels: z.array(z.string().max(50)).max(10).optional(),
  }),
  'gmail.list_messages': z.object({
    max_results: z.number().int().min(1).max(100).default(10),
    query: z.string().max(512).optional(),
  }),
  'gmail.send_message': z.object({
    to: z.string().email().max(254),
    subject: z.string().max(256),
    body: z.string().max(100 * 1024),
    cc: z.string().email().optional(),
    bcc: z.string().email().optional(),
  }),
  'google_calendar.list_events': z.object({
    calendar_id: z.string().default('primary'),
    time_min: z.string().datetime().optional(),
    time_max: z.string().datetime().optional(),
    max_results: z.number().int().min(1).max(100).default(10),
  }),
  'google_calendar.create_event': z.object({
    calendar_id: z.string().default('primary'),
    summary: z.string().max(256),
    start: z.string().datetime(),
    end: z.string().datetime(),
    description: z.string().max(8 * 1024).optional(),
    attendees: z.array(z.string().email()).max(50).optional(),
  }),
  'slack.list_channels': z.object({
    exclude_archived: z.boolean().default(true),
    limit: z.number().int().min(1).max(1000).default(100),
  }),
  'slack.send_message': z.object({
    channel: z.string(),
    text: z.string().max(40 * 1024),
    thread_ts: z.string().optional(),
  }),
  'shell.execute_command': z.object({
    command: z.string().max(1024),
    cwd: z.string().optional(),
    timeout: z.number().int().min(1000).max(300000).default(30000),
  }),
};

// Denied patterns for security
const DENIED_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /data:text\/html/i,
  /\.\.\//,
  /\.\.\\/,
  /'.*OR.*'/i,
  /;\s*DROP\s+TABLE/i,
];

export class ToolExecutor {
  private composioClient: ComposioClient;
  private auditLogger: AuditLogger;
  private brainRecordEvent?: (event: ToolExecutionEvent) => Promise<void>;

  constructor(
    composioClient: ComposioClient,
    auditLogger: AuditLogger,
    brainRecordEvent?: (event: ToolExecutionEvent) => Promise<void>
  ) {
    this.composioClient = composioClient;
    this.auditLogger = auditLogger;
    this.brainRecordEvent = brainRecordEvent;
  }

  async execute(
    toolCall: ToolCall,
    context: { connection_id?: string }
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Validate input
    const validation = await this.validateInput(toolCall.name, toolCall.arguments);
    if (!validation.success) {
      return {
        id: toolCall.id,
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: validation.errors,
        },
        duration_ms: Date.now() - startTime,
      };
    }

    // 2. Execute via Composio
    let result: ToolResult;
    try {
      const composioResult = await this.composioClient.executeTool(
        toolCall,
        toolCall.principal_id
      );
      result = {
        id: toolCall.id,
        success: true,
        output: composioResult,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      result = {
        id: toolCall.id,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    // 3. Track in Brain Layer 1 (NO SECRETS)
    if (this.brainRecordEvent) {
      await this.brainRecordEvent({
        type: 'tool_execution',
        tool_name: toolCall.name,
        principal_id: toolCall.principal_id,
        input_hash: this.hashInput(toolCall.arguments),
        output_summary: this.truncate(JSON.stringify(result.output), 256),
        success: result.success,
        latency_ms: result.duration_ms,
        cost_usd: 0,
        connection_id: context.connection_id ?? '',
        timestamp: new Date(),
      });
    }

    // 4. Audit log
    await this.auditLogger.log({
      id: crypto.randomUUID(),
      principal_id: toolCall.principal_id,
      tool: toolCall.name,
      args_hash: this.hashInput(toolCall.arguments),
      connection_id: context.connection_id ?? '',
      result_summary: this.truncate(JSON.stringify(result.output), 256),
      duration_ms: result.duration_ms,
      status: result.success ? 'success' : 'failure',
      risk: 'READ', // Will be set by caller
      error_code: result.error?.code,
      timestamp: new Date(),
    });

    return result;
  }

  async validateInput(
    toolName: string,
    input: unknown
  ): Promise<{ success: boolean; errors?: string[] }> {
    const schema = TOOL_SCHEMAS[toolName];
    if (!schema) {
      return { success: false, errors: [`Unknown tool: ${toolName}`] };
    }

    // Check for denied patterns
    const inputStr = JSON.stringify(input);
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(inputStr)) {
        return { success: false, errors: ['Input contains blocked pattern'] };
      }
    }

    // Validate against schema
    const result = schema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      );
      return { success: false, errors };
    }

    return { success: true };
  }

  private hashInput(input: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }
}
```

---

### 6. Gateway Methods

**File**: `src/gateway/methods/tools.ts`

```typescript
/**
 * Gateway methods for tool operations
 * 6 methods: discover, execute, approve, connections, disconnect, dry-run
 */

import type { GatewayServer } from '../server.js';
import { ToolControlPlane } from '../../tools/control-plane.js';

interface ToolsDiscoverParams {
  principal_id: string;
  apps?: string[];
}

interface ToolsExecuteParams {
  principal_id: string;
  tool_name: string;
  arguments: unknown;
  connection_id?: string;
  approval_token?: string;
}

interface ToolsApproveParams {
  approval_token: string;
}

interface ToolsConnectionsParams {
  principal_id: string;
}

interface ToolsDisconnectParams {
  principal_id: string;
  connection_id: string;
}

interface ToolsDryRunParams {
  tool_name: string;
  arguments: unknown;
}

export function registerToolsMethods(
  server: GatewayServer,
  controlPlane: ToolControlPlane
): void {
  // 1. tools.discover - List available tools
  server.registerMethod('tools.discover', async (params) => {
    const { principal_id, apps } = params as ToolsDiscoverParams;
    const tools = await controlPlane.discoverTools(principal_id, apps);
    return { tools, total: tools.length };
  });

  // 2. tools.execute - Execute tool with policy check
  server.registerMethod('tools.execute', async (params) => {
    const { principal_id, tool_name, arguments: args, approval_token } =
      params as ToolsExecuteParams;

    // If approval token provided, execute with approval
    if (approval_token) {
      const result = await controlPlane.executeWithApproval(approval_token);
      return { status: 'success', result };
    }

    // Evaluate policy
    const decision = await controlPlane.evaluate(tool_name, args, principal_id);

    if (decision.action === 'allow') {
      // Auto-execute READ tools
      const result = await controlPlane.execute(tool_name, args, principal_id);
      return { status: 'success', result };
    }

    if (decision.action === 'require_approval') {
      return {
        status: 'pending_approval',
        approval_token: decision.approval_token,
        expires_at: decision.expires_at,
        message: `${decision.risk} tool requires CEO approval. Use tools.approve within 5 minutes.`,
      };
    }

    // Denied
    throw new Error(`Tool execution denied: ${decision.reason}`);
  });

  // 3. tools.approve - Approve pending execution
  server.registerMethod('tools.approve', async (params) => {
    const { approval_token } = params as ToolsApproveParams;
    const result = await controlPlane.executeWithApproval(approval_token);
    return { result, executed_at: new Date() };
  });

  // 4. tools.connections - List OAuth connections
  server.registerMethod('tools.connections', async (params) => {
    const { principal_id } = params as ToolsConnectionsParams;
    const connections = await controlPlane.getConnections(principal_id);
    return { connections, total: connections.length };
  });

  // 5. tools.disconnect - Remove OAuth connection
  server.registerMethod('tools.disconnect', async (params) => {
    const { principal_id, connection_id } = params as ToolsDisconnectParams;
    await controlPlane.disconnect(principal_id, connection_id);
    return { success: true, message: `Connection ${connection_id} removed` };
  });

  // 6. tools.dry-run - Simulate without executing (Expert 9)
  server.registerMethod('tools.dry-run', async (params) => {
    const { tool_name, arguments: args } = params as ToolsDryRunParams;
    const result = await controlPlane.dryRun(tool_name, args);
    return result;
  });
}
```

---

## Day-by-Day Checklist

### Day 1-2: Setup & Dependencies
- [ ] Add `@composio/core@0.6.3`
- [ ] Create `src/tools/` structure (9 files)
- [ ] Create `src/tools/types.ts`
- [ ] Verify EndiorBot runs without COMPOSIO_API_KEY
- [ ] Run existing tests (all pass)

### Day 3-4: ToolControlPlane
- [ ] Implement `PolicyEngine`
- [ ] Implement `ApprovalQueue`
- [ ] Implement `AuditLogger`
- [ ] Add rate limiting
- [ ] Write 20+ tests

### Day 5-6: Tool Registry & Executor
- [ ] Implement `ComposioClient`
- [ ] Implement `ToolRegistry` with whitelist
- [ ] Implement `ToolExecutor` with zod validation
- [ ] Add Brain Layer 1 tracking
- [ ] Write 15+ tests

### Day 7-8: Gateway Methods
- [ ] Create `src/gateway/methods/tools.ts`
- [ ] Register 6 methods
- [ ] Update METHOD_COUNTS
- [ ] Add authentication
- [ ] Write 12+ tests

### Day 9: OAuth & Principal Mapping
- [ ] Implement Device Code Flow
- [ ] Create `composio_connections` table
- [ ] Implement principal UUID mapping
- [ ] Test OAuth end-to-end

### Day 10: Testing & Documentation
- [ ] Run full test suite (3,171+ existing + 30+ new)
- [ ] Create `tools-integration.md`
- [ ] Update configuration reference
- [ ] G-Sprint-50 gate evaluation

---

## Testing Commands

```bash
# Run all tests
pnpm test

# Run tools tests only
pnpm test src/tools

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/tools/__tests__/policy-engine.test.ts

# Run security tests
pnpm test:security
```

---

## Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Safety | 0 unauthorized executions | PolicyEngine tests |
| Correctness | 100% validation | ToolExecutor tests |
| Audit | 100% logging | AuditLogger tests |
| Regression | 0 broken tests | `pnpm test` |
| Performance | < 300ms (cached) | Performance tests |

---

## Common Issues

### Issue 1: Composio API key not set
```
Error: Composio not configured
```
**Solution**: Set `COMPOSIO_API_KEY` or verify graceful degradation works.

### Issue 2: Rate limit exceeded
```
Error: Rate limit exceeded: github.get_repo (10/min)
```
**Solution**: Wait 1 minute or increase limits for testing.

### Issue 3: Approval token expired
```
Error: Approval token expired
```
**Solution**: Tokens expire after 5 minutes. Request new token.

---

## References

- [ADR-011: Composio Integration](../02-design/01-ADRs/ADR-011-Composio-Integration.md)
- [TOOL-POLICY.md](./TOOL-POLICY.md)
- [Sprint 50 Plan](../01-planning/sprint-50-plan.md)
- [Sprint 50 Requirements](../01-planning/sprint-50-requirements.md)
- [Technical Spec](../02-design/14-Technical-Specs/composio-integration-spec.md)

---

**Status**: READY TO START
**Next**: Day 1 - Setup & Dependencies

*SDLC Framework 6.1.1*
*Stage 04 - BUILD*
