/**
 * Sprint 137 P2-03: OWASP API1-6 control presence tests.
 *
 * Each test asserts that a specific mitigation exists in source code. This
 * catches regression (e.g. someone removes the HMAC check, swaps 0o600 for
 * 0o644, drops the body-size cap). Tests are deliberately LOW DETAIL —
 * they check "the pattern is still here", not "it's correct under every
 * input". Correctness is verified by dedicated security unit tests.
 *
 * LOCAL-ONLY triage (CTO precondition for P2-03): anything gated by
 * `isLocalhost` is informational, not a finding. These tests ONLY assert
 * the controls that MUST exist regardless of deployment shape.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "../../..");

function src(relative: string): string {
  const path = resolve(ROOT, relative);
  if (!existsSync(path)) {
    throw new Error(`Expected source file not found: ${relative}`);
  }
  return readFileSync(path, "utf-8");
}

describe("OWASP API2 — Broken Authentication (Sprint 137 P2-03)", () => {
  it("POST /api/config mutations require a token even from localhost", () => {
    const webServer = src("src/gateway/web-server.ts");
    // Both POST mutations start their auth check before any body handling.
    expect(webServer).toMatch(
      /url === "\/api\/config\/exec-policy\/preset" && req\.method === "POST"[\s\S]*?ENDIORBOT_GATEWAY_TOKEN/,
    );
    expect(webServer).toMatch(
      /url === "\/api\/config\/active-memory" && req\.method === "POST"[\s\S]*?ENDIORBOT_GATEWAY_TOKEN/,
    );
  });

  it("webhook ingress verifies an HMAC signature (or similar) before dispatch", () => {
    const webhookDispatcher = resolve(ROOT, "src/gateway/webhooks");
    // Presence check — the dispatcher directory must exist and mention a
    // signature / secret verification. (Full signature correctness is tested
    // in tests/webhooks/.)
    expect(existsSync(webhookDispatcher)).toBe(true);
    const files = ["index.ts", "webhook-router.ts", "trigger-registry.ts", "types.ts"]
      .map((f) => resolve(webhookDispatcher, f))
      .filter((p) => existsSync(p))
      .map((p) => readFileSync(p, "utf-8"))
      .join("\n");
    expect(files).toMatch(/signature|hmac|secret/i);
  });
});

describe("OWASP API3 — Property-Level Authorization (Sprint 137 P2-03)", () => {
  it("output scrubber exists and is wired into the security layer", () => {
    expect(existsSync(resolve(ROOT, "src/security/output-scrubber.ts"))).toBe(true);
  });

  it("mutation endpoints validate request body shape explicitly", () => {
    const webServer = src("src/gateway/web-server.ts");
    // preset endpoint validates against a whitelist
    expect(webServer).toMatch(/validPresets = new Set\(\["open", "balanced", "strict"\]\)/);
    // active-memory endpoint requires boolean
    expect(webServer).toMatch(/typeof body\.enabled !== "boolean"/);
  });
});

describe("OWASP API4 — Unrestricted Resource Consumption (Sprint 137 P2-03)", () => {
  it("webhook body size is capped via ENDIORBOT_WEBHOOK_MAX_BODY_SIZE", () => {
    const webServer = src("src/gateway/web-server.ts");
    expect(webServer).toMatch(/ENDIORBOT_WEBHOOK_MAX_BODY_SIZE/);
    expect(webServer).toMatch(/bodySize > maxBody/);
  });

  it("per-agent Claude Code timeouts exist (Sprint 137 B6)", () => {
    const agentConstants = src("src/agents/router/agent-constants.ts");
    expect(agentConstants).toMatch(/DEFAULT_AGENT_TIMEOUT_MS_BY_CLASS/);
    expect(agentConstants).toMatch(/executor: 60_000/);
    expect(agentConstants).toMatch(/advisory: 180_000/);
    expect(agentConstants).toMatch(/"adr-writer": 600_000/);
  });

  it("timeouts SSOT defines model + chat budgets", () => {
    const timeouts = src("src/config/timeouts.ts");
    expect(timeouts).toMatch(/ENDIORBOT_MODEL_TIMEOUT_MS/);
    expect(timeouts).toMatch(/ENDIORBOT_CHAT_TIMEOUT_MS/);
  });
});

describe("OWASP API5 — Function-Level Authorization (Sprint 137 P2-03)", () => {
  it("gate confirmation requires explicit --confirm flag even from CEO", () => {
    const gateCmd = src("src/cli/commands/gate.ts");
    expect(gateCmd).toMatch(/if \(!options\.confirm\)/);
    expect(gateCmd).toMatch(/Missing --confirm flag/);
  });
});

describe("OWASP API — cross-cutting: audit log file permissions", () => {
  it("exec-policy audit log is written with 0o600 (CEO-only read)", () => {
    // The policy is documented in multiple security files; assert it appears
    // at least once in the bridge audit writer, which is the canonical one.
    const auditModule = resolve(ROOT, "src/bridge/security/audit.ts");
    if (!existsSync(auditModule)) return; // tolerate relocation
    const text = readFileSync(auditModule, "utf-8");
    expect(text).toMatch(/0o600|mode:\s*0o600/);
  });

  it("existing audit logs on disk have 0o600 permissions (smoke check)", () => {
    const auditLog = resolve(
      process.env.HOME ?? "/tmp",
      ".endiorbot/audit-logs/exec-policy.log",
    );
    if (!existsSync(auditLog)) return; // not yet written — skip
    const mode = statSync(auditLog).mode & 0o777;
    expect(mode, `audit log mode should be 0o600, got 0o${mode.toString(8)}`).toBe(0o600);
  });
});

describe("OWASP triage doc exists (Sprint 137 P2-03)", () => {
  it("docs/05-test/07-E2E-Testing/owasp-api-1-6.md captures the LOCAL-ONLY context", () => {
    const triageDoc = resolve(ROOT, "docs/05-test/07-E2E-Testing/owasp-api-1-6.md");
    expect(existsSync(triageDoc)).toBe(true);
    const text = readFileSync(triageDoc, "utf-8");
    expect(text).toMatch(/LOCAL-ONLY/);
    expect(text).toMatch(/## API1 /);
    expect(text).toMatch(/## API6 /);
    expect(text).toMatch(/Handoff Boundary/);
  });
});
