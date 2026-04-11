/**
 * Exec-Policy Persistent Store
 *
 * Reads/writes the exec-policy configuration to disk at:
 *   ~/.endiorbot/exec-policy/approvals.json
 *
 * Atomic write: tmp file → rename.
 * Corrupted-file recovery: falls back to balanced preset with stderr + audit log.
 *
 * @module security/exec-approvals/store
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL, M1-exec-policy-design.md §2.1
 * @sprint 132
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import type { Preset } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Persisted store shape.
 */
export interface ExecPolicyStore {
  /** Active preset */
  preset: Preset;
  /** User-added allowlist entries (layered on top of preset) */
  extraAllowlist: string[];
  /** User-added hard-deny entries (layered on top of preset) */
  extraHardDeny: string[];
  /** Last mutation timestamp (ISO 8601) */
  updatedAt: string;
}

// ============================================================================
// Paths
// ============================================================================

/**
 * Get the path to the store file.
 */
export function getStorePath(): string {
  const base = process.env["ENDIORBOT_STATE_DIR"] ?? join(homedir(), ".endiorbot");
  return join(base, "exec-policy", "approvals.json");
}

/**
 * Default store (balanced preset, no overrides).
 */
export function defaultStore(): ExecPolicyStore {
  return {
    preset: "balanced",
    extraAllowlist: [],
    extraHardDeny: [],
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Read / Write
// ============================================================================

/**
 * Read the store from disk.
 *
 * Fallback to balanced default if the file is missing or corrupt.
 */
export function readStore(): ExecPolicyStore {
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    return defaultStore();
  }
  try {
    const raw = readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return validateStore(parsed);
  } catch (err) {
    process.stderr.write(
      `[exec-policy] store read error — falling back to balanced default: ${String(err)}\n`
    );
    return defaultStore();
  }
}

/**
 * Write the store to disk atomically (tmp → rename).
 *
 * Creates directories if they do not exist.
 */
export function writeStore(store: ExecPolicyStore): void {
  const storePath = getStorePath();
  const dir = dirname(storePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${storePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  renameSync(tmpPath, storePath);
}

// ============================================================================
// Public CRUD
// ============================================================================

/**
 * Get the current preset.
 */
export function getPreset(): Preset {
  return readStore().preset;
}

/**
 * Set the active preset.
 *
 * @returns Previous preset value.
 */
export function setPreset(preset: Preset): Preset {
  const store = readStore();
  const previousPreset = store.preset;
  store.preset = preset;
  store.updatedAt = new Date().toISOString();
  writeStore(store);
  return previousPreset;
}

/**
 * Add a pattern to the persistent allowlist.
 */
export function addAllowPattern(pattern: string): void {
  const store = readStore();
  if (!store.extraAllowlist.includes(pattern)) {
    store.extraAllowlist.push(pattern);
    store.updatedAt = new Date().toISOString();
    writeStore(store);
  }
}

/**
 * Add a pattern to the persistent hard-deny list.
 */
export function addDenyPattern(pattern: string): void {
  const store = readStore();
  if (!store.extraHardDeny.includes(pattern)) {
    store.extraHardDeny.push(pattern);
    store.updatedAt = new Date().toISOString();
    writeStore(store);
  }
}

// ============================================================================
// Validation
// ============================================================================

const VALID_PRESETS: Preset[] = ["open", "balanced", "strict"];

function isValidPreset(value: unknown): value is Preset {
  return typeof value === "string" && (VALID_PRESETS as string[]).includes(value);
}

/**
 * Validate a raw parsed object as ExecPolicyStore.
 * Falls back to balanced default for any invalid field.
 */
function validateStore(raw: unknown): ExecPolicyStore {
  if (raw === null || typeof raw !== "object") {
    return defaultStore();
  }
  const obj = raw as Record<string, unknown>;
  const preset = isValidPreset(obj["preset"]) ? obj["preset"] : "balanced";
  const extraAllowlist = Array.isArray(obj["extraAllowlist"])
    ? (obj["extraAllowlist"] as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const extraHardDeny = Array.isArray(obj["extraHardDeny"])
    ? (obj["extraHardDeny"] as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const updatedAt =
    typeof obj["updatedAt"] === "string" ? obj["updatedAt"] : new Date().toISOString();
  return { preset, extraAllowlist, extraHardDeny, updatedAt };
}
