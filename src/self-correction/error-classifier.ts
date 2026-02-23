/**
 * Error Classifier for Self-Correction Engine
 *
 * Parses and classifies errors from BUILD/LINT/TYPE/TEST output.
 *
 * Per Sprint 37 Day 1 requirements:
 * - Parse error output from multiple tools
 * - Classify into 4 categories: BUILD, LINT, TYPE, TEST
 * - Extract structured error information
 * - Support TypeScript, ESLint, Vitest output formats
 *
 * @module src/self-correction/error-classifier
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 * @authority ADR-007 Budget Control, Phase 3
 */

import type {
  ErrorCategory,
  ErrorSeverity,
  BuildError,
  LintError,
  TypeScriptError,
  TestError,
  ClassifiedError,
} from "./types.js";

// ============================================================================
// Parser Patterns
// ============================================================================

/**
 * TypeScript error pattern.
 * Format: path/to/file.ts(line,col): error TS1234: message
 * Or: path/to/file.ts:line:col - error TS1234: message
 */
const TS_ERROR_PATTERN =
  /^(.+?)(?:\((\d+),(\d+)\)|:(\d+):(\d+))\s*[-:]\s*(error|warning)\s+TS(\d+):\s*(.+)$/;

/**
 * ESLint error pattern.
 * Format: path/to/file.ts:line:col: message [rule-name]
 * Or: path/to/file.ts
 *       line:col  error/warning  message  rule-name
 */
const ESLINT_ERROR_PATTERN =
  /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s+(\S+)$/;

/**
 * ESLint compact format pattern.
 * Format:   line:col  error  message  rule-name
 */
const ESLINT_COMPACT_PATTERN =
  /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)$/;

/**
 * Vitest/Jest test error pattern.
 * Various formats depending on assertion type.
 */
const TEST_FAIL_PATTERN = /^(FAIL|✗|×)\s+(.+?)$/;
const TEST_ERROR_PATTERN = /AssertionError:\s*(.+)/;
const TEST_EXPECT_PATTERN = /Expected:?\s*(.+?)\s*(?:Received|to equal|to be):?\s*(.+)/;
const TEST_TIMEOUT_PATTERN = /Timeout\s*[-–]\s*Async/i;

/**
 * Build error patterns for various tools.
 */
const BUILD_ERROR_PATTERNS = {
  esbuild: /^✘ \[ERROR\] (.+)$/,
  vite: /^\[vite\].*error.*:\s*(.+)$/i,
  webpack: /^ERROR in (.+)$/,
  generic: /^(?:error|Error|ERROR)[:]\s*(.+)$/,
};

// ============================================================================
// Error Classifier
// ============================================================================

/**
 * ErrorClassifier - Parses and classifies errors from tool output.
 *
 * Supports:
 * - TypeScript compiler (tsc)
 * - ESLint
 * - Vitest/Jest
 * - Build tools (esbuild, vite, webpack)
 */
export class ErrorClassifier {
  private currentFile: string | null = null;

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Parse error output and classify all errors.
   */
  parseOutput(output: string, category?: ErrorCategory): ClassifiedError[] {
    const lines = output.split("\n");
    const errors: ClassifiedError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      // Try each parser in order of specificity
      let parsed: ClassifiedError | null = null;

      if (!category || category === "TYPE") {
        parsed = this.parseTypeScriptError(line);
      }

      if (!parsed && (!category || category === "LINT")) {
        parsed = this.parseLintError(line, lines, i);
      }

      if (!parsed && (!category || category === "TEST")) {
        parsed = this.parseTestError(line, lines, i);
      }

      if (!parsed && (!category || category === "BUILD")) {
        parsed = this.parseBuildError(line);
      }

      if (parsed) {
        errors.push(parsed);
      }
    }

