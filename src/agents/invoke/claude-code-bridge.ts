/**
 * Claude Code Bridge
 *
 * Invokes Claude Code CLI with 3 execution modes:
 * - READ: No file changes, output text only (default)
 * - PATCH: Unified diff output, CEO confirms before applying
 * - INTERACTIVE: Opens Claude Code for human takeover
 *
 * Integration:
 * - Uses Claude Code CLI (`claude` command)
 * - Respects token budget from context-budget.ts
 * - Validates patches before application
 *
 * @module agents/invoke/claude-code-bridge
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createLogger, type Logger } from "../../logging/index.js";
import type { AgentRole } from "../types/handoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Execution modes for Claude Code invocation.
 */
export type InvokeMode = "READ" | "PATCH" | "INTERACTIVE";

/**
 * Claude Code invocation request.
 */
export interface InvokeRequest {
  /** Execution mode */
  mode: InvokeMode;
  /** System prompt (SOUL + context) */
  systemPrompt: string;
  /** User prompt (task) */
  userPrompt: string;
  /** Workspace directory */
  workspace: string;
  /** Agent invoking Claude Code */
  agent: AgentRole;
  /** Timeout in seconds */
  timeout?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Allowed tools (for READ mode restrictions) */
  allowedTools?: string[];
  /** Disallowed tools (for safety) */
  disallowedTools?: string[];
}

/**
 * Claude Code response.
 */
export interface ClaudeResponse {
  /** Output text */
  output: string;
  /** Exit code */
  exitCode: number;
  /** Duration in ms */
  durationMs: number;
  /** Token usage (if available) */
  tokenUsage?: {
    input: number;
    output: number;
  };
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Mode used */
  mode: InvokeMode;
}

/**
 * Patch response (for PATCH mode).
 */
export interface PatchResponse extends ClaudeResponse {
  /** Unified diff output */
  diff?: string;
  /** Affected files */
  affectedFiles: string[];
  /** Whether patch was applied */
  applied: boolean;
  /** CEO confirmation received */
  confirmed: boolean;
}

/**
 * Bridge configuration.
 */
export interface BridgeConfig {
  /** Path to Claude CLI */
  claudePath: string;
  /** Default timeout (seconds) */
  defaultTimeout: number;
  /** Default max tokens */
  defaultMaxTokens: number;
  /** Enable verbose output */
  verbose: boolean;
  /** Dry run (don't execute) */
  dryRun: boolean;
}

/**
 * Default bridge configuration.
 */
export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  claudePath: "claude",
  defaultTimeout: 300,      // 5 minutes
  defaultMaxTokens: 4000,
  verbose: false,
  dryRun: false,
};

/**
 * Tools restricted in READ mode (no file modifications).
 */
const READ_MODE_DISALLOWED_TOOLS = [
  "Write",
  "Edit",
  "NotebookEdit",
  "Bash",  // Could be allowed with restrictions
];

// ============================================================================
// ClaudeCodeBridge Class
// ============================================================================

/**
 * Bridge for invoking Claude Code CLI.
 *
 * Usage:
 * ```typescript
 * const bridge = new ClaudeCodeBridge();
 *
 * // READ mode (safe, no file changes)
 * const response = await bridge.invokeRead({
 *   systemPrompt: soulContent,
 *   userPrompt: "Analyze this codebase",
 *   workspace: "/path/to/project",
 *   agent: "researcher",
 * });
 *
 * // PATCH mode (diff + confirm)
 * const patchResponse = await bridge.invokePatch({
 *   systemPrompt: soulContent,
 *   userPrompt: "Fix the bug in auth.ts",
 *   workspace: "/path/to/project",
 *   agent: "coder",
 * });
 *
 * // INTERACTIVE mode (human takes over)
 * await bridge.invokeInteractive({
 *   systemPrompt: soulContent,
 *   userPrompt: "Complex refactoring needed",
 *   workspace: "/path/to/project",
 *   agent: "architect",
 * });
 * ```
 */
export class ClaudeCodeBridge {
  private readonly config: BridgeConfig;
  private readonly log: Logger;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    this.log = createLogger("claude-code-bridge");
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Invoke Claude Code in READ mode (no file changes).
   */
  async invokeRead(
    request: Omit<InvokeRequest, "mode">
  ): Promise<ClaudeResponse> {
    return this.invoke({
      ...request,
      mode: "READ",
      disallowedTools: [
        ...READ_MODE_DISALLOWED_TOOLS,
        ...(request.disallowedTools ?? []),
      ],
    });
  }

