/**
 * Response Parser
 *
 * Parses Claude Code responses to extract:
 * - Handoff JSON requests
 * - Artifacts (files, documents, specs)
 * - Structured output
 * - Error information
 *
 * Handoff Format:
 * ```json
 * {
 *   "handoff": [
 *     { "to": "architect", "intent": "...", "priority": "P1", "inputs": {}, "reason": "..." }
 *   ]
 * }
 * ```
 *
 * @module agents/invoke/response-parser
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import {
  type AgentRole,
  type HandoffItem,
  type HandoffRequest,
  type AgentArtifact,
  isValidHandoffRequest,
  isValidRole,
} from "../types/handoff.js";
import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed response result.
 */
export interface ParsedResponse {
  /** Raw output text */
  rawOutput: string;
  /** Main content (without handoff JSON) */
  content: string;
  /** Detected handoffs */
  handoffs: HandoffItem[];
  /** Whether handoff was detected */
  hasHandoff: boolean;
  /** Detected artifacts */
  artifacts: AgentArtifact[];
  /** Code blocks found */
  codeBlocks: CodeBlock[];
  /** Parse warnings */
  warnings: string[];
  /** Parse errors */
  errors: string[];
  /** Completion status */
  status: "complete" | "handoff" | "error" | "incomplete";
}

/**
 * Code block extracted from response.
 */
export interface CodeBlock {
  /** Language identifier */
  language: string;
  /** Code content */
  content: string;
  /** File path if mentioned */
  filePath?: string;
  /** Block type */
  type: "code" | "diff" | "json" | "markdown" | "shell" | "other";
}

/**
 * Parser configuration.
 */
export interface ParserConfig {
  /** Strict JSON parsing */
  strictJson: boolean;
  /** Extract code blocks */
  extractCodeBlocks: boolean;
  /** Extract artifacts */
  extractArtifacts: boolean;
  /** Max content length (truncate if exceeded) */
  maxContentLength: number;
}

/**
 * Default parser configuration.
 */
export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  strictJson: false,
  extractCodeBlocks: true,
  extractArtifacts: true,
  maxContentLength: 50000,
};

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Handoff JSON pattern.
 * Matches: ```json { "handoff": [...] } ``` or inline { "handoff": [...] }
 */
const HANDOFF_JSON_PATTERN = /```json\s*(\{[\s\S]*?"handoff"[\s\S]*?\})\s*```|\{[\s\S]*?"handoff"\s*:\s*\[[\s\S]*?\]\s*\}/g;

/**
 * Code block pattern.
 */
const CODE_BLOCK_PATTERN = /```(\w*)\n([\s\S]*?)```/g;

/**
 * File path comment pattern.
 */
