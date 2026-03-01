# EndiorBot

> **SDLC Control Plane + Agent Orchestrator** — AI assistant that answers in <30s instead of 30-60 min

EndiorBot is a personal AI power tool for solo developers working on enterprise-scale projects (~1M LOC).
It integrates with Claude Code as an Agent Orchestrator, enabling @agent invocations with SDLC governance.

**Identity**: SDLC Control Plane + Agent Orchestrator for Claude Code workflow (not a platform, not an SDLC enforcer)

## Quick Start

```bash
# Install
pnpm install && pnpm build

# Project Setup (Sprint 61)
endiorbot init                              # Initialize SDLC structure
endiorbot init --tier STANDARD             # Specify tier
endiorbot compliance check                  # Verify SDLC compliance
endiorbot compliance score                  # Quick compliance score

# Agent Orchestration (Sprint 55)
endiorbot @pm "plan payment gateway"        # PM agent → structured plan
endiorbot @coder --patch "fix auth bug"     # Coder agent → applies patch
endiorbot @consult "Redis vs PostgreSQL?"   # Multi-model consultation

# SDLC Control Plane (Sprint 56)
endiorbot gate recommend G2                 # Show gate recommendation
endiorbot gate confirm G2 --confirm         # Human confirmation (invariant)
endiorbot evidence add ./ADR.md --gate G2 --type adr  # Attach evidence
endiorbot context inject                    # Generate context for Claude Code
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot CLI                                │
│                                                                 │
│   @agent → Orchestration → Claude Code → Patch/Interactive      │
│                                                                 │
│   ┌──────────────────────────────────────────────────────┐      │
│   │              Agent Orchestration Layer               │      │
│   │  @pm → @architect → @coder → @reviewer → @tester     │      │
│   │  (READ mode)  (READ)    (PATCH)   (READ)   (READ)    │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │   Claude    │  │   GPT-4o    │  │   Gemini    │            │
│   │  (Primary)  │  │ (Critique)  │  │  (Review)   │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│   Brain: L4 Mental Models → L3 Structures → L2 Patterns        │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features (Sprint 55-56)

### Agent Orchestration (Sprint 55)

| Command | Mode | Description |
|---------|------|-------------|
| `endiorbot @pm "task"` | READ | Planning, requirements analysis |
| `endiorbot @architect "task"` | READ | Design decisions, ADRs |
| `endiorbot @coder --patch "task"` | PATCH | Code generation, applies patch |
| `endiorbot @reviewer "task"` | READ | Code review, suggestions |
| `endiorbot @consult "query"` | READ | Multi-model consultation |

### SDLC Control Plane (Sprint 56)

| Command | Description |
|---------|-------------|
| `endiorbot gate recommend G2` | Show gate recommendation (read-only) |
| `endiorbot gate confirm G2 --confirm` | Human confirmation (invariant: Agent ≠ Authority) |
| `endiorbot evidence list` | List evidence for current project |
| `endiorbot evidence add <uri> --gate G2 --type adr` | Attach evidence to gate |
| `endiorbot evidence verify` | Verify all evidence still valid |
| `endiorbot context status` | Show Brain layers and token budget |
| `endiorbot context inject` | Generate context for Claude Code |
| `endiorbot context search "query"` | RAG search across Brain layers |

### Other Features

| Feature | Command | Status |
|---------|---------|--------|
| 3-Model Consultation | `endiorbot consult` | ✅ Implemented |
| Gate Status | `endiorbot gate status` | ✅ Implemented |
| Project Switch | `endiorbot switch` | ✅ Implemented |
| Brain L4 Injection | Auto at session start | ✅ Implemented |

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

## Roadmap (Sprint 57-62)

| Sprint | Focus | Status |
|--------|-------|--------|
| 57 | OTT Agent Integration (Telegram/Zalo) | Planned |
| 58 | Production Hardening & Desktop App | Planned |
| 59 | Cross-Project Workflows & SE4H Roles | Planned |
| 60 | Performance & Polish | Planned |
| 61 | Project Setup (`init`, `compliance`) | ✅ Complete |
| 62 | v1.0 Stabilization | 🎯 In Progress |

## Documentation

- [Master Plan v3.1](./docs/00-foundation/master-plan.md) - Identity & full roadmap
- [IDENTITY.md](./IDENTITY.md) - Who am I
- [CLAUDE.md](./CLAUDE.md) - Claude Code integration
- [Sprint 56-60 Plan](./docs/04-build/sprints/SPRINT-56-60-PLAN.md) - Current sprint plan

## Development

```bash
pnpm dev          # Watch mode
pnpm build        # Build TypeScript
pnpm test         # Run tests (810+ passing)
pnpm lint         # Check style
```

## Invariants

```
1. THIN CLIENT PATTERN: Commands call ./endiorbot.mjs core
2. STDIN JSON FOR HOOKS: Hooks receive JSON via stdin
3. ENDIORBOT SOUL = GOVERNANCE: EndiorBot decides WHAT, Claude Code executes HOW
4. AGENT ≠ AUTHORITY: EndiorBot RECOMMENDS, CEO CONFIRMS
```

## Links

- **Website:** https://endiorbot.nqh-internal.example
- **Repository:** https://github.com/Minh-Tam-Solution/EndiorBot

## License

UNLICENSED - Private repository

---

*EndiorBot v3.1 | SDLC Control Plane + Agent Orchestrator | SDLC Framework v6.1.1*
