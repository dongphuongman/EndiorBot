# EndiorBot

[![CI](https://github.com/Minh-Tam-Solution/EndiorBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Minh-Tam-Solution/EndiorBot/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@dttai/endiorbot)](https://www.npmjs.com/package/@dttai/endiorbot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Beta:** APIs may change between releases. Not recommended for production use yet.

> **CEO Power Tool** — AI assistant that answers in <30s instead of 30-60 min

EndiorBot is a personal AI power tool for solo developers working on enterprise-scale projects.
It integrates with Claude Code as an Agent Orchestrator, enabling @agent invocations with SDLC governance across CLI, Web, Telegram, and Zalo channels.

**Identity**: CEO Power Tool (LOCKED) — not a platform, not an SDLC enforcer.

## Documentation

- **[SDLC stage index (00→09)](docs/README.md)** — per-stage READMEs and extended lifecycle (06–09)
- **[Product vision](docs/00-foundation/product-vision.md)** — CEO north star and autonomy levels (L1–L4)
- **[Stage × command spine](docs/00-foundation/stage-command-workflow-spine.md)** — stage alignment, atomic CLI/OTT/Web vs workflows, design→build→test traceability

Application development documentation under `docs/` is written in **English** (MTS SDLC 6.2.1); see the *Documentation language* note in [docs/README.md](docs/README.md).

## Prerequisites

- Node.js >= 20
- pnpm (via corepack: `corepack enable`)
- An AI API key (OpenAI or Gemini recommended; Anthropic optional)

> **Provider default change (Sprint 124a):** `endiorbot consult` now defaults to OpenAI (GPT-5.4) instead of Anthropic. Claude Code is used via OAuth bridge for development tasks, not via API key. Set `OPENAI_API_KEY` and/or `GOOGLE_API_KEY` in your `.env` file.

## Install

```bash
# Via npx (no install needed)
npx @dttai/endiorbot --help
npx @dttai/endiorbot init
npx @dttai/endiorbot serve

# Or install globally
npm install -g @dttai/endiorbot

# Or via Docker
docker run -p 18790:18790 endiorbot/endiorbot serve
```

## Quick Start

```bash
# Initialize SDLC structure
endiorbot init                              # Auto-detect tech stack
endiorbot init --tier STANDARD              # Specify tier
endiorbot compliance check                  # Verify SDLC compliance

# Unified Serve (Web + Telegram + Zalo)
endiorbot serve                             # Start all channels
endiorbot serve --no-zalo                   # Skip Zalo adapter

# Agent Orchestration (via CLI)
endiorbot @pm "plan payment gateway"        # PM agent
endiorbot @coder --patch "fix auth bug"     # Coder agent (PATCH mode)
endiorbot @consult "Redis vs PostgreSQL?"   # Multi-model consultation
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot Unified Serve                       │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Web    │  │ Telegram │  │   Zalo   │  │   CLI    │        │
│  │:18790/ws │  │  @bot    │  │ Bot API  │  │ endiorbot│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └──────────────┼───────────┬─┘             │              │
│                ┌─────▼─────┐     │               │              │
│                │ MessageBus│◄────┘               │              │
│                │ (debounce │                     │              │
│                │  + dedup) │                     │              │
│                └─────┬─────┘                     │              │
│                ┌─────▼──────────────────────┐    │              │
│                │     GatewayIngress         │◄───┘              │
│                │  /commands → Dispatcher    │                   │
│                │  @agents  → ChannelRouter  │                   │
│                └─────┬─────────────┬────────┘                   │
│                      │             │                            │
│          ┌───────────▼──┐   ┌──────▼──────┐                    │
│          │ CommandDisp. │   │ChannelRouter│                    │
│          │ (30 commands)│   │ Bridge+Cloud│                    │
│          └──────────────┘   └──────┬──────┘                    │
│                                    │                            │
│  ┌─────────────┐  ┌───────────┐  ┌▼────────────┐              │
│  │ Claude Code │  │  Gemini   │  │   Ollama    │              │
│  │  Bridge     │  │  2.5 Flash│  │ (local LLM) │              │
│  │ (Primary)   │  │ (Fallback)│  │ (Router)    │              │
│  └─────────────┘  └───────────┘  └─────────────┘              │
│                                                                  │
│  Per-Chat Workspace: /repos + /focus + resolveWorkspace()       │
│  SOUL Templates: 14 agents × tier-aware model selection          │
└─────────────────────────────────────────────────────────────────┘
```

## Channels

| Channel | Access | Purpose |
|---------|--------|---------|
| Web UI | `http://localhost:18790` | Browser chat interface |
| Telegram | `@Endior_bot` | Mobile OTT |
| Zalo | `Bot Endior` (zapps.me) | Mobile OTT (Vietnam) |
| CLI | `endiorbot @agent "task"` | Terminal |

### OTT Commands (Telegram / Zalo)

```
/link                           # Bind identity (required after restart)
/repos add myapp /path/to/repo  # Register a repo
/focus myapp                    # Set active repo for this chat
/where                          # Show current focus
@pm plan the next sprint        # Talk to PM agent
@coder fix the login bug        # Talk to Coder agent
/launch claude --as coder       # Launch Claude Code in tmux
/sessions                       # List active tmux sessions
/switch <sessionId>             # Switch active session
/help                           # Full command list (30 commands)
```

## Agent Orchestration

14 SOUL-based agents with tier-aware model selection:

| Agent | Category | Mode | Use Case |
|-------|----------|------|----------|
| `@pm` | executor | READ | Planning, requirements, sprints |
| `@architect` | executor | READ | Design decisions, ADRs |
| `@coder` | executor | PATCH | Code generation, bug fixes |
| `@reviewer` | executor | READ | Code review, quality audit |
| `@tester` | executor | READ | Test strategy, test writing |
| `@fullstack` | executor | PATCH | Full-stack implementation |
| `@devops` | executor | PATCH | CI/CD, infrastructure |
| `@pjm` | executor | READ | Project management |
| `@researcher` | executor | READ | Research, analysis |
| `@ceo` | advisor | READ | Strategic decisions |
| `@cto` | advisor | READ | Technical review |
| `@cpo` | advisor | READ | Product review |
| `@cso` | advisor | READ | Security review |
| `@assistant` | router | READ | General queries |

### Multi-Agent Routing

Messages with multiple @agents or complex tasks are automatically decomposed:
```
@pm @cto review the authentication module
→ GoalDecomposer splits task → MultiAgentDispatcher runs in parallel
```

## SDLC Framework

| Tier | Files | Stages | Agents |
|------|-------|--------|--------|
| LITE | 2 (CLAUDE.md, IDENTITY.md) | 4 | 3 |
| STANDARD | 3 (+AGENTS.md) | 7 | 6 |
| PROFESSIONAL | 4 (+USER.md) | 10 | 10 |
| ENTERPRISE | 6 (+TOOLS.md, HEARTBEAT.md) | 11 | 13 |

## Per-Chat Workspace

Different chats can focus on different repos simultaneously:
```
# Chat A (Telegram DM): focused on EndiorBot
/focus endiorbot
@pm check sprint status

# Chat B (Zalo): focused on openfang-auto-clip
/focus openfang
@coder fix the video parser
```

## Docker

```bash
# Build
docker build -t endiorbot .

# Run
docker run -p 18790:18790 \
  -e ANTHROPIC_API_KEY=your-key \
  endiorbot

# With env file
docker run -p 18790:18790 --env-file .env endiorbot
```

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Watch mode
pnpm build        # Build TypeScript
pnpm test         # Run tests (6,596+ passing)
pnpm lint         # Check style
pnpm lint:souls   # Validate 13 SOUL templates
```

## Invariants

```
1. THIN CLIENT PATTERN: Commands call ./endiorbot.mjs core
2. STDIN JSON FOR HOOKS: Hooks receive JSON via stdin
3. ENDIORBOT SOUL = GOVERNANCE: EndiorBot decides WHAT, Claude Code executes HOW
4. DEFAULT MODEL = SONNET: Opus only for explicit architecture decisions
```

## Documentation

- [IDENTITY.md](./IDENTITY.md) - Project identity
- [CLAUDE.md](./CLAUDE.md) - Claude Code integration
- [AGENTS.md](./AGENTS.md) - Agent guidelines
## Known Limitations (beta)

- Composio tool integration not bundled (install separately if needed)
- API surface may change between beta releases
- No SLA or production support guarantee
- Single-developer tested — community feedback welcome

## Links

- **Website:** https://endiorbot.nqh-internal.example
- **Repository:** https://github.com/Minh-Tam-Solution/EndiorBot

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)

---

*EndiorBot v0.1.0-beta.1 | CEO Power Tool | SDLC Framework v6.2.0*
