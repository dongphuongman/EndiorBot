# EndiorBot

> **CEO Power Tool** — AI assistant that answers in <30s instead of 30-60 min

EndiorBot is a personal AI power tool for solo developers working on enterprise-scale projects (~1M LOC).
It eliminates copy/paste between AI apps by querying 3 models and consolidating responses automatically.

**Identity**: CEO Tool (not a platform, not an SDLC enforcer)

## Quick Start

```bash
# Install
pnpm install && pnpm build

# MVP Commands
endiorbot consult "design payment gateway"  # 3-model consultation
endiorbot gate status G2                    # Read-only SDLC checklist
endiorbot switch bflow                      # Project context switch
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot CLI                                │
│                                                                 │
│   Ask → Context → 3 Models → Consolidate → Propose → Approve   │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │   Claude    │  │   o3-mini   │  │   Gemini    │            │
│   │  (Primary)  │  │ (Critique)  │  │  Thinking   │            │
│   │  Coding &   │  │  Reasoning  │  │ (Critique)  │            │
│   │   Docs      │  │  & Debate   │  │  Reasoning  │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│   Routing: Coding → Claude only | Research → All 3             │
└─────────────────────────────────────────────────────────────────┘
```

## MVP Features (Tier 1)

| Feature | Command | Status |
|---------|---------|--------|
| 3-Model Consultation | `endiorbot consult` | In Progress |
| Gate Status | `endiorbot gate status` | In Progress |
| Project Switch | `endiorbot switch` | Implemented |
| Brain L4 Injection | Auto at session start | In Progress |

## Brain (4-Layer Iceberg)

| Layer | Content | Inject When |
|-------|---------|-------------|
| L4 Mental Models | Decision heuristics | Session start |
| L3 Structures | Module maps | Project switch |
| L2 Patterns | Error signatures | On similar errors |
| L1 Events | Session logs | Never (too noisy) |

## Channels

| Channel | Status | Purpose |
|---------|--------|---------|
| Web (localhost:18790) | Active | Browser chat interface |
| Telegram (@Endior_bot) | Active | Mobile notifications |
| Zalo (Bot Endior) | Active | OTT messaging |

## Time Savings

| Task | Before | After | Savings |
|------|--------|-------|---------|
| Architecture decision | 30-60 min | <30s | 98% |
| Gate evaluation | 20 min | 1 min | 95% |
| Context switch | 5 min | <2s | 99% |

## What's NOT in MVP

- Desktop shell (Tier 3)
- Full multi-model 4+ (Tier 3)
- SDLC enforcement (Tier 3)
- Skills gateway (Tier 3)

## Documentation

- [Master Plan v2.0](./docs/00-foundation/master-plan.md) - Identity & roadmap
- [IDENTITY.md](./IDENTITY.md) - Who am I
- [CLAUDE.md](./CLAUDE.md) - Claude Code integration
- [Sprint 54](./docs/04-build/sprints/sprint-54-ai-chat-integration.md) - Current sprint

## Development

```bash
pnpm dev          # Watch mode
pnpm test         # Run tests (315 passing)
pnpm lint         # Check style
```

## Links

- **Website:** https://endiorbot.nqh-internal.example
- **Repository:** https://github.com/Minh-Tam-Solution/EndiorBot

## License

UNLICENSED - Private repository

---

*EndiorBot v2.0 | CEO Power Tool | SDLC Framework v6.1.1*
