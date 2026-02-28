# Stage 03: Integration

**Project:** EndiorBot
**Version:** 2.0.0
**Date:** 2026-02-28
**Identity:** CEO Power Tool (LOCKED)

---

## Overview

This stage documents integration patterns between EndiorBot components and external systems.

## MVP Integrations (Tier 1)

| Integration | Priority | Status |
|-------------|----------|--------|
| Gemini API | P0 | Implemented |
| Anthropic API (Claude Opus) | P0 | Implemented |
| CLI → Gateway | P0 | Implemented |
| Web Channel | P1 | Implemented |
| Telegram (notify only) | P1 | In Progress |

## Pro Integrations (Tier 2)

| Integration | Priority | Status |
|-------------|----------|--------|
| Telegram bidirectional | P1 | Planned |
| Zalo OA | P1 | Planned |
| Magic Link approvals | P1 | Planned |

## Integration Documents

| Document | Description |
|----------|-------------|
| [Claude Code Integration](./claude-code-integration.md) | VSCode extension setup |
| [OTT Channels](../04-build/ott-channels.md) | Telegram/Zalo integration |

---

## API Provider Integration

### Gemini (Primary)

```typescript
// Provider: Google AI
// Model: gemini-2.0-flash
// Use Case: Primary model for all queries
// Cost: Free tier available

const gemini = new GeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash',
});
```

### Claude Opus (Backup)

```typescript
// Provider: Anthropic
// Model: claude-opus-4
// Use Case: Backup when Gemini fails, cross-validation
// Cost: Pay per token

const opus = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-opus-4',
});
```

---

## Channel Integration

### Web Channel (localhost:18790)

```
Browser → WebSocket → Gateway → ChatHandler → AI Router → Response
```

### Telegram Channel (notify only for MVP)

```
EndiorBot → Telegram Bot API → User
```

### Zalo Channel (notify only for MVP)

```
EndiorBot → Zalo OA API → User
```

---

## References

- [Master Plan v2.0](../00-foundation/master-plan.md)
- [Sprint 54 Plan](../04-build/sprints/sprint-54-ai-chat-integration.md)

---

*CEO Power Tool | SDLC Framework v6.1.1 - Stage 03: Integration*
*Identity: LOCKED (2026-02-28)*
