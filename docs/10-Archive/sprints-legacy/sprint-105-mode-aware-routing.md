# Sprint 105: Mode-Aware Agent Routing

**Sprint Duration**: TBD
**Sprint Goal**: Allow `@agent` chat mentions to use PATCH mode when CEO explicitly requests writes
**Status**: COMPLETE
**Priority**: P2 (Power Feature)
**Framework**: SDLC 6.1.2
**Authority**: CTO 7.5/10 APPROVED WITH CONDITIONS (ADR-031), CPO APPROVED (C7-C9)
**Previous Sprint**: Sprint 104 — Bridge Risk Mode + /fix Naming
**Tests**: 22 new classifier + 2 mode happy-path (65/65 pass)
**ADR**: [ADR-031](../../02-design/01-ADRs/ADR-031-Channel-Command-Feature-Matrix.md)

---

## Background

After Sprint 104 closes GAP-002 (`--risk` flag) and GAP-004 (`/mode` state), one final gap remains:

- **GAP-003**: `callClaudeBridge()` in [channel-router.ts:448](src/agents/channel-router.ts#L448) always calls `this.bridge.invokeRead()`, never `invokePatch()`. Chat-based agent requests (e.g., "@coder fix the bug") can never write files.

This sprint enables PATCH mode via chat mentions for CEO power users, with conservative intent detection and mandatory per-request confirmation.

---

## System Architecture — Sprint 105 Changes

```
BEFORE (Sprint 104):
  @coder fix the auth bug in login.ts
    → ChannelRouter.route() → callClaudeBridge()
    → bridge.invokeRead()  ← ALWAYS READ
    → Returns text suggestion, no file changes

AFTER (Sprint 105):
  @coder fix the auth bug in login.ts
    → ChannelRouter.route() → callClaudeBridge()
    → PatchIntentClassifier.classify() → "PATCH" (high confidence)
    → CEO confirmation: "⚠️ @coder wants to modify files. Approve?"
    → CEO confirms → bridge.invokePatch()
    → Returns diff + applies changes
```

---

## Gap Closed

| Gap | Priority | Description |
|-----|----------|-------------|
| GAP-003 | P2 | Agent mentions always READ mode |

---

## Design Constraints (CPO C7-C9)

| # | Condition | Implementation |
|---|-----------|----------------|
| C7 | Narrow write intent classifier (conservative) | Only trigger PATCH for explicit patterns: "apply this fix", "write to file X", "create file Y", "refactor Z and apply". Ambiguous → READ. Log all decisions |
| C8 | Explicit per-request confirmation before invokePatch() | Show concise summary (files/areas, approximate size) and require explicit confirmation (button or phrase) for OTT/Web. Separate from `/mode`/`--risk` |
| C9 | Budget/scope guardrails | Hard cap on files/operations per @agent PATCH. Hard cap on runtime/token budget. Reuse T3 budget controls. Clear "partial apply" messaging if caps hit |

---

## Phase 1: Patch Intent Classifier

**New file:** `src/agents/intelligence/patch-intent-classifier.ts`

Conservative classifier that detects explicit write intent from natural language:

```typescript
export type PatchIntent = "READ" | "PATCH";

export interface PatchIntentResult {
  intent: PatchIntent;
  confidence: number;       // 0.0 - 1.0
  reason: string;           // Why this classification was made
  matchedPattern?: string;  // The pattern that triggered PATCH
}

/**
 * Classify whether a chat message implies file writes.
 * CPO C7: Conservative — only PATCH for high-signal patterns.
 */
export function classifyPatchIntent(message: string): PatchIntentResult;
```

### PATCH Triggers (high-signal only)

| Pattern | Example | Confidence |
|---------|---------|------------|
| "apply this fix" / "apply the changes" | "@coder apply this fix to login.ts" | 0.9 |
| "write to file" / "create file" | "@coder create a test file for auth" | 0.9 |
| "refactor X and apply" / "implement and save" | "@coder refactor auth module and apply" | 0.85 |
| "fix X in Y" (explicit file target) | "@coder fix the bug in src/auth.ts" | 0.8 |
| "update file" / "modify file" | "@coder update package.json" | 0.85 |

### READ (default for everything else)

| Pattern | Example | Reason |
|---------|---------|--------|
| Questions | "@coder how does auth work?" | Informational |
| Analysis | "@reviewer check this code" | Read-only analysis |
| Suggestions | "@coder suggest improvements" | Advisory, no writes |
| Ambiguous | "@coder fix the auth" | No explicit file target |

### Logging (CPO C7)

All classifications logged to bridge audit:

```typescript
getBridgeAuditLogger().log({
  event: "patch_intent_classification",
  details: { message: message.slice(0, 100), intent, confidence, reason },
});
```

---

## Phase 2: PATCH Routing in ChannelRouter

**File:** [channel-router.ts:431-469](src/agents/channel-router.ts#L431-L469)

Modify `callClaudeBridge()` to:
1. Classify intent
2. If PATCH: request CEO confirmation before proceeding
3. If READ (or PATCH declined): use existing `invokeRead()`

```typescript
private async callClaudeBridge(
  agent: string,
  task: string,
  history?: Array<{ role: string; content: string }>,
  workspace?: string,
): Promise<AIResult | null> {
  // ... existing setup ...

  // Sprint 105: Classify intent
  const intent = classifyPatchIntent(task);

  if (intent.intent === "PATCH" && intent.confidence >= 0.8) {
    // Request CEO confirmation (CPO C8)
    const confirmed = await this.requestPatchConfirmation(agent, task, intent, workspace);
    if (confirmed) {
      return this.executePatch(agent, task, systemPrompt, workspace, model);
    }
    // Declined → fall through to READ
  }

  // Default: invokeRead
  const response = await this.bridge.invokeRead({ ... });
  // ... existing code ...
}
```

---

## Phase 3: CEO Confirmation Flow (CPO C8)

Before `invokePatch()` from `@agent`:

```
⚠️ *@coder wants to modify files*

Task: "fix the auth bug in src/auth.ts"
Intent: PATCH (confidence: 0.85)
Scope: src/auth.ts (estimated 1-2 files)

/approve <id> — Allow file modifications
/reject <id> — Keep as read-only suggestion
(Auto-decline in 5 minutes if no response)
```

Reuse existing approval queue from Sprint 94 (`src/gateway/methods/approval.ts`).

### Confirmation TTL — 5 Minutes (CTO C1)

`requestPatchConfirmation()` MUST NOT hang indefinitely. Implement TTL:

```typescript
async function requestPatchConfirmation(
  agent: string,
  task: string,
  intent: PatchIntentResult,
  workspace?: string,
): Promise<boolean> {
  const approvalId = await approvalQueue.enqueue({ agent, task, intent });

  return new Promise<boolean>((resolve) => {
    // TTL: auto-decline after 5 minutes (CTO C1)
    const ttl = setTimeout(() => {
      approvalQueue.expire(approvalId);
      resolve(false);  // auto-decline → fall through to invokeRead()
    }, 5 * 60 * 1000);

    approvalQueue.onResolve(approvalId, (approved: boolean) => {
      clearTimeout(ttl);
      resolve(approved);
    });
  });
}
```

**Behavior on expiry:**
- Auto-decline → `invokePatch()` NOT called → fall through to `invokeRead()`
- No error shown to CEO (silent READ mode fallback)
- Audit log: `{ event: "patch_confirmation_expired", approvalId, agent, task }`

---

## Phase 4: Budget & Scope Guardrails (CPO C9)

Reuse Progressive Trust T3 budget controls:

| Guard | Limit | Source |
|-------|-------|--------|
| Max files per PATCH | 5 | System prompt instruction |
| Max operations per PATCH | 20 | New constant |
| Token budget per PATCH | $1.00 | Reuse T3 SessionBudget |
| Runtime timeout | 120s | Reuse claude-code-bridge timeout |

### File Cap Enforcement Mechanism (CTO C2)

**Decision: Inject system prompt instruction** (Approach 1 — Low complexity)

Rationale: `invokePatch()` runs a Claude Code session. We inject a system prompt constraint:

```
"You are operating under a scope cap: modify at most 5 files. If the task requires more than 5 file changes, apply the most critical 5 and return a summary of remaining changes as suggestions. Do not create new files beyond this limit."
```

Trade-off: Soft constraint — Claude may not comply in edge cases. Acceptable given:
- Conservative classifier already filters out broad refactors
- CEO saw confirmation message with estimated scope before approving
- Post-execution audit log shows actual files changed

**Post-execution audit** (safety net): After `invokePatch()` returns, log actual git diff file count. If > 5: flag in audit log as `scope_exceeded`, no rollback (rollback is complex and expensive). CEO alerted via response footer: "⚠️ Note: 7 files modified (limit 5). Review git diff."

If limits hit: return partial result with "Partial apply: reached file limit (5/5). Remaining changes shown as suggestions."

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| T1 | Create `patch-intent-classifier.ts` with conservative patterns | 3h |
| T2 | Add intent classification to `callClaudeBridge()` | 1h |
| T3 | CEO confirmation flow using existing approval queue (CPO C8) | 2h |
| T4 | `executePatch()` method in ChannelRouter (calls invokePatch) | 1h |
| T5 | Budget/scope guardrails — cap files, operations, tokens (CPO C9) | 1.5h |
| T6 | Audit logging for all classifications (CPO C7) | 0.5h |
| T7 | Tests: 10+ (classifier patterns, routing, confirmation, guards) | 3h |

**Total: ~12h**

---

## Test Plan

| # | Test | Assertion |
|---|------|-----------|
| 1 | "apply this fix to login.ts" → PATCH | intent = PATCH, confidence ≥ 0.8 |
| 2 | "how does auth work?" → READ | intent = READ |
| 3 | "fix the auth" (no file target) → READ | Ambiguous defaults to READ |
| 4 | "create a test file for auth" → PATCH | intent = PATCH |
| 5 | "suggest improvements to auth" → READ | Advisory, no writes |
| 6 | PATCH with confirmation → invokePatch called | Approved flow works |
| 7 | PATCH rejected → invokeRead called | Rejection falls back to READ |
| 8 | PATCH hits file limit → partial result | "Partial apply" message |
| 9 | All classifications logged | Audit log entry present |
| 10 | PATCH timeout → falls back to READ | Expired confirmation = READ |

---

## Definition of Done

- [ ] Patch intent classifier with conservative patterns (CPO C7)
- [ ] `callClaudeBridge()` routes PATCH intent to `invokePatch()` when confirmed
- [ ] CEO confirmation required before every `invokePatch()` from @agent (CPO C8)
- [ ] Confirmation reuses existing approval queue (Sprint 94 pattern)
- [ ] Budget/scope guardrails: max 5 files, $1 budget, 120s timeout (CPO C9)
- [ ] All classifications logged to bridge audit
- [ ] Ambiguous messages default to READ (never PATCH)
- [ ] 10+ new tests passing
- [ ] `pnpm build && pnpm test` passes

---

## Files Modified/Created

| # | File | Phase | Changes |
|---|------|-------|---------|
| 1 | `src/agents/intelligence/patch-intent-classifier.ts` | 1 | New: intent classifier |
| 2 | `src/agents/channel-router.ts` | 2,3,4 | PATCH routing, confirmation flow, executePatch |
| 3 | `src/agents/intelligence/patch-budget.ts` | 4 | New: budget/scope guard constants |
| 4 | `tests/agents/intelligence/patch-intent-classifier.test.ts` | 5 | New: 10+ tests |

---

## Reuse Points (DO NOT recreate)

| Component | Location | Reuse For |
|-----------|----------|-----------|
| invokePatch | `src/agents/invoke/claude-code-bridge.ts` | PATCH mode execution |
| Approval queue | `src/gateway/methods/approval.ts` | CEO confirmation flow |
| Bridge audit logger | `src/bridge/security/bridge-audit.ts` | Classification logging |
| SessionBudget | `src/models/budget.ts` | Token budget caps (T3) |
| classifyPatchIntent | New file | Conservative pattern matching |

---

## CTO Review Conditions

| # | Type | Condition | Resolution |
|---|------|-----------|------------|
| C1 | 🔴 Blocker | `requestPatchConfirmation()` hangs indefinitely without TTL | Phase 3 TTL spec: 5-min timeout → auto-decline → invokeRead() |
| C2 | 🟡 Spec | "max 5 files" cap has no implementation strategy | Phase 4: system prompt injection (soft cap) + post-execution audit log |

---

**Last Updated**: 2026-03-11 (by @pm — CTO C1/C2 addressed)
