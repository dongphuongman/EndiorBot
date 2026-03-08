/**
 * ChatFocusManager Tests (Sprint 83)
 *
 * Tests for per-chat focus tracking.
 *
 * @module tests/bridge/repo/chat-focus
 * @authority ADR-024 D4, Sprint 83
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatFocusManager } from "../../../src/bridge/repo/chat-focus.js";

// ============================================================================
// Setup
// ============================================================================

let tempDir: string;
let focusPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "chat-focus-test-"));
  focusPath = join(tempDir, "chat-focus.json");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ============================================================================
// Tests
// ============================================================================

describe("ChatFocusManager", () => {
  it("returns null for unfocused chat", () => {
    const manager = new ChatFocusManager(focusPath);
    expect(manager.getFocus("12345")).toBeNull();
  });

  it("sets and gets focus", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("12345", "endiorbot");

    const focus = manager.getFocus("12345");
    expect(focus).not.toBeNull();
    expect(focus!.chatId).toBe("12345");
    expect(focus!.repoName).toBe("endiorbot");
    expect(focus!.setAt).toBeTruthy();
  });

  it("overwrites existing focus", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("12345", "repo-a");
    manager.setFocus("12345", "repo-b");

    const focus = manager.getFocus("12345");
    expect(focus!.repoName).toBe("repo-b");
  });

  it("supports multiple chats independently", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("chat1", "repo-a");
    manager.setFocus("chat2", "repo-b");

    expect(manager.getFocus("chat1")!.repoName).toBe("repo-a");
    expect(manager.getFocus("chat2")!.repoName).toBe("repo-b");
  });

  it("clears focus for a chat", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("12345", "endiorbot");
    expect(manager.getFocus("12345")).not.toBeNull();

    const cleared = manager.clearFocus("12345");
    expect(cleared).toBe(true);
    expect(manager.getFocus("12345")).toBeNull();
  });

  it("clearFocus returns false for unfocused chat", () => {
    const manager = new ChatFocusManager(focusPath);
    expect(manager.clearFocus("nonexistent")).toBe(false);
  });

  it("clearFocus does not affect other chats", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("chat1", "repo-a");
    manager.setFocus("chat2", "repo-b");
    manager.clearFocus("chat1");

    expect(manager.getFocus("chat1")).toBeNull();
    expect(manager.getFocus("chat2")!.repoName).toBe("repo-b");
  });

  it("persists across instances", () => {
    const manager1 = new ChatFocusManager(focusPath);
    manager1.setFocus("12345", "endiorbot");

    const manager2 = new ChatFocusManager(focusPath);
    expect(manager2.getFocus("12345")!.repoName).toBe("endiorbot");
  });

  it("handles corrupted file gracefully", () => {
    writeFileSync(focusPath, "not-json-{{{", "utf-8");

    const manager = new ChatFocusManager(focusPath);
    expect(manager.getFocus("12345")).toBeNull();

    // Can still write after corruption
    manager.setFocus("12345", "endiorbot");
    expect(manager.getFocus("12345")!.repoName).toBe("endiorbot");
  });

  it("increments version on each write", () => {
    const manager = new ChatFocusManager(focusPath);
    manager.setFocus("chat1", "repo-a");
    manager.setFocus("chat2", "repo-b");

    const raw = JSON.parse(readFileSync(focusPath, "utf-8"));
    expect(raw.version).toBe(2);
    expect(raw.checksum).toBeTruthy();
  });
});
