# TS-008: Claude Code OAuth Integration

**Status:** ✅ IMPLEMENTED
**Date:** 2026-03-01
**Sprint:** 62 (Bugfix)
**Author:** @cto + @dev

---

## Overview

Integration of Claude Code CLI with EndiorBot's `consult` command using OAuth (Max 200 subscription) instead of API credits.

## Problem Statement

Users with Max 200 subscription cannot use Claude Code CLI via `--via-claude-code` option because:

1. **Credit check blocking**: CLI checks API credits even when OAuth is available
2. **API key priority**: `ANTHROPIC_API_KEY` env var causes CLI to use credits instead of OAuth
3. **stdin timeout**: Process waits indefinitely for stdin input
4. **Budget flag incompatibility**: `--max-budget-usd` only works with API credits, not OAuth quota

## Solution Architecture

### 1. Environment Variable Management

**Problem**: `ANTHROPIC_API_KEY` in `.env.local` causes Claude Code CLI to prefer API authentication over OAuth.

**Solution**: Explicitly unset API key when spawning Claude Code process.

```typescript
const claude = spawn(claudePath, args, {
  env: {
    ...process.env,
    CLAUDECODE: undefined,        // Allow nested invocation
    ANTHROPIC_API_KEY: undefined, // Force OAuth usage
  },
});
```

**Rationale**:
- OAuth (Max 200) uses quota-based limits (%)
- API credits use USD-based limits ($)
- Unsetting API key forces Claude Code to fall back to OAuth session

### 2. stdin Handling

**Problem**: `stdio: ["pipe", "pipe", "pipe"]` causes process to wait for stdin input.

**Solution**: Use `stdio: ["ignore", "pipe", "pipe"]` to ignore stdin.

```typescript
spawn(claudePath, args, {
  stdio: ["ignore", "pipe", "pipe"], // stdin=ignore
});
```

**Impact**: Process starts immediately without waiting for stdin closure.

### 3. OAuth-Compatible Flags

**Problem**: `--max-budget-usd 0.50` only works with API key authentication.

**Solution**: Remove budget flag for OAuth authentication.

```typescript
// ❌ BEFORE (API credits only)
args.push("--max-budget-usd", "0.50");

// ✅ AFTER (OAuth compatible)
// Note: Quota managed by Anthropic for Max 200 subscription
```

**Trade-off**: No explicit budget limit, but Max 200 has built-in weekly quota limits.

### 4. Session Check Removal

**Problem**: `process.env.CLAUDECODE` check prevents usage from Claude Code-spawned terminals.

**Solution**: Remove check since `-p --no-session-persistence` is safe.

```typescript
// ❌ BEFORE
if (process.env.CLAUDECODE) {
  console.error("Cannot use --via-claude-code inside Claude Code session");
  process.exit(1);
}

// ✅ AFTER
// Safe to use even if CLAUDECODE is set, because we use
// -p --no-session-persistence (non-interactive mode)
```

**Rationale**: Non-interactive mode doesn't share runtime resources with parent session.

---

## Implementation Details

### File Changes

**`src/agents/invoke/claude-code-bridge.ts`**

1. **buildArgs()**: Removed `--max-budget-usd` flag (line 467)
2. **invoke()**: Added `stdio: ["ignore", ...]` (line 355)
3. **invoke()**: Unset `ANTHROPIC_API_KEY` in spawn env (line 360)
4. **invoke()**: Enhanced error logging with stdout/stderr (line 417)

**`src/cli/commands/consult.ts`**

1. **Removed CLAUDECODE check** (line 292-296)
2. **Added comment** explaining OAuth safety (line 291)

### CLI Arguments

```bash
claude -p \
  --output-format text \
  --no-session-persistence \
  --model sonnet \
  --append-system-prompt "..." \
  "user prompt"
```

**Key flags:**
- `-p`: Print mode (non-interactive)
- `--no-session-persistence`: No session state saved
- `--model sonnet`: Cost-efficient model
- No `--max-budget-usd`: OAuth uses quota, not USD

---

## Usage

### Command

```bash
# Use Claude Code CLI (Max 200 subscription)
./endiorbot.mjs consult --via-claude-code "Context Drift là gì?"
```