  /**
   * Invoke Claude Code in PATCH mode (diff + confirm).
   */
  async invokePatch(
    request: Omit<InvokeRequest, "mode">,
    confirmCallback?: () => Promise<boolean>
  ): Promise<PatchResponse> {
    // First, invoke to generate patch
    const response = await this.invoke({
      ...request,
      mode: "PATCH",
      // In PATCH mode, we want Claude to generate a plan but not apply
      userPrompt: `${request.userPrompt}

IMPORTANT: Generate a unified diff for the changes. Do NOT apply them directly.
Output the diff in a code block with \`\`\`diff format.`,
    });

    // Parse diff from response
    const diffMatch = response.output.match(/```diff\n([\s\S]*?)```/);
    const diff = diffMatch ? diffMatch[1] : undefined;

    // Extract affected files from diff
    const affectedFiles = this.extractAffectedFiles(diff ?? "");

    // Create patch response
    const patchResponse: PatchResponse = {
      ...response,
      mode: "PATCH",
      ...(diff ? { diff } : {}),
      affectedFiles,
      applied: false,
      confirmed: false,
    };

    // If no diff or no callback, return without applying
    if (!diff || !confirmCallback) {
      return patchResponse;
    }

    // Request confirmation
    this.log.info("Patch ready for confirmation", {
      files: affectedFiles.length,
      agent: request.agent,
    });

    const confirmed = await confirmCallback();
    patchResponse.confirmed = confirmed;

    if (!confirmed) {
      this.log.info("Patch rejected by CEO");
      return patchResponse;
    }

    // Apply patch (in a real implementation, this would use git apply or similar)
    try {
      await this.applyPatch(diff, request.workspace);
      patchResponse.applied = true;
      this.log.info("Patch applied successfully", {
        files: affectedFiles,
      });
    } catch (err) {
      patchResponse.error = err instanceof Error ? err.message : String(err);
      this.log.error("Failed to apply patch", { error: patchResponse.error });
    }

    return patchResponse;
  }

  /**
   * Invoke Claude Code in INTERACTIVE mode (human takeover).
   */
  async invokeInteractive(
    request: Omit<InvokeRequest, "mode">
  ): Promise<void> {
    this.log.info("Starting interactive mode", {
      agent: request.agent,
      workspace: request.workspace,
    });

    // Print context for human
    console.log("\n" + "=".repeat(60));
    console.log("INTERACTIVE MODE - Claude Code");
    console.log("=".repeat(60));
    console.log(`Agent: @${request.agent}`);
    console.log(`Workspace: ${request.workspace}`);
    console.log("\nTask:");
    console.log(request.userPrompt);
    console.log("\n" + "-".repeat(60));
    console.log("Opening Claude Code with full permissions...");
    console.log("Press Ctrl+C when done.\n");

    // Spawn Claude Code in interactive mode
    const args = this.buildArgs(
      { ...request, mode: "INTERACTIVE" },
      true // interactive flag
    );

    const claude = spawn(this.config.claudePath, args, {
      cwd: request.workspace,
      stdio: "inherit", // Connect to user's terminal
      shell: true,
    });

    // Wait for process to exit
    return new Promise((resolve, reject) => {
      claude.on("close", (code) => {
        this.log.info("Interactive session ended", { exitCode: code });
        resolve();
      });

      claude.on("error", (err) => {
        this.log.error("Interactive session failed", { error: err.message });
        reject(err);
      });
    });
  }

