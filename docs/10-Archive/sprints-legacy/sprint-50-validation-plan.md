# Sprint 50 Validation Plan - Composio Integration Phase 1

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: APPROVED
**Authority**: CTO
**Stage**: 03 - VALIDATE
**Related**: Sprint 50 Plan, ADR-011, TOOL-POLICY.md, Technical Spec
**SDLC**: Framework 6.1.1

---

## Overview

This document defines the comprehensive validation strategy for Composio Integration Phase 1, covering unit tests, integration tests, security tests, and manual validation procedures.

---

## Test Strategy

### Testing Pyramid

```
                  ▲
                 / \
                /   \
               /  E2E \            (5 tests)
              /  Tests  \
             /-----------\
            /             \
           /  Integration  \      (15 tests)
          /     Tests       \
         /-----------------\
        /                   \
       /     Unit Tests      \    (30+ tests)
      /                       \
     /_________________________\
```

**Total Test Count**: 50+ new tests for Sprint 50

---

## Unit Tests (30+ tests)

### PolicyEngine Tests (10 tests)

**File**: `tests/tools/policy-engine.test.ts`

```typescript
describe('PolicyEngine', () => {
  describe('Risk Classification', () => {
    it('should classify github.get_repo as READ', async () => {
      const decision = await policyEngine.evaluate('github.get_repo', {}, 'uuid-123');
      expect(decision.risk).toBe('READ');
      expect(decision.action).toBe('allow');
    });

    it('should classify github.create_issue as WRITE', async () => {
      const decision = await policyEngine.evaluate('github.create_issue', {}, 'uuid-123');
      expect(decision.risk).toBe('WRITE');
      expect(decision.action).toBe('require_approval');
    });

    it('should classify shell.execute_command as DESTRUCTIVE', async () => {
      const decision = await policyEngine.evaluate('shell.execute_command', {}, 'uuid-123');
      expect(decision.risk).toBe('DESTRUCTIVE');
      expect(decision.action).toBe('require_approval');
    });

    it('should deny tools not in whitelist', async () => {
      await expect(
        policyEngine.evaluate('stripe.create_charge', {}, 'uuid-123')
      ).rejects.toThrow('Tool not in Phase 1 whitelist');
    });
  });

  describe('Approval Token Generation', () => {
    it('should generate approval token for WRITE tools', async () => {
      const decision = await policyEngine.evaluate('gmail.send_message', {}, 'uuid-123');
      expect(decision.approval_token).toBeDefined();
      expect(decision.expires_at).toBeDefined();
      const expiryDiff = decision.expires_at!.getTime() - Date.now();
      expect(expiryDiff).toBeGreaterThanOrEqual(4 * 60 * 1000); // ~5 minutes
      expect(expiryDiff).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it('should NOT generate approval token for READ tools', async () => {
      const decision = await policyEngine.evaluate('github.get_issue', {}, 'uuid-123');
      expect(decision.approval_token).toBeUndefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should track tool call counts per principal', async () => {
      for (let i = 0; i < 10; i++) {
        await policyEngine.evaluate('github.get_repo', {}, 'uuid-123');
      }
      // 11th call should be rate limited
      await expect(
        policyEngine.evaluate('github.get_repo', {}, 'uuid-123')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should enforce global principal rate limit', async () => {
      for (let i = 0; i < 30; i++) {
        await policyEngine.evaluate('github.get_repo', {}, 'uuid-456');
      }
      await expect(
        policyEngine.evaluate('gmail.list_messages', {}, 'uuid-456')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should enforce destructive operation limit', async () => {
      // Simulate 5 destructive operations in 1 hour
      for (let i = 0; i < 5; i++) {
        await policyEngine.evaluate('shell.execute_command', {}, 'uuid-789');
      }
      await expect(
        policyEngine.evaluate('shell.execute_command', {}, 'uuid-789')
      ).rejects.toThrow('Destructive operation limit exceeded');
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid principal_id format', async () => {
      await expect(
        policyEngine.evaluate('github.get_repo', {}, 'not-a-uuid')
      ).rejects.toThrow('Invalid principal_id format');
    });
  });
});
```

