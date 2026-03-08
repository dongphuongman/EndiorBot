/**
 * Hook Installer
 *
 * Installs Claude Code hooks into a target project's .claude/settings.json.
 * Generates hook shell scripts that forward events to EndiorBot bridge.
 *
 * @module bridge/hooks/hook-installer
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-024 §8.5
 * @stage 04 - BUILD (Sprint 86)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = ".claude";
const HOOKS_DIR = "hooks";
const SETTINGS_FILE = "settings.json";

// ============================================================================
// Types
// ============================================================================

export interface InstallHooksOptions {
  force?: boolean;
}

export interface HookDetail {
  hook: string;
  status: "installed" | "skipped" | "failed";
  error?: string;
}

export interface InstallHooksResult {
  installed: number;
  skipped: number;
  failed: number;
  details: HookDetail[];
}

// ============================================================================
// Hook Templates
// ============================================================================

/**
 * Hook definitions: event name → script content.
 */
const HOOK_DEFINITIONS: Array<{
  event: string;
  filename: string;
  description: string;
  content: string;
}> = [
  {
    event: "Stop",
    filename: "stop.sh",
    description: "Forward stop events to EndiorBot bridge for permission relay",
    content: `#!/bin/bash
# EndiorBot Bridge — Stop Hook
# Forwards Claude Code stop events to EndiorBot for permission approval.
# Installed by: endiorbot bridge install-hooks
# Authority: ADR-024 §8.4

INPUT=$(cat /dev/stdin)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only forward if EndiorBot bridge is running
if [ -n "$ENDIORBOT_BRIDGE_URL" ]; then
  curl -s -X POST "$ENDIORBOT_BRIDGE_URL/hooks/stop" \\
    -H "Content-Type: application/json" \\
    -d "$INPUT" \\
    --max-time 5 \\
    > /dev/null 2>&1 || true
fi

exit 0
`,
  },
  {
    event: "PreToolUse",
    filename: "pre-tool-use.sh",
    description: "Secret guard + SDLC compliance checks",
    content: `#!/bin/bash
# EndiorBot Bridge — Pre-tool-use Hook
# Secret guard: blocks writes to sensitive files.
# Installed by: endiorbot bridge install-hooks
# Authority: ADR-024

INPUT=$(cat /dev/stdin)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

[[ -z "$TOOL_NAME" ]] && exit 0
[[ -z "$FILE_PATH" ]] && exit 0

case $TOOL_NAME in
  "Write"|"Edit")
    if [[ $FILE_PATH =~ \\.env ]] || \\
       [[ $FILE_PATH =~ secret ]] || \\
       [[ $FILE_PATH =~ token ]] || \\
       [[ $FILE_PATH =~ \\.pem$ ]] || \\
       [[ $FILE_PATH =~ \\.key$ ]] || \\
       [[ $FILE_PATH =~ credential ]] || \\
       [[ $FILE_PATH =~ password ]]; then
      echo "BLOCKED: Cannot write to sensitive file: $FILE_PATH"
      exit 1
    fi
    ;;
esac

exit 0
`,
  },
];

// ============================================================================
// Installer
// ============================================================================

/**
 * Install Claude Code hooks into a target project.
 *
 * Creates .claude/hooks/ directory and hook scripts,
 * then updates .claude/settings.json with hook configuration.
 *
 * Idempotent: skips existing hook scripts (unless --force).
 */
export function installHooks(
  projectPath: string,
  options?: InstallHooksOptions,
): InstallHooksResult {
  const resolvedPath = resolve(projectPath);
  const force = options?.force ?? false;

  const details: HookDetail[] = [];
  let installed = 0;
  let skipped = 0;
  let failed = 0;

  // Ensure .claude/hooks/ directory exists
  const claudeDir = join(resolvedPath, CLAUDE_DIR);
  const hooksDir = join(claudeDir, HOOKS_DIR);

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Install each hook script
  for (const hook of HOOK_DEFINITIONS) {
    const scriptPath = join(hooksDir, hook.filename);

    try {
      if (existsSync(scriptPath) && !force) {
        details.push({ hook: hook.event, status: "skipped" });
        skipped++;
        continue;
      }

      writeFileSync(scriptPath, hook.content, "utf-8");
      // CTO W2: ensure scripts are executable
      chmodSync(scriptPath, 0o755);
      details.push({ hook: hook.event, status: "installed" });
      installed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      details.push({ hook: hook.event, status: "failed", error: message });
      failed++;
    }
  }

  // Update settings.json with hooks configuration
  try {
    updateSettingsJson(claudeDir, force);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    details.push({ hook: "settings.json", status: "failed", error: message });
    failed++;
  }

  return { installed, skipped, failed, details };
}

// ============================================================================
// Private
// ============================================================================

/**
 * Update .claude/settings.json with hook configuration.
 * Preserves existing keys (permissions, mcpServers, etc.).
 */
function updateSettingsJson(claudeDir: string, force: boolean): void {
  const settingsPath = join(claudeDir, SETTINGS_FILE);

  // Read existing settings or start fresh
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    } catch {
      // Corrupted JSON — start fresh if force, otherwise preserve
      if (!force) return;
    }
  }

  // Build hooks config
  const hooksConfig: Record<string, unknown> = {};
  for (const hook of HOOK_DEFINITIONS) {
    const hookKey = hook.event === "Stop"
      ? "Stop"
      : hook.event === "PreToolUse"
        ? "PreToolUse"
        : hook.event;

    hooksConfig[hookKey] = [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `cat /dev/stdin | .claude/hooks/${hook.filename}`,
          },
        ],
      },
    ];
  }

  // Merge: only overwrite hooks if force or hooks not yet set
  const existingHooks = settings["hooks"] as Record<string, unknown> | undefined;
  if (existingHooks && !force) {
    // Merge: add missing hooks, keep existing
    for (const [key, value] of Object.entries(hooksConfig)) {
      if (!(key in existingHooks)) {
        existingHooks[key] = value;
      }
    }
    settings["hooks"] = existingHooks;
  } else {
    settings["hooks"] = hooksConfig;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}
