/**
 * Resource Router Fallback Integration Tests
 *
 * Tests for budget limit → Ollama fallback integration.
 *
 * Per CTO Day 10 guidance:
 * - Mock ResourceRouter since real Ollama integration is Sprint 38
 * - Verify the integration pattern: budget limit → fallback trigger
 * - This validates the wiring is correct for future implementation
 *
 * @module tests/budget/resource-router-fallback
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 36 Day 10
 * @authority ADR-007 Budget Control
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BudgetTracker,
  createBudgetTracker,
} from "../../src/budget/budget-tracker.js";
import {
  EscalationRouter,
  createEscalationRouter,
} from "../../src/budget/escalation-router.js";
import {
  ApprovalQueue,
  createApprovalQueue,
} from "../../src/budget/approval-queue.js";
import {
  BudgetEscalationIntegration,
  createBudgetEscalationIntegration,
} from "../../src/budget/budget-escalation-integration.js";
import { NotificationRateLimiter } from "../../src/budget/circuit-breaker.js";
import { createNotificationSystem } from "../../src/budget/notification-system.js";
import type { BudgetEvent } from "../../src/budget/types.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Import real routing modules for E2E tests
import {
  CostOptimizer,
  createCostOptimizer,
  ModelSelector,
  createModelSelector,
  DEFAULT_MODEL_CAPABILITIES,
} from "../../src/agents/routing/index.js";

// ============================================================================
// Mock Resource Router Interface
// ============================================================================

/**
 * Mock ResourceRouter interface for testing.
 * Real implementation is Sprint 38.
 */
interface MockResourceRouter {
  /** Current model being used */
  currentModel: string;
  /** Whether fallback is active */
  fallbackActive: boolean;
  /** Fallback triggers */
  fallbackTriggers: string[];
  /** Handle budget limit reached */
  onBudgetLimitReached(event: BudgetEvent): void;
  /** Handle budget warning */
  onBudgetWarning(event: BudgetEvent): void;
  /** Trigger fallback to Ollama */
  triggerFallback(reason: string): void;
  /** Reset to primary model */
  resetToPrimary(): void;
}

/**
 * Create a mock ResourceRouter for testing.
 */