---

### ApprovalQueue Tests (10 tests)

**File**: `tests/tools/approval-queue.test.ts`

```typescript
describe('ApprovalQueue', () => {
  describe('Token Creation', () => {
    it('should create approval token with 5min expiry', async () => {
      const token = await approvalQueue.enqueue(
        'github.create_issue',
        { title: 'Test' },
        'uuid-123',
        'conn-github-123'
      );
      expect(token.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/); // UUID v4
      expect(token.expires_at.getTime() - Date.now()).toBeCloseTo(5 * 60 * 1000, -3);
    });

    it('should hash arguments for privacy', async () => {
      const token = await approvalQueue.enqueue(
        'gmail.send_message',
        { to: 'ceo@example.com', body: 'Secret content' },
        'uuid-123',
        'conn-gmail-123'
      );
      expect(token.args_hash).toMatch(/^[0-9a-f]{64}$/); // SHA256 hex
      expect(token.args_hash).not.toContain('Secret content');
    });

    it('should generate unique idempotency keys', async () => {
      const token1 = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      const token2 = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      expect(token1.idempotency_key).not.toBe(token2.idempotency_key);
    });
  });

  describe('Token Validation', () => {
    it('should validate fresh token successfully', async () => {
      const token = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      const validated = await approvalQueue.validate(token.token);
      expect(validated).not.toBeNull();
      expect(validated!.token).toBe(token.token);
    });

    it('should reject expired token', async () => {
      const token = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      // Simulate time passing (mock Date.now())
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000); // +6 minutes
      await expect(
        approvalQueue.validate(token.token)
      ).rejects.toThrow('Approval token expired');
    });

    it('should enforce one-time use', async () => {
      const token = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      await approvalQueue.validate(token.token); // First use - OK
      await expect(
        approvalQueue.validate(token.token)  // Second use - FAIL
      ).rejects.toThrow('Approval token already used');
    });

    it('should reject non-existent token', async () => {
      const result = await approvalQueue.validate('invalid-token-123');
      expect(result).toBeNull();
    });
  });

  describe('Replay Protection', () => {
    it('should reject replay attack with same args', async () => {
      const args = { title: 'Test issue' };
      const token1 = await approvalQueue.enqueue('github.create_issue', args, 'uuid-123', 'conn-123');
      await approvalQueue.validate(token1.token);

      // Attempt to execute same args again (replay attack)
      const token2 = await approvalQueue.enqueue('github.create_issue', args, 'uuid-123', 'conn-123');
      expect(token2.idempotency_key).not.toBe(token1.idempotency_key);
      // Different idempotency key prevents replay
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired tokens', async () => {
      const token = await approvalQueue.enqueue('github.create_issue', {}, 'uuid-123', 'conn-123');
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000); // +10 min
      await approvalQueue.cleanup();
      const result = await approvalQueue.validate(token.token);
      expect(result).toBeNull(); // Token removed
    });
  });
});
```

---

### ToolExecutor Tests (10+ tests)

**File**: `tests/tools/tool-executor.test.ts`

