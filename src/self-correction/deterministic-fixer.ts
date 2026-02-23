/**
 * Deterministic Fixer for Self-Correction Engine
 *
 * Applies deterministic fixes for BUILD/LINT/TYPE errors.
 *
 * Per Sprint 37 requirements:
 * - Target: Build 80%, Lint 90%, Type 70%
 * - TEST is EXPERIMENTAL (30% target, AI-suggested)
 * - 3-strike escalation for repeated failures
 *
 * @module src/self-correction/deterministic-fixer
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 * @authority ADR-007 Budget Control, Phase 3
 */

import type {
  ClassifiedError,
  TypeScriptError,
  LintError,
  BuildError,
  TestError,
  ProposedFix,
  FixType,
  FixConfidence,
  FixResult,
  StrikeRecord,
} from "./types.js";
import { MAX_STRIKES } from "./types.js";

// ============================================================================
// Fix Patterns
// ============================================================================

/**
 * TypeScript error fix patterns.
 * Maps TS error codes to fix strategies.
 */
const TS_FIX_PATTERNS: Record<number, {
  type: FixType;
  confidence: FixConfidence;
  description: string;
  fix: (error: TypeScriptError, fileContent: string) => string | null;
}> = {
  // TS2304: Cannot find name 'X'
  2304: {
    type: "add_import",
    confidence: "high",
    description: "Add missing import",
    fix: (error, content) => {
      const nameMatch = /Cannot find name '(\w+)'/.exec(error.message);
      if (!nameMatch) return null;
      const name = nameMatch[1];

      // Common Node.js globals
      const nodeGlobals: Record<string, string> = {
        process: 'import process from "process";',
        Buffer: 'import { Buffer } from "buffer";',
        __dirname: 'import { dirname } from "path"; import { fileURLToPath } from "url"; const __dirname = dirname(fileURLToPath(import.meta.url));',
        __filename: 'import { fileURLToPath } from "url"; const __filename = fileURLToPath(import.meta.url);',
      };

      if (name && nodeGlobals[name]) {
        return nodeGlobals[name] + "\n" + content;
      }
      return null;
    },
  },

  // TS2339: Property 'X' does not exist on type 'Y'
  2339: {
    type: "add_property",
    confidence: "medium",
    description: "Add missing property to type",
    fix: (_error) => {
      // This requires more context analysis
      // For now, return null to indicate manual fix needed
      return null;
    },
  },

  // TS6133: 'X' is declared but its value is never read
  6133: {
    type: "remove_unused",
    confidence: "high",
    description: "Remove unused variable or add underscore prefix",
    fix: (error, content) => {
      const nameMatch = /'(\w+)' is declared but/.exec(error.message);
      if (!nameMatch) return null;
      const name = nameMatch[1];

      // Add underscore prefix to indicate intentionally unused
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        // Simple pattern: just prefix with underscore
        lines[lineIndex] = lines[lineIndex].replace(
          new RegExp(`\\b${name}\\b`),
          `_${name}`
        );
        return lines.join("\n");
      }
      return null;
    },
  },

  // TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
  2345: {
    type: "fix_null_check",
    confidence: "low",
    description: "Type mismatch - may need type assertion or null check",
    fix: () => null, // Complex, needs AI assistance
  },

  // TS2322: Type 'X' is not assignable to type 'Y'
  2322: {
    type: "add_type",
    confidence: "low",
    description: "Type assignment mismatch",
    fix: () => null, // Complex, needs context
  },

  // TS7006: Parameter 'X' implicitly has an 'any' type
  7006: {
    type: "add_type",
    confidence: "medium",
    description: "Add explicit type annotation",
    fix: (error, content) => {
      const nameMatch = /Parameter '(\w+)'/.exec(error.message);
      if (!nameMatch) return null;
      const name = nameMatch[1];

      // This is complex, just suggest unknown type
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        // Simple replacement: param: unknown
        lines[lineIndex] = lines[lineIndex].replace(
          new RegExp(`\\b${name}\\b(?!:)`),
          `${name}: unknown`
        );
        return lines.join("\n");
      }
      return null;
    },
  },

  // TS1005: ';' expected
  1005: {
    type: "fix_syntax",
    confidence: "high",
    description: "Add missing semicolon",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        const line = lines[lineIndex];
        // Add semicolon at the end if missing
        if (!line.trimEnd().endsWith(";") && !line.trimEnd().endsWith("{") && !line.trimEnd().endsWith("}")) {
          lines[lineIndex] = line.trimEnd() + ";";
          return lines.join("\n");
        }
      }
      return null;
    },
  },

  // TS1128: Declaration or statement expected
  1128: {
    type: "fix_syntax",
    confidence: "low",
    description: "Syntax error - declaration or statement expected",
    fix: () => null, // Complex syntax error
  },

  // TS2307: Cannot find module 'X'
  2307: {
    type: "add_import",
    confidence: "low",
    description: "Module not found - may need to install package",
    fix: () => null, // Needs package installation
  },
};

