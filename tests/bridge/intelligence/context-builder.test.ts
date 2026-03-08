/**
 * Tests for Context Envelope Builder — Sprint 87 (ADR-025)
 *
 * Covers: active project reading, formatting, token budget, hashing, errors.
 *
 * @module tests/bridge/intelligence/context-builder
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

// ============================================================================
// Mocks
// ============================================================================

const mockLoadActiveProject = vi.fn();

vi.mock("../../../src/config/paths.js", () => ({
  loadActiveProject: (...args: unknown[]) => mockLoadActiveProject(...args),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  buildContextEnvelope,
  CONTEXT_TOKEN_BUDGET,
} from "../../../src/bridge/intelligence/context-builder.js";

// ============================================================================
// Helpers
// ============================================================================

function createActiveProject(overrides: Record<string, unknown> = {}) {
  return {
    name: "EndiorBot Sprint 87",
    path: "/Users/test/project",
    tier: "STANDARD",
    startedAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("buildContextEnvelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Successful building
  // --------------------------------------------------------------------------

  it("returns ContextEnvelope with all fields from active project", () => {
    mockLoadActiveProject.mockReturnValue(createActiveProject());

    const result = buildContextEnvelope();

    expect(result).not.toBeNull();
    expect(result!.sprintName).toBe("EndiorBot Sprint 87");
    expect(result!.tier).toBe("STANDARD");
    expect(result!.projectPath).toBe("/Users/test/project");
  });

  it("formats content with header and footer markers", () => {
    mockLoadActiveProject.mockReturnValue(createActiveProject());

    const result = buildContextEnvelope();

    expect(result!.content).toContain("[Session Context]");
    expect(result!.content).toContain("[End Session Context]");
    expect(result!.content).toContain("Sprint: EndiorBot Sprint 87");
    expect(result!.content).toContain("Tier: STANDARD");
    expect(result!.content).toContain("Project: /Users/test/project");
  });

  it("computes SHA256 hash of content", () => {
    mockLoadActiveProject.mockReturnValue(createActiveProject());

    const result = buildContextEnvelope();

    const expectedHash = createHash("sha256")
      .update(result!.content)
      .digest("hex");
    expect(result!.contentHash).toBe(expectedHash);
    expect(result!.contentHash).toHaveLength(64);
  });

  it("maps tier from active project", () => {
    mockLoadActiveProject.mockReturnValue(
      createActiveProject({ tier: "ENTERPRISE" }),
    );

    const result = buildContextEnvelope();

    expect(result!.tier).toBe("ENTERPRISE");
    expect(result!.content).toContain("Tier: ENTERPRISE");
  });

  it("maps sprint name from active project name", () => {
    mockLoadActiveProject.mockReturnValue(
      createActiveProject({ name: "My Custom Project" }),
    );

    const result = buildContextEnvelope();

    expect(result!.sprintName).toBe("My Custom Project");
    expect(result!.content).toContain("Sprint: My Custom Project");
  });

  // --------------------------------------------------------------------------
  // Null returns
  // --------------------------------------------------------------------------

  it("returns null when no active project", () => {
    mockLoadActiveProject.mockReturnValue(undefined);

    const result = buildContextEnvelope();

    expect(result).toBeNull();
  });

  it("returns null when loadActiveProject returns null", () => {
    mockLoadActiveProject.mockReturnValue(null);

    const result = buildContextEnvelope();

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Token budget
  // --------------------------------------------------------------------------

  it("caps content at CONTEXT_TOKEN_BUDGET * 4 chars", () => {
    mockLoadActiveProject.mockReturnValue(
      createActiveProject({
        name: "x".repeat(10000),
        path: "/very/long/" + "path/".repeat(1000),
      }),
    );

    const result = buildContextEnvelope();

    expect(result).not.toBeNull();
    expect(result!.content.length).toBeLessThanOrEqual(CONTEXT_TOKEN_BUDGET * 4);
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  it("returns null when loadActiveProject throws", () => {
    mockLoadActiveProject.mockImplementation(() => {
      throw new Error("File system error");
    });

    const result = buildContextEnvelope();

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  it("exports CONTEXT_TOKEN_BUDGET as 2048", () => {
    expect(CONTEXT_TOKEN_BUDGET).toBe(2048);
  });
});
