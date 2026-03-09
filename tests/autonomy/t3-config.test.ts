/**
 * T3 Config Tests — Sprint 97
 *
 * Validates DEFAULT_T3_CONFIG alignment with AUTONOMY_GATE_CONFIG.C,
 * T3 > T2 on all limits, and ADR-002 compliance (no new imports).
 *
 * @module tests/autonomy/t3-config
 * @sprint 97
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_T2_CONFIG, DEFAULT_T3_CONFIG } from "../../src/autonomy/types.js";
import { AUTONOMY_GATE_CONFIG } from "../../src/sessions/autonomous/types.js";

describe("DEFAULT_T3_CONFIG", () => {
  // --------------------------------------------------------------------------
  // Gate C alignment
  // --------------------------------------------------------------------------

  it("should align timeoutMs with AUTONOMY_GATE_CONFIG.C.maxDurationMs", () => {
    expect(DEFAULT_T3_CONFIG.timeoutMs).toBe(AUTONOMY_GATE_CONFIG.C.maxDurationMs);
    expect(DEFAULT_T3_CONFIG.timeoutMs).toBe(2 * 60 * 60 * 1000); // 120 min
  });

  it("should align costLimitUsd with AUTONOMY_GATE_CONFIG.C.maxCostUsd", () => {
    expect(DEFAULT_T3_CONFIG.costLimitUsd).toBe(AUTONOMY_GATE_CONFIG.C.maxCostUsd);
    expect(DEFAULT_T3_CONFIG.costLimitUsd).toBe(10.0);
  });

  it("should have maxAgents = 6", () => {
    expect(DEFAULT_T3_CONFIG.maxAgents).toBe(6);
  });

  it("should have maxParallelTracks = 4", () => {
    expect(DEFAULT_T3_CONFIG.maxParallelTracks).toBe(4);
  });

  it("should use mixed strategy as default", () => {
    expect(DEFAULT_T3_CONFIG.defaultStrategy).toBe("mixed");
  });

  it("should have perSubtaskTimeoutMs = 120_000 (2 min)", () => {
    expect(DEFAULT_T3_CONFIG.perSubtaskTimeoutMs).toBe(2 * 60 * 1000);
  });

  // --------------------------------------------------------------------------
  // T3 > T2 on all limits
  // --------------------------------------------------------------------------

  it("should exceed T2 on all limits", () => {
    expect(DEFAULT_T3_CONFIG.maxAgents).toBeGreaterThan(DEFAULT_T2_CONFIG.maxAgents);
    expect(DEFAULT_T3_CONFIG.maxParallelTracks).toBeGreaterThan(DEFAULT_T2_CONFIG.maxParallelTracks);
    expect(DEFAULT_T3_CONFIG.timeoutMs).toBeGreaterThan(DEFAULT_T2_CONFIG.timeoutMs);
    expect(DEFAULT_T3_CONFIG.costLimitUsd).toBeGreaterThan(DEFAULT_T2_CONFIG.costLimitUsd);
    expect(DEFAULT_T3_CONFIG.perSubtaskTimeoutMs).toBeGreaterThan(DEFAULT_T2_CONFIG.perSubtaskTimeoutMs);
  });

  // --------------------------------------------------------------------------
  // T2 unchanged
  // --------------------------------------------------------------------------

  it("should not modify T2 config", () => {
    expect(DEFAULT_T2_CONFIG.maxAgents).toBe(4);
    expect(DEFAULT_T2_CONFIG.maxParallelTracks).toBe(3);
    expect(DEFAULT_T2_CONFIG.timeoutMs).toBe(30 * 60 * 1000);
    expect(DEFAULT_T2_CONFIG.costLimitUsd).toBe(2.0);
    expect(DEFAULT_T2_CONFIG.perSubtaskTimeoutMs).toBe(60 * 1000);
    expect(DEFAULT_T2_CONFIG.defaultStrategy).toBe("sequential");
  });
});
