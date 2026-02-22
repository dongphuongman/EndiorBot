/**
 * Provider Registry
 *
 * Manages registration and retrieval of AI providers.
 */

import type { AIProvider } from "./types.js";

export class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProviderId: string | undefined;

  /**
   * Register a provider instance.
   */
  register(provider: AIProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already registered`);
    }
    this.providers.set(provider.id, provider);

    // Set first registered as default
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  /**
   * Unregister a provider by ID.
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);

    // Clear default if it was the unregistered provider
    if (this.defaultProviderId === providerId) {
      this.defaultProviderId = this.providers.keys().next().value;
    }
  }

  /**
   * Get a provider by ID.
   */
  get(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get a provider by ID, throwing if not found.
   */
  getOrThrow(providerId: string): AIProvider {
    const provider = this.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return provider;
  }

  /**
   * List all registered providers.
   */
  list(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List all registered provider IDs.
   */
  listIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered.
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Get the default provider.
   */
  getDefault(): AIProvider | undefined {
    if (!this.defaultProviderId) return undefined;
    return this.providers.get(this.defaultProviderId);
  }

  /**
   * Set the default provider.
   */
  setDefault(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Cannot set default: provider ${providerId} not registered`);
    }
    this.defaultProviderId = providerId;
  }

  /**
   * Get the default provider ID.
   */
  getDefaultId(): string | undefined {
    return this.defaultProviderId;
  }

  /**
   * Clear all registered providers.
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviderId = undefined;
  }

  /**
   * Get the count of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }
}

// Singleton instance
let globalRegistry: ProviderRegistry | undefined;

export function getProviderRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

export function resetProviderRegistry(): void {
  globalRegistry = undefined;
}
