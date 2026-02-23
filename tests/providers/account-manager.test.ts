/**
 * AccountManager Unit Tests
 *
 * Sprint 38 Day 1-2 - Smart Claude Account Switching
 *
 * Tests cover:
 * - Account initialization and configuration
 * - Account selection with priority
 * - Rate limit handling and auto-switch
 * - Quota tracking and learned quota
 * - Weekly reset detection
 * - Notification rate limiting
 * - Usage statistics
 *
 * @module tests/providers/account-manager
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 38 Day 1-2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  AccountManager,
  createAccountManager,
  createAccountManagerFromEnv,
  DEFAULT_WEEKLY_QUOTA,
  DEFAULT_MAX_NOTIFICATIONS_PER_HOUR,
  RATE_LIMIT_COOLDOWN_MS,
  type AccountId,
  type AccountManagerConfig,
  type AccountSwitchEvent,
} from "../../src/providers/account-manager.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create default test configuration.
 */
function createTestConfig(
  overrides: Partial<AccountManagerConfig> = {}
): AccountManagerConfig {
  return {
    primary: {
      name: "Test Primary",
      apiKey: "test-primary-key",
      estimatedQuota: 100,
    },
    teamDev: {
      name: "Test Team Dev",
      apiKey: "test-team-dev-key",
      estimatedQuota: 50,
    },
    maxNotificationsPerHour: 4,
    ...overrides,
  };
}

/**
 * Mock notification callback.
 */
