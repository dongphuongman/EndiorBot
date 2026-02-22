/**
 * Session Store
 *
 * File-based session persistence.
 * Stores sessions as JSON files in ~/.endiorbot/sessions/
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { Session, SessionStore, SessionSummary } from "./types.js";

export class FileSessionStore implements SessionStore {
  private basePath: string;
  private indexPath: string;
  private initialized = false;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(resolveStateDir(), "sessions");
    this.indexPath = path.join(this.basePath, "index.json");
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.basePath, { recursive: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize session store: ${error}`);
    }
  }

  private sessionPath(sessionId: string): string {
    // Sanitize session ID to prevent path traversal
    const safeId = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
    return path.join(this.basePath, `${safeId}.json`);
  }

  async save(session: Session): Promise<void> {
    await this.ensureInitialized();

    const sessionPath = this.sessionPath(session.id);

    // Serialize with date handling
    const serialized = JSON.stringify(session, (_key, value) => {
      if (value instanceof Date) {
        return { __type: "Date", value: value.toISOString() };
      }
      return value;
    }, 2);

    await fs.writeFile(sessionPath, serialized, "utf-8");

    // Update index
    await this.updateIndex(session);
  }

  async load(sessionId: string): Promise<Session | null> {
    await this.ensureInitialized();

    const sessionPath = this.sessionPath(sessionId);

    try {
      const data = await fs.readFile(sessionPath, "utf-8");
      return JSON.parse(data, (_key, value) => {
        if (value && typeof value === "object" && value.__type === "Date") {
          return new Date(value.value);
        }
        return value;
      }) as Session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.ensureInitialized();

    const sessionPath = this.sessionPath(sessionId);

    try {
      await fs.unlink(sessionPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Update index
    await this.removeFromIndex(sessionId);
  }

  async list(projectId?: string): Promise<SessionSummary[]> {
    await this.ensureInitialized();

    try {
      const indexData = await fs.readFile(this.indexPath, "utf-8");
      const index = JSON.parse(indexData) as SessionSummary[];

      if (projectId) {
        return index.filter((s) => s.projectId === projectId);
      }

      return index;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async updateIndex(session: Session): Promise<void> {
    const index = await this.list();

    const summary: SessionSummary = {
      id: session.id,
      projectId: session.projectId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      messageCount: session.messages.length,
      tokenCount: session.tokenCount,
    };

    const existingIndex = index.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      index[existingIndex] = summary;
    } else {
      index.push(summary);
    }

    // Sort by lastActiveAt descending
    index.sort((a, b) => {
      const dateA = a.lastActiveAt instanceof Date ? a.lastActiveAt : new Date(a.lastActiveAt);
      const dateB = b.lastActiveAt instanceof Date ? b.lastActiveAt : new Date(b.lastActiveAt);
      return dateB.getTime() - dateA.getTime();
    });

    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  private async removeFromIndex(sessionId: string): Promise<void> {
    const index = await this.list();
    const filtered = index.filter((s) => s.id !== sessionId);
    await fs.writeFile(this.indexPath, JSON.stringify(filtered, null, 2), "utf-8");
  }
}

// Singleton instance
let globalStore: FileSessionStore | undefined;

export function getSessionStore(): FileSessionStore {
  if (!globalStore) {
    globalStore = new FileSessionStore();
  }
  return globalStore;
}
