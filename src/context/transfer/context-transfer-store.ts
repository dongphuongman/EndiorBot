/**
 * Context Transfer Store — Sprint 96
 *
 * File-based persistence for TransferableContext entries.
 * Follows FileSessionStore pattern from src/sessions/session-store.ts.
 *
 * Storage: ~/.endiorbot/context-transfer/{projectId}/{id}.json
 *
 * @module context/transfer/context-transfer-store
 * @version 1.0.0
 * @sprint 96
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type {
  TransferableContext,
  TransferContextType,
  TransferStoreStats,
} from "./types.js";
import { DEFAULT_TRANSFER_CONFIG } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface ContextTransferStoreOptions {
  basePath?: string;
}

export interface ListOptions {
  type?: TransferContextType;
  minCompositeScore?: number;
  excludeExpired?: boolean;
}

// ============================================================================
// ContextTransferStore
// ============================================================================

export class ContextTransferStore {
  private readonly basePath: string;

  constructor(options?: ContextTransferStoreOptions) {
    const configuredPath = options?.basePath ?? DEFAULT_TRANSFER_CONFIG.basePath;
    this.basePath = configuredPath.startsWith("~")
      ? configuredPath.replace("~", os.homedir())
      : configuredPath;
  }

  /**
   * Save a single context entry.
   */
  async save(context: TransferableContext): Promise<void> {
    const dir = this.projectDir(context.projectId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${context.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(context, null, 2), "utf-8");
  }

  /**
   * Save multiple context entries.
   */
  async saveBatch(contexts: TransferableContext[]): Promise<void> {
    for (const ctx of contexts) {
      await this.save(ctx);
    }
  }

  /**
   * Load a single context entry by ID.
   */
  async load(projectId: string, id: string): Promise<TransferableContext | null> {
    const filePath = path.join(this.projectDir(projectId), `${id}.json`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as TransferableContext;
    } catch {
      return null;
    }
  }

  /**
   * List all context entries for a project, with optional filters.
   */
  async listByProject(
    projectId: string,
    options?: ListOptions,
  ): Promise<TransferableContext[]> {
    const dir = this.projectDir(projectId);

    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return []; // Directory doesn't exist → empty project
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const results: TransferableContext[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(dir, file), "utf-8");
        const ctx = JSON.parse(content) as TransferableContext;

        // Apply filters
        if (options?.type && ctx.type !== options.type) continue;
        if (options?.minCompositeScore && ctx.quality.composite < options.minCompositeScore) continue;
        if (options?.excludeExpired && this.isExpired(ctx)) continue;

        results.push(ctx);
      } catch {
        // Skip corrupt files
      }
    }

    return results;
  }

  /**
   * Delete a single context entry.
   */
  async delete(projectId: string, id: string): Promise<boolean> {
    const filePath = path.join(this.projectDir(projectId), `${id}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove expired entries. Returns count of deleted entries.
   */
  async cleanupExpired(projectId: string): Promise<number> {
    const all = await this.listByProject(projectId);
    let deleted = 0;

    for (const ctx of all) {
      if (this.isExpired(ctx)) {
        await this.delete(projectId, ctx.id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Remove entries older than a given age. Returns count of deleted entries.
   */
  async cleanupByAge(projectId: string, olderThanMs: number): Promise<number> {
    const all = await this.listByProject(projectId);
    const cutoff = Date.now() - olderThanMs;
    let deleted = 0;

    for (const ctx of all) {
      const createdAt = new Date(ctx.createdAt).getTime();
      if (createdAt < cutoff) {
        await this.delete(projectId, ctx.id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get storage statistics for a project.
   */
  async getStats(projectId: string): Promise<TransferStoreStats> {
    const all = await this.listByProject(projectId);

    const byType: Record<TransferContextType, number> = {
      goal_result: 0,
      decision: 0,
      architecture: 0,
      error_pattern: 0,
      task_output: 0,
      blocker_resolution: 0,
    };

    let totalTokens = 0;
    let expiredEntries = 0;
    let totalQuality = 0;

    for (const ctx of all) {
      byType[ctx.type]++;
      totalTokens += ctx.tokenCount;
      if (this.isExpired(ctx)) expiredEntries++;
      totalQuality += ctx.quality.composite;
    }

    return {
      totalEntries: all.length,
      totalTokens,
      byType,
      expiredEntries,
      averageQuality: all.length > 0 ? totalQuality / all.length : 0,
    };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private projectDir(projectId: string): string {
    // Sanitize project ID for filesystem
    const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.basePath, safe);
  }

  private isExpired(ctx: TransferableContext): boolean {
    if (!ctx.expiresAt) return false;
    return new Date(ctx.expiresAt).getTime() < Date.now();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalStore: ContextTransferStore | undefined;

export function getContextTransferStore(): ContextTransferStore {
  if (!globalStore) {
    globalStore = new ContextTransferStore();
  }
  return globalStore;
}

export function resetContextTransferStore(): void {
  globalStore = undefined;
}
