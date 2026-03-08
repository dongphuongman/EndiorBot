/**
 * Output Evaluator — Sprint 88 (ADR-025)
 *
 * Post-turn quality scoring pipeline. Captures tmux output and runs
 * 5-signal vibecoding analysis. Scores are ADVISORY only (no gating).
 *
 * Note: Signals are tuned for source code patterns but input is a mixed
 * agent conversation transcript (prose + code + tool output). Scores are
 * heuristic approximations — acceptable for v1. Future sprints can refine
 * by parsing tool call boundaries.
 *
 * @module bridge/intelligence/output-evaluator
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-025 (Post-turn layer)
 * @stage 04 - BUILD (Sprint 88)
 */

import { createHash } from "node:crypto";
import type { EvaluatorEnvelope, EvaluatorSignals } from "./envelope.js";

// ============================================================================
// Constants
// ============================================================================

/** Minimum raw text length to evaluate (below this → null) */
export const MIN_TEXT_LENGTH = 10;

/** Signal weights (must sum to 1.0) */
export const SIGNAL_WEIGHTS = {
  codeTestRatio: 0.25,
  commentDensity: 0.15,
  errorPatterns: 0.25,
  complexity: 0.20,
  lintCompliance: 0.15,
} as const;

/** Score threshold for PASS vs WARN */
export const PASS_THRESHOLD = 60;

// ============================================================================
// Signal Analyzers (pure functions, each returns 0-100)
// ============================================================================

/**
 * Code/test ratio: count test patterns relative to total code lines.
 * Higher ratio of test patterns = higher score.
 */
export function scoreCodeTestRatio(text: string): number {
  const lines = text.split("\n");
  const codeLines = lines.filter((l) => l.trim().length > 0);
  if (codeLines.length === 0) return 50; // neutral

  const testPatterns = /\b(test|it|expect|describe|beforeEach|afterEach|beforeAll|afterAll)\s*\(/;
  const testLines = codeLines.filter((l) => testPatterns.test(l)).length;

  // Ratio: test lines / total code lines
  const ratio = testLines / codeLines.length;

  // 0% → 30, 10% → 60, 20%+ → 90, 40%+ → 100
  if (ratio >= 0.4) return 100;
  if (ratio >= 0.2) return 90;
  if (ratio >= 0.1) return 60;
  if (ratio >= 0.05) return 45;
  return 30;
}

/**
 * Comment density: count JSDoc and inline comments relative to code lines.
 * More documentation coverage = higher score.
 */
export function scoreCommentDensity(text: string): number {
  const lines = text.split("\n");
  const codeLines = lines.filter((l) => l.trim().length > 0);
  if (codeLines.length === 0) return 50;

  const commentPatterns = /^\s*(\/\*\*|\/\/|\*\s|@param|@returns|@module|@version|@throws)/;
  const commentLines = codeLines.filter((l) => commentPatterns.test(l)).length;

  const ratio = commentLines / codeLines.length;

  // 0% → 30, 5% → 50, 10% → 70, 20%+ → 90, 30%+ → 100
  if (ratio >= 0.3) return 100;
  if (ratio >= 0.2) return 90;
  if (ratio >= 0.1) return 70;
  if (ratio >= 0.05) return 50;
  return 30;
}

/**
 * Error patterns: detect anti-patterns in output.
 * Fewer anti-patterns = higher score.
 */
export function scoreErrorPatterns(text: string): number {
  const patterns = [
    /:\s*any\b/g,           // `: any` type annotation
    /\bany\[\]/g,           // `any[]` array
    /\bconsole\.error\b/g,  // console.error calls
    /\bTODO\b/gi,           // TODO markers
    /\bFIXME\b/gi,          // FIXME markers
    /\bHACK\b/gi,           // HACK markers
    /\bas\s+any\b/g,        // `as any` cast
  ];

  let totalHits = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) totalHits += matches.length;
  }

  // 0 hits → 100, 1-2 → 80, 3-5 → 60, 6-10 → 40, 11+ → 20
  if (totalHits === 0) return 100;
  if (totalHits <= 2) return 80;
  if (totalHits <= 5) return 60;
  if (totalHits <= 10) return 40;
  return 20;
}

/**
 * Complexity: count control-flow keywords per code block.
 * Lower density = higher score (simpler code).
 */