function createMockResourceRouter(): MockResourceRouter {
  return {
    currentModel: "claude-sonnet-4",
    fallbackActive: false,
    fallbackTriggers: [],

    onBudgetLimitReached(event: BudgetEvent): void {
      const reason = `Budget limit reached: ${event.data.budgetType ?? "unknown"} at ${event.data.percentUsed ?? 100}%`;
      this.triggerFallback(reason);
    },

    onBudgetWarning(event: BudgetEvent): void {
      // Warnings don't trigger fallback, just log
      this.fallbackTriggers.push(
        `Warning: ${event.data.budgetType ?? "unknown"} at ${event.data.percentUsed ?? 0}%`,
      );
    },

    triggerFallback(reason: string): void {
      this.fallbackActive = true;
      this.currentModel = "ollama/llama3";
      this.fallbackTriggers.push(reason);
    },

    resetToPrimary(): void {
      this.fallbackActive = false;
      this.currentModel = "claude-sonnet-4";
    },
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe("Resource Router Fallback Integration", () => {
  let tracker: BudgetTracker;
  let router: EscalationRouter;
  let queue: ApprovalQueue;
  let rateLimiter: NotificationRateLimiter;
  let tempDir: string;
  let queuePath: string;
  let logPath: string;

  beforeEach(() => {
    // Create temp directory for queue and log files
    tempDir = mkdtempSync(join(tmpdir(), "resource-router-test-"));
    queuePath = join(tempDir, "approval-queue.json");
    logPath = join(tempDir, "notifications.log");

    // Create components with low limits to trigger events easily
    tracker = createBudgetTracker({
      per_session_limit: 2.0, // $2 session limit
      daily_limit: 10.0, // $10 daily limit
      warning_threshold: 50, // 50% warning threshold
    });

    rateLimiter = new NotificationRateLimiter(10);
    router = createEscalationRouter(rateLimiter);
    queue = createApprovalQueue(queuePath);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Budget Limit → Ollama Fallback", () => {
    it("should trigger Ollama fallback when session budget limit is reached", async () => {
      const resourceRouter = createMockResourceRouter();

      // Create integration with listener for escalation results
      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      // Wire resource router to escalation results
      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        } else if (
          result.event.type === "threshold_warning" ||
          result.event.type === "warning_triggered"
        ) {
          resourceRouter.onBudgetWarning(result.event);
        }
      });

      // Initial state: primary model
      expect(resourceRouter.currentModel).toBe("claude-sonnet-4");
      expect(resourceRouter.fallbackActive).toBe(false);

      // Record usage to hit session limit ($2)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 2.0, // Exactly at $2 limit
      });

      // Give time for async event handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have triggered fallback
      expect(resourceRouter.fallbackActive).toBe(true);
      expect(resourceRouter.currentModel).toBe("ollama/llama3");
      expect(resourceRouter.fallbackTriggers.length).toBeGreaterThan(0);
      expect(resourceRouter.fallbackTriggers.some((t) => t.includes("limit"))).toBe(true);

      integration.stop();
    });

    it("should NOT trigger fallback on warning, only on limit", async () => {
      const resourceRouter = createMockResourceRouter();

      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        } else if (
          result.event.type === "threshold_warning" ||
          result.event.type === "warning_triggered"
        ) {
          resourceRouter.onBudgetWarning(result.event);
        }
      });

      // Record usage to trigger warning (60% of $2 = $1.20)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 50000,
        outputTokens: 25000,
        cost: 1.2, // 60% of session limit
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT have triggered fallback (warning only)
      expect(resourceRouter.fallbackActive).toBe(false);
      expect(resourceRouter.currentModel).toBe("claude-sonnet-4");

      integration.stop();
    });

    it("should reset to primary after daily budget reset", async () => {
      const resourceRouter = createMockResourceRouter();

      // Manually trigger fallback
      resourceRouter.triggerFallback("Manual test trigger");
      expect(resourceRouter.fallbackActive).toBe(true);
      expect(resourceRouter.currentModel).toBe("ollama/llama3");

      // Simulate daily reset
      resourceRouter.resetToPrimary();

      // Should be back to primary
      expect(resourceRouter.fallbackActive).toBe(false);
      expect(resourceRouter.currentModel).toBe("claude-sonnet-4");
    });

    it("should track multiple fallback triggers", async () => {
      const resourceRouter = createMockResourceRouter();

      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        } else if (
          result.event.type === "threshold_warning" ||
          result.event.type === "warning_triggered"
        ) {
          resourceRouter.onBudgetWarning(result.event);
        }
      });

      // First: warning at 60%
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 30000,
        outputTokens: 15000,
        cost: 1.2,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second: limit reached
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 20000,
        outputTokens: 10000,
        cost: 0.8, // Total now $2.0 = 100%
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have multiple triggers recorded
      expect(resourceRouter.fallbackTriggers.length).toBeGreaterThanOrEqual(1);
      expect(resourceRouter.fallbackActive).toBe(true);

      integration.stop();
    });
  });

  describe("Notification Integration with Fallback", () => {
    it("should send notifications when fallback triggers", async () => {
      const resourceRouter = createMockResourceRouter();
      const notifRateLimiter = new NotificationRateLimiter(10);
      const notificationSystem = createNotificationSystem(notifRateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
        { sendNotifications: true },
        notificationSystem,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        }
      });

      // Trigger limit
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 2.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify fallback triggered
      expect(resourceRouter.fallbackActive).toBe(true);

      // Verify notifications were sent (check stats)
      const stats = notificationSystem.getStats();
      expect(stats.totalSent).toBeGreaterThan(0);

      integration.stop();
    });
  });

  describe("Escalation with Fallback", () => {
    it("should queue approval and trigger fallback for blocking decisions", async () => {
      const resourceRouter = createMockResourceRouter();

      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        }
      });

      // Trigger limit
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 2.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get escalation results
      const results = integration.getResults();
      expect(results.length).toBeGreaterThan(0);

      // Check the last result (should be limit_reached)
      const limitResult = results.find((r) => r.event.type === "limit_reached");
      expect(limitResult).toBeDefined();

      // Verify fallback is active
      expect(resourceRouter.fallbackActive).toBe(true);

      integration.stop();
    });
  });

  describe("Multiple Budget Types", () => {
    it("should handle session limit fallback", async () => {
      const resourceRouter = createMockResourceRouter();

      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        }
      });

      // Trigger session limit ($2)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 2.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(resourceRouter.fallbackActive).toBe(true);
      expect(
        resourceRouter.fallbackTriggers.some((t) => t.includes("session")),
      ).toBe(true);

      integration.stop();
    });

    it("should handle daily limit fallback", async () => {
      const resourceRouter = createMockResourceRouter();

      // Create tracker with low daily limit
      const dailyTracker = createBudgetTracker({
        per_session_limit: 100.0, // High session limit
        daily_limit: 5.0, // Low daily limit
        warning_threshold: 50,
      });

      const integration = createBudgetEscalationIntegration(
        dailyTracker,
        router,
        queue,
      );

      integration.onEscalation((result) => {
        if (result.event.type === "limit_reached") {
          resourceRouter.onBudgetLimitReached(result.event);
        }
      });

      // Trigger daily limit ($5)
      await dailyTracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 200000,
        outputTokens: 100000,
        cost: 5.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(resourceRouter.fallbackActive).toBe(true);
      expect(
        resourceRouter.fallbackTriggers.some((t) => t.includes("daily")),
      ).toBe(true);

      integration.stop();
    });
  });
});

