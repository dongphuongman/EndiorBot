/**
 * Intent Parser for CEO Messages
 *
 * Parses incoming CEO messages to intents for action routing.
 *
 * Per Sprint 46 Days 6-7 CTO direction:
 * - Exact commands first, NLP fallback second
 * - 5 intents: APPROVE, REJECT, STATUS, SHOW_ERROR, TRY_DIFFERENT
 * - Zero ambiguity on command matches
 *
 * @module channels/conversation/intents
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 6-7
 * @authority CTO Review
 * @stage 04 - BUILD
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Intent types parsed from CEO messages.
 */
export type Intent =
  | "APPROVE"
  | "REJECT"
  | "STATUS"
  | "SHOW_ERROR"
  | "TRY_DIFFERENT"
  | "UNKNOWN";

/**
 * Parsed intent result.
 */
export interface ParsedIntent {
  /** Detected intent */
  intent: Intent;
  /** Confidence level (1.0 = exact command, 0.7-0.9 = NLP match) */
  confidence: number;
  /** Extracted parameters (e.g., approval ID) */
  params: IntentParams;
  /** Original message */
  originalMessage: string;
  /** Parse method used */
  method: "command" | "nlp";
}

/**
 * Intent parameters extracted from message.
 */
export interface IntentParams {
  /** Approval ID (for APPROVE/REJECT) */
  approvalId?: string;
  /** Rejection reason */
  reason?: string;
  /** Error index (for SHOW_ERROR) */
  errorIndex?: number;
  /** Retry strategy (for TRY_DIFFERENT) */
  strategy?: string;
}

// ============================================================================
// Command Patterns (Priority 1 - Exact Match)
// ============================================================================

/**
 * Command patterns with exact matching.
 * Commands are case-insensitive, start with '/'.
 */
const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  intent: Intent;
  extractParams: (match: RegExpMatchArray) => IntentParams;
}> = [
  // /approve [id] or /approve [id] [notes]
  {
    pattern: /^\/approve\s+(\S+)(?:\s+(.+))?$/i,
    intent: "APPROVE",
    extractParams: (match) => {
      const params: IntentParams = {};
      if (match[1]) params.approvalId = match[1];
      if (match[2]) params.reason = match[2];
      return params;
    },
  },
  // /reject [id] [reason]
  {
    pattern: /^\/reject\s+(\S+)(?:\s+(.+))?$/i,
    intent: "REJECT",
    extractParams: (match) => {
      const params: IntentParams = { reason: "Rejected by CEO" };
      if (match[1]) params.approvalId = match[1];
      if (match[2]) params.reason = match[2];
      return params;
    },
  },
  // /status
  {
    pattern: /^\/status$/i,
    intent: "STATUS",
    extractParams: () => ({}),
  },
  // /error [index]
  {
    pattern: /^\/error(?:\s+(\d+))?$/i,
    intent: "SHOW_ERROR",
    extractParams: (match) => {
      const params: IntentParams = {};
      if (match[1]) params.errorIndex = parseInt(match[1], 10);
      return params;
    },
  },
  // /retry [strategy]
  {
    pattern: /^\/retry(?:\s+(\S+))?$/i,
    intent: "TRY_DIFFERENT",
    extractParams: (match) => {
      const params: IntentParams = {};
      if (match[1]) params.strategy = match[1];
      return params;
    },
  },
  // /help - also STATUS-like (show available commands)
  {
    pattern: /^\/help$/i,
    intent: "STATUS",
    extractParams: () => ({}),
  },
];

// ============================================================================
// NLP Patterns (Priority 2 - Fuzzy Match)
// ============================================================================

/**
 * NLP patterns for natural language understanding.
 * Lower confidence than commands, supports variations.
 */
