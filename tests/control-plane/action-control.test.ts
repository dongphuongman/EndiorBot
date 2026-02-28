/**
 * ActionControlPlane Unit Tests
 *
 * Tests for CEO Tool MVP ActionControlPlane (Sprint 54).
 * Covers: propose → evaluate → execute → audit pattern.
 *
 * @module tests/control-plane/action-control.test
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 54
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import {
  ActionControlPlane,
  getActionControlPlane,
  resetActionControlPlane,
} from "../../src/control-plane/action-control.js";

// Mock STATE_DIR for tests to avoid polluting real state
const TEST_STATE_DIR = join(process.cwd(), ".test-state");
const TEST_CONTROL_PLANE_DIR = join(TEST_STATE_DIR, "control-plane");

// Mock the paths module
vi.mock("../../src/config/paths.js", () => ({
  STATE_DIR: join(process.cwd(), ".test-state"),
}));

describe("ActionControlPlane", () => {
  let controlPlane: ActionControlPlane;

  beforeEach(() => {
    // Clean up test state directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    // Reset singleton and create fresh instance
    resetActionControlPlane();
    controlPlane = getActionControlPlane();
  });

  afterEach(() => {
    // Clean up test state directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  describe("Risk Classification", () => {
    it("should classify READ operations correctly", () => {
      expect(controlPlane.classifyRisk("cat /etc/passwd")).toBe("READ");
      expect(controlPlane.classifyRisk("ls -la")).toBe("READ");
      expect(controlPlane.classifyRisk("git status")).toBe("READ");
      expect(controlPlane.classifyRisk("SELECT * FROM users")).toBe("READ");
    });

    it("should classify WRITE operations correctly", () => {
      expect(controlPlane.classifyRisk("echo 'hello' > file.txt")).toBe("WRITE");
      expect(controlPlane.classifyRisk("touch newfile.txt")).toBe("WRITE");
      expect(controlPlane.classifyRisk("git commit -m 'test'")).toBe("WRITE");
      expect(controlPlane.classifyRisk("INSERT INTO users VALUES (1)")).toBe("WRITE");
    });

    it("should classify DESTRUCTIVE operations correctly", () => {
      expect(controlPlane.classifyRisk("rm file.txt")).toBe("DESTRUCTIVE");
      expect(controlPlane.classifyRisk("DELETE FROM users WHERE id = 1")).toBe("DESTRUCTIVE");
      expect(controlPlane.classifyRisk("git reset HEAD~1")).toBe("DESTRUCTIVE");
    });

    it("should classify ADMIN operations correctly", () => {
      expect(controlPlane.classifyRisk("sudo apt-get install")).toBe("ADMIN");
      expect(controlPlane.classifyRisk("chmod 755 file.sh")).toBe("ADMIN");
      expect(controlPlane.classifyRisk("systemctl restart nginx")).toBe("ADMIN");
    });

    it("should classify MONEY operations correctly", () => {
      expect(controlPlane.classifyRisk("process payment for order")).toBe("MONEY");
      expect(controlPlane.classifyRisk("refund customer $100")).toBe("MONEY");
      expect(controlPlane.classifyRisk("transfer funds to account")).toBe("MONEY");
    });

    it("should default to WRITE for unknown operations", () => {
      expect(controlPlane.classifyRisk("unknown command")).toBe("WRITE");
    });
  });

  describe("Blocked Commands", () => {
    it("should block dangerous rm commands", () => {
      expect(controlPlane.isBlocked("rm -rf /")).toBe(true);
      expect(controlPlane.isBlocked("rm -rf ~")).toBe(true);
      expect(controlPlane.isBlocked("rm -rf *")).toBe(true);
    });

    it("should block dangerous SQL commands", () => {
      expect(controlPlane.isBlocked("DROP TABLE users")).toBe(true);
      expect(controlPlane.isBlocked("DROP DATABASE production")).toBe(true);
      expect(controlPlane.isBlocked("DELETE FROM users;")).toBe(true);
      expect(controlPlane.isBlocked("TRUNCATE TABLE sessions")).toBe(true);
    });

    it("should block dangerous git commands", () => {
      expect(controlPlane.isBlocked("git push --force origin main")).toBe(true);
      expect(controlPlane.isBlocked("git reset --hard")).toBe(true);
    });

    it("should block system-level dangerous commands", () => {
      expect(controlPlane.isBlocked("dd if=/dev/zero")).toBe(true);
      expect(controlPlane.isBlocked("mkfs.ext4 /dev/sda")).toBe(true);
    });

    it("should allow safe commands", () => {
      expect(controlPlane.isBlocked("git status")).toBe(false);
      expect(controlPlane.isBlocked("npm install")).toBe(false);
      expect(controlPlane.isBlocked("rm file.txt")).toBe(false);
    });
  });

  describe("Propose", () => {
    it("should create proposal with correct risk level", () => {
      const proposal = controlPlane.propose("git status", "cli");

      expect(proposal.action).toBe("git status");
      expect(proposal.risk).toBe("READ");
      expect(proposal.requiresApproval).toBe(false);
      expect(proposal.source).toBe("cli");
      expect(proposal.id).toBeDefined();
      expect(proposal.timestamp).toBeDefined();
    });

    it("should throw on blocked commands", () => {
      expect(() => controlPlane.propose("rm -rf /", "cli")).toThrow(
        "Action blocked by security policy",
      );
    });

    it("should include context when provided", () => {
      const context = { userId: "ceo-123", reason: "testing" };
      const proposal = controlPlane.propose("ls -la", "cli", context);

      expect(proposal.context).toEqual(context);
    });
  });

  describe("Evaluate", () => {
    it("should auto-approve READ operations", () => {
      const proposal = controlPlane.propose("git status", "cli");
      const decision = controlPlane.evaluate(proposal);

      expect(decision.status).toBe("auto_approved");
      expect(decision.decidedBy).toBe("auto");
      expect(decision.proposalId).toBe(proposal.id);
    });

    it("should auto-approve WRITE operations", () => {
      const proposal = controlPlane.propose("git commit -m test", "cli");
      const decision = controlPlane.evaluate(proposal);

      expect(decision.status).toBe("auto_approved");
    });

    it("should require approval for DESTRUCTIVE operations", () => {
      const proposal = controlPlane.propose("rm important.txt", "cli");
      const decision = controlPlane.evaluate(proposal);

      expect(decision.status).toBe("pending");
      expect(decision.reason).toContain("requires CEO approval");
    });

    it("should require approval for ADMIN operations", () => {
      const proposal = controlPlane.propose("sudo restart service", "cli");
      const decision = controlPlane.evaluate(proposal);

      expect(decision.status).toBe("pending");
    });

    it("should require approval for MONEY operations", () => {
      const proposal = controlPlane.propose("process payment", "cli");
      const decision = controlPlane.evaluate(proposal);

      expect(decision.status).toBe("pending");
    });
  });

  describe("Approve/Reject", () => {
    it("should approve pending proposal", () => {
      const proposal = controlPlane.propose("rm important.txt", "cli");
      controlPlane.evaluate(proposal);

      const decision = controlPlane.approve(proposal.id, "CEO approved");

      expect(decision.status).toBe("approved");
      expect(decision.decidedBy).toBe("ceo");
      expect(decision.reason).toBe("CEO approved");
    });

    it("should reject pending proposal", () => {
      const proposal = controlPlane.propose("sudo dangerous-command", "cli");
      controlPlane.evaluate(proposal);

      const decision = controlPlane.reject(proposal.id, "Too risky");

      expect(decision.status).toBe("rejected");
      expect(decision.decidedBy).toBe("ceo");
      expect(decision.reason).toBe("Too risky");
    });

    it("should throw on non-existent proposal", () => {
      expect(() => controlPlane.approve("non-existent-id")).toThrow(
        "Proposal not found",
      );
      expect(() => controlPlane.reject("non-existent-id")).toThrow(
        "Proposal not found",
      );
    });

    it("should remove proposal from pending after approval", () => {
      const proposal = controlPlane.propose("rm file.txt", "cli");
      controlPlane.evaluate(proposal);
      controlPlane.approve(proposal.id);

      expect(controlPlane.getPendingApproval(proposal.id)).toBeUndefined();
    });
  });

  describe("Execute", () => {
    it("should execute and return stub result", async () => {
      const proposal = controlPlane.propose("git status", "cli");
      const result = await controlPlane.execute(proposal);

      expect(result.success).toBe(true);
      expect(result.proposalId).toBe(proposal.id);
      expect(result.output).toContain("[Stub] Executed");
    });
  });

  describe("Audit", () => {
    it("should record audit entry", () => {
      const proposal = controlPlane.propose("git status", "cli");
      const decision = controlPlane.evaluate(proposal);

      controlPlane.audit(proposal, decision);

      const log = controlPlane.getAuditLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[log.length - 1].proposal.id).toBe(proposal.id);
    });

    it("should include result when provided", async () => {
      const proposal = controlPlane.propose("ls -la", "cli");
      const decision = controlPlane.evaluate(proposal);
      const result = await controlPlane.execute(proposal);

      controlPlane.audit(proposal, decision, result);

      const log = controlPlane.getAuditLog();
      expect(log[log.length - 1].result).toBeDefined();
      expect(log[log.length - 1].result?.success).toBe(true);
    });
  });

  describe("Pending Approvals", () => {
    it("should track pending approvals", () => {
      // Create fresh control plane to ensure clean state
      resetActionControlPlane();
      controlPlane = getActionControlPlane();

      const proposal1 = controlPlane.propose("rm file1.txt", "cli");
      controlPlane.evaluate(proposal1);

      const proposal2 = controlPlane.propose("sudo command", "cli");
      controlPlane.evaluate(proposal2);

      const pending = controlPlane.getPendingApprovals();
      expect(pending.length).toBe(2);
    });

    it("should get specific pending approval", () => {
      const proposal = controlPlane.propose("delete payment", "cli");
      controlPlane.evaluate(proposal);

      const pending = controlPlane.getPendingApproval(proposal.id);
      expect(pending).toBeDefined();
      expect(pending?.id).toBe(proposal.id);
    });
  });

  describe("Singleton", () => {
    it("should return same instance", () => {
      const instance1 = getActionControlPlane();
      const instance2 = getActionControlPlane();

      expect(instance1).toBe(instance2);
    });

    it("should reset singleton", () => {
      const instance1 = getActionControlPlane();
      resetActionControlPlane();
      const instance2 = getActionControlPlane();

      expect(instance1).not.toBe(instance2);
    });
  });
});
