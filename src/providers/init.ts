/**
 * Provider Initialization
 *
 * Auto-initializes AI providers from environment variables.
 * Call this when Gateway starts to setup providers.
 *
 * @module providers/init
 * @version 1.0.0
 * @date 2026-02-26
 * @status ACTIVE - Sprint 44 Provider Setup
 */

import { getProviderRegistry } from "./provider-registry.js";
import { AnthropicProvider } from "./anthropic/index.js";
import { createOpenAIProviderFromEnv } from "./openai/index.js";
import { createGeminiProviderFromEnv } from "./gemini/index.js";
import { createOllamaProviderFromEnv } from "./ollama/index.js";

/**
 * Initialize providers from environment variables.
 *
 * Checks for API keys and registers available providers:
 * - ANTHROPIC_API_KEY → AnthropicProvider
 * - OPENAI_API_KEY → OpenAIProvider
 * - GOOGLE_API_KEY → GeminiProvider
 * - OLLAMA_URL → OllamaProvider (local)
 *
 * Returns count of registered providers.
 */
export async function initializeProvidersFromEnv(): Promise<number> {
  const registry = getProviderRegistry();
  let count = 0;

  // Anthropic (Claude)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new AnthropicProvider();
      await anthropic.initialize({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      registry.register(anthropic);
      console.log("✓ Registered AnthropicProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register AnthropicProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // OpenAI (GPT)
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = createOpenAIProviderFromEnv();
      registry.register(openai);
      console.log("✓ Registered OpenAIProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register OpenAIProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Google Gemini
  if (process.env.GOOGLE_API_KEY) {
    try {
      const gemini = createGeminiProviderFromEnv();
      registry.register(gemini);
      console.log("✓ Registered GeminiProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register GeminiProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Ollama (local models)
  if (process.env.OLLAMA_URL || process.env.OLLAMA_HOST) {
    try {
      const ollama = createOllamaProviderFromEnv();
      registry.register(ollama);
      console.log("✓ Registered OllamaProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register OllamaProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Set default provider (prefer premium providers, Ollama as fallback only)
  const defaultProvider = registry.getDefault();

  // Priority: Gemini > OpenAI > Anthropic > Ollama (fallback)
  // Note: Anthropic OAuth token has model access issues, use Gemini/OpenAI as primary
  if (registry.has('gemini')) {
    registry.setDefault('gemini');
    console.log(`✓ Default provider: gemini (Gemini 2.0 Flash, premium)`);
  } else if (registry.has('openai')) {
    registry.setDefault('openai');
    console.log(`✓ Default provider: openai (GPT-4o, premium)`);
  } else if (registry.has('anthropic')) {
    registry.setDefault('anthropic');
    console.log(`✓ Default provider: anthropic (Claude, premium)`);
  } else if (registry.has('ollama')) {
    registry.setDefault('ollama');
    console.log(`✓ Default provider: ollama (qwen3-coder:30b, fallback)`);
  } else if (defaultProvider) {
    console.log(`✓ Default provider: ${defaultProvider.id}`);
  } else {
    console.warn("⚠ No AI providers configured!");
    console.warn("  Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, OLLAMA_URL");
  }

  return count;
}

/**
 * Check if any providers are registered.
 */
export function hasProviders(): boolean {
  const registry = getProviderRegistry();
  return registry.list().length > 0;
}

/**
 * Get list of registered provider IDs.
 */
export function getRegisteredProviders(): string[] {
  const registry = getProviderRegistry();
  return registry.listIds();
}
