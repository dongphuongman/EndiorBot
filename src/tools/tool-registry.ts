/**
 * ToolRegistry - Tool discovery with Phase 1 whitelist enforcement
 * Sprint 50 - Day 5-6 - Real Composio API Integration
 *
 * Handles:
 * - Tool discovery from Composio
 * - Whitelist enforcement (only Phase 1 tools allowed)
 * - Caching with TTL
 */

import type { Tool } from './types.js';
import { ComposioClient } from './composio-client.js';

/**
 * Phase 1 whitelist: 10 curated tools only
 * From TOOL-POLICY.md
 */
export const PHASE_1_WHITELIST = [
  'github.get_repo',
  'github.get_issue',
  'github.create_issue',
  'gmail.list_messages',
  'gmail.send_message',
  'google_calendar.list_events',
  'google_calendar.create_event',
  'slack.list_channels',
  'slack.send_message',
  'shell.execute_command',
] as const;

export type Phase1Tool = (typeof PHASE_1_WHITELIST)[number];

/**
 * Cache entry with timestamp
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Configuration for ToolRegistry
 */
export interface ToolRegistryConfig {
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Enable strict whitelist enforcement */
  strictWhitelist?: boolean;
}

/**
 * ToolRegistry provides tool discovery with whitelist enforcement
 */
export class ToolRegistry {
  private composioClient: ComposioClient;
  private cache: Map<string, CacheEntry<Tool[]>> = new Map();
  private toolCache: Map<string, CacheEntry<Tool>> = new Map();
  private readonly config: Required<ToolRegistryConfig>;

  static readonly DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(composioClient: ComposioClient, config: ToolRegistryConfig = {}) {
    this.composioClient = composioClient;
    this.config = {
      cacheTtlMs: config.cacheTtlMs ?? ToolRegistry.DEFAULT_CACHE_TTL_MS,
      strictWhitelist: config.strictWhitelist ?? true,
    };
  }

  /**
   * Discover available tools for a principal
   * Returns only Phase 1 whitelisted tools
   */
  async discoverTools(principal_id: string, apps?: string[]): Promise<Tool[]> {
    const cacheKey = `${principal_id}:${apps?.join(',') ?? 'all'}`;
    const cached = this.cache.get(cacheKey);

    // Return cached if valid
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.value;
    }

    // Fetch from Composio
    const allTools = await this.composioClient.getTools(principal_id, apps ?? []);

    // Filter to whitelist ONLY
    const allowedTools = this.config.strictWhitelist
      ? allTools.filter((tool) => this.isToolWhitelisted(tool.name))
      : allTools;

    // Cache result
    this.cache.set(cacheKey, { value: allowedTools, timestamp: Date.now() });

    // Also cache individual tools
    for (const tool of allowedTools) {
      this.toolCache.set(tool.name, { value: tool, timestamp: Date.now() });
    }

    return allowedTools;
  }

  /**
   * Get a specific tool by name
   * Throws if tool is not whitelisted
   */
  async getToolByName(name: string, principal_id: string): Promise<Tool | null> {
    // Check whitelist first
    if (this.config.strictWhitelist && !this.isToolWhitelisted(name)) {
      throw new ToolRegistryError(
        'NOT_WHITELISTED',
        `Tool '${name}' is not in Phase 1 whitelist`
      );
    }

    // Check cache
    const cached = this.toolCache.get(name);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.value;
    }

    // Fetch from Composio
    const appName = name.split('.')[0];
    const tools = await this.discoverTools(principal_id, appName ? [appName] : undefined);
    const tool = tools.find((t) => t.name === name);

    if (tool) {
      this.toolCache.set(name, { value: tool, timestamp: Date.now() });
    }

    return tool ?? null;
  }

  /**
   * Check if a tool is in the Phase 1 whitelist
   */
  isToolWhitelisted(name: string): boolean {
    return PHASE_1_WHITELIST.includes(name as Phase1Tool);
  }

  /**
   * Get all whitelisted tool names
   */
  getWhitelistedTools(): readonly string[] {
    return PHASE_1_WHITELIST;
  }

  /**
   * Get tools by app name
   */
  async getToolsByApp(app: string, principal_id: string): Promise<Tool[]> {
    const tools = await this.discoverTools(principal_id, [app]);
    return tools.filter((t) => t.app === app);
  }

  /**
   * Search tools by description or tags
   */
  async searchTools(
    query: string,
    principal_id: string
  ): Promise<Tool[]> {
    const allTools = await this.discoverTools(principal_id);
    const lowerQuery = query.toLowerCase();

    return allTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.description.toLowerCase().includes(lowerQuery) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get tool schema (for validation)
   */
  async getToolSchema(name: string, principal_id: string): Promise<{
    name: string;
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  } | null> {
    const tool = await this.getToolByName(name, principal_id);
    if (!tool) return null;

    return {
      name: tool.name,
      parameters: tool.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description,
      })),
    };
  }

  /**
   * Clear cache for a principal or all
   */
  clearCache(principal_id?: string): void {
    if (principal_id) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(principal_id)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.toolCache.clear();
    }
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    listCacheSize: number;
    toolCacheSize: number;
    oldestEntry: Date | null;
  } {
    let oldestTimestamp = Date.now();

    for (const entry of this.cache.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    for (const entry of this.toolCache.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      listCacheSize: this.cache.size,
      toolCacheSize: this.toolCache.size,
      oldestEntry:
        this.cache.size > 0 || this.toolCache.size > 0
          ? new Date(oldestTimestamp)
          : null,
    };
  }
}

/**
 * Custom error class for registry-related errors
 */
export class ToolRegistryError extends Error {
  constructor(
    public readonly code: 'NOT_WHITELISTED' | 'NOT_FOUND' | 'FETCH_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'ToolRegistryError';
  }
}
