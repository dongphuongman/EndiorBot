/**
 * Copilot CLI Bridge
 *
 * ToolBridge for GitHub Copilot CLI — one-shot execFile, NOT AgentProviderType.
 * Detects runtime (copilot-cli vs gh-copilot), capability probes, ANSI strips.
 *
 * @module bridge/copilot/copilot-bridge
 * @version 1.0.0
 * @authority ADR-024 D5, Sprint 83
 */

import type { ExecRunner } from "../types.js";

// ============================================================================
// Types
// ============================================================================

export type CopilotToolKind = "copilot-cli" | "gh-copilot" | "none";

export interface CopilotDetectResult {
  kind: CopilotToolKind;
  version?: string;
  path?: string;
  notes?: string;
}

// ============================================================================
// ANSI Stripping
// ============================================================================

/**
 * Strip ANSI escape codes from terminal output.
 */
export function stripAnsi(text: string): string {
  // Covers: SGR, cursor movement, erase, OSC, and other CSI sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\)|\([A-Z])/g, "");
}

// ============================================================================
// Constants
// ============================================================================

const COPILOT_TIMEOUT = 15_000;
const MAX_OUTPUT_LENGTH = 3500;

// ============================================================================
// CopilotBridge
// ============================================================================

export class CopilotBridge {
  private exec: ExecRunner;
  private cachedDetect: CopilotDetectResult | null = null;

  constructor(exec: ExecRunner) {
    this.exec = exec;
  }

  /**
   * Detect installed Copilot CLI runtime.
   * Priority: copilot-cli > gh-copilot > none.
   */
  async detect(): Promise<CopilotDetectResult> {
    if (this.cachedDetect) return this.cachedDetect;

    // 1. Try standalone copilot binary
    try {
      const which = await this.exec.exec("command", ["-v", "copilot"], { timeout: 5000 });
      if (which.exitCode === 0 && which.stdout.trim()) {
        const path = which.stdout.trim();

        // Version check
        const ver = await this.exec.exec("copilot", ["--version"], { timeout: 5000 });
        if (ver.exitCode === 0) {
          // Capability probe
          const probe = await this.exec.exec("copilot", ["suggest", "--help"], { timeout: 5000 });
          if (probe.exitCode === 0) {
            this.cachedDetect = {
              kind: "copilot-cli",
              version: ver.stdout.trim(),
              path,
            };
            return this.cachedDetect;
          }
          this.cachedDetect = {
            kind: "none",
            path,
            notes: "copilot present but incompatible flags",
          };
          return this.cachedDetect;
        }
      }
    } catch {
      // copilot not found, try gh
    }

    // 2. Try gh copilot
    try {
      const which = await this.exec.exec("command", ["-v", "gh"], { timeout: 5000 });
      if (which.exitCode === 0) {
        const ver = await this.exec.exec("gh", ["copilot", "--version"], { timeout: 5000 });
        if (ver.exitCode === 0) {
          const verText = ver.stdout.trim();
          if (verText.toLowerCase().includes("deprecated")) {
            this.cachedDetect = {
              kind: "none",
              notes: "gh copilot deprecated",
            };
            return this.cachedDetect;
          }
          this.cachedDetect = {
            kind: "gh-copilot",
            version: verText,
            path: which.stdout.trim(),
          };
          return this.cachedDetect;
        }
      }
    } catch {
      // gh not found
    }

    this.cachedDetect = {
      kind: "none",
      notes: "Install: github/copilot-cli",
    };
    return this.cachedDetect;
  }

  /**
   * Run copilot suggest in a given working directory.
   */
  async suggest(task: string, cwd: string): Promise<{ success: boolean; output: string }> {
    const detection = await this.detect();

    if (detection.kind === "none") {
      return { success: false, output: `Copilot CLI not found. ${detection.notes ?? "Install: github/copilot-cli"}` };
    }

    try {
      let result;
      if (detection.kind === "copilot-cli") {
        result = await this.exec.exec("copilot", ["suggest", task], { cwd, timeout: COPILOT_TIMEOUT });
      } else {
        result = await this.exec.exec("gh", ["copilot", "suggest", task], { cwd, timeout: COPILOT_TIMEOUT });
      }

      const cleaned = stripAnsi(result.stdout + (result.stderr ? `\n${result.stderr}` : "")).trim();
      const capped = cleaned.length > MAX_OUTPUT_LENGTH
        ? cleaned.slice(0, MAX_OUTPUT_LENGTH) + "\n...(truncated)"
        : cleaned;

      return { success: result.exitCode === 0, output: capped || "(no output)" };
    } catch (e) {
      return { success: false, output: `Copilot error: ${(e as Error).message}` };
    }
  }

  /**
   * Run copilot explain on a command.
   */
  async explain(cmd: string, cwd: string): Promise<{ success: boolean; output: string }> {
    const detection = await this.detect();

    if (detection.kind === "none") {
      return { success: false, output: `Copilot CLI not found. ${detection.notes ?? "Install: github/copilot-cli"}` };
    }

    try {
      let result;
      if (detection.kind === "copilot-cli") {
        result = await this.exec.exec("copilot", ["explain", cmd], { cwd, timeout: COPILOT_TIMEOUT });
      } else {
        result = await this.exec.exec("gh", ["copilot", "explain", cmd], { cwd, timeout: COPILOT_TIMEOUT });
      }

      const cleaned = stripAnsi(result.stdout + (result.stderr ? `\n${result.stderr}` : "")).trim();
      const capped = cleaned.length > MAX_OUTPUT_LENGTH
        ? cleaned.slice(0, MAX_OUTPUT_LENGTH) + "\n...(truncated)"
        : cleaned;

      return { success: result.exitCode === 0, output: capped || "(no output)" };
    } catch (e) {
      return { success: false, output: `Copilot error: ${(e as Error).message}` };
    }
  }

  /**
   * Get human-readable status string.
   */
  async getStatus(): Promise<string> {
    const detection = await this.detect();
    if (detection.kind === "none") {
      return `Copilot CLI: not found\n${detection.notes ?? "Install: github/copilot-cli"}`;
    }
    const parts = [`Copilot CLI: ${detection.kind}`];
    if (detection.version) parts.push(`Version: ${detection.version}`);
    if (detection.path) parts.push(`Path: ${detection.path}`);
    return parts.join("\n");
  }

  /**
   * Clear cached detection result (for testing).
   */
  clearCache(): void {
    this.cachedDetect = null;
  }
}
