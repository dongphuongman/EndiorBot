/**
 * Notification System Tests
 *
 * Tests for NotificationSystem that sends budget notifications.
 *
 * Per PM Day 9 guidance:
 * - Rate limiting (max 4/hour)
 * - Critical notifications bypass rate limit
 * - Multiple channels (terminal + file)
 * - Priority-based filtering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NotificationSystem,
  TerminalChannel,
  FileChannel,
  createNotificationSystem,
  getPriorityLevel,
  comparePriorities,
  formatNotification,
  getNotificationIcon,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_NOTIFICATION_LOG_PATH,
  type NotificationEvent,
  type NotificationEventType,
} from "../../src/budget/notification-system.js";
import { NotificationRateLimiter } from "../../src/budget/circuit-breaker.js";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ============================================================================
// Test Setup
// ============================================================================

function createTestEvent(
  type: NotificationEventType = "budget_warning",
  priority: "low" | "medium" | "high" | "critical" = "medium",
): NotificationEvent {
  return {
    type,
    priority,
    title: "Test Title",
    message: "Test message",
    metadata: { test: true },
    timestamp: new Date(),
  };
}

// ============================================================================
// NotificationSystem Tests
// ============================================================================

describe("NotificationSystem", () => {
  let rateLimiter: NotificationRateLimiter;
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    rateLimiter = new NotificationRateLimiter(4);
    tempDir = mkdtempSync(join(tmpdir(), "notif-test-"));
    logPath = join(tempDir, "notifications.log");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const system = new NotificationSystem(rateLimiter);
      const config = system.getConfig();

      expect(config.terminalEnabled).toBe(true);
      expect(config.fileEnabled).toBe(true);
      expect(config.minPriority).toBe("low");
    });

    it("should accept custom config", () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        minPriority: "high",
      });

      const config = system.getConfig();
      expect(config.terminalEnabled).toBe(false);
      expect(config.minPriority).toBe("high");
    });

    it("should initialize with terminal and file channels", () => {
      const system = new NotificationSystem(rateLimiter);
      const channels = system.getChannels();

      expect(channels).toHaveLength(2);
      expect(channels.map((c) => c.name)).toContain("terminal");
      expect(channels.map((c) => c.name)).toContain("file");
    });
  });

  describe("notify", () => {
    it("should send notification to channels", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false, // Disable terminal to avoid console output
        fileEnabled: true,
        logPath,
      });

      const event = createTestEvent("budget_warning", "high");
      const result = await system.notify(event);

      expect(result).toBe(true);

      // Check file was written
      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("budget_warning");
      expect(content).toContain("high");
    });

    it("should respect rate limit", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      // Send 4 notifications (max allowed)
      for (let i = 0; i < 4; i++) {
        const result = await system.notify(createTestEvent());
        expect(result).toBe(true);
      }

      // 5th should be rate limited
      const result = await system.notify(createTestEvent());
      expect(result).toBe(false);
    });

    it("should allow critical to bypass rate limit", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      // Exhaust rate limit
      for (let i = 0; i < 4; i++) {
        await system.notify(createTestEvent("budget_warning", "medium"));
      }

      // Critical should still work
      const result = await system.notify(createTestEvent("budget_limit", "critical"));
      expect(result).toBe(true);
    });

    it("should filter by minimum priority", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
        minPriority: "high",
      });

      // Low priority should be filtered
      const lowResult = await system.notify(createTestEvent("daily_reset", "low"));
      expect(lowResult).toBe(false);

      // Medium should be filtered
      const medResult = await system.notify(createTestEvent("budget_warning", "medium"));
      expect(medResult).toBe(false);

      // High should pass
      const highResult = await system.notify(createTestEvent("budget_warning", "high"));
      expect(highResult).toBe(true);
    });

    it("should record in history", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent());

      const history = system.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].rateLimited).toBe(false);
      expect(history[0].channels).toContain("file");
    });

    it("should record rate limited in history", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      // Exhaust rate limit
      for (let i = 0; i < 4; i++) {
        await system.notify(createTestEvent());
      }

      // Rate limited notification
      await system.notify(createTestEvent());

      const history = system.getHistory();
      const lastEntry = history[history.length - 1];
      expect(lastEntry.rateLimited).toBe(true);
      expect(lastEntry.channels).toHaveLength(0);
    });
  });

  describe("convenience methods", () => {
    it("should send budget warning", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyBudgetWarning("session", 85, 1.70, 2.00);
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("BUDGET WARNING");
      expect(content).toContain("85%");
    });

    it("should send budget limit", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyBudgetLimit("session", 2.00, 2.00);
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("BUDGET LIMIT REACHED");
      expect(content).toContain("critical");
    });

    it("should send approval needed", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyApprovalNeeded(
        "deploy",
        "Requires CEO approval",
        "apr-123",
      );
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("APPROVAL NEEDED");
      expect(content).toContain("apr-123");
    });

    it("should send escalation", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyEscalation(3, "queue_approval", "Budget exceeded");
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("ESCALATION L3");
    });

    it("should send model switched", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyModelSwitched(
        "claude-opus-4",
        "self-hosted/qwen3-coder",
        "Budget limit reached",
      );
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("MODEL SWITCHED");
    });

    it("should send daily reset", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyDailyReset();
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("DAILY BUDGET RESET");
    });

    it("should send approval resolved", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      const result = await system.notifyApprovalResolved("apr-123", "approved", "CEO");
      expect(result).toBe(true);

      const content = readFileSync(logPath, "utf-8");
      expect(content).toContain("APPROVAL APPROVED");
    });
  });

  describe("channel management", () => {
    it("should enable/disable terminal", () => {
      const system = new NotificationSystem(rateLimiter);

      system.setTerminalEnabled(false);

      const channels = system.getChannels();
      const terminal = channels.find((c) => c.name === "terminal");
      expect(terminal?.isEnabled()).toBe(false);
    });

    it("should enable/disable file", () => {
      const system = new NotificationSystem(rateLimiter);

      system.setFileEnabled(false);

      const channels = system.getChannels();
      const file = channels.find((c) => c.name === "file");
      expect(file?.isEnabled()).toBe(false);
    });

    it("should add custom channel", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: false,
      });

      let sentEvent: NotificationEvent | null = null;
      const customChannel = {
        name: "custom",
        isEnabled: () => true,
        send: async (event: NotificationEvent) => {
          sentEvent = event;
        },
      };

      system.addChannel(customChannel);
      await system.notify(createTestEvent());

      expect(sentEvent).not.toBeNull();
      expect(sentEvent!.type).toBe("budget_warning");
    });

    it("should remove channel", () => {
      const system = new NotificationSystem(rateLimiter);

      const removed = system.removeChannel("terminal");
      expect(removed).toBe(true);

      const channels = system.getChannels();
      expect(channels.map((c) => c.name)).not.toContain("terminal");
    });
  });

  describe("statistics", () => {
    it("should track sent count", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent("budget_warning"));
      await system.notify(createTestEvent("budget_limit"));

      const stats = system.getStats();
      expect(stats.totalSent).toBe(2);
    });

    it("should track rate limited count", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      // Exhaust limit
      for (let i = 0; i < 4; i++) {
        await system.notify(createTestEvent());
      }

      // Rate limited
      await system.notify(createTestEvent());

      const stats = system.getStats();
      expect(stats.totalRateLimited).toBe(1);
    });

    it("should track by type", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent("budget_warning"));
      await system.notify(createTestEvent("budget_warning"));
      await system.notify(createTestEvent("budget_limit"));

      const stats = system.getStats();
      expect(stats.byType.budget_warning).toBe(2);
      expect(stats.byType.budget_limit).toBe(1);
    });

    it("should track by priority", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent("budget_warning", "high"));
      await system.notify(createTestEvent("budget_limit", "critical"));

      const stats = system.getStats();
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.critical).toBe(1);
    });

    it("should reset stats", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent());

      system.resetStats();

      const stats = system.getStats();
      expect(stats.totalSent).toBe(0);
    });
  });

  describe("history management", () => {
    it("should limit history to 100 entries", async () => {
      const system = new NotificationSystem(new NotificationRateLimiter(200), {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      // Send 110 notifications
      for (let i = 0; i < 110; i++) {
        await system.notify(createTestEvent());
      }

      const history = system.getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it("should clear history", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath,
      });

      await system.notify(createTestEvent());

      system.clearHistory();

      const history = system.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe("canSend", () => {
    it("should return true when rate limit not reached", () => {
      const system = new NotificationSystem(rateLimiter);

      expect(system.canSend()).toBe(true);
    });

    it("should return false when rate limit reached", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath, // Use file channel so notifications are actually sent
      });

      // Exhaust limit
      for (let i = 0; i < 4; i++) {
        await system.notify(createTestEvent());
      }

      expect(system.canSend()).toBe(false);
    });

    it("should return true for critical even when rate limited", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath, // Use file channel so notifications are actually sent
      });

      // Exhaust limit
      for (let i = 0; i < 4; i++) {
        await system.notify(createTestEvent());
      }

      expect(system.canSend("critical")).toBe(true);
    });
  });

  describe("getRemainingThisHour", () => {
    it("should return remaining notifications", async () => {
      const system = new NotificationSystem(rateLimiter, {
        terminalEnabled: false,
        fileEnabled: true,
        logPath, // Use file channel so notifications are actually sent
      });

      expect(system.getRemainingThisHour()).toBe(4);

      await system.notify(createTestEvent());

      expect(system.getRemainingThisHour()).toBe(3);
    });
  });

  describe("config management", () => {
    it("should update config", () => {
      const system = new NotificationSystem(rateLimiter);

      system.updateConfig({ minPriority: "high" });

      const config = system.getConfig();
      expect(config.minPriority).toBe("high");
    });
  });
});

// ============================================================================
// TerminalChannel Tests
// ============================================================================

describe("TerminalChannel", () => {
  it("should create with default options", () => {
    const channel = new TerminalChannel();
    expect(channel.isEnabled()).toBe(true);
  });

  it("should create disabled", () => {
    const channel = new TerminalChannel(false);
    expect(channel.isEnabled()).toBe(false);
  });

  it("should enable/disable", () => {
    const channel = new TerminalChannel(true);

    channel.setEnabled(false);
    expect(channel.isEnabled()).toBe(false);

    channel.setEnabled(true);
    expect(channel.isEnabled()).toBe(true);
  });

  it("should not send when disabled", async () => {
    const channel = new TerminalChannel(false);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await channel.send(createTestEvent());

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should send to console when enabled", async () => {
    const channel = new TerminalChannel(true, false, false);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await channel.send(createTestEvent());

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// FileChannel Tests
// ============================================================================

describe("FileChannel", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "file-channel-test-"));
    logPath = join(tempDir, "notifications.log");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create with default path", () => {
    const channel = new FileChannel();
    expect(channel.getLogPath()).toBe(DEFAULT_NOTIFICATION_LOG_PATH);
  });

  it("should create with custom path", () => {
    const channel = new FileChannel(true, logPath);
    expect(channel.getLogPath()).toBe(logPath);
  });

  it("should enable/disable", () => {
    const channel = new FileChannel(true, logPath);

    channel.setEnabled(false);
    expect(channel.isEnabled()).toBe(false);
  });

  it("should write to file", async () => {
    const channel = new FileChannel(true, logPath);

    await channel.send(createTestEvent("budget_warning", "high"));

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("budget_warning");
    expect(content).toContain("high");
  });

  it("should not write when disabled", async () => {
    const channel = new FileChannel(false, logPath);

    await channel.send(createTestEvent());

    expect(existsSync(logPath)).toBe(false);
  });

  it("should append multiple entries", async () => {
    const channel = new FileChannel(true, logPath);

    await channel.send(createTestEvent("budget_warning"));
    await channel.send(createTestEvent("budget_limit"));

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("Factory functions", () => {
  describe("createNotificationSystem", () => {
    it("should create system with rate limiter", () => {
      const rateLimiter = new NotificationRateLimiter(4);
      const system = createNotificationSystem(rateLimiter);

      expect(system.getRateLimiter()).toBe(rateLimiter);
    });
  });

  describe("getPriorityLevel", () => {
    it("should return correct levels", () => {
      expect(getPriorityLevel("low")).toBe(0);
      expect(getPriorityLevel("medium")).toBe(1);
      expect(getPriorityLevel("high")).toBe(2);
      expect(getPriorityLevel("critical")).toBe(3);
    });
  });

  describe("comparePriorities", () => {
    it("should compare correctly", () => {
      expect(comparePriorities("low", "high")).toBeLessThan(0);
      expect(comparePriorities("high", "low")).toBeGreaterThan(0);
      expect(comparePriorities("medium", "medium")).toBe(0);
    });
  });

  describe("formatNotification", () => {
    it("should format notification", () => {
      const event = createTestEvent("budget_warning", "high");
      const formatted = formatNotification(event);

      expect(formatted).toContain("⚠️");
      expect(formatted).toContain("[HIGH]");
      expect(formatted).toContain("Test Title");
    });
  });

  describe("getNotificationIcon", () => {
    it("should return correct icons", () => {
      expect(getNotificationIcon("budget_warning")).toBe("⚠️");
      expect(getNotificationIcon("budget_limit")).toBe("🛑");
      expect(getNotificationIcon("approval_needed")).toBe("📋");
      expect(getNotificationIcon("escalation")).toBe("⬆️");
      expect(getNotificationIcon("daily_reset")).toBe("🔄");
      expect(getNotificationIcon("model_switched")).toBe("🔀");
      expect(getNotificationIcon("approval_resolved")).toBe("✅");
    });
  });
});

// ============================================================================
// DEFAULT_NOTIFICATION_CONFIG Tests
// ============================================================================

describe("DEFAULT_NOTIFICATION_CONFIG", () => {
  it("should have correct defaults", () => {
    expect(DEFAULT_NOTIFICATION_CONFIG.terminalEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_CONFIG.fileEnabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_CONFIG.useColors).toBe(true);
    expect(DEFAULT_NOTIFICATION_CONFIG.minPriority).toBe("low");
    expect(DEFAULT_NOTIFICATION_CONFIG.includeTimestamp).toBe(true);
  });
});
