/**
 * Tests for ResponseParser.
 *
 * @module tests/agents/invoke/response-parser
 * @sprint 120 — Track C2
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../../../src/logging/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock handoff validation
vi.mock("../../../src/agents/types/handoff.js", () => ({
  isValidHandoffRequest: (obj: unknown) => {
    if (typeof obj !== "object" || obj === null) return false;
    const r = obj as Record<string, unknown>;
    return Array.isArray(r.handoff);
  },
  isValidRole: (role: string) => {
    const validRoles = ["coder", "architect", "reviewer", "tester", "pm", "cto", "cpo", "ceo", "fullstack", "devops", "researcher", "assistant", "pjm"];
    return validRoles.includes(role);
  },
}));

import {
  ResponseParser,
  createResponseParser,
  resetResponseParser,
  parseResponse,
  hasHandoff,
  extractFirstHandoff,
  DEFAULT_PARSER_CONFIG,
} from "../../../src/agents/invoke/response-parser.js";

beforeEach(() => {
  resetResponseParser();
});

// ============================================================================
// Basic parsing
// ============================================================================

describe("ResponseParser — basic", () => {
  it("plain text returns status: complete, no handoffs", () => {
    const parser = createResponseParser();
    const result = parser.parse("Here is my analysis of the codebase. Everything looks good.");
    expect(result.status).toBe("complete");
    expect(result.hasHandoff).toBe(false);
    expect(result.handoffs).toHaveLength(0);
  });

  it("very short response (<10 chars) returns status: incomplete", () => {
    const parser = createResponseParser();
    const result = parser.parse("OK");
    expect(result.status).toBe("incomplete");
  });

  it("output longer than maxContentLength is truncated with warning", () => {
    const parser = createResponseParser({ maxContentLength: 50 });
    const long = "x".repeat(100);
    const result = parser.parse(long);
    expect(result.rawOutput.length).toBe(50);
    expect(result.warnings.some((w) => w.includes("truncated"))).toBe(true);
  });
});

// ============================================================================
// Handoff extraction
// ============================================================================

describe("ResponseParser — handoff extraction", () => {
  it("valid handoff JSON block returns status: handoff", () => {
    const output = `Done with analysis.\n\n\`\`\`json\n{"handoff": [{"to": "coder", "intent": "implement the fix", "priority": "P1", "inputs": {}, "reason": "needs code"}]}\n\`\`\``;
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.status).toBe("handoff");
    expect(result.hasHandoff).toBe(true);
    expect(result.handoffs).toHaveLength(1);
    expect(result.handoffs[0].to).toBe("coder");
  });

  it("multiple handoffs extracts all", () => {
    const output = `\`\`\`json\n{"handoff": [{"to": "coder", "intent": "code it", "priority": "P1", "inputs": {}, "reason": "r"}, {"to": "tester", "intent": "test it", "priority": "P2", "inputs": {}, "reason": "r"}]}\n\`\`\``;
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.handoffs).toHaveLength(2);
  });

  it("invalid handoff target adds error", () => {
    const output = `\`\`\`json\n{"handoff": [{"to": "nonexistent_agent", "intent": "do stuff", "priority": "P1", "inputs": {}, "reason": "r"}]}\n\`\`\``;
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.errors.some((e) => e.includes("Invalid handoff target"))).toBe(true);
  });

  it("malformed JSON in strict mode adds parse error", () => {
    const parser = createResponseParser({ strictJson: true });
    // Use code-fenced format so the regex captures the block, then JSON.parse fails
    const output = '```json\n{"handoff": [{"broken value}]}\n```';
    const result = parser.parse(output);
    expect(result.errors.some((e) => e.includes("JSON parse error"))).toBe(true);
  });
});

// ============================================================================
// Code block extraction
// ============================================================================

describe("ResponseParser — code blocks", () => {
  it("extracts code blocks with language and content", () => {
    const output = "Here's the fix:\n\n```typescript\nconst x = 1;\n```";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0].language).toBe("typescript");
    expect(result.codeBlocks[0].content).toContain("const x = 1;");
  });

  it("handoff JSON code blocks excluded from code block extraction", () => {
    const output = `\`\`\`json\n{"handoff": [{"to": "coder", "intent": "x", "priority": "P1", "inputs": {}, "reason": "r"}]}\n\`\`\`\n\n\`\`\`typescript\nconst y = 2;\n\`\`\``;
    const parser = createResponseParser();
    const result = parser.parse(output);
    // Only the typescript block should be extracted (handoff json is skipped)
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0].language).toBe("typescript");
  });

  it("diff code blocks detected as type: diff", () => {
    const output = "```diff\n--- a/file.ts\n+++ b/file.ts\n-old\n+new\n```";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.codeBlocks[0].type).toBe("diff");
  });

  it("shell code blocks (bash, sh) detected as type: shell", () => {
    const output = "```bash\nnpm install\n```";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.codeBlocks[0].type).toBe("shell");
  });

  it("file path comments in code blocks extracted", () => {
    const output = "```typescript\n// file: src/index.ts\nconst x = 1;\n```";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.codeBlocks[0].filePath).toBe("src/index.ts");
  });
});

// ============================================================================
// Artifact extraction
// ============================================================================

describe("ResponseParser — artifacts", () => {
  it("extracts from ## File: headers", () => {
    const output = "## File: src/app.ts\n\nSome content here about the file.";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.artifacts.some((a) => a.path === "src/app.ts")).toBe(true);
  });

  it("extracts from code blocks with file paths", () => {
    const output = "```typescript\n// file: src/utils.ts\nexport const foo = 1;\n```";
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.artifacts.some((a) => a.path === "src/utils.ts")).toBe(true);
  });
});

// ============================================================================
// cleanContent
// ============================================================================

describe("ResponseParser — cleanContent", () => {
  it("removes handoff JSON but preserves other content", () => {
    const output = `Analysis done.\n\n\`\`\`json\n{"handoff": [{"to": "coder", "intent": "x", "priority": "P1", "inputs": {}, "reason": "r"}]}\n\`\`\`\n\nConclusion.`;
    const parser = createResponseParser();
    const result = parser.parse(output);
    expect(result.content).toContain("Analysis done.");
    expect(result.content).toContain("Conclusion.");
    expect(result.content).not.toContain('"handoff"');
  });
});

// ============================================================================
// Utility functions
// ============================================================================

describe("utility functions", () => {
  it("hasHandoff returns true for response with handoff", () => {
    const output = '```json\n{"handoff": [{"to": "coder", "intent": "x"}]}\n```';
    expect(hasHandoff(output)).toBe(true);
  });

  it("hasHandoff returns false for plain text", () => {
    expect(hasHandoff("just some normal text")).toBe(false);
  });

  it("hasHandoff works correctly on consecutive calls (g-flag bug fixed)", () => {
    const output = '```json\n{"handoff": [{"to": "coder", "intent": "x"}]}\n```';
    expect(hasHandoff(output)).toBe(true);
    expect(hasHandoff(output)).toBe(true);
    expect(hasHandoff(output)).toBe(true);
  });

  it("extractFirstHandoff returns handoff item via parser.parse", () => {
    const parser = createResponseParser();
    const output = '{"handoff": [{"to": "architect", "intent": "design it", "priority": "P0", "inputs": {}, "reason": "need arch"}]}';
    const result = parser.parse(output);
    expect(result.handoffs.length).toBeGreaterThan(0);
    expect(result.handoffs[0].to).toBe("architect");
  });

  it("extractFirstHandoff exported utility returns handoff", () => {
    resetResponseParser();
    const output = '```json\n{"handoff": [{"to": "coder", "intent": "implement it", "priority": "P1", "inputs": {}, "reason": "needs code"}]}\n```';
    const handoff = extractFirstHandoff(output);
    expect(handoff).not.toBeNull();
    expect(handoff!.to).toBe("coder");
  });

  it("extractFirstHandoff returns null for plain text", () => {
    resetResponseParser();
    const handoff = extractFirstHandoff("just plain text without any handoff");
    expect(handoff).toBeNull();
  });

  it("createResponseParser creates new instance", () => {
    const p1 = createResponseParser();
    const p2 = createResponseParser();
    expect(p1).not.toBe(p2);
  });

  it("resetResponseParser clears singleton", () => {
    const r1 = parseResponse("test string with enough content to be complete");
    resetResponseParser();
    const r2 = parseResponse("another test string with enough content to pass");
    // Both should work without error
    expect(r1.status).toBeDefined();
    expect(r2.status).toBeDefined();
  });
});

// ============================================================================
// DEFAULT_PARSER_CONFIG
// ============================================================================

describe("DEFAULT_PARSER_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_PARSER_CONFIG.strictJson).toBe(false);
    expect(DEFAULT_PARSER_CONFIG.extractCodeBlocks).toBe(true);
    expect(DEFAULT_PARSER_CONFIG.extractArtifacts).toBe(true);
    expect(DEFAULT_PARSER_CONFIG.maxContentLength).toBe(50000);
  });
});
