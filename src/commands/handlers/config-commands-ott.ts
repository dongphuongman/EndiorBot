/**
 * Config OTT Commands — Sprint 135 Task 2
 *
 * /config            → formatted summary of all configurable features
 * /config active-memory on|off → toggle Active Memory (2-step confirm, CPO-3)
 * /config auto-handoff on|off  → toggle auto-handoff (2-step confirm, CPO-3)
 *
 * Mutations persist to ~/.endiorbot/config.json (CPO-1).
 *
 * @module commands/handlers/config-commands-ott
 * @version 1.0.0
 * @date 2026-04-12
 * @status ACTIVE — Sprint 135
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "../command-dispatcher.js";
import { getPreset } from "../../security/exec-approvals/index.js";
import { TIMEOUTS } from "../../config/timeouts.js";
import { isFeatureEnabled } from "../../config/feature-flags.js";

// ============================================================================
// Config persistence (CPO-1: ~/.endiorbot/config.json)
// ============================================================================

const CONFIG_DIR = join(homedir(), ".endiorbot");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface PersistedConfig {
  activeMemoryEnabled?: boolean;
  autoHandoff?: boolean;
  [key: string]: unknown;
}

function loadPersistedConfig(): PersistedConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as PersistedConfig;
    }
  } catch { /* ignore parse errors, return empty */ }
  return {};
}

function savePersistedConfig(config: PersistedConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

// ============================================================================
// Confirm state (CPO-3: 2-step confirm for mutations)
// ============================================================================

const CONFIRM_TTL_MS = 30_000;

interface PendingConfigConfirm {
  action: string;
  value: boolean;
  timestamp: number;
}

const pendingConfirms = new Map<string, PendingConfigConfirm>();

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, val] of pendingConfirms) {
    if (now - val.timestamp > CONFIRM_TTL_MS) pendingConfirms.delete(key);
  }
}

// ============================================================================
// Show config
// ============================================================================

function handleConfigShow(): CommandResult {
  const preset = getPreset();
  const amEnabled = isFeatureEnabled("ACTIVE_MEMORY_ENABLED");
  const autoHandoff = process.env["ENDIORBOT_AUTO_HANDOFF"] === "true";

  const lines = [
    `⚙️ **EndiorBot Configuration**`,
    ``,
    `🛡️ **Exec-Policy Preset:** \`${preset}\``,
    `🧠 **Active Memory:** ${amEnabled ? "✅ ON" : "❌ OFF"}`,
    `🔄 **Auto-Handoff:** ${autoHandoff ? "✅ ON (power mode)" : "❌ OFF (CEO approval)"}`,
    ``,
    `⏱️ **Timeouts:**`,
    `  Model call: ${TIMEOUTS.modelCall / 1000}s`,
    `  Chat total: ${TIMEOUTS.chatTotal / 1000}s`,
    `  Claude Code: ${TIMEOUTS.claudeCode / 1000}s`,
    `  OpenAI: ${TIMEOUTS.openai / 1000}s`,
    ``,
    `Use \`/config active-memory on|off\` or \`/config auto-handoff on|off\` to toggle.`,
  ];

  return { success: true, response: lines.join("\n") };
}

// ============================================================================
// Toggle mutations
// ============================================================================

function handleToggle(
  feature: "active-memory" | "auto-handoff",
  valueStr: string | undefined,
  chatId: string,
): CommandResult {
  cleanExpired();

  // Check for YES confirmation
  if (valueStr?.toLowerCase() === "yes") {
    const pending = pendingConfirms.get(chatId);
    if (pending && pending.action === feature) {
      pendingConfirms.delete(chatId);

      // Apply mutation
      const config = loadPersistedConfig();
      if (feature === "active-memory") {
        config.activeMemoryEnabled = pending.value;
        process.env["ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED"] = pending.value ? "true" : "false";
      } else {
        config.autoHandoff = pending.value;
        process.env["ENDIORBOT_AUTO_HANDOFF"] = pending.value ? "true" : "false";
      }
      savePersistedConfig(config);

      const label = feature === "active-memory" ? "Active Memory" : "Auto-Handoff";
      return {
        success: true,
        response: `✅ **${label}** ${pending.value ? "enabled" : "disabled"} (persisted to config.json)`,
      };
    }
    return { success: false, response: `No pending ${feature} change. Use: /config ${feature} on|off` };
  }

  if (!valueStr || !["on", "off"].includes(valueStr.toLowerCase())) {
    return {
      success: false,
      response: `Usage: /config ${feature} on|off`,
    };
  }

  const newValue = valueStr.toLowerCase() === "on";
  const label = feature === "active-memory" ? "Active Memory" : "Auto-Handoff";
  const currentValue = feature === "active-memory"
    ? isFeatureEnabled("ACTIVE_MEMORY_ENABLED")
    : process.env["ENDIORBOT_AUTO_HANDOFF"] === "true";

  if (newValue === currentValue) {
    return { success: true, response: `${label} already ${newValue ? "ON" : "OFF"}. No change.` };
  }

  // CPO-3: 2-step confirm
  pendingConfirms.set(chatId, {
    action: feature,
    value: newValue,
    timestamp: Date.now(),
  });

  return {
    success: true,
    response: [
      `⚠️ ${newValue ? "Enable" : "Disable"} **${label}**?`,
      ``,
      `Reply \`/config ${feature} yes\` within 30s to confirm.`,
    ].join("\n"),
  };
}

// ============================================================================
// Main dispatcher
// ============================================================================

/**
 * Handle /config OTT commands.
 */
export function handleConfigOttCommand(
  args: string[],
  chatId: string,
): CommandResult {
  const sub = args[0]?.toLowerCase();

  if (!sub) return handleConfigShow();

  if (sub === "active-memory") {
    return handleToggle("active-memory", args[1], chatId);
  }

  if (sub === "auto-handoff") {
    return handleToggle("auto-handoff", args[1], chatId);
  }

  // Unknown subcommand → show help
  return handleConfigShow();
}
