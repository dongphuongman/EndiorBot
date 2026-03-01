/**
 * Result Ranker Tests
 *
 * Unit tests for the ResultRanker and spec snapshot cross-ref boost.
 * Sprint 64: T3.4 + T3.6
 *
 * @module search/__tests__/result-ranker.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @sprint 64
 */

import { describe, it, expect } from "vitest";
import {
  ResultRanker,
  createRanker,
  rankResults,
  getScoreBreakdown,
  createRankerWithSpecSnapshots,
  rankWithSpecSnapshotBoost,
  DEFAULT_RANKING_CONFIG,
} from "../result-ranker.js";
import type { SearchResult } from "../types.js";

// ============================================================================
// Test Data
// ============================================================================

function createTestResult(
  path: string,
  line: number,
  score: number = 50
): SearchResult {
  return {
    path,
    line,
    column: 0,
    content: `test content for ${path}`,
    contextBefore: [],
    contextAfter: [],
    score,
    ranking_reason: "default",
    provider: "ripgrep",
    specSnapshotMatch: false,
  };
}

// ============================================================================
// DEFAULT_RANKING_CONFIG Tests
// ============================================================================

describe("DEFAULT_RANKING_CONFIG", () => {
  it("should have expected boost values", () => {
    expect(DEFAULT_RANKING_CONFIG.specSnapshotBoost).toBe(50);
    expect(DEFAULT_RANKING_CONFIG.stageBoost).toBe(30);
    expect(DEFAULT_RANKING_CONFIG.exactMatchBoost).toBe(40);
    expect(DEFAULT_RANKING_CONFIG.structuralBoost).toBe(35);
  });

  it("should have penalty and boost values", () => {
    expect(DEFAULT_RANKING_CONFIG.depthPenalty).toBe(5);
    expect(DEFAULT_RANKING_CONFIG.topOfFileBoost).toBe(20);
  });

  it("should have empty default paths", () => {
    expect(DEFAULT_RANKING_CONFIG.specSnapshotPaths.size).toBe(0);
    expect(DEFAULT_RANKING_CONFIG.stagePriorityPatterns.length).toBe(0);
  });
});

// ============================================================================
// ResultRanker Tests
// ============================================================================

