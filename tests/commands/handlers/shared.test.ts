/**
 * Tests for shared handler utilities.
 *
 * @module tests/commands/handlers/shared
 * @sprint 120 — Track A4
 */

import { describe, it, expect } from "vitest";
import { sanitizeForEcho, TEAM_ICONS } from "../../../src/commands/handlers/shared.js";

describe("sanitizeForEcho", () => {
  it("strips Markdown links but preserves link text", () => {
    expect(sanitizeForEcho("[click here](https://example.com)")).toBe("click here");
  });

  it("strips HTTP URLs", () => {
    expect(sanitizeForEcho("visit https://example.com now")).toBe("visit now");
  });

  it("strips HTTPS URLs", () => {
    expect(sanitizeForEcho("go to http://example.com please")).toBe("go to please");
  });

  it("strips www. URLs", () => {
    expect(sanitizeForEcho("check www.example.com/path")).toBe("check");
  });

  it("strips Markdown special characters", () => {
    const input = "**bold** _italic_ `code` [link] (parens) ~strike~ >quote #heading +plus |pipe {brace} \\escape";
    const result = sanitizeForEcho(input);
    expect(result).not.toMatch(/[*_`\[\]()~>#+|{}\\]/);
  });

  it("collapses multiple whitespace to single space", () => {
    expect(sanitizeForEcho("hello    world   test")).toBe("hello world test");
  });

  it("trims whitespace", () => {
    expect(sanitizeForEcho("  hello  ")).toBe("hello");
  });

  it("truncates to 80 chars", () => {
    const long = "a".repeat(120);
    expect(sanitizeForEcho(long).length).toBe(80);
  });

  it("handles empty string", () => {
    expect(sanitizeForEcho("")).toBe("");
  });
});

describe("TEAM_ICONS", () => {
  it("has entries for all 7 team IDs", () => {
    const expectedTeamIds = ["fullstack", "planning", "design", "dev", "qa", "ops", "executive"];
    for (const id of expectedTeamIds) {
      expect(TEAM_ICONS).toHaveProperty(id);
      expect(typeof TEAM_ICONS[id as keyof typeof TEAM_ICONS]).toBe("string");
      expect(TEAM_ICONS[id as keyof typeof TEAM_ICONS].length).toBeGreaterThan(0);
    }
  });

  it("has exactly 7 entries (no extras)", () => {
    expect(Object.keys(TEAM_ICONS)).toHaveLength(7);
  });
});
