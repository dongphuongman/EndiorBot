# Sprint 126 — Prompt Caching + Tool Allowlist/Blocklist

**Date:** 2026-04-02
**Status:** PLANNED
**Prerequisite:** Sprint 125 COMPLETE (7,515 tests, permission audit + spike)
**Framework:** SDLC 6.2.1
**Authority:** PM + Architect — CTO 7/10 APPROVED (rescoped), CPO APPROVED
**ADRs:** ADR-040 (Prompt Caching), ADR-041 (Permission Audit — shipped Sprint 125)

---

## Context

Sprint 125 spike documented the exact system message construction point (`anthropic-provider.ts:146`) and confirmed CTO's 6-8h estimate for prompt caching. CTO also rescoped claw-code A1 adoption to minimal `toolAllowlist/toolBlocklist` fields on RiskConfig — no preset system, no new `/mode` command.

**Goal:** ~25-30% token savings on Anthropic turns 2+ (caching) + configurable tool access control (allowlist/blocklist).

**Baseline:** 7,515 tests passing, build clean.

---

## CTO Binding Conditions

1. **C1 — A2 DROPPED:** Provider init already lazy — no phased bootstrap needed
2. **C2 — A1 reduced:** `toolAllowlist/toolBlocklist` on RiskConfig only. No preset system, no new `/mode` command, no PermissionContext type
3. **C3 — Prompt caching priority:** Highest ROI — gets majority of capacity
4. **C4 — Sprint 125 C3 debt:** ALREADY FIXED (permission-audit.ts rewritten to wrap BridgeAuditLogger + 12 tests)

## CPO Conditions (resolved by CTO rescope)

- `/mode` conflict: **N/A** — no new command per CTO C2
- CLI/OTT parity: **N/A** — allowlist/blocklist is config, not command
- Hard blocklist: existing `dangerousCommandPatterns` in RiskClassifier handles args-level matching

---

## Scope

| Track | What | ADR | Est. |
|-------|------|-----|------|
| T1 | Prompt caching — structured system blocks + `cache_control` | ADR-040 | 6-8h |
| T2 | Tool allowlist/blocklist on RiskConfig + wire into classify() | — | 2-3h |

**Total: 8-11h**

---

## Track 1: Prompt Caching (ADR-040)

**Spike reference:** `docs/02-design/spike-prompt-caching.md`

### Step 1: Extend ChatMessage type (1h)

```typescript
// src/providers/types.ts
interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

// Extend ChatMessage.content to accept structured blocks
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | SystemBlock[];
}
```

### Step 2: Add cacheEligible to SoulLoadResult (30min)

```typescript
// src/bridge/intelligence/soul-loader.ts — SoulLoadResult
cacheEligible: boolean;  // true for file-loaded SOULs, false for fallback
```

Set in `load()`: `cacheEligible: true` for file path, `false` for fallback-inline.

### Step 3: Produce cacheable/mutable split in envelope-builder (1h)

```typescript
// src/bridge/intelligence/envelope-builder.ts
// Instead of single serialized string, produce:
{
  cacheableContent: string,  // PREAMBLE + SOUL + Brain L4 (immutable per session)
  mutableContent: string,    // Project context + memory facts (changes per turn)
}
```

### Step 4: Send structured blocks in Anthropic provider (2-3h)

```typescript
// src/providers/anthropic/anthropic-provider.ts — chat() method
// Current (line 146):
//   system: extractTextContent(systemMessage.content)  ← flat string
//
// After:
const systemContent = systemMessage.content;
const systemBlocks = typeof systemContent === "string"
  ? [{ type: "text" as const, text: systemContent }]
  : systemContent;

const body = {
  model: request.model,
  system: systemBlocks,  // ← structured blocks with cache_control
  messages: anthropicMessages,
};
```

### Step 5: Handle SystemBlock[] in other providers (1h)

```typescript
// src/providers/openai/index.ts — flatten to string (backward compat)
const systemText = typeof systemContent === "string"
  ? systemContent
  : systemContent.map(b => b.text).join("\n");
```

Same pattern for Gemini provider.

### Step 6: Wire system message construction in ChatHandler (1h)

```typescript
// src/gateway/chat-handler.ts — buildProjectContext()
// Return SystemBlock[] instead of string when Anthropic provider detected
```

