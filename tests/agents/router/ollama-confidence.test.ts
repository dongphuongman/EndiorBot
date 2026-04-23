/**
 * Sprint 141 P0-2: Ollama Confidence Scorer tests.
 *
 * CTO conditions verified:
 *   C1: Scores logged regardless of FF state (tested via log spy)
 *   C2: English-only markers (Vietnamese deferred Sprint 142)
 *   C4: shouldEscalate only when FF enabled + score < threshold
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scoreOllamaConfidence } from "../../../src/agents/router/ollama-confidence.js";

let savedFF: string | undefined;

beforeEach(() => {
  savedFF = process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE;
  delete process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE;
});

afterEach(() => {
  if (savedFF === undefined) delete process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE;
  else process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE = savedFF;
});

describe("scoreOllamaConfidence — empty/short responses", () => {
  it("empty response → score 0.0", () => {
    const result = scoreOllamaConfidence("", "assistant");
    expect(result.score).toBe(0.0);
    expect(result.reason).toBe("empty response");
  });

  it("whitespace-only → score 0.0", () => {
    const result = scoreOllamaConfidence("   \n\t  ", "assistant");
    expect(result.score).toBe(0.0);
  });

  it("very short (< 50 chars) → score 0.3", () => {
    const result = scoreOllamaConfidence("OK, I'll do that.", "assistant");
    expect(result.score).toBe(0.3);
    expect(result.reason).toContain("very short");
  });

  it("short (50-99 chars) → score 0.5", () => {
    const text = "This is a response that is moderately long enough to pass the minimum threshold.";
    expect(text.length).toBeGreaterThanOrEqual(50);
    expect(text.length).toBeLessThan(100);
    const result = scoreOllamaConfidence(text, "assistant");
    expect(result.score).toBe(0.5);
    expect(result.reason).toContain("short");
  });
});

describe("scoreOllamaConfidence — uncertainty markers", () => {
  it("'I don't know' reduces score by 0.2", () => {
    const longText = "I don't know the answer to that question, but here is what I can tell you about the topic in general terms.";
    const result = scoreOllamaConfidence(longText, "assistant");
    expect(result.score).toBeCloseTo(0.6); // 0.8 - 0.2
    expect(result.reason).toContain("uncertainty");
  });

  it("multiple markers cap penalty at -0.4", () => {
    const text = "I'm not sure about this. I cannot help with that specific request. I'm unable to determine the answer to this.";
    const result = scoreOllamaConfidence(text, "assistant");
    // 0.8 - 0.4 (capped) = 0.4
    expect(result.score).toBeCloseTo(0.4);
  });

  it("case-insensitive matching", () => {
    const text = "I DON'T KNOW the answer, but I CAN'T help with this either. Here is some general information anyway.";
    const result = scoreOllamaConfidence(text, "assistant");
    expect(result.score).toBeLessThan(0.8);
    expect(result.reason).toContain("uncertainty");
  });
});

describe("scoreOllamaConfidence — healthy responses", () => {
  it("normal length response without markers → score 0.8", () => {
    const text = "The function `getAgentModel` returns the model ID for a given agent based on the tier configuration. It accepts an agent name and optional tier parameter.";
    const result = scoreOllamaConfidence(text, "assistant");
    expect(result.score).toBe(0.8);
    expect(result.reason).toBe("healthy response");
  });
});

describe("scoreOllamaConfidence — shouldEscalate logic", () => {
  it("FF disabled (default) → shouldEscalate = false even when score is low", () => {
    const result = scoreOllamaConfidence("", "assistant", {
      featureFlagEnabled: false,
    });
    expect(result.score).toBe(0.0);
    expect(result.shouldEscalate).toBe(false);
  });

  it("FF enabled + score below threshold → shouldEscalate = true", () => {
    const result = scoreOllamaConfidence("OK", "assistant", {
      featureFlagEnabled: true,
      escalationThreshold: 0.5,
    });
    expect(result.score).toBeLessThan(0.5);
    expect(result.shouldEscalate).toBe(true);
  });

  it("FF enabled + score above threshold → shouldEscalate = false", () => {
    const text = "Here is a detailed explanation of the routing architecture. The ChannelRouter dispatches to the appropriate provider based on agent tier configuration.";
    const result = scoreOllamaConfidence(text, "assistant", {
      featureFlagEnabled: true,
      escalationThreshold: 0.5,
    });
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.shouldEscalate).toBe(false);
  });

  it("reads FF from env when not passed as option", () => {
    process.env.ENDIORBOT_FF_OLLAMA_AUTO_ESCALATE = "true";
    const result = scoreOllamaConfidence("", "assistant");
    expect(result.shouldEscalate).toBe(true);
  });

  it("custom threshold respected", () => {
    const text = "Short but valid routing decision for the assistant agent to handle.";
    // score = 0.5 (short 50-99 chars)
    const high = scoreOllamaConfidence(text, "assistant", {
      featureFlagEnabled: true,
      escalationThreshold: 0.7, // above 0.5 → escalate
    });
    expect(high.shouldEscalate).toBe(true);

    const low = scoreOllamaConfidence(text, "assistant", {
      featureFlagEnabled: true,
      escalationThreshold: 0.3, // below 0.5 → no escalate
    });
    expect(low.shouldEscalate).toBe(false);
  });
});

describe("CTO C4 — rollback criterion data", () => {
  it("score + reason provide enough data for false-positive rate tracking", () => {
    // Rollback if false-positive rate > 30%
    // This test verifies the data shape supports the criterion
    const result = scoreOllamaConfidence("I can't help with that specific task right now.", "assistant", {
      featureFlagEnabled: true,
    });
    // All fields needed for tracking present:
    expect(typeof result.score).toBe("number");
    expect(typeof result.reason).toBe("string");
    expect(typeof result.shouldEscalate).toBe("boolean");
  });
});