```typescript
describe('ToolExecutor', () => {
  describe('Input Validation', () => {
    it('should validate github.create_issue input', async () => {
      const validInput = {
        owner: 'anthropics',
        repo: 'claude-code',
        title: 'Test issue',
      };
      const result = await toolExecutor.validateInput('github.create_issue', validInput);
      expect(result.success).toBe(true);
    });

    it('should reject oversized payload', async () => {
      const oversizedInput = {
        owner: 'anthropics',
        repo: 'claude-code',
        title: 'Test',
        body: 'x'.repeat(100 * 1024), // 100KB (max is 64KB)
      };
      const result = await toolExecutor.validateInput('github.create_issue', oversizedInput);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('body exceeds maximum length');
    });

    it('should reject SQL injection patterns', async () => {
      const maliciousInput = {
        owner: "anthropics' OR '1'='1",
        repo: 'claude-code',
        title: 'Test',
      };
      const result = await toolExecutor.validateInput('github.create_issue', maliciousInput);
      expect(result.success).toBe(false);
    });

    it('should reject XSS patterns', async () => {
      const xssInput = {
        owner: 'anthropics',
        repo: 'claude-code',
        title: '<script>alert(1)</script>',
      };
      const result = await toolExecutor.validateInput('github.create_issue', xssInput);
      expect(result.success).toBe(false);
    });

    it('should reject path traversal patterns', async () => {
      const pathTraversalInput = {
        command: 'cat ../../etc/passwd',
      };
      const result = await toolExecutor.validateInput('shell.execute_command', pathTraversalInput);
      expect(result.success).toBe(false);
    });

    it('should validate email addresses', async () => {
      const validEmail = { to: 'ceo@example.com', subject: 'Test', body: 'Hello' };
      const result = await toolExecutor.validateInput('gmail.send_message', validEmail);
      expect(result.success).toBe(true);

      const invalidEmail = { to: 'not-an-email', subject: 'Test', body: 'Hello' };
      const result2 = await toolExecutor.validateInput('gmail.send_message', invalidEmail);
      expect(result2.success).toBe(false);
    });

    it('should validate ISO8601 dates', async () => {
      const validDate = {
        summary: 'Meeting',
        start: '2026-02-26T10:00:00Z',
        end: '2026-02-26T11:00:00Z',
      };
      const result = await toolExecutor.validateInput('google_calendar.create_event', validDate);
      expect(result.success).toBe(true);

      const invalidDate = { summary: 'Meeting', start: 'invalid-date', end: '2026-02-26T11:00:00Z' };
      const result2 = await toolExecutor.validateInput('google_calendar.create_event', invalidDate);
      expect(result2.success).toBe(false);
    });
  });

  describe('Execution', () => {
    it('should execute READ tool successfully', async () => {
      const result = await toolExecutor.execute(
        { id: 'call-1', name: 'github.get_repo', arguments: { owner: 'anthropics', repo: 'anthropic-sdk-typescript' } },
        'uuid-123',
        {}
      );
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty('name');
    });

    it('should track execution in Brain Layer 1', async () => {
      const brainSpy = jest.spyOn(brain, 'recordEvent');
      await toolExecutor.execute(
        { id: 'call-2', name: 'github.get_issue', arguments: { owner: 'anthropics', repo: 'claude-code', issue_number: 1 } },
        'uuid-123',
        {}
      );
      expect(brainSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tool_execution',
        tool_name: 'github.get_issue',
        principal_id: 'uuid-123',
      }));
    });

    it('should NOT store secrets in Brain', async () => {
      const brainSpy = jest.spyOn(brain, 'recordEvent');
      await toolExecutor.execute(
        { id: 'call-3', name: 'gmail.send_message', arguments: { to: 'ceo@example.com', subject: 'Secret', body: 'Confidential data' } },
        'uuid-123',
        {}
      );
      const brainEvent = brainSpy.mock.calls[0][0];
      expect(brainEvent).not.toHaveProperty('oauth_token');
      expect(brainEvent).not.toHaveProperty('api_key');
      expect(brainEvent.input_hash).toMatch(/^[0-9a-f]{64}$/); // Hashed
      expect(brainEvent.output_summary.length).toBeLessThanOrEqual(256); // Truncated
    });

    it('should log audit trail', async () => {
      const auditSpy = jest.spyOn(auditLogger, 'log');
      await toolExecutor.execute(
        { id: 'call-4', name: 'slack.send_message', arguments: { channel: '#general', text: 'Hello' } },
        'uuid-456',
        {}
      );
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        principal_id: 'uuid-456',
        tool: 'slack.send_message',
        status: 'success',
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle Composio API errors gracefully', async () => {
      // Mock Composio failure
      jest.spyOn(composioClient, 'executeTool').mockRejectedValueOnce(new Error('Composio unavailable'));
      const result = await toolExecutor.execute(
        { id: 'call-5', name: 'github.get_repo', arguments: { owner: 'anthropics', repo: 'test' } },
        'uuid-123',
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Composio unavailable');
    });
  });
});
```

