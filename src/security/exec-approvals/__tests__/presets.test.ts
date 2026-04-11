/**
 * Unit tests for presets.ts
 *
 * @module security/exec-approvals/__tests__/presets
 * @sprint 132 M1
 */

import { describe, it, expect } from "vitest";
import {
  HARD_DENY_BASE,
  STRICT_PRESET,
  BALANCED_PRESET,
  OPEN_PRESET,
  buildPresetPolicy,
} from "../presets.js";

describe("presets", () => {
  describe("HARD_DENY_BASE", () => {
    it("contains rm -rf /", () => {
      expect(HARD_DENY_BASE).toContain("rm -rf /");
    });

    it("contains git push --force wildcard", () => {
      expect(HARD_DENY_BASE).toContain("git push --force *");
    });

    it("contains fork bomb", () => {
      expect(HARD_DENY_BASE).toContain(":(){ :|:& };:");
    });

    it("contains dd if=* of=/dev/*", () => {
      expect(HARD_DENY_BASE).toContain("dd if=* of=/dev/*");
    });

    it("contains sudo wildcard", () => {
      expect(HARD_DENY_BASE).toContain("sudo *");
    });

    it("contains DROP TABLE", () => {
      expect(HARD_DENY_BASE).toContain("DROP TABLE *");
    });

    it("has at least 20 entries", () => {
      expect(HARD_DENY_BASE.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe("strict preset", () => {
    it("has empty allowlist (deny-by-default)", () => {
      expect(STRICT_PRESET.allowlist).toHaveLength(0);
    });

    it("has HARD_DENY_BASE as hardDeny", () => {
      expect(STRICT_PRESET.hardDeny).toEqual(HARD_DENY_BASE);
    });

    it("has askMode always", () => {
      expect(STRICT_PRESET.askMode).toBe("always");
    });
  });

  describe("balanced preset", () => {
    it("contains git status in allowlist", () => {
      expect(BALANCED_PRESET.allowlist).toContain("git status");
    });

    it("contains pnpm test in allowlist", () => {
      expect(BALANCED_PRESET.allowlist).toContain("pnpm test");
    });

    it("has HARD_DENY_BASE as hardDeny", () => {
      expect(BALANCED_PRESET.hardDeny).toEqual(HARD_DENY_BASE);
    });

    it("has askMode on-miss", () => {
      expect(BALANCED_PRESET.askMode).toBe("on-miss");
    });

    it("does NOT contain git add (mutating)", () => {
      expect(BALANCED_PRESET.allowlist).not.toContain("git add");
    });
  });

  describe("open preset", () => {
    it("contains all balanced allowlist entries", () => {
      for (const entry of BALANCED_PRESET.allowlist) {
        expect(OPEN_PRESET.allowlist).toContain(entry);
      }
    });

    it("contains git add * (write-ish)", () => {
      expect(OPEN_PRESET.allowlist).toContain("git add *");
    });

    it("contains pnpm install", () => {
      expect(OPEN_PRESET.allowlist).toContain("pnpm install");
    });

    it("has HARD_DENY_BASE as hardDeny", () => {
      expect(OPEN_PRESET.hardDeny).toEqual(HARD_DENY_BASE);
    });

    it("has askMode off", () => {
      expect(OPEN_PRESET.askMode).toBe("off");
    });
  });

  describe("buildPresetPolicy", () => {
    it("builds strict policy with preset field", () => {
      const p = buildPresetPolicy("strict");
      expect(p.preset).toBe("strict");
      expect(p.allowlist).toHaveLength(0);
      expect(p.askMode).toBe("always");
    });

    it("builds balanced policy with preset field", () => {
      const p = buildPresetPolicy("balanced");
      expect(p.preset).toBe("balanced");
      expect(p.askMode).toBe("on-miss");
    });

    it("builds open policy with preset field", () => {
      const p = buildPresetPolicy("open");
      expect(p.preset).toBe("open");
      expect(p.askMode).toBe("off");
    });

    it("all presets include HARD_DENY_BASE", () => {
      for (const preset of ["open", "balanced", "strict"] as const) {
        const p = buildPresetPolicy(preset);
        for (const deny of HARD_DENY_BASE) {
          expect(p.hardDeny).toContain(deny);
        }
      }
    });
  });
});
