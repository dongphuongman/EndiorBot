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
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createLogger, type Logger } from "../../logging/index.js";
import type { AgentRole } from "../types/handoff.js";
import { validatePatch } from "./patch-validator.js";

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
  /** Model override (default: "sonnet"). Per-agent routing from model-routing-strategy.md */
  model?: string;
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

/**
 * Tools restricted in PATCH mode (BUG-013: prevent file overwrites).
 * Write tool overwrites entire files — only Edit is allowed for modifications.
 */
const PATCH_MODE_DISALLOWED_TOOLS = [
  "Write",       // BLOCKED: overwrites entire file, destroys existing code
  "NotebookEdit",
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
      disallowedTools: [
        ...PATCH_MODE_DISALLOWED_TOOLS,
        ...(request.disallowedTools ?? []),
      ],
      // In PATCH mode, we want Claude to generate a plan but not apply
      userPrompt: `${request.userPrompt}

FILE SAFETY RULES:
- Use Edit (not Write) for existing files. Write overwrites the entire file.
- Read every file before modifying it.
- Never produce output shorter than 50% of the original file — you are likely losing content.
- Preserve all existing imports, functions, and code you did not change.

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

    // CTO C1: Validate patch through PatchValidator BEFORE CEO confirmation
    const validation = validatePatch(diff, request.workspace);
    if (!validation.allowed) {
      this.log.warn("PatchValidator blocked patch", {
        risk: validation.risk,
        risks: validation.risks.length,
        patterns: validation.dangerousPatterns,
      });
      patchResponse.error = `PatchValidator blocked (${validation.risk}): ${validation.dangerousPatterns.join(", ") || validation.risks.map((r) => r.description).join(", ")}`;
      return patchResponse;
    }

    if (validation.warnings.length > 0) {
      this.log.info("PatchValidator warnings", { warnings: validation.warnings });
    }

    // Request confirmation
    this.log.info("Patch ready for confirmation", {
      files: affectedFiles.length,
      agent: request.agent,
      risk: validation.risk,
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

    // Debug: log the command being executed
    this.log.debug("Claude Code CLI command", {
      cmd: this.config.claudePath,
      args: args.map((arg) => (arg.length > 100 ? `${arg.slice(0, 100)}...` : arg)),
      cwd: request.workspace,
    });

    // Sprint 131 hang debugging: dump full argv + env stripping to /tmp so we
    // can diff against a known-working direct shell invocation. Only active
    // when ENDIORBOT_DEBUG_BRIDGE_DUMP=true to avoid writing on every call.
    if (process.env.ENDIORBOT_DEBUG_BRIDGE_DUMP === "true") {
      try {
        const dumpPath = join(tmpdir(), `endiorbot-bridge-${Date.now()}.log`);
        const dump = [
          `# Claude Code bridge invocation dump`,
          `cwd: ${request.workspace}`,
          `cmd: ${this.config.claudePath}`,
          `env.CLAUDECODE: ${process.env.CLAUDECODE ?? "<unset in parent>"} → undefined (stripped)`,
          `env.ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "<set in parent>" : "<unset in parent>"} → undefined (stripped)`,
          `argv count: ${args.length}`,
          `argv:`,
          ...args.map((a, i) => `  [${i}] (${a.length} chars) ${JSON.stringify(a).slice(0, 500)}${a.length > 500 ? "..." : ""}`),
        ].join("\n");
        writeFileSync(dumpPath, dump, "utf-8");
        this.log.info("Bridge debug dump written", { path: dumpPath });
      } catch {
        // best-effort debug, never block real invocation
      }
    }

    return new Promise((resolve) => {
      let output = "";
      let error = "";
      let timedOut = false;

      const claude = spawn(this.config.claudePath, args, {
        cwd: request.workspace,
        stdio: ["ignore", "pipe", "pipe"], // stdin=ignore (don't wait for input)
        env: {
          ...process.env,
          // Unset CLAUDECODE to allow invocation from within Claude Code session
          CLAUDECODE: undefined,
          // Force OAuth (Max $200 subscription) by stripping API key.
          // Claude CLI will use the existing OAuth session (claude.ai auth).
          // If OAuth is not logged in, run `claude login` first.
          ANTHROPIC_API_KEY: undefined,
        },
      });

      // Idle timeout: if no output for 30s, show progress hint
      // Total timeout: hard cap at `timeout` ms
      let lastOutputTime = Date.now();
      let idleWarned = false;
      const IDLE_THRESHOLD_MS = 30_000;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        claude.kill("SIGTERM");
        this.log.warn("Claude Code timed out", { timeout: timeout / 1000 });
      }, timeout);

      const idleCheckId = setInterval(() => {
        const idleMs = Date.now() - lastOutputTime;
        if (idleMs >= IDLE_THRESHOLD_MS && !idleWarned) {
          idleWarned = true;
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          process.stderr.write(`\n⏳ Claude Code working (${elapsed}s elapsed, no output yet)...\n`);
          process.stderr.write(`   Tip: complex tasks take time. Use --timeout <s> to adjust.\n`);
        }
      }, 10_000);

      // Stream stdout — always show output in real-time for responsive UX
      claude.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        lastOutputTime = Date.now();
        idleWarned = false; // reset idle warning on new output
        // Always stream to stderr (stdout reserved for structured output)
        process.stderr.write(chunk);
      });

      // Collect stderr
      claude.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        error += chunk;
        lastOutputTime = Date.now();
      });

      // Handle close
      claude.on("close", (code) => {
        clearTimeout(timeoutId);
        clearInterval(idleCheckId);
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
          // Use stderr if available, otherwise stdout, otherwise generic message
          response.error = error.trim() || output.trim() || `Exited with code ${code}`;
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

        // Log error details if failed
        if (!response.success) {
          this.log.error("Claude Code error", {
            exitCode: code,
            stdout: output.trim() || "(empty)",
            stderr: error.trim() || "(empty)",
            error: response.error,
          });
        }

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
   * Note: Workspace is set via spawn's cwd option, not --cwd argument.
   */
  private buildArgs(request: InvokeRequest, interactive = false): string[] {
    const args: string[] = [];

    // Print mode (non-interactive)
    if (!interactive) {
      args.push("-p");
      args.push("--output-format", "text");
      args.push("--no-session-persistence");
      // Sprint 136 B5 (2026-04-18): non-interactive mode MUST bypass permission
      // prompts or Claude CLI hangs forever on Write/Edit approval dialogs
      // (bridge spawns with stdio: ["ignore", ...] — no stdin to answer Y/N).
      //
      // Safety is preserved by `--disallowed-tools` below: in READ mode the
      // bridge denylists Write/Edit/NotebookEdit, so bypassPermissions only
      // affects the ASK flow — blocked tools still fail closed at the CLI.
      // In PATCH mode, the bridge only invokes AFTER CEO pre-approves via
      // requestPatchConfirmation(), so bypassing at the CLI layer is safe.
      //
      // Diagnosis: CEO terminal test (2026-04-18 17:54) showed Claude CLI
      // emit "Waiting for permission to write. Here are the 5 smoke tests..."
      // — the CLI blocks on interactive approval. EndiorBot's non-interactive
      // spawn has no way to answer, producing 60s timeouts and zero output.
      args.push("--permission-mode", "bypassPermissions");
    }

    // Model selection — per-agent routing (model-routing-strategy.md)
    // Default to sonnet for cost efficiency (CLAUDE.md invariant #4)
    args.push("--model", request.model ?? "sonnet");

    // Note: --max-budget-usd only works with API key, not OAuth subscription
    // When using OAuth (Max 200), quota is managed by Anthropic, not USD budget

    // Tool restrictions via --disallowed-tools (Claude Code supports this)
    if (request.disallowedTools && request.disallowedTools.length > 0) {
      args.push("--disallowed-tools", request.disallowedTools.join(","));
    }

    // System prompt via --append-system-prompt
    if (request.systemPrompt && request.systemPrompt.trim()) {
      args.push("--append-system-prompt", request.systemPrompt);
    }

    // User prompt as positional argument (must be last)
    args.push(request.userPrompt);

    return args;
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
   *
   * Strategy 1: `git apply` (preferred — works with git repos)
   * Strategy 2: Manual file operations (fallback for non-git or apply failures)
   */
  private async applyPatch(diff: string, workspace: string): Promise<void> {
    this.log.info("Applying patch", {
      workspace,
      diffLength: diff.length,
    });

    // Strategy 1: git apply
    const tmpDiffFile = join(tmpdir(), `endiorbot-patch-${Date.now()}.diff`);
    try {
      await writeFile(tmpDiffFile, diff, "utf-8");

      const checkResult = await this.execGitCommand(
        `git apply --check "${tmpDiffFile}"`,
        workspace,
      );

      if (checkResult.exitCode === 0) {
        const applyResult = await this.execGitCommand(
          `git apply "${tmpDiffFile}"`,
          workspace,
        );
        if (applyResult.exitCode === 0) {
          this.log.info("Patch applied via git apply");
          return;
        }
        this.log.warn("git apply failed, falling back to manual", {
          error: applyResult.stderr,
        });
      } else {
        this.log.warn("git apply --check failed, falling back to manual", {
          error: checkResult.stderr,
        });
      }
    } catch {
      this.log.warn("git apply unavailable, falling back to manual");
    } finally {
      await unlink(tmpDiffFile).catch(() => {});
    }

    // Strategy 2: Manual file operations
    // CRITICAL FIX (Sprint 135 T7): For modify operations, the old code replaced
    // the entire file with just the diff hunk content (+ and context lines),
    // discarding all original content outside the hunks. This caused file corruption.
    // Fix: only create NEW files via parseDiffToFileOperations. For modify/delete,
    // skip — those require git apply which already failed. Log a warning instead.
    const fileOps = this.parseDiffToFileOperations(diff);
    let appliedCount = 0;
    const skippedFiles: string[] = [];

    for (const op of fileOps) {
      const fullPath = join(workspace, op.filePath);

      if (op.type === "create") {
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, op.newContent, "utf-8");
        this.log.info("Created file", { file: op.filePath });
        appliedCount++;
      } else if (op.type === "modify") {
        // DON'T overwrite existing files with partial diff content — that corrupts them.
        this.log.warn("Skipped modify (git apply failed) — apply manually", {
          file: op.filePath,
        });
        skippedFiles.push(op.filePath);
      } else if (op.type === "delete") {
        await unlink(fullPath).catch(() => {});
        this.log.info("Deleted file", { file: op.filePath });
        appliedCount++;
      }
    }

    // CPO fix: if no ops were applied but some were skipped, throw so applied=false
    if (appliedCount === 0 && skippedFiles.length > 0) {
      throw new Error(
        `Patch partially failed: ${skippedFiles.length} file(s) need manual apply: ${skippedFiles.join(", ")}`
      );
    }
    if (skippedFiles.length > 0) {
      this.log.warn("Patch partially applied", {
        applied: appliedCount,
        skipped: skippedFiles.length,
        skippedFiles,
      });
    }
  }

  /**
   * Execute a git command and return result.
   */
  private execGitCommand(
    command: string,
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn("sh", ["-c", command], { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

      child.on("close", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      child.on("error", () => {
        resolve({ exitCode: 1, stdout, stderr: "spawn error" });
      });
    });
  }

  /**
   * Parse a unified diff into file operations.
   */
  private parseDiffToFileOperations(
    diff: string,
  ): Array<{ type: "create" | "modify" | "delete"; filePath: string; newContent: string }> {
    const ops: Array<{ type: "create" | "modify" | "delete"; filePath: string; newContent: string }> = [];
    const fileSections = diff.split(/^diff --git /m).filter(Boolean);

    for (const section of fileSections) {
      const lines = section.split("\n");

      // Extract file path from +++ line
      const plusLine = lines.find((l) => l.startsWith("+++ "));
      if (!plusLine) continue;

      const fileMatch = plusLine.match(/^\+\+\+ (?:b\/)?(.+)$/);
      if (!fileMatch?.[1]) continue;
      const filePath = fileMatch[1];

      // Check if it's a deletion (new file is /dev/null)
      if (filePath === "/dev/null") {
        const minusLine = lines.find((l) => l.startsWith("--- "));
        const delMatch = minusLine?.match(/^--- (?:a\/)?(.+)$/);
        if (delMatch?.[1]) {
          ops.push({ type: "delete", filePath: delMatch[1], newContent: "" });
        }
        continue;
      }

      // Check if it's a new file
      const minusLine = lines.find((l) => l.startsWith("--- "));
      const isNew = minusLine?.includes("/dev/null");

      // Build new content from + lines (additions)
      const contentLines: string[] = [];
      let inHunk = false;
      for (const line of lines) {
        if (line.startsWith("@@")) {
          inHunk = true;
          continue;
        }
        if (!inHunk) continue;

        if (line.startsWith("+")) {
          contentLines.push(line.slice(1));
        } else if (line.startsWith(" ")) {
          contentLines.push(line.slice(1));
        }
        // Skip - lines (deletions from old file)
      }

      ops.push({
        type: isNew ? "create" : "modify",
        filePath,
        newContent: contentLines.join("\n"),
      });
    }

    return ops;
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
        stdio: ["pipe", "pipe", "pipe"],
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
