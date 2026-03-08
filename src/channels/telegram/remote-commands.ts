/**
 * Remote Commands (Sprint 83)
 *
 * 9 Telegram command handlers for Repo Context, Copilot CLI, and Managed Shell.
 * All require actor identity (getLinkedActorId) + shellActorAllowlist.
 *
 * @module channels/telegram/remote-commands
 * @version 1.0.0
 * @authority ADR-024 D4/D5, Sprint 83
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRegistry } from "../../bridge/repo/repo-registry.js";
import { getChatFocusManager } from "../../bridge/repo/chat-focus.js";
import { CopilotBridge } from "../../bridge/copilot/copilot-bridge.js";
import { isAllowed } from "../../bridge/shell/shell-allowlist.js";
import { ShellSessionManager } from "../../bridge/shell/shell-session-manager.js";
import { getTmuxBridge } from "../../bridge/tmux/tmux-bridge.js";
import { redactBridgeOutput } from "../../bridge/security/output-redactor.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
import { getBridgePolicyManager } from "../../bridge/security/bridge-policy.js";
import { createApprovalRequestWithEvents } from "../../gateway/events.js";
import { sanitizeForEcho } from "./telegram-commands.js";
import type { CommandResult } from "./telegram-commands.js";
import type { ExecRunner, ExecResult, ExecOpts } from "../../bridge/types.js";
import type { TmuxClient } from "../../bridge/shell/types.js";

// ============================================================================
// Constants
// ============================================================================

const NO_FOCUS_MSG = "No repo focused. Use /focus <name> or /repos to list available repos.";
const MAX_OUTPUT_LENGTH = 3500;

// ============================================================================
// ExecRunner (real implementation — uses execFile per CTO C3/A7)
// ============================================================================

const execFileAsync = promisify(execFile);

const realExecRunner: ExecRunner = {
  async exec(binary: string, args: string[], opts?: ExecOpts): Promise<ExecResult> {
    try {
      const { stdout, stderr } = await execFileAsync(binary, args, {
        cwd: opts?.cwd,
        timeout: opts?.timeout,
        env: opts?.env,
        maxBuffer: 1024 * 1024,
      });
      return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string; status?: number };
      return {
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        exitCode: typeof e.code === "number" ? e.code : (e.status ?? 1),
      };
    }
  },
};

// ============================================================================
// Singletons (lazy init)
// ============================================================================

let copilotBridge: CopilotBridge | undefined;
function getCopilotBridge(): CopilotBridge {
  if (!copilotBridge) {
    copilotBridge = new CopilotBridge(realExecRunner);
  }
  return copilotBridge;
}

let shellManager: ShellSessionManager | undefined;
function getShellSessionManager(): ShellSessionManager {
  if (!shellManager) {
    const tmux = getTmuxBridge();
    const tmuxClient: TmuxClient = {
      async createSession(name: string, cmd?: string) {
        const result = await tmux.createSession(name, cmd ?? "exec $SHELL");
        return { target: result.target, sessionName: result.sessionName };
      },
      async sendKeys(target: string, text: string) { await tmux.sendKeys(target, text); },
      async capturePane(target: string, lines?: number) { return tmux.capturePane(target, lines); },
      async killWindow(target: string) { await tmux.killWindow(target); },
    };
    shellManager = new ShellSessionManager(tmuxClient);
  }
  return shellManager;
}

// ============================================================================
// buildCleanEnv (CPO CA5)
// ============================================================================

function buildCleanEnv(allowlist: string[] = []): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: process.env["HOME"] ?? "/tmp",
    LANG: process.env["LANG"] ?? "en_US.UTF-8",
  };
  for (const key of allowlist) {
    const val = process.env[key];
    if (val !== undefined) env[key] = val;
  }
  return env;
}

// ============================================================================
// Helpers
// ============================================================================

function getRepoForChat(chatId: string): { success: true; repoName: string; repoPath: string; envAllowlist: string[] } | { success: false; response: string } {
  const focus = getChatFocusManager().getFocus(chatId);
  if (!focus) {
    return { success: false, response: NO_FOCUS_MSG };
  }

  const repo = getRepoRegistry().get(focus.repoName);
  if (!repo) {
    return { success: false, response: `Focused repo "${focus.repoName}" not found in registry. Use /repos to list.` };
  }

  return { success: true, repoName: repo.name, repoPath: repo.path, envAllowlist: repo.envAllowlist ?? [] };
}

function checkActorAllowed(actorId: string): boolean {
  return getBridgePolicyManager().isShellActorAllowed(actorId);
}

// ============================================================================
// Repo Context Handlers
// ============================================================================

/**
 * Handle /repos command — list registered repos, or add/remove.
 */