function createMockNotifier(): {
  callback: (event: AccountSwitchEvent) => Promise<void>;
  events: AccountSwitchEvent[];
} {
  const events: AccountSwitchEvent[] = [];
  return {
    callback: vi.fn(async (event: AccountSwitchEvent) => {
      events.push(event);
    }),
    events,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("AccountManager", () => {
  let manager: AccountManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-23T10:00:00Z")); // Monday
    manager = createAccountManager(createTestConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe("initialization", () => {
    it("should initialize with two accounts", () => {
      const states = manager.getAllAccountStates();
      expect(states).toHaveLength(2);
    });

    it("should initialize primary account correctly", () => {
      const state = manager.getAccountState("primary");
      expect(state).toBeDefined();
      expect(state!.config.name).toBe("Test Primary");
      expect(state!.config.apiKey).toBe("test-primary-key");
      expect(state!.config.priority).toBe(1);
    });

    it("should initialize teamDev account correctly", () => {
      const state = manager.getAccountState("teamDev");
      expect(state).toBeDefined();
      expect(state!.config.name).toBe("Test Team Dev");
      expect(state!.config.apiKey).toBe("test-team-dev-key");
      expect(state!.config.priority).toBe(2);
    });

    it("should start with primary as active account", () => {
      expect(manager.getActiveAccountId()).toBe("primary");
    });

    it("should initialize with unknown status", () => {
      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("unknown");
    });

    it("should initialize with zero usage", () => {
      const state = manager.getAccountState("primary");
      expect(state!.weeklyUsage).toBe(0);
      expect(state!.weeklyRequests).toBe(0);
    });

    it("should use default quota if not specified", () => {
      const configWithoutQuota: AccountManagerConfig = {
        primary: {
          name: "Primary",
          apiKey: "key1",
          estimatedQuota: undefined as unknown as number,
        },
        teamDev: {
          name: "Team Dev",
          apiKey: "key2",
          estimatedQuota: undefined as unknown as number,
        },
        maxNotificationsPerHour: 4,
      };

      const mgr = createAccountManager(configWithoutQuota);
      const state = mgr.getAccountState("primary");
      expect(state!.config.estimatedQuota).toBe(DEFAULT_WEEKLY_QUOTA);
    });
  });

  // ==========================================================================
  // Account Selection Tests
  // ==========================================================================

  describe("selectAccount", () => {
    it("should select primary account by default", () => {
      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("primary");
      expect(selection.apiKey).toBe("test-primary-key");
      expect(selection.isFallback).toBe(false);
    });

    it("should select teamDev when primary is rate limited", async () => {
      await manager.reportRateLimit("primary");

      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("teamDev");
      // Note: After reportRateLimit, activeAccount switches to teamDev
      // So selecting teamDev is no longer a fallback
      expect(manager.getActiveAccountId()).toBe("teamDev");
    });

    it("should select teamDev when primary quota exceeded", async () => {
      await manager.reportQuotaExceeded("primary");

      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("teamDev");
      // Note: After reportQuotaExceeded, activeAccount switches to teamDev
      expect(manager.getActiveAccountId()).toBe("teamDev");
    });

    it("should return primary with warning when all accounts unavailable", async () => {
      await manager.reportQuotaExceeded("primary");
      await manager.reportQuotaExceeded("teamDev");

      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("primary");
      expect(selection.reason).toContain("unavailable");
    });

    it("should return to primary after rate limit cooldown", async () => {
      await manager.reportRateLimit("primary");

      // Advance time past cooldown
      vi.advanceTimersByTime(RATE_LIMIT_COOLDOWN_MS + 1000);

      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("primary");
    });

    it("should not select account at 95% quota", () => {
      // Set usage to 95% of quota
      const state = manager.getAccountState("primary")!;
      state.weeklyUsage = 95; // 95% of 100 quota
      state.status = "available";

      const selection = manager.selectAccount();
      expect(selection.accountId).toBe("teamDev");
    });
  });

  // ==========================================================================
  // Success Reporting Tests
  // ==========================================================================

  describe("reportSuccess", () => {
    it("should track usage cost", () => {
      manager.reportSuccess("primary", 0.50);

      const state = manager.getAccountState("primary");
      expect(state!.weeklyUsage).toBe(0.50);
    });

    it("should accumulate usage", () => {
      manager.reportSuccess("primary", 0.50);
      manager.reportSuccess("primary", 0.30);
      manager.reportSuccess("primary", 0.20);

      const state = manager.getAccountState("primary");
      expect(state!.weeklyUsage).toBe(1.00);
    });

    it("should track request count", () => {
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("primary", 0.10);

      const state = manager.getAccountState("primary");
      expect(state!.weeklyRequests).toBe(3);
    });

    it("should update lastSuccessAt timestamp", () => {
      const before = new Date();
      manager.reportSuccess("primary", 0.10);

      const state = manager.getAccountState("primary");
      expect(state!.lastSuccessAt).toBeDefined();
      expect(state!.lastSuccessAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it("should set status to available", () => {
      manager.reportSuccess("primary", 0.10);

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("available");
    });

    it("should handle non-existent account gracefully", () => {
      // Should not throw
      expect(() => {
        manager.reportSuccess("nonexistent" as AccountId, 0.10);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Rate Limit Handling Tests
  // ==========================================================================

  describe("reportRateLimit", () => {
    it("should set status to rate_limited", async () => {
      await manager.reportRateLimit("primary");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("rate_limited");
    });

    it("should record lastRateLimitAt timestamp", async () => {
      await manager.reportRateLimit("primary");

      const state = manager.getAccountState("primary");
      expect(state!.lastRateLimitAt).toBeDefined();
    });

    it("should switch to teamDev account", async () => {
      await manager.reportRateLimit("primary");

      expect(manager.getActiveAccountId()).toBe("teamDev");
    });

    it("should record switch event in history", async () => {
      await manager.reportRateLimit("primary");

      const history = manager.getSwitchHistory();
      expect(history).toHaveLength(1);
      expect(history[0].from).toBe("primary");
      expect(history[0].to).toBe("teamDev");
      expect(history[0].reason).toBe("rate_limit");
    });

    it("should learn quota from rate limit occurrence", async () => {
      // Simulate usage before rate limit
      manager.reportSuccess("primary", 45.0);
      await manager.reportRateLimit("primary");

      const state = manager.getAccountState("primary");
      expect(state!.learnedQuota).toBe(45.0);
    });

    it("should keep lower learned quota", async () => {
      // First rate limit at 45
      manager.reportSuccess("primary", 45.0);
      await manager.reportRateLimit("primary");

      // Reset and simulate second week
      manager.forceWeeklyReset();

      // Usage higher than learned quota should not update
      manager.reportSuccess("primary", 50.0);
      await manager.reportRateLimit("primary");

      const state = manager.getAccountState("primary");
      expect(state!.learnedQuota).toBe(45.0);
    });
  });

  // ==========================================================================
  // Quota Exceeded Tests
  // ==========================================================================

  describe("reportQuotaExceeded", () => {
    it("should set status to quota_exceeded", async () => {
      await manager.reportQuotaExceeded("primary");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("quota_exceeded");
    });

    it("should switch to teamDev account", async () => {
      await manager.reportQuotaExceeded("primary");

      expect(manager.getActiveAccountId()).toBe("teamDev");
    });

    it("should record switch event in history", async () => {
      await manager.reportQuotaExceeded("primary");

      const history = manager.getSwitchHistory();
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe("quota_exceeded");
    });
  });

  // ==========================================================================
  // Error Reporting Tests
  // ==========================================================================

  describe("reportError", () => {
    it("should handle RATE_LIMIT error code", async () => {
      await manager.reportError("primary", "RATE_LIMIT");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("rate_limited");
    });

    it("should handle AUTH_ERROR as quota exceeded", async () => {
      await manager.reportError("primary", "AUTH_ERROR");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("quota_exceeded");
    });

    it("should ignore other error codes", async () => {
      await manager.reportError("primary", "NETWORK_ERROR");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("unknown");
    });
  });

  // ==========================================================================
  // Manual Switch Tests
  // ==========================================================================

  describe("switchTo", () => {
    it("should switch to specified account", async () => {
      const result = await manager.switchTo("teamDev");

      expect(result).toBe(true);
      expect(manager.getActiveAccountId()).toBe("teamDev");
    });

    it("should record manual switch in history", async () => {
      await manager.switchTo("teamDev");

      const history = manager.getSwitchHistory();
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe("manual");
    });

    it("should return false for non-existent account", async () => {
      const result = await manager.switchTo("nonexistent" as AccountId);

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Recovery Tests
  // ==========================================================================

  describe("isAccountRecovered", () => {
    it("should return false immediately after rate limit", async () => {
      await manager.reportRateLimit("primary");

      expect(manager.isAccountRecovered("primary")).toBe(false);
    });

    it("should return true after cooldown period", async () => {
      await manager.reportRateLimit("primary");

      vi.advanceTimersByTime(RATE_LIMIT_COOLDOWN_MS + 1000);

      expect(manager.isAccountRecovered("primary")).toBe(true);
    });

    it("should return true for available accounts", () => {
      manager.reportSuccess("primary", 0.10);

      expect(manager.isAccountRecovered("primary")).toBe(true);
    });

    it("should return false for quota_exceeded accounts", async () => {
      await manager.reportQuotaExceeded("primary");

      expect(manager.isAccountRecovered("primary")).toBe(false);
    });
  });

  describe("resetAccount", () => {
    it("should reset account status to available", async () => {
      await manager.reportRateLimit("primary");
      manager.resetAccount("primary");

      const state = manager.getAccountState("primary");
      expect(state!.status).toBe("available");
    });

    it("should clear lastRateLimitAt", async () => {
      await manager.reportRateLimit("primary");
      manager.resetAccount("primary");

      const state = manager.getAccountState("primary");
      expect(state!.lastRateLimitAt).toBeNull();
    });
  });

  // ==========================================================================
  // Weekly Reset Tests
  // ==========================================================================

  describe("weekly reset", () => {
    it("should reset usage on Monday 00:00 UTC", () => {
      // Simulate usage
      manager.reportSuccess("primary", 50.0);
      manager.reportSuccess("primary", 30.0);

      expect(manager.getAccountState("primary")!.weeklyUsage).toBe(80.0);

      // Advance to next Monday
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      // Trigger reset check via selectAccount
      manager.selectAccount();

      expect(manager.getAccountState("primary")!.weeklyUsage).toBe(0);
    });

    it("should reset request count on weekly reset", () => {
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("primary", 0.10);

      expect(manager.getAccountState("primary")!.weeklyRequests).toBe(3);

      // Advance to next Monday
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      manager.selectAccount();

      expect(manager.getAccountState("primary")!.weeklyRequests).toBe(0);
    });

    it("should reset status to available on weekly reset", async () => {
      await manager.reportQuotaExceeded("primary");

      // Advance to next Monday
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      manager.selectAccount();

      expect(manager.getAccountState("primary")!.status).toBe("available");
    });

    it("should force weekly reset correctly", () => {
      manager.reportSuccess("primary", 50.0);
      manager.reportSuccess("teamDev", 30.0);

      manager.forceWeeklyReset();

      expect(manager.getAccountState("primary")!.weeklyUsage).toBe(0);
      expect(manager.getAccountState("teamDev")!.weeklyUsage).toBe(0);
    });
  });

  // ==========================================================================
  // Notification Rate Limiting Tests
  // ==========================================================================

  describe("notification rate limiting", () => {
    it("should send notification on account switch", async () => {
      const notifier = createMockNotifier();
      const mgr = createAccountManager({
        ...createTestConfig(),
        onAccountSwitch: notifier.callback,
      });

      await mgr.reportRateLimit("primary");

      expect(notifier.callback).toHaveBeenCalledTimes(1);
      expect(notifier.events).toHaveLength(1);
    });

    it("should respect max notifications per hour", async () => {
      const notifier = createMockNotifier();
      const mgr = createAccountManager({
        ...createTestConfig(),
        maxNotificationsPerHour: 2,
        onAccountSwitch: notifier.callback,
      });

      // Trigger switches - need to reset accounts between to trigger actual switches
      await mgr.reportRateLimit("primary"); // Switch 1: primary -> teamDev
      mgr.resetAccount("primary");
      await mgr.reportRateLimit("teamDev"); // Switch 2: teamDev -> primary (recovered)
      mgr.resetAccount("teamDev");
      await mgr.switchTo("teamDev"); // Switch 3: manual switch (should be rate limited)
      await mgr.switchTo("primary"); // Switch 4: manual switch (should be rate limited)

      // Only 2 notifications should be sent due to rate limiting
      expect(notifier.callback).toHaveBeenCalledTimes(2);
    });

    it("should reset notification count after 1 hour", async () => {
      const notifier = createMockNotifier();
      const mgr = createAccountManager({
        ...createTestConfig(),
        maxNotificationsPerHour: 2,
        onAccountSwitch: notifier.callback,
      });

      // Use up notifications
      await mgr.switchTo("teamDev"); // Notification 1
      await mgr.switchTo("primary"); // Notification 2 (hits limit)

      // Advance 1 hour to reset notification count
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

      // Should be able to send again after hour reset
      await mgr.switchTo("teamDev"); // Notification 3 (after reset)

      expect(notifier.callback).toHaveBeenCalledTimes(3);
    });

    it("should handle notification callback errors gracefully", async () => {
      const errorCallback = vi.fn(async () => {
        throw new Error("Notification failed");
      });

      const mgr = createAccountManager({
        ...createTestConfig(),
        onAccountSwitch: errorCallback,
      });

      // Should not throw
      await expect(mgr.reportRateLimit("primary")).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Usage Statistics Tests
  // ==========================================================================

  describe("getUsageStats", () => {
    it("should return correct usage for both accounts", () => {
      manager.reportSuccess("primary", 25.0);
      manager.reportSuccess("teamDev", 15.0);

      const stats = manager.getUsageStats();

      expect(stats.primary.usage).toBe(25.0);
      expect(stats.teamDev.usage).toBe(15.0);
      expect(stats.totalUsage).toBe(40.0);
    });

    it("should return correct request counts", () => {
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("primary", 0.10);
      manager.reportSuccess("teamDev", 0.10);

      const stats = manager.getUsageStats();

      expect(stats.primary.requests).toBe(2);
      expect(stats.teamDev.requests).toBe(1);
      expect(stats.totalRequests).toBe(3);
    });

    it("should use learned quota if available", async () => {
      manager.reportSuccess("primary", 45.0);
      await manager.reportRateLimit("primary");

      const stats = manager.getUsageStats();

      expect(stats.primary.quota).toBe(45.0);
    });

    it("should use estimated quota if no learned quota", () => {
      const stats = manager.getUsageStats();

      expect(stats.primary.quota).toBe(100);
      expect(stats.teamDev.quota).toBe(50);
    });
  });

  // ==========================================================================
  // Switch History Tests
  // ==========================================================================

  describe("getSwitchHistory", () => {
    it("should return empty array initially", () => {
      expect(manager.getSwitchHistory()).toHaveLength(0);
    });

    it("should return copy of history", () => {
      const history = manager.getSwitchHistory();
      history.push({
        from: "primary",
        to: "teamDev",
        reason: "manual",
        timestamp: new Date(),
      });

      expect(manager.getSwitchHistory()).toHaveLength(0);
    });

    it("should track multiple switches", async () => {
      await manager.reportRateLimit("primary"); // Switch 1: primary -> teamDev
      manager.resetAccount("primary"); // Reset so it can be selected again
      await manager.switchTo("primary"); // Switch 2: manual back to primary
      await manager.switchTo("teamDev"); // Switch 3: manual to teamDev

      const history = manager.getSwitchHistory();
      expect(history).toHaveLength(3);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createAccountManager", () => {
  it("should create manager with provided config", () => {
    const config = createTestConfig();
    const manager = createAccountManager(config);

    expect(manager).toBeInstanceOf(AccountManager);
    expect(manager.getActiveAccountId()).toBe("primary");
  });
});

describe("createAccountManagerFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw if ANTHROPIC_API_KEY not set", () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => createAccountManagerFromEnv()).toThrow(
      "ANTHROPIC_API_KEY environment variable not set"
    );
  });

  it("should create manager from environment variables", () => {
    process.env.ANTHROPIC_API_KEY = "test-key-1";
    process.env.ANTHROPIC_TEAM_DEV_API_KEY = "test-key-2";
    process.env.ANTHROPIC_PRIMARY_QUOTA = "75";
    process.env.ANTHROPIC_TEAM_DEV_QUOTA = "60";

    const manager = createAccountManagerFromEnv();

    expect(manager).toBeInstanceOf(AccountManager);

    const primaryState = manager.getAccountState("primary");
    expect(primaryState!.config.apiKey).toBe("test-key-1");
    expect(primaryState!.config.estimatedQuota).toBe(75);

    const teamDevState = manager.getAccountState("teamDev");
    expect(teamDevState!.config.apiKey).toBe("test-key-2");
    expect(teamDevState!.config.estimatedQuota).toBe(60);
  });

  it("should fallback teamDev to primary key if not set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key-1";
    delete process.env.ANTHROPIC_TEAM_DEV_API_KEY;

    const manager = createAccountManagerFromEnv();

    const teamDevState = manager.getAccountState("teamDev");
    expect(teamDevState!.config.apiKey).toBe("test-key-1");
  });

  it("should use default quotas if not specified", () => {
    process.env.ANTHROPIC_API_KEY = "test-key-1";
    delete process.env.ANTHROPIC_PRIMARY_QUOTA;
    delete process.env.ANTHROPIC_TEAM_DEV_QUOTA;

    const manager = createAccountManagerFromEnv();

    const stats = manager.getUsageStats();
    expect(stats.primary.quota).toBe(DEFAULT_WEEKLY_QUOTA);
    expect(stats.teamDev.quota).toBe(DEFAULT_WEEKLY_QUOTA);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  let manager: AccountManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-23T10:00:00Z"));
    manager = createAccountManager(createTestConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should handle rapid successive rate limits", async () => {
    await manager.reportRateLimit("primary");
    await manager.reportRateLimit("primary");
    await manager.reportRateLimit("primary");

    const history = manager.getSwitchHistory();
    // Should only switch once since primary is already rate limited
    expect(history.filter((e) => e.from === "primary")).toHaveLength(1);
  });

  it("should handle zero cost success reports", () => {
    manager.reportSuccess("primary", 0);
    manager.reportSuccess("primary", 0);

    const stats = manager.getUsageStats();
    expect(stats.primary.usage).toBe(0);
    expect(stats.primary.requests).toBe(2);
  });

  it("should handle very small cost values", () => {
    manager.reportSuccess("primary", 0.0001);
    manager.reportSuccess("primary", 0.0002);

    const stats = manager.getUsageStats();
    expect(stats.primary.usage).toBeCloseTo(0.0003, 4);
  });

  it("should handle concurrent operations", async () => {
    // Simulate concurrent rate limit reports
    await Promise.all([
      manager.reportRateLimit("primary"),
      manager.reportRateLimit("teamDev"),
    ]);

    // Both should be rate limited
    expect(manager.getAccountState("primary")!.status).toBe("rate_limited");
    expect(manager.getAccountState("teamDev")!.status).toBe("rate_limited");
  });

  it("should maintain state across multiple selections", () => {
    manager.reportSuccess("primary", 10);
    manager.selectAccount();
    manager.reportSuccess("primary", 20);
    manager.selectAccount();
    manager.reportSuccess("primary", 30);

    const state = manager.getAccountState("primary");
    expect(state!.weeklyUsage).toBe(60);
  });
});
