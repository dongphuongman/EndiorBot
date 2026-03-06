# ADR-021: Local Ollama Router Architecture

**Status**: ACCEPTED
**Date**: 2026-03-05
**Sprint**: 78
**Authority**: CEO Power Tool — cost optimization

---

## Context

EndiorBot routes agent tasks using Sonnet (~$0.003/req). With 100+ routing
decisions per day, this adds meaningful cost. A lightweight local model running
via Ollama can handle routing classification at zero marginal cost.

Ollama `qwen3.5:9b` is confirmed running locally with 131K context, Vietnamese
support, and routing specialties.

## Decision

Introduce `LocalRouterAgent` that:

1. Uses `OllamaProvider` with `DEFAULT_ROUTER_MODEL = "qwen3.5:9b"`
2. Passes `metadata: { think: false }` to disable chain-of-thought (fast mode)
3. Falls back to Sonnet if Ollama is unreachable (< 2s timeout)
4. Emits `routerModel` in routing result for observability

## Architecture

```
CEO message
    │
    ▼
LocalRouterAgent (qwen3.5:9b local, ~100ms)
    │  ── Ollama down? ──▶  SonnetRouter (fallback, ~800ms)
    ▼
RoutingDecision { agent, confidence, routerModel }
    │
    ▼
Target Agent (coder/architect/pm/...)
```

## Cost Impact

| Before | After |
|--------|-------|
| Sonnet routing: ~$0.003/req | Local routing: $0/req |
| 100 req/day = $0.30/day | 100 req/day = $0 |
| Monthly: ~$9 | Monthly: $0 |

## Consequences

- **Positive**: Cost reduction, lower latency (~100ms vs ~800ms for routing)
- **Positive**: Privacy — routing decisions stay local
- **Negative**: Requires Ollama running locally (Sonnet fallback if not)
- **Neutral**: Routing quality expected to be equivalent for classification tasks

## Conversation Persistence (Track B)

Also in Sprint 78: `ConversationStore` per OTT chat-id (last 10 turns).
Enables multi-turn context in Telegram/Zalo without CEO repeating context.
`/clear` command resets conversation state.

## Gate Requirements

- G3: Tests covering router selection, fallback, latency
- G4: No regression in routing accuracy vs Sonnet baseline
