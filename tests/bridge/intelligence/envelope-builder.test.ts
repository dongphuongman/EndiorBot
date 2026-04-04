/**
 * Tests for Envelope Builder — Sprint 87 (ADR-025)
 *
 * Covers: full assembly, missing layers, serialization.
 *
 * @module tests/bridge/intelligence/envelope-builder
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockLoadBrainL4 = vi.fn();
const mockBuildContextEnvelope = vi.fn();

vi.mock("../../../src/bridge/intelligence/brain-loader.js", () => ({
  loadBrainL4: (...args: unknown[]) => mockLoadBrainL4(...args),
}));

vi.mock("../../../src/bridge/intelligence/context-builder.js", () => ({
  buildContextEnvelope: (...args: unknown[]) => mockBuildContextEnvelope(...args),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  buildFullEnvelope,
  serializeEnvelopeForInjection,
} from "../../../src/bridge/intelligence/envelope-builder.js";
import type {
  PersonaEnvelope,
  BrainEnvelope,
  ContextEnvelope,
  SessionIntelligenceEnvelope,
} from "../../../src/bridge/intelligence/envelope.js";

// ============================================================================
// Helpers
// ============================================================================

function createPersona(): PersonaEnvelope {
  return {
    agentRole: "coder",
    soulContent: "You are the Coder agent.",
    soulContentHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  };
}

function createBrainEnvelope(): BrainEnvelope {
  return {
    content: "[Brain L4 Mental Models]\n[typescript] Prefer const over let (high)\n[End Brain L4]",
    contentHash: "brain_hash_64chars_0000000000000000000000000000000000000000000000",
    modelCount: 1,
    source: "mental-models.json",
  };
}

function createContextEnvelope(): ContextEnvelope {
  return {
    sprintName: "Sprint 87",
    tier: "STANDARD",
    projectPath: "/Users/test/project",
    content: "[Session Context]\nSprint: Sprint 87\nTier: STANDARD\nProject: /Users/test/project\n[End Session Context]",
    contentHash: "ctx_hash_64chars_00000000000000000000000000000000000000000000000",
  };
}

// ============================================================================
// Tests: buildFullEnvelope
// ============================================================================

describe("buildFullEnvelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assembles all 3 layers when brain and context are available", async () => {
    mockLoadBrainL4.mockReturnValue(createBrainEnvelope());
    mockBuildContextEnvelope.mockResolvedValue(createContextEnvelope());

    const result = await buildFullEnvelope(createPersona());

    expect(result.persona.agentRole).toBe("coder");
    expect(result.brain).toBeDefined();
    expect(result.brain!.modelCount).toBe(1);
    expect(result.context).toBeDefined();
    expect(result.context!.sprintName).toBe("Sprint 87");
  });

  it("returns envelope without brain when loadBrainL4 returns null", async () => {
    mockLoadBrainL4.mockReturnValue(null);
    mockBuildContextEnvelope.mockResolvedValue(createContextEnvelope());

    const result = await buildFullEnvelope(createPersona());

    expect(result.persona.agentRole).toBe("coder");
    expect(result.brain).toBeUndefined();
    expect(result.context).toBeDefined();
  });

  it("returns envelope without context when buildContextEnvelope returns null", async () => {
    mockLoadBrainL4.mockReturnValue(createBrainEnvelope());
    mockBuildContextEnvelope.mockResolvedValue(null);

    const result = await buildFullEnvelope(createPersona());

    expect(result.persona.agentRole).toBe("coder");
    expect(result.brain).toBeDefined();
    expect(result.context).toBeUndefined();
  });

  it("returns persona-only envelope when both brain and context are null", async () => {
    mockLoadBrainL4.mockReturnValue(null);
    mockBuildContextEnvelope.mockResolvedValue(null);

    const result = await buildFullEnvelope(createPersona());

    expect(result.persona.agentRole).toBe("coder");
    expect(result.brain).toBeUndefined();
    expect(result.context).toBeUndefined();
  });

  it("preserves persona content unchanged", async () => {
    mockLoadBrainL4.mockReturnValue(createBrainEnvelope());
    mockBuildContextEnvelope.mockResolvedValue(createContextEnvelope());
    const persona = createPersona();

    const result = await buildFullEnvelope(persona);

    expect(result.persona).toEqual(persona);
  });
});

// ============================================================================
// Tests: serializeEnvelopeForInjection
// ============================================================================

describe("serializeEnvelopeForInjection", () => {
  it("produces brain + context sections separated by double newline", async () => {
    const envelope: SessionIntelligenceEnvelope = {
      persona: createPersona(),
      brain: createBrainEnvelope(),
      context: createContextEnvelope(),
    };

    const result = serializeEnvelopeForInjection(envelope);

    expect(result).toContain("[Brain L4 Mental Models]");
    expect(result).toContain("[End Brain L4]");
    expect(result).toContain("[Session Context]");
    expect(result).toContain("[End Session Context]");
    // Sections separated by double newline
    expect(result).toContain("[End Brain L4]\n\n[Session Context]");
  });

  it("produces only brain section when context is missing", async () => {
    const envelope: SessionIntelligenceEnvelope = {
      persona: createPersona(),
      brain: createBrainEnvelope(),
    };

    const result = serializeEnvelopeForInjection(envelope);

    expect(result).toContain("[Brain L4 Mental Models]");
    expect(result).not.toContain("[Session Context]");
  });

  it("produces only context section when brain is missing", async () => {
    const envelope: SessionIntelligenceEnvelope = {
      persona: createPersona(),
      context: createContextEnvelope(),
    };

    const result = serializeEnvelopeForInjection(envelope);

    expect(result).not.toContain("[Brain L4 Mental Models]");
    expect(result).toContain("[Session Context]");
  });

  it("returns empty string when neither brain nor context exists", async () => {
    const envelope: SessionIntelligenceEnvelope = {
      persona: createPersona(),
    };

    const result = serializeEnvelopeForInjection(envelope);

    expect(result).toBe("");
  });

  it("does not include persona content (handled by Strategy A/B)", async () => {
    const envelope: SessionIntelligenceEnvelope = {
      persona: createPersona(),
      brain: createBrainEnvelope(),
      context: createContextEnvelope(),
    };

    const result = serializeEnvelopeForInjection(envelope);

    expect(result).not.toContain("You are the Coder agent");
  });
});
