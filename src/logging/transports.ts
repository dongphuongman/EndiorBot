/**
 * EndiorBot Log Transports
 *
 * Output transports for writing log entries.
 * Supports console and file with rotation.
 *
 * @module logging/transports
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 33 Day 8-9
 * @authority ADR-001 Multi-Model Orchestrator
 * @pillar 2 - Sprint Governance
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import fs from "node:fs";
import path from "node:path";
import type { LogLevel } from "./logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Transport interface for log output.
 */
export interface Transport {
  /** Write a formatted log message */
  write(level: LogLevel, message: string): void;
  /** Flush pending writes */
  flush?(): Promise<void>;
  /** Close the transport */
  close?(): Promise<void>;
}

/**
 * Console transport options.
 */
export interface ConsoleTransportOptions {
  /** Use stderr for errors and warnings */
  useStderr?: boolean;
}

/**
 * File transport options.
 */
export interface FileTransportOptions {
  /** File path for log output */
  path: string;
  /** Maximum file size before rotation (e.g., "10MB") */
  maxSize?: string;
  /** Maximum number of rotated files to keep */
  maxFiles?: number;
  /** Append to existing file */
  append?: boolean;
}

// ============================================================================
// Console Transport
// ============================================================================

/**
 * Console transport that writes to stdout/stderr.
 */
export class ConsoleTransport implements Transport {
  private readonly useStderr: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    this.useStderr = options.useStderr ?? true;
  }

  write(level: LogLevel, message: string): void {
    const output = message + "\n";

    if (this.useStderr && (level === "error" || level === "warn")) {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }

  async flush(): Promise<void> {
    // Console doesn't need flushing
  }

  async close(): Promise<void> {
    // Console doesn't need closing
  }
}

// ============================================================================
// File Transport
// ============================================================================

/**
 * File transport with rotation support.
 */
export class FileTransport implements Transport {
  private readonly filePath: string;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private writeStream: fs.WriteStream | undefined;
  private currentSize: number = 0;
  private pendingWrites: string[] = [];
  private isWriting: boolean = false;

  constructor(options: FileTransportOptions) {
    this.filePath = path.resolve(options.path);
    this.maxSize = parseSize(options.maxSize ?? "10MB");
    this.maxFiles = options.maxFiles ?? 5;

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize file
    this.initStream(options.append ?? true);
  }

  /**
   * Initialize or reinitialize the write stream.
   */
  private initStream(append: boolean): void {
    const flags = append ? "a" : "w";

    this.writeStream = fs.createWriteStream(this.filePath, { flags });

    // Get current file size if appending
    if (append && fs.existsSync(this.filePath)) {
      try {
        const stats = fs.statSync(this.filePath);
        this.currentSize = stats.size;
      } catch {
        this.currentSize = 0;
      }
    } else {
      this.currentSize = 0;
    }
  }

  write(_level: LogLevel, message: string): void {
    // Queue the message (level is already included in formatted message)
    this.pendingWrites.push(message + "\n");

    // Process queue if not already writing
    if (!this.isWriting) {
      this.processQueue();
    }
  }

  /**
   * Process pending writes.
   */
  private processQueue(): void {
    if (this.pendingWrites.length === 0) {
      this.isWriting = false;
      return;
    }

    this.isWriting = true;

    const message = this.pendingWrites.shift();
    if (!message || !this.writeStream) {
      this.isWriting = false;
      return;
    }

    // Check if rotation is needed
    const messageSize = Buffer.byteLength(message, "utf8");
    if (this.currentSize + messageSize > this.maxSize) {
      this.rotate();
    }

    // Write the message
    this.writeStream.write(message, (err) => {
      if (err) {
        console.error("Failed to write to log file:", err);
      } else {
        this.currentSize += messageSize;
      }

      // Process next in queue
      setImmediate(() => this.processQueue());
    });
  }

  /**
   * Rotate log files.
   */
  private rotate(): void {
    // Close current stream
    if (this.writeStream) {
      this.writeStream.end();
    }

    // Rotate existing files
    for (let i = this.maxFiles - 1; i >= 0; i--) {
      const current = i === 0 ? this.filePath : `${this.filePath}.${i}`;
      const next = `${this.filePath}.${i + 1}`;

      if (fs.existsSync(current)) {
        if (i === this.maxFiles - 1) {
          // Delete oldest file
          try {
            fs.unlinkSync(current);
          } catch {
            // Ignore deletion errors
          }
        } else {
          // Rename to next number
          try {
            fs.renameSync(current, next);
          } catch {
            // Ignore rename errors
          }
        }
      }
    }

    // Reinitialize stream
    this.initStream(false);
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        // Wait for pending writes
        const checkPending = (): void => {
          if (this.pendingWrites.length === 0 && !this.isWriting) {
            resolve();
          } else {
            setImmediate(checkPending);
          }
        };
        checkPending();
      } else {
        resolve();
      }
    });
  }

  async close(): Promise<void> {
    await this.flush();

    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => {
          this.writeStream = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse size string to bytes.
 *
 * @param size - Size string (e.g., "10MB", "1GB", "500KB")
 * @returns Size in bytes
 */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) {
    return 10 * 1024 * 1024; // Default 10MB
  }

  const value = parseFloat(match[1] ?? "10");
  const unit = (match[2] ?? "MB").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  return Math.floor(value * (multipliers[unit] ?? 1024 * 1024));
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a console transport.
 */
export function createConsoleTransport(options?: ConsoleTransportOptions): Transport {
  return new ConsoleTransport(options);
}

/**
 * Create a file transport.
 */
export function createFileTransport(options: FileTransportOptions): Transport {
  return new FileTransport(options);
}

/**
 * Create transports from configuration.
 */
export function createTransports(config: {
  console?: boolean | ConsoleTransportOptions;
  file?: FileTransportOptions;
}): Transport[] {
  const transports: Transport[] = [];

  // Console transport
  if (config.console !== false) {
    const consoleOptions = typeof config.console === "object" ? config.console : undefined;
    transports.push(new ConsoleTransport(consoleOptions));
  }

  // File transport
  if (config.file) {
    transports.push(new FileTransport(config.file));
  }

  return transports;
}
