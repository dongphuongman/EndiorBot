/**
 * OTT Webhook Handler
 *
 * HTTP webhook endpoint handler for Telegram and Zalo OTT channels.
 * Integrates with WebGatewayServer to receive webhook events.
 *
 * Security:
 * - Telegram: validates X-Telegram-Bot-Api-Secret-Token header
 * - Zalo: verifies HMAC-SHA256 MAC signature
 * - Body size limit: 1MB
 * - Timestamp freshness check for Zalo (5-minute window)
 * - Rate limiting: 100 req/min per IP
 *
 * @module channels/ott/webhook-handler
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 76
 * @authority ADR-019 OTT Channel Enhancement
 * @sprint 76
 */

import type { IncomingMessage, ServerResponse } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { createLogger } from "../../logging/index.js";
import { envInt } from "../../config/timeouts.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Telegram Update structure (minimal for webhook routing).
 */
export interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
  };
}

/**
 * Zalo webhook event structure.
 */
export interface ZaloWebhookEvent {
  event_name: string;
  app_id: string;
  sender: { id: string };
  recipient: { id: string };
  message?: {
    msg_id: string;
    text?: string;
    attachments?: Array<{ type: string; payload: Record<string, unknown> }>;
  };
  timestamp: string;
}

/**
 * Handler function for Telegram updates.
 */
export type TelegramUpdateHandler = (update: TelegramWebhookUpdate) => Promise<void>;

/**
 * Handler function for Zalo webhook events.
 */
export type ZaloEventHandler = (event: ZaloWebhookEvent) => Promise<void>;

/**
 * Webhook handler configuration.
 */
export interface WebhookHandlerConfig {
  /** Secret token for Telegram webhook verification */
  telegramSecretToken?: string;
  /** Zalo webhook secret for MAC verification */
  zaloWebhookSecret?: string;
  /** Handler for Telegram updates */
  telegramHandler?: TelegramUpdateHandler;
  /** Handler for Zalo events */
  zaloHandler?: ZaloEventHandler;
  /** Max body size in bytes (default: 1MB) */
  maxBodySize?: number;
  /** Rate limit: max requests per minute per IP (default: 100) */
  rateLimitPerMinute?: number;
  /** Zalo timestamp freshness window in ms (default: 5 minutes) */
  zaloTimestampWindowMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_BODY_SIZE = envInt("ENDIORBOT_WEBHOOK_MAX_BODY_SIZE", 1024 * 1024); // 1MB
const DEFAULT_RATE_LIMIT = 100;
const DEFAULT_ZALO_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_CLEANUP_INTERVAL_MS = envInt("ENDIORBOT_RATE_LIMIT_CLEANUP_MS", 60_000); // 1 minute

/**
 * Timing-safe string comparison (CTO B1 fix).
 * Prevents timing oracle attacks on secret tokens and MAC signatures.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
}

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * OTT Webhook Handler.
 *
 * Handles HTTP webhook requests for Telegram and Zalo channels.
 * Designed to be wired into WebGatewayServer's HTTP routing.
 */
export class WebhookHandler {
  private config: Required<WebhookHandlerConfig>;
  private log = createLogger("webhook-handler");

  /** Rate limit tracking: IP → timestamps[] */
  private rateLimitMap: Map<string, number[]> = new Map();

