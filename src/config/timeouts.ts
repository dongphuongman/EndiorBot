/**
 * Timeout Configuration — Single Source of Truth
 *
 * All timeout values are read from environment variables with sensible fallbacks.
 * Override any value at runtime without redeployment.
 *
 * @module config/timeouts
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE — Sprint 134 Task 2
 * @authority Sprint 134 Hardcoded Params Audit (M1-M4, M9)
 */

/**
 * Parse an integer from an environment variable.
 * Returns `fallback` if the variable is unset, empty, or non-numeric.
 */
export function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Single source of truth for all timeout values in EndiorBot.
 * Override any entry via its env var — no code change required.
 */
export const TIMEOUTS = {
  /** Per-model API call timeout (default: 30 s). Env: ENDIORBOT_MODEL_TIMEOUT_MS */
  modelCall: envInt("ENDIORBOT_MODEL_TIMEOUT_MS", 30_000),
  /** Total chat handler timeout (default: 60 s). Env: ENDIORBOT_CHAT_TIMEOUT_MS */
  chatTotal: envInt("ENDIORBOT_CHAT_TIMEOUT_MS", 60_000),
  /** MCP agent chat timeout (default: 130 s). Env: MTCLAW_TIMEOUT_MS */
  mtclawAgent: envInt("MTCLAW_TIMEOUT_MS", 130_000),
  /** MCP tool call timeout (default: 30 s). Env: MTCLAW_DEFAULT_TIMEOUT_MS */
  mtclawTool: envInt("MTCLAW_DEFAULT_TIMEOUT_MS", 30_000),
  /** OpenAI provider timeout (default: 30 s). Env: ENDIORBOT_OPENAI_TIMEOUT_MS */
  openai: envInt("ENDIORBOT_OPENAI_TIMEOUT_MS", 30_000),
  /** Claude Code CLI timeout (default: 300 s / 5 min). Env: ENDIORBOT_CLAUDE_TIMEOUT_MS */
  claudeCode: envInt("ENDIORBOT_CLAUDE_TIMEOUT_MS", 300_000),
  /** RL session idle timeout (default: 30 min). Env: ENDIORBOT_SESSION_IDLE_TIMEOUT_MS */
  sessionIdle: envInt("ENDIORBOT_SESSION_IDLE_TIMEOUT_MS", 30 * 60_000),
  /** RL feedback window (default: 2 h). Env: ENDIORBOT_FEEDBACK_WINDOW_MS */
  feedbackWindow: envInt("ENDIORBOT_FEEDBACK_WINDOW_MS", 2 * 60 * 60_000),
} as const;