import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EndiorBotConfig } from "./types.js";

/**
 * Nix mode detection: When ENDIORBOT_NIX_MODE=1, the gateway is running under Nix.
 * In this mode:
 * - No auto-install flows should be attempted
 * - Missing dependencies should produce actionable Nix-specific error messages
 * - Config is managed externally (read-only from Nix perspective)
 */
export function resolveIsNixMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENDIORBOT_NIX_MODE === "1";
}

export const isNixMode = resolveIsNixMode();

const STATE_DIRNAME = ".endiorbot";
const CONFIG_FILENAME = "endiorbot.json";

function stateDir(homedir: () => string = os.homedir): string {
  return path.join(homedir(), STATE_DIRNAME);
}

/**
 * Resolve user path with ~ expansion.
 */
function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

/**
 * State directory for mutable data (sessions, logs, caches).
 * Can be overridden via ENDIORBOT_STATE_DIR.
 * Default: ~/.endiorbot
 */
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.ENDIORBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  return stateDir(homedir);
}

export const STATE_DIR = resolveStateDir();

/**
 * Config file path (JSON5).
 * Can be overridden via ENDIORBOT_CONFIG_PATH.
 * Default: ~/.endiorbot/endiorbot.json (or $ENDIORBOT_STATE_DIR/endiorbot.json)
 */
export function resolveCanonicalConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDirPath: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.ENDIORBOT_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDirPath, CONFIG_FILENAME);
}

/**
 * Resolve the active config path by preferring existing config candidates
 * before falling back to the canonical path.
 */
export function resolveConfigPathCandidate(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const candidates = resolveDefaultConfigCandidates(env, homedir);
  const existing = candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  return resolveCanonicalConfigPath(env, resolveStateDir(env, homedir));
}

/**
 * Active config path (prefers existing config files).
 */
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDirPath: string = resolveStateDir(env, os.homedir),
  homedir: () => string = os.homedir,
): string {
  const override = env.ENDIORBOT_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  const stateOverride = env.ENDIORBOT_STATE_DIR?.trim();
  const candidates = [path.join(stateDirPath, CONFIG_FILENAME)];
  const existing = candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
  if (existing) return existing;
  if (stateOverride) return path.join(stateDirPath, CONFIG_FILENAME);
  const defaultStateDir = resolveStateDir(env, homedir);
  if (path.resolve(stateDirPath) === path.resolve(defaultStateDir)) {
    return resolveConfigPathCandidate(env, homedir);
  }
  return path.join(stateDirPath, CONFIG_FILENAME);
}

export const CONFIG_PATH = resolveConfigPathCandidate();

/**
 * Resolve default config path candidates across default locations.
 * Order: explicit config path → state-dir-derived paths → new default.
 */
export function resolveDefaultConfigCandidates(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string[] {
  const explicit = env.ENDIORBOT_CONFIG_PATH?.trim();
  if (explicit) return [resolveUserPath(explicit)];

  const candidates: string[] = [];
  const endiorbotStateDir = env.ENDIORBOT_STATE_DIR?.trim();
  if (endiorbotStateDir) {
    const resolved = resolveUserPath(endiorbotStateDir);
    candidates.push(path.join(resolved, CONFIG_FILENAME));
  }

  const defaultDir = stateDir(homedir);
  candidates.push(path.join(defaultDir, CONFIG_FILENAME));
  return candidates;
}

export const DEFAULT_GATEWAY_PORT = 18790;

/**
 * Gateway lock directory (ephemeral).
 * Default: os.tmpdir()/endiorbot-<uid> (uid suffix when available).
 */
export function resolveGatewayLockDir(tmpdir: () => string = os.tmpdir): string {
  const base = tmpdir();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const suffix = uid !== undefined ? `endiorbot-${uid}` : "endiorbot";
  return path.join(base, suffix);
}

const OAUTH_FILENAME = "oauth.json";

/**
 * OAuth credentials storage directory.
 *
 * Precedence:
 * - `ENDIORBOT_OAUTH_DIR` (explicit override)
 * - `$ENDIORBOT_STATE_DIR/credentials` (canonical server/default)
 */
export function resolveOAuthDir(
  env: NodeJS.ProcessEnv = process.env,
  stateDirPath: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.ENDIORBOT_OAUTH_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDirPath, "credentials");
}

export function resolveOAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDirPath: string = resolveStateDir(env, os.homedir),
): string {
  return path.join(resolveOAuthDir(env, stateDirPath), OAUTH_FILENAME);
}

export function resolveGatewayPort(
  cfg?: EndiorBotConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envRaw = env.ENDIORBOT_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const configPort = cfg?.gateway?.port;
  if (typeof configPort === "number" && Number.isFinite(configPort)) {
    if (configPort > 0) return configPort;
  }
  return DEFAULT_GATEWAY_PORT;
}
