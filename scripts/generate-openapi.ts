#!/usr/bin/env tsx
/**
 * Sprint 137 P2-01: OpenAPI 3.0 spec generator for EndiorBot gateway.
 *
 * Enumerates:
 *   - HTTP REST endpoints from src/gateway/web-server.ts (path + method + auth rule)
 *   - WebSocket JSON-RPC methods from src/gateway/{server,web-server}.ts + methods/*.ts
 *   - Webhook endpoints from src/gateway/webhooks/
 *
 * OpenAPI 3.0 doesn't model JSON-RPC natively, so we:
 *   1. Document REST endpoints under `paths`
 *   2. Expose JSON-RPC methods under the vendor extension `x-jsonrpc-methods`
 *      with a pointer to `/ws` as the single entry point
 *
 * Output: docs/03-integrate/02-API-Specifications/openapi.json
 *
 * Usage:
 *   pnpm tsx scripts/generate-openapi.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const OUTPUT = resolve(ROOT, "docs/03-integrate/02-API-Specifications/openapi.json");

// ---------------------------------------------------------------------------
// 1. Collect JSON-RPC methods
// ---------------------------------------------------------------------------

interface JsonRpcMethod {
  method: string;
  file: string;
  domain: string;
  description?: string;
}

function collectJsonRpcMethods(): JsonRpcMethod[] {
  const sources = [
    resolve(ROOT, "src/gateway/server.ts"),
    resolve(ROOT, "src/gateway/web-server.ts"),
    ...readdirSync(resolve(ROOT, "src/gateway/methods"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => resolve(ROOT, "src/gateway/methods", f)),
  ];

  const re = /registerMethod\(\s*"([^"]+)"/g;
  const collected = new Map<string, JsonRpcMethod>();

  for (const file of sources) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const method = m[1]!;
      const domain = method.includes(".") ? method.split(".")[0]! : "system";
      // Only first-seen wins (dynamic bridge commands appear in a loop)
      if (!collected.has(method)) {
        collected.set(method, {
          method,
          file: basename(file),
          domain,
        });
      }
    }
  }

  // Sort by domain then method
  return [...collected.values()].sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    return a.method.localeCompare(b.method);
  });
}

// ---------------------------------------------------------------------------
// 2. REST endpoint catalog (manual — routes are declarative in web-server.ts)
// ---------------------------------------------------------------------------

interface RestEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  summary: string;
  description: string;
  auth: "none" | "localhost-only" | "gateway-token" | "webhook-secret";
  tags: string[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, Record<string, unknown>>;
}

const REST_ENDPOINTS: RestEndpoint[] = [
  {
    path: "/",
    method: "GET",
    summary: "Web UI (HTML)",
    description: "Serves the EndiorBot web UI index page. Returns HTML.",
    auth: "none",
    tags: ["web-ui"],
    responses: {
      "200": {
        description: "HTML page",
        content: { "text/html": { schema: { type: "string" } } },
      },
    },
  },
  {
    path: "/api/status",
    method: "GET",
    summary: "System status",
    description:
      "Returns gateway status plus Active Memory feature flag state. Lightweight; safe to poll.",
    auth: "none",
    tags: ["system"],
    responses: {
      "200": {
        description: "Status JSON",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                activeMemory: { type: "boolean" },
                uptime: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
  {
    path: "/api/health",
    method: "GET",
    summary: "Health check",
    description:
      "Aggregates component health (gateway, bus, providers). Used by /health checks and CI.",
    auth: "none",
    tags: ["system"],
    responses: {
      "200": {
        description: "Healthy",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok", "degraded"] },
                components: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
  },
  {
    path: "/api/config",
    method: "GET",
    summary: "System configuration summary",
    description:
      "Returns exec-policy preset, Active Memory + auto-handoff toggles, timeouts SSOT, webhook triggers. Localhost bypass auth; non-localhost requires GATEWAY_TOKEN.",
    auth: "localhost-only",
    tags: ["config"],
    responses: {
      "200": {
        description: "Config JSON",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                execPolicy: { type: "object" },
                activeMemory: { type: "object" },
                autoHandoff: { type: "object" },
                timeouts: { type: "object" },
                webhooks: { type: "object" },
              },
            },
          },
        },
      },
      "401": { description: "Unauthorized (non-localhost without token)" },
    },
  },
  {
    path: "/api/audit/{type}",
    method: "GET",
    summary: "Audit log tail",
    description:
      "Returns recent entries from an audit log. `type` must be one of: exec-policy, ssrf, webhooks. `limit` query param caps entries (max 100, default 10).",
    auth: "localhost-only",
    tags: ["config", "audit"],
    responses: {
      "200": {
        description: "Audit entries",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["exec-policy", "ssrf", "webhooks"] },
                entries: { type: "array", items: { type: "object" } },
                count: { type: "integer" },
              },
            },
          },
        },
      },
      "400": { description: "Unknown audit type" },
      "401": { description: "Unauthorized" },
    },
  },
  {
    path: "/api/config/exec-policy/preset",
    method: "POST",
    summary: "Change exec-policy preset",
    description:
      "Sets the active exec-policy preset. Requires GATEWAY_TOKEN on every request (no localhost bypass for mutations).",
    auth: "gateway-token",
    tags: ["config"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["preset"],
            properties: {
              preset: { type: "string", enum: ["open", "balanced", "strict"] },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Preset changed",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                old: { type: "string" },
                new: { type: "string" },
              },
            },
          },
        },
      },
      "400": { description: "Invalid preset or body" },
      "401": { description: "Unauthorized" },
    },
  },
  {
    path: "/api/config/active-memory",
    method: "POST",
    summary: "Toggle Active Memory feature flag",
    description:
      "Enables/disables the per-query context refresh hook at runtime. Requires GATEWAY_TOKEN.",
    auth: "gateway-token",
    tags: ["config"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["enabled"],
            properties: { enabled: { type: "boolean" } },
          },
        },
      },
    },
    responses: {
      "200": { description: "Toggle applied" },
      "400": { description: "Invalid body" },
      "401": { description: "Unauthorized" },
    },
  },
  {
    path: "/api/webhooks/{triggerId}",
    method: "POST",
    summary: "Webhook ingress (Sprint 134)",
    description:
      "Receives external webhook events. Payload is HMAC-verified against the registered trigger secret.",
    auth: "webhook-secret",
    tags: ["webhooks"],
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: { type: "object", additionalProperties: true } },
      },
    },
    responses: {
      "200": { description: "Accepted + dispatched" },
      "401": { description: "Invalid signature" },
      "413": { description: "Payload too large" },
      "404": { description: "Unknown triggerId" },
    },
  },
  {
    path: "/webhook/{subpath}",
    method: "POST",
    summary: "Legacy webhook handler",
    description:
      "Legacy webhook route (pre-Sprint 134). Delegates to the same dispatcher as /api/webhooks; kept for existing integrations.",
    auth: "webhook-secret",
    tags: ["webhooks", "deprecated"],
    responses: {
      "200": { description: "Accepted" },
      "404": { description: "No webhook handler configured" },
    },
  },
];

// ---------------------------------------------------------------------------
// 3. Assemble OpenAPI document
// ---------------------------------------------------------------------------

function buildOpenApi(jsonRpcMethods: JsonRpcMethod[]) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of REST_ENDPOINTS) {
    const operation: Record<string, unknown> = {
      summary: ep.summary,
      description: ep.description,
      tags: ep.tags,
      responses: ep.responses,
    };
    if (ep.requestBody) operation.requestBody = ep.requestBody;

    // Security: none means public; localhost-only means localhost bypass;
    // gateway-token + webhook-secret use named security schemes.
    if (ep.auth === "gateway-token") {
      operation.security = [{ GatewayToken: [] }];
    } else if (ep.auth === "webhook-secret") {
      operation.security = [{ WebhookSecret: [] }];
    } else if (ep.auth === "localhost-only") {
      operation.security = [{}, { GatewayToken: [] }];
      operation["x-localhost-bypass"] = true;
    }

    // Add path parameters for templated routes.
    const pathParams: Record<string, unknown>[] = [];
    const matches = ep.path.match(/\{([^}]+)\}/g) ?? [];
    for (const m of matches) {
      const name = m.slice(1, -1);
      pathParams.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
    if (ep.path === "/api/audit/{type}") {
      pathParams.push({
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 10 },
      });
    }
    if (pathParams.length > 0) operation.parameters = pathParams;

    if (!paths[ep.path]) paths[ep.path] = {};
    (paths[ep.path] as Record<string, unknown>)[ep.method.toLowerCase()] = operation;
  }

  const jsonRpcByDomain: Record<string, JsonRpcMethod[]> = {};
  for (const m of jsonRpcMethods) {
    (jsonRpcByDomain[m.domain] ||= []).push(m);
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "EndiorBot Gateway API",
      version: "0.1.0-beta.1",
      description:
        "EndiorBot's local gateway exposes a small HTTP REST surface (config, audit, webhooks, health) and a 47-method WebSocket JSON-RPC surface (agents, approvals, budget, chat, checkpoints, eval, optimizer, router, sessions, system).\n\n**Identity (LOCKED, LOCAL-ONLY):** This API serves the CEO's local MacBook only. Non-localhost access is gated by GATEWAY_TOKEN; remote / multi-user deployment is not in scope (see docs/08-collaborate/01-SDLC-Compliance/AGENTS.md → 'Handoff Boundary').\n\n**Generated:** automatically from src/gateway/ via `pnpm tsx scripts/generate-openapi.ts`. Do not edit by hand.",
      contact: {
        name: "EndiorBot",
        url: "https://github.com/anthropics/endiorbot",
      },
    },
    servers: [
      { url: "http://127.0.0.1:18790", description: "Local gateway (default)" },
    ],
    tags: [
      { name: "web-ui", description: "Web UI HTML/assets" },
      { name: "system", description: "Health, status, version, stats" },
      { name: "config", description: "Runtime configuration + feature flags" },
      { name: "audit", description: "Audit log readers" },
      { name: "webhooks", description: "External webhook ingress (Sprint 134)" },
    ],
    paths,
    components: {
      securitySchemes: {
        GatewayToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "opaque",
          description:
            "Bearer token read from `Authorization: Bearer <ENDIORBOT_GATEWAY_TOKEN>`. Required for mutations regardless of host; required for reads when gateway is bound to a non-localhost interface.",
        },
        WebhookSecret: {
          type: "apiKey",
          in: "header",
          name: "X-Webhook-Signature",
          description:
            "HMAC-SHA256 signature of the raw body, keyed with the trigger's registered secret. See src/gateway/webhooks/.",
        },
      },
    },
    "x-jsonrpc-endpoint": {
      ws: "ws://127.0.0.1:18790/ws",
      description:
        "All JSON-RPC methods below are invoked via a single WebSocket endpoint. Request/response shape follows JSON-RPC 2.0 (method, params, id).",
    },
    "x-jsonrpc-methods": jsonRpcByDomain,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const methods = collectJsonRpcMethods();
const doc = buildOpenApi(methods);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(doc, null, 2) + "\n", "utf-8");

const restCount = REST_ENDPOINTS.length;
const jsonRpcCount = methods.length;
console.log(
  `[openapi-gen] wrote ${OUTPUT}\n  ${restCount} REST endpoints, ${jsonRpcCount} JSON-RPC methods.`,
);
