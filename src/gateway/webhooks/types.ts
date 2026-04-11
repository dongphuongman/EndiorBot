/**
 * Webhook System Types
 *
 * Core interfaces for the programmable webhook trigger system.
 * Used by TriggerRegistry and WebhookRouter.
 *
 * @module gateway/webhooks/types
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE — Sprint 134 Task 4a
 * @authority Sprint 134 Config + Webhook Plan
 */

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Function signature for a webhook trigger handler.
 * May be async or sync. Receives the parsed payload on each dispatch.
 */
export type TriggerHandler = (payload: WebhookPayload) => Promise<void> | void;

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * A registered trigger: name, handler function, and metadata.
 */
export interface WebhookTrigger {
  /** Unique trigger name — used as :triggerId in POST /api/webhooks/:triggerId. */
  name: string;
  /** Optional human-readable description. */
  description?: string;
  /** Handler invoked when a matching POST request arrives. */
  handler: TriggerHandler;
  /** Unix millisecond timestamp when the trigger was registered. */
  createdAt: number;
}

/**
 * The payload delivered to a trigger handler on dispatch.
 * Contains the parsed request body, a clean copy of headers, and request metadata.
 */
export interface WebhookPayload {
  /** The triggerId extracted from the URL path. */
  triggerId: string;
  /** Request body — parsed as JSON when possible, raw string otherwise. */
  body: unknown;
  /**
   * Incoming request headers.
   * Auth headers (x-webhook-secret, authorization) are stripped before forwarding.
   */
  headers: Record<string, string | string[] | undefined>;
  /** Unix millisecond timestamp of the request. */
  timestamp: number;
  /** UUID assigned to this request for tracing and correlation. */
  requestId: string;
}

/**
 * Configuration for WebhookRouter.
 */
export interface WebhookConfig {
  /**
   * Shared secret validated on every inbound request.
   * If omitted, read from ENDIORBOT_WEBHOOK_SECRET env var.
   * If neither is set, all requests are rejected with 401.
   */
  secret?: string;
  /**
   * Max requests per minute per triggerId (default: 10).
   * Env: ENDIORBOT_WEBHOOK_RATE_LIMIT
   */
  rateLimitPerMinute?: number;
  /**
   * Max request body size in bytes (default: 1 MB).
   * Env: ENDIORBOT_WEBHOOK_MAX_BODY_SIZE
   */
  maxBodySize?: number;
}

// ============================================================================
// Audit
// ============================================================================

/**
 * JSONL audit record written to ~/.endiorbot/audit-logs/webhooks.log.
 * One record per request, appended synchronously (appendFileSync).
 */
export interface WebhookAuditRecord {
  /** Unix millisecond timestamp of the event. */
  timestamp: number;
  /** Trigger name targeted by this request. */
  triggerId: string;
  /** Outcome status. */
  status:
    | "dispatched"
    | "rejected_auth"
    | "rejected_not_found"
    | "rejected_rate_limit"
    | "error";
  /** Client IP address. */
  ip: string;
  /** UUID for correlating with application logs. */
  requestId: string;
  /** Time from request receipt to HTTP response in milliseconds. */
  durationMs: number;
  /** Error message — present only when status is "error". */
  error?: string;
}