### Expected Behavior

1. ✅ Uses OAuth authentication (Max 200 subscription)
2. ✅ No API credits consumed
3. ✅ Response in ~15-30 seconds
4. ✅ Quota tracked at claude.ai/settings/usage

### Output Example

```
🤖 Claude Code (Max 200 Subscription)
├─────────────────────────────────────────────────
│  Provider: Claude Code CLI
│  Duration: 19183ms
├─────────────────────────────────────────────────
│  📝 Response:
│     [Claude's response content]
├─────────────────────────────────────────────────
│  ✅ Using Max 200 subscription (no API credits used)
└─────────────────────────────────────────────────
```

---

## Testing

### Test Cases

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
| OAuth with quota available | ✅ Success | PASS |
| API key set in env | ✅ Unset, uses OAuth | PASS |
| From Claude Code terminal | ✅ Works (no nested check) | PASS |
| stdin timeout | ✅ No timeout (ignored) | PASS |
| Error logging | ✅ Shows stdout/stderr | PASS |

### Validation

```bash
# 1. Verify OAuth usage (no API credits deducted)
./endiorbot.mjs consult --via-claude-code "test"

# 2. Check quota at claude.ai/settings/usage
# → Should show increased usage %

# 3. Debug mode (see full command)
./endiorbot.mjs --debug consult --via-claude-code "test"
```

---

## Security Considerations

### API Key Management

1. **`.env.local` in `.gitignore`** ✅
   - API keys never committed to git
   - Local development only

2. **Unset in subprocess** ✅
   - `ANTHROPIC_API_KEY: undefined` in spawn env
   - Prevents accidental API usage

3. **OAuth preferred** ✅
   - No API key = OAuth authentication
   - Subscription quota managed by Anthropic

---

## Performance

### Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Response time | 15-30s | Varies by prompt complexity |
| Quota impact | ~0.5-2% | Per consultation (Max 200) |
| Timeout | 120s | Configurable via timeout param |

### Comparison: API vs OAuth

| Aspect | API Credits | OAuth (Max 200) |
|--------|-------------|-----------------|
| Cost unit | USD ($) | Quota (%) |
| Weekly limit | Based on credits | 100% weekly quota |
| Reset | When credits added | Every Friday 9:59 AM |
| Authentication | API key | OAuth session |
| Claude Code CLI | `--max-budget-usd` | No budget flag needed |

---

## Error Handling

### Common Errors

**1. "Credit balance is too low"**

**Cause**: API key still being used instead of OAuth
**Fix**: Verify `ANTHROPIC_API_KEY` is unset in spawn env

**2. "Timed out after 120s"**

**Cause**: stdin blocking (old: `stdio: ["pipe", ...]`)
**Fix**: Use `stdio: ["ignore", ...]` ✅

**3. "Cannot use --via-claude-code inside Claude Code session"**

**Cause**: Old CLAUDECODE check (removed)
**Fix**: Remove check, safe with `-p --no-session-persistence` ✅

---

## Future Improvements

### Potential Enhancements

1. **Auto-fallback to API credits**
   - If OAuth quota exhausted, try API credits
   - Requires `--max-budget-usd` flag re-introduction

2. **Quota tracking**
   - Cache quota % from claude.ai API
   - Warn when < 10% remaining

3. **Model selection**
   - Currently hardcoded `--model sonnet`
   - Could expose as `--claude-model` option

4. **Streaming support**
   - Use `--output-format stream-json`
   - Real-time response streaming

---

## References

- **Master Plan v4.2**: Sprint 55 - ClaudeCodeBridge
- **Claude Code CLI**: `claude --help`
- **OAuth Flow**: claude.ai/settings/usage
- **Sprint 62**: Bugfix implementation

---

## Changelog

**2026-03-01** - Initial implementation
- Unset `ANTHROPIC_API_KEY` in spawn env
- Remove `--max-budget-usd` flag
- Fix stdin timeout with `stdio: ["ignore", ...]`
- Remove CLAUDECODE session check
- Enhanced error logging (stdout/stderr)

---

*Technical Spec TS-008 | SDLC Framework v6.1.1*
