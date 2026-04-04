/**
 * Provider Constants — SSOT for provider identifiers.
 *
 * All modules must import provider strings from here.
 * Sprint 129: Centralized to prevent drift (GPT FIX-3).
 *
 * @module config/providers
 */

/** Supported AI provider identifiers */
export const PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
  OLLAMA: "ollama",
} as const;

export type ProviderId = (typeof PROVIDERS)[keyof typeof PROVIDERS];

/** Default provider for consultation (no Anthropic API key; uses OAuth via Bridge) */
export const DEFAULT_CONSULT_PROVIDER = PROVIDERS.OPENAI;

/** Default provider for chat mode */
export const DEFAULT_CHAT_PROVIDER = PROVIDERS.OPENAI;
