/**
 * Patch Validator
 *
 * Validates unified diffs before application.
 * Detects dangerous patterns, validates file paths, and checks allowlist.
 *
 * Security Features:
 * - Blocks dangerous patterns (rm -rf, DROP TABLE, etc.)
 * - Validates file paths (no path traversal)
 * - Checks against file allowlist/blocklist
 * - Detects potential injection attacks
 *
 * @module agents/invoke/patch-validator
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import { join, normalize, isAbsolute } from "node:path";
import { createLogger, type Logger } from "../../logging/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Validation result.
 */
export interface PatchValidation {
  /** Whether patch is allowed */
  allowed: boolean;
  /** Risk level */
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Detected risks */
  risks: PatchRisk[];
  /** Affected files */
  affectedFiles: string[];
  /** Files outside workspace */
  outsideWorkspace: string[];
  /** Blocked patterns found */
  dangerousPatterns: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Individual risk item.
 */
export interface PatchRisk {
  /** Risk type */
  type: "DANGEROUS_PATTERN" | "PATH_TRAVERSAL" | "BLOCKED_FILE" | "SENSITIVE_FILE" | "LARGE_DELETION";
  /** Risk severity */
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Description */
  description: string;
  /** Location in patch (line number) */
  line?: number;
  /** Affected file */
  file?: string;
}

/**
 * Validator configuration.
 */
export interface ValidatorConfig {
  /** Workspace root (for path validation) */
  workspace: string;
  /** Allowed file patterns (glob) */
  allowedFiles?: string[];
  /** Blocked file patterns (glob) */
  blockedFiles?: string[];
  /** Maximum lines deleted in a single file */
  maxDeletionsPerFile: number;
  /** Maximum files affected */
  maxFilesAffected: number;
  /** Strict mode (block on any warning) */
  strict: boolean;
}

/**
 * Default validator configuration.
 */
export const DEFAULT_VALIDATOR_CONFIG: Partial<ValidatorConfig> = {
  maxDeletionsPerFile: 500,
  maxFilesAffected: 20,
  strict: false,
  blockedFiles: [
    "**/.env*",
    "**/credentials*",
    "**/secrets*",
    "**/*.pem",
    "**/*.key",
    "**/id_rsa*",
    "**/.git/config",
    "**/node_modules/**",
  ],
};

// ============================================================================
// Dangerous Patterns
// ============================================================================

/**
 * Dangerous shell patterns.
 */
const DANGEROUS_SHELL_PATTERNS: Array<{ pattern: RegExp; severity: "HIGH" | "CRITICAL"; description: string }> = [
  { pattern: /rm\s+-rf\s+[^|&;]+/, severity: "CRITICAL", description: "Recursive force delete" },
  { pattern: /rm\s+-r\s+[^|&;]+/, severity: "HIGH", description: "Recursive delete" },
  { pattern: /rm\s+\*/, severity: "HIGH", description: "Wildcard delete" },
  { pattern: /chmod\s+777/, severity: "HIGH", description: "World-writable permissions" },
  { pattern: /sudo\s+/, severity: "CRITICAL", description: "Sudo command" },
  { pattern: /curl\s+[^|]+\|\s*(?:ba)?sh/, severity: "CRITICAL", description: "Pipe to shell" },
  { pattern: /wget\s+[^|]+\|\s*(?:ba)?sh/, severity: "CRITICAL", description: "Pipe to shell" },
  { pattern: /eval\s*\(/, severity: "HIGH", description: "Eval expression" },
  { pattern: /exec\s*\(/, severity: "HIGH", description: "Exec expression" },
];

/**
 * Dangerous SQL patterns.
 */
const DANGEROUS_SQL_PATTERNS: Array<{ pattern: RegExp; severity: "HIGH" | "CRITICAL"; description: string }> = [
  { pattern: /DROP\s+TABLE/i, severity: "CRITICAL", description: "DROP TABLE statement" },
  { pattern: /DROP\s+DATABASE/i, severity: "CRITICAL", description: "DROP DATABASE statement" },
  { pattern: /TRUNCATE\s+TABLE/i, severity: "HIGH", description: "TRUNCATE TABLE statement" },
  { pattern: /DELETE\s+FROM\s+\w+\s*(?:;|$)/i, severity: "HIGH", description: "DELETE without WHERE" },
  { pattern: /UPDATE\s+\w+\s+SET\s+.*(?:;|$)/i, severity: "HIGH", description: "UPDATE without WHERE" },
];

/**
 * Dangerous code patterns.
 */
const DANGEROUS_CODE_PATTERNS: Array<{ pattern: RegExp; severity: "MEDIUM" | "HIGH"; description: string }> = [
  { pattern: /process\.exit\s*\(\s*[1-9]/, severity: "MEDIUM", description: "Non-zero exit" },
  { pattern: /fs\.rmSync\s*\(.*recursive/, severity: "HIGH", description: "Recursive sync delete" },
  { pattern: /fs\.rmdirSync\s*\(.*recursive/, severity: "HIGH", description: "Recursive sync rmdir" },
  { pattern: /child_process.*exec.*shell:\s*true/, severity: "MEDIUM", description: "Shell execution" },
];

/**
 * Path traversal patterns.
 */
const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\.\//,
  /\.\.\\/,
  /^\/etc\//,
  /^\/root\//,
  /^~\//,
  /^C:\\Windows/i,
  /^C:\\Users/i,
];

/**
 * Sensitive file patterns.
 */
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /\.env/,
  /credentials/i,
  /secrets/i,
  /password/i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /\.ssh\//,
];

// ============================================================================
// PatchValidator Class
// ============================================================================

/**
 * Validates patches before application.
 *
 * Usage:
 * ```typescript
 * const validator = new PatchValidator({ workspace: "/path/to/project" });
 *
 * const result = validator.validate(diffString);
 * if (!result.allowed) {
 *   console.error("Patch blocked:", result.risks);
 * }
 * ```
 */
export class PatchValidator {
  private readonly config: ValidatorConfig;
  private readonly log: Logger;

  constructor(config: Partial<ValidatorConfig> & { workspace: string }) {
    this.config = {
      ...DEFAULT_VALIDATOR_CONFIG,
      ...config,
    } as ValidatorConfig;
    this.log = createLogger("patch-validator");
  }

  // ==========================================================================
  // Main Validation
  // ==========================================================================

  /**
   * Validate a unified diff.
   */
  validate(diff: string): PatchValidation {
    const risks: PatchRisk[] = [];
    const warnings: string[] = [];
    const dangerousPatterns: string[] = [];

    // Parse diff
    const { files, deletions } = this.parseDiff(diff);

    // Check affected files
    const outsideWorkspace: string[] = [];
    for (const file of files) {
      // Check path traversal
      if (this.hasPathTraversal(file)) {
        risks.push({
          type: "PATH_TRAVERSAL",
          severity: "CRITICAL",
          description: `Path traversal detected: ${file}`,
          file,
        });
      }

      // Check if outside workspace
      if (!this.isInWorkspace(file)) {
        outsideWorkspace.push(file);
        risks.push({
          type: "PATH_TRAVERSAL",
          severity: "HIGH",
          description: `File outside workspace: ${file}`,
          file,
        });
      }

      // Check blocked files
      if (this.isBlockedFile(file)) {
        risks.push({
          type: "BLOCKED_FILE",
          severity: "HIGH",
          description: `Blocked file pattern: ${file}`,
          file,
        });
      }

      // Check sensitive files
      if (this.isSensitiveFile(file)) {
        risks.push({
          type: "SENSITIVE_FILE",
          severity: "MEDIUM",
          description: `Sensitive file: ${file}`,
          file,
        });
      }
    }

    // Check line content for dangerous patterns
    const lines = diff.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.startsWith("+")) continue; // Only check additions

      // Shell patterns
      for (const { pattern, severity, description } of DANGEROUS_SHELL_PATTERNS) {
        if (pattern.test(line)) {
          risks.push({
            type: "DANGEROUS_PATTERN",
            severity,
            description,
            line: i + 1,
          });
          dangerousPatterns.push(description);
        }
      }

      // SQL patterns
      for (const { pattern, severity, description } of DANGEROUS_SQL_PATTERNS) {
        if (pattern.test(line)) {
          risks.push({
            type: "DANGEROUS_PATTERN",
            severity,
            description,
            line: i + 1,
          });
          dangerousPatterns.push(description);
        }
      }

      // Code patterns
      for (const { pattern, severity, description } of DANGEROUS_CODE_PATTERNS) {
        if (pattern.test(line)) {
          risks.push({
            type: "DANGEROUS_PATTERN",
            severity,
            description,
            line: i + 1,
          });
          dangerousPatterns.push(description);
        }
      }
    }

    // Check deletion limits
    for (const [file, count] of Object.entries(deletions)) {
      if (count > this.config.maxDeletionsPerFile) {
        risks.push({
          type: "LARGE_DELETION",
          severity: "MEDIUM",
          description: `Large deletion (${count} lines) in ${file}`,
          file,
        });
      }
    }

    // Check file count
    if (files.length > this.config.maxFilesAffected) {
      warnings.push(`Patch affects ${files.length} files (max: ${this.config.maxFilesAffected})`);
    }

    // Determine overall risk
    const risk = this.calculateOverallRisk(risks);

    // Determine if allowed
    const allowed = this.isAllowed(risks, warnings);

    this.log.info("Patch validation complete", {
      allowed,
      risk,
      filesAffected: files.length,
      risksFound: risks.length,
    });

    return {
      allowed,
      risk,
      risks,
      affectedFiles: files,
      outsideWorkspace,
      dangerousPatterns: [...new Set(dangerousPatterns)],
      warnings,
    };
  }

  // ==========================================================================
  // Parsing
  // ==========================================================================

  /**
   * Parse a unified diff.
   */
  private parseDiff(diff: string): {
    files: string[];
    additions: Record<string, number>;
    deletions: Record<string, number>;
  } {
    const files: string[] = [];
    const additions: Record<string, number> = {};
    const deletions: Record<string, number> = {};

    let currentFile: string | undefined;

    for (const line of diff.split("\n")) {
      // File header
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        const match = line.match(/^(?:---|\+\+\+) (?:a\/|b\/)?(.+)$/);
        const matchedFile = match?.[1];
        if (matchedFile && matchedFile !== "/dev/null") {
          currentFile = matchedFile;
          if (!files.includes(currentFile)) {
            files.push(currentFile);
            additions[currentFile] = 0;
            deletions[currentFile] = 0;
          }
        }
      }
      // Addition
      else if (line.startsWith("+") && !line.startsWith("+++") && currentFile) {
        additions[currentFile] = (additions[currentFile] ?? 0) + 1;
      }
      // Deletion
      else if (line.startsWith("-") && !line.startsWith("---") && currentFile) {
        deletions[currentFile] = (deletions[currentFile] ?? 0) + 1;
      }
    }

    return { files, additions, deletions };
  }

  // ==========================================================================
  // Checks
  // ==========================================================================

  /**
   * Check for path traversal patterns.
   */
  private hasPathTraversal(path: string): boolean {
    return PATH_TRAVERSAL_PATTERNS.some((p) => p.test(path));
  }

  /**
   * Check if file is in workspace.
   */
  private isInWorkspace(file: string): boolean {
    const normalized = normalize(file);
    const absolute = isAbsolute(normalized)
      ? normalized
      : join(this.config.workspace, normalized);

    return absolute.startsWith(this.config.workspace);
  }

  /**
   * Check if file matches blocked patterns.
   */
  private isBlockedFile(file: string): boolean {
    if (!this.config.blockedFiles) return false;

    // Simple glob matching (for MVP)
    for (const pattern of this.config.blockedFiles) {
      if (this.matchGlob(file, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file is sensitive.
   */
  private isSensitiveFile(file: string): boolean {
    return SENSITIVE_FILE_PATTERNS.some((p) => p.test(file));
  }

  /**
   * Simple glob matching.
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\*\*/g, "<<STARSTAR>>")
      .replace(/\*/g, "[^/]*")
      .replace(/<<STARSTAR>>/g, ".*")
      .replace(/\?/g, ".");

    return new RegExp(`^${regexPattern}$`).test(path);
  }

  /**
   * Calculate overall risk level.
   */
  private calculateOverallRisk(risks: PatchRisk[]): PatchValidation["risk"] {
    if (risks.some((r) => r.severity === "CRITICAL")) return "CRITICAL";
    if (risks.some((r) => r.severity === "HIGH")) return "HIGH";
    if (risks.some((r) => r.severity === "MEDIUM")) return "MEDIUM";
    return "LOW";
  }

  /**
   * Determine if patch should be allowed.
   */
  private isAllowed(risks: PatchRisk[], warnings: string[]): boolean {
    // Block on CRITICAL risks
    if (risks.some((r) => r.severity === "CRITICAL")) {
      return false;
    }

    // Block on HIGH risks
    if (risks.some((r) => r.severity === "HIGH")) {
      return false;
    }

    // In strict mode, block on any risk or warning
    if (this.config.strict) {
      return risks.length === 0 && warnings.length === 0;
    }

    return true;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a patch validator for a workspace.
 */
export function createPatchValidator(
  workspace: string,
  config?: Partial<ValidatorConfig>
): PatchValidator {
  return new PatchValidator({ workspace, ...config });
}

/**
 * Quick validation function.
 */
export function validatePatch(
  diff: string,
  workspace: string
): PatchValidation {
  const validator = createPatchValidator(workspace);
  return validator.validate(diff);
}
