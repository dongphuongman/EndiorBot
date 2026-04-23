/**
 * Providers Module
 *
 * AI model provider abstraction layer.
 *
 * Sprint 38: Added AccountManager for smart Claude account switching.
 */

// Types
export type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ContentPart,
  FinishReason,
  ImageContent,
  Message,
  MessageRole,
  ModelDefinition,
  ModelFeature,
  ProviderConfig,
  ProviderErrorCode,
  ProviderHealth,
  TextContent,
  TokenUsage,
  Tool,
  ToolCall,
  ToolParameter,
} from "./types.js";

export { ProviderError } from "./types.js";

// Base classes
export { BaseProvider } from "./base-provider.js";

// Registry
export {
  getProviderRegistry,
  ProviderRegistry,
  resetProviderRegistry,
} from "./provider-registry.js";

// Providers
export { AnthropicProvider } from "./anthropic/index.js";

// OpenAI Provider (Sprint 38 Day 7)
export type {
  OpenAIModel,
  OpenAIProviderConfig,
} from "./openai/index.js";

export {
  OpenAIProvider,
  createOpenAIProvider,
  createOpenAIProviderFromEnv,
  OPENAI_MODELS,
  OPENAI_TASK_ROUTING,
  DEFAULT_OPENAI_URL,
  DEFAULT_OPENAI_TIMEOUT_MS,
  DEFAULT_OPENAI_MODEL,
} from "./openai/index.js";

// Ollama Provider (Sprint 38 Day 5)
export type {
  OllamaModel,
  OllamaProviderConfig,
} from "./ollama/index.js";

export {
  OllamaProvider,
  createOllamaProvider,
  createOllamaProviderFromEnv,
  OLLAMA_MODELS,
  OLLAMA_EMBEDDING_MODELS,
  OLLAMA_SPECIAL_MODELS,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  DEFAULT_CODE_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_FAST_MODEL,
} from "./ollama/index.js";

// Gemini Provider (Sprint 38 Day 8)
export type {
  GeminiModel,
  GeminiProviderConfig,
} from "./gemini/index.js";

export {
  GeminiProvider,
  createGeminiProvider,
  createGeminiProviderFromEnv,
  GEMINI_MODELS,
  GEMINI_TASK_ROUTING,
} from "./gemini/index.js";

// Kimi Proxy Provider (Sprint 140 — Kimi2.6 fallback)
export { KimiProxyProvider, createKimiProxyProviderFromEnv } from "./kimi-proxy/index.js";

// GitHub Models Provider (Sprint 46 Day 2-3)
export type {
  GitHubModel,
  GitHubModelTier,
  GitHubModelsConfig,
} from "./github/index.js";

export {
  GitHubModelsProvider,
  createGitHubModelsProvider,
  createGitHubModelsProviderFromEnv,
  GITHUB_MODELS,
  GITHUB_MODELS_BASE_URL,
  DEFAULT_GITHUB_MODEL,
  DEFAULT_GITHUB_RATE_LIMIT,
  GITHUB_FREE_MODELS,
  GITHUB_PRO_MODELS,
  getGitHubModel,
  getApiModelName,
  isFreeTierModel,
  getModelsByProvider,
  selectModelForTask,
} from "./github/index.js";

// Account Manager (Sprint 38 Day 1-2)
export type {
  AccountId,
  AccountStatus,
  AccountConfig,
  AccountState,
  AccountSwitchEvent,
  AccountManagerConfig,
  AccountSelection,
} from "./account-manager.js";

export {
  AccountManager,
  createAccountManager,
  createAccountManagerFromEnv,
  DEFAULT_WEEKLY_QUOTA,
  DEFAULT_MAX_NOTIFICATIONS_PER_HOUR,
  RATE_LIMIT_COOLDOWN_MS,
} from "./account-manager.js";

// Resource Router (Sprint 38 Day 3-4)
export type {
  ProviderId,
  TaskType,
  ProviderConfig as RouterProviderConfig,
  ProviderHealth as RouterProviderHealth,
  RoutingDecision,
  ConsultationResult,
  ResourceRouterConfig,
  RouterUsageStats,
} from "./resource-router.js";

export {
  ResourceRouter,
  createResourceRouter,
  createResourceRouterFromEnv,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_MAX_PARALLEL_QUERIES,
  DEFAULT_MIN_CONSULTATION_PROVIDERS,
  MULTI_MODEL_TASK_TYPES,
  TASK_ROUTING_PREFERENCES,
} from "./resource-router.js";

// Multi-Model Orchestrator (Sprint 39)
export type {
  OrchestratorConfig,
  ProviderSetup,
  ExpertConsultationRequest,
  ExpertConsultationResponse,
  ExpertOpinion,
  ConsensusAnalysis,
  OrchestratorState,
} from "./multi-model-orchestrator.js";

export {
  MultiModelOrchestrator,
  createOrchestrator,
  createOrchestratorFromEnv,
  DEFAULT_HEALTH_CHECK_INTERVAL_MS,
  PROVIDER_COSTS,
} from "./multi-model-orchestrator.js";
