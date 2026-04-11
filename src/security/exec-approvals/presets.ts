/**
 * Exec-Policy Preset Definitions
 *
 * Concrete definitions for open / balanced / strict presets.
 * HARD_DENY_BASE applies to all presets.
 *
 * Locked names: open / balanced / strict (ADR-046).
 * openclaw lineage: yolo / cautious / deny-all (code comment only).
 *
 * @module security/exec-approvals/presets
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL §5
 * @sprint 132
 */

import type { EffectivePolicy, Preset } from "./types.js";

// ============================================================================
// Hard-deny base (all presets inherit this list)
// ============================================================================

/**
 * Commands that are hard-denied regardless of preset.
 *
 * This list is LOCKED for M1. Additions require CEO approval in a follow-up sprint.
 * See: docs/02-design/14-Technical-Specs/M1-exec-policy-design.md §5
 */
export const HARD_DENY_BASE: string[] = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "rm -rf $HOME",
  "git push --force *",
  "git push -f *",
  "git push * main --force",
  "git push * master --force",
  "git reset --hard origin/main",
  "git reset --hard origin/master",
  "sudo *",
  "curl * | sh",
  "curl * | bash",
  "wget * | sh",
  "wget * | bash",
  "DROP TABLE *",
  "DROP DATABASE *",
  ":(){ :|:& };:", // fork bomb
  "dd if=* of=/dev/*",
  "mkfs *",
  "mkfs.*",
  "chmod -R 777 /",
  "chown -R * /",
  "> /dev/sda*",
  "> /dev/nvme*",
];

// ============================================================================
// Balanced preset allowlist
// ============================================================================

const BALANCED_ALLOWLIST: string[] = [
  // Read-only FS
  "ls",
  "ls *",
  "cat *",
  "pwd",
  "tree",
  "stat *",
  "file *",
  // Search
  "rg *",
  "grep *",
  "find * -name *",
  "find * -type *",
  // Git read
  "git status",
  "git log",
  "git log *",
  "git diff",
  "git diff *",
  "git show *",
  "git branch",
  "git branch -a",
  "git remote -v",
  // Node ecosystem read
  "pnpm test",
  "pnpm test *",
  "pnpm build",
  "pnpm lint",
  "pnpm typecheck",
  "node --version",
  "pnpm --version",
  // EndiorBot self
  "./endiorbot.mjs status",
  "./endiorbot.mjs gate *",
  "./endiorbot.mjs compliance *",
  "./endiorbot.mjs commands",
];

// ============================================================================
// Preset definitions
// ============================================================================

/**
 * strict preset — deny-by-default; every command prompts.
 * openclaw lineage: deny-all
 */
export const STRICT_PRESET: Omit<EffectivePolicy, "preset"> = {
  allowlist: [], // empty — deny-by-default
  hardDeny: HARD_DENY_BASE,
  askMode: "always",
};

/**
 * balanced preset — curated allowlist; mutating commands prompt.
 * openclaw lineage: cautious
 */
export const BALANCED_PRESET: Omit<EffectivePolicy, "preset"> = {
  allowlist: BALANCED_ALLOWLIST,
  hardDeny: HARD_DENY_BASE,
  askMode: "on-miss",
};

/**
 * open preset — permissive allowlist; only hard-deny blocks.
 * openclaw lineage: yolo
 */
export const OPEN_PRESET: Omit<EffectivePolicy, "preset"> = {
  allowlist: [
    ...BALANCED_ALLOWLIST,
    // Write-ish but reversible via PatchManager
    "git add *",
    "git commit *",
    "git checkout *",
    "git stash *",
    "pnpm install",
    "pnpm add *",
    "pnpm remove *",
    "mkdir *",
    "mkdir -p *",
    "touch *",
    // Editors' save path is file writes via tool use, not Bash
  ],
  hardDeny: HARD_DENY_BASE,
  askMode: "off",
};

/**
 * Get the base preset definition (without store overrides) for a given preset name.
 */
export function getPresetBase(preset: Preset): Omit<EffectivePolicy, "preset"> {
  switch (preset) {
    case "strict":
      return STRICT_PRESET;
    case "balanced":
      return BALANCED_PRESET;
    case "open":
      return OPEN_PRESET;
  }
}

/**
 * Build a full EffectivePolicy from a preset name (no store overrides).
 */
export function buildPresetPolicy(preset: Preset): EffectivePolicy {
  const base = getPresetBase(preset);
  return { preset, ...base };
}
