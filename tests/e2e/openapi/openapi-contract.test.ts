/**
 * Sprint 137 P2-02: OpenAPI ↔ source contract tests.
 *
 * Asserts the generated `docs/03-integrate/02-API-Specifications/openapi.json`
 * stays in sync with the actual gateway source:
 *   - Every `registerMethod("<name>")` in src/gateway/**.ts appears in
 *     `x-jsonrpc-methods` (grouped by domain prefix).
 *   - Every JSON-RPC method documented in the spec still exists in source.
 *   - Every REST endpoint in the spec has a matching handler in
 *     src/gateway/web-server.ts (by path and method).
 *
 * If this test fails, run `pnpm tsx scripts/generate-openapi.ts` to refresh
 * the spec or update the source + regenerate.
 *
 * This is a PURE DRIFT DETECTOR — it does NOT spin up the gateway. Live
 * smoke tests are in tests/e2e/openapi/openapi-smoke.test.ts (env-gated).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "../../..");

const SPEC_PATH = resolve(ROOT, "docs/03-integrate/02-API-Specifications/openapi.json");

type OpenApiDoc = {
  paths: Record<string, Record<string, unknown>>;
  "x-jsonrpc-methods": Record<string, Array<{ method: string; domain: string }>>;
};

function loadSpec(): OpenApiDoc {
  const raw = readFileSync(SPEC_PATH, "utf-8");
  return JSON.parse(raw) as OpenApiDoc;
}

function collectRegisteredMethods(): Set<string> {
  const files = [
    resolve(ROOT, "src/gateway/server.ts"),
    resolve(ROOT, "src/gateway/web-server.ts"),
    ...readdirSync(resolve(ROOT, "src/gateway/methods"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => resolve(ROOT, "src/gateway/methods", f)),
  ];
  const re = /registerMethod\(\s*"([^"]+)"/g;
  const collected = new Set<string>();
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) collected.add(m[1]!);
  }
  return collected;
}

function collectSpecMethods(spec: OpenApiDoc): Set<string> {
  const out = new Set<string>();
  for (const domain of Object.values(spec["x-jsonrpc-methods"])) {
    for (const entry of domain) out.add(entry.method);
  }
  return out;
}

function collectRestRoutes(): Set<string> {
  const webServer = readFileSync(resolve(ROOT, "src/gateway/web-server.ts"), "utf-8");
  const routes = new Set<string>();

  const addIf = (predicate: boolean, key: string) => {
    if (predicate) routes.add(key);
  };

  // The web-server hard-codes routes via url === "…" / url.startsWith(…) / regex.
  // We detect each by a stable string literal.
  addIf(webServer.includes('url === "/" || url === "/index.html"'), "GET /");
  addIf(webServer.includes('url === "/api/status"'), "GET /api/status");
  addIf(webServer.includes('url === "/api/health"'), "GET /api/health");
  addIf(webServer.includes('url === "/api/config" && req.method === "GET"'), "GET /api/config");
  addIf(
    webServer.includes('url === "/api/config/exec-policy/preset" && req.method === "POST"'),
    "POST /api/config/exec-policy/preset",
  );
  addIf(
    webServer.includes('url === "/api/config/active-memory" && req.method === "POST"'),
    "POST /api/config/active-memory",
  );
  addIf(webServer.includes("/^\\/api\\/audit\\/([a-z-]+)/"), "GET /api/audit/{type}");
  addIf(webServer.includes("/^\\/api\\/webhooks\\/([a-zA-Z0-9_-]+)$/"), "POST /api/webhooks/{triggerId}");
  addIf(webServer.includes('url.startsWith("/webhook/")'), "POST /webhook/{subpath}");

  return routes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAPI spec parity with source (Sprint 137 P2-02)", () => {
  it("spec file exists and parses", () => {
    expect(existsSync(SPEC_PATH)).toBe(true);
    const spec = loadSpec();
    expect(spec.openapi).toMatch(/^3\./);
  });

  it("every registerMethod() in source is documented in x-jsonrpc-methods", () => {
    const spec = loadSpec();
    const registered = collectRegisteredMethods();
    const documented = collectSpecMethods(spec);

    const missing: string[] = [];
    for (const m of registered) {
      if (!documented.has(m)) missing.push(m);
    }
    expect(
      missing,
      `The spec is missing these JSON-RPC methods: ${missing.join(", ")}. ` +
        `Run \`pnpm tsx scripts/generate-openapi.ts\` to refresh.`,
    ).toEqual([]);
  });

  it("every documented JSON-RPC method still has a registerMethod() in source", () => {
    const spec = loadSpec();
    const registered = collectRegisteredMethods();
    const documented = collectSpecMethods(spec);

    const stale: string[] = [];
    for (const m of documented) {
      if (!registered.has(m)) stale.push(m);
    }
    expect(
      stale,
      `The spec documents JSON-RPC methods that no longer exist in source: ${stale.join(", ")}. ` +
        `Run \`pnpm tsx scripts/generate-openapi.ts\` to refresh.`,
    ).toEqual([]);
  });

  it("every REST endpoint documented in the spec has a matching handler in web-server.ts", () => {
    const spec = loadSpec();
    const sourceRoutes = collectRestRoutes();

    const missing: string[] = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        const key = `${method.toUpperCase()} ${path}`;
        if (!sourceRoutes.has(key)) missing.push(key);
      }
    }
    expect(
      missing,
      `The spec documents REST endpoints that were not located in web-server.ts: ${missing.join(", ")}. ` +
        `Either update the source detection in tests/e2e/openapi/openapi-contract.test.ts or the spec.`,
    ).toEqual([]);
  });

  it("coverage — at least 90% of registered JSON-RPC methods are documented", () => {
    const spec = loadSpec();
    const registered = collectRegisteredMethods();
    const documented = collectSpecMethods(spec);
    let covered = 0;
    for (const m of registered) if (documented.has(m)) covered += 1;
    const ratio = covered / registered.size;
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });

  it("coverage — at least 90% of REST endpoints in web-server.ts are in the spec", () => {
    const spec = loadSpec();
    const sourceRoutes = collectRestRoutes();
    const documentedRoutes = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        documentedRoutes.add(`${method.toUpperCase()} ${path}`);
      }
    }
    let covered = 0;
    for (const r of sourceRoutes) if (documentedRoutes.has(r)) covered += 1;
    const ratio = covered / sourceRoutes.size;
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });
});
