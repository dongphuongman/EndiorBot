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
import { ClaudeCodeProvider } from "./claude-code/index.js";
import {
  startKimiProxy,
  createKimiProxyProviderFromEnv,
} from "./kimi-proxy/index.js";
import { createKimiApiProviderFromEnv } from "./kimi-api/index.js";

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
  registry.clear();
  let count = 0;

  // Claude Code CLI (OAuth — ADR-043-A1: primary for chat)
  try {
    const cc = new ClaudeCodeProvider();
    const health = await cc.healthCheck();
    if (health.status === "healthy") {
      await cc.initialize({});
      registry.register(cc);
      count++;
    }
  } catch {
    // Claude Code not available — fall through to API providers
  }

  // Kimi Proxy (local claude-code-proxy subprocess — ADR-051)
  // Fallback Tier 1: Kimi OAuth via local proxy.
  try {
    const proxyState = await startKimiProxy();
    if (proxyState) {
      const kimi = createKimiProxyProviderFromEnv();
      await kimi.initialize({ baseUrl: proxyState.url });
      registry.register(kimi);
      console.log(`✓ Registered KimiProxyProvider at ${proxyState.url}`);
      count++;
    }
  } catch (error) {
    console.warn("⚠ Failed to register KimiProxyProvider:", error instanceof Error ? error.message : String(error));
  }

  // Kimi API (Moonshot — direct OpenAI-compatible API)
  // Fallback Tier 2: Direct API key when OAuth proxy unavailable.
  if (process.env.KIMI_API_KEY) {
    try {
      const kimiApi = createKimiApiProviderFromEnv();
      const kimiConfig: { apiKey: string; baseUrl?: string } = {
        apiKey: process.env.KIMI_API_KEY,
      };
      if (process.env.KIMI_API_BASE_URL) {
        kimiConfig.baseUrl = process.env.KIMI_API_BASE_URL;
      }
      await kimiApi.initialize(kimiConfig);
      registry.register(kimiApi);
      console.log("✓ Registered KimiApiProvider (Moonshot)");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register KimiApiProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Anthropic (Claude API key)
  // Sprint 136 A10: CEO opt-out — set ENDIORBOT_DISABLE_ANTHROPIC_FALLBACK=true to
  // skip AnthropicProvider registration even when ANTHROPIC_API_KEY is present.
  // Use case: CEO runs Claude Code via OAuth (Max subscription) and does not
  // want any direct Anthropic API spend for fallback routing.
  const anthropicDisabled = process.env.ENDIORBOT_DISABLE_ANTHROPIC_FALLBACK === "true";
  if (process.env.ANTHROPIC_API_KEY && !anthropicDisabled) {
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
  } else if (process.env.ANTHROPIC_API_KEY && anthropicDisabled) {
    console.log("  AnthropicProvider: skipped (ENDIORBOT_DISABLE_ANTHROPIC_FALLBACK=true)");
  }

  // OpenAI (GPT)
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = createOpenAIProviderFromEnv();
      await openai.initialize({});
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
      await gemini.initialize({});  // Initialize provider before registration
      registry.register(gemini);
      console.log("✓ Registered GeminiProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register GeminiProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Ollama (local models)
  if (process.env.OLLAMA_URL || process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL) {
    try {
      const ollama = createOllamaProviderFromEnv();
      await ollama.initialize({});
      registry.register(ollama);
      console.log("✓ Registered OllamaProvider");
      count++;
    } catch (error) {
      console.warn("⚠ Failed to register OllamaProvider:", error instanceof Error ? error.message : String(error));
    }
  }

  // Set default provider: Cloud APIs first (Anthropic, OpenAI, Gemini), Ollama only as fallback
  const defaultProvider = registry.getDefault();

  // Priority (ADR-043-A1): Claude Code > Gemini > Ollama > OpenAI
  // Updated ADR-051: kimi-proxy is a fallback, never default.
  if (registry.has('claude-code')) {
    registry.setDefault('claude-code');
  } else if (registry.has('gemini')) {
    registry.setDefault('gemini');
  } else if (registry.has('ollama')) {
    registry.setDefault('ollama');
  } else if (registry.has('openai')) {
    registry.setDefault('openai');
  } else if (registry.has('anthropic')) {
    registry.setDefault('anthropic');
  } else if (defaultProvider) {
    console.log(`✓ Default provider: ${defaultProvider.id}`);
  } else {
    console.warn("⚠ No AI providers configured!");
    console.warn("  Prefer Cloud APIs: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY");
    console.warn("  Fallback (local): OLLAMA_URL or OLLAMA_BASE_URL");
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
