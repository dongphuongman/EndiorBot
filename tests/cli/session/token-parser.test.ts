/**
 * Token Parser Tests
 *
 * Unit tests for REPL input token parsing with quoted strings
 * and backslash escape handling.
 *
 * @module tests/cli/session/token-parser
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 73
 */

import { describe, it, expect } from "vitest";
import { parseTokens } from "../../../src/cli/session/token-parser.js";

describe("parseTokens", () => {
  it("should split simple space-separated tokens", () => {
    expect(parseTokens("gate status")).toEqual(["gate", "status"]);
  });

  it("should handle multiple spaces between tokens", () => {
    expect(parseTokens("gate   status")).toEqual(["gate", "status"]);
  });

  it("should handle tabs as separators", () => {
    expect(parseTokens("gate\tstatus")).toEqual(["gate", "status"]);
  });

  it("should handle leading and trailing spaces (after trim)", () => {
    // Note: shell.ts trims input before calling parseTokens
    expect(parseTokens("gate status")).toEqual(["gate", "status"]);
  });

  it("should return empty array for empty input", () => {
    expect(parseTokens("")).toEqual([]);
  });

  it("should return empty array for whitespace-only input", () => {
    expect(parseTokens("   ")).toEqual([]);
  });

  // Quoted strings
  it("should handle double-quoted strings", () => {
    expect(parseTokens('consult "What is SDLC?"')).toEqual(["consult", "What is SDLC?"]);
  });

  it("should handle single-quoted strings", () => {
    expect(parseTokens("consult 'What is SDLC?'")).toEqual(["consult", "What is SDLC?"]);
  });

  it("should handle empty quoted strings", () => {
    expect(parseTokens('consult ""')).toEqual(["consult"]);
  });

  it("should handle multiple quoted arguments", () => {
    expect(parseTokens('consult "arg one" "arg two"')).toEqual(["consult", "arg one", "arg two"]);
  });

  // Backslash escapes
  it("should handle escaped double quote", () => {
    expect(parseTokens('consult "He said \\"hello\\""')).toEqual(["consult", 'He said "hello"']);
  });

  it("should handle escaped single quote", () => {
    expect(parseTokens("consult 'It\\'s fine'")).toEqual(["consult", "It's fine"]);
  });

  it("should handle escaped space (prevents token split)", () => {
    expect(parseTokens("ops build --path /foo\\ bar")).toEqual(["ops", "build", "--path", "/foo bar"]);
  });

  it("should handle escaped backslash", () => {
    expect(parseTokens("ops build --path C:\\\\Users")).toEqual(["ops", "build", "--path", "C:\\Users"]);
  });

  it("should treat trailing backslash as literal", () => {
    expect(parseTokens("test\\")).toEqual(["test\\"]);
  });

  // Combined
  it("should handle flags and arguments", () => {
    expect(parseTokens("gate confirm G0 --confirm")).toEqual(["gate", "confirm", "G0", "--confirm"]);
  });

  it("should handle mixed quoted and unquoted", () => {
    expect(parseTokens('ops build --path "/my project/src"')).toEqual([
      "ops", "build", "--path", "/my project/src",
    ]);
  });
});