export function handleReposCommand(args: string[]): CommandResult {
  const subCmd = args[0]?.toLowerCase();

  if (subCmd === "add" && args.length >= 3) {
    const name = args[1]!;
    const path = args[2]!;
    const result = getRepoRegistry().add(name, path);
    if (!result.success) {
      return { success: false, response: `Failed to add repo: ${result.error}` };
    }
    return { success: true, response: `✅ Repo "${name}" registered at ${sanitizeForEcho(path.slice(0, 50))}` };
  }

  if (subCmd === "remove" && args[1]) {
    const removed = getRepoRegistry().remove(args[1]);
    return removed
      ? { success: true, response: `Repo "${args[1]}" removed.` }
      : { success: false, response: `Repo "${args[1]}" not found.` };
  }

  // Default: list repos
  const repos = getRepoRegistry().list();
  if (repos.length === 0) {
    return { success: true, response: "📂 *Repos*\n\nNo repos registered.\nUse: /repos add <name> <absolute-path>" };
  }

  const lines = ["📂 *Registered Repos*", ""];
  for (const r of repos) {
    lines.push(`• *${r.name}* — ${sanitizeForEcho(r.path.slice(0, 50))}`);
    if (r.riskProfile) lines.push(`  Risk: ${r.riskProfile}`);
  }
  lines.push("", "Use /focus <name> to set active repo.");
  return { success: true, response: lines.join("\n") };
}

/**
 * Handle /focus command — set repo focus for current chat.
 */
export function handleFocusCommand(args: string[], chatId: string, actorId: string): CommandResult {
  const repoName = args[0];
  if (!repoName) {
    return { success: false, response: "Usage: /focus <repo-name>\nUse /repos to list available repos." };
  }

  const repo = getRepoRegistry().get(repoName);
  if (!repo) {
    return { success: false, response: `Repo "${sanitizeForEcho(repoName)}" not found. Use /repos to list.` };
  }

  getChatFocusManager().setFocus(chatId, repoName);

  getBridgeAuditLogger().log({
    event: "repo_focus",
    actorId,
    actor: "telegram",
    details: { chatId, repoName, repoPath: repo.path },
  });

  const parts = [`🎯 Focused on *${repo.name}*`, `Path: ${sanitizeForEcho(repo.path.slice(0, 50))}`];
  if (repo.defaultBranch) parts.push(`Branch: ${repo.defaultBranch}`);
  return { success: true, response: parts.join("\n") };
}

/**
 * Handle /where command — show current focus.
 */
export function handleWhereCommand(chatId: string): CommandResult {
  const focus = getChatFocusManager().getFocus(chatId);
  if (!focus) {
    return { success: true, response: NO_FOCUS_MSG };
  }

  const repo = getRepoRegistry().get(focus.repoName);
  if (!repo) {
    return { success: true, response: `Focus: ${focus.repoName} (repo not found in registry)` };
  }

  const lines = [
    `📍 *Current Focus*`,
    `Repo: ${repo.name}`,
    `Path: ${sanitizeForEcho(repo.path.slice(0, 50))}`,
  ];
  if (repo.defaultBranch) lines.push(`Branch: ${repo.defaultBranch}`);
  if (repo.riskProfile) lines.push(`Risk: ${repo.riskProfile}`);
  return { success: true, response: lines.join("\n") };
}

// ============================================================================
// Copilot CLI Handlers
// ============================================================================

/**
 * Handle /cp command — Copilot CLI bridge.
 */
