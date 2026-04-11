/**
 * Safe Fetch — Centralized SSRF-Protected HTTP Client
 *
 * Single enforcement point for all outbound fetch calls in EndiorBot.
 * Validates each URL (+ redirect hops) before delegating to native fetch().
 *
 * On block: logs to ~/.endiorbot/audit-logs/ssrf-blocks.log (JSONL, rotated)
 * and re-throws the SSRFBlockedError so the caller can handle it.
 *
 * SDK-internal fetch paths (e.g. @anthropic-ai/sdk) are OUT OF SCOPE — we
 * can only wrap bare fetch() calls that EndiorBot code controls.
 *
 * @module security/safe-fetch
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 133 S2
 * @authority Sprint 133 Task 3c + 3d
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { SSRFBlockedError, validateFetchUrl, validateRedirectTarget } from "./http-validator.js";

// ============================================================================
// Audit log constants (mirrors exec-approvals/audit.ts pattern)
// ============================================================================

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATIONS = 5;
const MAX_REDIRECT_HOPS = 10;

// ============================================================================
// Audit log types
// ============================================================================

/**
 * SSRF block audit record written to ssrf-blocks.log (JSONL).
 */
export interface SSRFAuditRecord {
  timestamp: string;
  /** URL with query params stripped */
  url: string;
  /** Machine-readable block reason */
  reason: string;
  /** Provider name if determinable from call context */
  provider?: string;
  /** Session ID if available */
  session_id?: string;
}

// ============================================================================
// Audit log path
// ============================================================================

/**
 * Get the path to the SSRF audit log.
 */
export function getSSRFAuditLogPath(): string {
  const base = process.env["ENDIORBOT_STATE_DIR"] ?? join(homedir(), ".endiorbot");
  return join(base, "audit-logs", "ssrf-blocks.log");
}

// ============================================================================
// Rotation (mirrors exec-approvals/audit.ts)
// ============================================================================

function rotateIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) return;
  try {
    const stats = statSync(logPath);
    if (stats.size < MAX_LOG_SIZE_BYTES) return;
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      if (existsSync(from)) renameSync(from, to);
    }
    renameSync(logPath, `${logPath}.1`);
  } catch {
    // Best-effort; do not crash on rotation failure
  }
}

// ============================================================================
// Audit write
// ============================================================================

/**
 * Write a SSRF block event to the audit log.
 */
export function writeSSRFAuditRecord(record: SSRFAuditRecord): void {
  const logPath = getSSRFAuditLogPath();
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  rotateIfNeeded(logPath);
  const line = JSON.stringify(record) + "\n";
  appendFileSync(logPath, line, "utf-8");
}

// ============================================================================
// safeFetch
// ============================================================================

/**
 * Context passed to `safeFetch` for richer audit logging.
 */
export interface SafeFetchContext {
  /** Provider name for audit (e.g. "openai", "anthropic") */
  provider?: string;
  /** Session ID for audit */
  session_id?: string;
}

/**
 * Centralized SSRF-protected fetch wrapper.
 *
 * Drop-in replacement for the native `fetch()` in all EndiorBot provider code.
 * Validates the initial URL and each redirect hop before proceeding.
 *
 * @param url - The request URL (string or URL object)
 * @param init - Standard RequestInit options
 * @param ctx - Optional audit context (provider, session_id)
 * @throws {SSRFBlockedError} If the URL (or a redirect target) is blocked
 */
export async function safeFetch(
  url: string | URL,
  init?: RequestInit,
  ctx?: SafeFetchContext,
): Promise<Response> {
  const urlStr = String(url);

  // Validate the initial URL
  try {
    validateFetchUrl(urlStr);
  } catch (err) {
    if (err instanceof SSRFBlockedError) {
      writeSSRFAuditRecord(buildAuditRecord(err, ctx));
      throw err;
    }
    throw err;
  }

  // Use redirect:"manual" to intercept and validate each hop
  const effectiveInit: RequestInit = {
    ...init,
    redirect: "manual",
  };

  let currentUrl = urlStr;
  let hops = 0;

  while (hops <= MAX_REDIRECT_HOPS) {
    const response = await fetch(currentUrl, effectiveInit);

    // If not a redirect, return the response (restore expected redirect behavior
    // by re-fetching with redirect:follow if the caller did not set manual)
    if (!isRedirect(response.status)) {
      // If the original caller wanted redirect:follow (default) and we got a
      // final response, return it directly — the loop already followed manually.
      return response;
    }

    // Extract redirect target
    const location = response.headers.get("location");
    if (!location) {
      // No Location header — return the redirect response as-is
      return response;
    }

    // Resolve relative redirects against the current URL
    let redirectUrl: string;
    try {
      redirectUrl = new URL(location, currentUrl).toString();
    } catch {
      // Invalid Location header — block it
      const blockErr = new SSRFBlockedError(location, "invalid-redirect-location");
      writeSSRFAuditRecord(buildAuditRecord(blockErr, ctx));
      throw blockErr;
    }

    // Validate the redirect target
    try {
      validateRedirectTarget(currentUrl, redirectUrl);
    } catch (err) {
      if (err instanceof SSRFBlockedError) {
        writeSSRFAuditRecord(buildAuditRecord(err, ctx));
        throw err;
      }
      throw err;
    }

    currentUrl = redirectUrl;
    hops++;

    // On redirect, subsequent requests should be GET with no body (standard behavior
    // for 301/302/303; 307/308 preserve method but we simplify to GET for safety).
    // exactOptionalPropertyTypes: delete body rather than setting to undefined.
    effectiveInit.method = "GET";
    delete (effectiveInit as Record<string, unknown>)["body"];
  }

  const maxHopErr = new SSRFBlockedError(currentUrl, "too-many-redirects");
  writeSSRFAuditRecord(buildAuditRecord(maxHopErr, ctx));
  throw maxHopErr;
}

// ============================================================================
// Helpers
// ============================================================================

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 307 || status === 308;
}

function buildAuditRecord(err: SSRFBlockedError, ctx?: SafeFetchContext): SSRFAuditRecord {
  const record: SSRFAuditRecord = {
    timestamp: new Date().toISOString(),
    url: err.blockedUrl,
    reason: err.reason,
  };
  if (ctx?.provider) record.provider = ctx.provider;
  if (ctx?.session_id) record.session_id = ctx.session_id;
  return record;
}
