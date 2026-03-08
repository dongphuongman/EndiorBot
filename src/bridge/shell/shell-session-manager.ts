/**
 * Shell Session Manager
 *
 * Per-repo tmux shell sessions in `endiorbot-shell`.
 * Uses per-invocation UUID marker protocol (ADR-024 A8).
 *
 * @module bridge/shell/shell-session-manager
 * @version 1.0.0
 * @authority ADR-024 D4/A8, Sprint 83
 */

import { randomUUID } from "node:crypto";
import { redactBridgeOutput } from "../security/output-redactor.js";
import type { TmuxClient, MarkerResult } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const SHELL_TMUX_SESSION = "endiorbot-shell";
const POLL_INTERVAL_MS = 500;
const MAX_POLL_COUNT = 60; // 30s timeout
const MAX_CAPTURE_LINES = 200;
const MAX_QUEUE_DEPTH = 3;

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract output between the echoed command and the marker line.
 */
function extractOutput(capture: string, marker: string): string {
  const lines = capture.split("\n");
  const markerIdx = lines.findIndex((line) => line.includes(marker));
  if (markerIdx === -1) return capture;

  // Find where the output starts (after the command echo)
  // Take all lines before the marker, skip the last command prompt
  const outputLines = lines.slice(0, markerIdx);

  // Remove the command echo line if present (first line is usually the command)
  if (outputLines.length > 0) {
    outputLines.shift();
  }

  return outputLines.join("\n").trim();
}

// ============================================================================
// ShellSessionManager
// ============================================================================

export class ShellSessionManager {
  private tmux: TmuxClient;
  /** repo name → tmux target */
  private sessions = new Map<string, string>();
  /** repo name → in-flight flag */
  private inFlight = new Map<string, boolean>();
  /** repo name → pending queue */
  private queues = new Map<string, Array<{ cmd: string; resolve: (r: MarkerResult) => void; reject: (e: Error) => void }>>();

  constructor(tmux: TmuxClient) {
    this.tmux = tmux;
  }

  /**
   * Get or create a tmux shell session for a repo.
   */
  async getOrCreateSession(repoName: string, repoCwd: string): Promise<string> {
    const existing = this.sessions.get(repoName);
    if (existing) return existing;

    const result = await this.tmux.createSession(
      SHELL_TMUX_SESSION,
      `cd ${repoCwd} && exec $SHELL`,
    );
    this.sessions.set(repoName, result.target);
    return result.target;
  }

  /**
   * Send a command with UUID marker protocol and wait for result.
   */
  async sendCommand(repoName: string, repoCwd: string, cmd: string): Promise<MarkerResult> {
    // Check queue depth
    if (this.inFlight.get(repoName)) {
      const queue = this.queues.get(repoName) ?? [];
      if (queue.length >= MAX_QUEUE_DEPTH) {
        return { output: "Too many pending commands. Try again later.", exitCode: -1, timedOut: false };
      }

      // Queue the command
      return new Promise<MarkerResult>((resolve, reject) => {
        queue.push({ cmd, resolve, reject });
        this.queues.set(repoName, queue);
      });
    }

    return this.executeCommand(repoName, repoCwd, cmd);
  }

  private async executeCommand(repoName: string, repoCwd: string, cmd: string): Promise<MarkerResult> {
    this.inFlight.set(repoName, true);

    try {
      const target = await this.getOrCreateSession(repoName, repoCwd);
      const marker = `__ENDIORBOT_${randomUUID().slice(0, 8)}__`;
      const fullCmd = `${cmd}; echo "${marker}:$?"`;

      await this.tmux.sendKeys(target, fullCmd);

      // Poll for marker
      for (let i = 0; i < MAX_POLL_COUNT; i++) {
        await sleep(POLL_INTERVAL_MS);
        const capture = await this.tmux.capturePane(target, MAX_CAPTURE_LINES);
        const markerLine = capture.split("\n").find((line) => line.includes(`${marker}:`));

        if (markerLine) {
          // Parse exit code from marker
          const markerPos = markerLine.indexOf(`${marker}:`);
          const exitCodeStr = markerLine.slice(markerPos + marker.length + 1).trim();
          const exitCode = parseInt(exitCodeStr, 10);
          const rawOutput = extractOutput(capture, marker);

          // Redact sensitive content before returning (MF-2)
          const redacted = redactBridgeOutput(rawOutput, "read");
          const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;

          return { output, exitCode: isNaN(exitCode) ? -1 : exitCode, timedOut: false };
        }
      }

      // Timeout — return partial capture (redact before returning)
      const partialCapture = await this.tmux.capturePane(target, MAX_CAPTURE_LINES);
      const redactedPartial = redactBridgeOutput(partialCapture, "read");
      const partialOutput = redactedPartial.blocked ? "(output blocked)" : redactedPartial.content;
      return { output: partialOutput + "\n(timed out)", exitCode: -1, timedOut: true };
    } finally {
      this.inFlight.set(repoName, false);
      this.processQueue(repoName, repoCwd);
    }
  }

  private processQueue(repoName: string, repoCwd: string): void {
    const queue = this.queues.get(repoName);
    if (!queue || queue.length === 0) return;

    const next = queue.shift()!;
    this.executeCommand(repoName, repoCwd, next.cmd).then(next.resolve, next.reject);
  }

  /**
   * Capture last N lines from a shell session.
   */
  async captureOutput(repoName: string, lines?: number): Promise<MarkerResult> {
    const target = this.sessions.get(repoName);
    if (!target) {
      return { output: "No shell session. Use /sh <cmd> to start one.", exitCode: -1, timedOut: false };
    }

    const capture = await this.tmux.capturePane(target, lines ?? 30);
    // Redact capture output (MF-2)
    const redacted = redactBridgeOutput(capture, "read");
    const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;
    return { output, exitCode: 0, timedOut: false };
  }

  /**
   * Kill a shell session for a repo.
   */
  async killSession(repoName: string): Promise<boolean> {
    const target = this.sessions.get(repoName);
    if (!target) return false;

    await this.tmux.killWindow(target);
    this.sessions.delete(repoName);
    this.inFlight.delete(repoName);
    this.queues.delete(repoName);
    return true;
  }

  /**
   * Check if a session exists for a repo.
   */
  hasSession(repoName: string): boolean {
    return this.sessions.has(repoName);
  }
}
