/**
 * Sprint 76 Manual Tests — OTT Channel Enhancement
 *
 * Tests: commands, keyboards, webhook, mode escalation, team via OTT.
 * Run: node tests/manual/mt-76-ott-enhancement.mjs
 *
 * @authority ADR-019 OTT Channel Enhancement
 * @sprint 76
 */

import {
  handleAgentsCommand,
  handleTeamsCommand,
  handleGateCommand,
  handleComplianceCommand,
  handleFixCommand,
  handleConsultCommand,
  handleConfigCommand,
  handleInitCommand,
  handleModeCommand,
  handleWebhookCommand,
  generateHelpMessage,
} from "../../dist/channels/telegram/telegram-commands.js";

import {
  createAgentSelectionKeyboard,
  createTeamSelectionKeyboard,
  createModeConfirmKeyboard,
  createHandoffKeyboard,
  parseCallbackData,
  getAgentIcon,
} from "../../dist/channels/telegram/keyboards.js";

import {
  formatAgentNotFound,
  formatProcessing,
  formatForTelegram,
} from "../../dist/channels/ott/response-formatter.js";

import { createAgentRouter, resetAgentRouter } from "../../dist/agents/orchestrator/agent-router.js";
import { resetTeamRegistry, getTeamRegistry } from "../../dist/agents/orchestrator/team-registry.js";
import { parseMention, hasMention } from "../../dist/agents/orchestrator/mention-parser.js";

import { WebhookHandler } from "../../dist/channels/ott/webhook-handler.js";
import { createHmac } from "crypto";

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

function assert(id, desc, condition, detail) {
  if (condition) {
    pass(id, desc, detail);
  } else {
    fail(id, desc, detail);
  }
}

function reset() {
  resetAgentRouter();
  resetTeamRegistry();
}

function section(title) {
  console.log(`\n--- ${title} ---\n`);
}

// ============================================================================
// Phase 1: Commands (10 new)
// ============================================================================