  /** P0-1 fix: periodic rate limit cleanup interval */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: WebhookHandlerConfig) {
    this.config = {
      telegramSecretToken: config.telegramSecretToken ?? "",
      zaloWebhookSecret: config.zaloWebhookSecret ?? "",
      telegramHandler: config.telegramHandler ?? (async () => {}),
      zaloHandler: config.zaloHandler ?? (async () => {}),
      maxBodySize: config.maxBodySize ?? DEFAULT_MAX_BODY_SIZE,
      rateLimitPerMinute: config.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT,
      zaloTimestampWindowMs: config.zaloTimestampWindowMs ?? DEFAULT_ZALO_TIMESTAMP_WINDOW_MS,
    };

    // P0-3 fix: warn if webhook endpoints are exposed without secret validation
    if (!this.config.telegramSecretToken && config.telegramHandler) {
      this.log.warn("Telegram webhook handler configured WITHOUT secret token — all requests accepted");
    }
    if (!this.config.zaloWebhookSecret && config.zaloHandler) {
      this.log.warn("Zalo webhook handler configured WITHOUT webhook secret — MAC verification skipped");
    }

    // P0-1 fix: periodic cleanup to prevent rateLimitMap memory growth
    this.cleanupInterval = setInterval(() => this.cleanupRateLimits(), RATE_LIMIT_CLEANUP_INTERVAL_MS);
    // Unref so the interval doesn't keep the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Set Telegram update handler.
   */
  setTelegramHandler(handler: TelegramUpdateHandler): void {
    this.config.telegramHandler = handler;
  }

  /**
   * Set Zalo event handler.
   */
  setZaloHandler(handler: ZaloEventHandler): void {
    this.config.zaloHandler = handler;
  }

  /**
   * Handle incoming HTTP request for webhook endpoints.
   *
   * Routes:
   * - POST /webhook/telegram → Telegram webhook
   * - POST /webhook/zalo → Zalo webhook
   *
   * Returns true if the request was handled, false if not a webhook route.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url ?? "";

    if (!url.startsWith("/webhook/")) {
      return false;
    }

    // Only POST allowed for webhooks
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return true;
    }

    // Rate limiting
    const clientIp = req.socket.remoteAddress ?? "unknown";
    if (this.isRateLimited(clientIp)) {
      this.log.warn("Rate limited", { ip: clientIp, url });
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too Many Requests" }));
      return true;
    }

    // Route to handler
    if (url === "/webhook/telegram") {
      await this.handleTelegramWebhook(req, res);
      return true;
    }

    if (url === "/webhook/zalo") {
      await this.handleZaloWebhook(req, res);
      return true;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return true;
  }

  // ==========================================================================
  // Telegram Webhook
  // ==========================================================================

  /**
   * Handle Telegram webhook POST request.
   *
   * Validates:
   * 1. Secret token in X-Telegram-Bot-Api-Secret-Token header
   * 2. Body size limit
   * 3. Valid JSON
   */
  private async handleTelegramWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Validate secret token (timing-safe comparison — CTO B1 fix)
    if (this.config.telegramSecretToken) {
      const headerToken = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
      if (!headerToken || !safeEqual(headerToken, this.config.telegramSecretToken)) {
        this.log.warn("Invalid Telegram secret token", {
          ip: req.socket.remoteAddress,
        });
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }
    }

    // Parse body
    const bodyResult = await this.readBody(req);
    if (!bodyResult.ok) {
      res.writeHead(bodyResult.statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: bodyResult.error }));
      return;
    }

    // Parse JSON
    let update: TelegramWebhookUpdate;
    try {
      update = JSON.parse(bodyResult.body) as TelegramWebhookUpdate;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Respond 200 immediately (Telegram requires response within 60s)
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    // Process asynchronously
    try {
      await this.config.telegramHandler(update);
    } catch (error) {
      this.log.error("Telegram webhook handler error", {
        error: (error as Error).message,
        updateId: update.update_id,
      });
    }
  }

  // ==========================================================================
  // Zalo Webhook
  // ==========================================================================

  /**
   * Handle Zalo webhook POST request.
   *
   * Validates:
   * 1. MAC signature via HMAC-SHA256
   * 2. Timestamp freshness (5-minute window)
   * 3. Body size limit
   * 4. Valid JSON
   */
  private async handleZaloWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Parse body first (needed for MAC verification)
    const bodyResult = await this.readBody(req);
    if (!bodyResult.ok) {
      res.writeHead(bodyResult.statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: bodyResult.error }));
      return;
    }

    // Verify MAC signature
    if (this.config.zaloWebhookSecret) {
      const receivedMac = req.headers["x-zalooa-signature"] as string | undefined;
      if (!receivedMac) {
        this.log.warn("Missing Zalo MAC signature", {
          ip: req.socket.remoteAddress,
        });
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Missing signature" }));
        return;
      }

      const expectedMac = createHmac("sha256", this.config.zaloWebhookSecret)
        .update(bodyResult.body)
        .digest("hex");

      // Normalize: strip "mac=" prefix if present
      const normalizedMac = receivedMac.startsWith("mac=")
        ? receivedMac.slice(4)
        : receivedMac;

      // Timing-safe comparison — CTO B1 fix
      if (!safeEqual(normalizedMac, expectedMac)) {
        this.log.warn("Invalid Zalo MAC signature", {
          ip: req.socket.remoteAddress,
        });
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden: Invalid signature" }));
        return;
      }
    }

    // Parse JSON
    let event: ZaloWebhookEvent;
    try {
      event = JSON.parse(bodyResult.body) as ZaloWebhookEvent;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Timestamp freshness check (CTO W6: reject events older than 5 minutes)
    if (event.timestamp) {
      const eventTime = parseInt(event.timestamp, 10);
      const now = Date.now();
      if (Math.abs(now - eventTime) > this.config.zaloTimestampWindowMs) {
        this.log.warn("Zalo event too old (replay protection)", {
          eventTime,
          now,
          diffMs: Math.abs(now - eventTime),
        });
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Event too old" }));
        return;
      }
    }

    // Respond 200 immediately
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: 0, message: "success" }));

    // Process asynchronously
    try {
      await this.config.zaloHandler(event);
    } catch (error) {
      this.log.error("Zalo webhook handler error", {
        error: (error as Error).message,
        eventName: event.event_name,
      });
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Read request body with size limit.
   * CTO C2 FIX: Proper POST body parsing via chunk accumulation.
   */
  private readBody(req: IncomingMessage): Promise<{
    ok: true; body: string; statusCode?: never; error?: never;
  } | {
    ok: false; body?: never; statusCode: number; error: string;
  }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > this.config.maxBodySize) {
          req.destroy();
          resolve({ ok: false, statusCode: 413, error: "Payload Too Large" });
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve({ ok: true, body });
      });

      req.on("error", (err) => {
        resolve({ ok: false, statusCode: 400, error: err.message });
      });
    });
  }

  /**
   * Check if an IP is rate limited.
   * Simple sliding window: track timestamps, count within last minute.
   */
  private isRateLimited(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    let timestamps = this.rateLimitMap.get(ip);
    if (!timestamps) {
      timestamps = [];
      this.rateLimitMap.set(ip, timestamps);
    }

    // Remove expired entries
    const cutoff = now - windowMs;
    const valid = timestamps.filter((t) => t > cutoff);
    this.rateLimitMap.set(ip, valid);

    // Check limit
    if (valid.length >= this.config.rateLimitPerMinute) {
      return true;
    }

    // Record this request
    valid.push(now);
    return false;
  }

  /**
   * Dispose of resources (cleanup interval).
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up stale rate limit entries.
   * Called periodically to prevent rateLimitMap memory growth (P0-1 fix).
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    const windowMs = 60_000;
    const cutoff = now - windowMs;

    for (const [ip, timestamps] of this.rateLimitMap.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.rateLimitMap.delete(ip);
      } else {
        this.rateLimitMap.set(ip, valid);
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a WebhookHandler instance.
 */
export function createWebhookHandler(config: WebhookHandlerConfig): WebhookHandler {
  return new WebhookHandler(config);
}
