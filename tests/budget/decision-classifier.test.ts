/**
 * Decision Classifier Tests
 *
 * Tests the 4-bucket classification system per CTO Day 6-7 guidance:
 * - auto: No human needed
 * - notify: Inform but don't block
 * - block: Require approval
 * - consult: Multi-model consultation first
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DecisionClassifier,
  createDecisionClassifier,
  classifyDecision,
  isAutoExecutable,
  getBucketPriority,
  getRiskPriority,
  DEFAULT_INTERVENTION_MATRIX,
  type DecisionContext,
  type DecisionType,
  type DecisionBucket,
  type RiskLevel,
  type InterventionRule,
} from "../../src/budget/decision-classifier.js";

describe("DecisionClassifier", () => {
  let classifier: DecisionClassifier;

  beforeEach(() => {
    classifier = new DecisionClassifier();
  });

  // ==========================================================================
  // Basic Classification
  // ==========================================================================

  describe("basic classification", () => {
    it("should classify bug_fix as auto", () => {
      const context: DecisionContext = { type: "bug_fix" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("auto");
      expect(result.riskLevel).toBe("low");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldNotify).toBe(false);
    });

    it("should classify new_file as auto", () => {
      const context: DecisionContext = { type: "new_file" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("auto");
      expect(result.shouldBlock).toBe(false);
    });

    it("should classify file_modify as auto", () => {
      const context: DecisionContext = { type: "file_modify" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("auto");
    });

    it("should classify file_delete as notify", () => {
      const context: DecisionContext = { type: "file_delete" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("notify");
      expect(result.riskLevel).toBe("medium");
      expect(result.shouldNotify).toBe(true);
      expect(result.shouldBlock).toBe(false);
    });

    it("should classify external_api as notify", () => {
      const context: DecisionContext = { type: "external_api" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("notify");
    });

    it("should classify architecture_change as block", () => {
      const context: DecisionContext = { type: "architecture_change" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("block");
      expect(result.riskLevel).toBe("high");
      expect(result.shouldBlock).toBe(true);
    });

    it("should classify security_related as block", () => {
      const context: DecisionContext = { type: "security_related" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("block");
      expect(result.riskLevel).toBe("high");
    });

    it("should classify deploy as consult", () => {
      const context: DecisionContext = { type: "deploy" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("consult");
      expect(result.riskLevel).toBe("critical");
      expect(result.requiresConsultation).toBe(true);
    });

    it("should classify unknown as notify", () => {
      const context: DecisionContext = { type: "unknown" };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("notify");
      expect(result.riskLevel).toBe("medium");
    });
  });

  // ==========================================================================
  // Escalation Conditions
  // ==========================================================================

  describe("escalation conditions", () => {
    it("should escalate bug_fix to notify when security-sensitive", () => {
      const context: DecisionContext = {
        type: "bug_fix",
        securitySensitive: true,
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("notify");
      expect(result.reason).toContain("Security");
    });

    it("should escalate new_file to notify when config file", () => {
      const context: DecisionContext = {
        type: "new_file",
        filesAffected: ["config/settings.json"],
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("notify");
      expect(result.reason).toContain("config");
    });

    it("should escalate file_delete to block when irreversible", () => {
      const context: DecisionContext = {
        type: "file_delete",
        irreversible: true,
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("block");
      expect(result.shouldBlock).toBe(true);
    });

    it("should escalate budget_threshold to block when >90%", () => {
      const context: DecisionContext = {
        type: "budget_threshold",
        budgetPercentage: 95,
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("block");
    });

    it("should escalate architecture_change to consult when high cost", () => {
      const context: DecisionContext = {
        type: "architecture_change",
        costImpact: 2.0,
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("consult");
      expect(result.requiresConsultation).toBe(true);
    });

    it("should escalate major_refactor to consult when many files", () => {
      const context: DecisionContext = {
        type: "major_refactor",
        filesAffected: Array(15).fill("file.ts"),
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("consult");
    });

    it("should escalate unknown to block when security-sensitive", () => {
      const context: DecisionContext = {
        type: "unknown",
        securitySensitive: true,
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("block");
    });
  });

  // ==========================================================================
  // Quick Check Methods
  // ==========================================================================

  describe("quick check methods", () => {
    it("should correctly identify types requiring approval", () => {
      expect(classifier.requiresApproval("architecture_change")).toBe(true);
      expect(classifier.requiresApproval("security_related")).toBe(true);
      expect(classifier.requiresApproval("deploy")).toBe(true);
      expect(classifier.requiresApproval("bug_fix")).toBe(false);
      expect(classifier.requiresApproval("new_file")).toBe(false);
    });

    it("should correctly identify types requiring consultation", () => {
      expect(classifier.requiresConsultation("deploy")).toBe(true);
      expect(classifier.requiresConsultation("architecture_change")).toBe(false);
      expect(classifier.requiresConsultation("bug_fix")).toBe(false);
    });

    it("should return correct risk levels", () => {
      expect(classifier.getRiskLevel("bug_fix")).toBe("low");
      expect(classifier.getRiskLevel("file_delete")).toBe("medium");
      expect(classifier.getRiskLevel("architecture_change")).toBe("high");
      expect(classifier.getRiskLevel("deploy")).toBe("critical");
    });

    it("should return correct default buckets", () => {
      expect(classifier.getDefaultBucket("bug_fix")).toBe("auto");
      expect(classifier.getDefaultBucket("file_delete")).toBe("notify");
      expect(classifier.getDefaultBucket("architecture_change")).toBe("block");
      expect(classifier.getDefaultBucket("deploy")).toBe("consult");
    });
  });

  // ==========================================================================
  // Blocking and Consultation Types
  // ==========================================================================

  describe("blocking and consultation types", () => {
    it("should return all blocking types", () => {
      const blockingTypes = classifier.getBlockingTypes();

      expect(blockingTypes).toContain("architecture_change");
      expect(blockingTypes).toContain("security_related");
      expect(blockingTypes).toContain("gate_approval");
      expect(blockingTypes).toContain("deploy");
      expect(blockingTypes).not.toContain("bug_fix");
    });

    it("should return all consultation types", () => {
      const consultTypes = classifier.getConsultationTypes();

      expect(consultTypes).toContain("deploy");
      expect(consultTypes).not.toContain("architecture_change");
    });
  });

  // ==========================================================================
  // Custom Rules
  // ==========================================================================

  describe("custom rules", () => {
    it("should allow setting custom rules", () => {
      classifier.setRule({
        type: "bug_fix",
        defaultBucket: "block",
        riskLevel: "high",
      });

      const result = classifier.classify({ type: "bug_fix" });
      expect(result.bucket).toBe("block");
      expect(result.riskLevel).toBe("high");
    });

    it("should allow adding new rules", () => {
      classifier.setRule({
        type: "custom_type" as DecisionType,
        defaultBucket: "notify",
        riskLevel: "medium",
      });

      const matrix = classifier.getInterventionMatrix();
      const customRule = matrix.find((r) => r.type === "custom_type");
      expect(customRule).toBeDefined();
    });

    it("should use custom matrix in constructor", () => {
      const customMatrix: InterventionRule[] = [
        { type: "bug_fix", defaultBucket: "block", riskLevel: "critical" },
        { type: "unknown", defaultBucket: "consult", riskLevel: "high" },
      ];

      const customClassifier = new DecisionClassifier(customMatrix);
      const result = customClassifier.classify({ type: "bug_fix" });

      expect(result.bucket).toBe("block");
      expect(result.riskLevel).toBe("critical");
    });
  });

  // ==========================================================================
  // Classification Result Properties
  // ==========================================================================

  describe("classification result properties", () => {
    it("should include context in result", () => {
      const context: DecisionContext = {
        type: "bug_fix",
        description: "Fix date format",
      };
      const result = classifier.classify(context);

      expect(result.context).toEqual(context);
    });

    it("should provide suggested action for auto", () => {
      const result = classifier.classify({ type: "bug_fix" });
      expect(result.suggestedAction).toContain("Proceed");
    });

    it("should provide suggested action for notify", () => {
      const result = classifier.classify({ type: "file_delete" });
      expect(result.suggestedAction).toContain("notification");
    });

    it("should provide suggested action for block", () => {
      const result = classifier.classify({ type: "architecture_change" });
      expect(result.suggestedAction).toContain("approval");
    });

    it("should provide suggested action for consult", () => {
      const result = classifier.classify({ type: "deploy" });
      expect(result.suggestedAction).toContain("consultation");
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty filesAffected array", () => {
      const context: DecisionContext = {
        type: "new_file",
        filesAffected: [],
      };
      const result = classifier.classify(context);

      expect(result.bucket).toBe("auto");
    });

    it("should handle undefined optional fields", () => {
      const context: DecisionContext = {
        type: "budget_threshold",
      };
      const result = classifier.classify(context);

      // Without budgetPercentage, should stay at default
      expect(result.bucket).toBe("notify");
    });

    it("should handle zero values", () => {
      const context: DecisionContext = {
        type: "architecture_change",
        costImpact: 0,
      };
      const result = classifier.classify(context);

      // Zero cost should not escalate to consult
      expect(result.bucket).toBe("block");
    });

    it("should handle boundary values for budget percentage", () => {
      // At exactly 90%, should escalate
      const context90: DecisionContext = {
        type: "budget_threshold",
        budgetPercentage: 90,
      };
      // Budget >= 90 should trigger escalation (> 90 check)
      // Actually the check is > 90, so 90 should not escalate
      const result90 = classifier.classify(context90);
      expect(result90.bucket).toBe("notify");

      // Above 90%, should escalate
      const context91: DecisionContext = {
        type: "budget_threshold",
        budgetPercentage: 91,
      };
      const result91 = classifier.classify(context91);
      expect(result91.bucket).toBe("block");
    });
  });
});

// ==========================================================================
// Factory Functions
// ==========================================================================

describe("factory functions", () => {
  describe("createDecisionClassifier", () => {
    it("should create classifier with default matrix", () => {
      const classifier = createDecisionClassifier();
      expect(classifier).toBeInstanceOf(DecisionClassifier);
    });

    it("should create classifier with custom matrix", () => {
      const customMatrix: InterventionRule[] = [
        { type: "bug_fix", defaultBucket: "notify", riskLevel: "medium" },
      ];
      const classifier = createDecisionClassifier(customMatrix);
      const result = classifier.classify({ type: "bug_fix" });

      expect(result.bucket).toBe("notify");
    });
  });

  describe("classifyDecision", () => {
    it("should classify decision without creating classifier", () => {
      const result = classifyDecision({ type: "bug_fix" });

      expect(result.bucket).toBe("auto");
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("isAutoExecutable", () => {
    it("should return true for auto types", () => {
      expect(isAutoExecutable("bug_fix")).toBe(true);
      expect(isAutoExecutable("new_file")).toBe(true);
      expect(isAutoExecutable("file_modify")).toBe(true);
    });

    it("should return false for non-auto types", () => {
      expect(isAutoExecutable("file_delete")).toBe(false);
      expect(isAutoExecutable("architecture_change")).toBe(false);
      expect(isAutoExecutable("deploy")).toBe(false);
    });
  });

  describe("getBucketPriority", () => {
    it("should return correct priorities", () => {
      expect(getBucketPriority("auto")).toBe(1);
      expect(getBucketPriority("notify")).toBe(2);
      expect(getBucketPriority("block")).toBe(3);
      expect(getBucketPriority("consult")).toBe(4);
    });

    it("should order consult > block > notify > auto", () => {
      expect(getBucketPriority("consult")).toBeGreaterThan(
        getBucketPriority("block"),
      );
      expect(getBucketPriority("block")).toBeGreaterThan(
        getBucketPriority("notify"),
      );
      expect(getBucketPriority("notify")).toBeGreaterThan(
        getBucketPriority("auto"),
      );
    });
  });

  describe("getRiskPriority", () => {
    it("should return correct priorities", () => {
      expect(getRiskPriority("low")).toBe(1);
      expect(getRiskPriority("medium")).toBe(2);
      expect(getRiskPriority("high")).toBe(3);
      expect(getRiskPriority("critical")).toBe(4);
    });

    it("should order critical > high > medium > low", () => {
      expect(getRiskPriority("critical")).toBeGreaterThan(
        getRiskPriority("high"),
      );
      expect(getRiskPriority("high")).toBeGreaterThan(getRiskPriority("medium"));
      expect(getRiskPriority("medium")).toBeGreaterThan(getRiskPriority("low"));
    });
  });
});

// ==========================================================================
// Intervention Matrix
// ==========================================================================

describe("DEFAULT_INTERVENTION_MATRIX", () => {
  it("should have all required decision types", () => {
    const types = DEFAULT_INTERVENTION_MATRIX.map((r) => r.type);

    expect(types).toContain("bug_fix");
    expect(types).toContain("new_file");
    expect(types).toContain("file_delete");
    expect(types).toContain("architecture_change");
    expect(types).toContain("security_related");
    expect(types).toContain("deploy");
    expect(types).toContain("unknown");
  });

  it("should have valid buckets for all rules", () => {
    const validBuckets: DecisionBucket[] = ["auto", "notify", "block", "consult"];

    for (const rule of DEFAULT_INTERVENTION_MATRIX) {
      expect(validBuckets).toContain(rule.defaultBucket);
    }
  });

  it("should have valid risk levels for all rules", () => {
    const validRisks: RiskLevel[] = ["low", "medium", "high", "critical"];

    for (const rule of DEFAULT_INTERVENTION_MATRIX) {
      expect(validRisks).toContain(rule.riskLevel);
    }
  });

  it("should have low-risk types map to auto bucket", () => {
    const lowRiskRules = DEFAULT_INTERVENTION_MATRIX.filter(
      (r) => r.riskLevel === "low",
    );

    for (const rule of lowRiskRules) {
      expect(rule.defaultBucket).toBe("auto");
    }
  });

  it("should have critical-risk types map to consult or block", () => {
    const criticalRules = DEFAULT_INTERVENTION_MATRIX.filter(
      (r) => r.riskLevel === "critical",
    );

    for (const rule of criticalRules) {
      expect(["block", "consult"]).toContain(rule.defaultBucket);
    }
  });
});