describe("ResultRanker", () => {
  describe("constructor", () => {
    it("should create ranker with default config", () => {
      const ranker = new ResultRanker();
      expect(ranker).toBeInstanceOf(ResultRanker);
    });

    it("should merge partial config with defaults", () => {
      const ranker = new ResultRanker({
        specSnapshotBoost: 100,
      });
      expect(ranker).toBeInstanceOf(ResultRanker);
    });
  });

  describe("rank", () => {
    it("should sort results by total score descending", () => {
      const ranker = new ResultRanker();
      const results = [
        createTestResult("src/low.ts", 100, 10),
        createTestResult("src/high.ts", 5, 90),
        createTestResult("src/medium.ts", 50, 50),
      ];

      const ranked = ranker.rank(results);

      expect(ranked[0]?.path).toBe("src/high.ts");
      expect(ranked[2]?.path).toBe("src/low.ts");
    });

    it("should update ranking_reason based on boost", () => {
      const ranker = new ResultRanker({
        specSnapshotPaths: new Set(["src/spec.ts"]),
      });

      const results = [createTestResult("src/spec.ts", 10)];
      const ranked = ranker.rank(results);

      expect(ranked[0]?.ranking_reason).toBe("spec_snapshot_match");
    });

    it("should preserve score in result", () => {
      const ranker = new ResultRanker();
      const results = [createTestResult("src/test.ts", 10, 50)];

      const ranked = ranker.rank(results);

      expect(ranked[0]?.score).toBeGreaterThan(0);
    });
  });

  describe("scoreResult", () => {
    it("should include base score in breakdown", () => {
      const ranker = new ResultRanker();
      const result = createTestResult("src/test.ts", 10, 75);

      const breakdown = ranker.scoreResult(result);

      expect(breakdown.baseScore).toBe(75);
    });

    it("should add spec snapshot boost", () => {
      const ranker = new ResultRanker({
        specSnapshotPaths: new Set(["src/spec.ts"]),
      });
      const result = createTestResult("src/spec.ts", 10, 50);

      const breakdown = ranker.scoreResult(result);

      expect(breakdown.specSnapshotBoost).toBe(50);
      expect(breakdown.totalScore).toBeGreaterThan(breakdown.baseScore);
    });

    it("should add position boost for top of file", () => {
      const ranker = new ResultRanker();
      const topResult = createTestResult("src/test.ts", 5);
      const bottomResult = createTestResult("src/test.ts", 200);

      const topBreakdown = ranker.scoreResult(topResult);
      const bottomBreakdown = ranker.scoreResult(bottomResult);

      expect(topBreakdown.positionBoost).toBeGreaterThan(0);
      expect(bottomBreakdown.positionBoost).toBe(0);
    });

    it("should apply depth penalty for nested files", () => {
      const ranker = new ResultRanker();
      const shallow = createTestResult("src/test.ts", 10);
      const deep = createTestResult("src/a/b/c/d/e/test.ts", 10);

      const shallowBreakdown = ranker.scoreResult(shallow);
      const deepBreakdown = ranker.scoreResult(deep);

      expect(shallowBreakdown.depthPenalty).toBe(0);
      expect(deepBreakdown.depthPenalty).toBeGreaterThan(0);
    });

    it("should add match type boost for exact match", () => {
      const ranker = new ResultRanker();
      const result: SearchResult = {
        ...createTestResult("src/test.ts", 10),
        ranking_reason: "exact_match",
      };

      const breakdown = ranker.scoreResult(result);

      expect(breakdown.matchTypeBoost).toBe(40);
    });

    it("should add match type boost for structural match", () => {
      const ranker = new ResultRanker();
      const result: SearchResult = {
        ...createTestResult("src/test.ts", 10),
        ranking_reason: "structural_match",
      };

      const breakdown = ranker.scoreResult(result);

      expect(breakdown.matchTypeBoost).toBe(35);
    });
  });

  describe("setSpecSnapshotPaths", () => {
    it("should update spec snapshot paths", () => {
      const ranker = new ResultRanker();
      ranker.setSpecSnapshotPaths(["src/api.ts", "src/routes.ts"]);

      const result = createTestResult("src/api.ts", 10);
      const breakdown = ranker.scoreResult(result);

      expect(breakdown.specSnapshotBoost).toBe(50);
    });
  });

  describe("setStagePriorityPatterns", () => {
    it("should update stage priority patterns", () => {
      const ranker = new ResultRanker();
      ranker.setStagePriorityPatterns(["src/**/*.ts"]);

      const result = createTestResult("src/utils/helper.ts", 10);
      const breakdown = ranker.scoreResult(result);

      expect(breakdown.stageBoost).toBe(30);
    });
  });

  describe("updateConfig", () => {
    it("should update config values", () => {
      const ranker = new ResultRanker();
      ranker.updateConfig({ specSnapshotBoost: 100 });

      const result = createTestResult("src/spec.ts", 10);
      ranker.setSpecSnapshotPaths(["src/spec.ts"]);
      const breakdown = ranker.scoreResult(result);

      expect(breakdown.specSnapshotBoost).toBe(100);
    });
  });
});

// ============================================================================
// Spec Snapshot Cross-Ref Boost Tests (T3.6)
// ============================================================================