export async function handleCpCommand(
  args: string[],
  chatId: string,
  actorId: string,
): Promise<CommandResult> {
  if (!checkActorAllowed(actorId)) {
    return { success: false, response: "Not authorized for remote commands." };
  }

  const subCmd = args[0]?.toLowerCase();

  if (subCmd === "status") {
    const status = await getCopilotBridge().getStatus();
    return { success: true, response: `🔧 *Copilot CLI*\n\n${status}` };
  }

  if (subCmd === "suggest") {
    const task = args.slice(1).join(" ");
    if (!task) {
      return { success: false, response: "Usage: /cp suggest <task>\nExample: /cp suggest list all TypeScript files" };
    }

    const repo = getRepoForChat(chatId);
    if (!repo.success) return { success: false, response: repo.response };

    const result = await getCopilotBridge().suggest(task, repo.repoPath);

    const redacted = redactBridgeOutput(result.output, "read");
    const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;
    const capped = output.length > MAX_OUTPUT_LENGTH
      ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n...(truncated)"
      : output;

    getBridgeAuditLogger().log({
      event: "copilot_suggest",
      actorId,
      actor: "telegram",
      details: { chatId, task: task.slice(0, 100), repo: repo.repoName },
    });

    return {
      success: result.success,
      response: `💡 *Copilot Suggest*\n\n\`\`\`\n${capped}\n\`\`\``,
    };
  }

  if (subCmd === "explain") {
    const cmd = args.slice(1).join(" ");
    if (!cmd) {
      return { success: false, response: "Usage: /cp explain <command>\nExample: /cp explain find . -name '*.ts'" };
    }

    const repo = getRepoForChat(chatId);
    if (!repo.success) return { success: false, response: repo.response };

    const result = await getCopilotBridge().explain(cmd, repo.repoPath);

    const redacted = redactBridgeOutput(result.output, "read");
    const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;

    getBridgeAuditLogger().log({
      event: "copilot_explain",
      actorId,
      actor: "telegram",
      details: { chatId, cmd: cmd.slice(0, 100), repo: repo.repoName },
    });

    return {
      success: result.success,
      response: `📖 *Copilot Explain*\n\n${output}`,
    };
  }

  return {
    success: false,
    response: "Usage: /cp [suggest|explain|status]\n\n• /cp suggest <task>\n• /cp explain <command>\n• /cp status",
  };
}

// ============================================================================
// Managed Shell Handlers
// ============================================================================

/**
 * Handle /sh command — read-only allowlisted shell command.
 */
