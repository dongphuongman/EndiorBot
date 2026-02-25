/**
 * GitHub Models Provider Configuration
 *
 * Model catalog and configuration for GitHub Models (Azure-hosted inference).
 *
 * Per Sprint 46 Days 2-3 requirements:
 * - Free tier: gpt-4o-mini, phi-4, Llama-3.3-70B
 * - Pro tier: gpt-4o, claude-3-5-sonnet, mistral-large
 * - Rate limits: 15 req/min (free), higher for Pro
 *
 * @module providers/github/config
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Day 2
 * @authority ADR-008 Multi-Provider Architecture
 * @stage 04 - BUILD
 */

// ============================================================================
// Types
// ============================================================================

/**
 * GitHub model tier.
 */
export type GitHubModelTier = "free" | "pro";

/**
 * GitHub model specification.
 */
export interface GitHubModel {
  /** Internal model ID (e.g., "gpt-4o-mini") */
  id: string;
  /** GitHub Models API model name (e.g., "openai/gpt-4o-mini") */
  apiName: string;
  /** Display name */
  displayName: string;
  /** Provider (openai, anthropic, meta, microsoft, mistral) */
  provider: string;
  /** Context window size */
  contextWindow: number;
  /** Max output tokens */
  maxOutputTokens: number;
  /** Tier requirement */
  tier: GitHubModelTier;
  /** Purpose/specialty */
  purpose: string;
  /** Supported features */
  features: string[];
}

/**
 * GitHub Models provider configuration.
 */
export interface GitHubModelsConfig {
  /** Personal Access Token (PAT) */
  pat?: string;
  /** Default model */
  defaultModel?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Max requests per minute (rate limit) */
  maxRequestsPerMinute?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** GitHub Models inference endpoint (Azure-hosted) */
export const GITHUB_MODELS_BASE_URL = "https://models.inference.ai.azure.com";

/** Default request timeout (30s) */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Default model */
export const DEFAULT_MODEL = "gpt-4o-mini";

/** Default rate limit (free tier) */
export const DEFAULT_RATE_LIMIT = 15;

/** Keytar service name for PAT storage */
export const KEYTAR_SERVICE = "endiorbot-github-models";

/** Keytar account name */
export const KEYTAR_ACCOUNT = "github-pat";

// ============================================================================
// Model Catalog
// ============================================================================

/**
 * Available GitHub Models with their specifications.
 * Source: https://github.com/marketplace/models
 */
export const GITHUB_MODELS: GitHubModel[] = [
  // ============================================
  // OpenAI Models
  // ============================================
  {
    id: "gpt-4o",
    apiName: "openai/gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tier: "pro",
    purpose: "Most capable OpenAI model, vision support",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "gpt-4o-mini",
    apiName: "openai/gpt-4o-mini",
    displayName: "GPT-4o Mini",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    tier: "free",
    purpose: "Fast, cost-effective for most tasks",
    features: ["chat", "vision", "tools", "streaming"],
  },
  {
    id: "o1-mini",
    apiName: "openai/o1-mini",
    displayName: "O1 Mini",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 65_536,
    tier: "pro",
    purpose: "Fast reasoning model",
    features: ["chat", "reasoning"],
  },

  // ============================================
  // Meta Models (Llama)
  // ============================================
  {
    id: "llama-3.3-70b",
    apiName: "meta/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B",
    provider: "meta",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    tier: "free",
    purpose: "Open-source large model, strong reasoning",
    features: ["chat", "streaming"],
  },
  {
    id: "llama-3.2-90b-vision",
    apiName: "meta/llama-3.2-90b-vision-instruct",
    displayName: "Llama 3.2 90B Vision",
    provider: "meta",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    tier: "pro",
    purpose: "Vision-capable large model",
    features: ["chat", "vision", "streaming"],
  },

  // ============================================
  // Microsoft Models (Phi)
  // ============================================
  {
    id: "phi-4",
    apiName: "microsoft/phi-4",
    displayName: "Phi-4",
    provider: "microsoft",
    contextWindow: 16_384,
    maxOutputTokens: 4_096,
    tier: "free",
    purpose: "Efficient small model, fast inference",
    features: ["chat", "streaming"],
  },

  // ============================================
  // Mistral Models
  // ============================================
  {
    id: "mistral-large",
    apiName: "mistral/mistral-large-2411",
    displayName: "Mistral Large",
    provider: "mistral",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    tier: "pro",
    purpose: "Top-tier Mistral model",
    features: ["chat", "tools", "streaming"],
  },
  {
    id: "mistral-small",
    apiName: "mistral/mistral-small-2503",
    displayName: "Mistral Small",
    provider: "mistral",
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    tier: "free",
    purpose: "Efficient Mistral model",
    features: ["chat", "streaming"],
  },

  // ============================================
  // Cohere Models
  // ============================================
  {
    id: "cohere-command-r",
    apiName: "cohere/cohere-command-r-08-2024",
    displayName: "Cohere Command R",
    provider: "cohere",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    tier: "free",
    purpose: "Strong RAG and tool use",
    features: ["chat", "tools", "streaming"],
  },
];

/**
 * Task type to model mapping.
 */
export const GITHUB_TASK_ROUTING: Record<string, string> = {
  code_generation: "gpt-4o",
  bug_fix: "gpt-4o-mini",
  code_review: "llama-3.3-70b",
  architecture: "gpt-4o",
  reasoning: "o1-mini",
  research: "llama-3.3-70b",
  analysis: "gpt-4o-mini",
  fast: "phi-4",
  drafts: "phi-4",
  general: "gpt-4o-mini",
  rag: "cohere-command-r",
};

/**
 * Free tier models (no Pro subscription required).
 */
export const FREE_MODELS = GITHUB_MODELS.filter((m) => m.tier === "free").map((m) => m.id);

/**
 * Pro tier models (require Pro subscription).
 */
export const PRO_MODELS = GITHUB_MODELS.filter((m) => m.tier === "pro").map((m) => m.id);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get model by ID.
 */
export function getGitHubModel(modelId: string): GitHubModel | undefined {
  return GITHUB_MODELS.find((m) => m.id === modelId);
}

/**
 * Get API model name from internal ID.
 */
export function getApiModelName(modelId: string): string | undefined {
  return getGitHubModel(modelId)?.apiName;
}

/**
 * Check if model is available in free tier.
 */
export function isFreeTierModel(modelId: string): boolean {
  return FREE_MODELS.includes(modelId);
}

/**
 * Get models by provider.
 */
export function getModelsByProvider(provider: string): GitHubModel[] {
  return GITHUB_MODELS.filter((m) => m.provider === provider);
}

/**
 * Get best model for task type.
 */
export function selectModelForTask(taskType: string): string {
  return GITHUB_TASK_ROUTING[taskType] ?? DEFAULT_MODEL;
}