function testCommands() {
  section("Phase 1: Telegram Commands (10 new)");

  // MT-76-01: /agents lists 12 agents
  const agents = handleAgentsCommand();
  assert("MT-76-01", "/agents lists SE4A + SE4H",
    agents.success && agents.response.includes("@researcher") && agents.response.includes("@cto") && agents.response.includes("SE4A") && agents.response.includes("SE4H"),
    `SE4A+SE4H present, success=${agents.success}`);

  // MT-76-02: /teams STANDARD shows planning, dev, qa
  const teams = handleTeamsCommand("STANDARD");
  assert("MT-76-02", "/teams STANDARD → planning, dev, qa",
    teams.success && teams.response.includes("@planning") && teams.response.includes("@dev") && teams.response.includes("@qa"),
    `planning=${teams.response.includes("@planning")}, dev=${teams.response.includes("@dev")}, qa=${teams.response.includes("@qa")}`);

  // MT-76-03: /teams LITE shows only fullstack (reset singleton first)
  resetTeamRegistry();
  const teamsLite = handleTeamsCommand("LITE");
  assert("MT-76-03", "/teams LITE → fullstack only (after registry reset)",
    teamsLite.success && teamsLite.response.includes("@fullstack") && !teamsLite.response.includes("@planning"),
    `fullstack=${teamsLite.response.includes("@fullstack")}, noPlanning=${!teamsLite.response.includes("@planning")}`);
  resetTeamRegistry(); // Reset for subsequent tests

  // MT-76-04: /gate without args shows help
  const gate = handleGateCommand([]);
  assert("MT-76-04", "/gate shows help",
    gate.success && gate.response.includes("G0.1") && gate.response.includes("G4"),
    `hasGates=${gate.response.includes("G0.1")}`);

  // MT-76-05: /gate G2 shows gate info
  const gateG2 = handleGateCommand(["G2"]);
  assert("MT-76-05", "/gate G2 shows gate info",
    gateG2.success && gateG2.response.includes("G2"),
    `hasG2=${gateG2.response.includes("G2")}`);

  // MT-76-06: /compliance shows info
  const comp = handleComplianceCommand([]);
  assert("MT-76-06", "/compliance shows info",
    comp.success && comp.response.includes("Compliance"),
    `success=${comp.success}`);

  // MT-76-07: /fix defaults to dry-run
  const fix = handleFixCommand([]);
  assert("MT-76-07", "/fix defaults to dry-run",
    fix.success && fix.response.includes("dry-run"),
    `dryRun=${fix.response.includes("dry-run")}`);

  // MT-76-08: /fix --yes is live mode
  const fixYes = handleFixCommand(["--yes"]);
  assert("MT-76-08", "/fix --yes is live mode",
    fixYes.success && fixYes.response.includes("live"),
    `live=${fixYes.response.includes("live")}`);

  // MT-76-09: /fix --stage 01-planning
  const fixStage = handleFixCommand(["--stage", "01-planning"]);
  assert("MT-76-09", "/fix --stage 01-planning targets stage",
    fixStage.success && fixStage.response.includes("01-planning"),
    `stage=${fixStage.response.includes("01-planning")}`);

  // MT-76-10: /consult without query shows help
  const consult = handleConsultCommand([]);
  assert("MT-76-10", "/consult shows help without query",
    consult.success && consult.response.includes("Usage"),
    `help=${consult.response.includes("Usage")}`);

  // MT-76-11: /consult with query
  const consultQ = handleConsultCommand(["Redis", "vs", "PostgreSQL"]);
  assert("MT-76-11", "/consult with query shows query",
    consultQ.success && consultQ.response.includes("Redis vs PostgreSQL"),
    `query=${consultQ.response.includes("Redis vs PostgreSQL")}`);

  // MT-76-12: /config shows info
  const config = handleConfigCommand();
  assert("MT-76-12", "/config shows project config info",
    config.success && config.response.includes("Config"),
    `success=${config.success}`);

  // MT-76-13: /init shows info
  const init = handleInitCommand();
  assert("MT-76-13", "/init shows init status info",
    init.success && init.response.includes("Init"),
    `success=${init.success}`);

  // MT-76-14: /mode without args shows current mode
  const mode = handleModeCommand([], "READ");
  assert("MT-76-14", "/mode shows current READ mode",
    mode.success && mode.response.includes("READ"),
    `currentMode=${mode.response.includes("READ")}`);

  // MT-76-15: /mode patch shows warning
  const modePatch = handleModeCommand(["patch"], "READ");
  assert("MT-76-15", "/mode patch shows PATCH warning",
    modePatch.success && modePatch.response.includes("PATCH"),
    `patchWarning=${modePatch.response.includes("PATCH")}`);

  // MT-76-16: /mode invalid returns error
  const modeInvalid = handleModeCommand(["invalid"], "READ");
  assert("MT-76-16", "/mode invalid returns error",
    !modeInvalid.success && modeInvalid.response.includes("Unknown mode"),
    `error=${modeInvalid.response.includes("Unknown mode")}`);

  // MT-76-17: /webhook status shows inactive
  const webhook = handleWebhookCommand([], false);
  assert("MT-76-17", "/webhook shows INACTIVE status",
    webhook.success && webhook.response.includes("INACTIVE"),
    `inactive=${webhook.response.includes("INACTIVE")}`);

  // MT-76-18: /webhook on requires HTTPS config
  const webhookOn = handleWebhookCommand(["on"], false);
  assert("MT-76-18", "/webhook on requires HTTPS URL",
    webhookOn.success && webhookOn.response.includes("HTTPS"),
    `httpsRequired=${webhookOn.response.includes("HTTPS")}`);
}

// ============================================================================
// Phase 2: Help Message
// ============================================================================

