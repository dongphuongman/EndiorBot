/**
 * Context Anchor
 *
 * Core implementation of the Context Anchoring system.
 * Sprint 65: T5.3 - Implement context-anchor.ts.
 *
 * The ContextAnchor class manages all anchor operations:
 * - CRUD operations for anchors
 * - Persistence to disk
 * - Query and filtering
 * - Event emission
 *
 * @module context/context-anchor
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 65
 * @authority Master Plan v4.2, Sprint 65 T5.3
 * @sprint 65
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createLogger, type Logger } from "../logging/index.js";
import {
  type AnchorPoint,
  type AnchorType,
  type AnchorState,
  type AnchorQuery,
  type AnchorEvent,
  type AnchorEventType,
  type AnchorStoreConfig,
  type SprintGoal,
  type Checkpoint,
  type SpecSnapshot,
  type Decision,
  type Blocker,
  DEFAULT_ANCHOR_STORE_CONFIG,
  createAnchorId,
} from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Anchor event listener.
 */
type AnchorEventListener = (event: AnchorEvent) => void;

/**
 * Persisted anchor store format.
 */
interface PersistedStore {
  version: string;
  lastSaved: string;
  anchors: Record<string, AnchorPoint>;
}

// ============================================================================
// ContextAnchor Class
// ============================================================================

/**
 * Context Anchor Manager.
 *
 * Manages all anchor operations including CRUD, persistence, and events.
 *
 * @example
 * ```typescript
 * const anchor = getContextAnchor();
 *
 * // Create a sprint goal
 * const goal = await anchor.create<SprintGoal>({
 *   type: "sprint_goal",
 *   title: "Sprint 65 Goals",
 *   sprintNumber: "65",
 *   objectives: [...],
 * });
 *
 * // Query anchors
 * const activeGoals = await anchor.query({
 *   types: ["sprint_goal"],
 *   states: ["active"],
 * });
 *
 * // Listen for events
 * anchor.on("anchor_created", (event) => {
 *   console.log(`Created: ${event.anchorId}`);
 * });
 * ```
 */
export class ContextAnchor {
  private readonly config: AnchorStoreConfig;
  private readonly logger: Logger;
  private anchors: Map<string, AnchorPoint> = new Map();
  private listeners: Map<AnchorEventType, AnchorEventListener[]> = new Map();
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private initialized = false;

  constructor(config: Partial<AnchorStoreConfig> = {}) {
    this.config = { ...DEFAULT_ANCHOR_STORE_CONFIG, ...config };
    this.logger = createLogger("ContextAnchor");
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initialize the anchor store.
   * Loads existing anchors from disk and starts auto-save.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure storage directory exists
    await this.ensureStorageDir();

    // Load existing anchors
    await this.load();

    // Start auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    this.initialized = true;
    this.logger.info("ContextAnchor initialized", {
      anchorCount: this.anchors.size,
      storagePath: this.config.storagePath,
    });
  }

  /**
   * Shutdown the anchor store.
   * Saves pending changes and stops auto-save.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // Stop auto-save
    this.stopAutoSave();

    // Save pending changes
    if (this.dirty) {
      await this.save();
    }

    this.initialized = false;
    this.logger.info("ContextAnchor shutdown");
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Create a new anchor.
   */
  async create<T extends AnchorPoint>(
    data: Omit<T, "id" | "createdAt" | "updatedAt"> & Partial<Pick<T, "id">>
  ): Promise<T> {
    await this.ensureInitialized();

    const now = new Date();
    const anchor = {
      ...data,
      id: data.id ?? createAnchorId(data.type),
      createdAt: now,
      updatedAt: now,
      state: data.state ?? "active",
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
    } as T;

    this.anchors.set(anchor.id, anchor);
    this.dirty = true;

    await this.emit("anchor_created", anchor);
    this.logger.debug("Anchor created", { id: anchor.id, type: anchor.type });

    return anchor;
  }

