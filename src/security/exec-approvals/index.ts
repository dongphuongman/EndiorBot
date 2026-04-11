/**
 * Exec-Approvals Public Surface
 *
 * LOCKED exports per M1-exec-policy-design.md §2.2:
 *   - checkCommand
 *   - setPreset, getPreset
 *   - getEffectivePolicy
 *   - readAuditTail
 *   - Types: Preset, EffectivePolicy, PolicyDecision, PolicyContext, ExecPolicyAuditRecord
 *
 * Cluster-internal modules (allowlist-pattern, presets, prompt) are NOT re-exported.
 * Enforced by src/security/exec-approvals/__tests__/public-surface.test.ts.
 *
 * @module security/exec-approvals
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL, M1-exec-policy-design.md §2.2
 * @sprint 132
 */

export { checkCommand } from "./check.js";
export { setPreset, getPreset } from "./store.js";
export { getEffectivePolicy } from "./effective-policy.js";
export { readAuditTail } from "./audit.js";
export type {
  Preset,
  EffectivePolicy,
  PolicyDecision,
  PolicyContext,
  ExecPolicyAuditRecord,
} from "./types.js";