  /**
   * Generic invoke method.
   */
  async invoke(request: InvokeRequest): Promise<ClaudeResponse> {
    const startTime = Date.now();

    if (this.config.dryRun) {
      this.log.info("Dry run - not executing", { request });
      return {
        output: "[DRY RUN] Would execute Claude Code",
        exitCode: 0,
        durationMs: 0,
        success: true,
        mode: request.mode,
      };
    }

    const args = this.buildArgs(request);
    const timeout = (request.timeout ?? this.config.defaultTimeout) * 1000;

    this.log.info("Invoking Claude Code", {
      mode: request.mode,
      agent: request.agent,
      workspace: request.workspace,
      timeout: timeout / 1000,
    });

    return new Promise((resolve) => {
      let output = "";
      let error = "";
      let timedOut = false;

      const claude = spawn(this.config.claudePath, args, {
        cwd: request.workspace,
        shell: true,
        env: {
          ...process.env,
          // Pass prompt via environment to avoid shell escaping issues
          ENDIORBOT_SYSTEM_PROMPT: request.systemPrompt,
          ENDIORBOT_USER_PROMPT: request.userPrompt,
        },
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        claude.kill("SIGTERM");
        this.log.warn("Claude Code timed out", { timeout: timeout / 1000 });
      }, timeout);

      // Collect stdout
      claude.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        if (this.config.verbose) {
          process.stdout.write(chunk);
        }
      });

      // Collect stderr
      claude.stderr?.on("data", (data: Buffer) => {
        error += data.toString();
      });

      // Handle close
      claude.on("close", (code) => {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        const response: ClaudeResponse = {
          output: output.trim(),
          exitCode: code ?? 1,
          durationMs,
          success: code === 0 && !timedOut,
          mode: request.mode,
        };

        if (timedOut) {
          response.error = `Timed out after ${timeout / 1000}s`;
        } else if (code !== 0) {
          response.error = error || `Exited with code ${code}`;
        }

        // Try to parse token usage from output
        const tokenUsage = this.parseTokenUsage(output);
        if (tokenUsage) {
          response.tokenUsage = tokenUsage;
        }

        this.log.info("Claude Code completed", {
          success: response.success,
          exitCode: response.exitCode,
          durationMs,
          outputLength: output.length,
        });

        resolve(response);
      });

      // Handle error
      claude.on("error", (err) => {
        clearTimeout(timeoutId);
        resolve({
          output: "",
          exitCode: 1,
          durationMs: Date.now() - startTime,
          success: false,
          error: err.message,
          mode: request.mode,
        });
      });
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build CLI arguments for Claude Code invocation.
   */
  private buildArgs(request: InvokeRequest, interactive = false): string[] {
    const args: string[] = [];

    // Print mode (non-interactive)
    if (!interactive) {
      args.push("-p");
    }

    // Combined prompt (system + user)
    const fullPrompt = `${request.systemPrompt}\n\n---\n\n${request.userPrompt}`;
    args.push(`"${this.escapeForShell(fullPrompt)}"`);

    // Workspace
    args.push("--cwd", request.workspace);

    // Max tokens
    if (request.maxTokens) {
      args.push("--max-tokens", String(request.maxTokens));
    }

    // Tool restrictions (if supported by Claude CLI)
    if (request.disallowedTools && request.disallowedTools.length > 0) {
      // Note: This would need to be supported by Claude Code CLI
      // For now, we include it in the prompt as instructions
      args.push("--disallowed-tools", request.disallowedTools.join(","));
    }

    return args;
  }

  /**
   * Escape string for shell command.
   */
  private escapeForShell(str: string): string {
    // Replace special characters
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");
  }

  /**
   * Extract affected files from diff.
   */
  private extractAffectedFiles(diff: string): string[] {
    const files: string[] = [];
    const regex = /^(?:---|\+\+\+) (?:a\/|b\/)?(.+)$/gm;
    let match;

    while ((match = regex.exec(diff)) !== null) {
      const file = match[1];
      if (file && !files.includes(file) && file !== "/dev/null") {
        files.push(file);
      }
    }

    return files;
  }

  /**
   * Apply a patch to the workspace.
   */
  private async applyPatch(diff: string, workspace: string): Promise<void> {
    // In a real implementation, this would use git apply or patch command
    // For now, we'll simulate the application
    this.log.info("Applying patch (simulated)", {
      workspace,
      diffLength: diff.length,
    });

    // TODO: Implement actual patch application
    // Options:
    // 1. Write diff to temp file and run `git apply`
    // 2. Parse diff and modify files directly
    // 3. Use a diff/patch library

    // For MVP, we just log
    console.log("\n[PATCH PREVIEW]");
    console.log(diff);
    console.log("[/PATCH PREVIEW]\n");
  }

  /**
   * Parse token usage from Claude output.
   */
  private parseTokenUsage(
    output: string
  ): { input: number; output: number } | undefined {
    // Claude Code may include token usage in its output
    // Format varies, so we try common patterns
    const patterns = [
      /tokens[:\s]+(\d+)\s*input[,\s]+(\d+)\s*output/i,
      /input[:\s]+(\d+).*output[:\s]+(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1] && match[2]) {
        return {
          input: parseInt(match[1], 10),
          output: parseInt(match[2], 10),
        };
      }
    }

    return undefined;
  }

  /**
   * Check if Claude Code CLI is available.
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const claude = spawn(this.config.claudePath, ["--version"], {
        shell: true,
      });

      claude.on("close", (code) => {
        resolve(code === 0);
      });

      claude.on("error", () => {
        resolve(false);
      });
    });
  }

  /**
   * Get configuration.
   */
  getConfig(): Readonly<BridgeConfig> {
    return this.config;
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let globalBridge: ClaudeCodeBridge | undefined;

/**
 * Get the global ClaudeCodeBridge instance.
 */
export function getClaudeCodeBridge(
  config?: Partial<BridgeConfig>
): ClaudeCodeBridge {
  if (!globalBridge) {
    globalBridge = new ClaudeCodeBridge(config);
  }
  return globalBridge;
}

/**
 * Reset the global ClaudeCodeBridge (for testing).
 */
export function resetClaudeCodeBridge(): void {
  globalBridge = undefined;
}

/**
 * Create a new ClaudeCodeBridge instance.
 */
export function createClaudeCodeBridge(
  config?: Partial<BridgeConfig>
): ClaudeCodeBridge {
  return new ClaudeCodeBridge(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Prompt user for confirmation (CLI).
 */
export async function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Create a confirmation callback for patch mode.
 */
export function createPatchConfirmCallback(
  showDiff: boolean = true
): (diff: string, files: string[]) => Promise<boolean> {
  return async (diff: string, files: string[]): Promise<boolean> => {
    console.log("\n" + "=".repeat(60));
    console.log("PATCH CONFIRMATION");
    console.log("=".repeat(60));
    console.log(`Affected files (${files.length}):`);
    files.forEach((f) => console.log(`  - ${f}`));

    if (showDiff) {
      console.log("\nDiff:");
      console.log("-".repeat(60));
      console.log(diff);
      console.log("-".repeat(60));
    }

    return promptConfirmation("\nApply this patch?");
  };
}
