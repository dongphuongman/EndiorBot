/**
 * Effective Policy Resolver
 *
 * Resolves the effective exec-policy by merging:
 *   1. Base preset definition (allowlist + hardDeny + askMode)
 *   2. User-added extra patterns from the persistent store
 *
 * Hard-deny always wins over allow (enforced in check.ts).
 *
 * @module security/exec-approvals/effective-policy
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL, M1-exec-policy-design.md §2.1
 * @sprint 132
 */

import type { EffectivePolicy } from "./types.js";
import { buildPresetPolicy } from "./presets.js";
import { readStore } from "./store.js";

/**
 * Get the current effective policy by merging preset + store overrides.
 *
 * User-added `extraAllowlist` entries are appended to the preset's allowlist.
 * User-added `extraHardDeny` entries are appended to the preset's hardDeny list.
 * This ensures store layering is additive; hard-deny wins in check.ts.
 */
export function getEffectivePolicy(): EffectivePolicy {
  const store = readStore();
  const base = buildPresetPolicy(store.preset);

  // Merge: user additions are appended, deduplication is not required
  // (matchesPattern() short-circuits on first match, duplicates are harmless)
  const allowlist = [...base.allowlist, ...store.extraAllowlist];
  const hardDeny = [...base.hardDeny, ...store.extraHardDeny];

  return {
    preset: store.preset,
    allowlist,
    hardDeny,
    askMode: base.askMode,
  };
}