### Files

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/providers/types.ts` | Add `SystemBlock` type, update `ChatMessage.content` |
| MODIFY | `src/bridge/intelligence/soul-loader.ts` | Add `cacheEligible` to SoulLoadResult |
| MODIFY | `src/bridge/intelligence/envelope-builder.ts` | Produce cacheable/mutable split |
| MODIFY | `src/providers/anthropic/anthropic-provider.ts` | Send structured blocks with `cache_control` |
| MODIFY | `src/providers/openai/index.ts` | Flatten SystemBlock[] to string |
| MODIFY | `src/gateway/chat-handler.ts` | Build structured system message |

### Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | `SystemBlock` type exists in providers/types.ts | Type check |
| AC2 | `SoulLoadResult.cacheEligible` true for file SOULs | Unit test |
| AC3 | Anthropic provider sends `system` as Array of blocks | Mock test: verify request body shape |
| AC4 | Cacheable blocks have `cache_control: { type: "ephemeral" }` | Mock test |
| AC5 | Non-Anthropic providers handle SystemBlock[] gracefully | OpenAI/Gemini tests pass |
| AC6 | `cache_read_input_tokens > 0` on Anthropic turn 2+ | Integration test or log inspection |

---

## Track 2: Tool Allowlist/Blocklist (CTO C2 — reduced A1)

### Step 1: Add fields to RiskConfig (30min)

```typescript
// src/agents/safety/risk-classifier.ts — RiskConfig
export interface RiskConfig {
  // ... existing fields ...

  /** Tools explicitly allowed (if set, only these tools pass) */
  toolAllowlist?: readonly string[];
  /** Tools explicitly blocked (checked before allowlist) */
  toolBlocklist?: readonly string[];
}
```

### Step 2: Wire into classify() (1h)

```typescript
// In classify() — after existing risk scoring, before return:

// Check blocklist first (always wins)
if (this.config.toolBlocklist?.some(t => toolName.toLowerCase().includes(t.toLowerCase()))) {
  result.allowed = false;
  result.decisionReason = { type: "rule", detail: `Blocked by toolBlocklist: ${toolName}` };
}

// Check allowlist (if set, tool must be in list)
if (this.config.toolAllowlist && !this.config.toolAllowlist.some(t => toolName.toLowerCase().includes(t.toLowerCase()))) {
  result.allowed = false;
  result.decisionReason = { type: "rule", detail: `Not in toolAllowlist: ${toolName}` };
}
```

### Step 3: Expose via .sdlc-config.json (30min)

```json
{
  "risk": {
    "toolAllowlist": ["Read", "Grep", "Glob"],
    "toolBlocklist": ["Deploy", "rm"]
  }
}
```

### Files

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/agents/safety/risk-classifier.ts` | Add `toolAllowlist/toolBlocklist` to RiskConfig + wire into classify() |

### Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC7 | `toolBlocklist` blocks matching tools | Unit test |
| AC8 | `toolAllowlist` only allows listed tools | Unit test |
| AC9 | Blocklist takes priority over allowlist | Unit test |
| AC10 | DecisionReason populated for blocklist/allowlist decisions | Unit test |
| AC11 | No new OTT command (`/mode` unchanged) | Verify no new handler registered |

---

## Execution Order

```
Sprint 126 (8-11h):
├── T1: Prompt Caching                                      [6-8h]
│   ├── Step 1: SystemBlock type in providers/types.ts
│   ├── Step 2: cacheEligible in SoulLoadResult
│   ├── Step 3: cacheable/mutable split in envelope-builder
│   ├── Step 4: Anthropic provider structured blocks
│   ├── Step 5: OpenAI/Gemini backward compat
│   ├── Step 6: ChatHandler system message construction
│   └── Tests: cache flag + provider mock + backward compat
│
├── T2: Tool Allowlist/Blocklist                             [2-3h]
│   ├── RiskConfig fields
│   ├── classify() integration
│   └── Tests: blocklist, allowlist, priority, decisionReason
│
├── Build + full test suite
└── Verify: cache_read_input_tokens > 0 on Anthropic turn 2+
```

---

## Verification

```bash
# T1: Prompt caching
pnpm vitest run tests/providers/anthropic/
pnpm vitest run tests/bridge/intelligence/
# Verify: structured blocks sent, cache_control present

# T2: Allowlist/blocklist
pnpm vitest run tests/agents/safety/risk-classifier.test.ts
# Verify: blocklist blocks, allowlist restricts, priority correct

# Full suite
pnpm build && pnpm test  # 7,515+ tests
```