  /**
   * Get an anchor by ID.
   */
  async get<T extends AnchorPoint>(id: string): Promise<T | null> {
    await this.ensureInitialized();
    return (this.anchors.get(id) as T) ?? null;
  }

  /**
   * Update an anchor.
   */
  async update<T extends AnchorPoint>(
    id: string,
    updates: Partial<Omit<T, "id" | "type" | "createdAt">>
  ): Promise<T | null> {
    await this.ensureInitialized();

    const existing = this.anchors.get(id);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    } as T;

    this.anchors.set(id, updated);
    this.dirty = true;

    await this.emit("anchor_updated", updated);
    this.logger.debug("Anchor updated", { id, type: updated.type });

    return updated;
  }

  /**
   * Delete an anchor.
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const existing = this.anchors.get(id);
    if (!existing) {
      return false;
    }

    this.anchors.delete(id);
    this.dirty = true;

    await this.emit("anchor_archived", existing);
    this.logger.debug("Anchor deleted", { id, type: existing.type });

    return true;
  }

  /**
   * Archive an anchor (soft delete).
   */
  async archive(id: string): Promise<AnchorPoint | null> {
    return this.update(id, { state: "archived" as AnchorState });
  }

  // =========================================================================
  // Query Operations
  // =========================================================================

  /**
   * Query anchors with filters.
   */
  async query<T extends AnchorPoint>(options: AnchorQuery = {}): Promise<T[]> {
    await this.ensureInitialized();

    let results = Array.from(this.anchors.values()) as T[];

    // Apply filters
    if (options.types?.length) {
      results = results.filter((a) => options.types!.includes(a.type));
    }

    if (options.states?.length) {
      results = results.filter((a) => options.states!.includes(a.state));
    }

    if (options.priorities?.length) {
      results = results.filter((a) => options.priorities!.includes(a.priority));
    }

    if (options.sprint) {
      results = results.filter((a) => a.sprint === options.sprint);
    }

    if (options.stage) {
      results = results.filter((a) => a.stage === options.stage);
    }

    if (options.tags?.length) {
      results = results.filter((a) =>
        options.tags!.some((tag) => a.tags.includes(tag))
      );
    }

    if (options.createdAfter) {
      results = results.filter((a) => a.createdAt >= options.createdAfter!);
    }

    if (options.createdBefore) {
      results = results.filter((a) => a.createdAt <= options.createdBefore!);
    }

    // Sort
    if (options.sortBy) {
      const dir = options.sortDirection === "desc" ? -1 : 1;
      results.sort((a, b) => {
        const aVal = a[options.sortBy!];
        const bVal = b[options.sortBy!];
        if (aVal instanceof Date && bVal instanceof Date) {
          return (aVal.getTime() - bVal.getTime()) * dir;
        }
        if (typeof aVal === "string" && typeof bVal === "string") {
          return aVal.localeCompare(bVal) * dir;
        }
        return 0;
      });
    }

    // Pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get all anchors of a specific type.
   */
  async getByType<T extends AnchorPoint>(type: AnchorType): Promise<T[]> {
    return this.query<T>({ types: [type] });
  }

  /**
   * Get active anchors of a specific type.
   */
  async getActive<T extends AnchorPoint>(type: AnchorType): Promise<T[]> {
    return this.query<T>({ types: [type], states: ["active"] });
  }

  /**
   * Get the most recent anchor of a type.
   */
  async getMostRecent<T extends AnchorPoint>(
    type: AnchorType
  ): Promise<T | null> {
    const results = await this.query<T>({
      types: [type],
      sortBy: "createdAt",
      sortDirection: "desc",
      limit: 1,
    });
    return results[0] ?? null;
  }

  // =========================================================================
  // Type-Specific Getters
  // =========================================================================

  /**
   * Get active sprint goals.
   */
  async getSprintGoals(): Promise<SprintGoal[]> {
    return this.getActive<SprintGoal>("sprint_goal");
  }

  /**
   * Get checkpoints.
   */
  async getCheckpoints(): Promise<Checkpoint[]> {
    return this.query<Checkpoint>({
      types: ["checkpoint"],
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  }

  /**
   * Get active spec snapshots.
   */
  async getSpecSnapshots(): Promise<SpecSnapshot[]> {
    return this.getActive<SpecSnapshot>("spec_snapshot");
  }

  /**
   * Get decisions.
   */
  async getDecisions(): Promise<Decision[]> {
    return this.query<Decision>({
      types: ["decision"],
      sortBy: "createdAt",
      sortDirection: "desc",
    });
  }

  /**
   * Get active blockers.
   */
  async getBlockers(): Promise<Blocker[]> {
    return this.getActive<Blocker>("blocker");
  }

  // =========================================================================
  // Event System
  // =========================================================================

  /**
   * Subscribe to anchor events.
   */
  on(event: AnchorEventType, listener: AnchorEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * Unsubscribe from anchor events.
   */
  off(event: AnchorEventType, listener: AnchorEventListener): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    }
  }

  /**
   * Emit an anchor event.
   */
  private async emit(
    type: AnchorEventType,
    anchor: AnchorPoint
  ): Promise<void> {
    const event: AnchorEvent = {
      type,
      anchorId: anchor.id,
      anchorType: anchor.type,
      timestamp: new Date(),
      data: { anchor },
    };

    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn("Event listener error", {
          event: type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  /**
   * Save anchors to disk.
   */
  async save(): Promise<void> {
    const storePath = path.join(this.config.storagePath, "anchors.json");

    const data: PersistedStore = {
      version: "1.0.0",
      lastSaved: new Date().toISOString(),
      anchors: Object.fromEntries(this.anchors),
    };

    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(storePath, content, "utf-8");

    this.dirty = false;
    this.logger.debug("Anchors saved", { count: this.anchors.size });
  }

  /**
   * Load anchors from disk.
   */
  async load(): Promise<void> {
    const storePath = path.join(this.config.storagePath, "anchors.json");

    try {
      const content = await fs.readFile(storePath, "utf-8");
      const data = JSON.parse(content) as PersistedStore;

      // Restore anchors with proper Date objects
      this.anchors.clear();
      for (const [id, anchor] of Object.entries(data.anchors)) {
        const restored: AnchorPoint = {
          ...anchor,
          createdAt: new Date(anchor.createdAt),
          updatedAt: new Date(anchor.updatedAt),
        };
        if (anchor.expiresAt) {
          restored.expiresAt = new Date(anchor.expiresAt);
        }
        this.anchors.set(id, restored);
      }

      this.logger.debug("Anchors loaded", { count: this.anchors.size });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("Failed to load anchors", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      // Start fresh if no file exists
      this.anchors.clear();
    }
  }

  /**
   * Ensure storage directory exists.
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  // =========================================================================
  // Auto-Save
  // =========================================================================

  /**
   * Start auto-save timer.
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      return;
    }

    this.autoSaveTimer = setInterval(async () => {
      if (this.dirty) {
        try {
          await this.save();
        } catch (error) {
          this.logger.warn("Auto-save failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }, this.config.autoSaveInterval * 1000);
  }

  /**
   * Stop auto-save timer.
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Ensure the store is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get anchor count.
   */
  get count(): number {
    return this.anchors.size;
  }

  /**
   * Check if store is initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force save (for testing).
   */
  async forceSave(): Promise<void> {
    await this.save();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance: ContextAnchor | null = null;

/**
 * Get the default ContextAnchor instance.
 */
export function getContextAnchor(
  config?: Partial<AnchorStoreConfig>
): ContextAnchor {
  if (!defaultInstance) {
    defaultInstance = new ContextAnchor(config);
  }
  return defaultInstance;
}

/**
 * Reset the default ContextAnchor instance.
 */
export async function resetContextAnchor(): Promise<void> {
  if (defaultInstance) {
    await defaultInstance.shutdown();
    defaultInstance = null;
  }
}
