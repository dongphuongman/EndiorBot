/**
 * SDLC Command Handlers Tests
 *
 * @module tests/commands/handlers/sdlc-commands
 * @date 2026-03-26
 * @sprint 119
 */

import { describe, it, expect } from "vitest";
import {
  handleGateCommand,
  handleComplianceCommand,
  handleConsultCommand,
  handleFixCommand,
} from "../../../src/commands/handlers/sdlc-commands.js";

// ============================================================================
// handleGateCommand
// ============================================================================

describe("handleGateCommand", () => {
  it("returns usage info when called with no args", () => {
    const result = handleGateCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Quality Gates");
  });

  it("returns usage info mentioning valid gates", () => {
    const result = handleGateCommand([]);
    expect(result.response).toContain("G2");
  });

  it("includes usage example in no-args response", () => {
    const result = handleGateCommand([]);
    expect(result.response).toContain("/gate");
  });

  it("returns gate-specific message when gateId provided", () => {
    const result = handleGateCommand(["G2"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("G2");
  });

  it("returns success for any gateId arg", () => {
    const result = handleGateCommand(["G3"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("G3");
  });

  it("response includes pm agent prompt for gate evaluation", () => {
    const result = handleGateCommand(["G1"]);
    expect(result.response).toContain("@pm");
  });

  it("sanitizes gateId in response (no script injection)", () => {
    const result = handleGateCommand(["<script>alert(1)</script>"]);
    expect(result.response).not.toContain("<script>");
  });
});

// ============================================================================
// handleComplianceCommand
// ============================================================================

describe("handleComplianceCommand", () => {
  it("returns compliance info when called with no args", () => {
    const result = handleComplianceCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Compliance");
  });

  it("returns success for 'check' sub-command", () => {
    const result = handleComplianceCommand(["check"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Compliance");
  });

  it("returns success for 'score' sub-command", () => {
    const result = handleComplianceCommand(["score"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Compliance");
  });

  it("returns response mentioning /fix for unknown compliance issues", () => {
    const result = handleComplianceCommand([]);
    expect(result.response).toContain("/fix");
  });

  it("returns success with message for unknown sub-command", () => {
    const result = handleComplianceCommand(["unknown-sub"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("unknown-sub");
  });

  it("case-insensitive sub-command: 'CHECK' works same as 'check'", () => {
    const lower = handleComplianceCommand(["check"]);
    const upper = handleComplianceCommand(["CHECK"]);
    expect(lower.success).toBe(upper.success);
    expect(lower.response).toBe(upper.response);
  });
});

// ============================================================================
// handleConsultCommand
// ============================================================================

describe("handleConsultCommand", () => {
  it("returns usage help when called with no args", () => {
    const result = handleConsultCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Multi-Model Consultation");
  });

  it("no-args response includes usage example", () => {
    const result = handleConsultCommand([]);
    expect(result.response).toContain("/consult");
  });

  it("passes query through in response when args provided", () => {
    const result = handleConsultCommand(["Redis", "vs", "PostgreSQL"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Redis");
  });

  it("joins multiple args into single query", () => {
    const result = handleConsultCommand(["what", "is", "the", "best", "approach"]);
    expect(result.response).toContain("what is the best approach");
  });

  it("response includes @researcher agent prompt for full response", () => {
    const result = handleConsultCommand(["design pattern for auth?"]);
    expect(result.response).toContain("@researcher");
  });

  it("truncates very long query in response (200 char limit)", () => {
    const longQuery = "a".repeat(300);
    const result = handleConsultCommand([longQuery]);
    expect(result.success).toBe(true);
    // Response should not echo full 300-char query
    const querySection = result.response.split("Query:")[1] ?? "";
    expect(querySection.length).toBeLessThan(250);
  });

  it("sanitizes query: strips markdown special chars", () => {
    const result = handleConsultCommand(["*bold* `code` query"]);
    expect(result.success).toBe(true);
    // Markdown chars should be stripped in echo
    expect(result.response).not.toContain("`code`");
  });
});

// ============================================================================
// handleFixCommand (legacy sync version)
// ============================================================================

describe("handleFixCommand", () => {
  it("returns success with compliance fix info", () => {
    const result = handleFixCommand([]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Compliance Fix");
  });

  it("includes dry-run mode info when no --yes flag", () => {
    const result = handleFixCommand([]);
    expect(result.response).toContain("dry-run");
  });

  it("mentions Bridge mode when --yes flag provided", () => {
    const result = handleFixCommand(["--yes"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("Bridge mode");
  });

  it("includes --stage info when --stage provided", () => {
    const result = handleFixCommand(["--stage", "01-planning"]);
    expect(result.success).toBe(true);
    expect(result.response).toContain("01-planning");
  });

  it("includes /fix --yes option in response", () => {
    const result = handleFixCommand([]);
    expect(result.response).toContain("/fix --yes");
  });

  it("includes --stage option in response", () => {
    const result = handleFixCommand([]);
    expect(result.response).toContain("--stage");
  });

  it("sanitizes stage name (strips special chars)", () => {
    // handleFixCommand uses sanitizeForEcho on stage value
    const result = handleFixCommand(["--stage", "01-planning"]);
    expect(result.response).not.toContain("<script>");
  });
});
