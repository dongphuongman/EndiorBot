/**
 * Tests for SessionIntelligenceEnvelope — Sprint 84 (ADR-025)
 *
 * Covers: VALID_AGENT_ROLES array, AgentRole type, isValidAgentRole() guard.
 *
 * @module tests/bridge/intelligence/envelope
 */

import { describe, it, expect } from "vitest";
import {
  VALID_AGENT_ROLES,
  isValidAgentRole,
  type AgentRole,
} from "../../../src/bridge/intelligence/envelope.js";

describe("SessionIntelligenceEnvelope", () => {
  // --------------------------------------------------------------------------
  // VALID_AGENT_ROLES
  // --------------------------------------------------------------------------

  describe("VALID_AGENT_ROLES", () => {
    it("should contain exactly 14 roles", () => {
      expect(VALID_AGENT_ROLES).toHaveLength(14);
    });

    it("should include all 14 known EndiorBot roles", () => {
      const expected: AgentRole[] = [
        "pm",
        "architect",
        "coder",
        "reviewer",
        "tester",
        "researcher",
        "devops",
        "fullstack",
        "pjm",
        "ceo",
        "cpo",
        "cso",
        "cto",
        "assistant",
      ];
      for (const role of expected) {
        expect(VALID_AGENT_ROLES).toContain(role);
      }
    });

    it("should not contain duplicates", () => {
      const unique = new Set(VALID_AGENT_ROLES);
      expect(unique.size).toBe(VALID_AGENT_ROLES.length);
    });
  });

  // --------------------------------------------------------------------------
  // isValidAgentRole
  // --------------------------------------------------------------------------

  describe("isValidAgentRole", () => {
    it("should return true for all valid roles", () => {
      for (const role of VALID_AGENT_ROLES) {
        expect(isValidAgentRole(role)).toBe(true);
      }
    });

    it("should return true for individual spot-checked roles", () => {
      expect(isValidAgentRole("pm")).toBe(true);
      expect(isValidAgentRole("architect")).toBe(true);
      expect(isValidAgentRole("coder")).toBe(true);
      expect(isValidAgentRole("cto")).toBe(true);
      expect(isValidAgentRole("assistant")).toBe(true);
    });

    it("should return false for invalid string roles", () => {
      expect(isValidAgentRole("invalid")).toBe(false);
      expect(isValidAgentRole("unknown")).toBe(false);
      expect(isValidAgentRole("admin")).toBe(false);
      expect(isValidAgentRole("superuser")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidAgentRole("")).toBe(false);
    });

    it("should be case-sensitive — uppercase variants are invalid", () => {
      expect(isValidAgentRole("PM")).toBe(false);
      expect(isValidAgentRole("Architect")).toBe(false);
      expect(isValidAgentRole("CODER")).toBe(false);
      expect(isValidAgentRole("CTO")).toBe(false);
    });

    it("should return false for roles with leading/trailing whitespace", () => {
      expect(isValidAgentRole(" pm")).toBe(false);
      expect(isValidAgentRole("pm ")).toBe(false);
      expect(isValidAgentRole(" coder ")).toBe(false);
    });

    it("should act as a type guard — narrowing string to AgentRole", () => {
      const role: string = "architect";
      if (isValidAgentRole(role)) {
        // TypeScript narrowing: role is now AgentRole inside this block
        const narrowed: AgentRole = role;
        expect(narrowed).toBe("architect");
      } else {
        throw new Error("Expected isValidAgentRole to return true for 'architect'");
      }
    });
  });
});