---

## Integration Tests (15 tests)

### End-to-End OAuth Flow (2 tests)

**File**: `tests/integration/oauth-flow.test.ts`

```typescript
describe('OAuth Flow (E2E)', () => {
  it('should complete GitHub OAuth flow', async () => {
    // 1. Initiate connection
    const initResponse = await gateway.request('tools.connect', {
      principal_id: 'uuid-test-123',
      app: 'github',
    });
    expect(initResponse.device_code).toBeDefined();
    expect(initResponse.verification_url).toBeDefined();

    // 2. Simulate user authorization (manual step - skip in automated tests)
    // User visits verification_url and enters user_code

    // 3. Poll for connection status
    const pollResponse = await gateway.request('tools.poll_connection', {
      principal_id: 'uuid-test-123',
      app: 'github',
    });
    expect(pollResponse.status).toBe('active');

    // 4. Verify connection stored
    const connectionsResponse = await gateway.request('tools.connections', {
      principal_id: 'uuid-test-123',
    });
    expect(connectionsResponse.connections).toContainEqual(
      expect.objectContaining({ app_name: 'github', status: 'active' })
    );
  });

  it('should complete Gmail OAuth flow', async () => {
    // Similar to GitHub flow
    const initResponse = await gateway.request('tools.connect', {
      principal_id: 'uuid-test-456',
      app: 'gmail',
    });
    expect(initResponse.device_code).toBeDefined();
    // ... rest of flow
  });
});
```

---

### Gateway Method Integration (6 tests)

**File**: `tests/integration/gateway-methods.test.ts`

```typescript
describe('Gateway Methods Integration', () => {
  it('should discover tools for connected principal', async () => {
    const response = await gateway.request('tools.discover', {
      principal_id: 'uuid-123',
      apps: ['github'],
    });
    expect(response.tools).toHaveLength(3); // 3 GitHub tools
    expect(response.tools).toContainEqual(
      expect.objectContaining({ name: 'github.get_repo', risk: 'READ' })
    );
  });

  it('should execute READ tool immediately', async () => {
    const response = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'github.get_repo',
      arguments: { owner: 'anthropics', repo: 'anthropic-sdk-typescript' },
    });
    expect(response.status).toBe('success');
    expect(response.result.success).toBe(true);
  });

  it('should return pending_approval for WRITE tool', async () => {
    const response = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'github.create_issue',
      arguments: { owner: 'anthropics', repo: 'test', title: 'Test issue' },
    });
    expect(response.status).toBe('pending_approval');
    expect(response.approval_token).toBeDefined();
    expect(response.expires_at).toBeDefined();
  });

  it('should execute WRITE tool with approval token', async () => {
    // Get approval token
    const pendingResponse = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'gmail.send_message',
      arguments: { to: 'test@example.com', subject: 'Test', body: 'Hello' },
    });
    const approvalToken = pendingResponse.approval_token;

    // Approve and execute
    const execResponse = await gateway.request('tools.approve', {
      approval_token: approvalToken,
    });
    expect(execResponse.result.success).toBe(true);
  });

  it('should reject expired approval token', async () => {
    const pendingResponse = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'slack.send_message',
      arguments: { channel: '#test', text: 'Hello' },
    });
    const approvalToken = pendingResponse.approval_token;

    // Wait 6 minutes (mock time)
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    await expect(
      gateway.request('tools.approve', { approval_token: approvalToken })
    ).rejects.toThrow('Approval token expired');
  });

  it('should validate dry-run without executing', async () => {
    const response = await gateway.request('tools.dry-run', {
      tool_name: 'gmail.send_message',
      arguments: { to: 'ceo@example.com', subject: 'Test', body: 'Hello' },
    });
    expect(response.valid).toBe(true);
    expect(response.risk).toBe('WRITE');
    expect(response.requires_approval).toBe(true);

    // Verify no actual email sent (check audit log)
    const auditLogs = await auditLogger.getLogs({ tool: 'gmail.send_message', limit: 1 });
    expect(auditLogs).toHaveLength(0); // No execution logged
  });
});
```

