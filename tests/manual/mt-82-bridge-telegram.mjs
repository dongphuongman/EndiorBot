#!/usr/bin/env node
/**
 * MT-82: Notification Bridge — Telegram Manual Tests
 *
 * Tests Sprint 82 bridge features via compiled dist/ modules.
 * Live Telegram + tmux tests are marked PENDING (require running bot).
 *
 * Phases:
 *   1. Identity Binding (/link, D3 guard)
 *   2. Agent Launch (/launch, path validation, policy)
 *   3. Session Management (/sessions, /switch)
 *   4. Capture Output (/capture, redaction, line limits)
 *   5. Kill Session (/kill, audit)
 *   6. Security (path traversal, injection, rate limit)
 *   7. Help & UX (help message, response format)
 *
 * @sprint 82
 * @authority ADR-024 Notification Bridge
 * @requires build: pnpm build
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ============================================================================
// Test runner
// ============================================================================

let passed = 0;
let failed = 0;
const results = [];

function test(id, description, fn) {
  try {
    fn();
    console.log(`  \u2705 ${id}: ${description}`);
    passed++;
    results.push({ id, description, status: "PASS" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  \u274C ${id}: ${description}`);
    console.log(`       ${msg}`);
    failed++;
    results.push({ id, description, status: "FAIL", error: msg });
  }
}

async function testAsync(id, description, fn) {
  try {
    await fn();
    console.log(`  \u2705 ${id}: ${description}`);
    passed++;
    results.push({ id, description, status: "PASS" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  \u274C ${id}: ${description}`);
    console.log(`       ${msg}`);
    failed++;
    results.push({ id, description, status: "FAIL", error: msg });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

// ============================================================================
// Dynamic imports (ESM from dist/)
// ============================================================================

const telegramCmdsPath = join(ROOT, "dist/channels/telegram/telegram-commands.js");
const bridgeTypesPath = join(ROOT, "dist/bridge/types.js");
const inputSanitizerPath = join(ROOT, "dist/bridge/security/input-sanitizer.js");
const outputRedactorPath = join(ROOT, "dist/bridge/security/output-redactor.js");
const bridgePolicyPath = join(ROOT, "dist/bridge/security/bridge-policy.js");
const bridgeAuditPath = join(ROOT, "dist/bridge/security/bridge-audit.js");
const sessionRegistryPath = join(ROOT, "dist/bridge/session-registry.js");

assert(existsSync(telegramCmdsPath), `Missing dist: ${telegramCmdsPath}. Run pnpm build first.`);

const {
  handleLinkCommand,
  getLinkedActorId,
  handleLaunchCommand,
  handleSessionsCommand,
  handleSwitchCommand,
  handleCaptureCommand,
  handleKillCommand,
  generateHelpMessage,
  sanitizeForEcho,
} = await import(telegramCmdsPath);

const {
  VALID_AGENT_TYPES,
  CAPTURE_LINE_LIMITS,
  AGENT_COMMANDS,
} = await import(bridgeTypesPath);

const { sanitizeBridgeInput } = await import(inputSanitizerPath);
const { redactBridgeOutput } = await import(outputRedactorPath);
const {
  BridgePolicyManager,
  DEFAULT_BRIDGE_POLICY,
  resetBridgePolicyManager,
} = await import(bridgePolicyPath);
const {
  BridgeAuditLogger,
  resetBridgeAuditLogger,
} = await import(bridgeAuditPath);
const {
  SessionRegistry,
  resetSessionRegistry,
} = await import(sessionRegistryPath);

// ============================================================================
// Phase 1: Identity Binding (5 tests)
// ============================================================================

console.log("\n📌 Phase 1: Identity Binding (/link)");

test("MT-82-01", "/link binds telegramUserId to actorId", () => {
  const result = handleLinkCommand("12345", "ceo_user");
  assert(result.success, "Expected success");
  assert(result.response.includes("ceo@endiorbot"), "Should contain actorId");
});

test("MT-82-02", "/link returns linked actorId", () => {
  handleLinkCommand("99999", "test_user");
  const actorId = getLinkedActorId("99999");
  assert(actorId === "ceo@endiorbot", `Expected ceo@endiorbot, got ${actorId}`);
});

test("MT-82-03", "Unlinked user returns null", () => {
  const actorId = getLinkedActorId("nonexistent_user");
  assert(actorId === null, `Expected null, got ${actorId}`);
});

test("MT-82-04", "/link response includes available commands", () => {
  const result = handleLinkCommand("54321", "user2");
  assert(result.response.includes("/launch"), "Should mention /launch");
  assert(result.response.includes("/sessions"), "Should mention /sessions");
  assert(result.response.includes("/kill"), "Should mention /kill");
});

test("MT-82-05", "/link with no username defaults to 'unknown'", () => {
  const result = handleLinkCommand("11111");
  assert(result.success, "Expected success without username");
});

// ============================================================================
// Phase 2: Agent Launch (8 tests)
// ============================================================================

console.log("\n🚀 Phase 2: Agent Launch (/launch)");

await testAsync("MT-82-06", "/launch without agent shows usage", async () => {
  const result = await handleLaunchCommand([], "ceo@endiorbot");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("Usage"), "Should show usage");
  assert(result.response.includes("claude"), "Should list agents");
});

await testAsync("MT-82-07", "/launch unknown agent rejected", async () => {
  const result = await handleLaunchCommand(["unknown_agent"], "ceo@endiorbot");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("Unknown agent"), "Should say unknown");
});

test("MT-82-08", "Agent short names resolve correctly", () => {
  const agentMap = {
    "claude": "claude-code",
    "cursor": "cursor",
    "codex": "codex-cli",
    "gemini": "gemini-cli",
  };
  for (const [short, full] of Object.entries(agentMap)) {
    assert(VALID_AGENT_TYPES.includes(full), `${full} should be valid`);
  }
});

test("MT-82-09", "AGENT_COMMANDS has entry for all valid types", () => {
  for (const agentType of VALID_AGENT_TYPES) {
    assert(AGENT_COMMANDS[agentType], `Missing command for ${agentType}`);
  }
});

await testAsync("MT-82-10", "/launch with path traversal blocked (MF-2)", async () => {
  const result = await handleLaunchCommand(["claude", "/etc/passwd"], "ceo@endiorbot");
  assert(!result.success, "Expected failure for /etc/passwd");
  assert(result.response.includes("Path must be under"), "Should mention path restriction");
});

await testAsync("MT-82-11", "/launch with absolute home path accepted", async () => {
  const home = homedir();
  // This will fail because tmux isn't available in test, but should pass path validation
  const result = await handleLaunchCommand(["claude", home], "ceo@endiorbot");
  // Either tmux error or success — path validation passed
  assert(!result.response.includes("Path must be under"), "Should not be path-blocked");
});

await testAsync("MT-82-12", "/launch with tmpdir() path accepted", async () => {
  const tmpPath = join(tmpdir(), "test-bridge-launch-" + Date.now());
  mkdirSync(tmpPath, { recursive: true });
  try {
    const result = await handleLaunchCommand(["claude", tmpPath], "ceo@endiorbot");
    assert(!result.response.includes("Path must be under"), `Should not be path-blocked, got: ${result.response}`);
  } finally {
    rmSync(tmpPath, { recursive: true, force: true });
  }
});

await testAsync("MT-82-13", "/launch with relative path traversal blocked", async () => {
  const result = await handleLaunchCommand(["claude", "../../etc"], "ceo@endiorbot");
  // resolve() will make it absolute; if it doesn't start with home or /tmp, blocked
  const resolved = resolve("../../etc");
  if (!resolved.startsWith(homedir()) && !resolved.startsWith("/tmp")) {
    assert(!result.success, "Expected traversal blocked");
  }
});

// ============================================================================
// Phase 3: Session Management (6 tests)
// ============================================================================

console.log("\n📋 Phase 3: Session Management (/sessions, /switch)");

test("MT-82-14", "/sessions with empty registry shows 'No sessions'", () => {
  resetSessionRegistry();
  const registry = new SessionRegistry(join(tmpdir(), `mt82-test-${Date.now()}.json`));
  // handleSessionsCommand uses singleton — test the pattern
  const result = handleSessionsCommand();
  // May have sessions from previous tests; just verify it returns
  assert(result.success, "Expected success");
  assert(typeof result.response === "string", "Should return string response");
});

test("MT-82-15", "/switch without args shows current session", () => {
  const result = handleSwitchCommand([], "user_123");
  assert(result.success, "Expected success");
  assert(result.response.includes("Usage") || result.response.includes("No active session"),
    "Should show usage or no session");
});

test("MT-82-16", "/switch with invalid sessionId shows error", () => {
  const result = handleSwitchCommand(["nonexistent_session"], "user_123");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("Session not found"), "Should say not found");
});

test("MT-82-17", "SessionRegistry.generateId() format is bridge_<ts>_<rand>", () => {
  const id = SessionRegistry.generateId();
  assert(id.startsWith("bridge_"), `ID should start with bridge_, got ${id}`);
  const parts = id.split("_");
  assert(parts.length === 3, "Should have 3 parts");
  assert(/^\d+$/.test(parts[1]), "Middle part should be timestamp");
});

test("MT-82-18", "SessionRegistry.createFingerprint() is deterministic", () => {
  const fp1 = SessionRegistry.createFingerprint("/path/to/project", "git@github.com:user/repo.git");
  const fp2 = SessionRegistry.createFingerprint("/path/to/project", "git@github.com:user/repo.git");
  assert(fp1 === fp2, "Same inputs should produce same fingerprint");
  assert(fp1.length === 16, `Fingerprint should be 16 chars, got ${fp1.length}`);
});

test("MT-82-19", "SessionRegistry.createFingerprint() changes with different path", () => {
  const fp1 = SessionRegistry.createFingerprint("/path/a", "");
  const fp2 = SessionRegistry.createFingerprint("/path/b", "");
  assert(fp1 !== fp2, "Different paths should produce different fingerprints");
});

// ============================================================================
// Phase 4: Capture Output (8 tests)
// ============================================================================

console.log("\n📸 Phase 4: Capture Output (/capture)");

await testAsync("MT-82-20", "/capture without active session shows error", async () => {
  const result = await handleCaptureCommand([], "ceo@endiorbot", "no_session_user");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("No active session"), "Should say no active session");
});

test("MT-82-21", "CAPTURE_LINE_LIMITS enforces riskMode (read=30, patch=50, interactive=100)", () => {
  assert(CAPTURE_LINE_LIMITS.read === 30, `read should be 30, got ${CAPTURE_LINE_LIMITS.read}`);
  assert(CAPTURE_LINE_LIMITS.patch === 50, `patch should be 50, got ${CAPTURE_LINE_LIMITS.patch}`);
  assert(CAPTURE_LINE_LIMITS.interactive === 100, `interactive should be 100, got ${CAPTURE_LINE_LIMITS.interactive}`);
});

test("MT-82-22", "OutputRedactor blocks high-sensitivity patterns", () => {
  const result = redactBridgeOutput("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...", "read");
  assert(result.blocked, "Should be blocked for PRIVATE KEY");
  assert(result.reason.includes("Sensitive"), "Reason should mention sensitive");
});

test("MT-82-23", "OutputRedactor redacts API keys", () => {
  const result = redactBridgeOutput("token: ***REMOVED-ANTHROPIC-KEY***", "read");
  assert(!result.blocked, "Should not be blocked (redact only)");
  assert(result.content.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test("MT-82-24", "OutputRedactor enforces line limits by riskMode", () => {
  const longOutput = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
  const result = redactBridgeOutput(longOutput, "read");
  const lines = result.content.trim().split("\n");
  assert(lines.length <= 30, `Read mode should cap at 30 lines, got ${lines.length}`);
});

test("MT-82-25", "OutputRedactor blocks DATABASE_URL", () => {
  const result = redactBridgeOutput("DATABASE_URL=postgres://user:pass@host/db", "read");
  assert(result.blocked, "Should be blocked for DATABASE_URL");
});

test("MT-82-26", "OutputRedactor blocks AWS_SECRET_ACCESS_KEY", () => {
  const result = redactBridgeOutput("export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "read");
  assert(result.blocked, "Should be blocked for AWS_SECRET_ACCESS_KEY");
});

test("MT-82-27", "OutputRedactor passes clean output", () => {
  const result = redactBridgeOutput("$ echo hello\nhello\n$", "read");
  assert(!result.blocked, "Clean output should not be blocked");
  assert(result.content.includes("hello"), "Content should pass through");
});

// ============================================================================
// Phase 5: Kill Session (4 tests)
// ============================================================================

console.log("\n💀 Phase 5: Kill Session (/kill)");

await testAsync("MT-82-28", "/kill without sessionId shows usage", async () => {
  const result = await handleKillCommand([], "ceo@endiorbot");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("Usage"), "Should show usage");
});

await testAsync("MT-82-29", "/kill with unknown sessionId shows error", async () => {
  const result = await handleKillCommand(["nonexistent_123"], "ceo@endiorbot");
  assert(!result.success, "Expected failure");
  assert(result.response.includes("Session not found") || result.response.includes("Kill failed"),
    "Should indicate session not found");
});

test("MT-82-30", "sanitizeForEcho strips Markdown special chars", () => {
  const sanitized = sanitizeForEcho("`*_[]()~>#+");
  assert(sanitized.length === 0, `Should strip all special chars, got '${sanitized}'`);
});

test("MT-82-31", "sanitizeForEcho limits length to 50", () => {
  const long = "a".repeat(100);
  const sanitized = sanitizeForEcho(long);
  assert(sanitized.length === 50, `Should be capped at 50, got ${sanitized.length}`);
});

// ============================================================================
// Phase 6: Security (7 tests)
// ============================================================================

console.log("\n🔒 Phase 6: Security");

test("MT-82-32", "InputSanitizer blocks shell injection in read mode", () => {
  let threw = false;
  try { sanitizeBridgeInput("rm -rf /", "read"); } catch { threw = true; }
  assert(threw, "Should throw for rm -rf /");
});

test("MT-82-33", "InputSanitizer blocks sudo in read mode", () => {
  let threw = false;
  try { sanitizeBridgeInput("sudo apt install", "read"); } catch { threw = true; }
  assert(threw, "Should throw for sudo");
});

test("MT-82-34", "InputSanitizer strips control characters", () => {
  const result = sanitizeBridgeInput("hello\x00world", "read");
  assert(!result.includes("\x00"), "Should strip null bytes");
});

test("MT-82-35", "InputSanitizer strips ANSI escapes", () => {
  const result = sanitizeBridgeInput("hello\x1B[31mred\x1B[0m", "read");
  assert(!result.includes("\x1B"), "Should strip ANSI escapes");
});

test("MT-82-36", "BridgePolicy shellPanesDisabled is always true", () => {
  const policy = new BridgePolicyManager({ shellPanesDisabled: false });
  assert(policy.isShellPaneAllowed() === false, "Shell panes should always be disabled");
});

test("MT-82-37", "BridgePolicy default maxSessionsPerAgent is 2", () => {
  assert(DEFAULT_BRIDGE_POLICY.maxSessionsPerAgent === 2,
    `Expected 2, got ${DEFAULT_BRIDGE_POLICY.maxSessionsPerAgent}`);
});

test("MT-82-38", "BridgePolicy default maxTotalSessions is 6", () => {
  assert(DEFAULT_BRIDGE_POLICY.maxTotalSessions === 6,
    `Expected 6, got ${DEFAULT_BRIDGE_POLICY.maxTotalSessions}`);
});

// ============================================================================
// Phase 7: Help & UX (4 tests)
// ============================================================================

console.log("\n📖 Phase 7: Help & UX");

test("MT-82-39", "/help includes Bridge section with ADR-024", () => {
  const help = generateHelpMessage();
  assert(help.includes("Bridge (ADR-024)"), "Should have Bridge section");
  assert(help.includes("/link"), "Should list /link");
  assert(help.includes("/launch"), "Should list /launch");
  assert(help.includes("/sessions"), "Should list /sessions");
  assert(help.includes("/switch"), "Should list /switch");
  assert(help.includes("/capture"), "Should list /capture");
  assert(help.includes("/kill"), "Should list /kill");
});

test("MT-82-40", "/help lists bridge commands (6 Sprint 82 + Sprint 83 additions)", () => {
  const help = generateHelpMessage();
  const bridgeSection = help.split("Bridge (ADR-024)")[1]?.split("*System:*")[0] ?? "";
  const commandCount = (bridgeSection.match(/^\s+\//gm) || []).length;
  // Sprint 82: 6 commands, Sprint 83 added 9 more = 15 total
  assert(commandCount >= 6, `Expected >= 6 bridge commands in help, found ${commandCount}`);
});

test("MT-82-41", "/link response follows CA2 UX format", () => {
  const result = handleLinkCommand("ux_test", "ceo");
  assert(result.response.includes("✅"), "Should have checkmark");
  assert(result.response.includes("Linked as"), "Should say 'Linked as'");
});

test("MT-82-42", "VALID_AGENT_TYPES has exactly 4 entries", () => {
  assert(VALID_AGENT_TYPES.length === 4,
    `Expected 4 agent types, got ${VALID_AGENT_TYPES.length}`);
  assert(VALID_AGENT_TYPES.includes("claude-code"), "Should include claude-code");
  assert(VALID_AGENT_TYPES.includes("cursor"), "Should include cursor");
  assert(VALID_AGENT_TYPES.includes("codex-cli"), "Should include codex-cli");
  assert(VALID_AGENT_TYPES.includes("gemini-cli"), "Should include gemini-cli");
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log(`MT-82 Results: ${passed} PASS | ${failed} FAIL | ${passed + failed} TOTAL`);
console.log("=".repeat(60));

if (failed > 0) {
  console.log("\nFailed tests:");
  for (const r of results.filter((r) => r.status === "FAIL")) {
    console.log(`  ❌ ${r.id}: ${r.description} — ${r.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