/**
 * ESLint rule fix patterns.
 * Maps rule names to fix strategies.
 */
const LINT_FIX_PATTERNS: Record<string, {
  type: FixType;
  confidence: FixConfidence;
  description: string;
  fix: (error: LintError, fileContent: string) => string | null;
}> = {
  "semi": {
    type: "fix_lint_rule",
    confidence: "high",
    description: "Add missing semicolon",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].trimEnd() + ";";
        return lines.join("\n");
      }
      return null;
    },
  },

  "no-trailing-spaces": {
    type: "fix_format",
    confidence: "high",
    description: "Remove trailing whitespace",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].trimEnd();
        return lines.join("\n");
      }
      return null;
    },
  },

  "eol-last": {
    type: "fix_format",
    confidence: "high",
    description: "Add newline at end of file",
    fix: (_, content) => {
      if (!content.endsWith("\n")) {
        return content + "\n";
      }
      return null;
    },
  },

  "@typescript-eslint/no-unused-vars": {
    type: "remove_unused",
    confidence: "high",
    description: "Remove or prefix unused variable",
    fix: (error, content) => {
      const nameMatch = /'(\w+)'.*(?:is defined but never used|is assigned a value but never used)/.exec(error.message);
      if (!nameMatch) return null;
      const name = nameMatch[1];

      // Add underscore prefix
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].replace(
          new RegExp(`\\b${name}\\b`),
          `_${name}`
        );
        return lines.join("\n");
      }
      return null;
    },
  },

  "prefer-const": {
    type: "fix_lint_rule",
    confidence: "high",
    description: "Change let to const",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].replace(/\blet\b/, "const");
        return lines.join("\n");
      }
      return null;
    },
  },

  "no-extra-semi": {
    type: "fix_syntax",
    confidence: "high",
    description: "Remove extra semicolon",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        // Remove duplicate semicolons
        lines[lineIndex] = lines[lineIndex].replace(/;;+/g, ";");
        return lines.join("\n");
      }
      return null;
    },
  },

  "quotes": {
    type: "fix_format",
    confidence: "high",
    description: "Fix quote style",
    fix: (error, content) => {
      const lines = content.split("\n");
      const lineIndex = error.line - 1;
      if (lines[lineIndex]) {
        // Convert single to double quotes (most common config)
        lines[lineIndex] = lines[lineIndex].replace(/'/g, '"');
        return lines.join("\n");
      }
      return null;
    },
  },
};

// ============================================================================
// DeterministicFixer
// ============================================================================

/**
 * DeterministicFixer - Applies deterministic fixes for errors.
 *
 * Per Sprint 37 requirements:
 * - Focus on BUILD/LINT/TYPE errors
 * - TEST is experimental (AI-suggested)
 * - 3-strike escalation
 */
export class DeterministicFixer {
  private strikes: Map<string, StrikeRecord> = new Map();
  private fixHistory: FixResult[] = [];

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Generate a proposed fix for an error.
   */
  proposeFix(error: ClassifiedError, fileContent: string): ProposedFix | null {
    // Get strike count for this pattern
    const patternId = this.getPatternId(error);
    const strikes = this.getStrikes(patternId);

    // Skip if already escalated (3 strikes)
    if (strikes >= MAX_STRIKES) {
      return null;
    }

    switch (error.category) {
      case "TYPE":
        return this.proposeTypeScriptFix(error as TypeScriptError, fileContent);
      case "LINT":
        return this.proposeLintFix(error as LintError, fileContent);
      case "BUILD":
        return this.proposeBuildFix(error as BuildError, fileContent);
      case "TEST":
        return this.proposeTestFix(error as TestError, fileContent);
      default:
        return null;
    }
  }