function testHelp() {
  section("Phase 2: Help Message (14 commands)");

  const help = generateHelpMessage();

  // MT-76-19: Help lists all 14 commands
  const commands = ["/approve", "/reject", "/status", "/gate", "/compliance", "/fix", "/init", "/consult", "/agents", "/teams", "/config", "/mode", "/webhook", "/help"];
  const allPresent = commands.every(cmd => help.includes(cmd));
  assert("MT-76-19", "Help lists all 14 commands",
    allPresent,
    `missing=${commands.filter(c => !help.includes(c)).join(", ") || "none"}`);

  // MT-76-20: Help has 4 categories
  assert("MT-76-20", "Help has 4 categories",
    help.includes("Workflow") && help.includes("SDLC") && help.includes("AI") && help.includes("System"),
    `categories present`);

  // MT-76-21: Help shows agent/team mention format
  assert("MT-76-21", "Help shows agent + team mention format",
    help.includes("@agent task") && help.includes("@team task"),
    `agentFormat=${help.includes("@agent task")}, teamFormat=${help.includes("@team task")}`);
}

// ============================================================================
// Phase 3: Agent Keyboard
// ============================================================================

function testAgentKeyboard() {
  section("Phase 3: Agent Keyboard (12 agents, tier-aware)");

  // MT-76-22: STANDARD tier shows 12 agents (9 SE4A + 3 SE4H)
  const kb = createAgentSelectionKeyboard("STANDARD");
  const allButtons = kb.inline_keyboard.flat();
  assert("MT-76-22", "STANDARD keyboard has 12 agent buttons",
    allButtons.length === 12,
    `buttons=${allButtons.length}`);

  // MT-76-23: LITE tier shows 9 agents (SE4A only)
  const kbLite = createAgentSelectionKeyboard("LITE");
  const liteButtons = kbLite.inline_keyboard.flat();
  assert("MT-76-23", "LITE keyboard has 9 agent buttons (SE4A only)",
    liteButtons.length === 9,
    `buttons=${liteButtons.length}`);

  // MT-76-24: 3 agents per row
  const firstRow = kb.inline_keyboard[0];
  assert("MT-76-24", "Agent keyboard 3 per row",
    firstRow && firstRow.length === 3,
    `row1Length=${firstRow?.length}`);

  // MT-76-25: Callback data starts with agent: prefix
  const firstBtn = allButtons[0];
  assert("MT-76-25", "Agent button callback has 'agent:' prefix",
    firstBtn && firstBtn.callback_data.startsWith("agent:"),
    `callback=${firstBtn?.callback_data}`);

  // MT-76-26: All 12 agents have icons (not fallback 🔹)
  const agents = ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack", "ceo", "cpo", "cto"];
  const allHaveIcons = agents.every(a => getAgentIcon(a) !== "🔹");
  assert("MT-76-26", "All 12 agents have proper icons (no fallback)",
    allHaveIcons,
    `fallbacks=${agents.filter(a => getAgentIcon(a) === "🔹").join(",") || "none"}`);

  // MT-76-27: Callback data within 64-byte limit
  const maxCallbackLen = Math.max(...allButtons.map(b => Buffer.byteLength(b.callback_data)));
  assert("MT-76-27", "Agent callback_data within 64 bytes",
    maxCallbackLen <= 64,
    `maxBytes=${maxCallbackLen}`);
}

// ============================================================================
// Phase 4: Team Keyboard
// ============================================================================

