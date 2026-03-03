/**
 * Risk Classifier
 *
 * Classifies agent actions into risk levels for tiered autonomy.
 * Higher risk = more explicit confirmation required.
 *
 * Risk Levels:
 *   LOW      - Auto-approve (read, search, analyze)
 *   MEDIUM   - Batch confirm (create tests, update docs)
 *   HIGH     - Explicit confirm each (modify source, apply patch)
 *   CRITICAL - Confirm + audit + warning (delete, deploy, secrets)
 *
 * @module agents/safety/risk-classifier
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { createLogger, type Logger } from "../../logging/index.js";
import type { AgentRole } from "../types/handoff.js";
import type { InvokeMode } from "../invoke/claude-code-bridge.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Risk severity levels.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Action categories.
 */
export type ActionCategory =
  | "read"
  | "search"
  | "analyze"
  | "generate"
  | "test"
  | "document"
  | "modify"
  | "delete"
  | "deploy"
  | "security"
  | "database"
  | "unknown";

/**
 * Confirmation requirements.
 */
export type ConfirmationType = "none" | "batch" | "explicit" | "explicit_with_audit";

/**
 * Risk classification result.
 */
export interface RiskClassification {
  /** Risk level */
  level: RiskLevel;
  /** Numeric score (0-100) */
  score: number;
  /** Action category */
  category: ActionCategory;
  /** Required confirmation type */
  confirmation: ConfirmationType;
  /** Risk factors identified */
  factors: RiskFactor[];
  /** Recommendations */
  recommendations: string[];
  /** Whether action should be allowed */
  allowed: boolean;
  /** Reason if not allowed */
  blockReason?: string;
}

/**
 * Individual risk factor.
 */
export interface RiskFactor {
  /** Factor name */
  name: string;
  /** Factor weight (0-1) */
  weight: number;
  /** Description */
  description: string;
  /** Source of the factor */
  source: "action" | "agent" | "mode" | "pattern" | "file" | "command";
}

/**
 * Risk classifier configuration.
 */
export interface RiskConfig {
  /** Block CRITICAL actions entirely */
  blockCritical: boolean;
  /** Require explicit confirm for HIGH */
  explicitHighConfirm: boolean;
  /** Auto-approve LOW actions */
  autoApproveLow: boolean;
  /** File patterns to flag as high risk */
  sensitiveFilePatterns: RegExp[];
  /** Command patterns to flag as critical */
  dangerousCommandPatterns: RegExp[];
  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default risk configuration.
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  blockCritical: false, // CEO can override
  explicitHighConfirm: true,
  autoApproveLow: true,
  sensitiveFilePatterns: [
    /\.env$/,
    /\.env\.\w+$/,
    /secrets?\.(json|ya?ml|ts|js)$/i,
    /credentials?\.(json|ya?ml|ts|js)$/i,
    /\.pem$/,
    /\.key$/,
    /id_rsa/,
    /\.ssh\//,
  ],
  dangerousCommandPatterns: [
    /rm\s+-rf\s+/,
    /DROP\s+(TABLE|DATABASE)/i,
    /TRUNCATE\s+TABLE/i,
    /sudo\s+/,
    /chmod\s+777/,
    /curl.*\|\s*sh/,
    /npm\s+publish/,
    /git\s+push.*--force/,
    /kubectl\s+delete/,
    /docker\s+rm\s+-f/,
  ],
  verbose: false,
};

// ============================================================================
// Risk Mappings
// ============================================================================

/**
 * Agent risk profiles.
 */
