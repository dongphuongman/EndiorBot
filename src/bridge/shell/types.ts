/**
 * Shell Session Types
 *
 * DI interfaces and types for managed shell sessions.
 *
 * @module bridge/shell/types
 * @version 1.0.0
 * @authority ADR-024 D4/A8, Sprint 83
 */

// ============================================================================
// TmuxClient Interface (DI for TmuxBridge)
// ============================================================================

export interface TmuxSessionResult {
  target: string;
  sessionName: string;
}

/**
 * DI interface for tmux operations. Wraps TmuxBridge for testability.
 */
export interface TmuxClient {
  createSession(name: string, cmd?: string): Promise<TmuxSessionResult>;
  sendKeys(target: string, text: string): Promise<void>;
  capturePane(target: string, lines?: number): Promise<string>;
  killWindow(target: string): Promise<void>;
}

// ============================================================================
// Marker Result
// ============================================================================

/**
 * Result from UUID marker-based command execution.
 */
export interface MarkerResult {
  /** Captured output (redacted) */
  output: string;
  /** Exit code from the command */
  exitCode: number;
  /** Whether the command timed out */
  timedOut: boolean;
}

// ============================================================================
// Command Queue
// ============================================================================

export interface CommandQueueEntry {
  cmd: string;
  resolve: (result: MarkerResult) => void;
  reject: (error: Error) => void;
}
