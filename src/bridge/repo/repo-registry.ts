/**
 * Repo Registry
 *
 * File-backed CRUD for registered repositories at ~/.endiorbot/repos.json.
 * Follows SessionRegistry pattern: atomic writes, version+checksum.
 *
 * @module bridge/repo/repo-registry
 * @version 1.0.0
 * @authority ADR-024 D4, Sprint 83, CPO CA4
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { RepoConfig, ReposRegistryFile } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_DIR = join(homedir(), ".endiorbot");
const REGISTRY_PATH = join(REGISTRY_DIR, "repos.json");

// ============================================================================
// Path Validation (CPO CA4)
// ============================================================================

export interface PathValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a repo path for registration.
 * - Must be absolute
 * - No path traversal (..)
 * - Directory must exist
 * - Must contain .git
 */
export function validateRepoPath(pathArg: string): PathValidationResult {
  if (!isAbsolute(pathArg)) {
    return { valid: false, error: "Path must be absolute" };
  }

  if (pathArg.includes("..")) {
    return { valid: false, error: "Path traversal not allowed" };
  }

  const resolved = resolve(pathArg);

  try {
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      return { valid: false, error: "Path is not a directory" };
    }
  } catch {
    return { valid: false, error: "Directory does not exist" };
  }

  const gitPath = join(resolved, ".git");
  if (!existsSync(gitPath)) {
    return { valid: false, error: "Directory must contain .git" };
  }

  return { valid: true };
}

// ============================================================================
// Checksum
// ============================================================================

function computeChecksum(data: Omit<ReposRegistryFile, "checksum">): string {
  const payload = JSON.stringify({ version: data.version, repos: data.repos });
  return createHash("sha256").update(payload).digest("hex");
}

// ============================================================================
// RepoRegistry
// ============================================================================

export class RepoRegistry {
  private registryPath: string;

  constructor(registryPath?: string) {
    this.registryPath = registryPath ?? REGISTRY_PATH;
  }

  /**
   * Read the registry from disk. Returns empty if not found.
   */
  private read(): ReposRegistryFile {
    if (!existsSync(this.registryPath)) {
      return { version: 0, checksum: "", repos: [] };
    }

    try {
      const raw = readFileSync(this.registryPath, "utf-8");
      return JSON.parse(raw) as ReposRegistryFile;
    } catch {
      return { version: 0, checksum: "", repos: [] };
    }
  }

  /**
   * Write the registry to disk atomically with version+checksum.
   * Uses write-to-tmp + renameSync pattern (MF-3).
   */
  private write(data: ReposRegistryFile): void {
    const dir = join(this.registryPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    data.version += 1;
    data.checksum = computeChecksum(data);
    const tmpPath = this.registryPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmpPath, this.registryPath);
  }

  /**
   * Add a repository. Validates path per CPO CA4.
   */
  add(
    name: string,
    path: string,
    opts?: { defaultBranch?: string; riskProfile?: RepoConfig["riskProfile"]; envAllowlist?: string[] },
  ): { success: boolean; error?: string } {
    const validation = validateRepoPath(path);
    if (!validation.valid) {
      return { success: false, error: validation.error ?? "Invalid path" };
    }

    const registry = this.read();

    // Check duplicate name
    if (registry.repos.some((r) => r.name === name)) {
      return { success: false, error: `Repo "${name}" already exists` };
    }

    const repo: RepoConfig = {
      name,
      path: resolve(path),
      registeredAt: new Date().toISOString(),
    };
    if (opts?.defaultBranch) repo.defaultBranch = opts.defaultBranch;
    if (opts?.riskProfile) repo.riskProfile = opts.riskProfile;
    if (opts?.envAllowlist) repo.envAllowlist = opts.envAllowlist;

    registry.repos.push(repo);
    this.write(registry);

    return { success: true };
  }

  /**
   * Get a repository by name.
   */
  get(name: string): RepoConfig | null {
    const registry = this.read();
    return registry.repos.find((r) => r.name === name) ?? null;
  }

  /**
   * List all registered repositories.
   */
  list(): RepoConfig[] {
    return this.read().repos;
  }

  /**
   * Remove a repository by name.
   */
  remove(name: string): boolean {
    const registry = this.read();
    const idx = registry.repos.findIndex((r) => r.name === name);
    if (idx === -1) return false;

    registry.repos.splice(idx, 1);
    this.write(registry);
    return true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalRepoRegistry: RepoRegistry | undefined;

export function getRepoRegistry(): RepoRegistry {
  if (!globalRepoRegistry) {
    globalRepoRegistry = new RepoRegistry();
  }
  return globalRepoRegistry;
}

export function resetRepoRegistry(): void {
  globalRepoRegistry = undefined;
}
