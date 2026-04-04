/**
 * Model Constants — SSOT for model strings.
 *
 * All modules must import model identifiers from here.
 * Sprint 129: Centralized to prevent drift (GPT FIX-3).
 *
 * @module config/models
 */

/** Default model strings by provider */
export const MODELS = {
  /** OpenAI default for consultation and chat */
  OPENAI_DEFAULT: "gpt-5.4",

  /** Gemini default for consultation fallback */
  GEMINI_DEFAULT: "gemini-2.5-pro",

  /** Ollama default for local/privacy chat */
  OLLAMA_DEFAULT: "qwen3.5:9b",

  /** Anthropic default (via API, not OAuth Bridge) */
  ANTHROPIC_DEFAULT: "claude-sonnet-4-5-20250929",

  /** Budget tracking default model (Sonnet tier) */
  BUDGET_DEFAULT: "claude-sonnet-4-5-20250929",
} as const;
