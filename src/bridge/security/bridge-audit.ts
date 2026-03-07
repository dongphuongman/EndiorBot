/**
 * Bridge Audit Logger
 *
 * Follows AuditLogger pattern (CTO C1): JSONL format, inv_* IDs, rotation.
 * Logs to ~/.endiorbot/bridge_event_log.jsonl
 *
 * @module bridge/security/bridge-audit
 * @version 1.0.0
 * @authority ADR-024, CTO C1
 * @stage 04 - BUILD (Sprint 82)
 */

import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { BridgeAuditEntry, BridgeAuditEventType, BridgeAuditActor } from "../types.js";

// ============================================================================
// Config
// ============================================================================

export interface BridgeAuditConfig {
  logPath: string;
  maxFileSize: number;
  maxBackups: number;
  consoleLog: boolean;
}

export const DEFAULT_BRIDGE_AUDIT_CONFIG: BridgeAuditConfig = {
  logPath: join(homedir(), ".endiorbot", "bridge_event_log.jsonl"),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5,
  consoleLog: false,
};

// ============================================================================
// Bridge Audit Logger
// ============================================================================

export class BridgeAuditLogger {
  private config: BridgeAuditConfig;

  constructor(config: Partial<BridgeAuditConfig> = {}) {
    this.config = { ...DEFAULT_BRIDGE_AUDIT_CONFIG, ...config };
    this.ensureLogDirectory();
  }

  /**
   * Log a bridge audit entry.
   * Follows AuditLogger pattern: JSONL, inv_* IDs.
   */
  log(params: {
    event: BridgeAuditEventType;
    actorId: string;
    actor: BridgeAuditActor;
    sessionId?: string;
    agentType?: string;
    details?: Record<string, unknown>;
  }): BridgeAuditEntry {
    const entry: BridgeAuditEntry = {
      ts: new Date().toISOString(),
      id: this.generateId(),
      event: params.event,
      actorId: params.actorId,
      actor: params.actor,
      details: params.details ?? {},
    };

    // Conditionally add optional fields (exactOptionalPropertyTypes)
    if (params.sessionId) entry.sessionId = params.sessionId;
    if (params.agentType) entry.agentType = params.agentType;

    this.writeEntry(entry);

    if (this.config.consoleLog) {
      console.log(`[BridgeAudit] ${entry.event} | ${entry.actorId} | ${entry.id}`);
    }

    return entry;
  }

  // ==========================================================================
  // File Operations (follows AuditLogger pattern)
  // ==========================================================================

  private writeEntry(entry: BridgeAuditEntry): void {
    try {
      this.rotateIfNeeded();
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(this.config.logPath, line, "utf-8");
    } catch {
      // Silent failure — don't break bridge operation for audit
    }
  }

  private ensureLogDirectory(): void {
    const dir = dirname(this.config.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.config.logPath)) return;

    try {
      const stats = statSync(this.config.logPath);
      if (stats.size < this.config.maxFileSize) return;

      for (let i = this.config.maxBackups - 1; i >= 1; i--) {
        const oldPath = `${this.config.logPath}.${i}`;
        const newPath = `${this.config.logPath}.${i + 1}`;
        if (existsSync(oldPath)) {
          renameSync(oldPath, newPath);
        }
      }

      renameSync(this.config.logPath, `${this.config.logPath}.1`);
    } catch {
      // Silent failure
    }
  }

  /**
   * Generate unique ID (follows inv_* convention from AuditLogger).
   */
  private generateId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getLogPath(): string {
    return this.config.logPath;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalBridgeAudit: BridgeAuditLogger | undefined;

export function getBridgeAuditLogger(config?: Partial<BridgeAuditConfig>): BridgeAuditLogger {
  if (!globalBridgeAudit) {
    globalBridgeAudit = new BridgeAuditLogger(config);
  }
  return globalBridgeAudit;
}

export function resetBridgeAuditLogger(): void {
  globalBridgeAudit = undefined;
}
