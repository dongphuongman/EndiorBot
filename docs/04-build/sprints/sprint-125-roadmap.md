# Sprint 125+ Roadmap — Learned from Claude Code Architecture Research

**Date:** 2026-04-03 (updated)
**Status:** ROADMAP (updated with actuals)
**Framework:** SDLC 6.2.1
**Authority:** PM — based on ADR-039 research findings
**Source:** Architecture patterns observed from public specs + clean-room implementations (NOT leaked code)

---

## Context

Research into Claude Code architecture (via public specs, clean-room Rust reimplementation, and Python port) confirmed EndiorBot's architecture is **already aligned** with mature agent harnesses on 4/5 key patterns. CTO scored 8/10 on ADR-039.

**Validation:** EndiorBot independently built the same patterns:
- ✅ Layered permissions (RiskClassifier 4-tier)
- ✅ Tool registry (CommandDispatcher + PHASE_1_WHITELIST)
- ✅ Context isolation (SessionIntelligenceEnvelope 3-layer)
- ✅ Spec-first development (SDLC gate engine + ADR process)

**One pattern worth adopting:** Anthropic `cache_control` breakpoints for immutable SOUL/preamble — reduces token costs on repeated sessions. Plus 3 workflow improvements from the research.

---

## Sprint 125: Prompt Caching + Permission Audit Trail

**Priority:** HIGH — immediate cost savings + governance improvement
**Effort:** 6-8h

### T1: Anthropic Prompt Cache Breakpoints (3-4h)

**Pattern learned:** Claude Code marks immutable system prompt sections with `cache_control: { type: "ephemeral" }` so Anthropic API caches them across turns. EndiorBot sends SOUL + PREAMBLE + Brain every turn but never marks them cacheable.

**What to build:**
- Modify `SoulLoader` — mark SOUL content block with `cache_control` header
- Modify `anthropic-provider.ts` — inject `cache_control` on immutable system blocks
- Only for Anthropic provider (OpenAI/Gemini handle caching differently)
- `context-builder.ts` section caching deferred to Sprint 127 (separate concern)
- Expected savings: ~50% input tokens on turns 2+ (SOUL ~300 tokens cached)

**Files:**
- MODIFY: `src/bridge/intelligence/soul-loader.ts` — add cache metadata to SoulLoadResult
- MODIFY: `src/providers/anthropic/anthropic-provider.ts` — inject `cache_control` in system message blocks
- No behavior change — purely cost optimization

### T2: Permission Decision Audit Trail (3-4h)

**Pattern learned:** Claude Code tracks WHY every permission decision was made (rule, hook, classifier, user approval). EndiorBot's RiskClassifier returns risk level but doesn't log the decision chain.

**What to build:**
- Add `decisionReason` field to `RiskClassification` result
- Log every permission decision: tool_name, decision (allow/deny/confirm), source (rule/risk-level/hook/user), timestamp
- Store in `~/.endiorbot/audit/permissions.jsonl` (append-only)
- Surface via `/audit permissions` OTT command

**Files:**
- MODIFY: `src/agents/safety/risk-classifier.ts` — add `decisionReason` to classification
- CREATE: `src/security/permission-audit.ts` — JSONL logger
- MODIFY: `src/commands/index.ts` — register `/audit` OTT command

---

## Sprint 126: Enhanced Hook System

**Priority:** MEDIUM — extensibility for CEO customization
**Effort:** 8-10h

### T1: PostToolUse Hook Enhancement (4-5h)

**Pattern learned:** Claude Code's PostToolUse hooks receive full tool output + metadata, can annotate conversation. EndiorBot's current `post-tool-use.sh` only runs lint + tsc — no access to tool output.

**What to build:**
- Pass tool output summary (first 200 chars) to PostToolUse hook via stdin JSON
- Add `hookSpecificOutput` field — hook can inject text into conversation
- Support hook output modes: `shown_to_model` | `shown_to_user_only` | `hidden`
- Use for: auto-quality feedback, observation capture, custom metrics

**Files:**
- MODIFY: `.claude/hooks/post-tool-use.sh` — accept extended JSON input
- MODIFY: `src/bridge/hooks/hook-handler.ts` — pass tool output + parse hook response
- CREATE: `.claude/hooks/schemas/post-tool-use.schema.json` — document contract

### T2: Hook-Based Auto-Approval (4-5h)

**Pattern learned:** Claude Code allows hooks to auto-approve tool usage (return `allow` from preToolUse) without prompting CEO. EndiorBot's preToolUse hook can only block (exit 2) or warn (exit 1).

**What to build:**
- PreToolUse hook returns JSON `{ "decision": "allow" | "deny" | "ask" }`
- `allow` → skip CEO prompt, proceed directly
- `deny` → block with reason shown to model
- `ask` → default behavior (prompt CEO)
- Use for: auto-approve read-only tools, auto-approve in specific directories