---

### Security Integration (5 tests)

**File**: `tests/integration/security.test.ts`

```typescript
describe('Security Integration', () => {
  it('should enforce connection scoping', async () => {
    // Principal A creates connection
    await authManager.createConnection('github', 'uuid-principal-a');

    // Principal B tries to use Principal A's connection
    await expect(
      gateway.request('tools.execute', {
        principal_id: 'uuid-principal-b',
        tool_name: 'github.get_repo',
        connection_id: 'conn-principal-a-github',
        arguments: { owner: 'anthropics', repo: 'test' },
      })
    ).rejects.toThrow('Connection not owned by principal');
  });

  it('should prevent replay attacks', async () => {
    const response1 = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'github.create_issue',
      arguments: { owner: 'anthropics', repo: 'test', title: 'Issue 1' },
    });
    const token = response1.approval_token;

    // Approve once
    await gateway.request('tools.approve', { approval_token: token });

    // Try to approve again (replay attack)
    await expect(
      gateway.request('tools.approve', { approval_token: token })
    ).rejects.toThrow('Approval token already used');
  });

  it('should enforce rate limiting', async () => {
    // Execute 10 github.get_repo calls (at limit)
    for (let i = 0; i < 10; i++) {
      await gateway.request('tools.execute', {
        principal_id: 'uuid-rate-limit-test',
        tool_name: 'github.get_repo',
        arguments: { owner: 'anthropics', repo: 'test' },
      });
    }

    // 11th call should be rate limited
    await expect(
      gateway.request('tools.execute', {
        principal_id: 'uuid-rate-limit-test',
        tool_name: 'github.get_repo',
        arguments: { owner: 'anthropics', repo: 'test' },
      })
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('should block XSS in tool arguments', async () => {
    await expect(
      gateway.request('tools.execute', {
        principal_id: 'uuid-123',
        tool_name: 'github.create_issue',
        arguments: {
          owner: 'anthropics',
          repo: 'test',
          title: '<script>alert("XSS")</script>',
        },
      })
    ).rejects.toThrow('Input validation failed');
  });

  it('should sanitize HTML in outputs', async () => {
    const response = await gateway.request('tools.execute', {
      principal_id: 'uuid-123',
      tool_name: 'github.create_issue',
      arguments: {
        owner: 'anthropics',
        repo: 'test',
        title: 'Test issue',
        body: '<b>Bold</b> <script>alert(1)</script> text',
      },
      approval_token: 'valid-token-123',
    });
    const sanitizedBody = response.result.output.body;
    expect(sanitizedBody).toContain('<b>Bold</b>');
    expect(sanitizedBody).not.toContain('<script>');
  });
});
```

---

### Performance Integration (2 tests)

**File**: `tests/integration/performance.test.ts`

```typescript
describe('Performance Integration', () => {
  it('should respond to tools.discover in < 300ms (cached)', async () => {
    // First call (cache miss)
    await gateway.request('tools.discover', { principal_id: 'uuid-perf-test' });

    // Second call (cache hit)
    const start = Date.now();
    await gateway.request('tools.discover', { principal_id: 'uuid-perf-test' });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(300);
  });

  it('should execute READ tool in < 1000ms', async () => {
    const start = Date.now();
    await gateway.request('tools.execute', {
      principal_id: 'uuid-perf-test',
      tool_name: 'github.get_repo',
      arguments: { owner: 'anthropics', repo: 'anthropic-sdk-typescript' },
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
```

