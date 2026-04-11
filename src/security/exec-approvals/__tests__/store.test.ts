/**
 * Unit tests for store.ts
 *
 * @module security/exec-approvals/__tests__/store
 * @sprint 132 M1
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  readStore,
  writeStore,
  getPreset,
  setPreset,
  addAllowPattern,
  addDenyPattern,
  defaultStore,
} from "../store.js";

// Use a temp directory for store isolation
let tmpStateDir: string;

beforeEach(() => {
  tmpStateDir = join(tmpdir(), `endiorbot-test-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpStateDir, { recursive: true });
  process.env["ENDIORBOT_STATE_DIR"] = tmpStateDir;
});

afterEach(() => {
  delete process.env["ENDIORBOT_STATE_DIR"];
  try {
    rmSync(tmpStateDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

describe("store", () => {
  describe("defaultStore", () => {
    it("returns balanced preset", () => {
      const s = defaultStore();
      expect(s.preset).toBe("balanced");
    });

    it("returns empty extra lists", () => {
      const s = defaultStore();
      expect(s.extraAllowlist).toHaveLength(0);
      expect(s.extraHardDeny).toHaveLength(0);
    });
  });

  describe("readStore / writeStore round-trip", () => {
    it("returns default when file does not exist", () => {
      const s = readStore();
      expect(s.preset).toBe("balanced");
    });

    it("round-trips a written store", () => {
      const store = { preset: "strict" as const, extraAllowlist: ["echo *"], extraHardDeny: ["danger *"], updatedAt: "2026-04-11T00:00:00.000Z" };
      writeStore(store);
      const read = readStore();
      expect(read.preset).toBe("strict");
      expect(read.extraAllowlist).toContain("echo *");
      expect(read.extraHardDeny).toContain("danger *");
    });

    it("atomic write creates tmp then renames", () => {
      // After writeStore, only the .json file exists (not .json.tmp)
      const store = defaultStore();
      writeStore(store);
      const storePath = join(tmpStateDir, "exec-policy", "approvals.json");
      expect(existsSync(storePath)).toBe(true);
      expect(existsSync(`${storePath}.tmp`)).toBe(false);
    });
  });

  describe("corrupted file recovery", () => {
    it("falls back to balanced default on JSON parse error", () => {
      const storeDir = join(tmpStateDir, "exec-policy");
      mkdirSync(storeDir, { recursive: true });
      writeFileSync(join(storeDir, "approvals.json"), "{ broken json }", "utf-8");

      const s = readStore();
      expect(s.preset).toBe("balanced");
    });

    it("falls back to balanced on null value", () => {
      const storeDir = join(tmpStateDir, "exec-policy");
      mkdirSync(storeDir, { recursive: true });
      writeFileSync(join(storeDir, "approvals.json"), "null", "utf-8");

      const s = readStore();
      expect(s.preset).toBe("balanced");
    });

    it("falls back for invalid preset value", () => {
      const storeDir = join(tmpStateDir, "exec-policy");
      mkdirSync(storeDir, { recursive: true });
      writeFileSync(
        join(storeDir, "approvals.json"),
        JSON.stringify({ preset: "yolo", extraAllowlist: [], extraHardDeny: [], updatedAt: "x" }),
        "utf-8"
      );
      const s = readStore();
      expect(s.preset).toBe("balanced");
    });
  });

  describe("getPreset / setPreset", () => {
    it("getPreset returns balanced by default", () => {
      expect(getPreset()).toBe("balanced");
    });

    it("setPreset updates and returns previous", () => {
      const prev = setPreset("strict");
      expect(prev).toBe("balanced");
      expect(getPreset()).toBe("strict");
    });

    it("setPreset persists across reads", () => {
      setPreset("open");
      const s = readStore();
      expect(s.preset).toBe("open");
    });
  });

  describe("addAllowPattern / addDenyPattern", () => {
    it("adds pattern to extraAllowlist", () => {
      addAllowPattern("echo *");
      const s = readStore();
      expect(s.extraAllowlist).toContain("echo *");
    });

    it("does not add duplicate allowlist patterns", () => {
      addAllowPattern("echo *");
      addAllowPattern("echo *");
      const s = readStore();
      expect(s.extraAllowlist.filter((p) => p === "echo *")).toHaveLength(1);
    });

    it("adds pattern to extraHardDeny", () => {
      addDenyPattern("danger *");
      const s = readStore();
      expect(s.extraHardDeny).toContain("danger *");
    });

    it("does not add duplicate deny patterns", () => {
      addDenyPattern("danger *");
      addDenyPattern("danger *");
      const s = readStore();
      expect(s.extraHardDeny.filter((p) => p === "danger *")).toHaveLength(1);
    });
  });
});
