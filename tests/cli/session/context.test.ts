/**
 * Session Context Tests
 *
 * Unit tests for module-scoped session state singleton.
 *
 * @module tests/cli/session/context
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 73
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setSessionState,
  getSessionState,
  isSessionMode,
  clearSessionState,
  type SessionState,
} from "../../../src/cli/session/context.js";

function createTestState(overrides?: Partial<SessionState>): SessionState {
  return {
    project: null,
    projectPath: "/tmp/test",
    startedAt: new Date(),
    commandCount: 0,
    history: [],
    lastError: false,
    ...overrides,
  };
}

describe("SessionContext", () => {
  beforeEach(() => {
    clearSessionState();
  });

  it("should return null when no session is active", () => {
    expect(getSessionState()).toBeNull();
  });

  it("should not be in session mode when no state is set", () => {
    expect(isSessionMode()).toBe(false);
  });

  it("should set and get session state", () => {
    const state = createTestState({ projectPath: "/my/project" });
    setSessionState(state);

    const retrieved = getSessionState();
    expect(retrieved).toBe(state);
    expect(retrieved?.projectPath).toBe("/my/project");
  });

  it("should be in session mode after state is set", () => {
    setSessionState(createTestState());
    expect(isSessionMode()).toBe(true);
  });

  it("should clear session state", () => {
    setSessionState(createTestState());
    expect(isSessionMode()).toBe(true);

    clearSessionState();
    expect(isSessionMode()).toBe(false);
    expect(getSessionState()).toBeNull();
  });

  it("should allow overwriting session state", () => {
    const state1 = createTestState({ projectPath: "/project1" });
    const state2 = createTestState({ projectPath: "/project2" });

    setSessionState(state1);
    expect(getSessionState()?.projectPath).toBe("/project1");

    setSessionState(state2);
    expect(getSessionState()?.projectPath).toBe("/project2");
  });

  it("should track command count via state reference", () => {
    const state = createTestState();
    setSessionState(state);

    state.commandCount = 5;
    expect(getSessionState()?.commandCount).toBe(5);
  });
});