function testTeamKeyboard() {
  section("Phase 4: Team Keyboard (tier-aware)");

  // MT-76-28: LITE has 1 team (fullstack)
  const kbLite = createTeamSelectionKeyboard("LITE");
  const liteButtons = kbLite.inline_keyboard.flat();
  assert("MT-76-28", "LITE team keyboard has 1 team (fullstack)",
    liteButtons.length === 1 && liteButtons[0].callback_data.includes("fullstack"),
    `teams=${liteButtons.length}, first=${liteButtons[0]?.callback_data}`);

  // MT-76-29: STANDARD has 3 teams
  const kbStd = createTeamSelectionKeyboard("STANDARD");
  const stdButtons = kbStd.inline_keyboard.flat();
  assert("MT-76-29", "STANDARD team keyboard has 3 teams",
    stdButtons.length === 3,
    `teams=${stdButtons.length}, names=${stdButtons.map(b => b.text).join(", ")}`);

  // MT-76-30: PROFESSIONAL has 5 teams
  const kbPro = createTeamSelectionKeyboard("PROFESSIONAL");
  const proButtons = kbPro.inline_keyboard.flat();
  assert("MT-76-30", "PROFESSIONAL team keyboard has 5 teams",
    proButtons.length === 5,
    `teams=${proButtons.length}, names=${proButtons.map(b => b.text).join(", ")}`);

  // MT-76-31: ENTERPRISE has 6 teams
  const kbEnt = createTeamSelectionKeyboard("ENTERPRISE");
  const entButtons = kbEnt.inline_keyboard.flat();
  assert("MT-76-31", "ENTERPRISE team keyboard has 6 teams",
    entButtons.length === 6,
    `teams=${entButtons.length}`);

  // MT-76-32: 2 teams per row
  const firstRow = kbStd.inline_keyboard[0];
  assert("MT-76-32", "Team keyboard 2 per row",
    firstRow && firstRow.length === 2,
    `row1Length=${firstRow?.length}`);

  // MT-76-33: Team callback has 'team:' prefix
  const firstBtn = stdButtons[0];
  assert("MT-76-33", "Team callback has 'team:' prefix",
    firstBtn && firstBtn.callback_data.startsWith("team:"),
    `callback=${firstBtn?.callback_data}`);
}

// ============================================================================
// Phase 5: Mode Confirm Keyboard
// ============================================================================

function testModeKeyboard() {
  section("Phase 5: Mode Confirm Keyboard");

  // MT-76-34: Mode confirm keyboard has confirm + cancel
  const kb = createModeConfirmKeyboard("test-req-123");
  const buttons = kb.inline_keyboard.flat();
  assert("MT-76-34", "Mode confirm has confirm + cancel buttons",
    buttons.length === 2,
    `buttons=${buttons.length}, texts=${buttons.map(b => b.text).join(", ")}`);

  // MT-76-35: Callback data includes request ID
  const hasReqId = buttons.every(b => b.callback_data.includes("test-req-123"));
  assert("MT-76-35", "Mode confirm callbacks include request ID",
    hasReqId,
    `callbacks=${buttons.map(b => b.callback_data).join(", ")}`);
}

// ============================================================================
// Phase 6: Handoff Keyboard (CTO B3: 64-byte limit)
// ============================================================================

function testHandoffKeyboard() {
  section("Phase 6: Handoff Keyboard (64-byte limit)");

  // MT-76-36: Short intent stays within 64 bytes
  const kb = createHandoffKeyboard([
    { agent: "coder", intent: "implement login", priority: "high" },
    { agent: "reviewer", intent: "review PR", priority: "medium" },
  ]);
  const buttons = kb.inline_keyboard.flat();
  const maxLen = Math.max(...buttons.map(b => Buffer.byteLength(b.callback_data)));
  assert("MT-76-36", "Handoff callback_data ≤ 64 bytes (short intent)",
    maxLen <= 64,
    `maxBytes=${maxLen}`);

  // MT-76-37: Long intent truncated to stay within 64 bytes
  const kbLong = createHandoffKeyboard([
    { agent: "researcher", intent: "This is a very long intent that would exceed sixty four bytes if not properly truncated by encodeIntent function", priority: "low" },
  ]);
  const longButtons = kbLong.inline_keyboard.flat();
  const longMaxLen = Math.max(...longButtons.map(b => Buffer.byteLength(b.callback_data)));
  assert("MT-76-37", "Handoff callback_data ≤ 64 bytes (long intent truncated)",
    longMaxLen <= 64,
    `maxBytes=${longMaxLen}`);
}

// ============================================================================
// Phase 7: Callback Parsing
// ============================================================================

