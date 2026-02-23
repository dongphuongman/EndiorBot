/**
 * Verifier for Self-Correction Engine
 *
 * Runs verification after fixes are applied.
 *
 * Per Sprint 37 requirements:
 * - Run appropriate tool to verify fix worked
 * - TypeScript: Run tsc --noEmit
 * - ESLint: Run eslint --fix-dry-run
 * - Build: Run build command
 * - Test: Run specific test file
 *
 * @module src/self-correction/verifier
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 * @authority ADR-007 Budget Control, Phase 3
 */

import { execSync } from "child_process";
import type {
  ErrorCategory,
  FixResult,
  ParsedError,
} from "./types.js";
import { ErrorClassifier } from "./error-classifier.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Verification result.
 */
export interface VerificationResult {
  /** Was verification successful? */
  success: boolean;
  /** Error category being verified */
  category: ErrorCategory;
  /** File that was fixed */
  filePath: string;
  /** Command that was run */
  command: string;
  /** Time taken (ms) */
  duration: number;
  /** Output from verification command */
  output: string;
  /** Remaining errors (if any) */
  remainingErrors: ParsedError[];
  /** New errors introduced by fix (if any) */
  newErrors: ParsedError[];
  /** Exit code from command */
  exitCode: number;
}

/**
 * Verifier configuration.
 */
export interface VerifierConfig {
  /** TypeScript command */
  tscCommand: string;
  /** ESLint command */
  eslintCommand: string;
  /** Build command */
  buildCommand: string;
  /** Test command */
  testCommand: string;
  /** Working directory */
  cwd: string;
  /** Timeout in ms */
  timeout: number;
  /** Node binary path */
  nodeBin: string;
}

/**
 * Default verifier config.
 */
export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  tscCommand: "npx tsc --noEmit",
  eslintCommand: "npx eslint",
  buildCommand: "pnpm build",
  testCommand: "pnpm test",
  cwd: process.cwd(),
  timeout: 60000, // 60s
  nodeBin: "node",
};

// ============================================================================
// Verifier
// ============================================================================

/**
 * Verifier - Runs verification after fixes are applied.
 *
 * Provides:
 * - Category-specific verification commands
 * - Error parsing from output
 * - Detection of new errors
 */
export class Verifier {
  private config: VerifierConfig;
  private classifier: ErrorClassifier;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
    this.classifier = new ErrorClassifier();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Verify a fix was successful.
   */
  async verifyFix(
    result: FixResult,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    const category = result.fix.error.category;
    const filePath = result.fix.filePath;

    switch (category) {
      case "TYPE":
        return this.verifyTypeScript(filePath, existingErrors);
      case "LINT":
        return this.verifyLint(filePath, existingErrors);
      case "BUILD":
        return this.verifyBuild(filePath, existingErrors);
      case "TEST":
        return this.verifyTest(filePath, existingErrors);
      default:
        return this.createFailedResult(category, filePath, "Unknown category");
    }
  }

  /**
   * Verify TypeScript errors are fixed.
   */
  async verifyTypeScript(
    filePath: string,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    const command = `${this.config.tscCommand} ${filePath}`;
    return this.runVerification("TYPE", filePath, command, existingErrors);
  }

  /**
   * Verify lint errors are fixed.
   */
  async verifyLint(
    filePath: string,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    const command = `${this.config.eslintCommand} ${filePath}`;
    return this.runVerification("LINT", filePath, command, existingErrors);
  }

  /**
   * Verify build errors are fixed.
   */
  async verifyBuild(
    filePath: string,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    // Build typically runs on whole project
    const command = this.config.buildCommand;
    return this.runVerification("BUILD", filePath, command, existingErrors);
  }

  /**
   * Verify test errors are fixed.
   */
  async verifyTest(
    testFile: string,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    // Run specific test file
    const command = `${this.config.testCommand} ${testFile}`;
    return this.runVerification("TEST", testFile, command, existingErrors);
  }

