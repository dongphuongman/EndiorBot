# Contributing to EndiorBot

Thanks for your interest in contributing! EndiorBot is a personal AI assistant for builders with SDLC governance.

## Getting Started

```bash
# Clone and install
git clone https://github.com/Minh-Tam-Solution/EndiorBot.git
cd EndiorBot
pnpm install

# Build and test
pnpm build
pnpm test       # 7,601+ tests

# Watch mode
pnpm dev
```

## Requirements

- Node.js >= 20
- pnpm (via `corepack enable`)
- An AI API key (OpenAI or Gemini recommended)

## Project Structure

```
src/
  agents/        # Agent orchestration (ChannelRouter, SOUL loader, teams)
  bridge/        # Claude Code Bridge (tmux sessions, security, intelligence)
  bus/           # Message bus (EventEmitter, debounce, dedup)
  channels/      # OTT adapters (Telegram, Zalo)
  cli/           # CLI commands (32 commands: init, serve, chat, plan, bootstrap, ...)
  commands/      # Unified command handlers (shared by CLI + OTT)
  config/        # Configuration, feature flags, provider/model constants
  gateway/       # HTTP/WS server, ingress routing
  memory/        # ClawVault memory (fact store, memory policy)
  mtclaw/        # Cross-system agent communication (MCP bridge)
  providers/     # AI model providers (OpenAI, Gemini, Anthropic, Ollama)
  rl/            # Reinforcement learning feedback capture
  sdlc/          # Gate engine, compliance, scaffold, vibecoding index
  security/      # Input sanitizer, output redactor, permission audit
  sessions/      # Session state machine, checkpoints, autonomous manager

tests/           # Mirrors src/ structure (7,601+ tests)
docs/            # 10-stage SDLC documentation (00-foundation → 09-govern)
```

## Code Style

- TypeScript strict mode (no `any`)
- Prefer `const` over `let`
- Use template literals
- Document public APIs with JSDoc
- Conventional commits: `feat(scope): message`, `fix(scope): message`

## Testing

```bash
pnpm test                 # Full suite (7,601+ tests)
pnpm build                # TypeScript build (must be clean)
npx vitest run tests/path # Run specific test file
```

- All new code must include tests
- Tests use Vitest
- Run both `pnpm build && pnpm test` before submitting

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `pnpm build && pnpm test` — all must pass
4. Submit a PR with a clear description
5. Include which SDLC stage is affected (if applicable)

## Key Architecture Decisions

EndiorBot's architecture is documented in ADRs under `docs/02-design/01-ADRs/`. Key ones:

- **ADR-001:** Multi-Model Orchestrator (OpenAI + Gemini + Ollama)
- **ADR-006:** Claude Code Bridge (tmux session management)
- **ADR-029:** Per-Chat Workspace Resolution
- **ADR-030:** 4-Channel OTT Architecture (Web, Telegram, Zalo, CLI)
- **ADR-037:** Polyglot Bootstrap (Docker, Node.js, Rust, Python)
- **ADR-043:** Interactive Chat Mode

## Developer Certificate of Origin (DCO)

All commits must include a `Signed-off-by` line:

```bash
git commit -s -m "feat: my change"
```

The DCO bot will verify all commits in your PR.

## Security

If you discover a security vulnerability, please report it via email to **security@endiorbot.dev** instead of opening a public issue. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
