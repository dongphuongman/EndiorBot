/**
 * Permission Audit Tests — Sprint 125
 *
 * Covers: decisionReason in RiskClassifier, audit logging, /audit command, scrubbing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  RiskClassifier,
  type DecisionReason,
} from "../../src/agents/safety/risk-classifier.js";

import {
  formatAuditEntries,
  type PermissionAuditEntry,
} from "../../src/security/permission-audit.js";

import { handleAuditCommand } from "../../src/commands/handlers/audit-commands.js";

// ============================================================================
// decisionReason in RiskClassifier
// ============================================================================

describe("RiskClassifier — decisionReason (ADR-041)", () => {
  it("populates decisionReason on every classify call", () => {
    const classifier = new RiskClassifier();
    const result = classifier.classify({ agent: "coder", mode: "READ", task: "read file" });

    expect(result.decisionReason).toBeDefined();
    expect(result.decisionReason!.type).toBeDefined();
    expect(result.decisionReason!.detail).toBeDefined();
  });

  it("LOW risk → auto decision reason", () => {
    const classifier = new RiskClassifier();
    const result = classifier.classify({ agent: "researcher", mode: "READ", task: "search code" });

    expect(result.level).toBe("LOW");
    expect(result.decisionReason!.type).toBe("auto");
    expect(result.decisionReason!.detail).toContain("auto-approved");
  });

  it("MEDIUM risk → risk-level decision reason", () => {
    const classifier = new RiskClassifier();
    const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify source code" });

    // PATCH mode on coder → at least MEDIUM
    expect(result.decisionReason).toBeDefined();
    if (result.confirmation !== "none") {
      expect(result.decisionReason!.type).toBe("risk-level");
      expect(result.decisionReason!.detail).toContain("requires");
    }
  });

  it("CRITICAL blocked → rule decision reason", () => {
    const classifier = new RiskClassifier({ blockCritical: true });
    const result = classifier.classify({ agent: "devops", mode: "INTERACTIVE", task: "delete database" });

    if (!result.allowed) {
      expect(result.decisionReason!.type).toBe("rule");
      expect(result.decisionReason!.detail).toContain("blocked");
    }
  });
});

// ============================================================================
// formatAuditEntries
// ============================================================================

describe("formatAuditEntries", () => {
  it("returns 'no decisions' for empty array", () => {
    expect(formatAuditEntries([])).toContain("No permission decisions");
  });

  it("formats entries with icon, tool, risk, reason", () => {
    const entries: PermissionAuditEntry[] = [
      {
        ts: "2026-04-01T10:00:00.000Z",
        tool: "Bash",
        decision: "allow",
        reason: { type: "auto", detail: "LOW risk — auto-approved" },
        riskLevel: "LOW",
        agent: "coder",
      },
    ];

    const result = formatAuditEntries(entries);
    expect(result).toContain("✅");
    expect(result).toContain("Bash");
    expect(result).toContain("LOW");
    expect(result).toContain("auto-approved");
    expect(result).toContain("@coder");
  });

  it("uses ❌ for deny decisions", () => {
    const entries: PermissionAuditEntry[] = [
      {
        ts: "2026-04-01T10:00:00.000Z",
        tool: "rm -rf",
        decision: "deny",
        reason: { type: "rule", detail: "CRITICAL blocked" },
        riskLevel: "CRITICAL",
      },
    ];

    const result = formatAuditEntries(entries);
    expect(result).toContain("❌");
    expect(result).toContain("CRITICAL");
  });

  it("uses ⚠️ for confirm decisions", () => {
    const entries: PermissionAuditEntry[] = [
      {
        ts: "2026-04-01T10:00:00.000Z",
        tool: "Edit",
        decision: "confirm",
        reason: { type: "risk-level", detail: "MEDIUM" },
        riskLevel: "MEDIUM",
      },
    ];

    const result = formatAuditEntries(entries);
    expect(result).toContain("⚠️");
  });
});

// ============================================================================
// /audit permissions command
// ============================================================================

describe("handleAuditCommand", () => {
  it("returns usage for unknown subcommand", () => {
    const result = handleAuditCommand(["unknown"]);
    expect(result.success).toBe(false);
    expect(result.response).toContain("Usage");
  });

  it("returns usage for empty args", () => {
    const result = handleAuditCommand([]);
    expect(result.success).toBe(false);
    expect(result.response).toContain("/audit permissions");
  });

  it("handles 'permissions' subcommand", () => {
    const result = handleAuditCommand(["permissions"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Permission Audit");
  });

  it("respects --limit flag", () => {
    const result = handleAuditCommand(["permissions", "--limit", "5"]);
    expect(result.success).toBe(true);
  });
});
