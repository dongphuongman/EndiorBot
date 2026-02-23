/**
 * Escalation Router Tests
 *
 * Tests decision routing with escalation levels:
 * - L1: Auto-handled
 * - L2: AI-assisted (notification/consultation)
 * - L3: Human intervention required
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EscalationRouter,
  createEscalationRouter,
  actionRequiresWait,
  actionAllowsContinuation,
  getActionDescription,
  getLevelDescription,
  DEFAULT_ESCALATION_CONFIG,
  type EscalationAction,
  type EscalationLevel,
} from "../../src/budget/escalation-router.js";
import { NotificationRateLimiter } from "../../src/budget/circuit-breaker.js";
import {
  DecisionClassifier,
  type DecisionContext,
} from "../../src/budget/decision-classifier.js";

describe("EscalationRouter", () => {
  let router: EscalationRouter;
  let rateLimiter: NotificationRateLimiter;

  beforeEach(() => {
    rateLimiter = new NotificationRateLimiter(4);
    router = new EscalationRouter(rateLimiter);
  });

  // ==========================================================================
  // Basic Routing
  // ==========================================================================

  describe("basic routing", () => {
    it("should route auto decisions to L1 execute", async () => {
      const context: DecisionContext = { type: "bug_fix" };
      const decision = await router.route(context);

      expect(decision.level).toBe(1);
      expect(decision.action).toBe("execute");
      expect(decision.shouldNotify).toBe(false);
      expect(decision.classification.bucket).toBe("auto");
    });

    it("should route notify decisions to L2 notify", async () => {
      const context: DecisionContext = { type: "file_delete" };
      const decision = await router.route(context);

      expect(decision.level).toBe(2);
      expect(decision.action).toBe("notify");
      expect(decision.shouldNotify).toBe(true);
    });

    it("should route block decisions to L3 queue_approval", async () => {
      const context: DecisionContext = { type: "architecture_change" };
      const decision = await router.route(context);

      expect(decision.level).toBe(3);
      expect(decision.action).toBe("queue_approval");
      expect(decision.approvalId).toBeDefined();
    });

    it("should route consult decisions to L2 consult", async () => {
      const context: DecisionContext = { type: "deploy" };
      const decision = await router.route(context);

      expect(decision.level).toBe(2);
      expect(decision.action).toBe("consult");
      expect(decision.classification.requiresConsultation).toBe(true);
    });
  });

  // ==========================================================================
  // Escalation Conditions
  // ==========================================================================

  describe("escalation conditions", () => {
    it("should escalate on max retries exceeded", async () => {
      const context: DecisionContext = { type: "bug_fix" };

      // Record max retries
      for (let i = 0; i < 3; i++) {
        router.recordRetry("bug_fix::test");
      }

      // Create new context with same key pattern
      const decision = await router.route({
        type: "bug_fix",
        description: "test",
      });

      expect(decision.level).toBe(3);
      expect(decision.action).toBe("block");
      expect(decision.reason).toContain("Max retries");
    });

    it("should escalate on high cost impact", async () => {
      const context: DecisionContext = {
        type: "bug_fix",
        costImpact: 1.0,
      };
      const decision = await router.route(context);

      expect(decision.level).toBe(3);
      expect(decision.action).toBe("queue_approval");
      expect(decision.reason).toContain("Cost impact");
    });

    it("should escalate to L3 block on budget at 100%", async () => {
      const context: DecisionContext = {
        type: "bug_fix",
        budgetPercentage: 100,
      };
      const decision = await router.route(context);

      expect(decision.level).toBe(3);
      expect(decision.action).toBe("block");
      expect(decision.reason).toContain("100%");
    });

    it("should notify on budget at 80%", async () => {
      const context: DecisionContext = {
        type: "bug_fix",
        budgetPercentage: 85,
      };
      const decision = await router.route(context);

      expect(decision.level).toBe(2);
      expect(decision.action).toBe("notify");
    });
  });

  // ==========================================================================
  // Notification Rate Limiting
  // ==========================================================================

  describe("notification rate limiting", () => {
    it("should use shared rate limiter", () => {
      expect(router.getRateLimiter()).toBe(rateLimiter);
    });

    it("should rate limit notifications", async () => {
      // Send 4 notifications (max per hour)
      for (let i = 0; i < 4; i++) {
        await router.route({ type: "file_delete" });
      }

      // 5th notification should be rate limited
      const decision = await router.route({ type: "file_delete" });

      expect(decision.shouldNotify).toBe(false);
      expect(decision.notificationRateLimited).toBe(true);
    });

    it("should record notification when sent", async () => {
      const initialCount = rateLimiter.getCount();
      await router.route({ type: "file_delete" });

      expect(rateLimiter.getCount()).toBe(initialCount + 1);
    });

    it("should not record notification for auto decisions", async () => {
      const initialCount = rateLimiter.getCount();
      await router.route({ type: "bug_fix" });

      expect(rateLimiter.getCount()).toBe(initialCount);
    });
  });

  // ==========================================================================
  // Retry Tracking
  // ==========================================================================

  describe("retry tracking", () => {
    it("should track retries", () => {
      expect(router.getRetryCount("test-key")).toBe(0);

      router.recordRetry("test-key");
      expect(router.getRetryCount("test-key")).toBe(1);

      router.recordRetry("test-key");
      expect(router.getRetryCount("test-key")).toBe(2);
    });

    it("should reset retry count", () => {
      router.recordRetry("test-key");
      router.recordRetry("test-key");

      router.resetRetryCount("test-key");
      expect(router.getRetryCount("test-key")).toBe(0);
    });

    it("should track retries per context key", () => {
      router.recordRetry("key-1");
      router.recordRetry("key-2");
      router.recordRetry("key-2");

      expect(router.getRetryCount("key-1")).toBe(1);
      expect(router.getRetryCount("key-2")).toBe(2);
    });
  });

  // ==========================================================================
  // Approval Queue Callback
  // ==========================================================================

  describe("approval queue callback", () => {
    it("should use approval queue callback when set", async () => {
      const mockCallback = vi.fn().mockResolvedValue("apr-123");
      router.setApprovalQueueCallback(mockCallback);

      const context: DecisionContext = { type: "architecture_change" };
      const decision = await router.route(context);

      expect(mockCallback).toHaveBeenCalled();
      expect(decision.approvalId).toBe("apr-123");
    });

    it("should generate local ID when no callback", async () => {
      const context: DecisionContext = { type: "architecture_change" };
      const decision = await router.route(context);

      expect(decision.approvalId).toMatch(/^esc-/);
    });
  });

  // ==========================================================================
  // History
  // ==========================================================================

  describe("history", () => {
    it("should record decisions in history", async () => {
      await router.route({ type: "bug_fix" });
      await router.route({ type: "file_delete" });

      const history = router.getHistory();
      expect(history).toHaveLength(2);
    });

    it("should keep last 100 entries", async () => {
      for (let i = 0; i < 110; i++) {
        await router.route({ type: "bug_fix" });
      }

      const history = router.getHistory();
      expect(history).toHaveLength(100);
    });

    it("should clear history", async () => {
      await router.route({ type: "bug_fix" });
      router.clearHistory();

      const history = router.getHistory();
      expect(history).toHaveLength(0);
    });

    it("should include decision details in history", async () => {
      await router.route({ type: "architecture_change" });

      const history = router.getHistory();
      const entry = history[0];

      expect(entry.context.type).toBe("architecture_change");
      expect(entry.decision.level).toBe(3);
      expect(entry.timestamp).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe("configuration", () => {
    it("should use default config", () => {
      const config = router.getConfig();

      expect(config.autoExecuteEnabled).toBe(true);
      expect(config.consultationEnabled).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.costEscalationThreshold).toBe(0.5);
      expect(config.budgetEscalationThreshold).toBe(80);
    });

    it("should allow config updates", () => {
      router.updateConfig({ maxRetries: 5 });

      const config = router.getConfig();
      expect(config.maxRetries).toBe(5);
    });

    it("should disable auto-execute", async () => {
      router.updateConfig({ autoExecuteEnabled: false });

      const decision = await router.route({ type: "bug_fix" });

      expect(decision.level).toBe(2);
      expect(decision.action).toBe("notify");
    });

    it("should disable consultation", async () => {
      router.updateConfig({ consultationEnabled: false });

      const decision = await router.route({ type: "deploy" });

      expect(decision.level).toBe(3);
      expect(decision.action).toBe("queue_approval");
    });
  });

  // ==========================================================================
  // Intervention Check
  // ==========================================================================

  describe("intervention check", () => {
    it("should correctly check intervention required", () => {
      expect(router.checkInterventionRequired("architecture_change")).toBe(true);
      expect(router.checkInterventionRequired("security_related")).toBe(true);
      expect(router.checkInterventionRequired("bug_fix")).toBe(false);
    });

    it("should return escalation level for types", () => {
      expect(router.getEscalationLevel("bug_fix")).toBe(1);
      expect(router.getEscalationLevel("file_delete")).toBe(2);
      expect(router.getEscalationLevel("architecture_change")).toBe(3);
      expect(router.getEscalationLevel("deploy")).toBe(2); // consult is L2
    });
  });

  // ==========================================================================
  // Classifier Access
  // ==========================================================================

  describe("classifier access", () => {
    it("should provide access to classifier", () => {
      const classifier = router.getClassifier();
      expect(classifier).toBeInstanceOf(DecisionClassifier);
    });
  });
});

// ==========================================================================
// Factory Functions
// ==========================================================================

describe("factory functions", () => {
  describe("createEscalationRouter", () => {
    it("should create router with rate limiter", () => {
      const rateLimiter = new NotificationRateLimiter();
      const router = createEscalationRouter(rateLimiter);

      expect(router).toBeInstanceOf(EscalationRouter);
      expect(router.getRateLimiter()).toBe(rateLimiter);
    });

    it("should create router with custom config", () => {
      const rateLimiter = new NotificationRateLimiter();
      const router = createEscalationRouter(rateLimiter, { maxRetries: 10 });

      const config = router.getConfig();
      expect(config.maxRetries).toBe(10);
    });
  });

  describe("actionRequiresWait", () => {
    it("should identify actions that require waiting", () => {
      expect(actionRequiresWait("queue_approval")).toBe(true);
      expect(actionRequiresWait("block")).toBe(true);
      expect(actionRequiresWait("execute")).toBe(false);
      expect(actionRequiresWait("notify")).toBe(false);
      expect(actionRequiresWait("consult")).toBe(false);
    });
  });

  describe("actionAllowsContinuation", () => {
    it("should identify actions that allow continuation", () => {
      expect(actionAllowsContinuation("execute")).toBe(true);
      expect(actionAllowsContinuation("retry")).toBe(true);
      expect(actionAllowsContinuation("notify")).toBe(true);
      expect(actionAllowsContinuation("queue_approval")).toBe(false);
      expect(actionAllowsContinuation("block")).toBe(false);
    });
  });

  describe("getActionDescription", () => {
    it("should return descriptions for all actions", () => {
      const actions: EscalationAction[] = [
        "execute",
        "retry",
        "consult",
        "notify",
        "queue_approval",
        "block",
        "fail",
      ];

      for (const action of actions) {
        const desc = getActionDescription(action);
        expect(desc).toBeTruthy();
        expect(desc.length).toBeGreaterThan(5);
      }
    });
  });

  describe("getLevelDescription", () => {
    it("should return descriptions for all levels", () => {
      const levels: EscalationLevel[] = [1, 2, 3];

      for (const level of levels) {
        const desc = getLevelDescription(level);
        expect(desc).toContain(`L${level}`);
      }
    });
  });
});

// ==========================================================================
// DEFAULT_ESCALATION_CONFIG
// ==========================================================================

describe("DEFAULT_ESCALATION_CONFIG", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_ESCALATION_CONFIG.autoExecuteEnabled).toBe(true);
    expect(DEFAULT_ESCALATION_CONFIG.consultationEnabled).toBe(true);
    expect(DEFAULT_ESCALATION_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_ESCALATION_CONFIG.costEscalationThreshold).toBe(0.5);
    expect(DEFAULT_ESCALATION_CONFIG.budgetEscalationThreshold).toBe(80);
  });
});

// ==========================================================================
// Integration with DecisionClassifier
// ==========================================================================

describe("integration with DecisionClassifier", () => {
  it("should pass classification result through", async () => {
    const rateLimiter = new NotificationRateLimiter();
    const router = new EscalationRouter(rateLimiter);

    const context: DecisionContext = {
      type: "security_related",
      securitySensitive: true,
    };
    const decision = await router.route(context);

    expect(decision.classification.bucket).toBe("block");
    expect(decision.classification.riskLevel).toBe("high");
  });

  it("should escalate based on classifier result", async () => {
    const rateLimiter = new NotificationRateLimiter();
    const router = new EscalationRouter(rateLimiter);

    // Security-related with external impact should escalate to consult
    const context: DecisionContext = {
      type: "security_related",
      affectsExternal: true,
    };
    const decision = await router.route(context);

    expect(decision.classification.bucket).toBe("consult");
    expect(decision.action).toBe("consult");
  });
});
