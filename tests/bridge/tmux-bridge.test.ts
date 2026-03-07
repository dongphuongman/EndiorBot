/**
 * Tests for TmuxBridge
 *
 * Interface to tmux for managing AI agent panes.
 * Uses execFile (not exec) to prevent shell injection.
 * sendKeys uses paste-buffer for reliability (CTO M1).
 *
 * @module tests/bridge/tmux-bridge
 * @authority ADR-024 A6
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mock node:child_process before importing the SUT
// ============================================================================

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Static imports resolved AFTER vi.mock hoisting
import { execFile } from "node:child_process";
import { TmuxBridge } from "../../src/bridge/tmux/tmux-bridge.js";

// Typed reference to the mock so we get call-tracking
const mockExecFile = execFile as ReturnType<typeof vi.fn>;

// ============================================================================
// Helpers
// ============================================================================

interface FakeStdin {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

interface FakeChild {
  stdin: FakeStdin;
}

function makeChildProcess(): FakeChild {
  return {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
  };
}

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

/**
 * Configure execFile mock to resolve with given stdout/stderr.
 */
function mockSuccess(stdout: string, stderr = ""): void {
  mockExecFile.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      const child = makeChildProcess();
      cb(null, stdout, stderr);
      return child;
    }
  );
}

/**
 * Configure execFile mock to reject with given error message.
 */
