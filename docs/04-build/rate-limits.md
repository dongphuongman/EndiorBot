# Rate Limits Documentation

**Sprint 49 Day 8 - Rate Limit Audit**
**Date**: 2026-02-25

## Overview

EndiorBot implements rate limiting at three tiers:
1. **Provider Level**: API request limits per provider
2. **Gateway Level**: Per-client authentication limits
3. **Budget Level**: Notification rate limiting

---

## Provider Rate Limits

### Current Configuration

| Provider | Limit | Window | Rationale |
|----------|-------|--------|-----------|
| GitHub Models | 15 req/min | 60s | Free tier constraint (Azure backend) |
| Anthropic | 50 req/min | 60s | Tier 1 conservative estimate |
| OpenAI | 60 req/min | 60s | Tier 1 conservative estimate |
| Google Gemini | 60 req/min | 60s | Free tier conservative estimate |
| Ollama (Local) | 200 req/min | 60s | Local server - high throughput |

### Source References

| Provider | Source | Notes |
|----------|--------|-------|
| GitHub Models | [GitHub Docs](https://docs.github.com/en/github-models) | Free tier: 15 req/min, 150 req/day |
| Anthropic | [Anthropic API Limits](https://docs.anthropic.com/claude/reference/rate-limits) | Tier 1: 60 RPM, varies by plan |
| OpenAI | [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits) | Tier 1: 60 RPM (free), varies by plan |
| Google Gemini | [Gemini API Limits](https://ai.google.dev/pricing) | Free: 60 RPM, 1500 RPD |
| Ollama | Local | No external API limit - bounded by hardware |

### Configuration Files

```
src/providers/anthropic/anthropic-provider.ts:73   → RateLimiter(60_000, 50)
src/providers/openai/index.ts:280                  → RateLimiter(60_000, 60)
src/providers/gemini/index.ts:290                  → RateLimiter(60_000, 60)
src/providers/ollama/index.ts:290                  → RateLimiter(60_000, 200)
src/providers/github/config.ts:80                  → DEFAULT_RATE_LIMIT = 15
```

---

## Gateway Rate Limits

### Authentication Rate Limiting

| Client Type | Limit | Window | Purpose |
|-------------|-------|--------|---------|
| Per Client | 100 req/min | 60s | Prevent DoS, fair resource allocation |

### Implementation

```typescript
// src/gateway/auth.ts:263
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 100)
}
```

**Notes:**
- Desktop app polling typically uses ~1 req/s = 60 req/min
- 100 req/min allows headroom for burst operations
- Sliding window algorithm with automatic reset

---

## Budget Circuit Breaker

### Threshold Configuration

| Threshold | Value | Action |
|-----------|-------|--------|
| Warning | 50% | Log warning |
| Critical | 80% | Notify CEO, prepare fallback |
| Limit | 100% | Pause operations, switch to NQH mode |

### Notification Rate Limiting

| Metric | Value | Rationale |
|--------|-------|-----------|
| Max notifications/hour | 4 | CPO requirement - prevent alert fatigue |
| Cool-down period | 30s | Minimum interval between notifications |
| Batch window | 5 min | Aggregate similar notifications |

### Task-Level Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max retries per task | 3 | Prevent infinite loops |
| Max cost per task | $0.50 | Cost protection |
| Max duration per task | 5 min | Time protection |
| Escalate on breach | true | CEO notification |

---

## Conversation Limits (8 Loop Guards)

Per ADR-056 (Dead Letter Prevention):

| Guard | Default | Priority | Purpose |
|-------|---------|----------|---------|
| `maxBudgetCents` | 1000 ($10) | 1 | Cost ceiling |
| `maxMessages` | 50 | 2 | Message count cap |
| `maxTokens` | 100,000 | 3 | Token budget |
| `maxToolCalls` | 20 | 4 | Tool calls per message |
| `maxRetriesPerStep` | 3 | 5 | Dead-letter threshold |
| `maxDiffSize` | 10,000 | 6 | Code diff lines |
| `maxDelegationDepth` | 1 | 7 | Sub-agent depth |
| `timeoutMinutes` | 30 | 8 | Session timeout |

---

## Adjusting Limits

### Per-Provider (Runtime)

Limits can be configured per provider instance:

```typescript
const provider = new AnthropicProvider({
  maxRequestsPerMinute: 100,  // Override default 50
});
```

### Config File

Edit `~/.endiorbot/endiorbot.json`:

```json
{
  "providers": {
    "anthropic": {
      "maxRequestsPerMinute": 100
    }
  }
}
```

### Environment Variables

Not directly exposed - use config file for persistent changes.

---

## Rate Limit Errors

When a rate limit is hit, providers return:

```typescript
ProviderError {
  code: "RATE_LIMIT",
  message: "Rate limit exceeded. Try again in X seconds.",
  retryable: true,
  retryAfter: <milliseconds>
}
```

Upstream retry logic will automatically:
1. Wait for the specified retry period
2. Retry up to 3 times with exponential backoff
3. Escalate to fallback provider if all retries fail

---

## Audit Notes

### Sprint 49 Day 8 Changes

1. **Ollama limit increased**: 30 → 200 req/min
   - Rationale: Local server has no external API limit
   - Bounded only by hardware throughput
   - 30 was unnecessarily restrictive

2. **Documentation created**: This file
   - All limits documented with sources
   - Configuration paths documented
   - Adjustment procedures documented

### Future Considerations

- [ ] Add `endiorbot config get rateLimit` command
- [ ] Auto-detect tier from API response headers
- [ ] Dynamic rate limit adjustment based on 429 responses