  /**
   * Apply a proposed fix.
   */
  applyFix(fix: ProposedFix, fileContent: string): FixResult {
    const startTime = Date.now();
    const patternId = this.getPatternId(fix.error);

    try {
      // Check if fix can be applied
      if (!this.canApplyFix(fix, fileContent)) {
        this.recordStrike(patternId, fix.error, fix.type, "Content mismatch");
        return {
          fix,
          status: "failed",
          duration: Date.now() - startTime,
          verified: false,
          errorMessage: "Original code not found in file",
          strikes: this.getStrikes(patternId),
        };
      }

      // Apply the fix
      const newContent = fileContent.replace(fix.originalCode, fix.fixedCode);

      // Verify the fix was applied
      if (newContent === fileContent) {
        this.recordStrike(patternId, fix.error, fix.type, "No change made");
        return {
          fix,
          status: "skipped",
          duration: Date.now() - startTime,
          verified: false,
          errorMessage: "Fix resulted in no changes",
          strikes: this.getStrikes(patternId),
        };
      }

      const result: FixResult = {
        fix,
        status: "success",
        duration: Date.now() - startTime,
        verified: false, // Needs external verification
        strikes: this.getStrikes(patternId),
      };

      this.fixHistory.push(result);
      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      this.recordStrike(patternId, fix.error, fix.type, errorMessage);

      return {
        fix,
        status: "failed",
        duration: Date.now() - startTime,
        verified: false,
        errorMessage,
        strikes: this.getStrikes(patternId),
      };
    }
  }

  /**
   * Check if pattern has been escalated (3 strikes).
   */
  isEscalated(error: ClassifiedError): boolean {
    const patternId = this.getPatternId(error);
    return this.getStrikes(patternId) >= MAX_STRIKES;
  }

  /**
   * Get strike record for an error pattern.
   */
  getStrikeRecord(error: ClassifiedError): StrikeRecord | undefined {
    const patternId = this.getPatternId(error);
    return this.strikes.get(patternId);
  }

  /**
   * Get all strike records.
   */
  getAllStrikes(): StrikeRecord[] {
    return Array.from(this.strikes.values());
  }

  /**
   * Get escalated patterns.
   */
  getEscalatedPatterns(): StrikeRecord[] {
    return this.getAllStrikes().filter((s) => s.escalated);
  }

  /**
   * Get fix history.
   */
  getFixHistory(): FixResult[] {
    return [...this.fixHistory];
  }

  /**
   * Clear fix history.
   */
  clearHistory(): void {
    this.fixHistory = [];
  }

  /**
   * Reset all strikes.
   */
  resetStrikes(): void {
    this.strikes.clear();
  }

