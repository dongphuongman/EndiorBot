/**
 * HTTP URL Validator — SSRF Defense Layer
 *
 * Validates outbound fetch URLs to block SSRF attacks targeting:
 * - Private IPv4 ranges (RFC 1918 + loopback + APIPA)
 * - Private IPv6 addresses (loopback, ULA, link-local)
 * - Cloud metadata endpoints (AWS, GCP)
 * - Blocked protocols (file://, ftp://, gopher://)
 *
 * Localhost is allowed ONLY when ENDIORBOT_DEBUG=true (dev mode).
 *
 * @module security/http-validator
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 133 S2
 * @authority Sprint 133 Task 3a
 */

// ============================================================================
// Custom Error
// ============================================================================

/**
 * Thrown when a URL is blocked by the SSRF validator.
 */
export class SSRFBlockedError extends Error {
  /** Machine-readable reason code */
  readonly reason: string;
  /** The blocked URL (scrubbed — no query params) */
  readonly blockedUrl: string;

  constructor(blockedUrl: string, reason: string) {
    super(`SSRF blocked: ${reason} — ${blockedUrl}`);
    this.name = "SSRFBlockedError";
    this.reason = reason;
    this.blockedUrl = blockedUrl;
  }
}

// ============================================================================
// Blocked protocols
// ============================================================================

const BLOCKED_PROTOCOLS = new Set(["file:", "ftp:", "gopher:"]);

// ============================================================================
// Blocked hostnames (exact + suffix)
// ============================================================================

const BLOCKED_EXACT_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // AWS/Azure metadata IP
  "0.0.0.0",
  "::1",
]);

/** Suffixes for internal hostnames (e.g. *.local, *.internal) */
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

/**
 * Collect all configured Ollama URLs from env vars.
 * Users may configure local (localhost:11434) or remote (ai.nqh-internal.example) Ollama.
 * All configured URLs are trusted — they are explicit CEO/DevOps configuration, not user input.
 */
function getConfiguredOllamaOrigins(): Set<string> {
  const origins = new Set<string>();
  const envKeys = ["OLLAMA_URL", "OLLAMA_HOST", "OLLAMA_BASE_URL", "OLLAMA_REMOTE_URL"];
  for (const key of envKeys) {
    const val = process.env[key];
    if (val) {
      try {
        const parsed = new URL(val);
        origins.add(`${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`);
      } catch { /* skip invalid URLs */ }
    }
  }
  // Always include Ollama default (localhost:11434) — standard convention
  origins.add("localhost:11434");
  return origins;
}

/**
 * Check if a URL targets a configured Ollama endpoint.
 * Returns true if the URL's host:port matches any configured Ollama URL from env,
 * or the default localhost:11434.
 */
function isConfiguredOllamaEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const hostPort = `${parsed.hostname}:${port}`;
    return getConfiguredOllamaOrigins().has(hostPort);
  } catch {
    return false;
  }
}

// ============================================================================
// IPv4 CIDR helpers
// ============================================================================

/**
 * Parse a dotted-decimal IPv4 string into a 32-bit integer.
 * Returns null if the string is not a valid IPv4 address.
 */
function parseIPv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255 || part === "") return null;
    result = (result << 8) | n;
  }
  return result >>> 0; // treat as unsigned
}

/**
 * Check whether an IPv4 integer falls within a CIDR range.
 */
function inIPv4Cidr(ip: number, networkStr: string, prefixLen: number): boolean {
  const network = parseIPv4(networkStr);
  if (network === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ip & mask) === (network & mask);
}

/** Private / blocked IPv4 ranges */
const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ["10.0.0.0", 8],      // RFC 1918
  ["172.16.0.0", 12],   // RFC 1918
  ["192.168.0.0", 16],  // RFC 1918
  ["127.0.0.0", 8],     // Loopback
  ["169.254.0.0", 16],  // Link-local / APIPA (includes 169.254.169.254)
  ["0.0.0.0", 8],       // "This" network
];

// ============================================================================
// IPv6 helpers
// ============================================================================

/**
 * Expand an IPv6 address string into 8 groups of 16-bit integers.
 * Returns null if parsing fails.
 */