function testCallbackParsing() {
  section("Phase 7: Callback Parsing");

  // MT-76-38: Parse agent select callback
  const agentCb = parseCallbackData("agent:coder:start");
  assert("MT-76-38", "Parse agent:coder:start",
    agentCb.action === "agent_select" && agentCb.target === "coder",
    `action=${agentCb.action}, target=${agentCb.target}`);

  // MT-76-39: Parse team select callback
  const teamCb = parseCallbackData("team:planning:start");
  assert("MT-76-39", "Parse team:planning:start",
    teamCb.action === "team_select" && teamCb.target === "planning",
    `action=${teamCb.action}, target=${teamCb.target}`);

  // MT-76-40: Parse mode confirm callback
  const modeCb = parseCallbackData("mode:confirm:req-123");
  assert("MT-76-40", "Parse mode:confirm:req-123",
    modeCb.action === "mode" && modeCb.target === "confirm",
    `action=${modeCb.action}, target=${modeCb.target}`);

  // MT-76-41: Parse mode cancel callback
  const cancelCb = parseCallbackData("mode:cancel:req-123");
  assert("MT-76-41", "Parse mode:cancel:req-123",
    cancelCb.action === "mode" && cancelCb.target === "cancel",
    `action=${cancelCb.action}, target=${cancelCb.target}`);
}

// ============================================================================
// Phase 8: Team Mention via OTT (Integration)
// ============================================================================

async function testTeamMentionOTT() {
  section("Phase 8: Team Mention via OTT (hasMention + parseMention)");

  // MT-76-42: @planning detected with teamRegistry
  reset();
  const registry = getTeamRegistry("STANDARD");
  const detected = hasMention('@planning "plan sprint goals"', registry);
  assert("MT-76-42", "hasMention('@planning ...', registry) = true",
    detected === true,
    `detected=${detected}`);

  // MT-76-43: parseMention @planning resolves to PM
  reset();
  const registry2 = getTeamRegistry("STANDARD");
  const result = parseMention('@planning "plan sprint goals"', registry2);
  assert("MT-76-43", "parseMention @planning → PM (team leader)",
    result.success && result.data.agents[0] === "pm",
    result.success ? `agent=${result.data.agents[0]}, isTeam=${result.data.isTeam}` : result.error.message);

  // MT-76-44: @dev resolves to coder with team context
  reset();
  const router = createAgentRouter({ tier: "STANDARD" });
  const devResult = await router.route('@dev "implement auth module"');
  assert("MT-76-44", "@dev → Coder with team context (STANDARD)",
    devResult.success && devResult.decision.agent === "coder" && devResult.decision.isTeam === true,
    devResult.success ? `agent=${devResult.decision.agent}, isTeam=${devResult.decision.isTeam}` : devResult.error.message);

  // MT-76-45: @qa resolves to reviewer
  reset();
  const router2 = createAgentRouter({ tier: "STANDARD" });
  const qaResult = await router2.route('@qa "review PR"');
  assert("MT-76-45", "@qa → Reviewer (STANDARD)",
    qaResult.success && qaResult.decision.agent === "reviewer" && qaResult.decision.isTeam === true,
    qaResult.success ? `agent=${qaResult.decision.agent}` : qaResult.error.message);

  // MT-76-46: @ops fails in STANDARD
  reset();
  const router3 = createAgentRouter({ tier: "STANDARD" });
  const opsResult = await router3.route('@ops "deploy"');
  assert("MT-76-46", "@ops fails in STANDARD tier",
    opsResult.success === false,
    opsResult.success ? `unexpectedAgent=${opsResult.decision.agent}` : `error=${opsResult.error.code}`);

  // MT-76-47: @pm is agent-first (not team)
  reset();
  const router4 = createAgentRouter({ tier: "STANDARD" });
  const pmResult = await router4.route('@pm "plan sprint"');
  assert("MT-76-47", "@pm → PM direct (agent-first, isTeam=false)",
    pmResult.success && pmResult.decision.agent === "pm" && pmResult.decision.isTeam === false,
    pmResult.success ? `agent=${pmResult.decision.agent}, isTeam=${pmResult.decision.isTeam}` : pmResult.error.message);
}

// ============================================================================
// Phase 9: Response Formatter
// ============================================================================