describe("Spec Snapshot Cross-Ref Boost (T3.6)", () => {
  it("should boost spec snapshot files above non-spec files", () => {
    const specPaths = ["src/api/routes.ts", "src/core/engine.ts"];
    const ranker = createRankerWithSpecSnapshots(specPaths);

    const results = [
      createTestResult("src/utils/helper.ts", 10, 70), // Non-spec file
      createTestResult("src/api/routes.ts", 10, 50), // spec file, lower base score
    ];

    const ranked = ranker.rank(results);

    // Spec file should be ranked first despite lower base score (+50 boost)
    // Spec: 50 + 50 (spec boost) + 20 (position) = 120
    // Non-spec: 70 + 20 (position) = 90
    expect(ranked[0]?.path).toBe("src/api/routes.ts");
    expect(ranked[0]?.ranking_reason).toBe("spec_snapshot_match");
  });

  it("should mark spec snapshot match in ranking reason", () => {
    const specPaths = ["src/main.ts"];
    const results = [createTestResult("src/main.ts", 10)];

    const ranked = rankWithSpecSnapshotBoost(results, specPaths);

    expect(ranked[0]?.ranking_reason).toBe("spec_snapshot_match");
  });

  it("should combine spec snapshot boost with stage boost", () => {
    const specPaths = ["src/api.ts"];
    const stagePatterns = ["src/**/*.ts"];
    const ranker = createRankerWithSpecSnapshots(specPaths, stagePatterns);

    // Non-spec file matching stage pattern
    const stageResult = createTestResult("src/utils/helper.ts", 10, 50);
    const stageBreakdown = ranker.scoreResult(stageResult);

    // Spec file (also matches stage pattern)
    const specResult = createTestResult("src/api.ts", 10, 50);
    const specBreakdown = ranker.scoreResult(specResult);

    // Spec file should have higher total (spec boost + stage boost)
    expect(specBreakdown.totalScore).toBeGreaterThan(stageBreakdown.totalScore);
    expect(specBreakdown.specSnapshotBoost).toBe(50);
    expect(specBreakdown.stageBoost).toBe(30); // Also gets stage boost
  });

  it("should apply 50 point boost for spec snapshot", () => {
    const ranker = createRankerWithSpecSnapshots(["src/spec.ts"]);
    const result = createTestResult("src/spec.ts", 10, 50);

    const breakdown = ranker.scoreResult(result);

    expect(breakdown.specSnapshotBoost).toBe(50);
  });

  it("should not apply spec boost to non-spec files", () => {
    const ranker = createRankerWithSpecSnapshots(["src/spec.ts"]);
    const result = createTestResult("src/other.ts", 10, 50);

    const breakdown = ranker.scoreResult(result);

    expect(breakdown.specSnapshotBoost).toBe(0);
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe("createRanker", () => {
  it("should create ranker with default config", () => {
    const ranker = createRanker();
    expect(ranker).toBeInstanceOf(ResultRanker);
  });

  it("should create ranker with custom config", () => {
    const ranker = createRanker({ specSnapshotBoost: 100 });
    expect(ranker).toBeInstanceOf(ResultRanker);
  });
});

describe("rankResults", () => {
  it("should rank results using default ranker", () => {
    const results = [
      createTestResult("src/low.ts", 100, 10),
      createTestResult("src/high.ts", 5, 90),
    ];

    const ranked = rankResults(results);

    expect(ranked[0]?.path).toBe("src/high.ts");
  });

  it("should rank results with custom config", () => {
    const results = [createTestResult("src/spec.ts", 10, 10)];

    const ranked = rankResults(results, {
      specSnapshotPaths: new Set(["src/spec.ts"]),
    });

    expect(ranked[0]?.ranking_reason).toBe("spec_snapshot_match");
  });
});

describe("getScoreBreakdown", () => {
  it("should return breakdown for result", () => {
    const result = createTestResult("src/test.ts", 10, 50);
    const breakdown = getScoreBreakdown(result);

    expect(breakdown.baseScore).toBe(50);
    expect(breakdown.totalScore).toBeGreaterThan(0);
    expect(breakdown.rankingReason).toBeDefined();
  });

  it("should use custom config in breakdown", () => {
    const result = createTestResult("src/spec.ts", 10, 50);
    const breakdown = getScoreBreakdown(result, {
      specSnapshotPaths: new Set(["src/spec.ts"]),
    });

    expect(breakdown.specSnapshotBoost).toBe(50);
  });
});

describe("createRankerWithSpecSnapshots", () => {
  it("should create ranker with spec snapshot paths", () => {
    const ranker = createRankerWithSpecSnapshots([
      "src/api.ts",
      "src/routes.ts",
    ]);

    const result = createTestResult("src/api.ts", 10);
    const breakdown = ranker.scoreResult(result);

    expect(breakdown.specSnapshotBoost).toBe(50);
  });

  it("should accept stage priority patterns", () => {
    const ranker = createRankerWithSpecSnapshots(["src/api.ts"], [
      "src/**/*.ts",
    ]);

    const result = createTestResult("src/utils/test.ts", 10);
    const breakdown = ranker.scoreResult(result);

    expect(breakdown.stageBoost).toBe(30);
  });
});

describe("rankWithSpecSnapshotBoost", () => {
  it("should rank with spec snapshot boost applied", () => {
    const results = [
      createTestResult("src/low.ts", 100, 100),
      createTestResult("src/spec.ts", 10, 50),
    ];

    const ranked = rankWithSpecSnapshotBoost(results, ["src/spec.ts"]);

    // Spec file should be first despite lower base score
    expect(ranked[0]?.path).toBe("src/spec.ts");
  });

  it("should accept stage priority patterns", () => {
    const results = [
      createTestResult("test/test.spec.ts", 10, 80), // No stage boost
      createTestResult("src/utils/helper.ts", 10, 70), // Gets +30 stage boost
    ];

    const ranked = rankWithSpecSnapshotBoost(results, [], ["src/**/*.ts"]);

    // src/ file should be boosted by stage pattern (+30)
    // src: 70 + 30 (stage) + 20 (position) = 120
    // test: 80 + 20 (position) = 100
    expect(ranked[0]?.path).toBe("src/utils/helper.ts");
  });
});

// ============================================================================
// Position Boost Tests
// ============================================================================

describe("Position Boost", () => {
  it("should give highest boost to lines 1-10", () => {
    const ranker = new ResultRanker();

    const line5 = ranker.scoreResult(createTestResult("src/test.ts", 5));
    const line25 = ranker.scoreResult(createTestResult("src/test.ts", 25));
    const line50 = ranker.scoreResult(createTestResult("src/test.ts", 50));

    expect(line5.positionBoost).toBeGreaterThan(line25.positionBoost);
    expect(line25.positionBoost).toBeGreaterThan(line50.positionBoost);
  });

  it("should give no boost after line 100", () => {
    const ranker = new ResultRanker();
    const result = ranker.scoreResult(createTestResult("src/test.ts", 150));

    expect(result.positionBoost).toBe(0);
  });
});

// ============================================================================
// Depth Penalty Tests
// ============================================================================

describe("Depth Penalty", () => {
  it("should not penalize files up to 3 levels deep", () => {
    const ranker = new ResultRanker();

    const level1 = ranker.scoreResult(createTestResult("src/test.ts", 10));
    const level2 = ranker.scoreResult(createTestResult("src/a/test.ts", 10));
    const level3 = ranker.scoreResult(createTestResult("src/a/b/test.ts", 10));

    expect(level1.depthPenalty).toBe(0);
    expect(level2.depthPenalty).toBe(0);
    expect(level3.depthPenalty).toBe(0);
  });

  it("should penalize files deeper than 3 levels", () => {
    const ranker = new ResultRanker();

    const level4 = ranker.scoreResult(
      createTestResult("src/a/b/c/test.ts", 10)
    );
    const level5 = ranker.scoreResult(
      createTestResult("src/a/b/c/d/test.ts", 10)
    );

    expect(level4.depthPenalty).toBeGreaterThan(0);
    expect(level5.depthPenalty).toBeGreaterThan(level4.depthPenalty);
  });
});
