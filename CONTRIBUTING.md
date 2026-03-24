# Contributing to EndiorBot

Thanks for your interest in contributing to EndiorBot!

## Getting Started

```bash
# Clone and install
git clone https://github.com/Minh-Tam-Solution/EndiorBot.git
cd EndiorBot
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## Development Requirements

- Node.js >= 20
- pnpm (via corepack)

## Code Style

- TypeScript strict mode (no `any`)
- Prefer `const` over `let`
- Use template literals
- Document public APIs with JSDoc
- Conventional commits: `feat(scope): message`, `fix(scope): message`

## Testing

- All new code must include tests
- Run `pnpm test` before submitting
- Run `pnpm build` to verify TypeScript compiles cleanly
- Tests use Vitest

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `pnpm build && pnpm test` — all must pass
4. Submit a PR with a clear description
5. Include which SDLC stage is affected (if applicable)

## Project Structure

```
src/
  agents/       # Agent orchestration
  bridge/       # Claude Code Bridge
  bus/          # Message bus
  channels/     # OTT adapters (Telegram, Zalo)
  cli/          # CLI commands
  commands/     # Unified command handlers
  config/       # Configuration
  gateway/      # HTTP/WS server
  providers/    # AI model providers
  sdlc/         # Gate engine, compliance
  security/     # Sanitizer, rate limiter
  sessions/     # Session management
tests/          # Test files mirror src/ structure
```

## Developer Certificate of Origin (DCO)

All commits must include a `Signed-off-by` line certifying you wrote or have the right to submit the code.

**CLI users:**
```bash
git commit -s -m "feat: my change"
```

**GitHub UI users:**
Add the following line at the end of your commit message:
```
Signed-off-by: Your Name <your.email@example.com>
```

The DCO bot will verify all commits in your PR.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
