/**
 * Tests for Hook Handler — Sprint 85 (ADR-024 §8.4)
 *
 * Covers: event parsing, field validation, HMAC verification,
 * nonce validation, auto-approve (read mode), forward (non-read).
 *
 * @module tests/bridge/hooks/hook-handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  processHookEvent,
  buildHmacPayload,
} from "../../../src/bridge/hooks/hook-handler.js";
import { HookVerifier } from "../../../src/bridge/hooks/hook-verifier.js";
import { PermissionRelay } from "../../../src/bridge/hooks/permission-relay.js";
import type { AgentHookEvent } from "../../../src/bridge/types.js";

// ============================================================================
// Test helpers
// ============================================================================

const TEST_SECRET = "test-secret-for-hook-handler";

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

function createSignedEvent(
  verifier: HookVerifier,
  overrides: Partial<AgentHookEvent> = {},
): AgentHookEvent {
  const sessionId = "bridge_12345_abc";
  const base: AgentHookEvent = {
    eventType: "stop",
    agentType: "claude-code",
    sessionId,
    tmuxTarget: "endiorbot:claude.0",
    timestamp: new Date().toISOString(),
    hmacSignature: "", // will be computed
    nonce: verifier.createNonce(sessionId),
    payload: {
      tool_name: "Bash",
      file_path: "/src/test.ts",
      risk_mode: "patch",
    },
    ...overrides,
  };

  // Compute HMAC
  base.hmacSignature = verifier.sign(buildHmacPayload(base));

  return base;
}

// ============================================================================
// Tests
// ============================================================================

describe("processHookEvent", () => {
  let verifier: HookVerifier;
  let relay: PermissionRelay;
  let mockTmux: ReturnType<typeof createMockTmux>;
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    verifier = new HookVerifier(TEST_SECRET);
    mockTmux = createMockTmux();
    mockAudit = createMockAudit();
    relay = new PermissionRelay({
      tmux: mockTmux as never,
      audit: mockAudit as never,
    });
  });

  afterEach(() => {
    relay.dispose();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // JSON parsing
  // --------------------------------------------------------------------------

  it("rejects invalid JSON", async () => {
    const result = await processHookEvent("not json", { verifier, relay });
    expect(result.success).toBe(false);
    expect(result.action).toBe("rejected");
    expect(result.reason).toBe("invalid JSON");
  });

  // --------------------------------------------------------------------------
  // Field validation
  // --------------------------------------------------------------------------

  it("rejects event missing required fields", async () => {
    const result = await processHookEvent(
      JSON.stringify({ eventType: "stop" }),
      { verifier, relay },
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe("missing required fields");
  });

  it("rejects event missing eventType", async () => {
    const event = createSignedEvent(verifier);
    const raw = JSON.stringify({ ...event, eventType: "" });
    const result = await processHookEvent(raw, { verifier, relay });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("missing eventType");
  });

  // --------------------------------------------------------------------------
  // HMAC verification
  // --------------------------------------------------------------------------

  it("rejects event with invalid HMAC", async () => {
    const event = createSignedEvent(verifier);
    event.hmacSignature = "0".repeat(64); // bad sig
    const result = await processHookEvent(
      JSON.stringify(event),
      { verifier, relay },
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe("HMAC verification failed");
  });

  // --------------------------------------------------------------------------
  // Nonce validation
  // --------------------------------------------------------------------------

  it("rejects replayed nonce", async () => {
    const event = createSignedEvent(verifier);
    const raw = JSON.stringify(event);

    // First call succeeds
    const first = await processHookEvent(raw, { verifier, relay });
    expect(first.success).toBe(true);

    // Replay with same nonce — rejected
    const second = await processHookEvent(raw, { verifier, relay });
    expect(second.success).toBe(false);
    expect(second.reason).toContain("replay");
  });

  // --------------------------------------------------------------------------
  // Auto-approve (read mode)
  // --------------------------------------------------------------------------

  it("auto-approves read mode operations", async () => {
    const event = createSignedEvent(verifier, {
      payload: { tool_name: "Read", risk_mode: "read" },
    });
    // Need to re-sign after payload change
    event.hmacSignature = verifier.sign(buildHmacPayload(event));

    const result = await processHookEvent(
      JSON.stringify(event),
      { verifier, relay },
    );
    expect(result.success).toBe(true);
    expect(result.action).toBe("auto_approved");
    expect(mockTmux.sendKeys).toHaveBeenCalledWith("endiorbot:claude.0", "y");
    expect(mockTmux.sendEnter).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Forward non-read (patch/interactive)
  // --------------------------------------------------------------------------

  it("forwards patch mode operations to permission relay", async () => {
    const onPermissionRequest = vi.fn();
    relay = new PermissionRelay({
      tmux: mockTmux as never,
      audit: mockAudit as never,
      onPermissionRequest,
    });

    const event = createSignedEvent(verifier);
    const result = await processHookEvent(
      JSON.stringify(event),
      { verifier, relay },
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("forwarded");
    expect(result.permissionId).toMatch(/^perm_/);
    expect(onPermissionRequest).toHaveBeenCalledTimes(1);

    relay.dispose();
  });
});

describe("buildHmacPayload", () => {
  it("produces deterministic output for same fields", () => {
    const event: AgentHookEvent = {
      eventType: "stop",
      agentType: "claude-code",
      sessionId: "bridge_123",
      tmuxTarget: "endiorbot:test.0",
      timestamp: "2026-03-07T10:00:00Z",
      hmacSignature: "ignored",
      nonce: "bridge_123:abc",
      payload: { tool_name: "Bash" },
    };

    const p1 = buildHmacPayload(event);
    const p2 = buildHmacPayload(event);
    expect(p1).toBe(p2);

    // hmacSignature should NOT be in the payload
    expect(p1).not.toContain("ignored");
  });
});
