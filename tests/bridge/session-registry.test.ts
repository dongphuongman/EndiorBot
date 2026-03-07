/**
 * Tests for SessionRegistry
 *
 * File-backed session storage with atomic writes, version tracking, and checksum.
 *
 * @module tests/bridge/session-registry
 * @authority ADR-024
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionRegistry } from "../../src/bridge/session-registry.js";
import type { BridgeSession } from "../../src/bridge/types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeTempPath(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return join(tmpdir(), `bridge-sessions-test-${rand}.json`);
}

function makeSession(overrides: Partial<BridgeSession> = {}): BridgeSession {
  const now = new Date().toISOString();
  return {
    id: SessionRegistry.generateId(),
    agentType: "claude-code",
    tmuxTarget: "endiorbot:claudecode.0",
    tmuxSessionName: "endiorbot",
    projectPath: "/tmp/test-project",
    workspaceFingerprint: SessionRegistry.createFingerprint("/tmp/test-project", ""),
    status: "active",
    riskMode: "read",
    createdAt: now,
    lastActivityAt: now,
    ...overrides,
  };
}

interface RegistryFileRaw {
  version: number;
  checksum: string;
  sessions: unknown[];
}

// ============================================================================
// Tests
// ============================================================================

describe("SessionRegistry", () => {
  let filePath: string;
  let registry: SessionRegistry;

  beforeEach(() => {
    filePath = makeTempPath();
    registry = new SessionRegistry(filePath);
  });

  afterEach(() => {
    // Clean up temp files
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    const tmpFile = filePath + ".tmp";
    if (existsSync(tmpFile)) {
      unlinkSync(tmpFile);
    }
  });

  // --------------------------------------------------------------------------
  // getAll
  // --------------------------------------------------------------------------

  describe("getAll", () => {
    it("returns empty array when registry file does not exist", () => {
      const sessions = registry.getAll();
      expect(sessions).toEqual([]);
    });

    it("returns all sessions after adding them", () => {
      const s1 = makeSession({ id: "bridge_1_aaa" });
      const s2 = makeSession({ id: "bridge_2_bbb", agentType: "cursor" });
      registry.add(s1);
      registry.add(s2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id)).toContain("bridge_1_aaa");
      expect(all.map((s) => s.id)).toContain("bridge_2_bbb");
    });
  });

  // --------------------------------------------------------------------------
  // getActive
  // --------------------------------------------------------------------------

  describe("getActive", () => {
    it("returns only active sessions", () => {
      const active = makeSession({ id: "bridge_active_001", status: "active" });
      const stopped = makeSession({ id: "bridge_stopped_001", status: "stopped" });
      const errored = makeSession({ id: "bridge_error_001", status: "error" });

      registry.add(active);
      registry.add(stopped);
      registry.add(errored);

      const activeSessions = registry.getActive();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0]?.id).toBe("bridge_active_001");
    });
  });

  // --------------------------------------------------------------------------
  // get
  // --------------------------------------------------------------------------

  describe("get", () => {
    it("finds a session by ID", () => {
      const session = makeSession({ id: "bridge_find_me" });
      registry.add(session);

      const found = registry.get("bridge_find_me");
      expect(found).toBeDefined();
      expect(found?.id).toBe("bridge_find_me");
      expect(found?.agentType).toBe("claude-code");
    });

    it("returns undefined for a missing session ID", () => {
      const result = registry.get("bridge_does_not_exist");
      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // add
  // --------------------------------------------------------------------------

  describe("add", () => {
    it("adds a session and persists it to disk", () => {
      const session = makeSession();
      registry.add(session);

      // Read fresh registry to verify persistence
      const fresh = new SessionRegistry(filePath);
      expect(fresh.getAll()).toHaveLength(1);
      expect(fresh.get(session.id)?.id).toBe(session.id);
    });
  });

  // --------------------------------------------------------------------------
  // update
  // --------------------------------------------------------------------------

  describe("update", () => {
    it("updates session fields", () => {
      const session = makeSession({ id: "bridge_upd_001", riskMode: "read" });
      registry.add(session);

      const result = registry.update("bridge_upd_001", { riskMode: "patch" });
      expect(result).toBe(true);

      const updated = registry.get("bridge_upd_001");
      expect(updated?.riskMode).toBe("patch");
    });

    it("updates lastActivityAt on every update", () => {
      const session = makeSession({ id: "bridge_upd_002" });
      registry.add(session);

      const before = session.lastActivityAt;
      const result = registry.update("bridge_upd_002", { riskMode: "patch" });
      expect(result).toBe(true);

      const updated = registry.get("bridge_upd_002");
      // lastActivityAt should be a valid ISO string >= original
      expect(updated?.lastActivityAt).toBeDefined();
      expect(new Date(updated!.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });

    it("returns false when session ID does not exist", () => {
      const result = registry.update("bridge_nonexistent", { riskMode: "patch" });
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // markStopped
  // --------------------------------------------------------------------------

  describe("markStopped", () => {
    it("sets status to stopped", () => {
      const session = makeSession({ id: "bridge_stop_001", status: "active" });
      registry.add(session);

      const result = registry.markStopped("bridge_stop_001");
      expect(result).toBe(true);

      const stopped = registry.get("bridge_stop_001");
      expect(stopped?.status).toBe("stopped");
    });

    it("returns false for unknown session", () => {
      expect(registry.markStopped("bridge_no_session")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // markError
  // --------------------------------------------------------------------------

  describe("markError", () => {
    it("sets status to error and stores lastError", () => {
      const session = makeSession({ id: "bridge_err_001", status: "active" });
      registry.add(session);

      const result = registry.markError("bridge_err_001", "tmux session crashed");
      expect(result).toBe(true);

      const errored = registry.get("bridge_err_001");
      expect(errored?.status).toBe("error");
      expect(errored?.lastError).toBe("tmux session crashed");
    });
  });

  // --------------------------------------------------------------------------
  // remove
  // --------------------------------------------------------------------------

  describe("remove", () => {
    it("removes a session by ID", () => {
      const session = makeSession({ id: "bridge_rm_001" });
      registry.add(session);
      expect(registry.getAll()).toHaveLength(1);

      const result = registry.remove("bridge_rm_001");
      expect(result).toBe(true);
      expect(registry.getAll()).toHaveLength(0);
      expect(registry.get("bridge_rm_001")).toBeUndefined();
    });

    it("returns false when session does not exist", () => {
      expect(registry.remove("bridge_ghost")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // generateId
  // --------------------------------------------------------------------------

  describe("generateId", () => {
    it("returns a bridge_ prefixed ID", () => {
      const id = SessionRegistry.generateId();
      expect(id).toMatch(/^bridge_/);
    });

    it("generates unique IDs on each call", () => {
      const ids = Array.from({ length: 10 }, () => SessionRegistry.generateId());
      const unique = new Set(ids);
      expect(unique.size).toBe(10);
    });
  });

  // --------------------------------------------------------------------------
  // createFingerprint
  // --------------------------------------------------------------------------

  describe("createFingerprint", () => {
    it("returns a hex string of 16 characters", () => {
      const fp = SessionRegistry.createFingerprint("/some/path", "git@github.com:org/repo.git");
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it("produces the same fingerprint for the same inputs", () => {
      const fp1 = SessionRegistry.createFingerprint("/path/a", "remote-url");
      const fp2 = SessionRegistry.createFingerprint("/path/a", "remote-url");
      expect(fp1).toBe(fp2);
    });

    it("produces different fingerprints for different project paths", () => {
      const fp1 = SessionRegistry.createFingerprint("/path/a", "same-remote");
      const fp2 = SessionRegistry.createFingerprint("/path/b", "same-remote");
      expect(fp1).not.toBe(fp2);
    });

    it("works with empty git remote URL", () => {
      const fp = SessionRegistry.createFingerprint("/tmp/project", "");
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  // --------------------------------------------------------------------------
  // Atomic writes and version tracking
  // --------------------------------------------------------------------------

  describe("atomic writes and version", () => {
    it("increments version on each write", () => {
      const s1 = makeSession({ id: "bridge_v1" });
      const s2 = makeSession({ id: "bridge_v2" });

      registry.add(s1);
      registry.add(s2);

      // Read raw file to inspect version
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as RegistryFileRaw;
      // version starts at 0, incremented on each writeFile call → 2
      expect(parsed.version).toBe(2);
    });

    it("computes a non-empty checksum on write", () => {
      const session = makeSession({ id: "bridge_chk_001" });
      registry.add(session);

      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as RegistryFileRaw;
      expect(parsed.checksum).toBeTruthy();
      expect(parsed.checksum).toMatch(/^[0-9a-f]{16}$/);
    });

    it("reads correctly after atomic rename — no .tmp file left behind", () => {
      const session = makeSession({ id: "bridge_atomic_001" });
      registry.add(session);

      expect(existsSync(filePath)).toBe(true);
      expect(existsSync(filePath + ".tmp")).toBe(false);

      const found = registry.get("bridge_atomic_001");
      expect(found).toBeDefined();
    });
  });
});
