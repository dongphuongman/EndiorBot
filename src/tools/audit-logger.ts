/**
 * AuditLogger - 100% audit logging for all tool calls
 * P0 requirement: Full audit trail with retention
 * Sprint 50 - Day 3-4 - Composio Integration Phase 1
 */

import fs from 'fs/promises';
import path from 'path';
import type { ToolAuditLog, ToolRisk } from './types.js';

export interface AuditLoggerConfig {
  /** Directory to store audit logs */
  logDir?: string;
  /** Maximum log file size in bytes before rotation */
  maxFileSizeBytes?: number;
  /** Log retention days (0 = no cleanup) */
  retentionDays?: number;
  /** Enable console output for debugging */
  consoleOutput?: boolean;
}

export class AuditLogger {
  private readonly config: Required<AuditLoggerConfig>;
  private currentLogFile: string;
  private buffer: ToolAuditLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private initialized = false;

  static readonly DEFAULT_LOG_DIR = '.endiorbot/audit-logs';
  static readonly DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  static readonly DEFAULT_RETENTION_DAYS = 90;
  static readonly BUFFER_FLUSH_INTERVAL = 5000; // 5 seconds

  constructor(config: AuditLoggerConfig = {}) {
    this.config = {
      logDir: config.logDir ?? AuditLogger.DEFAULT_LOG_DIR,
      maxFileSizeBytes: config.maxFileSizeBytes ?? AuditLogger.DEFAULT_MAX_FILE_SIZE,
      retentionDays: config.retentionDays ?? AuditLogger.DEFAULT_RETENTION_DAYS,
      consoleOutput: config.consoleOutput ?? false,
    };
    this.currentLogFile = this.getLogFileName();
  }

  /**
   * Initialize the audit logger (create directories, start flush timer)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure log directory exists
    await fs.mkdir(this.config.logDir, { recursive: true });

    // Start periodic flush
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error('[AuditLogger] Flush error:', error);
      });
    }, AuditLogger.BUFFER_FLUSH_INTERVAL);

    this.initialized = true;
  }

  /**
   * Log a tool execution event
   * Buffered for performance, flushed periodically
   */
  async log(entry: ToolAuditLog): Promise<void> {
    // Validate required fields
    if (!entry.id || !entry.principal_id || !entry.tool) {
      throw new Error('Audit log entry missing required fields: id, principal_id, tool');
    }

    // Add to buffer
    this.buffer.push(entry);

    // Console output for debugging
    if (this.config.consoleOutput) {
      const symbol = entry.status === 'success' ? '✓' : entry.status === 'denied' ? '✗' : '⏳';
      console.log(
        `[Audit] ${symbol} ${entry.tool} by ${entry.principal_id.slice(0, 8)}... ` +
        `(${entry.duration_ms}ms, ${entry.risk})`
      );
    }

    // Immediate flush for high-risk operations
    if (entry.risk === 'DESTRUCTIVE' || entry.risk === 'MONEY' || entry.risk === 'ADMIN') {
      await this.flush();
    }
  }

  /**
   * Convenience method to log a successful execution
   */
  async logSuccess(
    principal_id: string,
    tool: string,
    args_hash: string,
    connection_id: string,
    result_summary: string,
    duration_ms: number,
    risk: ToolRisk
  ): Promise<void> {
    await this.log({
      id: crypto.randomUUID(),
      principal_id,
      tool,
      args_hash,
      connection_id,
      result_summary,
      duration_ms,
      status: 'success',
      risk,
      timestamp: new Date(),
    });
  }

  /**
   * Convenience method to log a denied execution
   */
  async logDenied(
    principal_id: string,
    tool: string,
    args_hash: string,
    reason: string,
    risk: ToolRisk
  ): Promise<void> {
    await this.log({
      id: crypto.randomUUID(),
      principal_id,
      tool,
      args_hash,
      connection_id: '',
      result_summary: reason,
      duration_ms: 0,
      status: 'denied',
      risk,
      timestamp: new Date(),
    });
  }

  /**
   * Convenience method to log a pending approval
   */
  async logPendingApproval(
    principal_id: string,
    tool: string,
    args_hash: string,
    approval_token: string,
    risk: ToolRisk
  ): Promise<void> {
    await this.log({
      id: crypto.randomUUID(),
      principal_id,
      tool,
      args_hash,
      connection_id: '',
      result_summary: 'Awaiting approval',
      duration_ms: 0,
      status: 'pending_approval',
      risk,
      approval_token,
      timestamp: new Date(),
    });
  }

  /**
   * Convenience method to log a failed execution
   */
  async logFailure(
    principal_id: string,
    tool: string,
    args_hash: string,
    connection_id: string,
    error_code: string,
    error_message: string,
    duration_ms: number,
    risk: ToolRisk
  ): Promise<void> {
    await this.log({
      id: crypto.randomUUID(),
      principal_id,
      tool,
      args_hash,
      connection_id,
      result_summary: error_message,
      duration_ms,
      status: 'failure',
      risk,
      error_code,
      timestamp: new Date(),
    });
  }