const AGENT_RISK_PROFILES: Record<AgentRole, { baseRisk: RiskLevel; readModeOnly: boolean }> = {
  researcher: { baseRisk: "LOW", readModeOnly: true },
  pm: { baseRisk: "LOW", readModeOnly: true },
  pjm: { baseRisk: "LOW", readModeOnly: true },
  architect: { baseRisk: "MEDIUM", readModeOnly: true },
  coder: { baseRisk: "HIGH", readModeOnly: false },
  reviewer: { baseRisk: "MEDIUM", readModeOnly: true },
  tester: { baseRisk: "MEDIUM", readModeOnly: false },
  devops: { baseRisk: "CRITICAL", readModeOnly: false },
  fullstack: { baseRisk: "HIGH", readModeOnly: false },
  assistant: { baseRisk: "LOW", readModeOnly: true },
  ceo: { baseRisk: "LOW", readModeOnly: true },
  cpo: { baseRisk: "LOW", readModeOnly: true },
  cto: { baseRisk: "MEDIUM", readModeOnly: true },
};

/**
 * Mode risk multipliers.
 */
const MODE_RISK_MULTIPLIER: Record<InvokeMode, number> = {
  READ: 0.5,
  PATCH: 1.5,
  INTERACTIVE: 2.0,
};

/**
 * Action keyword risk mappings.
 */
const ACTION_KEYWORDS: Array<{ pattern: RegExp; category: ActionCategory; risk: RiskLevel }> = [
  // LOW risk
  { pattern: /\b(read|view|list|show|display|get|fetch)\b/i, category: "read", risk: "LOW" },
  { pattern: /\b(search|find|locate|grep|query)\b/i, category: "search", risk: "LOW" },
  { pattern: /\b(analyze|review|check|validate|audit)\b/i, category: "analyze", risk: "LOW" },
  { pattern: /\b(plan|design|spec|draft)\b/i, category: "generate", risk: "LOW" },

  // MEDIUM risk
  { pattern: /\b(test|unit\s*test|e2e|integration)\b/i, category: "test", risk: "MEDIUM" },
  { pattern: /\b(document|readme|docs?|comment)\b/i, category: "document", risk: "MEDIUM" },
  { pattern: /\b(create|add|generate|implement)\b/i, category: "generate", risk: "MEDIUM" },

  // HIGH risk
  { pattern: /\b(modify|update|change|edit|fix|refactor)\b/i, category: "modify", risk: "HIGH" },
  { pattern: /\b(patch|apply|merge|commit)\b/i, category: "modify", risk: "HIGH" },

  // CRITICAL risk
  { pattern: /\b(delete|remove|drop|truncate|purge)\b/i, category: "delete", risk: "CRITICAL" },
  { pattern: /\b(deploy|release|publish|push\s+prod)\b/i, category: "deploy", risk: "CRITICAL" },
  { pattern: /\b(secret|credential|password|token|key)\b/i, category: "security", risk: "CRITICAL" },
  { pattern: /\b(migrate|schema|database|db)\b/i, category: "database", risk: "HIGH" },
];

/**
 * Confirmation requirements by risk level.
 */
const CONFIRMATION_BY_RISK: Record<RiskLevel, ConfirmationType> = {
  LOW: "none",
  MEDIUM: "batch",
  HIGH: "explicit",
  CRITICAL: "explicit_with_audit",
};

/**
 * Risk level scores.
 */
const RISK_SCORES: Record<RiskLevel, number> = {
  LOW: 20,
  MEDIUM: 45,
  HIGH: 70,
  CRITICAL: 95,
};

// ============================================================================
// Risk Classifier Class
// ============================================================================

/**
 * Risk Classifier for agent actions.
 *
 * @example
 * ```typescript
 * const classifier = new RiskClassifier();
 *
 * const risk = classifier.classify({
 *   agent: "coder",
 *   mode: "PATCH",
 *   task: "delete all test files",
 * });
 *
 * if (risk.level === "CRITICAL") {
 *   console.warn("⚠️  CRITICAL action requires explicit confirmation");
 * }
 * ```
 */
