/**
 * CopilotBridge Tests (Sprint 83)
 *
 * Tests for runtime detection, suggest, explain, ANSI stripping.
 * All tests use mocked ExecRunner — no real subprocesses.
 *
 * @module tests/bridge/copilot/copilot-bridge
 * @authority ADR-024 D5, Sprint 83
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CopilotBridge, stripAnsi } from "../../../src/bridge/copilot/copilot-bridge.js";
import type { ExecRunner, ExecResult, ExecOpts } from "../../../src/bridge/types.js";

// ============================================================================
// Mock ExecRunner
// ============================================================================

type ExecHandler = (binary: string, args: string[], opts?: ExecOpts) => ExecResult | Promise<ExecResult>;

function createMockExec(handler: ExecHandler): ExecRunner {
  return {
    async exec(binary: string, args: string[], opts?: ExecOpts): Promise<ExecResult> {
      return handler(binary, args, opts);
    },
  };
}

function okResult(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function failResult(stderr: string): ExecResult {
  return { stdout: "", stderr, exitCode: 1 };
}

// ============================================================================
// stripAnsi
// ============================================================================

describe("stripAnsi", () => {
  it("strips SGR color codes", () => {
    expect(stripAnsi("\x1B[32mgreen\x1B[0m")).toBe("green");
  });

  it("strips cursor movement", () => {
    expect(stripAnsi("\x1B[2Ahello\x1B[3B")).toBe("hello");
  });

  it("handles text without ANSI", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  it("strips multiple ANSI sequences", () => {
    expect(stripAnsi("\x1B[1m\x1B[31mbold red\x1B[0m normal")).toBe("bold red normal");
  });
});

// ============================================================================
// detect()
// ============================================================================

describe("CopilotBridge — detect()", () => {
  it("detects copilot-cli when available", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("copilot 1.0.2");
      if (binary === "copilot" && args[0] === "suggest") return okResult("suggest help...");
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.detect();
    expect(result.kind).toBe("copilot-cli");
    expect(result.version).toBe("copilot 1.0.2");
    expect(result.path).toBe("/usr/local/bin/copilot");
  });

  it("detects gh-copilot as fallback", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return failResult("not found");
      if (binary === "command" && args[1] === "gh") return okResult("/usr/local/bin/gh");
      if (binary === "gh" && args[0] === "copilot") return okResult("gh copilot 0.5.0");
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.detect();
    expect(result.kind).toBe("gh-copilot");
    expect(result.version).toBe("gh copilot 0.5.0");
  });

  it("returns none when nothing installed", async () => {
    const exec = createMockExec(() => failResult("not found"));

    const bridge = new CopilotBridge(exec);
    const result = await bridge.detect();
    expect(result.kind).toBe("none");
    expect(result.notes).toContain("Install");
  });

  it("detects deprecated gh copilot", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return failResult("not found");
      if (binary === "command" && args[1] === "gh") return okResult("/usr/local/bin/gh");
      if (binary === "gh" && args[0] === "copilot") return okResult("gh copilot 0.3.0 (deprecated)");
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.detect();
    expect(result.kind).toBe("none");
    expect(result.notes).toContain("deprecated");
  });

  it("returns none when copilot present but flags incompatible", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("copilot 0.1.0");
      if (binary === "copilot" && args[0] === "suggest") return failResult("unknown command");
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.detect();
    expect(result.kind).toBe("none");
    expect(result.notes).toContain("incompatible");
  });

  it("caches detection result", async () => {
    let callCount = 0;
    const exec = createMockExec(() => {
      callCount++;
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    await bridge.detect();
    const count1 = callCount;
    await bridge.detect();
    expect(callCount).toBe(count1); // no additional calls
  });
});

// ============================================================================
// suggest() / explain()
// ============================================================================

describe("CopilotBridge — suggest()", () => {
  it("returns output for copilot-cli", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("1.0.2");
      if (binary === "copilot" && args[0] === "suggest" && args[1] === "--help") return okResult("help");
      if (binary === "copilot" && args[0] === "suggest" && args[1] === "list files") {
        return okResult("ls -la");
      }
      return failResult("unknown");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.suggest("list files", "/tmp");
    expect(result.success).toBe(true);
    expect(result.output).toBe("ls -la");
  });

  it("returns error when not installed", async () => {
    const exec = createMockExec(() => failResult("not found"));
    const bridge = new CopilotBridge(exec);
    const result = await bridge.suggest("anything", "/tmp");
    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("strips ANSI from output", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("1.0.2");
      if (binary === "copilot" && args[0] === "suggest" && args[1] === "--help") return okResult("help");
      if (binary === "copilot" && args[0] === "suggest") {
        return okResult("\x1B[32mls -la\x1B[0m");
      }
      return failResult("unknown");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.suggest("list files", "/tmp");
    expect(result.output).toBe("ls -la");
  });

  it("caps output at 3500 chars", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("1.0.2");
      if (binary === "copilot" && args[0] === "suggest" && args[1] === "--help") return okResult("help");
      if (binary === "copilot" && args[0] === "suggest") {
        return okResult("a".repeat(5000));
      }
      return failResult("unknown");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.suggest("big task", "/tmp");
    expect(result.output.length).toBeLessThanOrEqual(3520); // 3500 + truncation marker
    expect(result.output).toContain("truncated");
  });
});

describe("CopilotBridge — explain()", () => {
  it("returns explanation for copilot-cli", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("1.0.2");
      if (binary === "copilot" && args[0] === "suggest" && args[1] === "--help") return okResult("help");
      if (binary === "copilot" && args[0] === "explain") {
        return okResult("find: recursively search for files");
      }
      return failResult("unknown");
    });

    const bridge = new CopilotBridge(exec);
    const result = await bridge.explain("find . -name '*.ts'", "/tmp");
    expect(result.success).toBe(true);
    expect(result.output).toContain("recursively search");
  });
});

describe("CopilotBridge — getStatus()", () => {
  it("shows status when installed", async () => {
    const exec = createMockExec((binary, args) => {
      if (binary === "command" && args[1] === "copilot") return okResult("/usr/local/bin/copilot");
      if (binary === "copilot" && args[0] === "--version") return okResult("1.0.2");
      if (binary === "copilot" && args[0] === "suggest") return okResult("help");
      return failResult("not found");
    });

    const bridge = new CopilotBridge(exec);
    const status = await bridge.getStatus();
    expect(status).toContain("copilot-cli");
    expect(status).toContain("1.0.2");
  });

  it("shows install hint when not found", async () => {
    const exec = createMockExec(() => failResult("not found"));
    const bridge = new CopilotBridge(exec);
    const status = await bridge.getStatus();
    expect(status).toContain("not found");
    expect(status).toContain("Install");
  });
});