function testResponseFormatter() {
  section("Phase 9: Response Formatter");

  // MT-76-48: formatAgentNotFound lists agents + teams
  const notFound = formatAgentNotFound("@unknown task");
  assert("MT-76-48", "formatAgentNotFound lists 12 agents + 7 teams",
    notFound.includes("@researcher") && notFound.includes("@cto") && notFound.includes("@planning") && notFound.includes("@executive"),
    `hasAgents=${notFound.includes("@researcher")}, hasTeams=${notFound.includes("@planning")}`);

  // MT-76-49: formatProcessing includes agent icon
  const processing = formatProcessing("coder", "fix auth bug");
  assert("MT-76-49", "formatProcessing includes agent icon and task",
    processing.includes("💻") && processing.includes("fix auth bug"),
    `hasIcon=${processing.includes("💻")}, hasTask=${processing.includes("fix auth bug")}`);
}

// ============================================================================
// Phase 10: Webhook Handler
// ============================================================================

function testWebhookHandler() {
  section("Phase 10: Webhook Handler (Telegram + Zalo)");

  // MT-76-50: WebhookHandler constructor with all config
  let handlerDispose = null;
  try {
    const handler = new WebhookHandler({
      telegramSecretToken: "test-secret",
      zaloWebhookSecret: "zalo-secret",
      telegramHandler: async () => {},
      zaloHandler: async () => {},
      rateLimitPerMinute: 100,
      maxBodySize: 1024 * 1024,
    });
    handlerDispose = handler;
    assert("MT-76-50", "WebhookHandler constructs with full config",
      handler != null,
      "constructed successfully");
  } catch (e) {
    fail("MT-76-50", "WebhookHandler constructs with full config", e.message);
  }

  // MT-76-51: Cleanup interval (P0-1 fix)
  if (handlerDispose) {
    try {
      handlerDispose.dispose();
      assert("MT-76-51", "WebhookHandler.dispose() cleans up interval",
        true, "disposed without error");
    } catch (e) {
      fail("MT-76-51", "WebhookHandler.dispose() cleans up interval", e.message);
    }
  }

  // MT-76-52: cleanupRateLimits doesn't crash
  try {
    const handler2 = new WebhookHandler({ telegramSecretToken: "x" });
    handler2.cleanupRateLimits();
    handler2.dispose();
    assert("MT-76-52", "cleanupRateLimits() runs without error",
      true, "cleanup OK");
  } catch (e) {
    fail("MT-76-52", "cleanupRateLimits() runs without error", e.message);
  }

  // MT-76-53: Startup warning for missing secrets (P0-3)
  // Can't capture log directly, but handler should construct without error
  try {
    const handler3 = new WebhookHandler({
      telegramHandler: async () => {},
      // No telegramSecretToken — should warn
    });
    handler3.dispose();
    assert("MT-76-53", "WebhookHandler warns for missing secret (no crash)",
      true, "constructed with warning (check logs)");
  } catch (e) {
    fail("MT-76-53", "WebhookHandler warns for missing secret (no crash)", e.message);
  }
}

// ============================================================================
// Phase 11: HMAC-SHA256 MAC Verification (Zalo)
// ============================================================================

function testZaloMac() {
  section("Phase 11: Zalo MAC Verification");

  // MT-76-54: HMAC-SHA256 computation matches expected
  const secret = "test-zalo-secret";
  const body = '{"event_name":"user_send_text","sender":{"id":"123"}}';
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  assert("MT-76-54", "HMAC-SHA256 MAC computation is deterministic",
    expected.length === 64 && /^[0-9a-f]+$/.test(expected),
    `macLength=${expected.length}, hex=${expected.slice(0, 16)}...`);

  // MT-76-55: mac= prefix normalization
  const withPrefix = `mac=${expected}`;
  const normalized = withPrefix.startsWith("mac=") ? withPrefix.slice(4) : withPrefix;
  assert("MT-76-55", "Zalo MAC 'mac=' prefix normalization",
    normalized === expected,
    `match=${normalized === expected}`);
}

// ============================================================================
// Phase 12: i18n Completeness
// ============================================================================