const FILE_PATH_PATTERN = /(?:\/\/|#|<!--)\s*(?:file|path):\s*(.+?)(?:\n|-->|$)/i;

/**
 * Artifact header patterns.
 */
const ARTIFACT_PATTERNS = {
  file: /^##?\s*(?:File|Created|Modified):\s*(.+)$/im,
  document: /^##?\s*(?:Document|Doc):\s*(.+)$/im,
  spec: /^##?\s*(?:Spec|Specification):\s*(.+)$/im,
  plan: /^##?\s*(?:Plan|Implementation Plan):\s*(.+)$/im,
  review: /^##?\s*(?:Review|Code Review):\s*(.+)$/im,
  patch: /^##?\s*(?:Patch|Diff):\s*(.+)$/im,
};

// ============================================================================
// ResponseParser Class
// ============================================================================

/**
 * Parses Claude Code responses.
 *
 * Usage:
 * ```typescript
 * const parser = new ResponseParser();
 *
 * const result = parser.parse(claudeOutput);
 * if (result.hasHandoff) {
 *   for (const handoff of result.handoffs) {
 *     console.log(`Handoff to @${handoff.to}: ${handoff.intent}`);
 *   }
 * }
 * ```
 */
export class ResponseParser {
  private readonly config: ParserConfig;
  private readonly log: Logger;

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
    this.log = createLogger("response-parser");
  }

  // ==========================================================================
  // Main Parse Method
  // ==========================================================================

  /**
   * Parse a Claude Code response.
   */
  parse(output: string): ParsedResponse {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Truncate if needed
    let rawOutput = output;
    if (output.length > this.config.maxContentLength) {
      rawOutput = output.slice(0, this.config.maxContentLength);
      warnings.push(`Output truncated from ${output.length} to ${this.config.maxContentLength} chars`);
    }

    // Extract handoffs
    const { handoffs, handoffErrors } = this.extractHandoffs(rawOutput);
    errors.push(...handoffErrors);

    // Extract code blocks
    const codeBlocks = this.config.extractCodeBlocks
      ? this.extractCodeBlocks(rawOutput)
      : [];

    // Extract artifacts
    const artifacts = this.config.extractArtifacts
      ? this.extractArtifacts(rawOutput, codeBlocks)
      : [];

    // Clean content (remove handoff JSON)
    const content = this.cleanContent(rawOutput);

    // Determine status
    let status: ParsedResponse["status"] = "complete";
    if (errors.length > 0) {
      status = "error";
    } else if (handoffs.length > 0) {
      status = "handoff";
    } else if (content.length < 10) {
      status = "incomplete";
      warnings.push("Response content is very short");
    }

    this.log.debug("Response parsed", {
      hasHandoff: handoffs.length > 0,
      handoffCount: handoffs.length,
      artifactCount: artifacts.length,
      codeBlockCount: codeBlocks.length,
      contentLength: content.length,
      status,
    });

    return {
      rawOutput,
      content,
      handoffs,
      hasHandoff: handoffs.length > 0,
      artifacts,
      codeBlocks,
      warnings,
      errors,
      status,
    };
  }

  // ==========================================================================
  // Handoff Extraction
  // ==========================================================================

  /**
   * Extract handoffs from response.
   */
  private extractHandoffs(output: string): {
    handoffs: HandoffItem[];
    handoffErrors: string[];
  } {
    const handoffs: HandoffItem[] = [];
    const errors: string[] = [];

    // Find all potential handoff JSON blocks
    const matches = output.matchAll(HANDOFF_JSON_PATTERN);

    for (const match of matches) {
      const jsonStr = match[1] ?? match[0];

      try {
        // Clean the JSON string
        const cleaned = this.cleanJsonString(jsonStr);
        const parsed = JSON.parse(cleaned);

        if (isValidHandoffRequest(parsed)) {
          const request = parsed as HandoffRequest;
          for (const item of request.handoff) {
            // Validate target role
            if (isValidRole(item.to)) {
              handoffs.push(item);
            } else {
              errors.push(`Invalid handoff target: ${item.to}`);
            }
          }
        } else {
          // Try to extract partial handoff
          const partial = this.extractPartialHandoff(parsed);
          if (partial) {
            handoffs.push(partial);
          } else {
            errors.push("Invalid handoff JSON structure");
          }
        }
      } catch (err) {
        if (this.config.strictJson) {
          errors.push(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
        // In non-strict mode, try fuzzy extraction
        const fuzzy = this.fuzzyExtractHandoff(jsonStr);
        if (fuzzy) {
          handoffs.push(fuzzy);
        }
      }
    }

    return { handoffs, handoffErrors: errors };
  }

  /**
   * Clean JSON string for parsing.
   */
  private cleanJsonString(str: string): string {
    return str
      .trim()
      // Remove trailing commas
      .replace(/,\s*([}\]])/g, "$1")
      // Fix unquoted keys
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  }

  /**
   * Extract partial handoff from non-standard format.
   */
  private extractPartialHandoff(obj: unknown): HandoffItem | null {
    if (typeof obj !== "object" || obj === null) return null;

    const record = obj as Record<string, unknown>;

    // Try to extract required fields
    const to = record.to ?? record.target ?? record.agent;
    const intent = record.intent ?? record.task ?? record.message;

    if (typeof to !== "string" || !isValidRole(to)) return null;
    if (typeof intent !== "string" || intent.length === 0) return null;

    return {
      to: to as AgentRole,
      intent,
      priority: (record.priority as "P0" | "P1" | "P2") ?? "P1",
      inputs: (record.inputs as Record<string, unknown>) ?? {},
      reason: (record.reason as string) ?? "Extracted from response",
    };
  }

  /**
   * Fuzzy extract handoff from malformed JSON.
   */
  private fuzzyExtractHandoff(str: string): HandoffItem | null {
    // Try to extract key fields using regex
    const toMatch = str.match(/"to"\s*:\s*"(\w+)"/);
    const intentMatch = str.match(/"intent"\s*:\s*"([^"]+)"/);

    const to = toMatch?.[1];
    const intent = intentMatch?.[1];

    if (!to || !intent || !isValidRole(to)) return null;

    const priorityMatch = str.match(/"priority"\s*:\s*"(P[012])"/);
    const reasonMatch = str.match(/"reason"\s*:\s*"([^"]+)"/);

    return {
      to: to as AgentRole,
      intent,
      priority: (priorityMatch?.[1] as "P0" | "P1" | "P2") ?? "P1",
      inputs: {},
      reason: reasonMatch?.[1] ?? "Fuzzy extracted",
    };
  }

  // ==========================================================================
  // Code Block Extraction
  // ==========================================================================

  /**
   * Extract code blocks from response.
   */
  private extractCodeBlocks(output: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const matches = output.matchAll(CODE_BLOCK_PATTERN);

    for (const match of matches) {
      const language = match[1] || "text";
      const content = match[2];

      // Skip if no content
      if (!content) continue;

      // Skip handoff JSON blocks
      if (language === "json" && content.includes('"handoff"')) {
        continue;
      }

      // Detect file path
      const pathMatch = content.match(FILE_PATH_PATTERN);
      const filePath = pathMatch?.[1]?.trim();

      // Determine type
      let type: CodeBlock["type"] = "other";
      if (language === "diff" || (content.startsWith("---") && content.includes("+++"))) {
        type = "diff";
      } else if (language === "json") {
        type = "json";
      } else if (language === "markdown" || language === "md") {
        type = "markdown";
      } else if (["bash", "sh", "shell", "zsh"].includes(language)) {
        type = "shell";
      } else if (language && language !== "text") {
        type = "code";
      }

      blocks.push({
        language,
        content,
        ...(filePath ? { filePath } : {}),
        type,
      });
    }

    return blocks;
  }

  // ==========================================================================
  // Artifact Extraction
  // ==========================================================================

  /**
   * Extract artifacts from response.
   */
  private extractArtifacts(output: string, codeBlocks: CodeBlock[]): AgentArtifact[] {
    const artifacts: AgentArtifact[] = [];

    // Extract from headers
    for (const [type, pattern] of Object.entries(ARTIFACT_PATTERNS)) {
      const match = output.match(pattern);
      if (match && match[1]) {
        artifacts.push({
          type: type as AgentArtifact["type"],
          path: match[1].trim(),
          description: `${type} artifact`,
        });
      }
    }

    // Extract from code blocks with file paths
    for (const block of codeBlocks) {
      if (block.filePath) {
        const existingIndex = artifacts.findIndex((a) => a.path === block.filePath);
        const existing = existingIndex >= 0 ? artifacts[existingIndex] : undefined;
        if (existing) {
          // Update existing with content
          existing.content = block.content;
        } else {
          // Add new artifact
          artifacts.push({
            type: block.type === "diff" ? "patch" : "file",
            path: block.filePath,
            description: `${block.language} file`,
            content: block.content,
          });
        }
      }
    }

    // Extract diffs as patches
    for (const block of codeBlocks) {
      if (block.type === "diff" && !block.filePath) {
        artifacts.push({
          type: "patch",
          path: "patch.diff",
          description: "Generated patch",
          content: block.content,
        });
      }
    }

    return artifacts;
  }

  // ==========================================================================
  // Content Cleaning
  // ==========================================================================

  /**
   * Clean content by removing handoff JSON.
   */
  private cleanContent(output: string): string {
    // Remove handoff JSON blocks
    let cleaned = output.replace(/```json\s*\{[\s\S]*?"handoff"[\s\S]*?\}\s*```/g, "");

    // Remove inline handoff JSON
    cleaned = cleaned.replace(/\{[\s\S]*?"handoff"\s*:\s*\[[\s\S]*?\]\s*\}/g, "");

    // Trim and normalize whitespace
    cleaned = cleaned.trim().replace(/\n{3,}/g, "\n\n");

    return cleaned;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalParser: ResponseParser | undefined;

/**
 * Get the global ResponseParser instance.
 */
export function getResponseParser(config?: Partial<ParserConfig>): ResponseParser {
  if (!globalParser) {
    globalParser = new ResponseParser(config);
  }
  return globalParser;
}

/**
 * Reset the global ResponseParser (for testing).
 */
export function resetResponseParser(): void {
  globalParser = undefined;
}

/**
 * Create a new ResponseParser instance.
 */
export function createResponseParser(config?: Partial<ParserConfig>): ResponseParser {
  return new ResponseParser(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick parse function.
 */
export function parseResponse(output: string): ParsedResponse {
  const parser = getResponseParser();
  return parser.parse(output);
}

/**
 * Check if response contains a handoff.
 */
export function hasHandoff(output: string): boolean {
  HANDOFF_JSON_PATTERN.lastIndex = 0;
  return HANDOFF_JSON_PATTERN.test(output);
}

/**
 * Extract first handoff from response.
 */
export function extractFirstHandoff(output: string): HandoffItem | null {
  const result = parseResponse(output);
  return result.handoffs[0] ?? null;
}
