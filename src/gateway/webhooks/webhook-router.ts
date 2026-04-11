/**
 * Webhook Router
 *
 * HTTP handler for POST /api/webhooks/:triggerId.
 * Auth via ENDIORBOT_WEBHOOK_SECRET, rate limiting, audit logging.
 *
 * @module gateway/webhooks/webhook-router
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE — Sprint 134 Task 4
 */

import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { envInt } from "../../config/timeouts.js";
import { TriggerRegistry } from "./trigger-registry.js";
import type { WebhookConfig, WebhookPayload, WebhookAuditRecord } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RATE_LIMIT = envInt("ENDIORBOT_WEBHOOK_RATE_LIMIT", 10);
const AUDIT_LOG_PATH = join(homedir(), ".endiorbot", "audit-logs", "webhooks.log");

// ============================================================================
// Rate limiter (per-trigger, sliding window)
// ============================================================================

const rateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(triggerId: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateCounts.get(triggerId);
  if (!entry || now >= entry.resetAt) {
    rateCounts.set(triggerId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ============================================================================
// Audit logger
// ============================================================================

function writeAudit(record: WebhookAuditRecord): void {
  try {
    const dir = join(homedir(), ".endiorbot", "audit-logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(record) + "\n", { encoding: "utf-8", mode: 0o600 });
  } catch {
    // Best-effort audit — don't crash the request
  }
}

// ============================================================================
// Auth
// ============================================================================

function validateSecret(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided, "utf-8");
    const b = Buffer.from(expected, "utf-8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ============================================================================
// Router
// ============================================================================

export interface WebhookRouterDeps {
  registry: TriggerRegistry;
  config?: WebhookConfig;
}

/**
 * Handle an incoming webhook request.
 * Call this from the gateway server for POST /api/webhooks/:triggerId.
 */
export async function handleWebhookRequest(
  deps: WebhookRouterDeps,
  triggerId: string,
  body: unknown,
  headers: Record<string, string | string[] | undefined>,
  clientIp: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startTime = Date.now();
  const requestId = randomUUID();
  const config = deps.config ?? {};

  const secret = config.secret ?? process.env["ENDIORBOT_WEBHOOK_SECRET"] ?? "";
  const rateLimit = config.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT;

  // Auth check
  const providedSecret = typeof headers["x-webhook-secret"] === "string"
    ? headers["x-webhook-secret"]
    : undefined;

  if (!validateSecret(providedSecret, secret)) {
    writeAudit({
      timestamp: Date.now(),
      triggerId,
      status: "rejected_auth",
      ip: clientIp,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { status: 401, body: { error: "Unauthorized", requestId } };
  }

  // Trigger exists?
  if (!deps.registry.has(triggerId)) {
    writeAudit({
      timestamp: Date.now(),
      triggerId,
      status: "rejected_not_found",
      ip: clientIp,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { status: 404, body: { error: `Trigger "${triggerId}" not found`, requestId } };
  }

  // Rate limit
  if (!checkRateLimit(triggerId, rateLimit)) {
    writeAudit({
      timestamp: Date.now(),
      triggerId,
      status: "rejected_rate_limit",
      ip: clientIp,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { status: 429, body: { error: "Rate limit exceeded", requestId } };
  }

  // Dispatch
  const payload: WebhookPayload = {
    triggerId,
    body,
    headers: { ...headers },
    timestamp: Date.now(),
    requestId,
  };

  // Strip auth headers before forwarding
  delete payload.headers["x-webhook-secret"];
  delete payload.headers["authorization"];

  try {
    await deps.registry.dispatch(triggerId, payload);
    writeAudit({
      timestamp: Date.now(),
      triggerId,
      status: "dispatched",
      ip: clientIp,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { status: 200, body: { ok: true, requestId } };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    writeAudit({
      timestamp: Date.now(),
      triggerId,
      status: "error",
      ip: clientIp,
      requestId,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });
    return { status: 500, body: { error: "Internal error", requestId } };
  }
}
