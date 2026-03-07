/**
 * Bridge Output Redactor
 *
 * Wraps OutputScrubber.scrub() (CTO C1) + adds bridge-specific:
 * - Line limits by riskMode (ADR-024 D2)
 * - Deny-by-default for high-sensitivity patterns
 * - Policy-based extra patterns
 *
 * @module bridge/security/output-redactor
 * @version 1.0.0
 * @authority ADR-024 D2, CTO C1
 * @stage 04 - BUILD (Sprint 82)
 */

import { scrub } from "../../security/output-scrubber.js";
import { CAPTURE_LINE_LIMITS, type SessionRiskMode, type RedactResult } from "../types.js";

// ============================================================================
// High-Sensitivity Patterns (deny-by-default)
// ============================================================================

/**
 * If ANY of these patterns match, the entire capture is BLOCKED.
 * Content is NOT sent to Telegram — only an error message.
 */
const HIGH_SENSITIVITY_PATTERNS: RegExp[] = [
  /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/,
  /BEGIN\s+(?:EC\s+)?PRIVATE\s+KEY/,
  /BEGIN\s+OPENSSH\s+PRIVATE\s+KEY/,
  /Authorization:\s*Bearer\s+\S{20,}/,
  /DATABASE_URL\s*=/,
  /AWS_SECRET_ACCESS_KEY\s*=/,
  /AWS_ACCESS_KEY_ID\s*=/,
  /ANTHROPIC_API_KEY\s*=/,
  /OPENAI_API_KEY\s*=/,
  /GOOGLE_API_KEY\s*=/,
  /GITHUB_TOKEN\s*=/,
  /TELEGRAM_BOT_TOKEN\s*=/,
];

/**
 * Additional token-like patterns to redact (not block).
 * Supplements OutputScrubber's 7 credential patterns.
 */
const BRIDGE_REDACT_PATTERNS: RegExp[] = [
  /(?:sk-|sk-ant-)[A-Za-z0-9_-]{20,}/g,
  /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_-]{20,}/g,
  /(?:AIzaSy)[A-Za-z0-9_-]{30,}/g,
  /(?:xoxb-|xoxp-)[A-Za-z0-9-]{30,}/g,
  /(?:nqh-ollama-)[A-Za-z0-9-]{20,}/g,
];

// ============================================================================
// Redactor
// ============================================================================

/**
 * Redact bridge capture output before sending to Telegram.
 *
 * Processing order:
 * 1. Line limit by riskMode (ADR-024 D2)
 * 2. OutputScrubber.scrub() base redaction (CTO C1 — 7 credential patterns + PEM)
 * 3. High-sensitivity deny-by-default check
 * 4. Bridge-specific token patterns
 * 5. Policy extra patterns
 *
 * @param output - Raw tmux capture output
 * @param riskMode - Session risk mode
 * @param extraPatterns - Additional patterns from BridgePolicy.captureRedactPatterns
 * @returns RedactResult with content or blocked status
 */
export function redactBridgeOutput(
  output: string,
  riskMode: SessionRiskMode,
  extraPatterns: string[] = []
): RedactResult {
  if (!output) {
    return { blocked: false, content: "", violations: [] };
  }

  // 1. Line limit by riskMode
  const maxLines = CAPTURE_LINE_LIMITS[riskMode];
  const lines = output.split("\n");
  const trimmed = lines.slice(-maxLines).join("\n");

  // 2. OutputScrubber base redaction (CTO C1)
  const { scrubbed, violations } = scrub(trimmed);

  // 3. High-sensitivity deny-by-default check
  for (const pattern of HIGH_SENSITIVITY_PATTERNS) {
    if (pattern.test(scrubbed)) {
      return {
        blocked: true,
        content: "",
        reason: "Sensitive output detected — not sent to Telegram",
        violations: [...violations, "high_sensitivity_blocked"],
      };
    }
  }

  // 4. Bridge-specific token patterns
  let result = scrubbed;
  const bridgeViolations = [...violations];

  for (const pattern of BRIDGE_REDACT_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      bridgeViolations.push("bridge_token");
      pattern.lastIndex = 0;
      result = result.replace(pattern, "[REDACTED]");
    }
  }

  // 5. Policy extra patterns
  for (const patternStr of extraPatterns) {
    try {
      const regex = new RegExp(patternStr, "g");
      if (regex.test(result)) {
        bridgeViolations.push("policy_pattern");
        regex.lastIndex = 0;
        result = result.replace(regex, "[REDACTED]");
      }
    } catch {
      // Skip invalid regex patterns
    }
  }

  return {
    blocked: false,
    content: result,
    violations: [...new Set(bridgeViolations)],
  };
}
