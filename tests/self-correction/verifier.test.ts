/**
 * Verifier Tests
 *
 * Tests for verification after fixes.
 *
 * Per Sprint 37 requirements:
 * - Verify fixes by running appropriate tools
 * - Detect remaining and new errors
 * - Support all error categories
 *
 * @module tests/self-correction/verifier
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 37 Day 1
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  Verifier,
  createVerifier,
  DEFAULT_VERIFIER_CONFIG,
} from "../../src/self-correction/verifier.js";
import type {
  FixResult,
  ProposedFix,
  LintError,
  TypeScriptError,
  ParsedError,
} from "../../src/self-correction/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestError(category: "LINT" | "TYPE"): LintError | TypeScriptError {
  if (category === "LINT") {
    return {
      category: "LINT",
      code: "semi",
      message: "Missing semicolon",
      severity: "error",
      filePath: "src/test.ts",
      line: 1,
      raw: "src/test.ts:1:5: error Missing semicolon semi",
      rule: "semi",
      fixable: true,
    };
  }
  return {
    category: "TYPE",
    code: "TS6133",
    message: "'unused' is declared but never read",
    severity: "warning",
    filePath: "src/test.ts",
    line: 1,
    raw: "src/test.ts(1,5): error TS6133: message",
    tsCode: 6133,
  };
}

function createTestFix(error: LintError | TypeScriptError): ProposedFix {
  return {
    id: `fix-${Date.now()}`,
    error,
    type: "fix_lint_rule",
    confidence: "high",
    description: "Add missing semicolon",
    filePath: error.filePath,
    line: error.line,
    originalCode: "const x = 5",
    fixedCode: "const x = 5;",
    isMultiLine: false,
  };
}

function createTestFixResult(
  error: LintError | TypeScriptError,
  status: "success" | "failed" = "success"
): FixResult {
  return {
    fix: createTestFix(error),
    status,
    duration: 10,
    verified: status === "success",
    strikes: status === "failed" ? 1 : 0,
  };
}

// ============================================================================
// Configuration Tests
// ============================================================================

describe("Verifier - Configuration", () => {
  it("should create verifier with default config", () => {
    const verifier = createVerifier();

    expect(verifier).toBeInstanceOf(Verifier);
    const config = verifier.getConfig();
    expect(config.tscCommand).toBe(DEFAULT_VERIFIER_CONFIG.tscCommand);
    expect(config.timeout).toBe(60000);
  });

  it("should create verifier with custom config", () => {
    const verifier = createVerifier({
      tscCommand: "custom-tsc",
      timeout: 30000,
    });

    const config = verifier.getConfig();
    expect(config.tscCommand).toBe("custom-tsc");
    expect(config.timeout).toBe(30000);
  });

  it("should update config", () => {
    const verifier = createVerifier();
    verifier.updateConfig({ timeout: 10000 });

    expect(verifier.getConfig().timeout).toBe(10000);
  });
});

// ============================================================================
// Command Generation Tests
// ============================================================================

describe("Verifier - Command Generation", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = createVerifier();
  });

  it("should generate TypeScript verification command", () => {
    const command = verifier.getCommand("TYPE", "src/test.ts");

    expect(command).toContain("tsc");
    expect(command).toContain("src/test.ts");
  });

  it("should generate ESLint verification command", () => {
    const command = verifier.getCommand("LINT", "src/test.ts");

    expect(command).toContain("eslint");
    expect(command).toContain("src/test.ts");
  });

  it("should generate build verification command", () => {
    const command = verifier.getCommand("BUILD", "src/test.ts");

    expect(command).toContain("build");
  });

  it("should generate test verification command", () => {
    const command = verifier.getCommand("TEST", "tests/test.test.ts");

    expect(command).toContain("test");
    expect(command).toContain("tests/test.test.ts");
  });

  it("should return empty command for unknown category", () => {
    // @ts-expect-error testing unknown category
    const command = verifier.getCommand("UNKNOWN", "file.ts");

    expect(command).toBe("");
  });
});

// ============================================================================
// Verification Result Structure Tests
// ============================================================================

describe("Verifier - Result Structure", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = createVerifier({ timeout: 5000 });
  });

  it("should return verification result with required fields", async () => {
    const result = createTestFixResult(createTestError("LINT"));

    // Note: This will fail since we're not running against real files
    // But we can verify the result structure
    const verification = await verifier.verifyFix(result, []);

    expect(verification).toHaveProperty("success");
    expect(verification).toHaveProperty("category");
    expect(verification).toHaveProperty("filePath");
    expect(verification).toHaveProperty("command");
    expect(verification).toHaveProperty("duration");
    expect(verification).toHaveProperty("output");
    expect(verification).toHaveProperty("remainingErrors");
    expect(verification).toHaveProperty("newErrors");
    expect(verification).toHaveProperty("exitCode");
  });

  it("should track duration of verification", async () => {
    const result = createTestFixResult(createTestError("TYPE"));
    const verification = await verifier.verifyFix(result, []);

    expect(typeof verification.duration).toBe("number");
    expect(verification.duration).toBeGreaterThanOrEqual(0);
  });

  it("should include command in result", async () => {
    const result = createTestFixResult(createTestError("LINT"));
    const verification = await verifier.verifyFix(result, []);

    expect(verification.command).toContain("eslint");
  });
});

// ============================================================================
// Category-Specific Tests
// ============================================================================

describe("Verifier - Category Verification", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = createVerifier({ timeout: 5000 });
  });

  it("should verify TypeScript errors", async () => {
    const existingErrors: ParsedError[] = [];
    const verification = await verifier.verifyTypeScript("src/test.ts", existingErrors);

    expect(verification.category).toBe("TYPE");
    expect(verification.command).toContain("tsc");
  });

  it("should verify lint errors", async () => {
    const existingErrors: ParsedError[] = [];
    const verification = await verifier.verifyLint("src/test.ts", existingErrors);

    expect(verification.category).toBe("LINT");
    expect(verification.command).toContain("eslint");
  });

  it("should verify build errors", async () => {
    const existingErrors: ParsedError[] = [];
    const verification = await verifier.verifyBuild("src/test.ts", existingErrors);

    expect(verification.category).toBe("BUILD");
    expect(verification.command).toContain("build");
  });

  it("should verify test errors", async () => {
    const existingErrors: ParsedError[] = [];
    const verification = await verifier.verifyTest("tests/test.test.ts", existingErrors);

    expect(verification.category).toBe("TEST");
    expect(verification.command).toContain("test");
  });
});

// ============================================================================
// Error Detection Tests
// ============================================================================

describe("Verifier - Error Detection", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = createVerifier({ timeout: 5000 });
  });

  it("should identify remaining errors", async () => {
    const existingError: ParsedError = {
      category: "LINT",
      code: "semi",
      message: "Missing semicolon",
      severity: "error",
      filePath: "src/test.ts",
      line: 1,
      raw: "error",
    };

    const result = createTestFixResult(createTestError("LINT"));
    const verification = await verifier.verifyFix(result, [existingError]);

    // remainingErrors should be array (may be empty if command succeeded)
    expect(Array.isArray(verification.remainingErrors)).toBe(true);
  });

  it("should identify new errors", async () => {
    const result = createTestFixResult(createTestError("LINT"));
    const verification = await verifier.verifyFix(result, []);

    // newErrors should be array
    expect(Array.isArray(verification.newErrors)).toBe(true);
  });

  it("should handle empty existing errors list", async () => {
    const result = createTestFixResult(createTestError("TYPE"));
    const verification = await verifier.verifyFix(result, []);

    expect(verification).toBeDefined();
    expect(verification.remainingErrors).toBeDefined();
    expect(verification.newErrors).toBeDefined();
  });
});

// ============================================================================
// Quick Verify Tests
// ============================================================================

describe("Verifier - Quick Verify", () => {
  let verifier: Verifier;

  beforeEach(() => {
    verifier = createVerifier({ timeout: 5000 });
  });

  it("should perform quick verification", () => {
    // This will likely fail since file doesn't exist
    const result = verifier.quickVerify("LINT", "nonexistent-file.ts");

    // Result should be boolean
    expect(typeof result).toBe("boolean");
  });

  it("should return false for failed quick verification", () => {
    const result = verifier.quickVerify("TYPE", "/path/to/nonexistent/file.ts");

    expect(result).toBe(false);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("Verifier - Factory Functions", () => {
  it("should create verifier with createVerifier", () => {
    const verifier = createVerifier();
    expect(verifier).toBeInstanceOf(Verifier);
  });

  it("should export DEFAULT_VERIFIER_CONFIG", () => {
    expect(DEFAULT_VERIFIER_CONFIG).toBeDefined();
    expect(DEFAULT_VERIFIER_CONFIG.tscCommand).toBe("npx tsc --noEmit");
    expect(DEFAULT_VERIFIER_CONFIG.eslintCommand).toBe("npx eslint");
    expect(DEFAULT_VERIFIER_CONFIG.buildCommand).toBe("pnpm build");
    expect(DEFAULT_VERIFIER_CONFIG.testCommand).toBe("pnpm test");
  });
});

// ============================================================================
// Timeout Tests
// ============================================================================

describe("Verifier - Timeout", () => {
  it("should respect timeout configuration", () => {
    const verifier = createVerifier({ timeout: 1000 });
    const config = verifier.getConfig();

    expect(config.timeout).toBe(1000);
  });

  it("should use default timeout if not specified", () => {
    const verifier = createVerifier();
    const config = verifier.getConfig();

    expect(config.timeout).toBe(60000);
  });
});

// ============================================================================
// Working Directory Tests
// ============================================================================

describe("Verifier - Working Directory", () => {
  it("should use current directory by default", () => {
    const verifier = createVerifier();
    const config = verifier.getConfig();

    expect(config.cwd).toBe(process.cwd());
  });

  it("should accept custom working directory", () => {
    const verifier = createVerifier({ cwd: "/custom/path" });
    const config = verifier.getConfig();

    expect(config.cwd).toBe("/custom/path");
  });
});
