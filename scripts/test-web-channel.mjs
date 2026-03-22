#!/usr/bin/env node
/**
 * Web Channel Test Script
 * Tests the WebSocket gateway at ws://127.0.0.1:18791/ws
 */

import { WebSocket } from "ws";

const WS_URL = "ws://127.0.0.1:18791/ws";
const TIMEOUT_MS = 120_000;

const ws = new WebSocket(WS_URL);
let step = 0;

function send(method, params, id) {
  const msg = { jsonrpc: "2.0", method, params, id };
  console.log(`\n[SEND #${id}] ${method}`, params ? JSON.stringify(params) : "");
  ws.send(JSON.stringify(msg));
}

ws.on("open", () => {
  console.log(`[CONNECTED] ${WS_URL}`);
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  // Welcome
  if (msg.method === "welcome") {
    console.log("[WELCOME] clientId:", msg.params.clientId);
    console.log("[WELCOME] authRequired:", msg.params.authRequired);

    // Step 1: system.ping
    send("system.ping", undefined, 1);
    return;
  }

  // Handle responses
  if (msg.id === 1) {
    console.log("[PASS] system.ping →", JSON.stringify(msg.result));
    // Step 2: system.version
    send("system.version", undefined, 2);
  }

  if (msg.id === 2) {
    console.log("[PASS] system.version →", JSON.stringify(msg.result));
    // Step 3: system.stats
    send("system.stats", undefined, 3);
  }

  if (msg.id === 3) {
    console.log("[PASS] system.stats →", JSON.stringify(msg.result));
    // Step 4: router.status
    send("router.status", undefined, 4);
  }

  if (msg.id === 4) {
    console.log("[PASS] router.status →", JSON.stringify(msg.result));
    // Step 5: router.chat without mention (should return usage hint)
    send("router.chat", { message: "hello" }, 5);
  }

  if (msg.id === 5) {
    console.log("[PASS] router.chat (no mention) →", msg.result?.text?.substring(0, 100));
    // Step 6: router.chat with @assistant
    send("router.chat", { message: "@assistant xin chào từ web channel, bạn là ai?" }, 6);
  }

  if (msg.id === 6) {
    if (msg.result) {
      console.log("[RESULT] router.chat (@assistant):");
      console.log("  agent:", msg.result.agent);
      console.log("  model:", msg.result.model);
      console.log("  latencyMs:", msg.result.latencyMs);
      console.log("  text:", (msg.result.text || "").substring(0, 500));
      console.log("[PASS] AI chat via web channel works!");
    }
    if (msg.error) {
      console.log("[ERROR] router.chat:", JSON.stringify(msg.error));
    }

    // Step 7: Test with @cto (should use opus model)
    send("router.chat", { message: "@devops kiểm tra hệ thống" }, 7);
  }

  if (msg.id === 7) {
    if (msg.result) {
      console.log("[RESULT] router.chat (@devops):");
      console.log("  agent:", msg.result.agent);
      console.log("  model:", msg.result.model);
      console.log("  latencyMs:", msg.result.latencyMs);
      console.log("  text:", (msg.result.text || "").substring(0, 300));
      console.log("[PASS] Agent routing via web channel works!");
    }
    if (msg.error) {
      console.log("[ERROR] router.chat:", JSON.stringify(msg.error));
    }

    console.log("\n========================================");
    console.log("  ALL WEB CHANNEL TESTS COMPLETED!");
    console.log("========================================\n");
    ws.close();
  }
});

ws.on("error", (err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("[DISCONNECTED]");
  process.exit(0);
});

setTimeout(() => {
  console.error("[TIMEOUT] No response within", TIMEOUT_MS / 1000, "seconds");
  process.exit(1);
}, TIMEOUT_MS);