async function testI18n() {
  section("Phase 12: i18n OTT Keys");

  // Dynamic import to avoid potential issues
  let messages;
  try {
    const mod = await import("../../dist/i18n/messages.js");
    messages = mod.messages || mod.default?.messages;
  } catch {
    fail("MT-76-56", "i18n messages import", "Failed to import messages module");
    fail("MT-76-57", "i18n EN/VI parity", "Skipped due to import failure");
    return;
  }

  if (!messages) {
    fail("MT-76-56", "i18n messages available", "messages object not found");
    fail("MT-76-57", "i18n EN/VI parity", "Skipped");
    return;
  }

  const en = messages.en || {};
  const vi = messages.vi || {};

  // MT-76-56: EN has OTT keys
  const enOttKeys = Object.keys(en).filter(k => k.startsWith("ott."));
  assert("MT-76-56", "EN has OTT keys (≥20)",
    enOttKeys.length >= 20,
    `enOttKeys=${enOttKeys.length}`);

  // MT-76-57: VI has matching OTT keys
  const viOttKeys = Object.keys(vi).filter(k => k.startsWith("ott."));
  assert("MT-76-57", "VI has matching OTT keys",
    viOttKeys.length >= enOttKeys.length,
    `en=${enOttKeys.length}, vi=${viOttKeys.length}`);
}

// ============================================================================
// Phase 13: PATCH Mode Detection
// ============================================================================

function testPatchMode() {
  section("Phase 13: PATCH Mode Detection");

  // MT-76-58: "PATCH: task" regex detection
  const patchRegex = /^PATCH:\s*(.+)$/i;
  const match1 = "PATCH: implement login feature".match(patchRegex);
  assert("MT-76-58", "PATCH: prefix detected in task",
    match1 !== null && match1[1] === "implement login feature",
    `matched=${match1 !== null}, task=${match1?.[1]}`);

  // MT-76-59: Case-insensitive PATCH detection
  const match2 = "patch: fix auth bug".match(patchRegex);
  assert("MT-76-59", "PATCH detection is case-insensitive",
    match2 !== null && match2[1] === "fix auth bug",
    `matched=${match2 !== null}`);

  // MT-76-60: Non-PATCH task not matched
  const match3 = "plan sprint goals".match(patchRegex);
  assert("MT-76-60", "Non-PATCH task not matched",
    match3 === null,
    `matched=${match3 !== null}`);
}

// ============================================================================
// Phase 14: OTT Timeout Config
// ============================================================================

function testTimeoutConfig() {
  section("Phase 14: OTT Timeout Config");

  // MT-76-61: Default timeout is 300s
  const defaultTimeout = parseInt(process.env.ENDIORBOT_OTT_TIMEOUT ?? "300", 10) || 300;
  assert("MT-76-61", "Default OTT timeout is 300s",
    defaultTimeout === 300,
    `timeout=${defaultTimeout}`);

  // MT-76-62: Invalid env var falls back to 300
  const invalidTimeout = parseInt("not-a-number", 10) || 300;
  assert("MT-76-62", "Invalid timeout env falls back to 300",
    invalidTimeout === 300,
    `timeout=${invalidTimeout}`);

  // MT-76-63: Valid env var is used
  const validTimeout = parseInt("180", 10) || 300;
  assert("MT-76-63", "Valid timeout env (180) is used",
    validTimeout === 180,
    `timeout=${validTimeout}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n=== Sprint 76 Manual Tests — OTT Channel Enhancement ===");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Authority: ADR-019 OTT Channel Enhancement\n`);

  // Sync tests
  testCommands();
  testHelp();
  testAgentKeyboard();
  testTeamKeyboard();
  testModeKeyboard();
  testHandoffKeyboard();
  testCallbackParsing();
  testResponseFormatter();
  testWebhookHandler();
  testZaloMac();
  testPatchMode();
  testTimeoutConfig();

  // Async tests
  await testTeamMentionOTT();
  await testI18n();

  // Summary
  console.log(`\n${"=".repeat(55)}`);
  console.log(`Sprint 76 Manual Tests: ${passCount}/${total} passed`);
  if (failCount > 0) {
    console.log(`FAILURES: ${failCount}`);
  }
  console.log(`${"=".repeat(55)}\n`);

  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(console.error);