**Files:**
- MODIFY: `.claude/hooks/pre-tool-use.sh` — return structured decision
- MODIFY: `src/bridge/hooks/hook-handler.ts` — parse decision from hook output

---

## Sprint 127: Chat Mode (Phase 1) ← REPRIORITIZED by CEO

**Priority:** HIGH — CEO requested interactive chat with non-Claude models
**Effort:** 8-10h (Phase 1), 6-8h (Phase 2 in Sprint 128)
**ADR:** ADR-043
**Depends on:** Sprint 124b ✅ + Sprint 126 ✅

**What:** `endiorbot chat` — interactive REPL with OpenAI/Gemini/Ollama, project context, history accumulation, `/model` switching.

---

## Sprint 128: Context Window Optimization + Chat Phase 2

**Priority:** MEDIUM — session longevity for chat mode + autonomous work
**Effort:** 8-10h

### T1: Conversation Compaction (5-6h)

**Pattern learned:** Claude Code implements automatic conversation compression when approaching context limits. EndiorBot has `compaction` config in tier defaults but no implementation.

**What to build:**
- Implement `CompactionEngine` — summarize old turns when context > 80% budget
- Strategy: keep last 5 turns verbatim, summarize older turns
- Preserve: tool results with file paths, error messages, decisions
- Discard: verbose code output, repeated information
- Trigger: automatic when context approaches 2K turn budget × accumulated turns

**Files:**
- CREATE: `src/sessions/compaction/compaction-engine.ts`
- MODIFY: `src/gateway/chat-handler.ts` — trigger compaction before query
- Config: `compaction.mode` already exists in tier defaults (safeguard/aggressive/none)

### T2: System Prompt Section Caching (3-4h)

**Pattern learned:** Claude Code caches system prompt sections with TTL. EndiorBot rebuilds system prompt every turn (SOUL + PREAMBLE + Brain + Context).

**What to build:**
- Cache assembled system prompt sections by SHA256 hash
- TTL: 5 minutes (SOUL/PREAMBLE rarely change mid-session)
- Invalidate on: settings change, project switch, manual reload
- Reduces per-turn overhead from ~50ms to ~1ms

**Files:**
- MODIFY: `src/bridge/intelligence/soul-loader.ts` — already has cache, extend with TTL
- MODIFY: `src/bridge/intelligence/context-builder.ts` — add section-level caching

---

## Sprint 128: Multi-Agent Coordinator

**Priority:** LOW (depends on 124b execution engine)
**Effort:** 12-15h

### T1: Coordinator Mode (8-10h)

**Pattern learned:** Claude Code has a "coordinator" agent that orchestrates sub-agents. EndiorBot has GoalDecomposer + MultiAgentDispatcher but they're not exposed as a unified coordinator.

**What to build:**
- Wire `AutonomousSessionManager.executeTaskWork()` to real providers (124b deferred item)
- Implement coordinator system prompt that manages sub-agent delegation
- CEO sees: unified progress view, can interrupt/steer any sub-agent
- Budget: coordinator has master budget, sub-agents get allocated portions

**Prerequisite:** Sprint 124b (wire executeTaskWork to real providers)

### T2: Sub-Agent Isolation (4-5h)

**Pattern learned:** Claude Code gives each sub-agent fresh AbortController + isolated file state. EndiorBot sub-agents currently share session state.

**What to build:**
- Per-agent FileStateCache (track what files changed during this agent's work)
- Independent cancellation (abort one sub-agent without killing coordinator)
- Session hooks scoped to agent (Map keyed by agentId, not global)

---

## Priority Summary

| Sprint | Focus | Effort | Impact | Prerequisite |
|--------|-------|--------|--------|-------------|
| **125** | Prompt caching + permission audit | 6-8h | Cost savings + governance | None |
| **126** | Enhanced hooks (output + auto-approve) | 8-10h | Extensibility | None |
| **127** | Context compaction + section caching | 8-10h | Longer sessions | None |
| **128** | Coordinator + sub-agent isolation | 12-15h | Full autonomy | 124b |

---

## Explicitly NOT Doing (per ADR-039)

| Item | Why |
|------|-----|
| Copy Claude Code's tool implementations | Legal risk — ADR-039 prohibits code copying |
| Implement Claude Code's Terminal UI (Ink/React) | EndiorBot is CLI + 4-channel OTT, not terminal app |
| Feature flags via GrowthBook | Over-engineering for solo developer tool |
| Classifier-based auto-approval (ML model) | EndiorBot uses rule-based RiskClassifier — sufficient |
| BUDDY companion pet system | Not aligned with CEO Power Tool identity |
| Voice mode | Not in scope for beta |
| Dream memory consolidation | ClawVault FactStore serves same purpose differently |

---

## Traceability

All patterns traced to **public specs** (claude-code/spec/) and **clean-room implementations** (claw-code Python port), NOT to leaked source code. Per ADR-039, no code was copied — only architectural ideas adopted through independent implementation.
