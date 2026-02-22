# EndiorBot

> Solo developer tool for enterprise-scale projects

EndiorBot automates SDLC workflow for solo developers working on enterprise-scale applications (~1M LOC).
It combines Claude Code capabilities with SDLC Framework automation and multi-model orchestration.

## Features

### Multi-Model Orchestrator
Query multiple AI models (Claude, GPT, Gemini, Mistral) in parallel and auto-consolidate expert opinions.
No more copy/paste between apps!

```bash
endiorbot consult "design payment gateway integration"
# → Queries all experts in parallel
# → Returns consolidated recommendation with consensus/disagreements
```

### SDLC Automation
- Auto gate evaluation (G0 → G4)
- Auto CRP/MRP/VCR generation
- Vibecoding Index calculation
- Evidence collection and archival

```bash
endiorbot gate status G2 AR-457
# → Shows checklist, evidence, and readiness
```

### Project Context Switching
Quick switch between multiple projects with preserved state.

```bash
endiorbot switch bflow    # Switch to Bflow (~1M LOC)
endiorbot switch nqh-bot  # Switch to NQH-Bot (~200K LOC)
```

## Quick Start

```bash
# Install
pnpm install

# Build
pnpm build

# Run
./endiorbot.mjs --help
```

## Configuration

Create `.sdlc-config.json` in your project root:

```json
{
  "project": {
    "id": "my-project",
    "name": "My Project"
  },
  "tier": "STANDARD",
  "framework": {
    "name": "MTS SDLC Framework",
    "version": "6.1.1"
  }
}
```

## Time Savings

| Task | Before | After | Savings |
|------|--------|-------|---------|
| Architecture decision | 30-60 min | 5 min | 90% |
| Gate evaluation | 20 min | 1 min | 95% |
| Context switch | 5 min | 10 sec | 97% |
| CRP/MRP generation | 30 min | 2 min | 93% |

## Documentation

- [IDENTITY.md](./IDENTITY.md) - Project identity
- [AGENTS.md](./AGENTS.md) - AI agent guidelines
- [CLAUDE.md](./CLAUDE.md) - Claude Code integration

## Development

```bash
pnpm dev          # Watch mode
pnpm test         # Run tests
pnpm lint         # Check style
```

## Links

- **Website:** https://endiorbot.nqh-internal.example
- **Docs:** https://docs.endiorbot.nqh-internal.example
- **Repository:** https://github.com/Minh-Tam-Solution/EndiorBot

## License

UNLICENSED - Private repository

---

*SDLC Framework v6.1.1 compliant*
