/**
 * Decision Classifier for Budget Escalation
 *
 * Classifies decisions into 4 buckets per CTO Day 6-7 guidance:
 * - auto: No human needed, execute immediately
 * - notify: Inform CEO but don't block execution
 * - block: Require human approval before proceeding
 * - consult: Multi-model consultation first
 *
 * Based on ADR-006 approval types and intervention matrix.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Decision classification bucket.
 * Per CTO: Must match ADR-006 approval types.
 */
export type DecisionBucket = "auto" | "notify" | "block" | "consult";

/**
 * Decision type for classification.
 */
export type DecisionType =
  | "bug_fix"
  | "new_file"
  | "file_modify"
  | "file_delete"
  | "architecture_change"
  | "major_refactor"
  | "security_related"
  | "budget_threshold"
  | "external_api"
  | "dependency_change"
  | "config_change"
  | "gate_approval"
  | "breaking_change"
  | "deploy"
  | "unknown";

/**
 * Risk level for a decision.
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Context for decision classification.
 */
export interface DecisionContext {
  /** Type of decision */
  type: DecisionType;
  /** Optional description */
  description?: string;
  /** Files affected (paths) */
  filesAffected?: string[];
  /** Cost impact estimate (USD) */
  costImpact?: number;
  /** Is this a security-sensitive operation? */
  securitySensitive?: boolean;
  /** Is this irreversible? */
  irreversible?: boolean;
  /** Does this affect external systems? */
  affectsExternal?: boolean;
  /** Current budget percentage used */
  budgetPercentage?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of decision classification.
 */
export interface ClassificationResult {
  /** Assigned bucket */
  bucket: DecisionBucket;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Reason for classification */
  reason: string;
  /** Suggested action */
  suggestedAction: string;
  /** Should notification be sent? */
  shouldNotify: boolean;
  /** Should block execution? */
  shouldBlock: boolean;
  /** Requires multi-model consultation? */
  requiresConsultation: boolean;
  /** Original context */
  context: DecisionContext;
}

/**
 * Intervention matrix entry.
 */
export interface InterventionRule {
  /** Decision type */
  type: DecisionType;
  /** Default bucket */
  defaultBucket: DecisionBucket;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Conditions that escalate to a higher bucket */
  escalationConditions?: EscalationCondition[];
}

/**
 * Condition for escalating to a higher bucket.
 */
export interface EscalationCondition {
  /** Field to check in context */
  field: keyof DecisionContext;
  /** Comparison operator */
  operator: "equals" | "contains" | "greater_than" | "less_than" | "truthy";
  /** Value to compare */
  value?: unknown;
  /** Bucket to escalate to */
  escalateTo: DecisionBucket;
  /** Reason for escalation */
  reason: string;
}

// ============================================================================
// Intervention Matrix (from ADR-006)
// ============================================================================

/**
 * Default intervention matrix per ADR-006.
 * Maps decision types to default buckets with escalation conditions.
 */
export const DEFAULT_INTERVENTION_MATRIX: InterventionRule[] = [
  // Low risk - auto
  {
    type: "bug_fix",
    defaultBucket: "auto",
    riskLevel: "low",
    escalationConditions: [
      {
        field: "securitySensitive",
        operator: "truthy",
        escalateTo: "notify",
        reason: "Security-related bug fix requires notification",
      },
    ],
  },
  {
    type: "new_file",
    defaultBucket: "auto",
    riskLevel: "low",
    escalationConditions: [
      {
        field: "filesAffected",
        operator: "contains",
        value: "config",
        escalateTo: "notify",
        reason: "New config file requires notification",
      },
    ],
  },
  {
    type: "file_modify",
    defaultBucket: "auto",
    riskLevel: "low",
    escalationConditions: [
      {
        field: "securitySensitive",
        operator: "truthy",
        escalateTo: "notify",
        reason: "Security-sensitive modification requires notification",
      },
    ],
  },

  // Medium risk - notify
  {
    type: "file_delete",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "irreversible",
        operator: "truthy",
        escalateTo: "block",
        reason: "Irreversible deletion requires approval",
      },
    ],
  },
  {
    type: "external_api",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "securitySensitive",
        operator: "truthy",
        escalateTo: "block",
        reason: "Security-sensitive API requires approval",
      },
    ],
  },
  {
    type: "dependency_change",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "affectsExternal",
        operator: "truthy",
        escalateTo: "block",
        reason: "Dependency affecting external systems requires approval",
      },
    ],
  },
  {
    type: "config_change",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "securitySensitive",
        operator: "truthy",
        escalateTo: "block",
        reason: "Security config change requires approval",
      },
    ],
  },
  {
    type: "budget_threshold",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "budgetPercentage",
        operator: "greater_than",
        value: 90,
        escalateTo: "block",
        reason: "Budget >90% requires approval to continue",
      },
    ],
  },

  // High risk - block
  {
    type: "architecture_change",
    defaultBucket: "block",
    riskLevel: "high",
    escalationConditions: [
      {
        field: "costImpact",
        operator: "greater_than",
        value: 1.0,
        escalateTo: "consult",
        reason: "High-cost architecture change requires consultation",
      },
    ],
  },
  {
    type: "major_refactor",
    defaultBucket: "block",
    riskLevel: "high",
    escalationConditions: [
      {
        field: "filesAffected",
        operator: "greater_than",
        value: 10,
        escalateTo: "consult",
        reason: "Large-scale refactor requires consultation",
      },
    ],
  },
  {
    type: "security_related",
    defaultBucket: "block",
    riskLevel: "high",
    escalationConditions: [
      {
        field: "affectsExternal",
        operator: "truthy",
        escalateTo: "consult",
        reason: "External security change requires consultation",
      },
    ],
  },
  {
    type: "gate_approval",
    defaultBucket: "block",
    riskLevel: "high",
  },
  {
    type: "breaking_change",
    defaultBucket: "block",
    riskLevel: "critical",
    escalationConditions: [
      {
        field: "affectsExternal",
        operator: "truthy",
        escalateTo: "consult",
        reason: "Breaking change affecting externals requires consultation",
      },
    ],
  },

  // Critical risk - consult
  {
    type: "deploy",
    defaultBucket: "consult",
    riskLevel: "critical",
  },

  // Unknown - default to notify
  {
    type: "unknown",
    defaultBucket: "notify",
    riskLevel: "medium",
    escalationConditions: [
      {
        field: "securitySensitive",
        operator: "truthy",
        escalateTo: "block",
        reason: "Unknown security-sensitive operation requires approval",
      },
    ],
  },
];