  /**
   * Get fix success rate by category.
   */
  getSuccessRate(category?: string): number {
    const relevant = category
      ? this.fixHistory.filter((r) => r.fix.error.category === category)
      : this.fixHistory;

    if (relevant.length === 0) return 0;

    const successful = relevant.filter((r) => r.status === "success").length;
    return successful / relevant.length;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Generate pattern ID for an error.
   */
  private getPatternId(error: ClassifiedError): string {
    return `${error.category}:${error.code}`;
  }

  /**
   * Get strike count for a pattern.
   */
  private getStrikes(patternId: string): number {
    return this.strikes.get(patternId)?.strikes || 0;
  }

  /**
   * Record a strike for a pattern.
   */
  private recordStrike(
    patternId: string,
    error: ClassifiedError,
    fixType: FixType,
    errorMessage: string
  ): void {
    let record = this.strikes.get(patternId);

    if (!record) {
      record = {
        patternId,
        category: error.category,
        code: error.code,
        strikes: 0,
        lastStrike: new Date(),
        attempts: [],
        escalated: false,
      };
      this.strikes.set(patternId, record);
    }

    record.strikes++;
    record.lastStrike = new Date();
    record.attempts.push({
      timestamp: new Date(),
      fixType,
      success: false,
      error: errorMessage,
    });

    if (record.strikes >= MAX_STRIKES) {
      record.escalated = true;
    }
  }

  /**
   * Check if fix can be applied.
   */
  private canApplyFix(fix: ProposedFix, fileContent: string): boolean {
    return fileContent.includes(fix.originalCode);
  }

  /**
   * Propose fix for TypeScript error.
   */
  private proposeTypeScriptFix(
    error: TypeScriptError,
    fileContent: string
  ): ProposedFix | null {
    const pattern = TS_FIX_PATTERNS[error.tsCode];
    if (!pattern) return null;

    const fixedContent = pattern.fix(error, fileContent);
    if (!fixedContent) return null;

    // Extract the changed portion
    const lines = fileContent.split("\n");
    const originalLine = lines[error.line - 1] || "";

    const fixedLines = fixedContent.split("\n");
    const fixedLine = fixedLines[error.line - 1] || "";

    return {
      id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      error,
      type: pattern.type,
      confidence: pattern.confidence,
      description: pattern.description,
      filePath: error.filePath,
      line: error.line,
      originalCode: originalLine,
      fixedCode: fixedLine,
      isMultiLine: fixedContent !== fileContent.replace(originalLine, fixedLine),
    };
  }

  /**
   * Propose fix for ESLint error.
   */
  private proposeLintFix(
    error: LintError,
    fileContent: string
  ): ProposedFix | null {
    // Try exact rule match
    let pattern = LINT_FIX_PATTERNS[error.rule];

    // Try partial match for namespaced rules
    if (!pattern) {
      const ruleName = error.rule.split("/").pop() || "";
      pattern = LINT_FIX_PATTERNS[ruleName];
    }

    if (!pattern) return null;

    const fixedContent = pattern.fix(error, fileContent);
    if (!fixedContent) return null;

    const lines = fileContent.split("\n");
    const originalLine = lines[error.line - 1] || "";

    const fixedLines = fixedContent.split("\n");
    const fixedLine = fixedLines[error.line - 1] || "";

    return {
      id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      error,
      type: pattern.type,
      confidence: pattern.confidence,
      description: pattern.description,
      filePath: error.filePath,
      line: error.line,
      originalCode: originalLine,
      fixedCode: fixedLine,
      isMultiLine: false,
    };
  }

  /**
   * Propose fix for build error.
   */
  private proposeBuildFix(
    error: BuildError,
    _fileContent: string
  ): ProposedFix | null {
    // Build errors often require external actions (install packages, update config)
    // For now, return null to indicate manual intervention needed
    if (error.isConfigError) {
      // Config errors need manual review
      return null;
    }

    // Some simple build fixes could be added here
    return null;
  }

  /**
   * Propose fix for test error.
   * Per Sprint 37: TEST fixes are EXPERIMENTAL (30% target).
   */
  private proposeTestFix(
    error: TestError,
    _fileContent: string
  ): ProposedFix | null {
    // Test fixes are experimental and typically need AI assistance
    // For now, return null - these will be handled by future AI-assisted fixer

    if (error.isTimeout) {
      // Timeout errors might just need longer timeout - but this is risky
      return null;
    }

    // Assertion failures need deeper analysis
    return null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a deterministic fixer instance.
 */
export function createDeterministicFixer(): DeterministicFixer {
  return new DeterministicFixer();
}

/**
 * Quick fix helper.
 */
export function proposeFix(
  error: ClassifiedError,
  fileContent: string
): ProposedFix | null {
  return createDeterministicFixer().proposeFix(error, fileContent);
}

/**
 * Check if error is auto-fixable.
 */
export function isAutoFixable(error: ClassifiedError): boolean {
  switch (error.category) {
    case "TYPE": {
      const tsError = error as TypeScriptError;
      return TS_FIX_PATTERNS[tsError.tsCode] !== undefined;
    }
    case "LINT": {
      const lintError = error as LintError;
      return (
        LINT_FIX_PATTERNS[lintError.rule] !== undefined ||
        LINT_FIX_PATTERNS[lintError.rule.split("/").pop() || ""] !== undefined
      );
    }
    case "BUILD":
      return false; // Most build errors need manual intervention
    case "TEST":
      return false; // Test errors are experimental
    default:
      return false;
  }
}

/**
 * Get fix confidence for error.
 */
export function getFixConfidence(error: ClassifiedError): FixConfidence | null {
  switch (error.category) {
    case "TYPE": {
      const tsError = error as TypeScriptError;
      return TS_FIX_PATTERNS[tsError.tsCode]?.confidence || null;
    }
    case "LINT": {
      const lintError = error as LintError;
      const pattern =
        LINT_FIX_PATTERNS[lintError.rule] ||
        LINT_FIX_PATTERNS[lintError.rule.split("/").pop() || ""];
      return pattern?.confidence || null;
    }
    default:
      return null;
  }
}