export async function handleShCommand(
  args: string[],
  chatId: string,
  actorId: string,
): Promise<CommandResult> {
  if (!checkActorAllowed(actorId)) {
    return { success: false, response: "Not authorized for remote commands." };
  }

  const cmd = args.join(" ").trim();
  if (!cmd) {
    return { success: false, response: "Usage: /sh <command>\nExample: /sh git status\n\nOnly read-only commands are allowed." };
  }

  const repo = getRepoForChat(chatId);
  if (!repo.success) return { success: false, response: repo.response };

  // Allowlist check
  if (!isAllowed(cmd)) {
    return {
      success: false,
      response: `Command not in read-only allowlist.\nUse \`/run ${sanitizeForEcho(cmd.slice(0, 30))}\` (approval required).`,
    };
  }

  try {
    const manager = getShellSessionManager();
    const result = await manager.sendCommand(repo.repoName, repo.repoPath, cmd);

    const redacted = redactBridgeOutput(result.output, "read");
    const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;

    const cmdHash = createHash("sha256").update(cmd).digest("hex").slice(0, 12);

    getBridgeAuditLogger().log({
      event: "shell_send",
      actorId,
      actor: "telegram",
      details: {
        chatId,
        repo: repo.repoName,
        cmdHash,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      },
    });

    const suffix = result.timedOut ? "\n⏱️ (timed out)" : "";
    const exitInfo = result.exitCode !== 0 ? `\nExit: ${result.exitCode}` : "";

    return {
      success: !result.timedOut && result.exitCode === 0,
      response: `🖥️ *Shell* (${sanitizeForEcho(repo.repoName)})\n\n\`\`\`\n${output}\n\`\`\`${exitInfo}${suffix}`,
    };
  } catch (err) {
    return {
      success: false,
      response: `Shell error: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

/**
 * Handle /attach command — capture output from shell session.
 */
export async function handleAttachCommand(
  args: string[],
  chatId: string,
  actorId: string,
): Promise<CommandResult> {
  if (!checkActorAllowed(actorId)) {
    return { success: false, response: "Not authorized for remote commands." };
  }

  const repo = getRepoForChat(chatId);
  if (!repo.success) return { success: false, response: repo.response };

  const manager = getShellSessionManager();
  if (!manager.hasSession(repo.repoName)) {
    return { success: false, response: "No shell session. Use /sh <cmd> to start one." };
  }

  const lines = args[0] ? parseInt(args[0], 10) : 30;
  const result = await manager.captureOutput(repo.repoName, lines);

  const redacted = redactBridgeOutput(result.output, "read");
  const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;

  getBridgeAuditLogger().log({
    event: "shell_capture",
    actorId,
    actor: "telegram",
    details: { chatId, repo: repo.repoName, lines },
  });

  return {
    success: true,
    response: `📸 *Shell Capture* (${sanitizeForEcho(repo.repoName)})\n\n\`\`\`\n${output}\n\`\`\``,
  };
}

/**
 * Handle /run command — approval-gated command execution.
 */
export async function handleRunCommand(
  args: string[],
  chatId: string,
  actorId: string,
): Promise<CommandResult> {
  if (!checkActorAllowed(actorId)) {
    return { success: false, response: "Not authorized for remote commands." };
  }

  const cmd = args.join(" ").trim();
  if (!cmd) {
    return { success: false, response: "Usage: /run <command>\nExample: /run npm test\n\n⚠️ Requires CEO approval." };
  }

  const repo = getRepoForChat(chatId);
  if (!repo.success) return { success: false, response: repo.response };

  // Create approval request with full command text (CTO W-3)
  const timestamp = Date.now().toString();
  const commandDigest = createHash("sha256")
    .update(cmd + repo.repoName + timestamp)
    .digest("hex")
    .slice(0, 16);

  const request = createApprovalRequestWithEvents("action", `Run: ${cmd} in ${repo.repoName}`, {
    details: {
      actorId,
      chatId,
      repo: repo.repoName,
      cmd,
      commandDigest,
      repoPath: repo.repoPath,
      envAllowlist: repo.envAllowlist,
    },
  });

  getBridgeAuditLogger().log({
    event: "run_request",
    actorId,
    actor: "telegram",
    details: {
      chatId,
      repo: repo.repoName,
      cmdHash: commandDigest,
      approvalId: request.id,
    },
  });

  return {
    success: true,
    response: `⚠️ *Approval Required*

Command: \`${sanitizeForEcho(cmd.slice(0, 100))}\`
Repo: ${sanitizeForEcho(repo.repoName)}
Approval ID: \`${request.id}\`

Reply with:
  /approve ${request.id}
  /reject ${request.id}`,
  };
}

/**
 * Execute an approved /run command.
 * Called by the approval handler after CEO approves.
 */
export async function executeApprovedRun(
  cmd: string,
  repoPath: string,
  repoName: string,
  actorId: string,
  chatId: string,
  envAllowlist: string[] = [],
): Promise<CommandResult> {
  const env = buildCleanEnv(envAllowlist);

  try {
    const result = await realExecRunner.exec("/bin/bash", ["-lc", cmd], {
      cwd: repoPath,
      timeout: 30000,
      env,
    });

    const fullOutput = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
    const redacted = redactBridgeOutput(fullOutput, "interactive");
    const output = redacted.blocked ? "(output blocked — sensitive content)" : redacted.content;
    const capped = output.length > MAX_OUTPUT_LENGTH
      ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n...(truncated)"
      : output;

    const cmdHash = createHash("sha256").update(cmd).digest("hex").slice(0, 12);

    getBridgeAuditLogger().log({
      event: "run_executed",
      actorId,
      actor: "telegram",
      details: {
        chatId,
        repo: repoName,
        cmdHash,
        exitCode: result.exitCode,
      },
    });

    return {
      success: result.exitCode === 0,
      response: `🏃 *Run Complete*

Command: \`${sanitizeForEcho(cmd.slice(0, 50))}\`
Exit: ${result.exitCode}

\`\`\`
${capped}
\`\`\``,
    };
  } catch (err) {
    return {
      success: false,
      response: `Run failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function resetRemoteCommands(): void {
  copilotBridge = undefined;
  shellManager = undefined;
}
