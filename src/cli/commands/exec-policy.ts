/**
 * Exec-Policy CLI Subcommand — M1, Sprint 132
 *
 * Manages the command-allowlist layer that fires BEFORE Autonomy Gates A/B/C.
 *
 * Subcommands:
 *   show                     — Current preset, effective allowlist, last-mutation timestamp
 *   preset <open|balanced|strict>  — Set session-level preset
 *   allow <pattern>          — Add pattern to persistent allowlist
 *   deny <pattern>           — Add pattern to persistent hard-deny list
 *   list                     — Dump effective allowlist + hard-deny list
 *   audit [--tail N]         — Read last N records from exec-policy.log (default 50)
 *
 * Preset names: open / balanced / strict (LOCKED per ADR-046).
 * openclaw lineage names (yolo / cautious / deny-all) are code-comment-only.
 *
 * Usage:
 *   endiorbot exec-policy show
 *   endiorbot exec-policy preset balanced
 *   endiorbot exec-policy allow "pnpm run *"
 *   endiorbot exec-policy deny "curl *"
 *   endiorbot exec-policy list --json
 *   endiorbot exec-policy audit --tail 100
 *
 * @module cli/commands/exec-policy
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL, M1-exec-policy-design.md §1
 * @sprint 132
 */

import type { Command } from "commander";
import {
  setPreset,
  getEffectivePolicy,
  readAuditTail,
  type Preset,
  type ExecPolicyAuditRecord,
} from "../../security/exec-approvals/index.js";
import { addAllowPattern, addDenyPattern, readStore } from "../../security/exec-approvals/store.js";
import { getAuditLogPath } from "../../security/exec-approvals/audit.js";

// ============================================================================
// Validation
// ============================================================================

const VALID_PRESETS: Preset[] = ["open", "balanced", "strict"];

function assertValidPreset(value: string): asserts value is Preset {
  if (!(VALID_PRESETS as string[]).includes(value)) {
    console.error(
      `Invalid preset "${value}". Valid values: open, balanced, strict`
    );
    process.exit(1);
  }
}

// ============================================================================
// Output helpers
// ============================================================================

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(rows: [string, string][]): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length), 10);
  for (const [key, val] of rows) {
    console.log(`  ${key.padEnd(maxKey + 2)} ${val}`);
  }
}

function formatAuditRecord(r: ExecPolicyAuditRecord): string {
  const decision = r.decision.toUpperCase().padEnd(14);
  const preset = r.preset.padEnd(9);
  return `${r.timestamp}  ${decision}  ${preset}  [${r.gate}]  ${r.agent}  ${r.command}`;
}

// ============================================================================
// Subcommand handlers
// ============================================================================

function handleShow(options: { json?: boolean }): void {
  const store = readStore();
  const policy = getEffectivePolicy();
  const auditPath = getAuditLogPath();

  if (options.json) {
    printJson({
      preset: policy.preset,
      allowlistCount: policy.allowlist.length,
      hardDenyCount: policy.hardDeny.length,
      askMode: policy.askMode,
      lastMutated: store.updatedAt,
      auditLog: auditPath,
    });
    return;
  }

  console.log("\nExec-Policy Status");
  console.log("=".repeat(40));
  printTable([
    ["Preset", policy.preset],
    ["Ask mode", policy.askMode],
    ["Allowlist entries", String(policy.allowlist.length)],
    ["Hard-deny entries", String(policy.hardDeny.length)],
    ["Last mutated", store.updatedAt],
    ["Audit log", auditPath],
  ]);
  console.log();
}

function handlePreset(presetArg: string, options: { json?: boolean }): void {
  assertValidPreset(presetArg);
  const previous = setPreset(presetArg);

  if (options.json) {
    printJson({ preset: presetArg, previousPreset: previous, updatedAt: new Date().toISOString() });
    return;
  }
  console.log(`Preset updated: ${previous} → ${presetArg}`);
}

function handleAllow(pattern: string, options: { json?: boolean }): void {
  addAllowPattern(pattern);

  if (options.json) {
    printJson({ added: pattern, list: "allowlist" });
    return;
  }
  console.log(`Allowlist pattern added: ${pattern}`);
}

function handleDeny(pattern: string, options: { json?: boolean }): void {
  addDenyPattern(pattern);

  if (options.json) {
    printJson({ added: pattern, list: "hardDeny" });
    return;
  }
  console.log(`Hard-deny pattern added: ${pattern}`);
}

function handleList(options: { json?: boolean }): void {
  const policy = getEffectivePolicy();

  if (options.json) {
    printJson({
      preset: policy.preset,
      allowlist: policy.allowlist,
      hardDeny: policy.hardDeny,
    });
    return;
  }

  console.log(`\nPreset: ${policy.preset} (askMode: ${policy.askMode})\n`);
  console.log("Allowlist:");
  for (const p of policy.allowlist) {
    console.log(`  + ${p}`);
  }
  console.log("\nHard-deny:");
  for (const p of policy.hardDeny) {
    console.log(`  - ${p}`);
  }
  console.log();
}

function handleAudit(options: { json?: boolean; tail?: string }): void {
  const n = options.tail !== undefined ? parseInt(options.tail, 10) : 50;
  const records = readAuditTail(isNaN(n) ? 50 : n);

  if (options.json) {
    printJson(records);
    return;
  }

  if (records.length === 0) {
    console.log("No audit records found.");
    return;
  }

  console.log(`\nLast ${records.length} exec-policy audit records:\n`);
  console.log("timestamp                  decision        preset     gate  agent  command");
  console.log("-".repeat(100));
  for (const r of records) {
    console.log(formatAuditRecord(r));
  }
  console.log();
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register the exec-policy command on a Commander program instance.
 *
 * Subcommands: show, preset, allow, deny, list, audit
 */
export function registerExecPolicyCommand(program: Command): void {
  const cmd = program
    .command("exec-policy")
    .description(
      "Manage exec-policy command allowlist (fires BEFORE Autonomy Gates A/B/C)"
    );

  // --- show ---
  cmd
    .command("show")
    .description("Show current preset, effective allowlist, and audit log pointer")
    .option("--json", "Output machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      handleShow(opts);
    });

  // --- preset ---
  cmd
    .command("preset <name>")
    .description("Set the active preset (open | balanced | strict)")
    .option("--json", "Output machine-readable JSON")
    .action((name: string, opts: { json?: boolean }) => {
      handlePreset(name, opts);
    });

  // --- allow ---
  cmd
    .command("allow <pattern>")
    .description("Add a glob pattern to the persistent allowlist")
    .option("--json", "Output machine-readable JSON")
    .action((pattern: string, opts: { json?: boolean }) => {
      handleAllow(pattern, opts);
    });

  // --- deny ---
  cmd
    .command("deny <pattern>")
    .description("Add a glob pattern to the persistent hard-deny list")
    .option("--json", "Output machine-readable JSON")
    .action((pattern: string, opts: { json?: boolean }) => {
      handleDeny(pattern, opts);
    });

  // --- list ---
  cmd
    .command("list")
    .description("Dump the full effective allowlist and hard-deny list")
    .option("--json", "Output machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      handleList(opts);
    });

  // --- audit ---
  cmd
    .command("audit")
    .description("Read recent records from the exec-policy audit log")
    .option("--tail <n>", "Number of records to show (default 50)")
    .option("--json", "Output machine-readable JSON")
    .action((opts: { json?: boolean; tail?: string }) => {
      handleAudit(opts);
    });
}
