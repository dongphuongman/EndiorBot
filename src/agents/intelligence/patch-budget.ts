/**
 * Patch Budget & Scope Constants (Sprint 105 — CPO C9)
 *
 * Budget guardrails for @agent PATCH mode execution.
 * Reuses Progressive Trust T3 budget controls.
 *
 * @module agents/intelligence/patch-budget
 * @version 1.0.0
 * @date 2026-03-11
 * @sprint 105
 * @authority ADR-031 AD-5, CPO C9
 */

// ============================================================================
// Budget Constants
// ============================================================================

/**
 * Max files per single @agent PATCH invocation.
 * Enforced via system prompt injection (soft cap).
 * Post-execution audit logs `scope_exceeded` if > MAX_PATCH_FILES.
 */
export const MAX_PATCH_FILES = 5;

/**
 * Max operations per PATCH (approximate).
 */
export const MAX_PATCH_OPERATIONS = 20;

/**
 * Token budget cap per PATCH in USD.
 * Reuses T3 SessionBudget ceiling.
 */
export const MAX_PATCH_BUDGET_USD = 1.0;

/**
 * Runtime timeout for a PATCH invocation in milliseconds.
 * Reuses claude-code-bridge timeout default.
 */
export const PATCH_TIMEOUT_MS = 120_000; // 120s

/**
 * Confirmation TTL before auto-decline (CTO C1).
 */
export const PATCH_CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// System prompt constraint (injected to enforce file cap)
// ============================================================================

/**
 * System prompt instruction for file scope cap.
 * Injected into the PATCH mode request (CTO C2: Approach 1 — soft cap via prompt).
 */
export const PATCH_SCOPE_SYSTEM_PROMPT = `
You are operating under a scope cap: modify at most ${MAX_PATCH_FILES} files.
If the task requires more than ${MAX_PATCH_FILES} file changes, apply the most critical ${MAX_PATCH_FILES} and return a summary of remaining changes as suggestions.
Do not create new files beyond this limit.
`.trim();