    return this.deduplicateErrors(errors);
  }

  /**
   * Parse TypeScript compiler output specifically.
   */
  parseTypeScriptOutput(output: string): TypeScriptError[] {
    return this.parseOutput(output, "TYPE").filter(
      (e): e is TypeScriptError => e.category === "TYPE"
    );
  }

  /**
   * Parse ESLint output specifically.
   */
  parseLintOutput(output: string): LintError[] {
    return this.parseOutput(output, "LINT").filter(
      (e): e is LintError => e.category === "LINT"
    );
  }

  /**
   * Parse test output specifically.
   */
  parseTestOutput(output: string): TestError[] {
    return this.parseOutput(output, "TEST").filter(
      (e): e is TestError => e.category === "TEST"
    );
  }

  /**
   * Parse build output specifically.
   */
  parseBuildOutput(output: string): BuildError[] {
    return this.parseOutput(output, "BUILD").filter(
      (e): e is BuildError => e.category === "BUILD"
    );
  }

  /**
   * Classify a single error line.
   */
  classifySingleError(line: string): ClassifiedError | null {
    return (
      this.parseTypeScriptError(line) ||
      this.parseLintError(line, [line], 0) ||
      this.parseTestError(line, [line], 0) ||
      this.parseBuildError(line)
    );
  }

  /**
   * Get error category from error code.
   */
  getCategoryFromCode(code: string): ErrorCategory {
    // TypeScript errors start with TS
    if (/^TS\d+$/.test(code)) {
      return "TYPE";
    }
    // ESLint rules contain slashes or hyphens
    if (code.includes("/") || code.includes("-")) {
      return "LINT";
    }
    // Test errors
    if (code.startsWith("TEST_") || code === "ASSERTION") {
      return "TEST";
    }
    // Default to BUILD
    return "BUILD";
  }

  /**
   * Extract error code from message.
   */
  extractErrorCode(message: string): string | null {
    // TS error code
    const tsMatch = /TS(\d+)/.exec(message);
    if (tsMatch) {
      return `TS${tsMatch[1]}`;
    }
    // ESLint rule
    const eslintMatch = /\[([a-z-]+(?:\/[a-z-]+)?)\]/i.exec(message);
    if (eslintMatch && eslintMatch[1]) {
      return eslintMatch[1];
    }
    return null;
  }

  // ==========================================================================
  // Private Parsers
  // ==========================================================================

  /**
   * Parse TypeScript error line.
   */
  private parseTypeScriptError(line: string): TypeScriptError | null {
    const match = TS_ERROR_PATTERN.exec(line);
    if (!match) return null;

    const [, filePath, line1, col1, line2, col2, severityStr, codeStr, message] = match;
    const lineNum = parseInt(line1 || line2 || "0", 10);
    const colNum = parseInt(col1 || col2 || "0", 10);
    const tsCode = parseInt(codeStr || "0", 10);
    const severity = (severityStr?.toLowerCase() || "error") as ErrorSeverity;

    return {
      category: "TYPE",
      code: `TS${tsCode}`,
      message: message?.trim() || "",
      severity,
      filePath: filePath || "",
      line: lineNum,
      column: colNum,
      raw: line,
      tsCode,
    };
  }

  /**
   * Parse ESLint error line.
   */
  private parseLintError(
    line: string,
    allLines: string[],
    index: number
  ): LintError | null {
    // Try standard format
    const match = ESLINT_ERROR_PATTERN.exec(line);
    if (match) {
      const [, filePath, lineNum, colNum, severityStr, message, rule] = match;
      return {
        category: "LINT",
        code: rule || "unknown",
        message: message?.trim() || "",
        severity: (severityStr?.toLowerCase() || "error") as ErrorSeverity,
        filePath: filePath || "",
        line: parseInt(lineNum || "0", 10),
        column: parseInt(colNum || "0", 10),
        raw: line,
        rule: rule || "unknown",
        fixable: this.isLintRuleFixable(rule || ""),
      };
    }

    // Try compact format (needs file from previous line)
    const compactMatch = ESLINT_COMPACT_PATTERN.exec(line);
    if (compactMatch) {
      // Look for file path in previous lines
      let filePath = this.currentFile || "unknown";
      for (let i = index - 1; i >= 0 && i >= index - 5; i--) {
        const prevLine = allLines[i]?.trim();
        if (prevLine && !prevLine.startsWith(" ") && prevLine.includes("/")) {
          filePath = prevLine;
          this.currentFile = filePath;
          break;
        }
      }

      const [, lineNum, colNum, severityStr, message, rule] = compactMatch;
      return {
        category: "LINT",
        code: rule || "unknown",
        message: message?.trim() || "",
        severity: (severityStr?.toLowerCase() || "error") as ErrorSeverity,
        filePath,
        line: parseInt(lineNum || "0", 10),
        column: parseInt(colNum || "0", 10),
        raw: line,
        rule: rule || "unknown",
        fixable: this.isLintRuleFixable(rule || ""),
      };
    }

    // Check if this is a file path line (for compact format)
    if (!line.startsWith(" ") && line.includes("/") && line.endsWith(".ts")) {
      this.currentFile = line;
    }

    return null;
  }

  /**
   * Parse test error line.
   */
  private parseTestError(
    line: string,
    allLines: string[],
    index: number
  ): TestError | null {
    // Check for FAIL indicator
    const failMatch = TEST_FAIL_PATTERN.exec(line);
    if (failMatch) {
      const testFile = failMatch[2]?.trim() || "unknown";

      // Look for more details in following lines
      let testName = "";
      let message = "";
      let expected: unknown;
      let actual: unknown;
      let isTimeout = false;

      for (let i = index + 1; i < allLines.length && i < index + 20; i++) {
        const nextLine = allLines[i] || "";

        // Check for test name
        if (nextLine.includes("✗") || nextLine.includes("×") || nextLine.includes("FAIL")) {
          const nameMatch = /[✗×]\s+(.+)/.exec(nextLine);
          if (nameMatch) {
            testName = nameMatch[1]?.trim() || "";
          }
        }

        // Check for assertion error
        const assertMatch = TEST_ERROR_PATTERN.exec(nextLine);
        if (assertMatch) {
          message = assertMatch[1]?.trim() || "";
        }

        // Check for expected/actual
        const expectMatch = TEST_EXPECT_PATTERN.exec(nextLine);
        if (expectMatch) {
          expected = expectMatch[1]?.trim();
          actual = expectMatch[2]?.trim();
        }

        // Check for timeout
        if (TEST_TIMEOUT_PATTERN.test(nextLine)) {
          isTimeout = true;
          message = "Test timeout";
        }
      }

      // Extract file info
      const fileMatch = /([^/]+\.test\.[tj]sx?):?(\d+)?/.exec(testFile);
      const filePath = fileMatch ? testFile : "unknown";
      const lineNum = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : 1;

      return {
        category: "TEST",
        code: isTimeout ? "TEST_TIMEOUT" : "ASSERTION",
        message: message || `Test failed: ${testName}`,
        severity: "error",
        filePath,
        line: lineNum,
        raw: line,
        testFile: filePath,
        testName: testName || "unknown",
        expected,
        actual,
        isTimeout,
      };
    }

    // Check for assertion error directly
    const assertMatch = TEST_ERROR_PATTERN.exec(line);
    if (assertMatch) {
      return {
        category: "TEST",
        code: "ASSERTION",
        message: assertMatch[1]?.trim() || "Assertion failed",
        severity: "error",
        filePath: "unknown",
        line: 1,
        raw: line,
        testFile: "unknown",
        testName: "unknown",
        isTimeout: false,
      };
    }

    return null;
  }

  /**
   * Parse build error line.
   */
  private parseBuildError(line: string): BuildError | null {
    // Try each build tool pattern
    for (const [tool, pattern] of Object.entries(BUILD_ERROR_PATTERNS)) {
      const match = pattern.exec(line);
      if (match) {
        const message = match[1]?.trim() || "";

        // Try to extract file info from message
        const fileMatch = /([^\s:]+\.[tj]sx?):?(\d+)?:?(\d+)?/.exec(message);
        const filePath = fileMatch?.[1] || "unknown";
        const lineNum = fileMatch?.[2] ? parseInt(fileMatch[2], 10) : 1;
        const colNum = fileMatch?.[3] ? parseInt(fileMatch[3], 10) : 1;

        return {
          category: "BUILD",
          code: `BUILD_${tool.toUpperCase()}`,
          message,
          severity: "error",
          filePath,
          line: lineNum,
          column: colNum,
          raw: line,
          tool: tool as BuildError["tool"],
          isConfigError: this.isBuildConfigError(message),
        };
      }
    }

    return null;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check if ESLint rule is auto-fixable.
   */
  private isLintRuleFixable(rule: string): boolean {
    // Common auto-fixable rules
    const fixableRules = [
      "semi",
      "quotes",
      "indent",
      "comma-dangle",
      "no-trailing-spaces",
      "eol-last",
      "no-multiple-empty-lines",
      "object-curly-spacing",
      "array-bracket-spacing",
      "space-before-blocks",
      "keyword-spacing",
      "space-infix-ops",
      "comma-spacing",
      "arrow-spacing",
      "prefer-const",
      "@typescript-eslint/semi",
      "@typescript-eslint/quotes",
      "@typescript-eslint/comma-dangle",
      "@typescript-eslint/indent",
      "prettier/prettier",
    ];
    return fixableRules.some((r) => rule.includes(r));
  }

  /**
   * Check if build error is a config error.
   */
  private isBuildConfigError(message: string): boolean {
    const configPatterns = [
      /tsconfig/i,
      /config/i,
      /\.json/,
      /module.*not found/i,
      /cannot find module/i,
      /unable to resolve/i,
    ];
    return configPatterns.some((p) => p.test(message));
  }

  /**
   * Deduplicate errors by file+line+code.
   */
  private deduplicateErrors(errors: ClassifiedError[]): ClassifiedError[] {
    const seen = new Set<string>();
    return errors.filter((error) => {
      const key = `${error.filePath}:${error.line}:${error.code}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an error classifier instance.
 */
export function createErrorClassifier(): ErrorClassifier {
  return new ErrorClassifier();
}

/**
 * Quick parse helper.
 */
export function parseErrors(output: string): ClassifiedError[] {
  return createErrorClassifier().parseOutput(output);
}

/**
 * Quick classify helper.
 */
export function classifyError(errorLine: string): ClassifiedError | null {
  return createErrorClassifier().classifySingleError(errorLine);
}

/**
 * Check if error category is deterministic-fixable.
 * Per Sprint 37: TEST is experimental (30% target).
 */
export function isDeterministicCategory(category: ErrorCategory): boolean {
  return category !== "TEST";
}

/**
 * Get target auto-fix rate for category.
 */
export function getTargetFixRate(category: ErrorCategory): number {
  const targets: Record<ErrorCategory, number> = {
    BUILD: 0.8,
    LINT: 0.9,
    TYPE: 0.7,
    TEST: 0.3,
  };
  return targets[category];
}
