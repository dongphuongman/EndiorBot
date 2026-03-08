/**
 * Tests for PermissionRelay — Sprint 85 (ADR-024 §8.4)
 *
 * Covers: createPermissionRequest, approve, deny, timeout (auto-deny),
 * auto-approve, dispose, audit trail, Telegram callbacks.
 *
 * @module tests/bridge/hooks/permission-relay
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PermissionRelay,
  PERMISSION_TIMEOUT_MS,
} from "../../../src/bridge/hooks/permission-relay.js";
import type { CreatePermissionParams } from "../../../src/bridge/hooks/permission-relay.js";

// ============================================================================
// Test helpers
// ============================================================================

function createMockTmux() {
  return {
    sendKeys: vi.fn().mockResolvedValue(undefined),
    sendEnter: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockResolvedValue("tmux 3.4"),
    createSession: vi.fn(),
    capturePane: vi.fn(),
    killWindow: vi.fn(),
    listWindows: vi.fn(),
    sessionExists: vi.fn(),
  };
}

function createMockAudit() {
  return {
    log: vi.fn().mockReturnValue({ ts: "", id: "inv_1", event: "hook_permission", actorId: "system", actor: "hook", details: {} }),
    getLogPath: vi.fn().mockReturnValue("/tmp/test.jsonl"),
  };
}

function createParams(overrides: Partial<CreatePermissionParams> = {}): CreatePermissionParams {
  return {
    sessionId: "bridge_12345_abc",
    tmuxTarget: "endiorbot:claude.0",
    agentType: "claude-code",
    toolName: "Bash",
    riskMode: "patch",
    nonce: "bridge_12345_abc:aabbccdd",
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("PermissionRelay", () => {
  let relay: PermissionRelay;
  let mockTmux: ReturnType<typeof createMockTmux>;
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockTmux = createMockTmux();
    mockAudit = createMockAudit();
    relay = new PermissionRelay({
      tmux: mockTmux as never,
      audit: mockAudit as never,
    });
  });

  afterEach(() => {
    relay.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Auto-approve
  // --------------------------------------------------------------------------

  it("auto-approves read mode — sends y + Enter, logs 2 audit events", async () => {
    await relay.autoApprove("bridge_123", "endiorbot:test.0", "Read");

    expect(mockTmux.sendKeys).toHaveBeenCalledWith("endiorbot:test.0", "y");
    expect(mockTmux.sendEnter).toHaveBeenCalledWith("endiorbot:test.0");

    // 2 audit events: hook_permission + permission_decision
    expect(mockAudit.log).toHaveBeenCalledTimes(2);
    expect(mockAudit.log.mock.calls[0]![0]).toMatchObject({
      event: "hook_permission",
      details: { action: "auto_approved" },
    });
    expect(mockAudit.log.mock.calls[1]![0]).toMatchObject({
      event: "permission_decision",
      details: { decision: "approve", method: "auto_approve" },
    });
  });

  // --------------------------------------------------------------------------
  // Create permission request
  // --------------------------------------------------------------------------

  it("creates a permission request and returns ID", async () => {
    const id = await relay.createPermissionRequest(createParams());

    expect(id).toMatch(/^perm_/);
    expect(relay.getAllPending()).toHaveLength(1);

    const pending = relay.getPending(id);
    expect(pending).toBeDefined();
    expect(pending!.toolName).toBe("Bash");
    expect(pending!.sessionId).toBe("bridge_12345_abc");
  });

  it("calls onPermissionRequest callback", async () => {
    const callback = vi.fn();
    relay = new PermissionRelay({
      tmux: mockTmux as never,
      audit: mockAudit as never,
      onPermissionRequest: callback,
    });

    await relay.createPermissionRequest(createParams());
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0].toolName).toBe("Bash");
  });

  it("sets filePath when provided", async () => {
    const id = await relay.createPermissionRequest(
      createParams({ filePath: "/src/main.ts" }),
    );
    const pending = relay.getPending(id);
    expect(pending!.filePath).toBe("/src/main.ts");
  });

  it("omits filePath when not provided", async () => {
    const id = await relay.createPermissionRequest(createParams());
    const pending = relay.getPending(id);
    expect(pending!.filePath).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Approve
  // --------------------------------------------------------------------------

  it("approves a pending request — sends y + Enter", async () => {
    const id = await relay.createPermissionRequest(createParams());
    const result = await relay.handleDecision(id, "approve", "ceo@endiorbot");

    expect(result.success).toBe(true);
    expect(mockTmux.sendKeys).toHaveBeenCalledWith("endiorbot:claude.0", "y");
    expect(mockTmux.sendEnter).toHaveBeenCalledWith("endiorbot:claude.0");
    expect(relay.getAllPending()).toHaveLength(0);
  });

  it("logs permission_decision on approve", async () => {
    const id = await relay.createPermissionRequest(createParams());
    mockAudit.log.mockClear();

    await relay.handleDecision(id, "approve", "ceo@endiorbot");

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "permission_decision",
        actorId: "ceo@endiorbot",
        actor: "telegram",
        details: expect.objectContaining({
          decision: "approve",
          toolName: "Bash",
        }),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Deny
  // --------------------------------------------------------------------------

  it("denies a pending request — sends n + Enter", async () => {
    const id = await relay.createPermissionRequest(createParams());
    const result = await relay.handleDecision(id, "deny", "ceo@endiorbot");

    expect(result.success).toBe(true);
    expect(mockTmux.sendKeys).toHaveBeenCalledWith("endiorbot:claude.0", "n");
    expect(mockTmux.sendEnter).toHaveBeenCalledWith("endiorbot:claude.0");
    expect(relay.getAllPending()).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Not found
  // --------------------------------------------------------------------------

  it("returns failure for unknown permission ID", async () => {
    const result = await relay.handleDecision("perm_unknown", "approve", "ceo@endiorbot");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("not found");
  });

  // --------------------------------------------------------------------------
  // Timeout (auto-deny)
  // --------------------------------------------------------------------------

  it("auto-denies on 5-minute timeout", async () => {
    const onTimeout = vi.fn();
    relay = new PermissionRelay({
      tmux: mockTmux as never,
      audit: mockAudit as never,
      onPermissionTimeout: onTimeout,
    });

    await relay.createPermissionRequest(createParams());
    expect(relay.getAllPending()).toHaveLength(1);

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS + 100);

    expect(relay.getAllPending()).toHaveLength(0);
    expect(mockTmux.sendKeys).toHaveBeenCalledWith("endiorbot:claude.0", "n");
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("logs timeout as permission_decision event", async () => {
    await relay.createPermissionRequest(createParams());
    mockAudit.log.mockClear();

    await vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS + 100);

    const timeoutCall = mockAudit.log.mock.calls.find(
      (c: unknown[]) => (c[0] as { details: { decision: string } }).details.decision === "timeout",
    );
    expect(timeoutCall).toBeDefined();
    expect(timeoutCall![0]).toMatchObject({
      event: "permission_decision",
      actor: "system",
      details: expect.objectContaining({
        decision: "timeout",
        timeoutMs: PERMISSION_TIMEOUT_MS,
      }),
    });
  });

  // --------------------------------------------------------------------------
  // Dispose
  // --------------------------------------------------------------------------

  it("cleans up all timers and pending requests on dispose", async () => {
    await relay.createPermissionRequest(createParams());
    await relay.createPermissionRequest(createParams({ nonce: "x:y" }));
    expect(relay.getAllPending()).toHaveLength(2);

    relay.dispose();
    expect(relay.getAllPending()).toHaveLength(0);
  });
});
