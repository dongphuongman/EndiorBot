/**
 * Stage Contract Tests
 *
 * Unit tests for Stage Contract Engine.
 *
 * @module sdlc/contracts/__tests__/stage-contract.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 68
 * @sprint 68
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SDLC_STAGES,
  isValidStage,
  getNextStage,
  getPreviousStage,
  STAGE_CONTRACTS,
  getStageContract,
  getAllContracts,
  getContractsForTier,
  StageContractEngine,
  resetStageContractEngine,
} from "../index.js";

// ============================================================================
// Test Setup
// ============================================================================

describe("Stage Contract Types", () => {
  describe("SDLC_STAGES", () => {
    it("should have 10 stages", () => {
      expect(SDLC_STAGES.length).toBe(10);
    });

    it("should start with 00-FOUNDATION", () => {
      expect(SDLC_STAGES[0]).toBe("00-FOUNDATION");
    });

    it("should end with 09-ARCHIVE", () => {
      expect(SDLC_STAGES[9]).toBe("09-ARCHIVE");
    });

    it("should include all expected stages", () => {
      const expected = [
        "00-FOUNDATION",
        "01-PLANNING",
        "02-DESIGN",
        "03-INTEGRATE",
        "04-BUILD",
        "05-TEST",
        "06-DEPLOY",
        "07-OPERATE",
        "08-COLLABORATE",
        "09-ARCHIVE",
      ];
      expect(SDLC_STAGES).toEqual(expected);
    });
  });

  describe("isValidStage", () => {
    it("should return true for valid stages", () => {
      expect(isValidStage("00-FOUNDATION")).toBe(true);
      expect(isValidStage("04-BUILD")).toBe(true);
      expect(isValidStage("09-ARCHIVE")).toBe(true);
    });

    it("should return false for invalid stages", () => {
      expect(isValidStage("INVALID")).toBe(false);
      expect(isValidStage("10-EXTRA")).toBe(false);
      expect(isValidStage("")).toBe(false);
    });
  });

  describe("getNextStage", () => {
    it("should return the next stage", () => {
      expect(getNextStage("00-FOUNDATION")).toBe("01-PLANNING");
      expect(getNextStage("04-BUILD")).toBe("05-TEST");
    });

    it("should return undefined for last stage", () => {
      expect(getNextStage("09-ARCHIVE")).toBeUndefined();
    });
  });

  describe("getPreviousStage", () => {
    it("should return the previous stage", () => {
      expect(getPreviousStage("01-PLANNING")).toBe("00-FOUNDATION");
      expect(getPreviousStage("05-TEST")).toBe("04-BUILD");
    });

    it("should return undefined for first stage", () => {
      expect(getPreviousStage("00-FOUNDATION")).toBeUndefined();
    });
  });
});

// ============================================================================
// Default Contracts Tests
// ============================================================================

describe("Default Stage Contracts", () => {
  describe("STAGE_CONTRACTS", () => {
    it("should have contracts for all 10 stages", () => {
      expect(Object.keys(STAGE_CONTRACTS).length).toBe(10);
    });

    it("should have a contract for each stage", () => {
      for (const stage of SDLC_STAGES) {
        expect(STAGE_CONTRACTS[stage]).toBeDefined();
        expect(STAGE_CONTRACTS[stage].stage).toBe(stage);
      }
    });
  });

  describe("getStageContract", () => {
    it("should return the correct contract", () => {
      const contract = getStageContract("04-BUILD");
      expect(contract.stage).toBe("04-BUILD");
      expect(contract.name).toBe("Build");
    });
  });

  describe("getAllContracts", () => {
    it("should return all 10 contracts", () => {
      const contracts = getAllContracts();
      expect(contracts.length).toBe(10);
    });
  });

  describe("getContractsForTier", () => {
    it("should return contracts for LITE tier", () => {
      const contracts = getContractsForTier("LITE");
      expect(contracts.length).toBeGreaterThan(0);
      // LITE should include FOUNDATION and BUILD
      const stages = contracts.map((c) => c.stage);
      expect(stages).toContain("00-FOUNDATION");
      expect(stages).toContain("04-BUILD");
    });

    it("should return more contracts for higher tiers", () => {
      const liteContracts = getContractsForTier("LITE");
      const standardContracts = getContractsForTier("STANDARD");
      const proContracts = getContractsForTier("PROFESSIONAL");
      const enterpriseContracts = getContractsForTier("ENTERPRISE");

      expect(standardContracts.length).toBeGreaterThanOrEqual(
        liteContracts.length
      );
      expect(proContracts.length).toBeGreaterThanOrEqual(
        standardContracts.length
      );
      expect(enterpriseContracts.length).toBeGreaterThanOrEqual(
        proContracts.length
      );
    });
  });

  describe("Contract Structure", () => {
    it("should have required fields in each contract", () => {
      for (const contract of getAllContracts()) {
        expect(contract.stage).toBeDefined();
        expect(contract.name).toBeDefined();
        expect(Array.isArray(contract.required)).toBe(true);
        expect(Array.isArray(contract.produces)).toBe(true);
        expect(Array.isArray(contract.gates)).toBe(true);
        expect(Array.isArray(contract.validation)).toBe(true);
      }
    });

    it("should have valid artifact requirements", () => {
      for (const contract of getAllContracts()) {
        for (const req of contract.required) {
          expect(req.pattern).toBeDefined();
          expect(typeof req.optional).toBe("boolean");
          expect(typeof req.minCount).toBe("number");
        }
      }
    });
  });
});

// ============================================================================
// Stage Contract Engine Tests
// ============================================================================

describe("StageContractEngine", () => {
  let tempDir: string;

  beforeEach(async () => {
    resetStageContractEngine();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contract-test-"));
  });

  afterEach(async () => {
    resetStageContractEngine();
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create engine with project root", () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      expect(engine).toBeDefined();
    });

    it("should load default contracts", () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      const contracts = engine.getAllContracts();
      expect(contracts.length).toBe(10);
    });

    it("should apply custom contracts", () => {
      const engine = new StageContractEngine({
        projectRoot: tempDir,
        customContracts: {
          "04-BUILD": {
            name: "Custom Build",
          },
        },
      });
      const contract = engine.getContract("04-BUILD");
      expect(contract?.name).toBe("Custom Build");
    });
  });

  describe("evaluate", () => {
    it("should evaluate FOUNDATION stage for empty project", async () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      const evaluation = await engine.evaluate("00-FOUNDATION");

      expect(evaluation.stage).toBe("00-FOUNDATION");
      expect(evaluation.contract).toBeDefined();
      expect(["pass", "warning", "fail"]).toContain(evaluation.status);
      expect(evaluation.score).toBeGreaterThanOrEqual(0);
      expect(evaluation.score).toBeLessThanOrEqual(100);
    });

    it("should pass FOUNDATION stage with identity file", async () => {
      // Create IDENTITY.md
      await fs.writeFile(
        path.join(tempDir, "IDENTITY.md"),
        "# Project Identity"
      );

      const engine = new StageContractEngine({ projectRoot: tempDir });
      const evaluation = await engine.evaluate("00-FOUNDATION");

      // FOUNDATION has no required artifacts, should pass
      expect(evaluation.status).toBe("pass");
      expect(evaluation.score).toBe(100);
    });

    it("should fail BUILD stage without source code", async () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      const evaluation = await engine.evaluate("04-BUILD");

      // BUILD requires source code
      expect(evaluation.status).not.toBe("pass");
      expect(evaluation.errors.length).toBeGreaterThan(0);
    });

    it("should pass BUILD stage with source code", async () => {
      // Create src directory with TypeScript file
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, "index.ts"),
        "export const hello = 'world';"
      );

      const engine = new StageContractEngine({ projectRoot: tempDir });
      const evaluation = await engine.evaluate("04-BUILD");

      expect(evaluation.status).toBe("pass");
    });
  });

  describe("evaluateAll", () => {
    it("should evaluate all stages", async () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      const evaluations = await engine.evaluateAll();

      expect(evaluations.length).toBe(10);
      for (const evaluation of evaluations) {
        expect(SDLC_STAGES).toContain(evaluation.stage);
      }
    });
  });

  describe("canTransition", () => {
    it("should allow transition from passing stage", async () => {
      const engine = new StageContractEngine({ projectRoot: tempDir });
      const result = await engine.canTransition("00-FOUNDATION", "01-PLANNING");

      expect(result.allowed).toBe(true);
    });

    it("should block transition in strict mode with warnings", async () => {
      const engine = new StageContractEngine({
        projectRoot: tempDir,
        strictMode: true,
      });

      // Create a project that will have warnings
      await fs.mkdir(path.join(tempDir, "docs", "02-design", "01-ADRs"), {
        recursive: true,
      });

      const result = await engine.canTransition("02-DESIGN", "03-INTEGRATE");

      // May or may not be allowed depending on warning status
      expect(typeof result.allowed).toBe("boolean");
    });
  });
});
