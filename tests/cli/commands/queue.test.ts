/**
 * Queue CLI Tests
 *
 * Tests for queue CLI command (list/approve/reject/show/cancel/cleanup).
 *
 * Per CTO Day 8 guidance:
 * - queue list shows urgency + expiry prominently
 * - queue approve requires confirmation for block-type decisions
 *
 * @module tests/cli/commands/queue
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 36 Day 8
 * @authority ADR-007 Budget Control
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerQueueCommand } from "../../../src/cli/commands/queue.js";
import {
  ApprovalQueue,
  createApprovalQueue,
  type DecisionContext,
} from "../../../src/budget/index.js";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Create a test program with queue commands.
 */
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerQueueCommand(program);
  return program;
}

/**
 * Create a temporary directory.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "queue-cli-test-"));
}

/**
 * Create a test decision context.
 */
function createTestContext(type: string = "test_decision"): DecisionContext {
  return {
    type: type as DecisionContext["type"],
    description: "Test decision",
    costImpact: 0.25,
    budgetPercentage: 50,
    filesAffected: ["test.ts"],
  };
}

// ============================================================================
// Basic Command Registration
// ============================================================================

describe("Queue Command Registration", () => {
  it("should register queue command", () => {
    const program = createTestProgram();
    const queueCmd = program.commands.find((cmd) => cmd.name() === "queue");
    expect(queueCmd).toBeDefined();
  });

  it("should have subcommands", () => {
    const program = createTestProgram();
    const queueCmd = program.commands.find((cmd) => cmd.name() === "queue");
    expect(queueCmd).toBeDefined();

    const subcommands = queueCmd!.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("show");
    expect(subcommands).toContain("approve");
    expect(subcommands).toContain("reject");
    expect(subcommands).toContain("cancel");
    expect(subcommands).toContain("cleanup");
  });
});

// ============================================================================
// Queue List (with temp dir)
// ============================================================================

describe("Queue List (with temp dir)", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should list empty queue", () => {
    const queue = createApprovalQueue(queuePath);
    const pending = queue.getPending();
    expect(pending).toHaveLength(0);
  });

  it("should list pending approvals", () => {
    const queue = createApprovalQueue(queuePath);
    const context = createTestContext("deploy");

    const id = queue.enqueue(context, "block", "Test reason");
    expect(id).toBeDefined();

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].status).toBe("pending");
  });

  it("should sort pending by urgency", () => {
    const queue = createApprovalQueue(queuePath);

    // Add low urgency first
    queue.enqueue(createTestContext("bug_fix"), "notify", "Low priority", "low");

    // Add critical urgency second
    queue.enqueue(
      createTestContext("deploy"),
      "block",
      "Critical priority",
      "critical",
    );

    const pending = queue.getPending();
    expect(pending).toHaveLength(2);
    // Critical should be first
    expect(pending[0].urgency).toBe("critical");
    expect(pending[1].urgency).toBe("low");
  });
});

// ============================================================================
// Queue Show
// ============================================================================

describe("Queue Show", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should get request by ID", () => {
    const queue = createApprovalQueue(queuePath);
    const context = createTestContext("deploy");

    const id = queue.enqueue(context, "block", "Test reason");

    const request = queue.getById(id);
    expect(request).toBeDefined();
    expect(request!.id).toBe(id);
    expect(request!.type).toBe("block");
    expect(request!.reason).toBe("Test reason");
  });

  it("should return undefined for invalid ID", () => {
    const queue = createApprovalQueue(queuePath);
    const request = queue.getById("invalid-id");
    expect(request).toBeUndefined();
  });
});

// ============================================================================
// Queue Approve
// ============================================================================

describe("Queue Approve", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should approve pending request", () => {
    const queue = createApprovalQueue(queuePath);
    const id = queue.enqueue(createTestContext("deploy"), "block", "Test");

    const result = queue.approve(id, "CEO", "Approved via test");
    expect(result).toBe(true);

    const request = queue.getById(id);
    expect(request!.status).toBe("approved");
    expect(request!.resolvedBy).toBe("CEO");
    expect(request!.resolutionNotes).toBe("Approved via test");
  });

  it("should not approve already resolved request", () => {
    const queue = createApprovalQueue(queuePath);
    const id = queue.enqueue(createTestContext("deploy"), "block", "Test");

    // Approve first
    queue.approve(id);

    // Try to approve again
    const result = queue.approve(id);
    expect(result).toBe(false);
  });

  it("should return false for invalid ID", () => {
    const queue = createApprovalQueue(queuePath);
    const result = queue.approve("invalid-id");
    expect(result).toBe(false);
  });
});

// ============================================================================
// Queue Reject
// ============================================================================

describe("Queue Reject", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject pending request", () => {
    const queue = createApprovalQueue(queuePath);
    const id = queue.enqueue(createTestContext("deploy"), "block", "Test");

    const result = queue.reject(id, "CEO", "Rejected via test");
    expect(result).toBe(true);

    const request = queue.getById(id);
    expect(request!.status).toBe("rejected");
    expect(request!.resolvedBy).toBe("CEO");
    expect(request!.resolutionNotes).toBe("Rejected via test");
  });

  it("should not reject already resolved request", () => {
    const queue = createApprovalQueue(queuePath);
    const id = queue.enqueue(createTestContext("deploy"), "block", "Test");

    // Reject first
    queue.reject(id);

    // Try to reject again
    const result = queue.reject(id);
    expect(result).toBe(false);
  });
});

