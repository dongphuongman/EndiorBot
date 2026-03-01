/**
 * Cross-Project Context Manager Tests
 *
 * @module tests/agents/context/cross-project
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 59
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CrossProjectManager,
  getCrossProjectManager,
  resetCrossProjectManager,
  type CrossProjectOptions,
} from "../../../src/agents/context/cross-project.js";
import * as projectVerifier from "../../../src/agents/context/project-verifier.js";

// Mock project verifier
vi.mock("../../../src/agents/context/project-verifier.js", () => ({
  getProjectVerifier: vi.fn(() => ({
    verify: vi.fn((path: string) => ({
      valid: true,
      name: path.split("/").pop() || "Unknown",
      tier: "STANDARD" as const,
      path,
      git: {
        branch: "main",
        clean: true,
      },
      errors: [],
      warnings: [],
    })),
  })),
}));

describe("CrossProjectManager", () => {
  beforeEach(() => {
    resetCrossProjectManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Singleton", () => {
    it("should return singleton instance", () => {
      const manager1 = getCrossProjectManager();
      const manager2 = getCrossProjectManager();
      expect(manager1).toBe(manager2);
    });

    it("should reset singleton", () => {
      const manager1 = getCrossProjectManager();
      resetCrossProjectManager();
      const manager2 = getCrossProjectManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe("loadCrossProjectContext", () => {
    it("should load primary project context", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: [],
        tokenBudget: 50000,
      };

      const context = await manager.loadCrossProjectContext(options);

      expect(context.primary).toBeDefined();
      expect(context.primary.name).toBe("primary");
      expect(context.primary.isPrimary).toBe(true);
      expect(context.secondary).toHaveLength(0);
    });

    it("should load secondary projects", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary1", "/test/secondary2"],
        tokenBudget: 50000,
      };

      const context = await manager.loadCrossProjectContext(options);

      expect(context.primary.name).toBe("primary");
      expect(context.secondary).toHaveLength(2);
      expect(context.secondary[0].name).toBe("secondary1");
      expect(context.secondary[1].name).toBe("secondary2");
    });

    it("should allocate tokens with primary-first strategy", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary"],
        tokenBudget: 50000,
        mergeStrategy: "primary-first",
      };

      const context = await manager.loadCrossProjectContext(options);

      // Primary gets 60% = 30000
      expect(context.primary.tokenAllocation).toBe(30000);
      // Secondary gets remaining split
      expect(context.secondary[0].tokenAllocation).toBeGreaterThanOrEqual(5000);
    });

    it("should allocate tokens with even strategy", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary"],
        tokenBudget: 50000,
        mergeStrategy: "even",
      };

      const context = await manager.loadCrossProjectContext(options);

      // 50000 / 2 = 25000 each
      expect(context.primary.tokenAllocation).toBe(25000);
      expect(context.secondary[0].tokenAllocation).toBe(25000);
    });

    it("should limit to maxProjects", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/s1", "/test/s2", "/test/s3", "/test/s4", "/test/s5"],
        tokenBudget: 50000,
        maxProjects: 3,
      };

      const context = await manager.loadCrossProjectContext(options);

      // Primary + 2 secondary = 3 max
      expect(context.secondary).toHaveLength(2);
      expect(context.warnings).toContain("Too many projects (6). Limited to 3.");
    });

    it("should build project summaries", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary"],
        tokenBudget: 50000,
      };

      const context = await manager.loadCrossProjectContext(options);

      expect(context.summaries).toHaveLength(2);
      expect(context.summaries[0]).toContain("Primary:");
      expect(context.summaries[1]).toContain("Secondary:");
    });
  });

  describe("formatContext", () => {
    it("should format context for display", async () => {
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary"],
        tokenBudget: 50000,
      };

      const context = await manager.loadCrossProjectContext(options);
      const formatted = manager.formatContext(context);

      expect(formatted).toContain("Cross-Project Context:");
      expect(formatted).toContain("Primary: primary");
      expect(formatted).toContain("Secondary Projects:");
      expect(formatted).toContain("Tokens:");
    });
  });

  describe("Tier Compatibility", () => {
    it("should skip incompatible tier projects", async () => {
      // Mock verifier to return different tiers
      const mockVerify = vi.fn()
        .mockReturnValueOnce({
          valid: true,
          name: "primary",
          tier: "LITE",
          path: "/test/primary",
          git: { branch: "main", clean: true },
          errors: [],
          warnings: [],
        })
        .mockReturnValueOnce({
          valid: true,
          name: "secondary",
          tier: "ENTERPRISE", // Higher tier than primary
          path: "/test/secondary",
          git: { branch: "main", clean: true },
          errors: [],
          warnings: [],
        });

      vi.mocked(projectVerifier.getProjectVerifier).mockReturnValue({
        verify: mockVerify,
      } as ReturnType<typeof projectVerifier.getProjectVerifier>);

      resetCrossProjectManager();
      const manager = getCrossProjectManager();

      const options: CrossProjectOptions = {
        primaryPath: "/test/primary",
        secondaryProjects: ["/test/secondary"],
        tokenBudget: 50000,
      };

      const context = await manager.loadCrossProjectContext(options);

      // Secondary should be skipped due to tier mismatch
      expect(context.secondary).toHaveLength(0);
      expect(context.warnings.some(w => w.includes("Tier mismatch"))).toBe(true);
    });
  });
});
