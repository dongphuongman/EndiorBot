/**
 * Cross-System Mention Parsing Tests
 *
 * Tests for @mtclaw.* mention detection (Sprint 113, ADR-034):
 * - CPO C1: @mtclaw.* parsing in parseAgentPart
 * - CPO C3: Decomposer bypass (agents: [] + crossSystem)
 * - OTT format: [@mtclaw.researcher: task]
 * - Edge cases: @mtclaw (no agent), @mtclaw. (empty agent)
 *
 * @module tests/mcp-gateway/mention-cross-system
 * @sprint 113
 */

import { describe, it, expect } from "vitest";
import {
  parseMention,
  parseCLIMention,
  parseOTTMention,
} from "../../src/agents/orchestrator/mention-parser.js";

// ============================================================================
// CLI Format: @mtclaw.<agent> "task"
// ============================================================================

describe("CLI cross-system mentions", () => {
  it("parses @mtclaw.researcher with quoted message", () => {
    const result = parseCLIMention('@mtclaw.researcher "tìm SOP livestream"');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.agents).toEqual([]);
    expect(result.data.crossSystem).toBeDefined();
    expect(result.data.crossSystem!.system).toBe("mtclaw");
    expect(result.data.crossSystem!.agent).toBe("researcher");
    expect(result.data.crossSystem!.task).toBe("tìm SOP livestream");
    expect(result.data.isTeam).toBe(false);
    expect(result.data.warnings).toEqual([]);
  });

  it("parses @mtclaw.datasource with unquoted message", () => {
    const result = parseCLIMention("@mtclaw.datasource SHOW DATABASES");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.agents).toEqual([]);
    expect(result.data.crossSystem!.system).toBe("mtclaw");
    expect(result.data.crossSystem!.agent).toBe("datasource");
    expect(result.data.crossSystem!.task).toBe("SHOW DATABASES");
  });

  it("parses @mtclaw.knowledge with query", () => {
    const result = parseCLIMention("@mtclaw.knowledge leave request SOP");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.crossSystem!.agent).toBe("knowledge");
    expect(result.data.crossSystem!.task).toBe("leave request SOP");
  });

  it("parses @mtclaw.pm agent correctly", () => {
    const result = parseCLIMention("@mtclaw.pm plan next sprint for MTClaw");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.crossSystem!.agent).toBe("pm");
    expect(result.data.crossSystem!.task).toBe("plan next sprint for MTClaw");
  });

  it("parses @mtclaw.sop with Vietnamese text", () => {
    const result = parseMention("@mtclaw.sop tìm quy trình xin nghỉ phép");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.crossSystem!.agent).toBe("sop");
    expect(result.data.crossSystem!.task).toBe("tìm quy trình xin nghỉ phép");
  });
});

// ============================================================================
// OTT Format: [@mtclaw.<agent>: task]
// ============================================================================

describe("OTT cross-system mentions", () => {
  it("parses [@mtclaw.researcher: task] format", () => {
    const result = parseOTTMention("Hello [@mtclaw.researcher: tìm SOP livestream]");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.agents).toEqual([]);
    expect(result.data.crossSystem).toBeDefined();
    expect(result.data.crossSystem!.system).toBe("mtclaw");
    expect(result.data.crossSystem!.agent).toBe("researcher");
    expect(result.data.crossSystem!.task).toBe("tìm SOP livestream");
  });

  it("parses [@mtclaw.datasource: SHOW DATABASES] format", () => {
    const result = parseOTTMention("Query: [@mtclaw.datasource: SHOW DATABASES]");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.crossSystem!.agent).toBe("datasource");
    expect(result.data.crossSystem!.task).toBe("SHOW DATABASES");
  });
});

// ============================================================================
// CPO C3: Decomposer bypass
// ============================================================================

describe("decomposer bypass (CPO C3)", () => {
  it("cross-system returns agents:[] — decomposer check agents.length > 1 is false", () => {
    const result = parseMention("@mtclaw.researcher find all SOPs");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // agents: [] → decomposer `agents.length > 1` is false → bypassed
    expect(result.data.agents).toEqual([]);
    expect(result.data.agents.length > 1).toBe(false);

    // crossSystem is set → ingress intercepts before single-agent path
    expect(result.data.crossSystem).toBeDefined();
  });

  it("cross-system does NOT mix with local agents", () => {
    // @mtclaw.researcher is the ONLY target — no comma-separated mixing
    const result = parseMention("@mtclaw.researcher find SOPs");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.agents).toEqual([]); // no local agents
    expect(result.data.crossSystem).toBeDefined(); // cross-system only
  });
});

// ============================================================================
// parseMention() auto-detect
// ============================================================================

describe("parseMention() auto-detect", () => {
  it("detects cross-system from plain text", () => {
    const result = parseMention("@mtclaw.researcher tìm SOP");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.crossSystem!.system).toBe("mtclaw");
  });

  it("detects cross-system from OTT format", () => {
    const result = parseMention("Hey [@mtclaw.pm: plan next sprint]");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.crossSystem!.system).toBe("mtclaw");
    expect(result.data.crossSystem!.agent).toBe("pm");
  });

  it("local agents still work (no regression)", () => {
    const result = parseMention("@pm plan payment gateway");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agents).toContain("pm");
    expect(result.data.crossSystem).toBeUndefined();
  });

  it("team mentions still work (no regression)", () => {
    // Teams require TeamRegistry — without it, will be "Unknown agent"
    const result = parseMention("@coder implement the feature");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agents).toContain("coder");
    expect(result.data.crossSystem).toBeUndefined();
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("edge cases", () => {
  it("@mtclaw (no dot, no agent) → INVALID_AGENT", () => {
    const result = parseMention("@mtclaw some message");
    // "mtclaw" is not a valid local agent and doesn't have a dot
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_AGENT");
  });

  it("@mtclaw. (dot but empty agent) → INVALID_AGENT", () => {
    const result = parseMention("@mtclaw. some message");
    // "mtclaw." starts with mtclaw. but slice(7) is empty
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_AGENT");
  });

  it("@mtclawresearcher (no dot) → INVALID_AGENT", () => {
    const result = parseMention("@mtclawresearcher some message");
    expect(result.success).toBe(false);
  });

  it("@other.researcher (not mtclaw prefix) → INVALID_AGENT", () => {
    const result = parseMention("@other.researcher some message");
    expect(result.success).toBe(false);
  });

  it("CPO C3 regression: cross-system with decomposer-triggering keywords still returns crossSystem", () => {
    // "plan and implement" would trigger shouldDecompose() for local agents.
    // Cross-system must still return crossSystem (ingress intercepts before decomposer).
    const result = parseMention("@mtclaw.researcher plan and implement new SOP workflow");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agents).toEqual([]); // no local agents
    expect(result.data.crossSystem).toBeDefined();
    expect(result.data.crossSystem!.system).toBe("mtclaw");
    expect(result.data.crossSystem!.agent).toBe("researcher");
    // The task contains decomposer keywords but crossSystem takes priority
    expect(result.data.crossSystem!.task).toContain("plan and implement");
  });

  it("preserves original input in cross-system result", () => {
    const input = "@mtclaw.researcher find all SOPs";
    const result = parseMention(input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.originalInput).toBe(input);
  });
});