// ============================================================================
// Queue Cancel
// ============================================================================

describe("Queue Cancel", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should cancel pending request", () => {
    const queue = createApprovalQueue(queuePath);
    const id = queue.enqueue(createTestContext("deploy"), "block", "Test");

    const result = queue.cancel(id, "No longer needed");
    expect(result).toBe(true);

    const request = queue.getById(id);
    expect(request!.status).toBe("cancelled");
    expect(request!.resolutionNotes).toBe("No longer needed");
  });
});

// ============================================================================
// Queue Cleanup
// ============================================================================

describe("Queue Cleanup", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should clear resolved items", () => {
    const queue = createApprovalQueue(queuePath);

    // Create and resolve some requests
    const id1 = queue.enqueue(createTestContext("deploy"), "block", "Test 1");
    const id2 = queue.enqueue(createTestContext("deploy"), "block", "Test 2");
    queue.enqueue(createTestContext("deploy"), "block", "Test 3"); // Keep pending

    queue.approve(id1);
    queue.reject(id2);

    // Cleanup resolved
    const cleared = queue.clearResolved();
    expect(cleared).toBe(2);

    // Only pending should remain
    const all = queue.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("pending");
  });

  it("should not clear pending items", () => {
    const queue = createApprovalQueue(queuePath);

    // Create pending request
    queue.enqueue(createTestContext("deploy"), "block", "Test");

    // Cleanup (should not clear pending)
    const cleared = queue.clearResolved();
    expect(cleared).toBe(0);

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
  });
});

// ============================================================================
// Queue Stats
// ============================================================================

describe("Queue Stats", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should return queue statistics", () => {
    const queue = createApprovalQueue(queuePath);

    // Create some requests
    const id1 = queue.enqueue(createTestContext("deploy"), "block", "Test 1");
    queue.enqueue(createTestContext("deploy"), "block", "Test 2");
    queue.enqueue(createTestContext("deploy"), "block", "Test 3");

    queue.approve(id1);

    const stats = queue.getStats();
    expect(stats.pending).toBe(2);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(0);
    expect(stats.total).toBe(3);
  });

  it("should calculate oldest pending age", () => {
    const queue = createApprovalQueue(queuePath);

    queue.enqueue(createTestContext("deploy"), "block", "Test");

    const stats = queue.getStats();
    expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
    expect(stats.oldestPendingAgeMs).toBeLessThan(1000); // Should be recent
  });
});

// ============================================================================
// Urgency Handling (CTO Day 8)
// ============================================================================

describe("Urgency Handling", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should infer critical urgency for security decisions", () => {
    const queue = createApprovalQueue(queuePath);
    const context: DecisionContext = {
      type: "security_related",
      description: "Security change",
      securitySensitive: true,
    };

    queue.enqueue(context, "block", "Security");

    const pending = queue.getPending();
    expect(pending[0].urgency).toBe("critical");
  });

  it("should infer high urgency for external-affecting decisions", () => {
    const queue = createApprovalQueue(queuePath);
    const context: DecisionContext = {
      type: "external_api",
      description: "External API",
      affectsExternal: true,
    };

    queue.enqueue(context, "block", "External");

    const pending = queue.getPending();
    expect(pending[0].urgency).toBe("high");
  });

  it("should accept explicit urgency", () => {
    const queue = createApprovalQueue(queuePath);
    const context = createTestContext("bug_fix");

    queue.enqueue(context, "notify", "Test", "low");

    const pending = queue.getPending();
    expect(pending[0].urgency).toBe("low");
  });
});

// ============================================================================
// Block-Type Handling (CTO Day 8)
// ============================================================================

describe("Block-Type Handling", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should set type to block for block bucket", () => {
    const queue = createApprovalQueue(queuePath);
    const context = createTestContext("deploy");

    queue.enqueue(context, "block", "Test");

    const pending = queue.getPending();
    expect(pending[0].type).toBe("block");
  });

  it("should set type to consult for consult bucket", () => {
    const queue = createApprovalQueue(queuePath);
    const context = createTestContext("architecture_change");

    queue.enqueue(context, "consult", "Test");

    const pending = queue.getPending();
    expect(pending[0].type).toBe("consult");
  });
});

// ============================================================================
// Persistence
// ============================================================================

describe("Queue Persistence", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    queuePath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should persist to file", () => {
    const queue1 = createApprovalQueue(queuePath);
    const id = queue1.enqueue(createTestContext("deploy"), "block", "Test");

    // Create new queue instance reading same file
    const queue2 = createApprovalQueue(queuePath);
    const request = queue2.getById(id);

    expect(request).toBeDefined();
    expect(request!.status).toBe("pending");
  });

  it("should persist approvals", () => {
    const queue1 = createApprovalQueue(queuePath);
    const id = queue1.enqueue(createTestContext("deploy"), "block", "Test");
    queue1.approve(id, "CEO");

    // Create new queue instance
    const queue2 = createApprovalQueue(queuePath);
    const request = queue2.getById(id);

    expect(request!.status).toBe("approved");
    expect(request!.resolvedBy).toBe("CEO");
  });
});