  /**
   * Quick verification check (just checks exit code).
   */
  quickVerify(category: ErrorCategory, filePath: string): boolean {
    try {
      const command = this.getCommand(category, filePath);
      execSync(command, {
        cwd: this.config.cwd,
        stdio: "pipe",
        timeout: this.config.timeout,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get verification command for a category.
   */
  getCommand(category: ErrorCategory, filePath: string): string {
    switch (category) {
      case "TYPE":
        return `${this.config.tscCommand} ${filePath}`;
      case "LINT":
        return `${this.config.eslintCommand} ${filePath}`;
      case "BUILD":
        return this.config.buildCommand;
      case "TEST":
        return `${this.config.testCommand} ${filePath}`;
      default:
        return "";
    }
  }

  /**
   * Get configuration.
   */
  getConfig(): VerifierConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<VerifierConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Run verification command and parse output.
   */
  private async runVerification(
    category: ErrorCategory,
    filePath: string,
    command: string,
    existingErrors: ParsedError[]
  ): Promise<VerificationResult> {
    const startTime = Date.now();

    try {
      const { output, exitCode } = await this.executeCommand(command);
      const duration = Date.now() - startTime;

      // Parse remaining errors from output
      const allErrors = this.classifier.parseOutput(output, category);

      // Filter to errors in this file
      const fileErrors = allErrors.filter((e) =>
        e.filePath === filePath || e.filePath.endsWith(filePath)
      );

      // Identify remaining vs new errors
      const existingCodes = new Set(existingErrors.map((e) => `${e.filePath}:${e.line}:${e.code}`));
      const remainingErrors = fileErrors.filter((e) =>
        existingCodes.has(`${e.filePath}:${e.line}:${e.code}`)
      );
      const newErrors = fileErrors.filter(
        (e) => !existingCodes.has(`${e.filePath}:${e.line}:${e.code}`)
      );

      // Success if no errors in this file
      const success = fileErrors.length === 0 && exitCode === 0;

      return {
        success,
        category,
        filePath,
        command,
        duration,
        output,
        remainingErrors,
        newErrors,
        exitCode,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Try to parse errors from error output
      const allErrors = this.classifier.parseOutput(errorMessage, category);
      const fileErrors = allErrors.filter((e) =>
        e.filePath === filePath || e.filePath.endsWith(filePath)
      );

      const existingCodes = new Set(existingErrors.map((e) => `${e.filePath}:${e.line}:${e.code}`));
      const remainingErrors = fileErrors.filter((e) =>
        existingCodes.has(`${e.filePath}:${e.line}:${e.code}`)
      );
      const newErrors = fileErrors.filter(
        (e) => !existingCodes.has(`${e.filePath}:${e.line}:${e.code}`)
      );

      return {
        success: false,
        category,
        filePath,
        command,
        duration,
        output: errorMessage,
        remainingErrors,
        newErrors,
        exitCode: 1,
      };
    }
  }

  /**
   * Execute command and capture output.
   */
  private executeCommand(command: string): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      let output = "";
      let exitCode = 0;

      try {
        const result = execSync(command, {
          cwd: this.config.cwd,
          stdio: "pipe",
          timeout: this.config.timeout,
          encoding: "utf-8",
        });
        output = result || "";
        exitCode = 0;
      } catch (error) {
        if (error && typeof error === "object" && "stdout" in error) {
          const execError = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
          output = String(execError.stdout || "") + String(execError.stderr || "");
          exitCode = execError.status || 1;
        } else {
          output = String(error);
          exitCode = 1;
        }
      }

      resolve({ output, exitCode });
    });
  }

  /**
   * Create a failed verification result.
   */
  private createFailedResult(
    category: ErrorCategory,
    filePath: string,
    reason: string
  ): VerificationResult {
    return {
      success: false,
      category,
      filePath,
      command: "",
      duration: 0,
      output: reason,
      remainingErrors: [],
      newErrors: [],
      exitCode: 1,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a verifier instance.
 */
export function createVerifier(config?: Partial<VerifierConfig>): Verifier {
  return new Verifier(config);
}

/**
 * Quick verification helper.
 */
export async function verifyFix(
  result: FixResult,
  existingErrors: ParsedError[] = []
): Promise<VerificationResult> {
  const verifier = createVerifier();
  return verifier.verifyFix(result, existingErrors);
}

/**
 * Batch verification helper.
 */
export async function verifyFixes(
  results: FixResult[],
  existingErrors: ParsedError[] = []
): Promise<VerificationResult[]> {
  const verifier = createVerifier();
  const verifications: VerificationResult[] = [];

  for (const result of results) {
    const verification = await verifier.verifyFix(result, existingErrors);
    verifications.push(verification);
  }

  return verifications;
}
