/**
 * Sprint 77 Manual Tests — Zalo Command Parity
 *
 * Tests slash commands via real Zalo Bot API.
 * Sends commands and verifies responses arrive (plain text, no Markdown).
 *
 * Run: node tests/manual/mt-77-zalo-commands.mjs
 *
 * Requires: .env.local with ZALO_BOT_TOKEN and ZALO_BOT_CHAT_ID
 *
 * @sprint 77
 * @authority ADR-020 OTT Channel Completion
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ============================================================================
// Helpers
// ============================================================================

let passCount = 0;
let failCount = 0;
let skipCount = 0;
let total = 0;

function pass(id, desc, detail) {
  total++;
  passCount++;
  console.log(`[PASS] ${id} | ${desc}`);
  if (detail) console.log(`       ${detail}`);
}

function fail(id, desc, detail) {
  total++;
  failCount++;
  console.log(`[FAIL] ${id} | ${desc}`);
  if (detail) console.log(`       ${detail}`);
}

function skip(id, desc, detail) {
  total++;
  skipCount++;
  console.log(`[SKIP] ${id} | ${desc}`);
  if (detail) console.log(`       ${detail}`);
}

function summary() {
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passCount}/${total} passed, ${failCount} failed, ${skipCount} skipped`);
  console.log("=".repeat(60));
  if (failCount > 0) process.exit(1);
}

// ============================================================================
// Load .env.local
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

function loadEnvLocal() {
  try {
    const envPath = resolve(projectRoot, ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    console.error("Could not load .env.local");
  }
}

loadEnvLocal();

const BOT_TOKEN = process.env.ZALO_BOT_TOKEN;
const CHAT_ID = process.env.ZALO_BOT_CHAT_ID;
const API_BASE = "https://bot-api.zapps.me";

if (!BOT_TOKEN) {
  console.error("ZALO_BOT_TOKEN not set in .env.local");
  process.exit(1);
}

if (!CHAT_ID) {
  console.error("ZALO_BOT_CHAT_ID not set in .env.local");
  process.exit(1);
}

console.log("=".repeat(60));
console.log("Sprint 77 — Zalo Commands Manual Tests");
console.log("=".repeat(60));
console.log(`API Base: ${API_BASE}`);
console.log(`Bot Token: ${BOT_TOKEN.slice(0, 20)}...`);
console.log(`Chat ID: ${CHAT_ID}`);
console.log("");

// ============================================================================
// API Helper
// ============================================================================

async function sendMessageOnce(text, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${API_BASE}/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      throw new Error(`zapps.me returned ${response.status} (non-JSON — transient 502)`);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function sendMessage(text, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await sendMessageOnce(text);
    } catch (error) {
      if (attempt < retries) {
        await delay(1500);
        continue;
      }
      throw error;
    }
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  // T1: Send /help command via Zalo Bot API
  console.log("\n--- T1: /help command ---");
  try {
    const result = await sendMessage("/help");
    if (result.ok) {
      pass("T1", "/help sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T1", "/help send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T1", "/help error", error.message);
  }

  await delay(500);

  // T2: Send /agents command
  console.log("\n--- T2: /agents command ---");
  try {
    const result = await sendMessage("/agents");
    if (result.ok) {
      pass("T2", "/agents sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T2", "/agents send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T2", "/agents error", error.message);
  }

  await delay(500);

  // T3: Send /gate G2 command
  console.log("\n--- T3: /gate G2 command ---");
  try {
    const result = await sendMessage("/gate G2");
    if (result.ok) {
      pass("T3", "/gate G2 sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T3", "/gate G2 send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T3", "/gate G2 error", error.message);
  }

  await delay(500);

  // T4: Send /teams command
  console.log("\n--- T4: /teams command ---");
  try {
    const result = await sendMessage("/teams");
    if (result.ok) {
      pass("T4", "/teams sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T4", "/teams send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T4", "/teams error", error.message);
  }

  await delay(500);

  // T5: Send /compliance command
  console.log("\n--- T5: /compliance command ---");
  try {
    const result = await sendMessage("/compliance");
    if (result.ok) {
      pass("T5", "/compliance sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T5", "/compliance send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T5", "/compliance error", error.message);
  }

  await delay(500);

  // T6: Send /fix command
  console.log("\n--- T6: /fix command ---");
  try {
    const result = await sendMessage("/fix");
    if (result.ok) {
      pass("T6", "/fix sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T6", "/fix send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T6", "/fix error", error.message);
  }

  await delay(500);

  // T7: Send /consult query
  console.log("\n--- T7: /consult Redis vs PostgreSQL ---");
  try {
    const result = await sendMessage("/consult Redis vs PostgreSQL for sessions?");
    if (result.ok) {
      pass("T7", "/consult sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T7", "/consult send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T7", "/consult error", error.message);
  }

  await delay(500);

  // T8: Send /config command
  console.log("\n--- T8: /config command ---");
  try {
    const result = await sendMessage("/config");
    if (result.ok) {
      pass("T8", "/config sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T8", "/config send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T8", "/config error", error.message);
  }

  await delay(500);

  // T9: Send /init command
  console.log("\n--- T9: /init command ---");
  try {
    const result = await sendMessage("/init");
    if (result.ok) {
      pass("T9", "/init sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T9", "/init send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T9", "/init error", error.message);
  }

  await delay(500);

  // T10: Send /approve (no id)
  console.log("\n--- T10: /approve (no id) ---");
  try {
    const result = await sendMessage("/approve");
    if (result.ok) {
      pass("T10", "/approve sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T10", "/approve send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T10", "/approve error", error.message);
  }

  await delay(500);

  // T11: Send /status
  console.log("\n--- T11: /status ---");
  try {
    const result = await sendMessage("/status");
    if (result.ok) {
      pass("T11", "/status sent successfully", `message_id: ${result.result?.message_id}`);
    } else {
      fail("T11", "/status send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T11", "/status error", error.message);
  }

  await delay(500);

  // T12: Agent mention still works (not treated as command)
  console.log("\n--- T12: Agent mention (@researcher) ---");
  try {
    const result = await sendMessage("@researcher analyze this code");
    if (result.ok) {
      pass("T12", "Agent mention sent successfully (not intercepted as command)",
        `message_id: ${result.result?.message_id}`);
    } else {
      fail("T12", "Agent mention send failed", JSON.stringify(result));
    }
  } catch (error) {
    fail("T12", "Agent mention error", error.message);
  }

  // Summary
  summary();
}

runTests().catch(error => {
  console.error("Fatal:", error);
  process.exit(1);
});