// ============================================================================
// Decision Classifier
// ============================================================================

/**
 * DecisionClassifier - Classifies decisions into 4 buckets.
 *
 * Per CTO Day 6-7 guidance:
 * - auto: No human needed, execute immediately
 * - notify: Inform CEO but don't block execution
 * - block: Require human approval before proceeding
 * - consult: Multi-model consultation first
 */
export class DecisionClassifier {
  private interventionMatrix: InterventionRule[];

  constructor(customMatrix?: InterventionRule[]) {
    this.interventionMatrix = customMatrix ?? [...DEFAULT_INTERVENTION_MATRIX];
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Classify a decision based on context.
   */
  classify(context: DecisionContext): ClassificationResult {
    // Find matching rule
    const rule = this.findRule(context.type);

    // Start with default bucket
    let bucket = rule.defaultBucket;
    let escalationReason: string | undefined;

    // Check escalation conditions
    if (rule.escalationConditions) {
      for (const condition of rule.escalationConditions) {
        if (this.checkCondition(context, condition)) {
          bucket = condition.escalateTo;
          escalationReason = condition.reason;
          break; // First matching escalation wins
        }
      }
    }

    // Build result
    return {
      bucket,
      riskLevel: rule.riskLevel,
      reason: escalationReason ?? this.getDefaultReason(rule, bucket),
      suggestedAction: this.getSuggestedAction(bucket),
      shouldNotify: bucket !== "auto",
      shouldBlock: bucket === "block" || bucket === "consult",
      requiresConsultation: bucket === "consult",
      context,
    };
  }

  /**
   * Quick check if a decision type requires blocking.
   */
  requiresApproval(type: DecisionType): boolean {
    const rule = this.findRule(type);
    return rule.defaultBucket === "block" || rule.defaultBucket === "consult";
  }

  /**
   * Quick check if a decision type requires consultation.
   */
  requiresConsultation(type: DecisionType): boolean {
    const rule = this.findRule(type);
    return rule.defaultBucket === "consult";
  }

  /**
   * Get risk level for a decision type.
   */
  getRiskLevel(type: DecisionType): RiskLevel {
    const rule = this.findRule(type);
    return rule.riskLevel;
  }

  /**
   * Get default bucket for a decision type.
   */
  getDefaultBucket(type: DecisionType): DecisionBucket {
    const rule = this.findRule(type);
    return rule.defaultBucket;
  }

  /**
   * Get all decision types that require blocking.
   */
  getBlockingTypes(): DecisionType[] {
    return this.interventionMatrix
      .filter((r) => r.defaultBucket === "block" || r.defaultBucket === "consult")
      .map((r) => r.type);
  }

  /**
   * Get all decision types that require consultation.
   */
  getConsultationTypes(): DecisionType[] {
    return this.interventionMatrix
      .filter((r) => r.defaultBucket === "consult")
      .map((r) => r.type);
  }

  /**
   * Get intervention matrix (for debugging/testing).
   */
  getInterventionMatrix(): InterventionRule[] {
    return [...this.interventionMatrix];
  }

  /**
   * Add or update a rule in the intervention matrix.
   */
  setRule(rule: InterventionRule): void {
    const index = this.interventionMatrix.findIndex((r) => r.type === rule.type);
    if (index >= 0) {
      this.interventionMatrix[index] = rule;
    } else {
      this.interventionMatrix.push(rule);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Find intervention rule for a decision type.
   */
  private findRule(type: DecisionType): InterventionRule {
    const rule = this.interventionMatrix.find((r) => r.type === type);
    if (rule) {
      return rule;
    }

    // Fall back to unknown rule
    const unknownRule = this.interventionMatrix.find((r) => r.type === "unknown");
    if (unknownRule) {
      return unknownRule;
    }

    // Default if no unknown rule
    return {
      type: "unknown",
      defaultBucket: "notify",
      riskLevel: "medium",
    };
  }

  /**
   * Check if an escalation condition is met.
   */
  private checkCondition(
    context: DecisionContext,
    condition: EscalationCondition,
  ): boolean {
    const fieldValue = context[condition.field];

    switch (condition.operator) {
      case "truthy":
        return Boolean(fieldValue);

      case "equals":
        return fieldValue === condition.value;

      case "contains":
        if (Array.isArray(fieldValue)) {
          const searchValue = String(condition.value);
          return fieldValue.some((item) =>
            String(item).toLowerCase().includes(searchValue.toLowerCase()),
          );
        }
        if (typeof fieldValue === "string") {
          return fieldValue
            .toLowerCase()
            .includes(String(condition.value).toLowerCase());
        }
        return false;

      case "greater_than":
        if (Array.isArray(fieldValue)) {
          return fieldValue.length > Number(condition.value);
        }
        return Number(fieldValue) > Number(condition.value);

      case "less_than":
        if (Array.isArray(fieldValue)) {
          return fieldValue.length < Number(condition.value);
        }
        return Number(fieldValue) < Number(condition.value);

      default:
        return false;
    }
  }

  /**
   * Get default reason for a classification.
   */
  private getDefaultReason(rule: InterventionRule, bucket: DecisionBucket): string {
    const typeLabel = rule.type.replace(/_/g, " ");
    switch (bucket) {
      case "auto":
        return `${typeLabel} is low-risk, auto-executing`;
      case "notify":
        return `${typeLabel} requires notification to CEO`;
      case "block":
        return `${typeLabel} requires CEO approval before proceeding`;
      case "consult":
        return `${typeLabel} requires multi-model consultation`;
      default:
        return `${typeLabel} classified as ${bucket}`;
    }
  }

  /**
   * Get suggested action for a bucket.
   */
  private getSuggestedAction(bucket: DecisionBucket): string {
    switch (bucket) {
      case "auto":
        return "Proceed with execution";
      case "notify":
        return "Execute and send notification to CEO";
      case "block":
        return "Queue for approval and wait";
      case "consult":
        return "Initiate multi-model consultation before deciding";
      default:
        return "Unknown action";
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a decision classifier with default matrix.
 */
export function createDecisionClassifier(
  customMatrix?: InterventionRule[],
): DecisionClassifier {
  return new DecisionClassifier(customMatrix);
}

/**
 * Quick classification helper.
 */
export function classifyDecision(context: DecisionContext): ClassificationResult {
  const classifier = new DecisionClassifier();
  return classifier.classify(context);
}

/**
 * Check if a decision type is auto-executable.
 */
export function isAutoExecutable(type: DecisionType): boolean {
  const classifier = new DecisionClassifier();
  return classifier.getDefaultBucket(type) === "auto";
}

/**
 * Get bucket priority for sorting (higher = more urgent).
 */
export function getBucketPriority(bucket: DecisionBucket): number {
  switch (bucket) {
    case "consult":
      return 4;
    case "block":
      return 3;
    case "notify":
      return 2;
    case "auto":
      return 1;
    default:
      return 0;
  }
}

/**
 * Get risk level priority for sorting (higher = more risky).
 */
export function getRiskPriority(riskLevel: RiskLevel): number {
  switch (riskLevel) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}