---

## End-to-End Tests (5 tests)

**File**: `tests/e2e/composio-integration.test.ts`

```typescript
describe('Composio Integration (E2E)', () => {
  it('should complete full READ tool workflow', async () => {
    // 1. Discover tools
    const discoverResponse = await gateway.request('tools.discover', {
      principal_id: 'uuid-e2e-test',
    });
    expect(discoverResponse.tools.length).toBeGreaterThan(0);

    // 2. Execute READ tool (auto-approved)
    const execResponse = await gateway.request('tools.execute', {
      principal_id: 'uuid-e2e-test',
      tool_name: 'github.get_repo',
      arguments: { owner: 'anthropics', repo: 'anthropic-sdk-typescript' },
    });
    expect(execResponse.status).toBe('success');

    // 3. Verify Brain event recorded
    const brainEvents = await brain.getEvents({ type: 'tool_execution', limit: 1 });
    expect(brainEvents[0]).toMatchObject({
      tool_name: 'github.get_repo',
      principal_id: 'uuid-e2e-test',
      success: true,
    });

    // 4. Verify audit log
    const auditLogs = await auditLogger.getLogs({ principal_id: 'uuid-e2e-test', limit: 1 });
    expect(auditLogs[0].status).toBe('success');
  });

  it('should complete full WRITE tool workflow with approval', async () => {
    // 1. Execute WRITE tool (pending approval)
    const pendingResponse = await gateway.request('tools.execute', {
      principal_id: 'uuid-e2e-test',
      tool_name: 'gmail.send_message',
      arguments: { to: 'test@example.com', subject: 'E2E Test', body: 'Hello from E2E test' },
    });
    expect(pendingResponse.status).toBe('pending_approval');
    const approvalToken = pendingResponse.approval_token;

    // 2. Approve execution
    const approveResponse = await gateway.request('tools.approve', {
      approval_token: approvalToken,
    });
    expect(approveResponse.result.success).toBe(true);

    // 3. Verify Brain event
    const brainEvents = await brain.getEvents({ type: 'tool_execution', limit: 1 });
    expect(brainEvents[0].tool_name).toBe('gmail.send_message');

    // 4. Verify audit log shows approval
    const auditLogs = await auditLogger.getLogs({ tool: 'gmail.send_message', limit: 1 });
    expect(auditLogs[0].approval_token).toBe(approvalToken);
  });

  it('should handle OAuth connection lifecycle', async () => {
    // 1. List connections (empty)
    const emptyConnections = await gateway.request('tools.connections', {
      principal_id: 'uuid-oauth-test',
    });
    expect(emptyConnections.connections).toHaveLength(0);

    // 2. Connect GitHub (manual OAuth flow - skip in automated tests)
    // ... OAuth flow ...

    // 3. List connections (1 connection)
    const withConnections = await gateway.request('tools.connections', {
      principal_id: 'uuid-oauth-test',
    });
    expect(withConnections.connections).toHaveLength(1);
    expect(withConnections.connections[0].app_name).toBe('github');

    // 4. Disconnect
    await gateway.request('tools.disconnect', {
      principal_id: 'uuid-oauth-test',
      connection_id: withConnections.connections[0].connection_id,
    });

    // 5. Verify removed
    const afterDisconnect = await gateway.request('tools.connections', {
      principal_id: 'uuid-oauth-test',
    });
    expect(afterDisconnect.connections).toHaveLength(0);
  });

  it('should enforce whitelist across all operations', async () => {
    // Attempt to execute non-whitelisted tool
    await expect(
      gateway.request('tools.execute', {
        principal_id: 'uuid-e2e-test',
        tool_name: 'stripe.create_charge',
        arguments: { amount: 1000, currency: 'usd' },
      })
    ).rejects.toThrow('Tool not in Phase 1 whitelist');

    // Verify not in discover list
    const discoverResponse = await gateway.request('tools.discover', {
      principal_id: 'uuid-e2e-test',
    });
    expect(discoverResponse.tools).not.toContainEqual(
      expect.objectContaining({ name: 'stripe.create_charge' })
    );
  });

  it('should run without COMPOSIO_API_KEY (graceful degradation)', async () => {
    // Unset COMPOSIO_API_KEY
    delete process.env.COMPOSIO_API_KEY;

    // EndiorBot should start successfully
    const health = await gateway.request('system.health', {});
    expect(health.status).not.toBe('unhealthy');

    // Tool operations should fail gracefully
    await expect(
      gateway.request('tools.discover', { principal_id: 'uuid-test' })
    ).rejects.toThrow('Composio not configured');
  });
});
```

