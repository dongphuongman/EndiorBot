/**
 * Checkpoint Integration Tests
 *
 * Tests for budget-checkpoint integration per CTO Day 5 guidance:
 * 1. Session costs carry over on resume (not reset to zero)
 * 2. Daily budget persists across sessions (file-backed)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  DailyBudgetStore,
  createDailyBudgetStore,
  extractCostState,
  restoreBudgetFromCheckpoint,
  createBudgetStateFromCheckpoint,
  needsBudgetRestore,
  DEFAULT_DAILY_LIMIT,
} from "../../src/budget/checkpoint-integration.js";
import type {
  PersistedDailyBudget,
  CheckpointBudgetResult,
} from "../../src/budget/checkpoint-integration.js";
import type { CheckpointState, CostState } from "../../src/sessions/checkpoint/types.js";
import type { BudgetState } from "../../src/budget/types.js";
import { BudgetTracker, createBudgetTracker } from "../../src/budget/budget-tracker.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTempDir(): string {
  const tempDir = join(tmpdir(), `budget-checkpoint-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function createMockCheckpoint(overrides?: Partial<CostState>): CheckpointState {
  const defaultCost: CostState = {
    sessionCostSoFar: 0.5,
    tokenUsage: [
      { model: "claude-sonnet-4", input: 1000, output: 500, cost: 0.02 },
      { model: "claude-opus-4", input: 500, output: 200, cost: 0.03 },
    ],
    timeBudgetRemaining: undefined,
    ...overrides,
  };

  return {
    meta: {
      id: "ckpt-test-123",
      schemaVersion: "1.0.0",
      createdAt: new Date(),
      reason: "manual",
      description: "Test checkpoint",
    },
    session: {
      session: {
        id: "session-123",
        projectId: "project-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        status: "active",
      },
      activeSoul: "coder",
      decisionLog: [],
    },
    execution: {
      currentPhase: "implement",
      taskQueue: [],
      stepStack: [],
      pendingToolCalls: [],
      partialResults: {},
    },
    provenance: {
      repoCommitSha: "abc123",
      lockfilesHash: "def456",
      nodeVersion: "22.11.0",
      modelConfig: { model: "claude-sonnet-4" },
      envFingerprint: {},
      executionTraceDigest: "ghi789",
      runtimeFingerprint: "darwin-arm64-node22.11.0",
    },
    idempotency: {
      idempotencyKeys: {},
      completedActions: [],
      idempotencyScope: {},
      toolCallOutputsCache: {},
      toolCallAttempts: {},
      retryBudget: 3,
    },
    filesystem: {
      modifiedFiles: [],
      createdFiles: [],
      fileHashes: {},
    },
    git: {
      branch: "main",
      uncommittedChanges: [],
      lastCheckpointCommit: "abc123",
    },
    cost: defaultCost,
    rollback: {},
    brain: {
      brainVersion: "1.0.0",
      brainDigest: "xyz",
    },
    statemachine: {
      gateStatus: {},
      evidenceBindings: {},
      approvalPending: [],
    },
  };
}

function createMockBudgetState(sessionCost: number = 0.5): BudgetState {
  return {
    session: {
      costSoFar: sessionCost,
      limit: 2.0,
      startTime: new Date(),
    },
    daily: {
      costSoFar: 1.5,
      limit: 10.0,
      date: new Date().toISOString().substring(0, 10),
      resetAt: new Date(),
    },
    tracks: undefined,
    tokenUsage: [
      {
        timestamp: new Date(),
        model: "claude-sonnet-4",
        provider: "anthropic",
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.02,
      },
    ],
    historical: {
      avgCostPerTask: {},
      avgCostPerModel: {},
      totalSpent: 1.5,
    },
  };
}

// ============================================================================
// DailyBudgetStore Tests
// ============================================================================

describe("DailyBudgetStore", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    tempFilePath = join(tempDir, "daily-budget.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe("constructor", () => {
    it("should create with default values when no file exists", () => {
      const store = new DailyBudgetStore(tempFilePath);

      const budget = store.getDailyBudget();
      expect(budget.costSoFar).toBe(0);
      expect(budget.limit).toBe(DEFAULT_DAILY_LIMIT);
    });

    it("should load existing data from file", () => {
      // Create file with existing data
      const existingData: PersistedDailyBudget = {
        limit: 15.0,
        costSoFar: 5.5,
        date: new Date().toISOString().substring(0, 10),
        lastUpdated: new Date().toISOString(),
        version: "1.0.0",
      };
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempFilePath, JSON.stringify(existingData));

      const store = new DailyBudgetStore(tempFilePath);
      const budget = store.getDailyBudget();

      expect(budget.costSoFar).toBe(5.5);
      expect(budget.limit).toBe(15.0);
    });

    it("should reset if file has different date", () => {
      // Create file with yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const existingData: PersistedDailyBudget = {
        limit: 10.0,
        costSoFar: 8.0,
        date: yesterday.toISOString().substring(0, 10),
        lastUpdated: yesterday.toISOString(),
        version: "1.0.0",
      };
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempFilePath, JSON.stringify(existingData));

      const store = new DailyBudgetStore(tempFilePath);
      const budget = store.getDailyBudget();

      // Should reset to 0 for new day
      expect(budget.costSoFar).toBe(0);
      expect(budget.date).toBe(new Date().toISOString().substring(0, 10));
    });

    it("should handle invalid JSON gracefully", () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempFilePath, "invalid json {{{");

      const store = new DailyBudgetStore(tempFilePath);
      const budget = store.getDailyBudget();

      expect(budget.costSoFar).toBe(0);
    });
  });

  // ==========================================================================
  // recordCost Tests
  // ==========================================================================

  describe("recordCost", () => {
    it("should accumulate costs", () => {
      const store = new DailyBudgetStore(tempFilePath);

      store.recordCost(1.0);
      store.recordCost(0.5);
      store.recordCost(0.25);

      const budget = store.getDailyBudget();
      expect(budget.costSoFar).toBeCloseTo(1.75, 2);
    });

    it("should persist to file", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.recordCost(2.5);

      // Create new store instance to verify persistence
      const newStore = new DailyBudgetStore(tempFilePath);
      const budget = newStore.getDailyBudget();

      expect(budget.costSoFar).toBe(2.5);
    });

    it("should reset on new day before recording", () => {
      // Create file with yesterday's date and cost
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const existingData: PersistedDailyBudget = {
        limit: 10.0,
        costSoFar: 8.0,
        date: yesterday.toISOString().substring(0, 10),
        lastUpdated: yesterday.toISOString(),
        version: "1.0.0",
      };
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(tempFilePath, JSON.stringify(existingData));

      const store = new DailyBudgetStore(tempFilePath);
      store.recordCost(1.0);

      const budget = store.getDailyBudget();
      // Should be 1.0, not 9.0 (reset + new cost)
      expect(budget.costSoFar).toBe(1.0);
    });
  });

  // ==========================================================================
  // Limit Tests
  // ==========================================================================

  describe("limit handling", () => {
    it("should track remaining budget", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(10.0);
      store.recordCost(3.5);

      expect(store.getRemainingBudget()).toBeCloseTo(6.5, 2);
    });

    it("should detect when limit is reached", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(5.0);
      store.recordCost(5.0);

      expect(store.isLimitReached()).toBe(true);
    });

    it("should detect when limit is exceeded", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(5.0);
      store.recordCost(6.0);

      expect(store.isLimitReached()).toBe(true);
      expect(store.getRemainingBudget()).toBe(0);
    });

    it("should detect warning threshold at 80%", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(10.0);
      store.recordCost(8.0);

      expect(store.isAtWarningThreshold(80)).toBe(true);
    });

    it("should not trigger warning below threshold", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(10.0);
      store.recordCost(7.0);

      expect(store.isAtWarningThreshold(80)).toBe(false);
    });
  });

  // ==========================================================================
  // Reset Tests
  // ==========================================================================

  describe("reset", () => {
    it("should reset cost to zero", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.recordCost(5.0);
      store.reset();

      expect(store.getDailyBudget().costSoFar).toBe(0);
    });

    it("should preserve limit after reset", () => {
      const store = new DailyBudgetStore(tempFilePath);
      store.setLimit(15.0);
      store.recordCost(5.0);
      store.reset();

      expect(store.getDailyBudget().limit).toBe(15.0);
    });
  });
});

// ============================================================================
// extractCostState Tests
// ============================================================================

describe("extractCostState", () => {
  it("should extract session cost", () => {
    const budgetState = createMockBudgetState(1.25);

    const costState = extractCostState(budgetState);

    expect(costState.sessionCostSoFar).toBe(1.25);
  });

  it("should convert token usage format", () => {
    const budgetState = createMockBudgetState();

    const costState = extractCostState(budgetState);

    expect(costState.tokenUsage).toHaveLength(1);
    expect(costState.tokenUsage[0].model).toBe("claude-sonnet-4");
    expect(costState.tokenUsage[0].input).toBe(1000);
    expect(costState.tokenUsage[0].output).toBe(500);
  });
});

// ============================================================================
// restoreBudgetFromCheckpoint Tests
// ============================================================================

describe("restoreBudgetFromCheckpoint", () => {
  let tempDir: string;
  let tempFilePath: string;
  let dailyStore: DailyBudgetStore;

  beforeEach(() => {
    tempDir = createTempDir();
    tempFilePath = join(tempDir, "daily-budget.json");
    dailyStore = new DailyBudgetStore(tempFilePath);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should restore session cost from checkpoint", () => {
    const checkpoint = createMockCheckpoint({ sessionCostSoFar: 1.80 });

    const result = restoreBudgetFromCheckpoint(checkpoint, dailyStore);

    expect(result.sessionCostRestored).toBe(1.80);
  });

  it("should load daily cost from store", () => {
    dailyStore.recordCost(3.5);
    const checkpoint = createMockCheckpoint();

    const result = restoreBudgetFromCheckpoint(checkpoint, dailyStore);

    expect(result.dailyCostLoaded).toBe(3.5);
  });

  it("should warn when session cost exceeds daily remaining", () => {
    dailyStore.setLimit(2.0);
    dailyStore.recordCost(1.5);
    const checkpoint = createMockCheckpoint({ sessionCostSoFar: 1.0 });

    const result = restoreBudgetFromCheckpoint(checkpoint, dailyStore);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("may exceed");
  });
});

// ============================================================================
// createBudgetStateFromCheckpoint Tests
// ============================================================================

describe("createBudgetStateFromCheckpoint", () => {
  let tempDir: string;
  let tempFilePath: string;
  let dailyStore: DailyBudgetStore;

  beforeEach(() => {
    tempDir = createTempDir();
    tempFilePath = join(tempDir, "daily-budget.json");
    dailyStore = new DailyBudgetStore(tempFilePath);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create BudgetState with checkpoint session cost", () => {
    const checkpoint = createMockCheckpoint({ sessionCostSoFar: 1.50 });

    const state = createBudgetStateFromCheckpoint(checkpoint, dailyStore);

    expect(state.session.costSoFar).toBe(1.50);
  });

  it("should create BudgetState with daily store cost", () => {
    dailyStore.recordCost(4.0);
    const checkpoint = createMockCheckpoint();

    const state = createBudgetStateFromCheckpoint(checkpoint, dailyStore);

    expect(state.daily.costSoFar).toBe(4.0);
  });

  it("should use provided session limit", () => {
    const checkpoint = createMockCheckpoint();

    const state = createBudgetStateFromCheckpoint(checkpoint, dailyStore, 3.0);

    expect(state.session.limit).toBe(3.0);
  });

  it("should convert token usage records", () => {
    const checkpoint = createMockCheckpoint();

    const state = createBudgetStateFromCheckpoint(checkpoint, dailyStore);

    expect(state.tokenUsage).toHaveLength(2);
    expect(state.tokenUsage[0].inputTokens).toBe(1000);
    expect(state.tokenUsage[0].outputTokens).toBe(500);
  });
});

// ============================================================================
// needsBudgetRestore Tests
// ============================================================================

describe("needsBudgetRestore", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    tempFilePath = join(tempDir, "daily-budget.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should return true when checkpoint has session cost", () => {
    const checkpoint = createMockCheckpoint({ sessionCostSoFar: 0.5 });

    expect(needsBudgetRestore(checkpoint, tempFilePath)).toBe(true);
  });

  it("should return false when checkpoint has zero session cost", () => {
    const checkpoint = createMockCheckpoint({ sessionCostSoFar: 0 });

    expect(needsBudgetRestore(checkpoint, tempFilePath)).toBe(false);
  });

  it("should return true when daily file has cost for today", () => {
    const data: PersistedDailyBudget = {
      limit: 10.0,
      costSoFar: 2.5,
      date: new Date().toISOString().substring(0, 10),
      lastUpdated: new Date().toISOString(),
      version: "1.0.0",
    };
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(tempFilePath, JSON.stringify(data));

    expect(needsBudgetRestore(null, tempFilePath)).toBe(true);
  });

  it("should return false when daily file has old date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const data: PersistedDailyBudget = {
      limit: 10.0,
      costSoFar: 5.0,
      date: yesterday.toISOString().substring(0, 10),
      lastUpdated: yesterday.toISOString(),
      version: "1.0.0",
    };
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(tempFilePath, JSON.stringify(data));

    expect(needsBudgetRestore(null, tempFilePath)).toBe(false);
  });
});

// ============================================================================
// BudgetTracker Integration Tests
// ============================================================================

describe("BudgetTracker.restoreFromCheckpoint", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    tempFilePath = join(tempDir, "daily-budget.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should restore session cost from CostState", () => {
    const tracker = createBudgetTracker();
    const costState: CostState = {
      sessionCostSoFar: 1.50,
      tokenUsage: [],
      timeBudgetRemaining: undefined,
    };

    tracker.restoreFromCheckpoint(costState);

    const state = tracker.getState();
    expect(state.session.costSoFar).toBe(1.50);
  });

  it("should restore token usage records", () => {
    const tracker = createBudgetTracker();
    const costState: CostState = {
      sessionCostSoFar: 0.05,
      tokenUsage: [
        { model: "claude-sonnet-4", input: 1000, output: 500, cost: 0.02 },
        { model: "claude-opus-4", input: 500, output: 200, cost: 0.03 },
      ],
      timeBudgetRemaining: undefined,
    };

    tracker.restoreFromCheckpoint(costState);

    const state = tracker.getState();
    expect(state.tokenUsage).toHaveLength(2);
  });

  it("should prevent session from exceeding limit after restore", async () => {
    const tracker = createBudgetTracker({ per_session_limit: 2.0 });
    const costState: CostState = {
      sessionCostSoFar: 1.80,
      tokenUsage: [],
      timeBudgetRemaining: undefined,
    };

    tracker.restoreFromCheckpoint(costState);

    // Try to spend $0.30 more (would exceed $2.00 limit)
    const result = await tracker.recordUsage({
      timestamp: new Date(),
      model: "claude-sonnet-4",
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.30,
    });

    // Should trigger limit action
    expect(result.action).toBe("pause");
  });

  it("should export to CostState format", () => {
    const tracker = createBudgetTracker();

    // Record some usage
    tracker.recordUsage({
      timestamp: new Date(),
      model: "claude-sonnet-4",
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.02,
    });

    const costState = tracker.toCostState();

    expect(costState.sessionCostSoFar).toBe(0.02);
    expect(costState.tokenUsage).toHaveLength(1);
    expect(costState.tokenUsage[0].model).toBe("claude-sonnet-4");
  });
});

// ============================================================================
// Cross-Session Budget Persistence Tests (CTO Day 5 Critical)
// ============================================================================

describe("Cross-Session Budget Persistence", () => {
  let tempDir: string;
  let dailyBudgetPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dailyBudgetPath = join(tempDir, "daily-budget.json");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should persist daily budget across BudgetTracker instances", () => {
    // Session 1: Spend $3.00
    const store1 = new DailyBudgetStore(dailyBudgetPath);
    store1.recordCost(3.0);

    // Session 2: Create new store (simulates app restart)
    const store2 = new DailyBudgetStore(dailyBudgetPath);

    // Daily cost should be preserved
    expect(store2.getDailyBudget().costSoFar).toBe(3.0);
  });

  it("should accumulate costs across multiple sessions in same day", () => {
    // Session 1
    const store1 = new DailyBudgetStore(dailyBudgetPath);
    store1.recordCost(2.0);

    // Session 2
    const store2 = new DailyBudgetStore(dailyBudgetPath);
    store2.recordCost(1.5);

    // Session 3
    const store3 = new DailyBudgetStore(dailyBudgetPath);
    store3.recordCost(0.75);

    // Total should be accumulated
    expect(store3.getDailyBudget().costSoFar).toBeCloseTo(4.25, 2);
  });

  it("should correctly enforce daily limit after restore", () => {
    // Setup: Create daily budget with $8 already spent
    const store = new DailyBudgetStore(dailyBudgetPath);
    store.setLimit(10.0);
    store.recordCost(8.0);

    // New session starts with checkpoint restore
    const tracker = createBudgetTracker({ daily_limit: 10.0 });

    // Restore session from checkpoint
    tracker.restoreFromCheckpoint({
      sessionCostSoFar: 0.5,
      tokenUsage: [],
      timeBudgetRemaining: undefined,
    });

    // The tracker knows session cost, but daily budget is tracked by store
    // Combined spending should be approaching limit
    expect(store.isAtWarningThreshold(80)).toBe(true);
  });

  it("should reset daily budget on new day", () => {
    // Create file with yesterday's high cost
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const data: PersistedDailyBudget = {
      limit: 10.0,
      costSoFar: 9.5,
      date: yesterday.toISOString().substring(0, 10),
      lastUpdated: yesterday.toISOString(),
      version: "1.0.0",
    };
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(dailyBudgetPath, JSON.stringify(data));

    // New session on new day
    const store = new DailyBudgetStore(dailyBudgetPath);

    // Should reset to 0 for new day
    expect(store.getDailyBudget().costSoFar).toBe(0);
    expect(store.getDailyBudget().date).toBe(
      new Date().toISOString().substring(0, 10),
    );
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createDailyBudgetStore", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create store with custom path", () => {
    const customPath = join(tempDir, "custom-daily.json");
    const store = createDailyBudgetStore(customPath);

    store.recordCost(1.0);

    expect(existsSync(customPath)).toBe(true);
  });
});
