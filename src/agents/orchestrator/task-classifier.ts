/**
 * Task Classifier
 *
 * Classifies queries to determine task type and recommended models.
 * Based on TS-003 Agent Orchestration specification.
 */

import type {
  ModelRecommendation,
  ModelSelection,
  QueryClassification,
  TaskType,
} from "../types.js";

// ============================================================================
// Task Type Patterns
// ============================================================================

const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  architecture: [
    /design\s+(system|architecture|api|database|schema)/i,
    /architect(ure)?\s+(decision|review|pattern)/i,
    /how\s+should\s+(we|i)\s+(design|architect|structure)/i,
    /adr|technical\s+spec/i,
    /microservice|monolith|serverless/i,
    /@consult/i,
  ],
  security: [
    /security\s+(review|audit|vulnerability|assessment)/i,
    /auth(entication|orization)/i,
    /encrypt|decrypt|hash|salt/i,
    /injection|xss|csrf|sql\s+injection/i,
    /credential|secret|api\s*key/i,
    /owasp|penetration\s+test/i,
  ],
  code_gen: [
    /implement|create|build|write\s+(code|function|class|component)/i,
    /add\s+(feature|functionality|method)/i,
    /generate\s+(code|implementation)/i,
    /@quick/i,
  ],
  bug_fix: [
    /fix\s+(bug|error|issue|problem)/i,
    /debug|troubleshoot/i,
    /not\s+working|broken|failing/i,
    /error:\s+/i,
    /exception|crash|undefined/i,
  ],
  research: [
    /research|investigate|explore/i,
    /compare\s+(options|alternatives|approaches)/i,
    /what\s+are\s+the\s+(best|options|ways)/i,
    /recommend(ation)?s?\s+for/i,
    /state\s+of\s+the\s+art/i,
    /latest\s+(trends|practices|tools)/i,
  ],
  general: [],
};

// ============================================================================
// Complexity Indicators
// ============================================================================

const HIGH_COMPLEXITY_PATTERNS = [
  /integrat(e|ion)\s+with\s+multiple/i,
  /migrate|refactor|redesign/i,
  /scale|performance\s+optim/i,
  /distributed|concurrent|parallel/i,
  /complex|challenging|difficult/i,
];

const LOW_COMPLEXITY_PATTERNS = [
  /simple|basic|straightforward/i,
  /quick|fast|easy/i,
  /typo|rename|update\s+(text|string)/i,
  /add\s+comment|documentation/i,
];

// ============================================================================
// Urgency Indicators
// ============================================================================

const HIGH_URGENCY_PATTERNS = [
  /urgent|asap|immediately/i,
  /critical|blocker|blocking/i,
  /production\s+(issue|down|error)/i,
  /hotfix|emergency/i,
];

// ============================================================================
// Task Classifier
// ============================================================================

export class TaskClassifier {
  /**
   * Classify a query to determine task type and recommendations.
   */
  classify(query: string): QueryClassification {
    const taskType = this.detectTaskType(query);
    const complexity = this.assessComplexity(query);
    const urgency = this.detectUrgency(query);
    const domain = this.detectDomain(query);
    const recommendedModel = this.recommendModel(query, taskType, complexity);

    return {
      complexity,
      domain,
      urgency,
      recommendedModel,
    };
  }

  /**
   * Detect the task type from query content.
   */
  detectTaskType(query: string): TaskType {
    // Check explicit markers first
    if (query.includes("@consult")) return "architecture";
    if (query.includes("@quick")) return "code_gen";

    // Check patterns for each task type
    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
      if (taskType === "general") continue;

      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return taskType as TaskType;
        }
      }
    }

    return "general";
  }

  /**
   * Get recommended models for a task type.
   */
  getRecommendedModels(taskType: TaskType): ModelSelection[] {
    switch (taskType) {
      case "architecture":
        return [
          { provider: "anthropic", model: "claude-opus-4", role: "primary" },
          { provider: "openai", model: "gpt-5", role: "expert" },
          { provider: "google", model: "gemini-2-pro", role: "expert" },
        ];
      case "security":
        return [
          { provider: "anthropic", model: "claude-opus-4", role: "primary" },
          { provider: "openai", model: "gpt-5", role: "expert" },
        ];
      case "code_gen":
      case "bug_fix":
        return [
          { provider: "anthropic", model: "claude-opus-4", role: "primary" },
        ];
      case "research":
        return [
          { provider: "google", model: "gemini-2-pro", role: "primary" },
          { provider: "anthropic", model: "claude-opus-4", role: "expert" },
        ];
      default:
        return [
          { provider: "anthropic", model: "claude-opus-4", role: "primary" },
        ];
    }
  }

  /**
   * Assess query complexity.
   */
  private assessComplexity(query: string): "low" | "medium" | "high" {
    // Check for high complexity indicators
    for (const pattern of HIGH_COMPLEXITY_PATTERNS) {
      if (pattern.test(query)) {
        return "high";
      }
    }

    // Check for low complexity indicators
    for (const pattern of LOW_COMPLEXITY_PATTERNS) {
      if (pattern.test(query)) {
        return "low";
      }
    }

    // Default to medium
    return "medium";
  }

  /**
   * Detect urgency level.
   */
  private detectUrgency(query: string): "low" | "normal" | "high" {
    for (const pattern of HIGH_URGENCY_PATTERNS) {
      if (pattern.test(query)) {
        return "high";
      }
    }

    return "normal";
  }

  /**
   * Detect the domain/area of the query.
   */
  private detectDomain(query: string): string {
    const domains: Record<string, RegExp[]> = {
      frontend: [/react|vue|angular|css|html|ui|ux|component/i],
      backend: [/api|server|database|endpoint|rest|graphql/i],
      devops: [/docker|kubernetes|ci|cd|deploy|infrastructure/i],
      testing: [/test|spec|coverage|mock|stub|fixture/i],
      security: [/auth|security|encrypt|permission/i],
      data: [/data|analytics|ml|ai|model|training/i],
    };

    for (const [domain, patterns] of Object.entries(domains)) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return domain;
        }
      }
    }

    return "general";
  }

  /**
   * Recommend a model based on query characteristics.
   */
  private recommendModel(
    _query: string,
    taskType: TaskType,
    complexity: "low" | "medium" | "high",
  ): ModelRecommendation {
    // High complexity or architecture → Opus
    if (complexity === "high" || taskType === "architecture" || taskType === "security") {
      return {
        model: "claude-opus-4",
        reason: "Complex reasoning or architecture decision required",
      };
    }

    // Medium complexity → Sonnet
    if (complexity === "medium") {
      return {
        model: "claude-sonnet-4",
        reason: "Balanced speed and quality for medium complexity",
      };
    }

    // Low complexity or quick tasks → Haiku
    return {
      model: "claude-haiku-4",
      reason: "Fast response for straightforward task",
    };
  }
}

// Singleton instance
let globalClassifier: TaskClassifier | undefined;

export function getTaskClassifier(): TaskClassifier {
  if (!globalClassifier) {
    globalClassifier = new TaskClassifier();
  }
  return globalClassifier;
}