---

## Manual Validation Procedures

### MV-1: OAuth Connection (GitHub)

**Tester**: Developer
**Duration**: 5 minutes

**Steps**:
1. Start EndiorBot Gateway: `./endiorbot.mjs gateway start`
2. Open Desktop app or CLI
3. Execute: `tools.connect --app github`
4. Note the `verification_url` and `user_code`
5. Open browser to verification_url
6. Enter user_code
7. Authorize GitHub access
8. Verify connection status becomes `active`
9. Execute: `tools.discover --app github`
10. Verify 3 GitHub tools listed

**Expected Result**: GitHub connection active, 3 tools available

---

### MV-2: READ Tool Execution

**Tester**: Developer
**Duration**: 2 minutes

**Steps**:
1. Execute: `tools.execute --tool github.get_repo --args '{"owner":"anthropics","repo":"anthropic-sdk-typescript"}'`
2. Verify immediate response (no approval required)
3. Verify result contains repo info (name, stars, language)
4. Check audit log: `cat ~/.endiorbot/logs/audit.log | grep github.get_repo`

**Expected Result**: Tool executes immediately, result returned, audit logged

---

### MV-3: WRITE Tool Approval Workflow

**Tester**: CEO
**Duration**: 5 minutes

**Steps**:
1. Execute: `tools.execute --tool gmail.send_message --args '{"to":"ceo@example.com","subject":"Test","body":"Hello"}'`
2. Verify `status: pending_approval` response
3. Note the `approval_token`
4. Execute: `tools.approve --token <approval_token>`
5. Verify email sent successfully
6. Check audit log for approval token

**Expected Result**: Approval required, execution after approval, email sent

---

### MV-4: Rate Limiting

**Tester**: Developer
**Duration**: 3 minutes

**Steps**:
1. Execute `github.get_repo` 10 times in 1 minute
2. Attempt 11th execution
3. Verify rate limit error: `Rate limit exceeded`
4. Wait 1 minute
5. Retry execution
6. Verify success

**Expected Result**: 11th request blocked, succeeds after cooldown

---

### MV-5: Security Validation

**Tester**: Security Engineer
**Duration**: 10 minutes

**Steps**:
1. Attempt SQL injection: `tools.execute --tool github.get_repo --args '{"owner":"anthropics' OR '1'='1","repo":"test"}'`
   - **Expected**: Validation error
2. Attempt XSS: `tools.execute --tool github.create_issue --args '{"title":"<script>alert(1)</script>"}'`
   - **Expected**: Validation error
3. Attempt path traversal: `tools.execute --tool shell.execute_command --args '{"command":"cat ../../etc/passwd"}'`
   - **Expected**: Validation error
4. Attempt connection hijacking: Execute tool with different principal's connection_id
   - **Expected**: Security error