  /**
   * Flush buffered logs to disk
   */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Check for rotation
    await this.maybeRotate();

    // Atomic buffer swap
    const toFlush = this.buffer;
    this.buffer = [];

    // Write to file
    const lines = toFlush.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    await fs.appendFile(this.currentLogFile, lines, 'utf-8');

    return toFlush.length;
  }

  /**
   * Query logs by principal_id (for compliance/debugging)
   */
  async queryByPrincipal(
    principal_id: string,
    options: { limit?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<ToolAuditLog[]> {
    const { limit = 100, startDate, endDate } = options;
    const results: ToolAuditLog[] = [];

    // Flush first to include recent entries
    await this.flush();

    // Read current log file
    try {
      const content = await fs.readFile(this.currentLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line) as ToolAuditLog;
        if (entry.principal_id !== principal_id) continue;

        const timestamp = new Date(entry.timestamp);
        if (startDate && timestamp < startDate) continue;
        if (endDate && timestamp > endDate) continue;

        results.push(entry);
        if (results.length >= limit) break;
      }
    } catch {
      // File doesn't exist yet, return empty
    }

    return results;
  }

  /**
   * Query logs by tool name
   */
  async queryByTool(
    tool: string,
    options: { limit?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<ToolAuditLog[]> {
    const { limit = 100, startDate, endDate } = options;
    const results: ToolAuditLog[] = [];

    await this.flush();

    try {
      const content = await fs.readFile(this.currentLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line) as ToolAuditLog;
        if (entry.tool !== tool) continue;

        const timestamp = new Date(entry.timestamp);
        if (startDate && timestamp < startDate) continue;
        if (endDate && timestamp > endDate) continue;

        results.push(entry);
        if (results.length >= limit) break;
      }
    } catch {
      // File doesn't exist yet
    }

    return results;
  }

  /**
   * Get statistics for a time period
   */
  async getStats(options: { startDate?: Date; endDate?: Date } = {}): Promise<{
    totalCalls: number;
    successCount: number;
    failureCount: number;
    deniedCount: number;
    pendingCount: number;
    avgDurationMs: number;
    byTool: Record<string, number>;
    byRisk: Record<ToolRisk, number>;
  }> {
    const { startDate, endDate } = options;

    await this.flush();

    const stats = {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      deniedCount: 0,
      pendingCount: 0,
      totalDuration: 0,
      byTool: {} as Record<string, number>,
      byRisk: {} as Record<ToolRisk, number>,
    };

    try {
      const content = await fs.readFile(this.currentLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line) as ToolAuditLog;
        const timestamp = new Date(entry.timestamp);

        if (startDate && timestamp < startDate) continue;
        if (endDate && timestamp > endDate) continue;

        stats.totalCalls++;
        stats.totalDuration += entry.duration_ms;

        // Count by status
        switch (entry.status) {
          case 'success':
            stats.successCount++;
            break;
          case 'failure':
            stats.failureCount++;
            break;
          case 'denied':
            stats.deniedCount++;
            break;
          case 'pending_approval':
            stats.pendingCount++;
            break;
        }

        // Count by tool
        stats.byTool[entry.tool] = (stats.byTool[entry.tool] ?? 0) + 1;

        // Count by risk
        stats.byRisk[entry.risk] = (stats.byRisk[entry.risk] ?? 0) + 1;
      }
    } catch {
      // File doesn't exist yet
    }

    return {
      totalCalls: stats.totalCalls,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
      deniedCount: stats.deniedCount,
      pendingCount: stats.pendingCount,
      avgDurationMs: stats.totalCalls > 0 ? stats.totalDuration / stats.totalCalls : 0,
      byTool: stats.byTool,
      byRisk: stats.byRisk,
    };
  }

  /**
   * Clean up old log files based on retention policy
   */
  async cleanup(): Promise<number> {
    if (this.config.retentionDays === 0) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    let deleted = 0;
    try {
      const files = await fs.readdir(this.config.logDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = path.join(this.config.logDir, file);
        const stat = await fs.stat(filePath);

        if (stat.mtime < cutoff) {
          await fs.unlink(filePath);
          deleted++;
        }
      }
    } catch {
      // Directory doesn't exist or other error
    }

    return deleted;
  }

  /**
   * Graceful shutdown - flush remaining buffer
   */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.config.logDir, `audit-${date}.jsonl`);
  }

  private async maybeRotate(): Promise<void> {
    try {
      // Check if we need a new date-based file
      const expectedFile = this.getLogFileName();
      if (expectedFile !== this.currentLogFile) {
        this.currentLogFile = expectedFile;
        return;
      }

      // Check file size
      const stat = await fs.stat(this.currentLogFile);
      if (stat.size >= this.config.maxFileSizeBytes) {
        // Rotate by adding timestamp
        const timestamp = Date.now();
        const rotatedName = this.currentLogFile.replace('.jsonl', `-${timestamp}.jsonl`);
        await fs.rename(this.currentLogFile, rotatedName);
        // currentLogFile stays the same, new writes go to fresh file
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }
}
