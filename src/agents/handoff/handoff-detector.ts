/**
 * Handoff Detector
 *
 * Detects and validates handoff requests in agent responses.
 * Supports multiple formats: JSON blocks, inline tags, natural language.
 *
 * @module agents/handoff/handoff-detector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 55B
 */

import { createLogger, type Logger } from "../../logging/index.js";
import {
  type AgentRole,
  type ParsedHandoff,
  type HandoffPriority,
  isValidRole,
  isAllowedTransition,
} from "../types/handoff.js";

// ============================================================================
// Helper
// ============================================================================

/**
 * Create a ParsedHandoff with all required fields.
 */
function createParsedHandoff(params: {
  to: AgentRole;
  intent: string;
  priority: HandoffPriority;
  inputs?: Record<string, unknown>;
  reason?: string;
}): ParsedHandoff {
  return {
    to: params.to,
    intent: params.intent,
    priority: params.priority,
    inputs: params.inputs ?? {},
    reason: params.reason ?? "Detected handoff",
    from: "assistant" as AgentRole, // Will be updated by caller
    depth: 0, // Will be updated by caller
    timestamp: new Date(),
    correlationId: `hnd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
}

// ============================================================================
// Types
// ============================================================================

/**
 * Detection result.
 */
export interface DetectionResult {
  /** Whether handoff was detected */
  detected: boolean;
  /** Parsed handoffs */
  handoffs: ParsedHandoff[];
  /** Detection method used */
  method?: "json_block" | "inline_tag" | "natural_language" | "explicit_marker";
  /** Raw matched text */
  rawMatch?: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether handoff is valid */
  valid: boolean;
  /** Validated handoff */
  handoff?: ParsedHandoff;
  /** Validation errors */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Detector configuration.
 */
export interface DetectorConfig {
  /** Minimum confidence threshold */
  minConfidence: number;
  /** Enable natural language detection */
  enableNaturalLanguage: boolean;
  /** Source agent for transition validation */
  sourceAgent?: AgentRole;
  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default detector configuration.
 */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  minConfidence: 0.7,
  enableNaturalLanguage: true,
  verbose: false,
};

// ============================================================================
// Detection Patterns
// ============================================================================

/**
 * JSON block pattern.
 * Matches: ```json { "handoff": [...] } ```
 */
const JSON_BLOCK_PATTERN = /```(?:json)?\s*\n?\s*(\{[\s\S]*?"handoff"[\s\S]*?\})\s*```/gi;

/**
 * Inline tag pattern.
 * Matches: [@agent: message]
 */
const INLINE_TAG_PATTERN = /\[@(\w+):\s*([^\]]+)\]/g;

/**
 * Explicit marker pattern.
 * Matches: HANDOFF: @agent "message"
 */
const EXPLICIT_MARKER_PATTERN = /HANDOFF:\s*@(\w+)\s*["']?([^"'\n]+)["']?/gi;

/**
 * Natural language patterns.
 */
const NATURAL_LANGUAGE_PATTERNS: Array<{
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => { agent: string; intent: string } | null;
}> = [
  {
    // "hand this off to @coder" / "pass to @architect"
    pattern: /(?:hand(?:ing)?\s*(?:this\s*)?off|pass(?:ing)?)\s*to\s*@?(\w+)(?:\s*(?:to|for)\s+(.+))?/i,
    extractor: (m) => m[1] ? { agent: m[1], intent: m[2] ?? "continue" } : null,
  },
  {
    // "the coder should implement" / "architect needs to design"
    pattern: /(?:the\s+)?@?(\w+)\s+(?:should|needs?\s+to|will|can)\s+(.+)/i,
    extractor: (m) => m[1] ? { agent: m[1], intent: m[2] ?? "continue" } : null,
  },
  {
    // "recommend @coder for implementation"
    pattern: /recommend\s+@?(\w+)\s+(?:for|to)\s+(.+)/i,
    extractor: (m) => m[1] ? { agent: m[1], intent: m[2] ?? "continue" } : null,
  },
  {
    // "next: @architect"
    pattern: /next:\s*@?(\w+)/i,
    extractor: (m) => m[1] ? { agent: m[1], intent: "continue" } : null,
  },
];

// ============================================================================
// Handoff Detector Class
// ============================================================================

/**
 * Handoff Detector finds handoff requests in agent output.
 *
 * @example
 * ```typescript
 * const detector = new HandoffDetector({ sourceAgent: "pm" });
 *
 * const result = detector.detect(agentOutput);
 * if (result.detected) {
 *   for (const handoff of result.handoffs) {
 *     const validation = detector.validate(handoff);
 *     if (validation.valid) {
 *       // Process handoff
 *     }
 *   }
 * }
 * ```
 */
export class HandoffDetector {
  private config: DetectorConfig;
  private log: Logger;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
    this.log = createLogger("handoff-detector");
  }

  // ==========================================================================
  // Detection
  // ==========================================================================

  /**
   * Detect handoffs in agent output.
   */
  detect(output: string): DetectionResult {
    // Try methods in order of reliability
    let result = this.detectJsonBlock(output);
    if (result.detected && result.confidence >= this.config.minConfidence) {
      return result;
    }

    result = this.detectInlineTag(output);
    if (result.detected && result.confidence >= this.config.minConfidence) {
      return result;
    }

    result = this.detectExplicitMarker(output);
    if (result.detected && result.confidence >= this.config.minConfidence) {
      return result;
    }

    if (this.config.enableNaturalLanguage) {
      result = this.detectNaturalLanguage(output);
      if (result.detected && result.confidence >= this.config.minConfidence) {
        return result;
      }
    }

    return {
      detected: false,
      handoffs: [],
      confidence: 0,
    };
  }

  /**
   * Detect JSON block format.
   */
  private detectJsonBlock(output: string): DetectionResult {
    JSON_BLOCK_PATTERN.lastIndex = 0;
    const matches = [...output.matchAll(JSON_BLOCK_PATTERN)];

    if (matches.length === 0) {
      return { detected: false, handoffs: [], confidence: 0 };
    }

    const handoffs: ParsedHandoff[] = [];

    for (const match of matches) {
      const jsonStr = match[1];
      if (!jsonStr) continue;

      try {
        const json = JSON.parse(jsonStr);
        const items = Array.isArray(json.handoff) ? json.handoff : [json.handoff];

        for (const item of items) {
          if (item && item.to && isValidRole(item.to)) {
            handoffs.push(createParsedHandoff({
              to: item.to as AgentRole,
              intent: item.intent ?? "continue",
              priority: (item.priority as HandoffPriority) ?? "P1",
              inputs: item.inputs ?? {},
              reason: item.reason,
            }));
          }
        }
      } catch {
        this.log.debug("Failed to parse JSON block", { raw: jsonStr });
      }
    }

    const firstMatch = matches[0]?.[0];
    return {
      detected: handoffs.length > 0,
      handoffs,
      method: "json_block",
      ...(firstMatch ? { rawMatch: firstMatch } : {}),
      confidence: handoffs.length > 0 ? 0.95 : 0,
    };
  }

  /**
   * Detect inline tag format.
   */
  private detectInlineTag(output: string): DetectionResult {
    INLINE_TAG_PATTERN.lastIndex = 0;
    const matches = [...output.matchAll(INLINE_TAG_PATTERN)];

    if (matches.length === 0) {
      return { detected: false, handoffs: [], confidence: 0 };
    }

    const handoffs: ParsedHandoff[] = [];

    for (const match of matches) {
      const agent = match[1]?.toLowerCase();
      const intent = match[2]?.trim();

      if (agent && intent && isValidRole(agent)) {
        handoffs.push(createParsedHandoff({
          to: agent as AgentRole,
          intent,
          priority: "P1",
        }));
      }
    }

    const firstMatch = matches[0]?.[0];
    return {
      detected: handoffs.length > 0,
      handoffs,
      method: "inline_tag",
      ...(firstMatch ? { rawMatch: firstMatch } : {}),
      confidence: handoffs.length > 0 ? 0.9 : 0,
    };
  }

  /**
   * Detect explicit marker format.
   */
  private detectExplicitMarker(output: string): DetectionResult {
    EXPLICIT_MARKER_PATTERN.lastIndex = 0;
    const matches = [...output.matchAll(EXPLICIT_MARKER_PATTERN)];

    if (matches.length === 0) {
      return { detected: false, handoffs: [], confidence: 0 };
    }

    const handoffs: ParsedHandoff[] = [];

    for (const match of matches) {
      const agent = match[1]?.toLowerCase();
      const intent = match[2]?.trim();

      if (agent && intent && isValidRole(agent)) {
        handoffs.push(createParsedHandoff({
          to: agent as AgentRole,
          intent,
          priority: "P0", // Explicit markers are high priority
        }));
      }
    }

    const firstMatch = matches[0]?.[0];
    return {
      detected: handoffs.length > 0,
      handoffs,
      method: "explicit_marker",
      ...(firstMatch ? { rawMatch: firstMatch } : {}),
      confidence: handoffs.length > 0 ? 0.85 : 0,
    };
  }

  /**
   * Detect natural language patterns.
   */
  private detectNaturalLanguage(output: string): DetectionResult {
    const handoffs: ParsedHandoff[] = [];
    let rawMatch: string | undefined;

    for (const { pattern, extractor } of NATURAL_LANGUAGE_PATTERNS) {
      const match = output.match(pattern);
      if (match) {
        const extracted = extractor(match);
        if (extracted && isValidRole(extracted.agent.toLowerCase())) {
          handoffs.push(createParsedHandoff({
            to: extracted.agent.toLowerCase() as AgentRole,
            intent: extracted.intent,
            priority: "P2", // Lower confidence = lower priority
          }));
          rawMatch = match[0];
          break; // Only take first NL match
        }
      }
    }

    return {
      detected: handoffs.length > 0,
      handoffs,
      method: "natural_language",
      ...(rawMatch ? { rawMatch } : {}),
      confidence: handoffs.length > 0 ? 0.7 : 0,
    };
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate a detected handoff.
   */
  validate(handoff: ParsedHandoff): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check target agent
    if (!isValidRole(handoff.to)) {
      errors.push(`Invalid target agent: ${handoff.to}`);
    }

    // Check intent
    if (!handoff.intent || handoff.intent.length < 3) {
      errors.push("Intent is too short or missing");
    }

    // Check transition
    if (this.config.sourceAgent) {
      if (!isAllowedTransition(this.config.sourceAgent, handoff.to)) {
        errors.push(
          `Transition from @${this.config.sourceAgent} to @${handoff.to} is not allowed`
        );
      }
    }

    // Warnings
    if (handoff.priority === "P0") {
      warnings.push("High priority (P0) handoff - requires immediate attention");
    }

    if (handoff.intent.length > 200) {
      warnings.push("Intent is very long - consider summarizing");
    }

    const isValid = errors.length === 0;
    return {
      valid: isValid,
      ...(isValid ? { handoff } : {}),
      errors,
      warnings,
    };
  }

  /**
   * Detect and validate in one call.
   */
  detectAndValidate(output: string): {
    detection: DetectionResult;
    validations: ValidationResult[];
  } {
    const detection = this.detect(output);
    const validations = detection.handoffs.map((h) => this.validate(h));

    return { detection, validations };
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Set source agent for validation.
   */
  setSourceAgent(agent: AgentRole): void {
    this.config.sourceAgent = agent;
  }

  /**
   * Extract first valid handoff.
   */
  extractFirst(output: string): ParsedHandoff | null {
    const { detection, validations } = this.detectAndValidate(output);

    if (!detection.detected) return null;

    for (const validation of validations) {
      if (validation.valid && validation.handoff) {
        return validation.handoff;
      }
    }

    return null;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalDetector: HandoffDetector | undefined;

/**
 * Get global handoff detector.
 */
export function getHandoffDetector(config?: Partial<DetectorConfig>): HandoffDetector {
  if (!globalDetector) {
    globalDetector = new HandoffDetector(config);
  }
  return globalDetector;
}

/**
 * Reset global handoff detector.
 */
export function resetHandoffDetector(): void {
  globalDetector = undefined;
}

/**
 * Create a new handoff detector.
 */
export function createHandoffDetector(config?: Partial<DetectorConfig>): HandoffDetector {
  return new HandoffDetector(config);
}

/**
 * Quick detect function.
 */
export function detectHandoff(output: string, sourceAgent?: AgentRole): DetectionResult {
  if (sourceAgent) {
    // CTO Sprint 121 fix: use throwaway instance to avoid mutating global singleton
    const detector = createHandoffDetector();
    detector.setSourceAgent(sourceAgent);
    return detector.detect(output);
  }
  return getHandoffDetector().detect(output);
}