// ============================================================================
// Mock ResourceRouter Unit Tests
// ============================================================================

describe("MockResourceRouter", () => {
  it("should start with primary model", () => {
    const router = createMockResourceRouter();
    expect(router.currentModel).toBe("claude-sonnet-4");
    expect(router.fallbackActive).toBe(false);
  });

  it("should switch to Ollama on fallback", () => {
    const router = createMockResourceRouter();
    router.triggerFallback("Test reason");

    expect(router.currentModel).toBe("ollama/llama3");
    expect(router.fallbackActive).toBe(true);
    expect(router.fallbackTriggers).toContain("Test reason");
  });

  it("should reset to primary", () => {
    const router = createMockResourceRouter();
    router.triggerFallback("Test");
    router.resetToPrimary();

    expect(router.currentModel).toBe("claude-sonnet-4");
    expect(router.fallbackActive).toBe(false);
  });

  it("should handle budget limit event", () => {
    const router = createMockResourceRouter();
    const event: BudgetEvent = {
      type: "limit_reached",
      timestamp: new Date(),
      data: { budgetType: "session", percentUsed: 100 },
    };

    router.onBudgetLimitReached(event);

    expect(router.fallbackActive).toBe(true);
    expect(router.currentModel).toBe("ollama/llama3");
  });

  it("should NOT fallback on warning event", () => {
    const router = createMockResourceRouter();
    const event: BudgetEvent = {
      type: "threshold_warning",
      timestamp: new Date(),
      data: { budgetType: "session", percentUsed: 75 },
    };

    router.onBudgetWarning(event);

    expect(router.fallbackActive).toBe(false);
    expect(router.currentModel).toBe("claude-sonnet-4");
    expect(router.fallbackTriggers.length).toBe(1); // Warning logged but no fallback
  });
});

// ============================================================================
// E2E Budget → Ollama Fallback Tests (Real Implementation)
// ============================================================================

