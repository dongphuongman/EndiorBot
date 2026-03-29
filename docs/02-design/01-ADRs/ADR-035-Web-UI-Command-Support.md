# ADR-035: Web UI Command Support

**Status**: ACCEPTED
**Date**: 2026-03-26
**Sprint**: 120 (proposed), 121 (implemented)
**Author**: @architect (AI)
**Decision Makers**: @pm, @architect, @cto
**Reviewers**: CTO APPROVED (Sprint 121 review)
**Implementation Note**: AD-1 (isCommand tag) simplified — `GatewayIngress.handleInbound()` already detects `/` prefix directly for all channels including Web, no client-side tag needed. AD-2 routing was already implemented. Sprint 121 focuses on AD-3 (Markdown rendering enhancement) and integration tests.

## Context

The Web UI channel (`src/gateway/web/index.html`) routes messages through `router.chat` → `GatewayIngress`, which handles `@agent` mentions and natural language. However, slash commands (`/help`, `/sessions`, `/gate`, etc.) that work in Telegram and Zalo are **not wired** in the Web UI path.

ADR-031 (Channel-Command-Feature-Matrix) documents the feature gap: Web supports chat and `@mention` but lacks the 30 OTT commands available on Telegram/Zalo.

## Decision

### AD-1: Tag-Based Command Detection via `router.chat`

The Web UI JavaScript detects messages starting with `/` and tags them with `isCommand: true` in the existing `router.chat` JSON-RPC payload. This reuses the existing method without adding a new JSON-RPC endpoint.

**Chosen over alternatives** (see below): a dedicated `router.command` method would add a parallel entry point, violating the single-pipeline invariant from ADR-030.

### AD-2: Gateway Ingress Command Routing

`GatewayIngress.handleInbound()` already normalizes all channels. Extend it to detect `/command` patterns from Web channel and route to `CommandDispatcher.dispatch()` — the same handler Telegram/Zalo use.

### AD-3: Response Formatting

Web UI receives Markdown-formatted responses (same as Telegram). The existing `msg.bot` CSS class renders plain text; add lightweight Markdown rendering (bold, code, lists) for command responses.

### AD-4: Command Autocomplete (Phase 2)

Optional enhancement: show command suggestions when user types `/` in the input field. Read available commands from `/api/status` or a dedicated endpoint.

## Alternatives Considered

### Alt-1: Dedicated `router.command` JSON-RPC Method (Rejected)

Add a separate `router.command` endpoint specifically for slash commands. **Rejected** because it creates a parallel entry point that bypasses the unified `GatewayIngress.handleInbound()` pipeline, violating the "ALL interfaces → Ingress" invariant from ADR-030 / Sprint 99.

### Alt-2: Client-Side Command Parsing in Web UI (Rejected)

Parse commands entirely in JavaScript and call handler-specific API endpoints. **Rejected** because it duplicates command routing logic on the client, creates maintenance burden when new commands are added, and breaks the thin-client pattern.

### Alt-3: WebSocket-Based Command Channel (Deferred)

Open a dedicated WebSocket connection for commands with streaming responses. **Deferred** to Phase 2 — the current HTTP JSON-RPC path is sufficient for the 30 existing commands, which all return single-response results.

## Architecture

```
Web UI (index.html)
  ↓ router.chat({ message: "/help", isCommand: true })
router-chat.ts
  ↓
GatewayIngress.handleInbound()
  ↓ detects /command prefix
CommandDispatcher.dispatch()
  ↓
handlers.ts / remote-handlers.ts
  ↓
{ success, response } → Web UI
```

## Consequences

- **Positive**: Web UI reaches command parity with Telegram/Zalo (30 commands)
- **Positive**: Zero new handler code — reuses existing `CommandDispatcher`
- **Positive**: Consistent UX across all channels (Invariant from ADR-030)
- **Negative**: Web Markdown rendering adds ~50 lines of JS
- **Risk**: Commands that return Telegram-specific formatting (inline keyboards) need graceful fallback

## Effort Estimate

- AD-1 + AD-2: 0.5d (command detection + ingress wiring)
- AD-3: 0.25d (Markdown rendering in Web UI)
- AD-4: 0.5d (autocomplete, Phase 2 — deferred)
- Tests: 0.25d

**Total Phase 1**: ~1d

## References

- ADR-030: Unified Command Architecture
- ADR-031: Channel-Command-Feature-Matrix
- Sprint 120: Continued Remediation (ISSUE-1)
