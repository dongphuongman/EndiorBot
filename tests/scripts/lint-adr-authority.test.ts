/**
 * Sprint 138 P3-02: ADR `authority:` field shape audit tests.
 *
 * Verifies the lint tool classifies each known ADR correctly AND exercises
 * the schema parser on synthetic inputs. Runs the lint against the real
 * docs/02-design/01-ADRs tree — acts as a drift guard: if someone adds an
 * ADR with a stale string-form authority, these tests fail.
 */

import { describe, it, expect } from "vitest";
import {
  extractAuthority,
  parseAuthorityObject,
  lintAdr,
  lintAll,
} from "../../scripts/lint-adr-authority.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "../..");

describe("extractAuthority — shape detection", () => {
  it("detects string form (inline value)", () => {
    const fm = [
      "adr: 050",
      'authority: "CTO approved 2026-04-01"',
      "date: 2026-04-01",
    ].join("\n");
    const result = extractAuthority(fm);
    expect(result).toEqual({ shape: "string", raw: '"CTO approved 2026-04-01"' });
  });

  it("detects object form (indented children)", () => {
    const fm = [
      "adr: 050",
      "authority:",
      '  proposer: "@pm"',
      "  countersigners:",
      '    - actor: "@cto"',
      '      date: "2026-04-01"',
      "date: 2026-04-01",
    ].join("\n");
    const result = extractAuthority(fm);
    expect(result?.shape).toBe("object");
    expect(result?.raw).toContain("proposer");
    expect(result?.raw).toContain("countersigners");
  });

  it("returns null when no authority field is present", () => {
    const fm = ["adr: 050", "date: 2026-04-01"].join("\n");
    expect(extractAuthority(fm)).toBeNull();
  });
});

describe("parseAuthorityObject — schema fields", () => {
  it("parses proposer, countersigners list, trigger, notes", () => {
    const body = [
      '  proposer: "@pm"',
      "  countersigners:",
      '    - actor: "@cto"',
      '      date: "2026-04-17"',
      '      grade: "9.5/10"',
      '      reference: "sprint-135"',
      '    - actor: "@cpo"',
      '      date: "2026-04-18"',
      '  trigger: "Sprint 135 P1"',
      '  notes: "retroactive"',
    ].join("\n");
    const parsed = parseAuthorityObject(body);
    expect(parsed.proposer).toBe("@pm");
    expect(parsed.countersigners).toHaveLength(2);
    expect(parsed.countersigners?.[0]).toEqual({
      actor: "@cto",
      date: "2026-04-17",
      grade: "9.5/10",
      reference: "sprint-135",
    });
    expect(parsed.countersigners?.[1]).toEqual({
      actor: "@cpo",
      date: "2026-04-18",
    });
    expect(parsed.trigger).toBe("Sprint 135 P1");
    expect(parsed.notes).toBe("retroactive");
  });
});

describe("lintAdr — classification", () => {
  it("ADR-046 passes with structured authority (Sprint 138 migration)", () => {
    const report = lintAdr(resolve(ROOT, "docs/02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md"));
    expect(report.status).toBe("PASS");
    expect(report.isObject).toBe(true);
    expect(report.countersigners).toBeGreaterThan(0);
  });

  it("ADR-048 passes with structured authority (Sprint 138 migration)", () => {
    const report = lintAdr(resolve(ROOT, "docs/02-design/01-ADRs/ADR-048-framework-6-3-1-workspace-awareness.md"));
    expect(report.status).toBe("PASS");
    expect(report.isObject).toBe(true);
    expect(report.countersigners).toBe(1);
  });
});

describe("lintAll — aggregate state", () => {
  it("reports 2 PASS + 0 STALE + 0 MALFORMED as of Sprint 138 P3-02", () => {
    const reports = lintAll();
    const counts = { PASS: 0, MISSING: 0, STALE: 0, MALFORMED: 0 };
    for (const r of reports) counts[r.status] += 1;

    expect(counts.PASS).toBeGreaterThanOrEqual(2);
    // No STALE/MALFORMED — the two ADRs with authority fields must stay structured.
    expect(counts.STALE).toBe(0);
    expect(counts.MALFORMED).toBe(0);
    // MISSING is grandfathered (pre-Sprint-128 ADRs); track the number so
    // accidental regressions (e.g. someone stripping frontmatter from 046/048)
    // would surface here.
    expect(counts.MISSING).toBeLessThanOrEqual(43);
  });
});
