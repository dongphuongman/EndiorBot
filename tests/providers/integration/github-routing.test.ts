/**
 * GitHub Models → Routing Integration Tests
 *
 * Tests integration between GitHub Models provider and routing system.
 *
 * Per Sprint 46 Days 8-9 requirements:
 * - GitHub Models task-based model selection
 * - Model catalog verification
 * - Task routing configuration
 *
 * Note: Full resource router integration requires adding "github-models"
 * to the ProviderId type. These tests focus on model selection logic.
 *
 * @module tests/providers/integration/github-routing
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 46 Days 8-9
 */

import { describe, it, expect, vi } from "vitest";
import {
  GITHUB_MODELS,
  GITHUB_TASK_ROUTING,
  DEFAULT_MODEL,
  FREE_MODELS,
  PRO_MODELS,
  getGitHubModel,
  getApiModelName,
  isFreeTierModel,
  getModelsByProvider,
  selectModelForTask,
} from "../../../src/providers/github/config.js";

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}));

// ============================================================================
// Test Suites
// ============================================================================

describe("GitHub Models → Routing Integration", () => {
  // ==========================================================================
  // Model Catalog Tests
  // ==========================================================================

  describe("Model Catalog", () => {
    it("should expose all GitHub model IDs", () => {
      const modelIds = GITHUB_MODELS.map((m) => m.id);

      expect(modelIds).toContain("gpt-4o");
      expect(modelIds).toContain("gpt-4o-mini");
      expect(modelIds).toContain("llama-3.3-70b");
      expect(modelIds).toContain("phi-4");
      expect(modelIds).toContain("mistral-large");
    });

    it("should have correct API names for all models", () => {
      expect(getApiModelName("gpt-4o")).toBe("openai/gpt-4o");
      expect(getApiModelName("gpt-4o-mini")).toBe("openai/gpt-4o-mini");
      expect(getApiModelName("llama-3.3-70b")).toBe("meta/llama-3.3-70b-instruct");
      expect(getApiModelName("phi-4")).toBe("microsoft/phi-4");
      expect(getApiModelName("mistral-large")).toBe("mistral/mistral-large-2411");
    });

    it("should categorize free tier models correctly", () => {
      expect(FREE_MODELS).toContain("gpt-4o-mini");
      expect(FREE_MODELS).toContain("llama-3.3-70b");
      expect(FREE_MODELS).toContain("phi-4");
      expect(FREE_MODELS).toContain("mistral-small");
      expect(FREE_MODELS).toContain("cohere-command-r");
    });

    it("should categorize pro tier models correctly", () => {
      expect(PRO_MODELS).toContain("gpt-4o");
      expect(PRO_MODELS).toContain("o1-mini");
      expect(PRO_MODELS).toContain("mistral-large");
    });

    it("should verify free tier check function", () => {
      expect(isFreeTierModel("gpt-4o-mini")).toBe(true);
      expect(isFreeTierModel("phi-4")).toBe(true);
      expect(isFreeTierModel("gpt-4o")).toBe(false);
      expect(isFreeTierModel("o1-mini")).toBe(false);
    });
  });

  // ==========================================================================
  // Model Retrieval Tests
  // ==========================================================================

  describe("Model Retrieval", () => {
    it("should get model by ID", () => {
      const model = getGitHubModel("gpt-4o-mini");

      expect(model).toBeDefined();
      expect(model?.displayName).toBe("GPT-4o Mini");
      expect(model?.provider).toBe("openai");
      expect(model?.tier).toBe("free");
    });

    it("should return undefined for unknown model", () => {
      const model = getGitHubModel("unknown-model");
      expect(model).toBeUndefined();
    });

    it("should get models by provider", () => {
      const openaiModels = getModelsByProvider("openai");
      const metaModels = getModelsByProvider("meta");
      const msModels = getModelsByProvider("microsoft");

      expect(openaiModels.length).toBeGreaterThan(0);
      expect(metaModels.length).toBeGreaterThan(0);
      expect(msModels.length).toBeGreaterThan(0);

      expect(openaiModels.some((m) => m.id === "gpt-4o")).toBe(true);
      expect(metaModels.some((m) => m.id === "llama-3.3-70b")).toBe(true);
      expect(msModels.some((m) => m.id === "phi-4")).toBe(true);
    });
  });

  // ==========================================================================
  // Task-Based Model Selection
  // ==========================================================================

  describe("Task-Based Model Selection", () => {
    it("should select gpt-4o-mini for general tasks", () => {
      const model = selectModelForTask("general");
      expect(model).toBe("gpt-4o-mini");
    });

    it("should select gpt-4o for architecture tasks", () => {
      const model = selectModelForTask("architecture");
      expect(model).toBe("gpt-4o");
    });

    it("should select Llama for research tasks", () => {
      const model = selectModelForTask("research");
      expect(model).toBe("llama-3.3-70b");
    });

    it("should select phi-4 for fast/draft tasks", () => {
      expect(selectModelForTask("fast")).toBe("phi-4");
      expect(selectModelForTask("drafts")).toBe("phi-4");
    });

    it("should select cohere for RAG tasks", () => {
      expect(selectModelForTask("rag")).toBe("cohere-command-r");
    });

    it("should select o1-mini for reasoning tasks", () => {
      expect(selectModelForTask("reasoning")).toBe("o1-mini");
    });

    it("should default to gpt-4o-mini for unknown tasks", () => {
      const model = selectModelForTask("unknown_task_type");
      expect(model).toBe(DEFAULT_MODEL);
      expect(model).toBe("gpt-4o-mini");
    });

    it("should have correct model routing for code tasks", () => {
      const codeModel = selectModelForTask("code_generation");
      const bugModel = selectModelForTask("bug_fix");
      const reviewModel = selectModelForTask("code_review");

      expect(codeModel).toBe("gpt-4o");
      expect(bugModel).toBe("gpt-4o-mini");
      expect(reviewModel).toBe("llama-3.3-70b");
    });
  });

  // ==========================================================================
  // Task Routing Configuration
  // ==========================================================================

  describe("Task Routing Configuration", () => {
    it("should have all expected task types configured", () => {
      const taskTypes = Object.keys(GITHUB_TASK_ROUTING);

      expect(taskTypes).toContain("code_generation");
      expect(taskTypes).toContain("bug_fix");
      expect(taskTypes).toContain("code_review");
      expect(taskTypes).toContain("architecture");
      expect(taskTypes).toContain("reasoning");
      expect(taskTypes).toContain("research");
      expect(taskTypes).toContain("analysis");
      expect(taskTypes).toContain("fast");
      expect(taskTypes).toContain("drafts");
      expect(taskTypes).toContain("general");
      expect(taskTypes).toContain("rag");
    });

    it("should route all tasks to valid models", () => {
      const validModelIds = GITHUB_MODELS.map((m) => m.id);

      for (const [taskType, modelId] of Object.entries(GITHUB_TASK_ROUTING)) {
        expect(
          validModelIds.includes(modelId),
          `Task '${taskType}' routes to invalid model '${modelId}'`
        ).toBe(true);
      }
    });

    it("should prefer efficient models for simple tasks", () => {
      // Simple tasks should use fast/cheap models
      const simpleTaskModels = [
        GITHUB_TASK_ROUTING.bug_fix,
        GITHUB_TASK_ROUTING.analysis,
        GITHUB_TASK_ROUTING.general,
      ];

      // These should use gpt-4o-mini (fast, free)
      for (const model of simpleTaskModels) {
        expect(model === "gpt-4o-mini" || model === "phi-4").toBe(true);
      }
    });

    it("should use capable models for complex tasks", () => {
      // Complex tasks should use more capable models
      const complexTaskModels = [
        GITHUB_TASK_ROUTING.architecture,
        GITHUB_TASK_ROUTING.code_generation,
        GITHUB_TASK_ROUTING.reasoning,
      ];

      // These should use gpt-4o or o1-mini
      for (const model of complexTaskModels) {
        expect(["gpt-4o", "o1-mini"].includes(model)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Model Specifications
  // ==========================================================================

  describe("Model Specifications", () => {
    it("should have valid context windows for all models", () => {
      for (const model of GITHUB_MODELS) {
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.contextWindow).toBeLessThanOrEqual(200_000);
      }
    });

    it("should have valid max output tokens for all models", () => {
      for (const model of GITHUB_MODELS) {
        expect(model.maxOutputTokens).toBeGreaterThan(0);
        expect(model.maxOutputTokens).toBeLessThanOrEqual(65_536);
      }
    });

    it("should have features array for all models", () => {
      for (const model of GITHUB_MODELS) {
        expect(Array.isArray(model.features)).toBe(true);
        expect(model.features.length).toBeGreaterThan(0);
        // All models should support chat
        expect(model.features).toContain("chat");
      }
    });

    it("should have valid tier for all models", () => {
      for (const model of GITHUB_MODELS) {
        expect(["free", "pro"]).toContain(model.tier);
      }
    });
  });

  // ==========================================================================
  // Cost Optimization (Free Tier Priority)
  // ==========================================================================

  describe("Cost Optimization", () => {
    it("should have more free models than pro models", () => {
      expect(FREE_MODELS.length).toBeGreaterThanOrEqual(PRO_MODELS.length);
    });

    it("should prefer free models for common tasks", () => {
      const commonTasks = ["general", "bug_fix", "analysis", "drafts"];

      for (const task of commonTasks) {
        const model = selectModelForTask(task);
        expect(
          isFreeTierModel(model),
          `Task '${task}' should prefer free model, got '${model}'`
        ).toBe(true);
      }
    });

    it("should have default model as free tier", () => {
      expect(isFreeTierModel(DEFAULT_MODEL)).toBe(true);
    });
  });

  // ==========================================================================
  // Vision Capability
  // ==========================================================================

  describe("Vision Capability", () => {
    it("should identify vision-capable models", () => {
      const visionModels = GITHUB_MODELS.filter((m) =>
        m.features.includes("vision")
      );

      expect(visionModels.length).toBeGreaterThan(0);
      expect(visionModels.some((m) => m.id === "gpt-4o")).toBe(true);
      expect(visionModels.some((m) => m.id === "gpt-4o-mini")).toBe(true);
    });

    it("should have correct vision model specs", () => {
      const gpt4o = getGitHubModel("gpt-4o");
      const gpt4oMini = getGitHubModel("gpt-4o-mini");

      expect(gpt4o?.features).toContain("vision");
      expect(gpt4oMini?.features).toContain("vision");
    });
  });

  // ==========================================================================
  // Streaming Support
  // ==========================================================================

  describe("Streaming Support", () => {
    it("should identify streaming-capable models", () => {
      const streamingModels = GITHUB_MODELS.filter((m) =>
        m.features.includes("streaming")
      );

      // Most models should support streaming
      expect(streamingModels.length).toBeGreaterThan(GITHUB_MODELS.length / 2);
    });

    it("should have all free tier models support streaming", () => {
      for (const modelId of FREE_MODELS) {
        const model = getGitHubModel(modelId);
        expect(
          model?.features.includes("streaming"),
          `Free model '${modelId}' should support streaming`
        ).toBe(true);
      }
    });
  });
});
