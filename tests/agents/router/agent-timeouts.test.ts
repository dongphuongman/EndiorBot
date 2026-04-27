/**
 * Sprint 137 B6: per-agent timeout configuration tests.
 *
 * Verifies the resolution order for `getAgentTimeoutMs`:
 *   1. ENDIORBOT_AGENT_TIMEOUT_<AGENT>_MS  (per-agent override)
 *   2. ENDIORBOT_AGENT_TIMEOUT_<CLASS>_MS  (per-class override)
 *   3. AGENT_TIMEOUT_CLASS[agent] → defaults (executor=60s, advisory=180s, adr-writer=600s)
 *   4. fallbackMs (typically TIMEOUTS.claudeCode)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_TIMEOUT_CLASS,
  getAgentTimeoutMs,
} from "../../../src/agents/router/agent-constants.js";

const FALLBACK_MS = 300_000;

const ENV_KEYS = [
  "ENDIORBOT_AGENT_TIMEOUT_CODER_MS",
  "ENDIORBOT_AGENT_TIMEOUT_ARCHITECT_MS",
  "ENDIORBOT_AGENT_TIMEOUT_REVIEWER_MS",
  "ENDIORBOT_AGENT_TIMEOUT_EXECUTOR_MS",
  "ENDIORBOT_AGENT_TIMEOUT_ADVISORY_MS",
  "ENDIORBOT_AGENT_TIMEOUT_ADR_WRITER_MS",
];

let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("getAgentTimeoutMs — class defaults", () => {
  it("executor agents default to 180s (Sprint 143: bumped from 60s for CC CLI patience)", () => {
    expect(getAgentTimeoutMs("coder", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("tester", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("devops", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("fullstack", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("pjm", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("researcher", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("assistant", FALLBACK_MS)).toBe(180_000);
  });

  it("advisory agents default to 180s", () => {
    expect(getAgentTimeoutMs("pm", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("reviewer", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("ceo", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("cpo", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("cto", FALLBACK_MS)).toBe(180_000);
    expect(getAgentTimeoutMs("cso", FALLBACK_MS)).toBe(180_000);
  });

  it("@architect (adr-writer) defaults to 600s", () => {
    expect(getAgentTimeoutMs("architect", FALLBACK_MS)).toBe(600_000);
  });

  it("unknown agent falls back to provided fallbackMs", () => {
    expect(getAgentTimeoutMs("nonsense", FALLBACK_MS)).toBe(FALLBACK_MS);
    expect(getAgentTimeoutMs("", FALLBACK_MS)).toBe(FALLBACK_MS);
  });
});

describe("getAgentTimeoutMs — env overrides", () => {
  it("per-agent env override takes precedence over class default", () => {
    process.env.ENDIORBOT_AGENT_TIMEOUT_CODER_MS = "120000";
    expect(getAgentTimeoutMs("coder", FALLBACK_MS)).toBe(120_000);
  });

  it("per-class env override takes precedence over class default", () => {
    process.env.ENDIORBOT_AGENT_TIMEOUT_EXECUTOR_MS = "45000";
    expect(getAgentTimeoutMs("coder", FALLBACK_MS)).toBe(45_000);
    expect(getAgentTimeoutMs("tester", FALLBACK_MS)).toBe(45_000);
  });

  it("per-agent env override beats per-class env override", () => {
    process.env.ENDIORBOT_AGENT_TIMEOUT_EXECUTOR_MS = "45000";
    process.env.ENDIORBOT_AGENT_TIMEOUT_CODER_MS = "120000";
    expect(getAgentTimeoutMs("coder", FALLBACK_MS)).toBe(120_000);
    expect(getAgentTimeoutMs("tester", FALLBACK_MS)).toBe(45_000);
  });

  it("ADR_WRITER env key matches the dash-stripped class name", () => {
    process.env.ENDIORBOT_AGENT_TIMEOUT_ADR_WRITER_MS = "900000";
    expect(getAgentTimeoutMs("architect", FALLBACK_MS)).toBe(900_000);
  });

  it("malformed env value falls back to class default", () => {
    process.env.ENDIORBOT_AGENT_TIMEOUT_CODER_MS = "not-a-number";
    expect(getAgentTimeoutMs("coder", FALLBACK_MS)).toBe(180_000);
  });
});

describe("AGENT_TIMEOUT_CLASS — coverage", () => {
  it("@architect is the only adr-writer (full ADRs justify the long budget)", () => {
    const adrWriters = Object.entries(AGENT_TIMEOUT_CLASS)
      .filter(([, klass]) => klass === "adr-writer")
      .map(([agent]) => agent);
    expect(adrWriters).toEqual(["architect"]);
  });

  it("every VALID_AGENT has an assigned timeout class", () => {
    const expectedAgents = [
      "pm", "architect", "coder", "reviewer", "tester", "researcher",
      "devops", "fullstack", "pjm", "ceo", "cpo", "cto", "cso", "assistant",
    ];
    for (const agent of expectedAgents) {
      expect(AGENT_TIMEOUT_CLASS).toHaveProperty(agent);
    }
  });
});
