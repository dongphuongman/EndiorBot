/**
 * Patch Intent Classifier
 *
 * Conservative classifier that detects explicit write intent from natural language
 * agent chat messages. Only triggers PATCH for high-signal patterns.
 *
 * CPO C7: Conservative — ambiguous → READ. Log all decisions.
 * ADR-031: GAP-003 — agent mentions always READ mode (this closes it).
 *
 * @module agents/intelligence/patch-intent-classifier
 * @version 1.0.0
 * @date 2026-03-11
 * @sprint 105
 * @authority ADR-031 AD-5
 */

// ============================================================================
// Types
// ============================================================================

export type PatchIntent = "READ" | "PATCH";

export interface PatchIntentResult {
  /** Classification result */
  intent: PatchIntent;
  /** Confidence score 0.0 – 1.0 */
  confidence: number;
  /** Human-readable reason for this classification */
  reason: string;
  /** The pattern that triggered PATCH (if any) */
  matchedPattern?: string;
}

// ============================================================================
// PATCH patterns (high-signal only — CPO C7)
// ============================================================================

/**
 * Each entry: { pattern, confidence, label }
 * Patterns are tested against the lower-cased message.
 */
const PATCH_PATTERNS: Array<{ pattern: RegExp; confidence: number; label: string }> = [
  // Explicit "apply" verbs
  { pattern: /\bapply\s+(this\s+)?(fix|patch|change|update|diff)\b/i, confidence: 0.9, label: "apply-fix" },
  { pattern: /\bapply\s+the\s+changes?\b/i, confidence: 0.9, label: "apply-changes" },

  // Explicit file creation
  { pattern: /\bcreate\s+(?:(?:a|an|the|new|test|spec|config)\s+)*file\b/i, confidence: 0.9, label: "create-file" },
  { pattern: /\bwrite\s+to\s+(file|disk)\b/i, confidence: 0.9, label: "write-to-file" },

  // Explicit file update/modify
  { pattern: /\bupdate\s+\S+\.(ts|js|tsx|jsx|json|md|yml|yaml|py|go|rs|java|css|html)\b/i, confidence: 0.85, label: "update-named-file" },
  { pattern: /\bmodify\s+\S+\.(ts|js|tsx|jsx|json|md|yml|yaml|py|go|rs|java|css|html)\b/i, confidence: 0.85, label: "modify-named-file" },

  // "refactor X and apply" / "implement and save"
  { pattern: /\brefactor\b.{0,40}\band\s+apply\b/i, confidence: 0.85, label: "refactor-and-apply" },
  { pattern: /\bimplement\b.{0,40}\band\s+(save|apply|write)\b/i, confidence: 0.85, label: "implement-and-save" },

  // Explicit file path with action verb (e.g. "fix the bug in src/auth.ts")
  { pattern: /\b(fix|update|modify|refactor|edit)\s+.{0,30}\bsrc\/\S+\.(ts|js|tsx|jsx)\b/i, confidence: 0.8, label: "fix-with-file-path" },
  { pattern: /\b(fix|update|modify|refactor|edit)\s+.{0,30}\b\S+\/\S+\.(ts|js|tsx|jsx|json|py|go)\b/i, confidence: 0.8, label: "fix-with-rel-path" },
];

// ============================================================================
// READ patterns (explicit override — always READ regardless of PATCH signal)
// ============================================================================

/**
 * If any of these match, force READ even if a PATCH pattern matched.
 * These represent advisory/analytical intent.
 */
const READ_OVERRIDE_PATTERNS: Array<RegExp> = [
  /\bsuggest\b/i,
  /\breview\b/i,
  /\bcheck\b/i,
  /\banalyze\b/i,
  /\banalyse\b/i,
  /\bhow\s+(do|does|can|should|would|is)\b/i,
  /\bwhat\s+(is|are|does|should)\b/i,
  /\bexplain\b/i,
  /\bwhy\s+(is|are|does)\b/i,
  /\btell\s+me\b/i,
  /\bshow\s+me\b/i,
  /\blook\s+at\b/i,
  /\blist\b/i,
  /^(hi|hello|hey)\b/i,
];

// ============================================================================
// Classifier
// ============================================================================

/**
 * Classify whether a chat message implies file writes.
 *
 * CPO C7: Conservative — only PATCH for high-signal patterns.
 * Ambiguous messages default to READ (never PATCH on uncertainty).
 *
 * @param message Raw chat message to classify
 * @returns PatchIntentResult with intent, confidence, and reason
 */
export function classifyPatchIntent(message: string): PatchIntentResult {
  const trimmed = message.trim();

  if (!trimmed) {
    return { intent: "READ", confidence: 1.0, reason: "Empty message" };
  }

  // Check READ overrides first — advisory/analytical phrases always → READ
  for (const override of READ_OVERRIDE_PATTERNS) {
    if (override.test(trimmed)) {
      return {
        intent: "READ",
        confidence: 1.0,
        reason: `Advisory pattern detected (forced READ): ${override.toString()}`,
      };
    }
  }

  // Check PATCH patterns
  let bestMatch: { confidence: number; label: string } | null = null;
  let matchedPattern: string | undefined;

  for (const { pattern, confidence, label } of PATCH_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { confidence, label };
        matchedPattern = label;
      }
    }
  }

  if (bestMatch && bestMatch.confidence >= 0.8) {
    const result: PatchIntentResult = {
      intent: "PATCH",
      confidence: bestMatch.confidence,
      reason: `Explicit write intent pattern: ${bestMatch.label}`,
    };
    if (matchedPattern) result.matchedPattern = matchedPattern;
    return result;
  }

  // Default: READ (CPO C7 — ambiguous → READ, never PATCH)
  return {
    intent: "READ",
    confidence: 0.9,
    reason: "No explicit write intent pattern matched (conservative default)",
  };
}
