/**
 * Exit Interceptor Tests
 *
 * Unit tests for process.exit() interception in session mode.
 *
 * @module tests/cli/session/exit-interceptor
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 73
 */

import { describe, it, expect } from "vitest";
import {
  SessionExitSignal,
  executeWithExitGuard,
} from "../../../src/cli/session/exit-interceptor.js";

describe("SessionExitSignal", () => {
  it("should be an instance of Error", () => {
    const signal = new SessionExitSignal(0);
    expect(signal).toBeInstanceOf(Error);
  });

  it("should store exit code", () => {
    const signal = new SessionExitSignal(1);
    expect(signal.code).toBe(1);
  });

  it("should have correct name", () => {
    const signal = new SessionExitSignal(0);
    expect(signal.name).toBe("SessionExitSignal");
  });

  it("should include code in message", () => {
    const signal = new SessionExitSignal(42);
    expect(signal.message).toContain("42");
  });
});

describe("executeWithExitGuard", () => {
  it("should return 0 for successful execution", async () => {
    const code = await executeWithExitGuard(async () => {
      // No-op — success
    });
    expect(code).toBe(0);
  });

  it("should catch process.exit(0) and return 0", async () => {
    const code = await executeWithExitGuard(async () => {
      process.exit(0);
    });
    expect(code).toBe(0);
  });

  it("should catch process.exit(1) and return 1", async () => {
    const code = await executeWithExitGuard(async () => {
      process.exit(1);
    });
    expect(code).toBe(1);
  });

  it("should catch process.exit() with no argument and return 0", async () => {
    const code = await executeWithExitGuard(async () => {
      process.exit();
    });
    expect(code).toBe(0);
  });

  it("should restore original process.exit after execution", async () => {
    const originalExit = process.exit;

    await executeWithExitGuard(async () => {
      // process.exit is overridden here
    });

    // After guard, process.exit should be restored
    expect(process.exit).toBe(originalExit);
  });

  it("should restore process.exit even when function throws", async () => {
    const originalExit = process.exit;

    await expect(
      executeWithExitGuard(async () => {
        throw new Error("test error");
      }),
    ).rejects.toThrow("test error");

    // process.exit must still be restored
    expect(process.exit).toBe(originalExit);
  });

  it("should propagate non-exit errors", async () => {
    await expect(
      executeWithExitGuard(async () => {
        throw new TypeError("bad type");
      }),
    ).rejects.toThrow("bad type");
  });
});
