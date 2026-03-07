/**
 * Session Registry
 *
 * File-backed session storage with atomic writes, version tracking, and checksum.
 * Stored at ~/.endiorbot/bridge-sessions.json
 *
 * @module bridge/session-registry
 * @version 1.0.0
 * @authority ADR-024
 * @stage 04 - BUILD (Sprint 82)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type {
  BridgeSession,
  SessionRegistryFile,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_PATH = join(homedir(), ".endiorbot", "bridge-sessions.json");

// ============================================================================
// Session Registry
// ============================================================================

export class SessionRegistry {
  private readonly filePath: string;

  constructor(filePath: string = REGISTRY_PATH) {
    this.filePath = filePath;
    this.ensureDirectory();
  }

  /**
   * Get all sessions.
   */
  getAll(): BridgeSession[] {
    const file = this.readFile();
    return file.sessions;
  }

  /**
   * Get active sessions only.
   */
  getActive(): BridgeSession[] {
    return this.getAll().filter((s) => s.status === "active");
  }

  /**
   * Get a session by ID.
   */
  get(sessionId: string): BridgeSession | undefined {
    return this.getAll().find((s) => s.id === sessionId);
  }

  /**
   * Add a new session.
   */
  add(session: BridgeSession): void {
    const file = this.readFile();
    file.sessions.push(session);
    this.writeFile(file);
  }

  /**
   * Update a session's fields.
   */
  update(sessionId: string, updates: Partial<BridgeSession>): boolean {
    const file = this.readFile();
    const index = file.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) return false;

    const session = file.sessions[index];
    if (!session) return false;

    // Apply updates (merge)
    const updated = { ...session, ...updates, lastActivityAt: new Date().toISOString() };
    file.sessions[index] = updated;
    this.writeFile(file);
    return true;
  }

  /**
   * Remove a session.
   */
  remove(sessionId: string): boolean {
    const file = this.readFile();
    const before = file.sessions.length;
    file.sessions = file.sessions.filter((s) => s.id !== sessionId);
    if (file.sessions.length === before) return false;
    this.writeFile(file);
    return true;
  }

  /**
   * Mark a session as stopped.
   */
  markStopped(sessionId: string): boolean {
    return this.update(sessionId, { status: "stopped" });
  }

  /**
   * Mark a session as error with message.
   */
  markError(sessionId: string, error: string): boolean {
    return this.update(sessionId, { status: "error", lastError: error });
  }

  /**
   * Generate a unique session ID.
   */
  static generateId(): string {
    return `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Create a workspace fingerprint.
   * sha256(projectPath + gitRemoteUrl)
   */
  static createFingerprint(projectPath: string, gitRemoteUrl: string = ""): string {
    return createHash("sha256")
      .update(projectPath + gitRemoteUrl)
      .digest("hex")
      .slice(0, 16);
  }

  // ==========================================================================
  // File Operations (atomic writes, version + checksum)
  // ==========================================================================

  private readFile(): SessionRegistryFile {
    if (!existsSync(this.filePath)) {
      return { version: 0, checksum: "", sessions: [] };
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as SessionRegistryFile;

      // Validate checksum
      const expectedChecksum = this.computeChecksum(parsed.sessions, parsed.version);
      if (parsed.checksum && parsed.checksum !== expectedChecksum) {
        console.warn("[SessionRegistry] Checksum mismatch — file may be corrupted");
      }

      return parsed;
    } catch {
      console.warn("[SessionRegistry] Failed to read file, starting fresh");
      return { version: 0, checksum: "", sessions: [] };
    }
  }

  /**
   * Write file atomically: write to .tmp, then rename.
   */
  private writeFile(file: SessionRegistryFile): void {
    file.version += 1;
    file.checksum = this.computeChecksum(file.sessions, file.version);

    const tmpPath = this.filePath + ".tmp";
    const content = JSON.stringify(file, null, 2);

    writeFileSync(tmpPath, content, "utf-8");
    renameSync(tmpPath, this.filePath);
  }

  private computeChecksum(sessions: BridgeSession[], version: number): string {
    const data = JSON.stringify({ version, sessions });
    return createHash("sha256").update(data).digest("hex").slice(0, 16);
  }

  private ensureDirectory(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRegistry: SessionRegistry | undefined;

export function getSessionRegistry(): SessionRegistry {
  if (!globalRegistry) {
    globalRegistry = new SessionRegistry();
  }
  return globalRegistry;
}

export function resetSessionRegistry(): void {
  globalRegistry = undefined;
}
