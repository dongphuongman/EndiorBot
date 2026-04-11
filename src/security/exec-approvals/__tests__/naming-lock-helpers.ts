/**
 * Helpers for naming-lock test.
 *
 * These mirror the validation logic in exec-policy.ts without importing
 * the CLI command directly (to avoid Commander setup in unit tests).
 *
 * @module security/exec-approvals/__tests__/naming-lock-helpers
 * @sprint 132 M1
 */

import type { Preset } from "../types.js";

const VALID_PRESETS: Preset[] = ["open", "balanced", "strict"];

/**
 * Asserts that a string is a valid locked preset name.
 * Throws if the name is not in the locked set.
 */
export function assertValidPresetForTest(value: string): asserts value is Preset {
  if (!(VALID_PRESETS as string[]).includes(value)) {
    throw new Error(
      `Invalid preset "${value}". Valid values: open, balanced, strict. ` +
      `openclaw lineage names (yolo/cautious/deny-all) are code-comment-only per ADR-046.`
    );
  }
}
