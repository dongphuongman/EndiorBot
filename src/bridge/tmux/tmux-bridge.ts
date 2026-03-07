/**
 * TmuxBridge
 *
 * Interface to tmux for managing AI agent panes.
 * All calls use execFile (not exec) to prevent shell injection.
 * sendKeys uses paste-buffer for reliability (CTO M1).
 *
 * @module bridge/tmux/tmux-bridge
 * @version 1.0.0
 * @authority ADR-024 A6
 * @stage 04 - BUILD (Sprint 82)
 */

import { execFile } from "node:child_process";

// ============================================================================
// Constants
// ============================================================================

const TMUX_TIMEOUT_MS = 5000;
const DEFAULT_SESSION_NAME = "endiorbot";
const DEFAULT_PANE_WIDTH = 200;
const DEFAULT_PANE_HEIGHT = 50;

// ============================================================================
// TmuxBridge
// ============================================================================

export interface TmuxSessionInfo {
  sessionName: string;
  windowName: string;
  paneIndex: number;
  target: string; // "sessionName:windowName.paneIndex"
}

export class TmuxBridge {
  private readonly tmuxPath: string;

  constructor(tmuxPath = "tmux") {
    this.tmuxPath = tmuxPath;
  }

  /**
   * Check if tmux is available.
   * @returns tmux version string or null if not available
   */
  async isAvailable(): Promise<string | null> {
    try {
      const { stdout } = await this.exec(["-V"]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Create a new tmux session with a pane running the given command.
   * If the session already exists, creates a new window.
   */
  async createSession(
    windowName: string,
    command: string,
    sessionName: string = DEFAULT_SESSION_NAME
  ): Promise<TmuxSessionInfo> {
    const sessionExists = await this.sessionExists(sessionName);

    if (sessionExists) {
      // Add new window to existing session
      await this.exec([
        "new-window",
        "-t", sessionName,
        "-n", windowName,
        command,
      ]);
    } else {
      // Create new session
      await this.exec([
        "new-session",
        "-d",
        "-s", sessionName,
        "-n", windowName,
        "-x", String(DEFAULT_PANE_WIDTH),
        "-y", String(DEFAULT_PANE_HEIGHT),
        command,
      ]);
    }

    // Get pane info
    const paneIndex = await this.getPaneIndex(sessionName, windowName);
    const target = `${sessionName}:${windowName}.${paneIndex}`;

    return {
      sessionName,
      windowName,
      paneIndex,
      target,
    };
  }

  /**
   * Send text to a tmux pane via paste-buffer (CTO M1).
   * More reliable than send-keys char-by-char.
   *
   * Uses: tmux load-buffer → paste-buffer
   */
  async sendKeys(target: string, text: string): Promise<void> {
    // Load text into a named buffer via stdin
    await this.exec(
      ["load-buffer", "-b", "bridge", "-"],
      { input: text }
    );

    // Paste from buffer to target pane
    await this.exec(["paste-buffer", "-b", "bridge", "-t", target]);
  }

  /**
   * Send Enter key to a tmux pane.
   */
  async sendEnter(target: string): Promise<void> {
    await this.exec(["send-keys", "-t", target, "Enter"]);
  }

  /**
   * Capture pane output (last N lines).
   */
  async capturePane(target: string, lines: number = 50): Promise<string> {
    const startLine = -Math.min(lines, 500); // max 500 lines
    const { stdout } = await this.exec([
      "capture-pane",
      "-p",
      "-t", target,
      "-S", String(startLine),
    ]);
    return stdout;
  }

  /**
   * Kill a tmux window/pane.
   */
  async killWindow(target: string): Promise<void> {
    // Extract session:window from target (strip pane index)
    const parts = target.split(".");
    const windowTarget = target.includes(".")
      ? (parts[0] ?? target)
      : target;

    try {
      await this.exec(["kill-window", "-t", windowTarget]);
    } catch {
      // Window may already be closed — not an error
    }
  }

  /**
   * List all windows in a session.
   */
  async listWindows(sessionName: string = DEFAULT_SESSION_NAME): Promise<string[]> {
    try {
      const { stdout } = await this.exec([
        "list-windows",
        "-t", sessionName,
        "-F", "#{window_name}",
      ]);
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Check if a tmux session exists.
   */
  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await this.exec(["has-session", "-t", sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async getPaneIndex(sessionName: string, windowName: string): Promise<number> {
    try {
      const { stdout } = await this.exec([
        "display-message",
        "-t", `${sessionName}:${windowName}`,
        "-p", "#{pane_index}",
      ]);
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Execute a tmux command via execFile (not exec — prevents shell injection).
   */
  private async exec(
    args: string[],
    options?: { input?: string }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.tmuxPath,
        args,
        {
          timeout: TMUX_TIMEOUT_MS,
          maxBuffer: 1024 * 1024, // 1MB
          encoding: "utf-8",
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
          }
        }
      );

      // Write input to stdin if provided (for load-buffer)
      if (options?.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalTmuxBridge: TmuxBridge | undefined;

export function getTmuxBridge(): TmuxBridge {
  if (!globalTmuxBridge) {
    globalTmuxBridge = new TmuxBridge();
  }
  return globalTmuxBridge;
}

export function resetTmuxBridge(): void {
  globalTmuxBridge = undefined;
}
