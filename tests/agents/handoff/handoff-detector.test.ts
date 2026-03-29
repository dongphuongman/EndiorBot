/**
 * Tests for HandoffDetector — detection, validation, safety cases.
 *
 * CPO C3 mandatory safety cases:
 *   - Malformed JSON (broken brackets, unclosed strings)
 *   - Nested code blocks (triple backticks inside backticks)
 *   - Partial handoff markers (incomplete {"handoff": without closing)
 *   - Regex lastIndex stateful behavior (g-flag)
 *   - Empty/null/undefined inputs
 *
 * @module tests/agents/handoff/handoff-detector
 * @sprint 121 — Track 2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  HandoffDetector,
  DEFAULT_DETECTOR_CONFIG,
  getHandoffDetector,
  resetHandoffDetector,
  createHandoffDetector,
  detectHandoff,
  type DetectionResult,
  type ValidationResult,
  type DetectorConfig,
} from "../../../src/agents/handoff/handoff-detector.js";

// Mock the handoff types module
vi.mock("../../../src/agents/types/handoff.js", () => ({
  isValidRole: (role: string) => {
    const validRoles = [
      "researcher", "pm", "pjm", "architect", "coder",
      "reviewer", "tester", "devops", "fullstack",
      "ceo", "cpo", "cto", "assistant",
    ];
    return validRoles.includes(role);
  },
  isAllowedTransition: (from: string, to: string) => {
    const transitions: Record<string, string[]> = {
      assistant: ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops", "fullstack"],
      pm: ["architect", "pjm"],
      architect: ["coder", "reviewer"],
      coder: ["reviewer", "tester"],
      reviewer: ["coder", "pm"],
      tester: ["coder", "devops"],
      ceo: [],
      cpo: [],
      cto: [],
    };
    return (transitions[from] ?? []).includes(to);
  },
}));

// Mock logger
vi.mock("../../../src/logging/index.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let detector: HandoffDetector;

beforeEach(() => {
  detector = new HandoffDetector();
  resetHandoffDetector();
});

// ============================================================================
// DEFAULT_DETECTOR_CONFIG
// ============================================================================

describe("DEFAULT_DETECTOR_CONFIG", () => {
  it("minConfidence is 0.7", () => {
    expect(DEFAULT_DETECTOR_CONFIG.minConfidence).toBe(0.7);
  });

  it("enableNaturalLanguage is true", () => {
    expect(DEFAULT_DETECTOR_CONFIG.enableNaturalLanguage).toBe(true);
  });

  it("verbose is false", () => {
    expect(DEFAULT_DETECTOR_CONFIG.verbose).toBe(false);
  });

  it("sourceAgent is undefined", () => {
    expect(DEFAULT_DETECTOR_CONFIG.sourceAgent).toBeUndefined();
  });
});

// ============================================================================
// Constructor
// ============================================================================

describe("constructor", () => {
  it("uses defaults when no config", () => {
    const d = new HandoffDetector();
    const result = d.detect("no handoff here");
    expect(result.detected).toBe(false);
  });

  it("accepts partial config", () => {
    const d = new HandoffDetector({ minConfidence: 0.99 });
    // Even with a valid inline tag, confidence 0.9 < 0.99 → not detected
    const result = d.detect("[@coder: implement the feature]");
    expect(result.detected).toBe(false);
  });

  it("disables natural language detection", () => {
    const d = new HandoffDetector({ enableNaturalLanguage: false });
    const result = d.detect("hand this off to coder to implement");
    expect(result.detected).toBe(false);
  });
});

// ============================================================================
// detect — JSON block
// ============================================================================

describe("detect (JSON block)", () => {
  it("detects valid JSON block with handoff", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement feature", "priority": "P1", "inputs": {}, "reason": "code needed"}}\n```';
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.method).toBe("json_block");
    expect(result.confidence).toBe(0.95);
    expect(result.handoffs).toHaveLength(1);
    expect(result.handoffs[0]!.to).toBe("coder");
    expect(result.handoffs[0]!.intent).toBe("implement feature");
  });

  it("detects JSON block with array handoff", () => {
    const output = '```json\n{"handoff": [{"to": "coder", "intent": "code"}, {"to": "tester", "intent": "test"}]}\n```';
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs).toHaveLength(2);
  });

  it("sets rawMatch from first match", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "code"}}\n```';
    const result = detector.detect(output);
    expect(result.rawMatch).toBeDefined();
    expect(result.rawMatch).toContain("handoff");
  });

  it("ignores JSON block with invalid role", () => {
    const output = '```json\n{"handoff": {"to": "invalidagent", "intent": "code"}}\n```';
    const result = detector.detect(output);
    // JSON parses but role invalid → handoffs empty → falls through
    expect(result.handoffs.length === 0 || result.method !== "json_block" || !result.detected).toBe(true);
  });

  it("detects JSON block without json tag", () => {
    const output = '```\n{"handoff": {"to": "coder", "intent": "implement"}}\n```';
    const result = detector.detect(output);
    expect(result.detected).toBe(true);
    expect(result.method).toBe("json_block");
  });
});

// ============================================================================
// detect — inline tag
// ============================================================================

describe("detect (inline tag)", () => {
  it("detects [@agent: message] format", () => {
    const output = "I think [@coder: implement the login feature] would be best";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.method).toBe("inline_tag");
    expect(result.confidence).toBe(0.9);
    expect(result.handoffs[0]!.to).toBe("coder");
    expect(result.handoffs[0]!.intent).toBe("implement the login feature");
  });

  it("detects multiple inline tags", () => {
    const output = "[@coder: implement] and [@tester: write tests]";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs).toHaveLength(2);
  });

  it("ignores inline tag with invalid role", () => {
    const output = "[@nobody: do something]";
    const result = detector.detect(output);
    // "nobody" is not a valid role
    expect(result.detected).toBe(false);
  });
});

// ============================================================================
// detect — explicit marker
// ============================================================================

describe("detect (explicit marker)", () => {
  it("detects HANDOFF: @agent format", () => {
    const output = 'HANDOFF: @coder "implement the auth module"';
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.method).toBe("explicit_marker");
    expect(result.confidence).toBe(0.85);
    expect(result.handoffs[0]!.to).toBe("coder");
    expect(result.handoffs[0]!.priority).toBe("P0"); // explicit markers are high priority
  });

  it("detects HANDOFF without quotes", () => {
    const output = "HANDOFF: @architect design the system";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs[0]!.to).toBe("architect");
  });

  it("case-insensitive HANDOFF keyword", () => {
    const output = "handoff: @coder build it";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
  });
});

// ============================================================================
// detect — natural language
// ============================================================================

describe("detect (natural language)", () => {
  it("detects 'hand this off to @agent' pattern", () => {
    const output = "I think we should hand this off to coder to implement the feature";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.method).toBe("natural_language");
    expect(result.confidence).toBe(0.7);
    expect(result.handoffs[0]!.to).toBe("coder");
  });

  it("detects 'pass to @agent' pattern", () => {
    const output = "Let's pass to architect for design review";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs[0]!.to).toBe("architect");
  });

  it("detects 'the coder should implement' pattern", () => {
    const output = "the coder should implement this feature";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs[0]!.to).toBe("coder");
  });

  it("detects 'recommend @agent for task' pattern", () => {
    const output = "recommend reviewer for code review";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs[0]!.to).toBe("reviewer");
  });

  it("detects 'next: @agent' pattern", () => {
    const output = "next: @tester";
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    expect(result.handoffs[0]!.to).toBe("tester");
  });

  it("does not detect when enableNaturalLanguage is false", () => {
    const d = new HandoffDetector({ enableNaturalLanguage: false });
    const output = "hand this off to coder";
    const result = d.detect(output);
    expect(result.detected).toBe(false);
  });

  it("only takes first NL match", () => {
    const output = "hand off to coder and also pass to tester";
    const result = detector.detect(output);
    expect(result.handoffs).toHaveLength(1);
  });
});

// ============================================================================
// detect — priority order
// ============================================================================

describe("detect priority order", () => {
  it("prefers JSON block over inline tag", () => {
    const output = '[@coder: inline] and ```json\n{"handoff": {"to": "architect", "intent": "design"}}\n```';
    const result = detector.detect(output);
    expect(result.method).toBe("json_block");
  });

  it("prefers inline tag over explicit marker", () => {
    const output = '[@coder: implement] HANDOFF: @architect "design"';
    const result = detector.detect(output);
    expect(result.method).toBe("inline_tag");
  });

  it("returns no detection when no patterns match", () => {
    const result = detector.detect("Just a normal conversation message");
    expect(result.detected).toBe(false);
    expect(result.handoffs).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});

// ============================================================================
// validate
// ============================================================================

describe("validate", () => {
  it("validates valid handoff", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement the feature"}}\n```';
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    expect(validation.valid).toBe(true);
    expect(validation.handoff).toBeDefined();
    expect(validation.errors).toEqual([]);
  });

  it("rejects invalid target agent", () => {
    // Create a handoff manually with an invalid role
    const output = '```json\n{"handoff": {"to": "coder", "intent": "code it"}}\n```';
    const detection = detector.detect(output);
    const handoff = { ...detection.handoffs[0]!, to: "invalidrole" as any };
    const validation = detector.validate(handoff);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Invalid target agent: invalidrole");
  });

  it("rejects short intent (< 3 chars)", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "ab"}}\n```';
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("Intent is too short"))).toBe(true);
  });

  it("checks transition when sourceAgent is set", () => {
    const d = new HandoffDetector({ sourceAgent: "ceo" });
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```';
    const detection = d.detect(output);
    const validation = d.validate(detection.handoffs[0]!);

    // CEO → coder is not allowed
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("not allowed"))).toBe(true);
  });

  it("allows valid transition", () => {
    const d = new HandoffDetector({ sourceAgent: "architect" });
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement the design"}}\n```';
    const detection = d.detect(output);
    const validation = d.validate(detection.handoffs[0]!);

    expect(validation.valid).toBe(true);
  });

  it("warns on P0 priority", () => {
    const output = 'HANDOFF: @coder "urgent implementation"';
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    expect(validation.warnings.some((w) => w.includes("P0"))).toBe(true);
  });

  it("warns on very long intent (> 200 chars)", () => {
    const output = `\`\`\`json\n{"handoff": {"to": "coder", "intent": "${"x".repeat(250)}"}}\n\`\`\``;
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    expect(validation.warnings.some((w) => w.includes("very long"))).toBe(true);
  });

  it("does not include handoff in result when invalid", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "ab"}}\n```';
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    expect(validation.valid).toBe(false);
    expect(validation.handoff).toBeUndefined();
  });
});

// ============================================================================
// detectAndValidate
// ============================================================================

describe("detectAndValidate", () => {
  it("detects and validates in one call", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```';
    const { detection, validations } = detector.detectAndValidate(output);

    expect(detection.detected).toBe(true);
    expect(validations).toHaveLength(1);
    expect(validations[0]!.valid).toBe(true);
  });

  it("returns empty validations when nothing detected", () => {
    const { detection, validations } = detector.detectAndValidate("no handoff");
    expect(detection.detected).toBe(false);
    expect(validations).toEqual([]);
  });
});

// ============================================================================
// extractFirst
// ============================================================================

describe("extractFirst", () => {
  it("returns first valid handoff", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```';
    const handoff = detector.extractFirst(output);

    expect(handoff).not.toBeNull();
    expect(handoff!.to).toBe("coder");
  });

  it("returns null when nothing detected", () => {
    const handoff = detector.extractFirst("no handoff");
    expect(handoff).toBeNull();
  });

  it("skips invalid handoffs to find first valid", () => {
    // First handoff has short intent (invalid), second is valid
    const d = new HandoffDetector({ sourceAgent: "architect" });
    const output = '```json\n{"handoff": [{"to": "coder", "intent": "ab"}, {"to": "coder", "intent": "implement the full feature"}]}\n```';
    const handoff = d.extractFirst(output);

    expect(handoff).not.toBeNull();
    expect(handoff!.intent).toBe("implement the full feature");
  });
});

// ============================================================================
// setSourceAgent
// ============================================================================

describe("setSourceAgent", () => {
  it("updates source agent for validation", () => {
    detector.setSourceAgent("pm" as any);
    const output = '```json\n{"handoff": {"to": "architect", "intent": "design the system"}}\n```';
    const detection = detector.detect(output);
    const validation = detector.validate(detection.handoffs[0]!);

    // pm → architect is allowed
    expect(validation.valid).toBe(true);
  });
});

// ============================================================================
// CPO C3: Safety Cases
// ============================================================================

describe("CPO C3: malformed JSON", () => {
  it("handles broken brackets gracefully", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "code"\n```';
    const result = detector.detect(output);
    // Should not crash — JSON parse fails silently
    expect(result.detected).toBe(false);
  });

  it("handles unclosed strings in JSON", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "missing close\n```';
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });

  it("handles completely invalid JSON", () => {
    const output = '```json\nnot json at all {{{}\n```';
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });

  it("handles JSON with null handoff value", () => {
    const output = '```json\n{"handoff": null}\n```';
    const result = detector.detect(output);
    // null handoff → items loop produces nothing
    expect(result.detected).toBe(false);
  });

  it("handles JSON with missing to field", () => {
    const output = '```json\n{"handoff": {"intent": "no target"}}\n```';
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });
});

describe("CPO C3: nested code blocks", () => {
  it("handles triple backticks inside content", () => {
    const output = "Here's some code:\n````\n```json\n{\"handoff\": {\"to\": \"coder\", \"intent\": \"code\"}}\n```\n````";
    const result = detector.detect(output);
    // May or may not detect depending on regex — key is no crash
    expect(typeof result.detected).toBe("boolean");
  });

  it("handles multiple code blocks (only first valid wins)", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "first task"}}\n```\nSome text\n```json\n{"handoff": {"to": "tester", "intent": "second task"}}\n```';
    const result = detector.detect(output);

    expect(result.detected).toBe(true);
    // Both blocks should be detected
    expect(result.handoffs.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty code block", () => {
    const output = "```json\n\n```";
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });
});

describe("CPO C3: partial handoff markers", () => {
  it("handles incomplete {\"handoff\": without closing", () => {
    const output = '```json\n{"handoff": {"to": "coder"';
    const result = detector.detect(output);
    // No closing ``` → regex won't match
    expect(result.detected).toBe(false);
  });

  it("handles HANDOFF: without agent", () => {
    const output = "HANDOFF:  ";
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });

  it("handles incomplete inline tag", () => {
    const output = "[@coder: ";
    const result = detector.detect(output);
    // No closing ] → regex won't match
    expect(result.detected).toBe(false);
  });

  it("handles partial HANDOFF keyword", () => {
    const output = "HANDO: @coder implement";
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });
});

describe("CPO C3: regex lastIndex / g-flag stateful behavior", () => {
  it("detect called twice on same input produces same result", () => {
    const output = '```json\n{"handoff": {"to": "coder", "intent": "implement"}}\n```';
    const r1 = detector.detect(output);
    const r2 = detector.detect(output);

    expect(r1.detected).toBe(r2.detected);
    expect(r1.handoffs.length).toBe(r2.handoffs.length);
    expect(r1.confidence).toBe(r2.confidence);
  });

  it("detect called repeatedly does not degrade", () => {
    const output = "[@coder: implement feature]";
    // Call 10 times — g-flag regex lastIndex must be reset each time
    for (let i = 0; i < 10; i++) {
      const result = detector.detect(output);
      expect(result.detected).toBe(true);
      expect(result.handoffs).toHaveLength(1);
    }
  });

  it("explicit marker g-flag reset works", () => {
    const output = 'HANDOFF: @coder "build the feature"';
    const r1 = detector.detect(output);
    const r2 = detector.detect(output);
    expect(r1.detected).toBe(true);
    expect(r2.detected).toBe(true);
  });

  it("alternating detect calls on different inputs", () => {
    const a = '```json\n{"handoff": {"to": "coder", "intent": "code"}}\n```';
    const b = "[@tester: run tests]";

    const ra = detector.detect(a);
    const rb = detector.detect(b);
    const ra2 = detector.detect(a);

    expect(ra.method).toBe("json_block");
    expect(rb.method).toBe("inline_tag");
    expect(ra2.method).toBe("json_block");
  });
});

describe("CPO C3: empty/null/undefined inputs", () => {
  it("handles empty string", () => {
    const result = detector.detect("");
    expect(result.detected).toBe(false);
    expect(result.handoffs).toEqual([]);
  });

  it("handles whitespace-only string", () => {
    const result = detector.detect("   \n\t  ");
    expect(result.detected).toBe(false);
  });

  it("handles very long input without handoff", () => {
    const output = "x".repeat(10000);
    const result = detector.detect(output);
    expect(result.detected).toBe(false);
  });

  it("handles input with only special characters", () => {
    const result = detector.detect("!@#$%^&*()_+-=[]{}|;':\",./<>?");
    expect(result.detected).toBe(false);
  });
});

// ============================================================================
// Singleton & Factory
// ============================================================================

describe("singleton", () => {
  it("getHandoffDetector returns same instance", () => {
    const a = getHandoffDetector();
    const b = getHandoffDetector();
    expect(a).toBe(b);
  });

  it("resetHandoffDetector clears the singleton", () => {
    const a = getHandoffDetector();
    resetHandoffDetector();
    const b = getHandoffDetector();
    expect(a).not.toBe(b);
  });
});

describe("createHandoffDetector", () => {
  it("creates a new independent instance", () => {
    const a = createHandoffDetector();
    const b = createHandoffDetector();
    expect(a).not.toBe(b);
  });

  it("accepts config", () => {
    const d = createHandoffDetector({ minConfidence: 0.99 });
    const result = d.detect("[@coder: implement]");
    // confidence 0.9 < 0.99 → not detected
    expect(result.detected).toBe(false);
  });
});

describe("detectHandoff helper", () => {
  it("detects handoff using global detector", () => {
    const result = detectHandoff('```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```');
    expect(result.detected).toBe(true);
  });

  it("sets source agent when provided", () => {
    const result = detectHandoff('```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```', "architect" as any);
    expect(result.detected).toBe(true);
  });

  it("does not mutate global singleton when sourceAgent is provided (CTO Sprint 121 fix)", () => {
    // Get singleton and note its state
    const singleton = getHandoffDetector();
    const origSource = (singleton as any).sourceAgent;

    // Call detectHandoff with a sourceAgent — should use throwaway instance
    detectHandoff('```json\n{"handoff": {"to": "coder", "intent": "implement feature"}}\n```', "pm" as any);

    // Singleton should NOT have been mutated
    expect((singleton as any).sourceAgent).toBe(origSource);
  });
});
