/**
 * Tests for session handoff.
 *
 * @module tests/memory/session-handoff
 * @sprint 120 — Track B2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  const { join: pathJoin } = await import("node:path");
  return {
    ...os,
    homedir: () => pathJoin(os.tmpdir(), "endiorbot-handoff-test"),
  };
});

let testBaseDir: string;

import {
  createHandoff,
  saveHandoff,
  loadLatestHandoff,
  loadAllHandoffs,
} from "../../src/memory/session-handoff.js";
import type { SessionHandoff } from "../../src/memory/types.js";

beforeEach(() => {
  testBaseDir = join(tmpdir(), "endiorbot-handoff-test");
});

function makeHandoff(overrides: Partial<Omit<SessionHandoff, "createdAt">> = {}): Omit<SessionHandoff, "createdAt"> {
  return {
    sessionId: overrides.sessionId ?? `sess-${randomUUID().slice(0, 8)}`,
    workingOn: overrides.workingOn ?? ["fixing bug #123"],
    blocked: overrides.blocked ?? [],
    nextSteps: overrides.nextSteps ?? ["run tests"],
    decisions: overrides.decisions ?? ["use PostgreSQL"],
    openQuestions: overrides.openQuestions ?? [],
    agentSource: overrides.agentSource ?? "@coder",
  };
}

afterEach(() => {
  try {
    rmSync(testBaseDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe("createHandoff", () => {
  it("adds createdAt timestamp", () => {
    const data = makeHandoff();
    const handoff = createHandoff(data);
    expect(handoff.createdAt).toBeDefined();
    expect(() => new Date(handoff.createdAt)).not.toThrow();
  });

  it("preserves all input fields", () => {
    const data = makeHandoff({
      sessionId: "sess-abc",
      workingOn: ["task A", "task B"],
      blocked: ["needs API key"],
      nextSteps: ["deploy"],
      decisions: ["use Redis"],
      openQuestions: ["what cache TTL?"],
      agentSource: "@architect",
    });
    const handoff = createHandoff(data);
    expect(handoff.sessionId).toBe("sess-abc");
    expect(handoff.workingOn).toEqual(["task A", "task B"]);
    expect(handoff.blocked).toEqual(["needs API key"]);
    expect(handoff.nextSteps).toEqual(["deploy"]);
    expect(handoff.decisions).toEqual(["use Redis"]);
    expect(handoff.openQuestions).toEqual(["what cache TTL?"]);
    expect(handoff.agentSource).toBe("@architect");
  });
});

describe("saveHandoff", () => {
  it("creates directory structure if missing", () => {
    const handoff = createHandoff(makeHandoff({ sessionId: "sess-save-1" }));
    // Should not throw — directory created automatically
    saveHandoff("test-project", handoff);
  });

  it("writes JSON file named {sessionId}.json", () => {
    const handoff = createHandoff(makeHandoff({ sessionId: "sess-save-2" }));
    saveHandoff("test-project", handoff);
    const loaded = loadLatestHandoff("test-project");
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe("sess-save-2");
  });
});

describe("loadLatestHandoff", () => {
  it("returns null for non-existent project", () => {
    const result = loadLatestHandoff("nonexistent-project");
    expect(result).toBeNull();
  });

  it("returns the most recently modified handoff", () => {
    const h1 = createHandoff(makeHandoff({ sessionId: "sess-old" }));
    saveHandoff("proj-latest", h1);

    // Force older mtime on first file to avoid CI flake (same-tick writes)
    const handoffDir = join(testBaseDir, ".endiorbot", "memory", "proj-latest", "handoffs");
    utimesSync(join(handoffDir, "sess-old.json"), new Date("2020-01-01"), new Date("2020-01-01"));

    const h2 = createHandoff(makeHandoff({ sessionId: "sess-new" }));
    saveHandoff("proj-latest", h2);

    const latest = loadLatestHandoff("proj-latest");
    expect(latest).not.toBeNull();
    expect(latest!.sessionId).toBe("sess-new");
  });

  it("skips malformed JSON files", () => {
    const projectId = "proj-malformed";
    const handoffDir = join(testBaseDir, ".endiorbot", "memory", projectId, "handoffs");
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, "bad.json"), "not valid json{{{", "utf-8");

    const result = loadLatestHandoff(projectId);
    expect(result).toBeNull();
  });
});

describe("loadAllHandoffs", () => {
  it("returns empty array for non-existent project", () => {
    const result = loadAllHandoffs("nonexistent-all");
    expect(result).toEqual([]);
  });

  it("returns handoffs sorted by createdAt ascending", () => {
    const projectId = "proj-all-sorted";
    const h1 = createHandoff(makeHandoff({ sessionId: "sess-first" }));
    h1.createdAt = "2026-01-01T00:00:00.000Z";
    saveHandoff(projectId, h1);

    const h2 = createHandoff(makeHandoff({ sessionId: "sess-second" }));
    h2.createdAt = "2026-02-01T00:00:00.000Z";
    saveHandoff(projectId, h2);

    const h3 = createHandoff(makeHandoff({ sessionId: "sess-third" }));
    h3.createdAt = "2026-03-01T00:00:00.000Z";
    saveHandoff(projectId, h3);

    const all = loadAllHandoffs(projectId);
    expect(all).toHaveLength(3);
    expect(all[0].sessionId).toBe("sess-first");
    expect(all[2].sessionId).toBe("sess-third");
  });

  it("save then load round-trip preserves all fields", () => {
    const projectId = "proj-roundtrip";
    const data = makeHandoff({
      sessionId: "sess-rt",
      workingOn: ["coding", "testing"],
      blocked: ["needs review"],
      nextSteps: ["deploy to staging"],
      decisions: ["chose Vitest"],
      openQuestions: ["which CI?"],
      agentSource: "@fullstack",
    });
    const handoff = createHandoff(data);
    saveHandoff(projectId, handoff);

    const loaded = loadAllHandoffs(projectId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].sessionId).toBe("sess-rt");
    expect(loaded[0].workingOn).toEqual(["coding", "testing"]);
    expect(loaded[0].blocked).toEqual(["needs review"]);
    expect(loaded[0].agentSource).toBe("@fullstack");
  });
});