const NLP_PATTERNS: Array<{
  patterns: RegExp[];
  intent: Intent;
  confidence: number;
  extractParams: (message: string) => IntentParams;
}> = [
  // STATUS patterns
  {
    patterns: [
      /\b(?:what(?:'s|s)?|show|check)\s+(?:the\s+)?status\b/i,
      /\bhow\s+(?:is\s+)?(?:it|everything|the\s+project)\s+going\b/i,
      /\bwhat(?:'s|s)?\s+happening\b/i,
      /\bstatus\s+(?:update|check|report)\b/i,
      /\bgive\s+me\s+(?:a\s+)?(?:status|update)\b/i,
    ],
    intent: "STATUS",
    confidence: 0.85,
    extractParams: () => ({}),
  },
  // SHOW_ERROR patterns
  {
    patterns: [
      /\bshow\s+(?:me\s+)?(?:the\s+)?error(?:s)?\b/i,
      /\bwhat(?:'s|s)?\s+(?:the\s+)?error\b/i,
      /\bwhat\s+went\s+wrong\b/i,
      /\bwhat\s+failed\b/i,
      /\blast\s+error\b/i,
      /\berror\s+(?:details|message|log)\b/i,
    ],
    intent: "SHOW_ERROR",
    confidence: 0.85,
    extractParams: () => ({}),
  },
  // TRY_DIFFERENT patterns
  {
    patterns: [
      /\btry\s+(?:a\s+)?(?:different|another|new)\s+(?:approach|way|method|strategy)\b/i,
      /\btry\s+again\b/i,
      /\bretry\b/i,
      /\bdo\s+it\s+differently\b/i,
      /\buse\s+(?:a\s+)?different\s+(?:model|provider|approach)\b/i,
      /\btry\s+(?:with\s+)?(?:claude|gpt|gemini)\b/i,
    ],
    intent: "TRY_DIFFERENT",
    confidence: 0.8,
    extractParams: (message) => {
      // Try to extract model/strategy hint
      const params: IntentParams = {};
      const modelMatch = message.match(/\b(claude|gpt|gemini|ollama)\b/i);
      if (modelMatch && modelMatch[1]) {
        params.strategy = modelMatch[1].toLowerCase();
      }
      return params;
    },
  },
  // APPROVE patterns (less common via NLP)
  {
    patterns: [
      /\b(?:yes|ok|okay|approve|approved|go\s+ahead|proceed|continue)\b/i,
      /\bi\s+approve\b/i,
      /\blooks?\s+good\b/i,
      /\bship\s+it\b/i,
    ],
    intent: "APPROVE",
    confidence: 0.7, // Lower confidence - may need context
    extractParams: () => ({}),
  },
  // REJECT patterns (less common via NLP)
  {
    patterns: [
      /\b(?:no|stop|reject|denied|don(?:'t|t)\s+do\s+(?:it|that))\b/i,
      /\bi\s+reject\b/i,
      /\bcancel\s+(?:it|that|this)\b/i,
      /\babort\b/i,
    ],
    intent: "REJECT",
    confidence: 0.7, // Lower confidence - may need context
    extractParams: () => ({}),
  },
];

// ============================================================================
// Intent Parser
// ============================================================================

/**
 * Parse a CEO message to extract intent.
 *
 * Priority order:
 * 1. Exact command match (confidence: 1.0)
 * 2. NLP pattern match (confidence: 0.7-0.9)
 * 3. Unknown (confidence: 0.0)
 *
 * @param message - Raw message from CEO
 * @returns Parsed intent with confidence and parameters
 */
export function parseIntent(message: string): ParsedIntent {
  const trimmed = message.trim();

  // Priority 1: Exact command match
  const commandResult = parseCommand(trimmed);
  if (commandResult) {
    return commandResult;
  }

  // Priority 2: NLP pattern match
  const nlpResult = parseNLP(trimmed);
  if (nlpResult) {
    return nlpResult;
  }

  // No match - Unknown
  return {
    intent: "UNKNOWN",
    confidence: 0,
    params: {},
    originalMessage: trimmed,
    method: "nlp",
  };
}

/**
 * Parse exact command.
 */
function parseCommand(message: string): ParsedIntent | null {
  for (const { pattern, intent, extractParams } of COMMAND_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const params = extractParams(match);
      // Clean undefined values
      const cleanParams: IntentParams = {};
      if (params.approvalId !== undefined) cleanParams.approvalId = params.approvalId;
      if (params.reason !== undefined) cleanParams.reason = params.reason;
      if (params.errorIndex !== undefined) cleanParams.errorIndex = params.errorIndex;
      if (params.strategy !== undefined) cleanParams.strategy = params.strategy;

      return {
        intent,
        confidence: 1.0,
        params: cleanParams,
        originalMessage: message,
        method: "command",
      };
    }
  }
  return null;
}

/**
 * Parse via NLP patterns.
 */
function parseNLP(message: string): ParsedIntent | null {
  // Find best match by confidence
  let bestMatch: ParsedIntent | null = null;

  for (const { patterns, intent, confidence, extractParams } of NLP_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        const params = extractParams(message);
        // Clean undefined values
        const cleanParams: IntentParams = {};
        if (params.approvalId !== undefined) cleanParams.approvalId = params.approvalId;
        if (params.reason !== undefined) cleanParams.reason = params.reason;
        if (params.errorIndex !== undefined) cleanParams.errorIndex = params.errorIndex;
        if (params.strategy !== undefined) cleanParams.strategy = params.strategy;

        const result: ParsedIntent = {
          intent,
          confidence,
          params: cleanParams,
          originalMessage: message,
          method: "nlp",
        };

        // Keep highest confidence match
        if (!bestMatch || result.confidence > bestMatch.confidence) {
          bestMatch = result;
        }

        break; // Only need first pattern match per intent
      }
    }
  }

  return bestMatch;
}

/**
 * Check if intent requires an approval ID.
 */
export function requiresApprovalId(intent: Intent): boolean {
  return intent === "APPROVE" || intent === "REJECT";
}

/**
 * Check if intent is actionable (not UNKNOWN).
 */
export function isActionableIntent(intent: Intent): boolean {
  return intent !== "UNKNOWN";
}

/**
 * Get human-readable intent description.
 */
export function getIntentDescription(intent: Intent): string {
  switch (intent) {
    case "APPROVE":
      return "Approve a pending request";
    case "REJECT":
      return "Reject a pending request";
    case "STATUS":
      return "Show current status";
    case "SHOW_ERROR":
      return "Show last error details";
    case "TRY_DIFFERENT":
      return "Retry with different approach";
    case "UNKNOWN":
      return "Unknown intent";
  }
}
