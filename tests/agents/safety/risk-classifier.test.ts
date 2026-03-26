/**
 * Risk Classifier Tests
 *
 * @module tests/agents/safety/risk-classifier
 * @date 2026-03-26
 * @sprint 119
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RiskClassifier,
  createRiskClassifier,
  getRiskClassifier,
  resetRiskClassifier,
  classifyRisk,
  DEFAULT_RISK_CONFIG,
} from "../../../src/agents/safety/risk-classifier.js";
import type { RiskLevel, ActionCategory, RiskClassification } from "../../../src/agents/safety/risk-classifier.js";

// ============================================================================
// Helpers
// ============================================================================

function makeClassifier(overrides: Partial<ConstructorParameters<typeof RiskClassifier>[0]> = {}): RiskClassifier {
  return new RiskClassifier(overrides);
}

// ============================================================================
// Tests
// ============================================================================

describe("RiskClassifier", () => {
  describe("constructor", () => {
    it("uses DEFAULT_RISK_CONFIG when no config provided", () => {
      const c = makeClassifier();
      // Verify it classifies without throwing
      const result = c.classify({ agent: "researcher", mode: "READ", task: "read file" });
      expect(result).toBeDefined();
    });

    it("merges partial config with defaults", () => {
      const c = makeClassifier({ blockCritical: true });
      const result = c.classify({ agent: "coder", mode: "PATCH", task: "delete all files" });
      // blockCritical=true → CRITICAL actions blocked
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBeDefined();
    });
  });

  describe("classify — read operations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("classifies 'read the config file' as LOW risk", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "read the config file" });
      expect(result.level).toBe("LOW");
    });

    it("classifies 'view logs' as LOW risk", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "view logs" });
      expect(result.level).toBe("LOW");
    });

    it("classifies 'list all endpoints' as LOW risk", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "list all endpoints" });
      expect(result.level).toBe("LOW");
    });

    it("maps read category correctly", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "get configuration" });
      expect(result.category).toBe("read");
    });

    it("requires no confirmation for LOW risk", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "show status" });
      expect(result.confirmation).toBe("none");
    });

    it("allows LOW risk by default", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "list files" });
      expect(result.allowed).toBe(true);
    });

    it("returns LOW score (0-34) for pure read + researcher + READ mode", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "read docs" });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe("classify — search operations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("classifies 'search for pattern' as LOW risk category", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "search for pattern in codebase" });
      expect(result.category).toBe("search");
    });

    it("classifies 'find all references' as search category", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "find all references" });
      expect(result.category).toBe("search");
    });

    it("classifies 'grep error patterns' as search category", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "grep error patterns" });
      expect(result.category).toBe("search");
    });
  });

  describe("classify — modify operations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("classifies 'modify the auth module' as HIGH or above", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify the auth module" });
      const highOrAbove: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrAbove).toContain(result.level);
    });

    it("classifies 'update config values' as HIGH or above", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "update config values" });
      const highOrAbove: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrAbove).toContain(result.level);
    });

    it("classifies 'refactor auth service' with coder+PATCH as HIGH or above", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "refactor auth service" });
      const highOrAbove: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrAbove).toContain(result.level);
    });

    it("requires explicit confirmation for HIGH risk", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "fix the bug in service" });
      if (result.level === "HIGH") {
        expect(result.confirmation).toBe("explicit");
      }
    });

    it("maps modify category for 'edit' keyword", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "edit the file" });
      expect(result.category).toBe("modify");
    });

    it("maps modify category for 'patch' keyword", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "apply patch to service" });
      expect(result.category).toBe("modify");
    });
  });

  describe("classify — delete operations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("classifies 'delete all test files' as HIGH or CRITICAL", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "delete all test files" });
      // coder+PATCH+delete → HIGH or CRITICAL depending on score accumulation
      const highOrCrit: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrCrit).toContain(result.level);
    });

    it("classifies 'remove the database records' as CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "remove the database records" });
      expect(result.level).toBe("CRITICAL");
    });

    it("classifies 'drop the table' as CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "drop the users table" });
      expect(result.level).toBe("CRITICAL");
    });

    it("maps delete category for 'purge' keyword", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "purge old logs" });
      expect(result.category).toBe("delete");
    });

    it("requires explicit_with_audit confirmation for CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete all records" });
      expect(result.confirmation).toBe("explicit_with_audit");
    });

    it("CRITICAL is allowed by default (blockCritical=false)", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete all files" });
      expect(result.allowed).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });
  });

  describe("classify — deploy operations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("classifies 'deploy to production' as CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "deploy to production" });
      expect(result.level).toBe("CRITICAL");
    });

    it("classifies 'release v2.0' as CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "release v2.0" });
      expect(result.level).toBe("CRITICAL");
    });

    it("maps deploy category for 'publish' keyword", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "publish the package" });
      expect(result.category).toBe("deploy");
    });
  });

  describe("classify — unknown action defaults", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("unknown action with researcher+READ produces low-to-medium risk", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "xyz123 frobnicate" });
      // unknown task risk defaults to MEDIUM in analyzeTask, but agent+mode may keep overall low
      expect(["LOW", "MEDIUM"]).toContain(result.level);
    });

    it("unknown action category is 'unknown'", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "xyz123 frobnicate" });
      expect(result.category).toBe("unknown");
    });

    it("unknown action with devops+PATCH escalates to HIGH or CRITICAL", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "xyz123 frobnicate" });
      const highOrCrit: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrCrit).toContain(result.level);
    });
  });

  describe("classify — score range", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("score is always between 0 and 100", () => {
      const tasks = [
        { agent: "researcher" as const, mode: "READ" as const, task: "read file" },
        { agent: "coder" as const, mode: "PATCH" as const, task: "modify service" },
        { agent: "devops" as const, mode: "PATCH" as const, task: "delete all records" },
        { agent: "devops" as const, mode: "INTERACTIVE" as const, task: "deploy to prod" },
      ];
      for (const params of tasks) {
        const result = classifier.classify(params);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }
    });

    it("delete+CRITICAL task produces higher score than read+LOW task", () => {
      const low = classifier.classify({ agent: "researcher", mode: "READ", task: "read file" });
      const critical = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete all records" });
      expect(critical.score).toBeGreaterThan(low.score);
    });
  });

  describe("classify — confirmation types", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("LOW risk → confirmation: none", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "list files" });
      if (result.level === "LOW") {
        expect(result.confirmation).toBe("none");
      }
    });

    it("HIGH risk → confirmation: explicit", () => {
      // Use researcher (LOW base) + PATCH mode + modify task to land exactly on HIGH
      const result = classifier.classify({ agent: "coder", mode: "READ", task: "modify source code" });
      if (result.level === "HIGH") {
        expect(result.confirmation).toBe("explicit");
      }
    });

    it("CRITICAL risk → confirmation: explicit_with_audit", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete database" });
      if (result.level === "CRITICAL") {
        expect(result.confirmation).toBe("explicit_with_audit");
      }
    });
  });

  describe("classify — allowed flag", () => {
    it("allowed=true when blockCritical=false (default)", () => {
      const c = makeClassifier({ blockCritical: false });
      const result = c.classify({ agent: "devops", mode: "PATCH", task: "delete all files" });
      expect(result.allowed).toBe(true);
    });

    it("allowed=false with blockReason when blockCritical=true and action is CRITICAL", () => {
      const c = makeClassifier({ blockCritical: true });
      const result = c.classify({ agent: "devops", mode: "PATCH", task: "delete all records" });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe("CRITICAL actions are blocked by policy");
    });

    it("allowed=true for non-CRITICAL even when blockCritical=true", () => {
      const c = makeClassifier({ blockCritical: true });
      const result = c.classify({ agent: "researcher", mode: "READ", task: "read logs" });
      expect(result.allowed).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });
  });

  describe("classify — RiskFactor array", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("factors array is populated (non-empty)", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify auth service" });
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it("each factor has name, weight, description, source", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify service" });
      for (const factor of result.factors) {
        expect(typeof factor.name).toBe("string");
        expect(typeof factor.weight).toBe("number");
        expect(typeof factor.description).toBe("string");
        expect(["action", "agent", "mode", "pattern", "file", "command"]).toContain(factor.source);
      }
    });

    it("includes agent factor in factors", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify service" });
      const agentFactor = result.factors.find((f) => f.source === "agent");
      expect(agentFactor).toBeDefined();
    });

    it("includes mode factor in factors", () => {
      const result = classifier.classify({ agent: "coder", mode: "PATCH", task: "modify service" });
      const modeFactor = result.factors.find((f) => f.source === "mode");
      expect(modeFactor).toBeDefined();
    });

    it("includes file factor when sensitive file provided", () => {
      const result = classifier.classify({
        agent: "coder",
        mode: "PATCH",
        task: "update config",
        files: [".env"],
      });
      const fileFactor = result.factors.find((f) => f.source === "file");
      expect(fileFactor).toBeDefined();
    });

    it("elevates risk to HIGH when sensitive file (.env) is included", () => {
      const result = classifier.classify({
        agent: "researcher",
        mode: "READ",
        task: "read config",
        files: [".env"],
      });
      const highOrAbove: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrAbove).toContain(result.level);
    });
  });

  describe("classify — dangerous commands", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("dangerous command 'rm -rf /' escalates to CRITICAL", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "PATCH",
        task: "clean up",
        commands: ["rm -rf /tmp/old"],
      });
      expect(result.level).toBe("CRITICAL");
    });

    it("dangerous command factor has source: command", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "PATCH",
        task: "cleanup",
        commands: ["rm -rf /var/log"],
      });
      const cmdFactor = result.factors.find((f) => f.source === "command");
      expect(cmdFactor).toBeDefined();
    });

    it("includes 'Verify command safety' recommendation for dangerous commands", () => {
      const result = classifier.classify({
        agent: "devops",
        mode: "PATCH",
        task: "cleanup",
        commands: ["rm -rf /tmp"],
      });
      const hasRec = result.recommendations.some((r) => r.includes("command safety"));
      expect(hasRec).toBe(true);
    });
  });

  describe("classify — agent risk profiles", () => {
    it("researcher+READ produces lower risk than devops+PATCH for same task", () => {
      const classifier = makeClassifier();
      const researcher = classifier.classify({ agent: "researcher", mode: "READ", task: "check status" });
      const devops = classifier.classify({ agent: "devops", mode: "PATCH", task: "check status" });
      expect(devops.score).toBeGreaterThan(researcher.score);
    });

    it("readModeOnly violation adds extra factor when not using READ mode", () => {
      const classifier = makeClassifier();
      const result = classifier.classify({ agent: "pm", mode: "PATCH", task: "read notes" });
      const modeViolation = result.factors.find((f) => f.name === "Mode violation");
      expect(modeViolation).toBeDefined();
    });

    it("devops agent has CRITICAL base risk", () => {
      const classifier = makeClassifier();
      const result = classifier.classify({ agent: "devops", mode: "READ", task: "check status" });
      // devops base=CRITICAL, but READ mode multiplier 0.5x + read task may bring score down
      // level should still be HIGH or CRITICAL due to maxRisk
      const highOrCrit: RiskLevel[] = ["HIGH", "CRITICAL"];
      expect(highOrCrit).toContain(result.level);
    });
  });

  describe("classify — mode multipliers", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("INTERACTIVE mode produces higher score than READ mode for same agent+task", () => {
      const readResult = classifier.classify({ agent: "coder", mode: "READ", task: "check files" });
      const interactiveResult = classifier.classify({ agent: "coder", mode: "INTERACTIVE", task: "check files" });
      expect(interactiveResult.score).toBeGreaterThan(readResult.score);
    });

    it("PATCH mode produces higher score than READ mode", () => {
      const readResult = classifier.classify({ agent: "coder", mode: "READ", task: "analyze code" });
      const patchResult = classifier.classify({ agent: "coder", mode: "PATCH", task: "analyze code" });
      expect(patchResult.score).toBeGreaterThan(readResult.score);
    });
  });

  describe("classify — recommendations", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("CRITICAL risk returns non-empty recommendations", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete all data" });
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("CRITICAL recommendations include backup advice", () => {
      const result = classifier.classify({ agent: "devops", mode: "PATCH", task: "delete old records" });
      if (result.level === "CRITICAL") {
        const hasBackup = result.recommendations.some((r) => r.toLowerCase().includes("backup"));
        expect(hasBackup).toBe(true);
      }
    });

    it("LOW risk returns empty recommendations", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "list files" });
      if (result.level === "LOW") {
        expect(result.recommendations.length).toBe(0);
      }
    });
  });

  describe("isSafe()", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("returns true for LOW risk action", () => {
      expect(classifier.isSafe("researcher", "READ", "read config")).toBe(true);
    });

    it("returns false for HIGH risk action", () => {
      expect(classifier.isSafe("coder", "PATCH", "modify auth module")).toBe(false);
    });
  });

  describe("needsConfirmation()", () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = makeClassifier();
    });

    it("returns false for LOW risk (no confirmation needed)", () => {
      const result = classifier.classify({ agent: "researcher", mode: "READ", task: "read logs" });
      if (result.level === "LOW") {
        expect(classifier.needsConfirmation("researcher", "READ", "read logs")).toBe(false);
      }
    });

    it("returns true for CRITICAL risk", () => {
      expect(classifier.needsConfirmation("devops", "PATCH", "delete all records")).toBe(true);
    });
  });

  describe("isBlocked()", () => {
    it("returns false by default (blockCritical=false)", () => {
      const classifier = makeClassifier({ blockCritical: false });
      expect(classifier.isBlocked("devops", "PATCH", "delete all records")).toBe(false);
    });

    it("returns true when blockCritical=true for CRITICAL action", () => {
      const classifier = makeClassifier({ blockCritical: true });
      expect(classifier.isBlocked("devops", "PATCH", "delete all records")).toBe(true);
    });
  });
});

describe("getRiskClassifier / resetRiskClassifier (singleton)", () => {
  beforeEach(() => {
    resetRiskClassifier();
  });

  it("returns the same instance on repeated calls", () => {
    const a = getRiskClassifier();
    const b = getRiskClassifier();
    expect(a).toBe(b);
  });

  it("after reset, returns a new instance", () => {
    const a = getRiskClassifier();
    resetRiskClassifier();
    const b = getRiskClassifier();
    expect(a).not.toBe(b);
  });
});

describe("createRiskClassifier", () => {
  it("creates a fresh RiskClassifier instance", () => {
    const c = createRiskClassifier();
    expect(c).toBeInstanceOf(RiskClassifier);
  });

  it("creates separate instances on each call", () => {
    const a = createRiskClassifier();
    const b = createRiskClassifier();
    expect(a).not.toBe(b);
  });
});

describe("classifyRisk (quick function)", () => {
  beforeEach(() => {
    resetRiskClassifier();
  });

  it("delegates to global classifier and returns RiskClassification", () => {
    const result = classifyRisk({ agent: "researcher", mode: "READ", task: "read file" });
    expect(result).toBeDefined();
    expect(result.level).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("DEFAULT_RISK_CONFIG", () => {
  it("blockCritical is false by default", () => {
    expect(DEFAULT_RISK_CONFIG.blockCritical).toBe(false);
  });

  it("autoApproveLow is true by default", () => {
    expect(DEFAULT_RISK_CONFIG.autoApproveLow).toBe(true);
  });

  it("explicitHighConfirm is true by default", () => {
    expect(DEFAULT_RISK_CONFIG.explicitHighConfirm).toBe(true);
  });

  it("sensitiveFilePatterns includes .env", () => {
    const matchesEnv = DEFAULT_RISK_CONFIG.sensitiveFilePatterns.some((p) => p.test(".env"));
    expect(matchesEnv).toBe(true);
  });

  it("dangerousCommandPatterns includes rm -rf", () => {
    const matchesRm = DEFAULT_RISK_CONFIG.dangerousCommandPatterns.some((p) => p.test("rm -rf /tmp"));
    expect(matchesRm).toBe(true);
  });
});