export class RiskClassifier {
  private config: RiskConfig;
  private log: Logger;

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    this.log = createLogger("risk-classifier");
  }

  // ==========================================================================
  // Classification
  // ==========================================================================

  /**
   * Classify risk for an action.
   */
  classify(params: {
    agent: AgentRole;
    mode: InvokeMode;
    task: string;
    files?: string[];
    commands?: string[];
  }): RiskClassification {
    const { agent, mode, task, files = [], commands = [] } = params;
    const factors: RiskFactor[] = [];
    let totalScore = 0;
    let maxRisk: RiskLevel = "LOW";

    // 1. Agent base risk
    const agentProfile = AGENT_RISK_PROFILES[agent];
    if (agentProfile) {
      const agentRisk = RISK_SCORES[agentProfile.baseRisk];
      factors.push({
        name: `Agent: @${agent}`,
        weight: 0.3,
        description: `${agentProfile.baseRisk} base risk for ${agent}`,
        source: "agent",
      });
      totalScore += agentRisk * 0.3;
      maxRisk = this.maxRisk(maxRisk, agentProfile.baseRisk);

      // Check mode restrictions
      if (agentProfile.readModeOnly && mode !== "READ") {
        factors.push({
          name: "Mode violation",
          weight: 0.2,
          description: `${agent} should only use READ mode`,
          source: "mode",
        });
        totalScore += 20;
      }
    }

    // 2. Mode risk
    const modeMultiplier = MODE_RISK_MULTIPLIER[mode];
    factors.push({
      name: `Mode: ${mode}`,
      weight: 0.2,
      description: `${mode} mode multiplier: ${modeMultiplier}x`,
      source: "mode",
    });
    totalScore *= modeMultiplier;

    // 3. Task keyword analysis
    const taskAnalysis = this.analyzeTask(task);
    if (taskAnalysis.category !== "unknown") {
      factors.push({
        name: `Action: ${taskAnalysis.category}`,
        weight: 0.25,
        description: taskAnalysis.description,
        source: "action",
      });
      totalScore += RISK_SCORES[taskAnalysis.risk] * 0.25;
      maxRisk = this.maxRisk(maxRisk, taskAnalysis.risk);
    }

    // 4. File risk
    for (const file of files) {
      if (this.isSensitiveFile(file)) {
        factors.push({
          name: `Sensitive file: ${file}`,
          weight: 0.15,
          description: "File matches sensitive pattern",
          source: "file",
        });
        totalScore += 30;
        maxRisk = this.maxRisk(maxRisk, "HIGH");
      }
    }

    // 5. Command risk
    for (const cmd of commands) {
      const cmdRisk = this.analyzeCommand(cmd);
      if (cmdRisk) {
        factors.push({
          name: `Dangerous command`,
          weight: 0.2,
          description: cmdRisk.description,
          source: "command",
        });
        totalScore += RISK_SCORES[cmdRisk.risk] * 0.2;
        maxRisk = this.maxRisk(maxRisk, cmdRisk.risk);
      }
    }

    // Normalize score
    const score = Math.min(100, Math.max(0, totalScore));

    // Determine final risk level based on score
    let level: RiskLevel;
    if (score >= 85) level = "CRITICAL";
    else if (score >= 60) level = "HIGH";
    else if (score >= 35) level = "MEDIUM";
    else level = "LOW";

    // Use max risk if higher
    level = this.maxRisk(level, maxRisk);

    // Determine confirmation and recommendations
    const confirmation = CONFIRMATION_BY_RISK[level];
    const recommendations = this.getRecommendations(level, factors);

    // Check if blocked
    let allowed = true;
    let blockReason: string | undefined;

    if (this.config.blockCritical && level === "CRITICAL") {
      allowed = false;
      blockReason = "CRITICAL actions are blocked by policy";
    }

    const result: RiskClassification = {
      level,
      score: Math.round(score),
      category: taskAnalysis.category,
      confirmation,
      factors,
      recommendations,
      allowed,
      ...(blockReason ? { blockReason } : {}),
    };

    this.log.debug("Risk classified", {
      agent,
      mode,
      level,
      score: result.score,
      factors: factors.length,
    });

    return result;
  }

  // ==========================================================================
  // Analysis Helpers
  // ==========================================================================

  /**
   * Analyze task for keywords.
   */
  private analyzeTask(task: string): {
    category: ActionCategory;
    risk: RiskLevel;
    description: string;
  } {
    for (const { pattern, category, risk } of ACTION_KEYWORDS) {
      if (pattern.test(task)) {
        return {
          category,
          risk,
          description: `Task contains ${category} keywords`,
        };
      }
    }

    return {
      category: "unknown",
      risk: "MEDIUM", // Default to MEDIUM for unknown
      description: "Unknown action type",
    };
  }

  /**
   * Check if file is sensitive.
   */
  private isSensitiveFile(file: string): boolean {
    return this.config.sensitiveFilePatterns.some((p) => p.test(file));
  }

  /**
   * Analyze command for dangerous patterns.
   */
  private analyzeCommand(cmd: string): { risk: RiskLevel; description: string } | null {
    for (const pattern of this.config.dangerousCommandPatterns) {
      if (pattern.test(cmd)) {
        return {
          risk: "CRITICAL",
          description: `Command matches dangerous pattern: ${pattern}`,
        };
      }
    }
    return null;
  }

  /**
   * Get max risk level.
   */
  private maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
    const order: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    return order.indexOf(a) > order.indexOf(b) ? a : b;
  }

  /**
   * Get recommendations for risk level.
   */
  private getRecommendations(level: RiskLevel, factors: RiskFactor[]): string[] {
    const recommendations: string[] = [];

    switch (level) {
      case "CRITICAL":
        recommendations.push("Review all changes carefully before confirming");
        recommendations.push("Consider running in a staging environment first");
        recommendations.push("Ensure backups are available");
        break;

      case "HIGH":
        recommendations.push("Verify the changes align with the task");
        recommendations.push("Review affected files before applying");
        break;

      case "MEDIUM":
        recommendations.push("Review summary of changes");
        break;

      case "LOW":
        // No recommendations needed
        break;
    }

    // Add factor-specific recommendations
    for (const factor of factors) {
      if (factor.source === "file" && factor.name.includes("Sensitive")) {
        recommendations.push("Double-check sensitive file modifications");
      }
      if (factor.source === "command") {
        recommendations.push("Verify command safety before execution");
      }
    }

    return [...new Set(recommendations)]; // Dedupe
  }

  // ==========================================================================
  // Quick Checks
  // ==========================================================================

  /**
   * Quick check if action is safe (LOW risk).
   */
  isSafe(agent: AgentRole, mode: InvokeMode, task: string): boolean {
    return this.classify({ agent, mode, task }).level === "LOW";
  }

  /**
   * Quick check if action needs confirmation.
   */
  needsConfirmation(agent: AgentRole, mode: InvokeMode, task: string): boolean {
    const result = this.classify({ agent, mode, task });
    return result.confirmation !== "none";
  }

  /**
   * Quick check if action is blocked.
   */
  isBlocked(agent: AgentRole, mode: InvokeMode, task: string): boolean {
    return !this.classify({ agent, mode, task }).allowed;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalClassifier: RiskClassifier | undefined;

/**
 * Get global risk classifier.
 */
export function getRiskClassifier(config?: Partial<RiskConfig>): RiskClassifier {
  if (!globalClassifier) {
    globalClassifier = new RiskClassifier(config);
  }
  return globalClassifier;
}

/**
 * Reset global risk classifier.
 */
export function resetRiskClassifier(): void {
  globalClassifier = undefined;
}

/**
 * Create a new risk classifier.
 */
export function createRiskClassifier(config?: Partial<RiskConfig>): RiskClassifier {
  return new RiskClassifier(config);
}

/**
 * Quick classify function.
 */
export function classifyRisk(params: {
  agent: AgentRole;
  mode: InvokeMode;
  task: string;
  files?: string[];
  commands?: string[];
}): RiskClassification {
  return getRiskClassifier().classify(params);
}
