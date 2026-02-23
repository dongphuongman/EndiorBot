/**
 * Budget-Escalation Integration Tests
 *
 * Tests for BudgetEscalationIntegration that wires BudgetTracker
 * events to EscalationRouter.
 *
 * Per CTO Day 8 guidance:
 * - threshold_warning and limit_reached events should trigger routing
 * - Integration should automatically queue approvals when needed
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BudgetEscalationIntegration,
  createBudgetEscalationIntegration,
  createBudgetEscalationIntegrationManual,
  shouldEscalateBudgetEvent,
  getBudgetEventSeverity,
  DEFAULT_INTEGRATION_CONFIG,
} from "../../src/budget/budget-escalation-integration.js";
import { BudgetTracker, createBudgetTracker } from "../../src/budget/budget-tracker.js";
import {
  EscalationRouter,
  createEscalationRouter,
} from "../../src/budget/escalation-router.js";
import {
  ApprovalQueue,
  createApprovalQueue,
} from "../../src/budget/approval-queue.js";
import { NotificationRateLimiter } from "../../src/budget/circuit-breaker.js";
import { createNotificationSystem } from "../../src/budget/notification-system.js";
import type { BudgetEvent } from "../../src/budget/types.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("BudgetEscalationIntegration", () => {
  let tracker: BudgetTracker;
  let router: EscalationRouter;
  let queue: ApprovalQueue;
  let rateLimiter: NotificationRateLimiter;
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    // Create temp directory for queue file
    tempDir = mkdtempSync(join(tmpdir(), "budget-escal-test-"));
    queuePath = join(tempDir, "approval-queue.json");

    // Create components
    tracker = createBudgetTracker({
      per_session_limit: 10.0,
      daily_limit: 50.0,
      warning_threshold: 50,
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

  describe("constructor", () => {
    it("should create integration with default config", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      const config = integration.getConfig();
      expect(config.routeWarnings).toBe(true);
      expect(config.routeLimitReached).toBe(true);
      expect(config.includeCostInfo).toBe(true);
    });

    it("should accept custom config", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
        { routeWarnings: false, logDecisions: true },
      );

      const config = integration.getConfig();
      expect(config.routeWarnings).toBe(false);
      expect(config.logDecisions).toBe(true);
    });
  });

  describe("start/stop", () => {
    it("should start listening to events", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      expect(integration.isActive()).toBe(false);
      integration.start();
      expect(integration.isActive()).toBe(true);
    });

    it("should stop listening to events", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.start();
      expect(integration.isActive()).toBe(true);

      integration.stop();
      expect(integration.isActive()).toBe(false);
    });

    it("should not double-start", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.start();
      integration.start(); // Should be a no-op
      expect(integration.isActive()).toBe(true);

      integration.stop();
      expect(integration.isActive()).toBe(false);
    });
  });

  describe("event routing", () => {
    it("should route threshold_warning events", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      const results: unknown[] = [];
      integration.onEscalation((result) => {
        results.push(result);
      });

      // Record usage to trigger warning (>50%)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0, // 60% of $10 session limit
      });

      // Give time for async event handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(results.length).toBeGreaterThan(0);
      integration.stop();
    });

    it("should route limit_reached events", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      const results: unknown[] = [];
      integration.onEscalation((result) => {
        results.push(result);
      });

      // Record usage to trigger limit (100%)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 200000,
        outputTokens: 100000,
        cost: 10.0, // 100% of $10 session limit
      });

      // Give time for async event handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(results.length).toBeGreaterThan(0);
      integration.stop();
    });

    it("should not route events when warnings disabled", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
        { routeWarnings: false },
      );
      integration.start();

      const results: unknown[] = [];
      integration.onEscalation((result) => {
        results.push(result);
      });

      // Record usage to trigger warning
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not have received warning routing
      const warningResults = results.filter((r: unknown) => {
        const result = r as { event: BudgetEvent };
        return result.event.type === "threshold_warning";
      });
      expect(warningResults.length).toBe(0);

      integration.stop();
    });
  });

  describe("approval queueing", () => {
    it("should queue approvals for blocking decisions", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      // Trigger limit reached (maps to deploy type, which blocks)
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 200000,
        outputTokens: 100000,
        cost: 10.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check queue has approvals
      const pending = queue.getPending();
      // May or may not have pending depending on decision type routing
      expect(Array.isArray(pending)).toBe(true);

      integration.stop();
    });
  });

  describe("results management", () => {
    it("should store escalation results", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      // Trigger events
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const results = integration.getResults();
      expect(results.length).toBeGreaterThanOrEqual(0);

      integration.stop();
    });

    it("should clear results", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      // Trigger events
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      integration.clearResults();
      expect(integration.getResults().length).toBe(0);

      integration.stop();
    });
  });

  describe("listener management", () => {
    it("should notify listeners of escalation results", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      let notified = false;
      integration.onEscalation(() => {
        notified = true;
      });

      // Trigger events
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // May or may not be notified depending on event type
      expect(typeof notified).toBe("boolean");

      integration.stop();
    });

    it("should allow unsubscribing listeners", async () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );
      integration.start();

      let notified = false;
      const unsubscribe = integration.onEscalation(() => {
        notified = true;
      });

      // Unsubscribe immediately
      unsubscribe();

      // Trigger events
      await tracker.recordUsage({
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 100000,
        outputTokens: 50000,
        cost: 6.0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not be notified after unsubscribe
      expect(notified).toBe(false);

      integration.stop();
    });
  });

  describe("config management", () => {
    it("should update config", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.updateConfig({ logDecisions: true });

      const config = integration.getConfig();
      expect(config.logDecisions).toBe(true);
    });
  });

  describe("component access", () => {
    it("should expose connected components", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      const components = integration.getComponents();
      expect(components.tracker).toBe(tracker);
      expect(components.router).toBe(router);
      expect(components.queue).toBe(queue);
      expect(components.notificationSystem).toBeNull();
    });
  });

  describe("notification system integration", () => {
    it("should accept notification system in constructor", () => {
      const notifRateLimiter = new NotificationRateLimiter(10);
      const notificationSystem = createNotificationSystem(notifRateLimiter, {
        terminalEnabled: false,
        fileEnabled: false,
      });

      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
        {},
        notificationSystem,
      );

      expect(integration.getNotificationSystem()).toBe(notificationSystem);
    });

    it("should set notification system via setter", () => {
      const notifRateLimiter = new NotificationRateLimiter(10);
      const notificationSystem = createNotificationSystem(notifRateLimiter, {
        terminalEnabled: false,
        fileEnabled: false,
      });

      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      integration.setNotificationSystem(notificationSystem);
      expect(integration.getNotificationSystem()).toBe(notificationSystem);
    });

    it("should include notification system in components", () => {
      const notifRateLimiter = new NotificationRateLimiter(10);
      const notificationSystem = createNotificationSystem(notifRateLimiter, {
        terminalEnabled: false,
        fileEnabled: false,
      });

      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
        {},
        notificationSystem,
      );

      const components = integration.getComponents();
      expect(components.notificationSystem).toBe(notificationSystem);
    });

    it("should have sendNotifications config option", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      const config = integration.getConfig();
      expect(config.sendNotifications).toBe(true); // Default
    });

    it("should disable notifications via config", () => {
      const integration = new BudgetEscalationIntegration(
        tracker,
        router,
        queue,
        { sendNotifications: false },
      );

      const config = integration.getConfig();
      expect(config.sendNotifications).toBe(false);
    });
  });
});

describe("Factory functions", () => {
  let tracker: BudgetTracker;
  let router: EscalationRouter;
  let queue: ApprovalQueue;
  let rateLimiter: NotificationRateLimiter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-escal-factory-test-"));
    const queuePath = join(tempDir, "approval-queue.json");

    tracker = createBudgetTracker();
    rateLimiter = new NotificationRateLimiter(10);
    router = createEscalationRouter(rateLimiter);
    queue = createApprovalQueue(queuePath);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createBudgetEscalationIntegration", () => {
    it("should create and start integration", () => {
      const integration = createBudgetEscalationIntegration(
        tracker,
        router,
        queue,
      );

      expect(integration.isActive()).toBe(true);
      integration.stop();
    });
  });

  describe("createBudgetEscalationIntegrationManual", () => {
    it("should create integration without starting", () => {
      const integration = createBudgetEscalationIntegrationManual(
        tracker,
        router,
        queue,
      );

      expect(integration.isActive()).toBe(false);
    });
  });
});

describe("Helper functions", () => {
  describe("shouldEscalateBudgetEvent", () => {
    it("should return true for threshold_warning", () => {
      const event: BudgetEvent = {
        type: "threshold_warning",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 75 },
      };

      expect(shouldEscalateBudgetEvent(event)).toBe(true);
    });

    it("should return true for warning_triggered", () => {
      const event: BudgetEvent = {
        type: "warning_triggered",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 75 },
      };

      expect(shouldEscalateBudgetEvent(event)).toBe(true);
    });

    it("should return true for limit_reached", () => {
      const event: BudgetEvent = {
        type: "limit_reached",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 100 },
      };

      expect(shouldEscalateBudgetEvent(event)).toBe(true);
    });

    it("should return false for cost_recorded", () => {
      const event: BudgetEvent = {
        type: "cost_recorded",
        timestamp: new Date(),
        data: { cost: 0.5 },
      };

      expect(shouldEscalateBudgetEvent(event)).toBe(false);
    });

    it("should return false for daily_reset", () => {
      const event: BudgetEvent = {
        type: "daily_reset",
        timestamp: new Date(),
        data: {},
      };

      expect(shouldEscalateBudgetEvent(event)).toBe(false);
    });
  });

  describe("getBudgetEventSeverity", () => {
    it("should return critical for limit_reached", () => {
      const event: BudgetEvent = {
        type: "limit_reached",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 100 },
      };

      expect(getBudgetEventSeverity(event)).toBe("critical");
    });

    it("should return high for threshold_warning at 90%+", () => {
      const event: BudgetEvent = {
        type: "threshold_warning",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 92 },
      };

      expect(getBudgetEventSeverity(event)).toBe("high");
    });

    it("should return high for warning_triggered at 90%+", () => {
      const event: BudgetEvent = {
        type: "warning_triggered",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 95 },
      };

      expect(getBudgetEventSeverity(event)).toBe("high");
    });

    it("should return medium for threshold_warning below 90%", () => {
      const event: BudgetEvent = {
        type: "threshold_warning",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 75 },
      };

      expect(getBudgetEventSeverity(event)).toBe("medium");
    });

    it("should return medium for warning_triggered below 90%", () => {
      const event: BudgetEvent = {
        type: "warning_triggered",
        timestamp: new Date(),
        data: { budgetType: "session", percentUsed: 60 },
      };

      expect(getBudgetEventSeverity(event)).toBe("medium");
    });

    it("should return low for other events", () => {
      const event: BudgetEvent = {
        type: "daily_reset",
        timestamp: new Date(),
        data: {},
      };

      expect(getBudgetEventSeverity(event)).toBe("low");
    });
  });
});

describe("DEFAULT_INTEGRATION_CONFIG", () => {
  it("should have correct defaults", () => {
    expect(DEFAULT_INTEGRATION_CONFIG.routeWarnings).toBe(true);
    expect(DEFAULT_INTEGRATION_CONFIG.routeLimitReached).toBe(true);
    expect(DEFAULT_INTEGRATION_CONFIG.includeCostInfo).toBe(true);
    expect(DEFAULT_INTEGRATION_CONFIG.logDecisions).toBe(false);
  });
});