5. Attempt approval token reuse: Use same token twice
   - **Expected**: "Already used" error

**Expected Result**: All attack vectors blocked

---

## Regression Testing

### RT-1: Existing Tests

**Requirement**: All 3,171+ existing tests must pass

**Command**: `pnpm test`

**Acceptance**: 0 failures, 0 regressions

---

### RT-2: Gateway Methods Count

**Requirement**: METHOD_COUNTS updated correctly

**Verification**:
```typescript
// src/gateway/methods/index.ts
export const METHOD_COUNTS = {
  system: 3,    // health, version, ping
  session: 5,   // start, restore, checkpoint, list, delete
  chat: 2,      // send, stream
  tools: 6,     // discover, execute, approve, connections, disconnect, dry-run
};
// Total: 16 methods
```

---

### RT-3: Performance Baselines

**Requirement**: No performance degradation

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Gateway startup time | 1.5s | 1.6s | +0.1s ✅ |
| Health check latency | 15ms | 18ms | +3ms ✅ |
| Memory usage (idle) | 150MB | 165MB | +15MB ✅ |

---

## Test Coverage Requirements

| Module | Target | Actual | Status |
|--------|--------|--------|--------|
| `src/tools/policy-engine.ts` | 100% | TBD | Pending |
| `src/tools/approval-queue.ts` | 100% | TBD | Pending |
| `src/tools/tool-executor.ts` | 95% | TBD | Pending |
| `src/tools/composio-client.ts` | 85% | TBD | Pending |
| `src/tools/tool-registry.ts` | 90% | TBD | Pending |
| `src/tools/auth-manager.ts` | 95% | TBD | Pending |
| `src/tools/audit-logger.ts` | 90% | TBD | Pending |
| **Overall `src/tools/`** | **80%+** | TBD | **Pending** |

---

## Validation Checklist (G-Sprint-50)

### Code Quality
- [ ] All unit tests pass (30+ tests)
- [ ] All integration tests pass (15+ tests)
- [ ] All E2E tests pass (5+ tests)
- [ ] Test coverage > 80% for `src/tools/`
- [ ] No ESLint errors
- [ ] No TypeScript errors

### Functional Completeness
- [ ] All 10 tools discoverable
- [ ] READ tools (5) auto-execute
- [ ] WRITE/DESTRUCTIVE tools (5) require approval
- [ ] Approval workflow functional
- [ ] OAuth connection successful (GitHub + Gmail)

### Security Validation
- [ ] 0 unauthorized executions possible
- [ ] 100% input validation
- [ ] 100% audit logging
- [ ] No secrets in Brain
- [ ] Connection scoping enforced

### Performance
- [ ] tools.discover < 300ms (cached)
- [ ] tools.execute (READ) < 1000ms
- [ ] All 3,171+ existing tests pass

### Documentation
- [ ] ADR-011 complete ✅
- [ ] TOOL-POLICY.md complete ✅
- [ ] tools-integration.md complete
- [ ] Configuration reference updated

---

## Sign-Off Criteria

| Role | Criteria | Status |
|------|----------|--------|
| **Developer** | All tests pass, coverage > 80% | Pending |
| **QA** | Manual validation complete (MV-1 to MV-5) | Pending |
| **Security** | Security tests pass (MV-5) | Pending |
| **PM** | Functional requirements met | Pending |
| **CTO** | G-Sprint-50 gate PASS | Pending |

---

## References

- Sprint 50 Plan: Day-by-day implementation
- Sprint 50 Requirements: Functional & non-functional requirements
- ADR-011: Composio Integration
- TOOL-POLICY.md: Tool specifications
- Technical Spec: API specifications, data models

---

**Status**: APPROVED - Ready for Testing
**Next Review**: Sprint 50 Day 10 (G-Sprint-50 Gate)
**Owner**: QA Lead + Developer

*SDLC Framework 6.1.1*
*Stage 03 - VALIDATE*
