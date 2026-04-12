/**
 * Webhook Router Tests — Sprint 135 T6 (CTO Sprint 134 finding)
 *
 * Covers: auth reject, rate limit, dispatch success, not-found, audit.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TriggerRegistry } from "../../../src/gateway/webhooks/trigger-registry.js";
import { handleWebhookRequest } from "../../../src/gateway/webhooks/webhook-router.js";

describe("handleWebhookRequest", () => {
  let registry: TriggerRegistry;
  const SECRET = "test-secret-abc123";
  const validHeaders = { "x-webhook-secret": SECRET } as Record<string, string | string[] | undefined>;

  beforeEach(() => {
    registry = new TriggerRegistry();
  });

  it("rejects with 401 when secret is missing", async () => {
    registry.register("test", async () => {});
    const result = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "test",
      { data: "hello" },
      {},
      "127.0.0.1",
    );
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Unauthorized");
  });

  it("rejects with 401 when secret is wrong", async () => {
    registry.register("test", async () => {});
    const result = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "test",
      {},
      { "x-webhook-secret": "wrong-secret" },
      "127.0.0.1",
    );
    expect(result.status).toBe(401);
  });

  it("rejects with 404 when trigger not found", async () => {
    const result = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "nonexistent",
      {},
      validHeaders,
      "127.0.0.1",
    );
    expect(result.status).toBe(404);
    expect(result.body.error).toContain("not found");
  });

  it("dispatches successfully with valid auth + existing trigger", async () => {
    let dispatched = false;
    registry.register("test-trigger", async (payload) => {
      dispatched = true;
      expect(payload.triggerId).toBe("test-trigger");
      expect(payload.body).toEqual({ msg: "hello" });
    });

    const result = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "test-trigger",
      { msg: "hello" },
      validHeaders,
      "10.0.0.1",
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(dispatched).toBe(true);
  });

  it("strips auth headers before forwarding to handler", async () => {
    let receivedHeaders: Record<string, unknown> = {};
    registry.register("header-test", async (payload) => {
      receivedHeaders = payload.headers;
    });

    await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "header-test",
      {},
      { "x-webhook-secret": SECRET, "authorization": "Bearer token123", "content-type": "application/json" },
      "127.0.0.1",
    );

    expect(receivedHeaders["x-webhook-secret"]).toBeUndefined();
    expect(receivedHeaders["authorization"]).toBeUndefined();
    expect(receivedHeaders["content-type"]).toBe("application/json");
  });

  it("returns 429 when rate limit exceeded", async () => {
    registry.register("rate-test", async () => {});
    const config = { secret: SECRET, rateLimitPerMinute: 2 };

    // First 2 should pass
    const r1 = await handleWebhookRequest({ registry, config }, "rate-test", {}, validHeaders, "127.0.0.1");
    const r2 = await handleWebhookRequest({ registry, config }, "rate-test", {}, validHeaders, "127.0.0.1");
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // 3rd should be rate limited
    const r3 = await handleWebhookRequest({ registry, config }, "rate-test", {}, validHeaders, "127.0.0.1");
    expect(r3.status).toBe(429);
    expect(r3.body.error).toContain("Rate limit");
  });

  it("returns 500 when handler throws", async () => {
    registry.register("error-trigger", async () => {
      throw new Error("handler failed");
    });

    const result = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "error-trigger",
      {},
      validHeaders,
      "127.0.0.1",
    );

    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Internal error");
  });

  it("includes requestId in all responses", async () => {
    registry.register("id-test", async () => {});

    const success = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "id-test",
      {},
      validHeaders,
      "127.0.0.1",
    );
    expect(success.body.requestId).toBeDefined();
    expect(typeof success.body.requestId).toBe("string");

    const notFound = await handleWebhookRequest(
      { registry, config: { secret: SECRET } },
      "missing",
      {},
      validHeaders,
      "127.0.0.1",
    );
    expect(notFound.body.requestId).toBeDefined();
  });

  it("rejects all requests when no secret configured (fail-closed)", async () => {
    registry.register("no-secret", async () => {});
    const result = await handleWebhookRequest(
      { registry, config: { secret: "" } },
      "no-secret",
      {},
      {},
      "127.0.0.1",
    );
    expect(result.status).toBe(401);
  });
});

describe("TriggerRegistry", () => {
  it("registers and dispatches triggers", async () => {
    const registry = new TriggerRegistry();
    let called = false;
    registry.register("my-trigger", async () => { called = true; }, "Test trigger");

    expect(registry.has("my-trigger")).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.list()[0]!.name).toBe("my-trigger");
    expect(registry.list()[0]!.description).toBe("Test trigger");

    await registry.dispatch("my-trigger", {
      triggerId: "my-trigger",
      body: {},
      headers: {},
      timestamp: Date.now(),
      requestId: "test-123",
    });
    expect(called).toBe(true);
  });

  it("throws on dispatch to unknown trigger", async () => {
    const registry = new TriggerRegistry();
    await expect(registry.dispatch("unknown", {
      triggerId: "unknown",
      body: {},
      headers: {},
      timestamp: Date.now(),
      requestId: "test",
    })).rejects.toThrow("not found");
  });

  it("unregisters triggers", () => {
    const registry = new TriggerRegistry();
    registry.register("temp", async () => {});
    expect(registry.has("temp")).toBe(true);
    expect(registry.unregister("temp")).toBe(true);
    expect(registry.has("temp")).toBe(false);
    expect(registry.unregister("temp")).toBe(false);
  });
});