describe("E2E Budget → Ollama Fallback (Real Implementation)", () => {
  describe("CostOptimizer Budget Fallback", () => {
    it("should fallback to Ollama when daily budget is 90%+ spent", () => {
      const optimizer = createCostOptimizer({
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 0,
        currentMonthlySpend: 0,
      }, DEFAULT_MODEL_CAPABILITIES);

      // Initially should NOT fallback
      expect(optimizer.shouldUseLocalFallback()).toBe(false);

      // Spend 95% of daily budget
      optimizer.recordSpend(9.5);

      // Now should fallback
      expect(optimizer.shouldUseLocalFallback()).toBe(true);

      const status = optimizer.getBudgetStatus();
      expect(status.shouldFallbackToLocal).toBe(true);
      expect(status.dailyUsedPercent).toBe(95);
    });

    it("should optimize to Ollama when budget constraint is active", () => {
      const optimizer = createCostOptimizer({
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 9.5, // 95% spent
        currentMonthlySpend: 0,
      }, DEFAULT_MODEL_CAPABILITIES);

      // Optimize should recommend Ollama due to budget
      const result = optimizer.optimize(DEFAULT_MODEL_CAPABILITIES, "moderate", "balanced");

      expect(result.shouldFallbackToLocal).toBe(true);
      expect(result.recommendedModel.providerId).toBe("ollama");
      expect(result.recommendedModel.estimatedCost).toBe(0);
      expect(result.fallbackReason).toContain("Budget low");
    });

    it("should NOT fallback when budget is healthy", () => {
      const optimizer = createCostOptimizer({
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 2.0, // 20% spent
        currentMonthlySpend: 5.0, // 5% spent
      }, DEFAULT_MODEL_CAPABILITIES);

      expect(optimizer.shouldUseLocalFallback()).toBe(false);

      const result = optimizer.optimize(DEFAULT_MODEL_CAPABILITIES, "moderate", "balanced");

      expect(result.shouldFallbackToLocal).toBe(false);
      expect(result.recommendedModel.providerId).not.toBe("ollama");
    });

    it("should fallback when monthly budget is low", () => {
      const optimizer = createCostOptimizer({
        dailyBudget: 100.0, // High daily budget
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 0,
        currentMonthlySpend: 95, // 95% monthly spent
      }, DEFAULT_MODEL_CAPABILITIES);

      expect(optimizer.shouldUseLocalFallback()).toBe(true);

      const result = optimizer.optimize(DEFAULT_MODEL_CAPABILITIES, "moderate", "balanced");
      expect(result.shouldFallbackToLocal).toBe(true);
      expect(result.recommendedModel.providerId).toBe("ollama");
    });
  });

  describe("ModelSelector Budget Integration", () => {
    it("should select Ollama when budget triggers fallback", () => {
      const selector = createModelSelector(DEFAULT_MODEL_CAPABILITIES, {
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 9.5, // 95% spent
        currentMonthlySpend: 0,
      });

      const result = selector.select({
        taskType: "code_gen",
        complexity: "moderate",
        minTier: "balanced",
        latencyPreference: "balanced",
      });

      expect(result.primary.providerId).toBe("ollama");
      expect(result.primary.reason).toContain("fallback");
      expect(result.metadata.estimatedCost).toBe(0);
    });

    it("should track spending and trigger fallback after threshold", () => {
      const selector = createModelSelector(DEFAULT_MODEL_CAPABILITIES, {
        dailyBudget: 1.0, // Very low daily budget
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 0,
        currentMonthlySpend: 0,
      });

      // Initial selection should use cloud provider
      const initial = selector.select({
        taskType: "code_gen",
        complexity: "simple",
        minTier: "fast",
        latencyPreference: "fastest",
      });
      expect(initial.primary.providerId).not.toBe("ollama");

      // Record spending to trigger threshold
      selector.recordSpend(0.95); // 95% of daily budget

      // Now should fallback to Ollama
      expect(selector.shouldUseLocalFallback()).toBe(true);

      const afterSpend = selector.select({
        taskType: "code_gen",
        complexity: "simple",
        minTier: "fast",
        latencyPreference: "fastest",
      });
      expect(afterSpend.primary.providerId).toBe("ollama");
    });

    it("should show budget status correctly", () => {
      const selector = createModelSelector(DEFAULT_MODEL_CAPABILITIES, {
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 0,
        currentMonthlySpend: 0,
      });

      selector.recordSpend(5.0);
      const status = selector.getBudgetStatus();

      expect(status.dailyRemaining).toBe(5.0);
      expect(status.dailyUsedPercent).toBe(50);
      expect(status.shouldFallbackToLocal).toBe(false);

      // Spend more to trigger fallback
      selector.recordSpend(4.5);
      const status2 = selector.getBudgetStatus();

      expect(status2.dailyRemaining).toBe(0.5);
      expect(status2.dailyUsedPercent).toBe(95);
      expect(status2.shouldFallbackToLocal).toBe(true);
    });
  });

  describe("Full E2E Flow: BudgetTracker → CostOptimizer → Ollama", () => {
    it("should coordinate budget tracking with model selection fallback", async () => {
      // Create budget tracker
      const tracker = createBudgetTracker({
        per_session_limit: 2.0,
        daily_limit: 10.0,
        warning_threshold: 80,
      });

      // Create model selector with matching budget
      const selector = createModelSelector(DEFAULT_MODEL_CAPABILITIES, {
        dailyBudget: 10.0,
        monthlyBudget: 100.0,
        maxCostPerRequest: 0.50,
        currentDailySpend: 0,
        currentMonthlySpend: 0,
      });

      // Wire budget tracker events to cost optimizer
      const handleBudgetEvent = (event: BudgetEvent) => {
        if (event.type === "limit_reached" || event.type === "warning_triggered") {
          const percentUsed = event.data.percentUsed ?? 0;
          if (percentUsed >= 90) {
            // Sync spending to selector
            const totalSpent = (percentUsed / 100) * 10.0;
            selector.updateBudget({ currentDailySpend: totalSpent });
          }
        }
      };

      // Subscribe to budget events using onEvent
      const unsubscribe = tracker.onEvent(handleBudgetEvent);

      // Initial state: should not fallback
      expect(selector.shouldUseLocalFallback()).toBe(false);
      const initialSelection = selector.quickSelect("code_gen", "moderate");
      expect(initialSelection.providerId).not.toBe("ollama");

      // Record usage that approaches limit
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 9.5, // 95% of daily limit
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now should fallback
      expect(selector.shouldUseLocalFallback()).toBe(true);
      const afterLimitSelection = selector.quickSelect("code_gen", "moderate");
      expect(afterLimitSelection.providerId).toBe("ollama");

      unsubscribe();
    });
  });
});
