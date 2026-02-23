/**
 * Approval Queue Tests
 *
 * Tests file-backed queue for CEO approvals per CTO Day 6-7 guidance.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  ApprovalQueue,
  createApprovalQueue,
  isActionable,
  getTimeUntilExpiry,
  formatRequest,
  DEFAULT_APPROVAL_QUEUE_PATH,
  MAX_QUEUE_SIZE,
  DEFAULT_EXPIRY_MS,
  type ApprovalRequest,
} from "../../src/budget/approval-queue.js";
import type { DecisionContext } from "../../src/budget/decision-classifier.js";

describe("ApprovalQueue", () => {
  let queue: ApprovalQueue;
  let tempDir: string;
  let tempPath: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = join(tmpdir(), `approval-queue-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    tempPath = join(tempDir, "approval-queue.json");
    queue = new ApprovalQueue(tempPath);
  });

  afterEach(() => {
    // Cleanup temp files
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Enqueue
  // ==========================================================================

  describe("enqueue", () => {
    it("should add request to queue", () => {
      const context: DecisionContext = {
        type: "architecture_change",
        description: "Add new API endpoint",
      };

      const id = queue.enqueue(context, "block", "Requires architecture review");

      expect(id).toMatch(/^apr-/);
      expect(queue.getPending()).toHaveLength(1);
    });

    it("should return unique IDs", () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const id = queue.enqueue(
          { type: "architecture_change" },
          "block",
          "Test",
        );
        ids.add(id);
      }

      expect(ids.size).toBe(10);
    });

    it("should set correct request properties", () => {
      const context: DecisionContext = {
        type: "security_related",
        description: "Update auth flow",
        securitySensitive: true,
        irreversible: true,
      };

      const id = queue.enqueue(context, "block", "Security change");
      const request = queue.getById(id);

      expect(request).toBeDefined();
      expect(request?.type).toBe("block");
      expect(request?.decisionType).toBe("security_related");
      expect(request?.status).toBe("pending");
      expect(request?.riskLevel).toBe("critical");
      expect(request?.urgency).toBe("critical");
    });

    it("should handle consult type", () => {
      const id = queue.enqueue({ type: "deploy" }, "consult", "Deploy review");
      const request = queue.getById(id);

      expect(request?.type).toBe("consult");
    });

    it("should infer urgency from context", () => {
      // Critical urgency
      const id1 = queue.enqueue(
        { type: "bug_fix", irreversible: true },
        "block",
        "Test",
      );
      expect(queue.getById(id1)?.urgency).toBe("critical");

      // High urgency
      const id2 = queue.enqueue(
        { type: "bug_fix", affectsExternal: true },
        "block",
        "Test",
      );
      expect(queue.getById(id2)?.urgency).toBe("high");

      // Medium urgency (default)
      const id3 = queue.enqueue({ type: "bug_fix" }, "block", "Test");
      expect(queue.getById(id3)?.urgency).toBe("medium");
    });

    it("should allow custom urgency", () => {
      const id = queue.enqueue({ type: "bug_fix" }, "block", "Test", "low");
      expect(queue.getById(id)?.urgency).toBe("low");
    });

    it("should throw on queue full", () => {
      // Fill queue to max
      for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        queue.enqueue({ type: "architecture_change" }, "block", `Request ${i}`);
      }

      expect(() => {
        queue.enqueue({ type: "architecture_change" }, "block", "Over limit");
      }).toThrow(/Queue full/);
    });
  });

  // ==========================================================================
  // Get Pending
  // ==========================================================================

  describe("getPending", () => {
    it("should return empty array initially", () => {
      expect(queue.getPending()).toEqual([]);
    });

    it("should return pending requests", () => {
      queue.enqueue({ type: "architecture_change" }, "block", "Test 1");
      queue.enqueue({ type: "security_related" }, "block", "Test 2");

      const pending = queue.getPending();
      expect(pending).toHaveLength(2);
      expect(pending.every((r) => r.status === "pending")).toBe(true);
    });

    it("should not return resolved requests", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.approve(id);

      const pending = queue.getPending();
      expect(pending).toHaveLength(0);
    });

    it("should sort by urgency then creation time", () => {
      // Add in different order
      queue.enqueue({ type: "bug_fix" }, "block", "Low", "low");
      queue.enqueue({ type: "deploy" }, "block", "Critical", "critical");
      queue.enqueue({ type: "architecture_change" }, "block", "Medium", "medium");
      queue.enqueue({ type: "security_related" }, "block", "High", "high");

      const pending = queue.getPending();

      expect(pending[0].urgency).toBe("critical");
      expect(pending[1].urgency).toBe("high");
      expect(pending[2].urgency).toBe("medium");
      expect(pending[3].urgency).toBe("low");
    });
  });

  // ==========================================================================
  // Get By ID
  // ==========================================================================

  describe("getById", () => {
    it("should return request by ID", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      const request = queue.getById(id);

      expect(request).toBeDefined();
      expect(request?.id).toBe(id);
    });

    it("should return undefined for unknown ID", () => {
      const request = queue.getById("unknown-id");
      expect(request).toBeUndefined();
    });
  });

  // ==========================================================================
  // Approve
  // ==========================================================================

  describe("approve", () => {
    it("should approve pending request", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");

      const result = queue.approve(id);

      expect(result).toBe(true);
      expect(queue.getById(id)?.status).toBe("approved");
    });

    it("should set resolution metadata", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.approve(id, "CEO", "Looks good");

      const request = queue.getById(id);
      expect(request?.resolvedBy).toBe("CEO");
      expect(request?.resolutionNotes).toBe("Looks good");
      expect(request?.resolvedAt).toBeDefined();
    });

    it("should default resolvedBy to CEO", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.approve(id);

      expect(queue.getById(id)?.resolvedBy).toBe("CEO");
    });

    it("should return false for non-pending request", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.approve(id);

      const secondApprove = queue.approve(id);
      expect(secondApprove).toBe(false);
    });

    it("should return false for unknown ID", () => {
      const result = queue.approve("unknown-id");
      expect(result).toBe(false);
    });

    it("should update stats", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.approve(id);

      const stats = queue.getStats();
      expect(stats.approved).toBe(1);
    });
  });

  // ==========================================================================
  // Reject
  // ==========================================================================

  describe("reject", () => {
    it("should reject pending request", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");

      const result = queue.reject(id);

      expect(result).toBe(true);
      expect(queue.getById(id)?.status).toBe("rejected");
    });

    it("should set rejection reason", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.reject(id, "CEO", "Not approved");

      const request = queue.getById(id);
      expect(request?.resolvedBy).toBe("CEO");
      expect(request?.resolutionNotes).toBe("Not approved");
    });

    it("should update stats", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.reject(id);

      const stats = queue.getStats();
      expect(stats.rejected).toBe(1);
    });
  });

  // ==========================================================================
  // Cancel
  // ==========================================================================

  describe("cancel", () => {
    it("should cancel pending request", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");

      const result = queue.cancel(id);

      expect(result).toBe(true);
      expect(queue.getById(id)?.status).toBe("cancelled");
    });

    it("should set cancellation reason", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.cancel(id, "No longer needed");

      expect(queue.getById(id)?.resolutionNotes).toBe("No longer needed");
    });

    it("should update stats", () => {
      const id = queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.cancel(id);

      const stats = queue.getStats();
      expect(stats.expired).toBe(0); // cancelled is separate from expired
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe("statistics", () => {
    it("should return correct stats", () => {
      // Add various requests
      const id1 = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test 1",
      );
      const id2 = queue.enqueue({ type: "security_related" }, "block", "Test 2");
      const id3 = queue.enqueue({ type: "deploy" }, "consult", "Test 3");

      queue.approve(id1);
      queue.reject(id2);

      const stats = queue.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.total).toBe(3);
    });

    it("should track oldest pending age", () => {
      queue.enqueue({ type: "architecture_change" }, "block", "Test");

      const stats = queue.getStats();

      expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
      expect(stats.oldestPendingAgeMs).toBeLessThan(1000); // Should be < 1 second
    });

    it("should return 0 age when no pending", () => {
      const stats = queue.getStats();
      expect(stats.oldestPendingAgeMs).toBe(0);
    });
  });

  // ==========================================================================
  // Expiry
  // ==========================================================================

  describe("expiry", () => {
    it("should expire old requests", () => {
      // Create queue with very short expiry
      const shortExpiryQueue = new ApprovalQueue(tempPath, 1); // 1ms expiry

      const id = shortExpiryQueue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test",
      );

      // Wait for expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const pending = shortExpiryQueue.getPending();
          const request = shortExpiryQueue.getById(id);

          expect(pending).toHaveLength(0);
          expect(request?.status).toBe("expired");
          resolve();
        }, 10);
      });
    });

    it("should not expire recent requests", () => {
      const id = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test",
      );

      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(queue.getById(id)?.status).toBe("pending");
    });
  });

  // ==========================================================================
  // Persistence
  // ==========================================================================

  describe("persistence", () => {
    it("should persist to file", () => {
      queue.enqueue({ type: "architecture_change" }, "block", "Test");
      queue.forceSave();

      expect(existsSync(tempPath)).toBe(true);
    });

    it("should reload from file", () => {
      const id = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test",
      );
      queue.forceSave();

      // Create new queue instance
      const queue2 = new ApprovalQueue(tempPath);
      const request = queue2.getById(id);

      expect(request).toBeDefined();
      expect(request?.id).toBe(id);
    });

    it("should reload to get latest data", () => {
      const id = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test",
      );

      // Create second queue and modify
      const queue2 = new ApprovalQueue(tempPath);
      queue2.approve(id, "CEO2");

      // Reload first queue
      queue.reload();
      const request = queue.getById(id);

      expect(request?.status).toBe("approved");
      expect(request?.resolvedBy).toBe("CEO2");
    });

    it("should handle missing file gracefully", () => {
      const missingPath = join(tempDir, "missing.json");
      const newQueue = new ApprovalQueue(missingPath);

      expect(newQueue.getPending()).toEqual([]);
    });

    it("should handle corrupt file gracefully", () => {
      const corruptPath = join(tempDir, "corrupt.json");
      mkdirSync(join(tempDir), { recursive: true });
      const fs = require("fs");
      fs.writeFileSync(corruptPath, "not valid json {{{");

      const newQueue = new ApprovalQueue(corruptPath);
      expect(newQueue.getPending()).toEqual([]);
    });
  });

  // ==========================================================================
  // Clear Methods
  // ==========================================================================

  describe("clear methods", () => {
    it("should clear resolved items", () => {
      const id1 = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test 1",
      );
      queue.enqueue({ type: "security_related" }, "block", "Test 2");
      queue.approve(id1);

      const cleared = queue.clearResolved();

      expect(cleared).toBe(1);
      expect(queue.getAll()).toHaveLength(1);
      expect(queue.getPending()).toHaveLength(1);
    });

    it("should clear all items", () => {
      queue.enqueue({ type: "architecture_change" }, "block", "Test 1");
      queue.enqueue({ type: "security_related" }, "block", "Test 2");

      queue.clearAll();

      expect(queue.getAll()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Get All
  // ==========================================================================

  describe("getAll", () => {
    it("should return all items including resolved", () => {
      const id1 = queue.enqueue(
        { type: "architecture_change" },
        "block",
        "Test 1",
      );
      queue.enqueue({ type: "security_related" }, "block", "Test 2");
      queue.approve(id1);

      const all = queue.getAll();
      expect(all).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Get Persisted Data
  // ==========================================================================

  describe("getPersistedData", () => {
    it("should return data structure", () => {
      queue.enqueue({ type: "architecture_change" }, "block", "Test");

      const data = queue.getPersistedData();

      expect(data.version).toBe("1.0.0");
      expect(data.items).toHaveLength(1);
      expect(data.lastUpdated).toBeDefined();
      expect(data.stats).toBeDefined();
    });
  });
});

// ==========================================================================
// Factory Functions
// ==========================================================================

describe("factory functions", () => {
  let tempDir: string;
  let tempPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `approval-queue-factory-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    tempPath = join(tempDir, "approval-queue.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createApprovalQueue", () => {
    it("should create queue with default path", () => {
      const queue = createApprovalQueue(tempPath);
      expect(queue).toBeInstanceOf(ApprovalQueue);
    });

    it("should create queue with custom expiry", () => {
      const queue = createApprovalQueue(tempPath, 1000);
      expect(queue).toBeInstanceOf(ApprovalQueue);
    });
  });

  describe("isActionable", () => {
    it("should return true for pending non-expired request", () => {
      const request: ApprovalRequest = {
        id: "test",
        type: "block",
        decisionType: "architecture_change",
        status: "pending",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      };

      expect(isActionable(request)).toBe(true);
    });

    it("should return false for non-pending request", () => {
      const request: ApprovalRequest = {
        id: "test",
        type: "block",
        decisionType: "architecture_change",
        status: "approved",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      expect(isActionable(request)).toBe(false);
    });

    it("should return false for expired request", () => {
      const request: ApprovalRequest = {
        id: "test",
        type: "block",
        decisionType: "architecture_change",
        status: "pending",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Past
      };

      expect(isActionable(request)).toBe(false);
    });
  });

  describe("getTimeUntilExpiry", () => {
    it("should return time remaining", () => {
      const futureExpiry = new Date(Date.now() + 3600000); // 1 hour
      const request: ApprovalRequest = {
        id: "test",
        type: "block",
        decisionType: "architecture_change",
        status: "pending",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: futureExpiry.toISOString(),
      };

      const remaining = getTimeUntilExpiry(request);
      expect(remaining).toBeGreaterThan(3500000); // ~1 hour
      expect(remaining).toBeLessThanOrEqual(3600000);
    });

    it("should return 0 for expired request", () => {
      const request: ApprovalRequest = {
        id: "test",
        type: "block",
        decisionType: "architecture_change",
        status: "pending",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      expect(getTimeUntilExpiry(request)).toBe(0);
    });
  });

  describe("formatRequest", () => {
    it("should format pending request", () => {
      const request: ApprovalRequest = {
        id: "apr-123",
        type: "block",
        decisionType: "architecture_change",
        status: "pending",
        riskLevel: "high",
        urgency: "critical",
        description: "Test description",
        reason: "Needs review",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const formatted = formatRequest(request);

      expect(formatted).toContain("apr-123");
      expect(formatted).toContain("CRITICAL");
      expect(formatted).toContain("architecture_change");
      expect(formatted).toContain("Expires in");
    });

    it("should format resolved request", () => {
      const request: ApprovalRequest = {
        id: "apr-123",
        type: "block",
        decisionType: "architecture_change",
        status: "approved",
        riskLevel: "high",
        urgency: "medium",
        description: "Test",
        reason: "Test",
        context: { type: "architecture_change" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        resolvedBy: "CEO",
        resolutionNotes: "Approved with changes",
      };

      const formatted = formatRequest(request);

      expect(formatted).toContain("Resolved by");
      expect(formatted).toContain("CEO");
      expect(formatted).toContain("Approved with changes");
    });
  });
});

// ==========================================================================
// Constants
// ==========================================================================

describe("constants", () => {
  it("should have correct default path", () => {
    expect(DEFAULT_APPROVAL_QUEUE_PATH).toContain(".endiorbot");
    expect(DEFAULT_APPROVAL_QUEUE_PATH).toContain("approval-queue.json");
  });

  it("should have reasonable max queue size", () => {
    expect(MAX_QUEUE_SIZE).toBe(100);
  });

  it("should have 24 hour default expiry", () => {
    expect(DEFAULT_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });
});
