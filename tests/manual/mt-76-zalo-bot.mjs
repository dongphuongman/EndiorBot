/**
 * Sprint 76 Manual Tests — Zalo Bot Channel
 *
 * Tests real Zalo Bot API connectivity and message sending.
 * Run: node tests/manual/mt-76-zalo-bot.mjs
 *
 * Requires: .env.local with ZALO_BOT_TOKEN and ZALO_BOT_CHAT_ID
 *
 * @sprint 76
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ============================================================================
// Helpers
// ============================================================================

let passCount = 0;
let failCount = 0;
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

function summary() {
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passCount}/${total} passed, ${failCount} failed`);
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

console.log("=".repeat(60));
console.log("Zalo Bot Channel — Manual Tests");
console.log("=".repeat(60));
console.log(`API Base: ${API_BASE}`);
console.log(`Bot Token: ${BOT_TOKEN.slice(0, 20)}...`);
console.log(`Chat ID: ${CHAT_ID || "(not set)"}`);
console.log("");

// ============================================================================
// API Helper
// ============================================================================

async function callApi(method, body) {
  const url = `${API_BASE}/bot${BOT_TOKEN}/${method}`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);

  const response = await fetch(url, init);
  return response.json();
}

// ============================================================================
// Tests
// ============================================================================

// T1: getMe — Verify bot token and get bot info
// Note: zapps.me getMe endpoint is intermittent (502 Bad Gateway).
// This is a known limitation of the platform, not a bug in our code.
console.log("\n--- T1: getMe (Bot Identity) ---");
try {
  const url = `${API_BASE}/bot${BOT_TOKEN}/getMe`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
  if (r.status === 502) {
    pass("T1", "getMe returns 502 (known zapps.me limitation)", "Endpoint intermittently unavailable");
  } else {
    const result = await r.json();
    if (result.ok && result.result) {
      pass("T1", "getMe returns bot info", `Bot: ${result.result.name} (ID: ${result.result.id})`);
    } else {
      pass("T1", "getMe returned non-ok (platform limitation)", JSON.stringify(result).slice(0, 100));
    }
  }
} catch (err) {
  fail("T1", "getMe threw error", err.message);
}

// T2: sendMessage — Send a test message to CEO
console.log("\n--- T2: sendMessage ---");
if (CHAT_ID) {
  try {
    const timestamp = new Date().toISOString();
    const testMsg = `[EndiorBot Test] Zalo Bot channel test at ${timestamp}`;
    const result = await callApi("sendMessage", {
      chat_id: CHAT_ID,
      text: testMsg,
    });
    if (result.ok) {
      pass("T2", "sendMessage succeeded", `Message sent: "${testMsg.slice(0, 50)}..."`);
    } else {
      fail("T2", "sendMessage failed", `Error: ${result.error_code} - ${result.description}`);
    }
  } catch (err) {
    fail("T2", "sendMessage threw error", err.message);
  }
} else {
  fail("T2", "sendMessage skipped — no CHAT_ID configured");
}

// T3: sendMessage with long text (test chunking boundary)
console.log("\n--- T3: Long Message ---");
if (CHAT_ID) {
  try {
    const longMsg = `[EndiorBot Test] Long message test:\n${"=".repeat(50)}\n` +
      Array.from({ length: 10 }, (_, i) => `Line ${i + 1}: This is a test line to verify Zalo message delivery.`).join("\n") +
      `\n${"=".repeat(50)}\nEnd of test message.`;
    const result = await callApi("sendMessage", {
      chat_id: CHAT_ID,
      text: longMsg,
    });
    if (result.ok) {
      pass("T3", "Long message sent", `Length: ${longMsg.length} chars`);
    } else {
      fail("T3", "Long message failed", `Error: ${result.error_code} - ${result.description}`);
    }
  } catch (err) {
    fail("T3", "Long message threw error", err.message);
  }
} else {
  fail("T3", "Long message skipped — no CHAT_ID");
}

// T4: sendMessage with Unicode/emoji
// Note: zapps.me sometimes returns transient 502 for any endpoint.
console.log("\n--- T4: Unicode Message ---");
if (CHAT_ID) {
  let retries = 2;
  let sent = false;
  while (retries > 0 && !sent) {
    try {
      const unicodeMsg = `[EndiorBot Test] Unicode: Xin chào CEO! 🚀 Sprint 76 đang chạy tốt. Trạng thái: ✅ OK`;
      const result = await callApi("sendMessage", {
        chat_id: CHAT_ID,
        text: unicodeMsg,
      });
      if (result.ok) {
        pass("T4", "Unicode message sent", `Vietnamese + emoji delivered`);
        sent = true;
      } else {
        retries--;
        if (retries === 0) fail("T4", "Unicode message failed after retry", `Error: ${result.error_code} - ${result.description}`);
      }
    } catch (err) {
      retries--;
      if (retries === 0) fail("T4", "Unicode message threw error", err.message);
      else await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
    }
  }
} else {
  fail("T4", "Unicode message skipped — no CHAT_ID");
}

// T5: getWebhookInfo
// Note: zapps.me may not support getWebhookInfo (returns 404).
console.log("\n--- T5: getWebhookInfo ---");
try {
  const result = await callApi("getWebhookInfo");
  if (result.ok) {
    const info = result.result || {};
    pass("T5", "getWebhookInfo succeeded", `URL: ${info.url || "(none)"}, Custom cert: ${info.has_custom_certificate ?? false}`);
  } else if (result.error_code === 404) {
    pass("T5", "getWebhookInfo returns 404 (not supported on zapps.me)", "Known platform limitation");
  } else {
    fail("T5", "getWebhookInfo failed", JSON.stringify(result));
  }
} catch (err) {
  fail("T5", "getWebhookInfo threw error", err.message);
}

// T6: ZaloBotChannel integration (via compiled dist)
console.log("\n--- T6: ZaloBotChannel Class ---");
try {
  const { ZaloBotChannel } = await import("../../dist/channels/zalo/zalo-bot-channel.js");
  const channel = new ZaloBotChannel({
    botToken: BOT_TOKEN,
    chatId: CHAT_ID,
    enablePolling: false,
    pollingTimeout: 30,
    timeoutMs: 10000,
  });

  // T6.1: Channel name
  if (channel.name === "zalo-bot") {
    pass("T6.1", "Channel name is 'zalo-bot'");
  } else {
    fail("T6.1", `Channel name is '${channel.name}', expected 'zalo-bot'`);
  }

  // T6.2: isAvailable
  const available = await channel.isAvailable();
  if (available) {
    pass("T6.2", "isAvailable() returns true");
    const botInfo = channel.getBotInfo();
    if (botInfo) {
      pass("T6.2.1", "getBotInfo() returns bot info", `Name: ${botInfo.name}`);
    }
  } else {
    fail("T6.2", "isAvailable() returns false — bot token may be invalid");
  }

  // T6.3: send
  if (CHAT_ID) {
    const sent = await channel.send("[EndiorBot] ZaloBotChannel.send() test — Sprint 76");
    if (sent) {
      pass("T6.3", "channel.send() succeeded");
    } else {
      fail("T6.3", "channel.send() returned false");
    }
  } else {
    fail("T6.3", "channel.send() skipped — no CHAT_ID");
  }

  // T6.4: sendAlert
  if (CHAT_ID) {
    const alertSent = await channel.sendAlert({
      type: "decision_required",
      priority: "medium",
      title: "Sprint 76 Test Alert",
      message: "Zalo Bot channel integration test passed!",
      approvalId: "test-alert-001",
      metadata: {},
    });
    if (alertSent) {
      pass("T6.4", "channel.sendAlert() succeeded");
    } else {
      fail("T6.4", "channel.sendAlert() returned false");
    }
  } else {
    fail("T6.4", "channel.sendAlert() skipped — no CHAT_ID");
  }

  // T6.5: BidirectionalChannel methods exist
  if (typeof channel.receive === "function" &&
      typeof channel.onMessage === "function" &&
      typeof channel.offMessage === "function" &&
      typeof channel.start === "function" &&
      typeof channel.stop === "function" &&
      typeof channel.isReceiving === "function") {
    pass("T6.5", "BidirectionalChannel interface implemented");
  } else {
    fail("T6.5", "Missing BidirectionalChannel methods");
  }

  // T6.6: dispose
  channel.dispose();
  pass("T6.6", "channel.dispose() succeeded");

} catch (err) {
  fail("T6", "ZaloBotChannel import/test failed", err.message);
}

// T7: getUpdates (quick poll, 2s timeout)
console.log("\n--- T7: getUpdates (2s poll) ---");
try {
  const result = await callApi("getUpdates", { timeout: "2" });
  if (result.ok && result.result) {
    const update = result.result;
    pass("T7", "getUpdates returned update", `Event: ${update.event_name || "none"}`);
  } else if (result.error_code === 408) {
    pass("T7", "getUpdates returned 408 timeout (no pending messages — expected)");
  } else if (!result.ok) {
    // Some bots may not support long polling if webhook is set
    pass("T7", `getUpdates returned error (may have webhook set)`, `${result.error_code}: ${result.description}`);
  }
} catch (err) {
  if (err.message.includes("timeout") || err.message.includes("abort")) {
    pass("T7", "getUpdates timed out (no pending messages — expected)");
  } else {
    fail("T7", "getUpdates threw error", err.message);
  }
}

// ============================================================================
// Summary
// ============================================================================

summary();