export function scoreComplexity(text: string): number {
  const lines = text.split("\n");
  const codeLines = lines.filter((l) => l.trim().length > 0);
  if (codeLines.length === 0) return 50;

  const complexityKeywords = /\b(if|else|for|while|switch|case|try|catch|throw)\b/g;
  const matches = text.match(complexityKeywords);
  const keywordCount = matches ? matches.length : 0;

  // Density: keywords per 10 code lines
  const density = (keywordCount / codeLines.length) * 10;

  // density 0-1 → 100, 1-2 → 85, 2-3 → 70, 3-5 → 55, 5+ → 35
  if (density <= 1) return 100;
  if (density <= 2) return 85;
  if (density <= 3) return 70;
  if (density <= 5) return 55;
  return 35;
}

/**
 * Lint compliance: detect ESLint/TypeScript error patterns in output.
 * Clean output = full score.
 */
export function scoreLintCompliance(text: string): number {
  const lintPatterns = [
    /\berror\s+TS\d+/gi,               // TypeScript errors: "error TS2345"
    /\d+:\d+\s+error\b/g,              // ESLint format: "12:5 error"
    /\d+:\d+\s+warning\b/g,            // ESLint warnings: "12:5 warning"
    /✖\s+\d+\s+problem/g,              // ESLint summary: "✖ 5 problems"
    /\bERROR\b.*\bexpected\b/gi,       // Parse errors
    /\bSyntaxError\b/g,                // Syntax errors
  ];

  let totalHits = 0;
  for (const pattern of lintPatterns) {
    const matches = text.match(pattern);
    if (matches) totalHits += matches.length;
  }

  // 0 hits → 100, 1-2 → 70, 3-5 → 45, 6+ → 20
  if (totalHits === 0) return 100;
  if (totalHits <= 2) return 70;
  if (totalHits <= 5) return 45;
  return 20;
}

// ============================================================================
// Vibecoding Index Computation
// ============================================================================

/**
 * Compute weighted vibecoding index from 5 signal scores.
 */
export function computeVibecodingIndex(signals: EvaluatorSignals): number {
  const weighted =
    signals.codeTestRatio * SIGNAL_WEIGHTS.codeTestRatio +
    signals.commentDensity * SIGNAL_WEIGHTS.commentDensity +
    signals.errorPatterns * SIGNAL_WEIGHTS.errorPatterns +
    signals.complexity * SIGNAL_WEIGHTS.complexity +
    signals.lintCompliance * SIGNAL_WEIGHTS.lintCompliance;

  return Math.round(weighted);
}

/**
 * Generate human-readable summary from score and signals.
 */
export function generateSummary(score: number, signals: EvaluatorSignals): string {
  const badge = score >= PASS_THRESHOLD ? "PASS" : "WARN";

  // Find the 2 weakest signals
  const entries: [string, number][] = [
    ["code/test ratio", signals.codeTestRatio],
    ["comment density", signals.commentDensity],
    ["error patterns", signals.errorPatterns],
    ["complexity", signals.complexity],
    ["lint compliance", signals.lintCompliance],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  const weakest = entries.slice(0, 2);

  const weakestStr = weakest
    .map(([name, val]) => `${name}: ${val}`)
    .join(", ");

  return `${badge} (${score}/100) — weakest: ${weakestStr}`;
}

// ============================================================================
// Main Evaluator
// ============================================================================

/**
 * Evaluate captured tmux output and produce an EvaluatorEnvelope.
 *
 * Returns null if the raw text is too short to meaningfully evaluate.
 *
 * @param rawText - Raw tmux pane output (from capturePane)
 * @param turnNumber - Turn number this evaluation covers
 */
export function evaluateOutput(rawText: string, turnNumber: number): EvaluatorEnvelope | null {
  if (!rawText || rawText.length < MIN_TEXT_LENGTH) {
    return null;
  }

  const signals: EvaluatorSignals = {
    codeTestRatio: scoreCodeTestRatio(rawText),
    commentDensity: scoreCommentDensity(rawText),
    errorPatterns: scoreErrorPatterns(rawText),
    complexity: scoreComplexity(rawText),
    lintCompliance: scoreLintCompliance(rawText),
  };

  const score = computeVibecodingIndex(signals);
  const summary = generateSummary(score, signals);
  const captureHash = createHash("sha256").update(rawText).digest("hex");

  return {
    turnNumber,
    evaluatedAt: new Date().toISOString(),
    score,
    signals,
    summary,
    captureHash,
  };
}