function mockError(message: string): void {
  mockExecFile.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
      const child = makeChildProcess();
      cb(new Error(message), "", "");
      return child;
    }
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("TmuxBridge", () => {
  let bridge: TmuxBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new TmuxBridge();
  });

  // --------------------------------------------------------------------------
  // isAvailable
  // --------------------------------------------------------------------------

  describe("isAvailable", () => {
    it("returns version string when tmux is installed", async () => {
      mockSuccess("tmux 3.3a\n");

      const version = await bridge.isAvailable();
      expect(version).toBe("tmux 3.3a");
    });

    it("returns null when tmux binary is not found", async () => {
      mockError("spawn tmux ENOENT");

      const version = await bridge.isAvailable();
      expect(version).toBeNull();
    });

    it("calls execFile with the -V flag", async () => {
      mockSuccess("tmux 3.3a\n");

      await bridge.isAvailable();

      expect(mockExecFile).toHaveBeenCalledWith(
        "tmux",
        ["-V"],
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function)
      );
    });
  });

  // --------------------------------------------------------------------------
  // createSession
  // --------------------------------------------------------------------------

  describe("createSession", () => {
    it("calls new-session when tmux session does not exist", async () => {
      // Call order: has-session → new-session → display-message
      mockExecFile
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(new Error("no such session"), "", "");
            return makeChildProcess();
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return makeChildProcess();
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "0\n", "");
            return makeChildProcess();
          }
        );

      const info = await bridge.createSession("claudecode", "claude", "endiorbot");

      const newSessionCall = mockExecFile.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("new-session")
      );
      expect(newSessionCall).toBeDefined();

      const args = newSessionCall![1] as string[];
      expect(args).toContain("-s");
      expect(args).toContain("endiorbot");
      expect(args).toContain("-n");
      expect(args).toContain("claudecode");

      expect(info.sessionName).toBe("endiorbot");
      expect(info.windowName).toBe("claudecode");
      expect(info.target).toBe("endiorbot:claudecode.0");
    });

    it("calls new-window when tmux session already exists", async () => {
      // Call order: has-session (success) → new-window → display-message
      mockExecFile
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return makeChildProcess();
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return makeChildProcess();
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "1\n", "");
            return makeChildProcess();
          }
        );

      const info = await bridge.createSession("cursor", "cursor agent --force", "endiorbot");

      const newWindowCall = mockExecFile.mock.calls.find(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("new-window")
      );
      expect(newWindowCall).toBeDefined();
      expect(info.windowName).toBe("cursor");
    });
  });

  // --------------------------------------------------------------------------
  // sendKeys
  // --------------------------------------------------------------------------

  describe("sendKeys", () => {
    it("uses load-buffer then paste-buffer — not send-keys char-by-char", async () => {
      // load-buffer → success, paste-buffer → success
      mockExecFile
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            const child = makeChildProcess();
            cb(null, "", "");
            return child;
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return makeChildProcess();
          }
        );

      await bridge.sendKeys("endiorbot:claudecode.0", "hello world\n");

      expect(mockExecFile).toHaveBeenCalledTimes(2);

      const firstArgs = mockExecFile.mock.calls[0]![1] as string[];
      expect(firstArgs[0]).toBe("load-buffer");
      expect(firstArgs).toContain("-b");
      expect(firstArgs).toContain("bridge");

      const secondArgs = mockExecFile.mock.calls[1]![1] as string[];
      expect(secondArgs[0]).toBe("paste-buffer");
      expect(secondArgs).toContain("-t");
      expect(secondArgs).toContain("endiorbot:claudecode.0");
    });

    it("writes text to child stdin during load-buffer step", async () => {
      const fakeChild = makeChildProcess();

      mockExecFile
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return fakeChild;
          }
        )
        .mockImplementationOnce(
          (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
            cb(null, "", "");
            return makeChildProcess();
          }
        );

      await bridge.sendKeys("endiorbot:claudecode.0", "test input");

      expect(fakeChild.stdin.write).toHaveBeenCalledWith("test input");
      expect(fakeChild.stdin.end).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // capturePane
  // --------------------------------------------------------------------------

  describe("capturePane", () => {
    it("calls capture-pane with -p flag and correct target", async () => {
      mockSuccess("line1\nline2\nline3\n");

      const output = await bridge.capturePane("endiorbot:claudecode.0", 50);

      expect(output).toBe("line1\nline2\nline3\n");

      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("capture-pane");
      expect(args).toContain("-p");
      expect(args).toContain("-t");
      expect(args).toContain("endiorbot:claudecode.0");
      expect(args).toContain("-S");
      expect(args).toContain("-50");
    });

    it("caps line count at 500 for very large requests", async () => {
      mockSuccess("");

      await bridge.capturePane("endiorbot:claudecode.0", 1000);

      const args = mockExecFile.mock.calls[0]![1] as string[];
      const sIndex = args.indexOf("-S");
      expect(sIndex).toBeGreaterThan(-1);
      expect(args[sIndex + 1]).toBe("-500");
    });
  });

  // --------------------------------------------------------------------------
  // killWindow
  // --------------------------------------------------------------------------

  describe("killWindow", () => {
    it("extracts session:window by stripping the pane index (.N)", async () => {
      mockSuccess("");

      await bridge.killWindow("endiorbot:claudecode.0");

      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("kill-window");
      expect(args).toContain("-t");
      // .0 suffix should be stripped — target is "endiorbot:claudecode"
      expect(args).toContain("endiorbot:claudecode");
      expect(args).not.toContain("endiorbot:claudecode.0");
    });

    it("resolves without throwing when the window is already gone", async () => {
      mockError("no window: endiorbot:claudecode");

      await expect(bridge.killWindow("endiorbot:claudecode.0")).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // listWindows
  // --------------------------------------------------------------------------

  describe("listWindows", () => {
    it("parses window names from newline-separated output", async () => {
      mockSuccess("claudecode\ncursor\ngemini\n");

      const windows = await bridge.listWindows("endiorbot");

      expect(windows).toEqual(["claudecode", "cursor", "gemini"]);

      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("list-windows");
      expect(args).toContain("-t");
      expect(args).toContain("endiorbot");
    });

    it("returns empty array when session does not exist", async () => {
      mockError("no session: endiorbot");

      const windows = await bridge.listWindows("endiorbot");
      expect(windows).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // sessionExists
  // --------------------------------------------------------------------------

  describe("sessionExists", () => {
    it("returns true when has-session exits with code 0", async () => {
      mockSuccess("");

      const exists = await bridge.sessionExists("endiorbot");
      expect(exists).toBe(true);

      const args = mockExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain("has-session");
      expect(args).toContain("-t");
      expect(args).toContain("endiorbot");
    });

    it("returns false when has-session exits non-zero", async () => {
      mockError("no such session");

      const exists = await bridge.sessionExists("endiorbot");
      expect(exists).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // exec timeout
  // --------------------------------------------------------------------------

  describe("exec timeout", () => {
    it("passes 5000ms timeout to every execFile call", async () => {
      mockSuccess("tmux 3.3a\n");

      await bridge.isAvailable();

      const opts = mockExecFile.mock.calls[0]![2] as { timeout: number };
      expect(opts.timeout).toBe(5000);
    });
  });
});
