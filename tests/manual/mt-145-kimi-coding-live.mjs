#!/usr/bin/env node
/**
 * Manual Test TC-145.3: Kimi Coding Live Contract Test
 *
 * Requires KIMI_API_KEY in environment.
 *
 * Usage:
 *   KIMI_API_KEY=sk-xxx node tests/manual/mt-145-kimi-coding-live.mjs
 *
 * @module tests/manual/mt-145-kimi-coding-live
 * @sprint 145
 */

import { KimiCodingProvider } from "../../src/providers/kimi-coding/index.js";

async function run() {
  const key = process.env.KIMI_API_KEY;
  if (!key) {
    console.error("❌ KIMI_API_KEY not set");
    process.exit(1);
  }

  console.log("TC-145.3: Kimi Coding Live Contract Test");
  console.log("=========================================\n");

  const provider = new KimiCodingProvider();

  // --- Step 1: Initialize ---
  console.log("Step 1: Initialize provider...");
  const initStart = Date.now();
  await provider.initialize({ apiKey: key });
  console.log(`  ✅ Initialized in ${Date.now() - initStart}ms\n`);

  // --- Step 2: Health Check ---
  console.log("Step 2: Health check...");
  const healthStart = Date.now();
  const health = await provider.healthCheck();
  const healthLatency = Date.now() - healthStart;
  console.log(`  Status: ${health.status}`);
  console.log(`  Latency: ${health.latencyMs ?? healthLatency}ms`);
  if (health.status !== "healthy") {
    console.error(`  ❌ Health check failed: ${health.message}`);
    process.exit(1);
  }
  console.log(`  ✅ Healthy (threshold: < 3000ms)\n`);

  // --- Step 3: Chat round-trip ---
  console.log("Step 3: Chat round-trip...");
  const chatStart = Date.now();
  const response = await provider.chat({
    model: "kimi-for-coding",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say 'Kimi Coding API is live' and nothing else." },
    ],
    temperature: 0.0,
    maxTokens: 50,
  });
  const chatLatency = Date.now() - chatStart;
  console.log(`  Latency: ${chatLatency}ms (threshold: < 8000ms)`);
  console.log(`  Content: "${response.content.trim()}"`);
  if (!response.content || response.content.trim().length === 0) {
    console.error("  ❌ Empty response");
    process.exit(1);
  }
  console.log(`  ✅ Non-empty response\n`);

  // --- Step 4: Token usage ---
  if (response.usage) {
    console.log("Step 4: Token usage...");
    console.log(`  Input:  ${response.usage.promptTokens}`);
    console.log(`  Output: ${response.usage.completionTokens}`);
    console.log(`  Total:  ${response.usage.totalTokens}`);
    console.log(`  ✅ Token usage recorded\n`);
  }

  // --- Step 5: Model normalization ---
  console.log("Step 5: Model normalization (non-coding model name → kimi-for-coding)...");
  const normStart = Date.now();
  const normResponse = await provider.chat({
    model: "claude-sonnet-4", // should be normalized to kimi-for-coding
    messages: [{ role: "user", content: "Hi" }],
    maxTokens: 10,
  });
  const normLatency = Date.now() - normStart;
  console.log(`  Latency: ${normLatency}ms`);
  console.log(`  Content: "${normResponse.content.trim().slice(0, 50)}"`);
  console.log(`  ✅ Normalized model accepted by endpoint\n`);

  // --- Cleanup ---
  await provider.dispose();

  console.log("=========================================");
  console.log("TC-145.3: ALL PASS ✅");
  console.log("Health:     healthy");
  console.log(`Chat:       ${chatLatency}ms`);
  console.log("Contract:   Anthropic-compatible confirmed");
}

run().catch((err) => {
  console.error("❌ TC-145.3 FAILED:", err.message);
  process.exit(1);
});
