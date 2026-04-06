# ADR-043-A1: Claude Code as Primary Chat Provider

**Status:** ACCEPTED (CTO 8/10 APPROVED)
**Date:** 2026-04-06
**Sprint:** 130
**Amends:** ADR-043 (Chat Mode — Interactive Agent Session)
**SDLC Framework:** 6.2.1

---

## Context

CEO uses `endiorbot chat` daily. Original ADR-043 defaulted to OpenAI (GPT-5.4) as primary chat provider. CEO clarified: Claude Code (OAuth, Max subscription) should be primary — OpenAI/Gemini only for consult/research.

## Decision

**Provider priority change:**

| Priority | Before (ADR-043) | After (A1) |
|----------|-------------------|------------|
| 1 (default) | OpenAI (GPT-5.4) | **Claude Code (OAuth)** |
| 2 | Gemini | Gemini |
| 3 | Ollama | Ollama |
| 4 | Anthropic API | OpenAI |

## Implementation

### Claude Code Session Management

```
First turn:  claude -p --session-id <uuid> --model sonnet --append-system-prompt "..." "message"
Next turns:  claude -p --resume <uuid> --model sonnet "message"
/clear:      New session UUID (old session preserved in Claude Code)
/model:      Switch provider mid-session (Gemini/Ollama/OpenAI)
```

History is managed by Claude Code's native session persistence — EndiorBot does NOT accumulate turns or manage 40-turn cap for Claude Code sessions.

### Fallback

If `claude` CLI unavailable or OAuth expired → automatic fallback to Gemini/OpenAI with warning message.

### Cost Tracking

Parse `--output-format json` response for `cost_usd` field. Accumulate per session.

## Constraints (CTO Conditions)

1. ADR-043-A1 addendum (this document)
2. `/clear` starts new UUID, does NOT delete old sessions
3. Show elapsed time per turn (~3-5s, OAuth)
4. Fallback to Gemini/OpenAI if CLI unavailable
5. Existing `ClaudeCodeBridge` unchanged — new provider is separate class
6. 2K token/turn budget cannot be enforced at CLI level (documented)

## Consequences

### Positive
- CEO gets Claude (best model) in chat without API key
- Multi-turn handled natively by Claude Code sessions
- No token explosion from history accumulation
- Same OAuth subscription CEO already pays for

### Negative
- ~3-5s latency per turn (process spawn)
- No streaming in print mode
- Token budget enforcement delegated to Claude Code

---

*EndiorBot | SDLC Framework 6.2.1 — ADR-043-A1*