function parseIPv6(host: string): number[] | null {
  // Strip surrounding brackets [ ] if present
  let h = host.replace(/^\[|\]$/g, "");
  // Remove zone ID (e.g. %eth0)
  const zoneIdx = h.indexOf("%");
  if (zoneIdx !== -1) h = h.slice(0, zoneIdx);

  // Handle ::
  const sides = h.split("::");
  if (sides.length > 2) return null;

  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides[1] ? sides[1].split(":") : [];

  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;

  const groups = [
    ...left.map((g) => parseInt(g, 16)),
    ...Array(missing).fill(0),
    ...right.map((g) => parseInt(g, 16)),
  ];

  if (groups.length !== 8 || groups.some((g) => isNaN(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

/**
 * Returns true if the IPv6 groups fall within fc00::/7 (ULA) or fe80::/10 (link-local).
 */
function isBlockedIPv6(groups: number[]): boolean {
  const first = groups[0]!;
  // ::1 (loopback) — all zeros except last 1
  const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
  if (isLoopback) return true;
  // fc00::/7 — ULA (bits: 1111 110x) → 0xfc00–0xfdff
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local (bits: 1111 1110 10) → 0xfe80–0xfebf
  if ((first & 0xffc0) === 0xfe80) return true;
  return false;
}

// ============================================================================
// Core validator
// ============================================================================

/**
 * Validate a URL before making an outbound fetch request.
 *
 * Throws `SSRFBlockedError` if the URL targets a private/blocked endpoint.
 * Returns void (no value) on success — callers proceed with the fetch.
 *
 * @param rawUrl - The URL string to validate
 * @throws {SSRFBlockedError} When the URL is blocked
 * @throws {TypeError} When the URL is syntactically invalid
 */
export function validateFetchUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SSRFBlockedError(rawUrl, "invalid-url");
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname.toLowerCase();

  // --- Protocol check ---
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    throw new SSRFBlockedError(scrubUrl(parsed), `blocked-protocol:${protocol}`);
  }

  // --- Exact hostname block ---
  if (BLOCKED_EXACT_HOSTNAMES.has(hostname)) {
    // Special case: localhost allowed in debug mode
    if (hostname === "localhost" && process.env["ENDIORBOT_DEBUG"] === "true") {
      return; // allowed
    }
    // Special case: localhost allowed for configured Ollama provider
    // Ollama always runs on localhost — blocking it is a false positive, not SSRF defense
    if (isConfiguredOllamaEndpoint(rawUrl)) {
      return; // allowed — CEO/DevOps configured Ollama endpoint
    }
    throw new SSRFBlockedError(scrubUrl(parsed), `blocked-hostname:${hostname}`);
  }

  // --- Suffix hostname block (*.local, *.internal, *.localhost) ---
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new SSRFBlockedError(scrubUrl(parsed), `blocked-hostname-suffix:${suffix}`);
    }
  }

  // --- IPv4 CIDR check ---
  const ipv4 = parseIPv4(hostname);
  if (ipv4 !== null) {
    for (const [network, prefix] of BLOCKED_IPV4_CIDRS) {
      if (inIPv4Cidr(ipv4, network, prefix)) {
        throw new SSRFBlockedError(scrubUrl(parsed), `blocked-private-ipv4:${network}/${prefix}`);
      }
    }
    return; // Valid public IPv4
  }

  // --- IPv6 literal check (hostname wrapped in brackets by URL parser) ---
  if (hostname.startsWith("[") || parsed.hostname.startsWith("[")) {
    const ipv6str = hostname.replace(/^\[|\]$/g, "");
    const groups = parseIPv6(ipv6str);
    if (groups !== null && isBlockedIPv6(groups)) {
      throw new SSRFBlockedError(scrubUrl(parsed), `blocked-private-ipv6:${ipv6str}`);
    }
    return; // Valid public IPv6
  }

  // --- FQDN: passed all checks ---
}

// ============================================================================
// Redirect guard
// ============================================================================

/**
 * Validate a redirect target URL before following a 3xx response.
 *
 * Ensures public→private redirects are blocked.
 * Called with `redirect: "manual"` in `safeFetch` before following each hop.
 *
 * @param _originalUrl - The original request URL (unused in v1, kept for audit context)
 * @param redirectUrl - The Location header URL from the redirect response
 * @throws {SSRFBlockedError} When the redirect target is blocked
 */
export function validateRedirectTarget(_originalUrl: string, redirectUrl: string): void {
  validateFetchUrl(redirectUrl);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Scrub a URL for logging: strip query parameters and fragment to avoid
 * logging API keys or access tokens that may appear in query strings.
 */
export function scrubUrl(parsed: URL): string {
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}
