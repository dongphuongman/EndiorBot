# Sprint 125 — Permission Audit Trail + Prompt Cache Spike

**Date:** 2026-04-01
**Status:** PLANNED (CTO rescoped)
**Prerequisite:** Sprint 124 COMPLETE (7,505 tests, plan command + memory + write path fixed)
**Framework:** SDLC 6.2.1
**Authority:** PM + Architect — CTO 6.5/10 RESCOPED, CPO APPROVED with conditions
**ADRs:** ADR-041 (Permission Audit)

---

## CTO Rescope Decision

Original plan had T1 (prompt caching) + T2 (audit trail). CTO review found:
- **T1 deferred to Sprint 126:** Anthropic provider sends system as flat string, needs refactor to structured blocks. Savings ~25-30% (not ~50%). Effort 6-8h not 3-4h.
- **T2 approved:** Permission audit trail — 3-4h, reuse AuditLogger infrastructure.
- **T0 debt (resolved):** Sprint 124 write path already fixed (TTL + max-facts + fire-and-forget) in same session.

## CTO Conditions (binding)

1. **C1 — Sprint 124 write path debt:** ALREADY FIXED (ingress.ts: evictExpiredFacts + enforceMaxFacts + void async)
2. **C2 — Defer T1 to Sprint 126** with proper technical design
3. **C3 — T2 reuse AuditLogger infra** — no parallel JSONL writer
4. **C4 — Correct ADR-040 savings** to ~25-30%
5. **C5 — T1-prep spike** must identify exact system message construction point

## CPO Conditions (binding)

1. **Only `/audit permissions [--limit N]`** in Sprint 125 — no generic `/audit`
2. **Retention policy:** 5MB max → rotate → 3-month archive
3. **Token savings metric** for when T1 ships (Sprint 126)

---

## Scope (Revised)

| Track | What | ADR | Est. |
|-------|------|-----|------|
| T0 | Verify Sprint 124 write path debt resolved | — | 0h (already done) |
| T2 | Permission audit trail + `/audit permissions` command | ADR-041 | 3-4h |
| T1-prep | Spike: document system message flow, identify prompt cache refactor scope | ADR-040 prep | 1-2h |

**Total: 4-6h**

### OUT OF SCOPE (deferred to Sprint 126)

| Item | Why |
|------|-----|
| Prompt caching implementation (ADR-040) | CTO C2: provider needs flat→structured refactor, 6-8h |
| Generic `/audit` taxonomy | CPO: only `/audit permissions` until taxonomy defined |
| Context-builder section caching | Sprint 127 per roadmap |

---

## Track 2: Permission Audit Trail (ADR-041)

### Step 1: Add `decisionReason` to RiskClassification

```typescript
// risk-classifier.ts — extend RiskClassification
decisionReason?: {
  type: "rule" | "risk-level" | "hook" | "user" | "auto";
  detail: string;
};
```

### Step 2: Reuse AuditLogger for permission logging (CTO C3)

**DO NOT create new JSONL writer.** Reuse existing `src/bridge/security/bridge-audit.ts`:

```typescript
// Extend AuditLogger with permission-specific entry type
auditLogger.logEntry({
  type: "permission_decision",
  tool: toolName,
  decision: "allow" | "deny" | "confirm",
  reason: { type: "risk-level", detail: "MEDIUM" },
  agent: agentRole,
  timestamp: new Date().toISOString(),
});
```

### Step 3: `/audit permissions` OTT command

```
/audit permissions
→ Last 10 permission decisions:
  1. ✅ Bash (LOW) — auto: read-only — 10:00:00
  2. ⚠️ Edit (MEDIUM) — risk-level: MEDIUM, confirmed — 10:00:05
```

### Files

| Action | File |
|--------|------|
| MODIFY | `src/agents/safety/risk-classifier.ts` — add `decisionReason` |
| MODIFY | `src/bridge/security/bridge-audit.ts` — add permission entry type (CTO C3) |
| CREATE | `src/commands/handlers/audit-commands.ts` — `/audit permissions` handler |
| MODIFY | `src/commands/index.ts` — register command |

### Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | Every `classify()` populates `decisionReason` | Unit test |
| AC2 | Permission decisions logged via AuditLogger (not separate writer) | CTO C3 verified |
| AC3 | `/audit permissions` returns last 10 decisions | OTT test |
| AC4 | Audit log does NOT contain full command content | Privacy test |
| AC5 | Log rotation at 5MB | Rotation test |

---

## Track T1-prep: Prompt Cache Spike

**Output:** [`docs/02-design/spike-prompt-caching.md`](../../02-design/spike-prompt-caching.md) — document (NOT code) that identifies:
1. WHERE system message is constructed in `anthropic-provider.ts`
2. Current format: flat string vs structured blocks
3. What refactoring is needed for `cache_control` support
4. Whether `anthropic-version: 2023-06-01` beta header is needed
5. Estimated effort for Sprint 126

**File:** `docs/02-design/spike-prompt-caching.md` (research output)

---

## Execution Order

```
Sprint 125 (4-6h):
├── T0: Verify write path debt (already fixed)               [0h]
├── T2: Permission audit trail                                [3-4h]
│   ├── risk-classifier.ts: decisionReason
│   ├── bridge-audit.ts: permission entry type (CTO C3)
│   ├── audit-commands.ts: /audit permissions handler
│   └── Tests: classify + audit log + OTT command
├── T1-prep: Spike document                                   [1-2h]
│   └── docs/02-design/spike-prompt-caching.md
├── Build + full test suite
└── Update ADR-040 savings to ~25-30% (CTO C4)
```

---

## Verification

```bash
# T2: Permission audit
pnpm vitest run tests/security/ tests/agents/safety/
# Verify: decisionReason populated, audit entries logged

# OTT command
# /audit permissions → last 10 decisions shown

# T1-prep
cat docs/02-design/spike-prompt-caching.md
# Verify: system message construction point identified

# Full suite
pnpm build && pnpm test  # 7,505+ tests
```
