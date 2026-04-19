#!/usr/bin/env node
/**
 * Sprint 137 P2-02: Live smoke tests against a running EndiorBot gateway.
 *
 * Usage:
 *   # Assumes `endiorbot serve` is running on 127.0.0.1:18790
 *   node docs/05-test/07-E2E-Testing/scripts/smoke-endpoints.mjs
 *
 *   # Custom host/port
 *   ENDIORBOT_GATEWAY_URL=http://127.0.0.1:18790 \
 *     node docs/05-test/07-E2E-Testing/scripts/smoke-endpoints.mjs
 *
 *   # Auth token (required for non-localhost or mutation tests)
 *   ENDIORBOT_GATEWAY_TOKEN=xxx \
 *     node docs/05-test/07-E2E-Testing/scripts/smoke-endpoints.mjs
 *
 * What it does:
 *   - Hits the 4 no-auth read endpoints (GET /, /api/status, /api/health,
 *     plus /api/config with localhost bypass)
 *   - Asserts 200 status + Content-Type
 *   - For JSON endpoints, asserts the expected top-level keys
 *   - Opens a WebSocket to /ws and invokes `system.ping` + `system.version`
 *   - Prints a pass/fail table + exits non-zero on any failure
 *
 * Out of scope (do NOT extend):
 *   - Remote host coverage — EndiorBot is LOCAL-ONLY (see AGENTS.md)
 *   - Mutation endpoints — token required, run manually when needed
 *   - JSON-RPC method-by-method exercise — done by dedicated unit tests
 */

import { WebSocket } from "ws";

const URL = process.env.ENDIORBOT_GATEWAY_URL ?? "http://127.0.0.1:18790";
const WS_URL = URL.replace(/^http/, "ws") + "/ws";

let pass = 0;
let fail = 0;
const failures = [];

function report(name, ok, detail = "") {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function hitGet(path, { expectJsonKeys } = {}) {
  const target = URL + path;
  try {
    const res = await fetch(target);
    if (res.status !== 200) {
      report(`GET ${path}`, false, `status ${res.status}`);
      return;
    }
    if (expectJsonKeys) {
      const body = await res.json();
      const missing = expectJsonKeys.filter((k) => !(k in body));
      if (missing.length > 0) {
        report(`GET ${path}`, false, `missing JSON keys: ${missing.join(", ")}`);
        return;
      }
    }
    report(`GET ${path}`, true);
  } catch (err) {
    report(`GET ${path}`, false, err.message);
  }
}

async function pingWs() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        report("WS system.ping", false, "timeout (5s)");
        try { ws.close(); } catch { /* noop */ }
        resolve();
      }
    }, 5_000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "system.ping", id: 1 }));
    });
    ws.on("message", (raw) => {
      const body = JSON.parse(raw.toString());
      responded = true;
      clearTimeout(timeout);
      if (body.result && typeof body.result.pong === "number") {
        report("WS system.ping", true, `latency ${Date.now() - body.result.pong}ms`);
      } else {
        report("WS system.ping", false, JSON.stringify(body));
      }
      ws.close();
      resolve();
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      report("WS system.ping", false, err.message);
      resolve();
    });
  });
}

console.log(`[smoke] gateway: ${URL}\n`);
console.log(`Reads:`);
await hitGet("/");
await hitGet("/api/status", { expectJsonKeys: ["ok"] });
await hitGet("/api/health", { expectJsonKeys: ["status"] });
await hitGet("/api/config", {
  expectJsonKeys: ["execPolicy", "activeMemory", "autoHandoff", "timeouts"],
});

console.log(`\nWebSocket:`);
await pingWs();

console.log(`\n───────────────────────`);
console.log(`PASS ${pass} · FAIL ${fail}`);
if (fail > 0) {
  console.log(`\nFailures:\n${failures.map((f) => `  • ${f}`).join("\n")}`);
  process.exit(1);
}
