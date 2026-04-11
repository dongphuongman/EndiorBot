# 06-deploy — Deploy

## Purpose

**How to SHIP safely** — release to production/staging with repeatable pipelines and clear rollback procedures.

---

## Quick Start

```bash
# 1. Build the project
pnpm build

# 2. Run locally (all channels)
endiorbot serve

# 3. Or run specific channels
endiorbot serve --no-zalo           # Skip Zalo adapter
endiorbot serve --port 3000         # Custom port

# 4. Docker deployment
docker build -t endiorbot .
docker run -p 18790:18790 --env-file .env endiorbot serve
```

## Deployment Options

### Option A: Local / Development

```bash
endiorbot serve                     # Web + Telegram + Zalo on port 18790
```

Access:
- Web UI: `http://localhost:18790`
- Telegram: message your bot
- Zalo: message your bot

### Option B: npm Global Install

```bash
npm install -g @dttai/endiorbot
endiorbot init --tier STANDARD
endiorbot serve
```

### Option C: npx (No Install)

```bash
npx @dttai/endiorbot serve
npx @dttai/endiorbot init
```

### Option D: Docker

```bash
docker build -t endiorbot .
docker run -d \
  -p 18790:18790 \
  --env-file .env \
  --name endiorbot \
  endiorbot serve
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (primary provider) |
| `OPENAI_API_KEY` | Yes (for consult) | OpenAI API key |
| `GOOGLE_API_KEY` | Optional | Gemini API key |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Optional | Your Telegram chat ID |
| `ZALO_BOT_TOKEN` | Optional | Zalo bot token |
| `ENDIORBOT_GATEWAY_PORT` | Optional | Gateway port (default: 18790) |
| `ENDIORBOT_AUTO_HANDOFF` | Optional | Auto-handoff from @mentions (default: `false`). Set `true` for power mode — routes without CEO prompt. Sprint 131. |
| `ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED` | Optional | Per-query context refresh (default: `false`). Kill switch — CEO flips directly. Sprint 133. |

See `.env.example` for full list.

## DevOps Commands

```bash
# Ecosystem-aware build & run
endiorbot ops build                 # Detects ecosystem, runs build
endiorbot ops run                   # Detects ecosystem, runs start
endiorbot ops dev                   # Detects ecosystem, runs dev mode

# Bootstrap any repo
endiorbot bootstrap <url> --build --run
```

## New CLI Commands (Sprint 131–133)

```bash
# Unified command discovery (Sprint 132 M0)
endiorbot commands                    # List all commands across 4 channels
endiorbot commands --json             # JSON envelope output

# Exec-policy management (Sprint 132 M1)
endiorbot exec-policy show            # Current preset + effective allowlist
endiorbot exec-policy preset balanced # Set preset (open / balanced / strict)
endiorbot exec-policy allow "pnpm *"  # Add to allowlist
endiorbot exec-policy deny "rm -rf *" # Add to hard-deny
endiorbot exec-policy list            # Show full policy
endiorbot exec-policy audit           # Recent audit decisions
```

## Exec-Policy Preset Configuration

Per [ADR-046](../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md), exec-policy fires BEFORE Autonomy Gates A/B/C:

| | `AUTO_HANDOFF=false` (default) | `AUTO_HANDOFF=true` (power mode) |
|---|---|---|
| **strict** | handoff prompt + per-command prompts (max safety) | silent dispatch + per-command prompts |
| **balanced** | handoff prompt + selective prompts (**recommended for `serve`**) | silent routing + risky-cmd prompts |
| **open** | handoff prompt then largely silent | closest to L3 autonomy (bounded by Gate B/C) |

**Production recommendation:** `balanced` preset + `ENDIORBOT_AUTO_HANDOFF=true` for `serve` mode.

## Audit Log Paths

| Log | Path | Format | Rotation |
|-----|------|--------|----------|
| Exec-policy decisions | `~/.endiorbot/audit-logs/exec-policy.log` | JSONL | 10 MB |
| SSRF blocks | `~/.endiorbot/audit-logs/ssrf-blocks.log` | JSONL | 10 MB |

All audit files created with `0o600` permissions (owner read/write only). Sprint 133 Task 1.

## Pre-Deploy Checklist

```bash
# 1. Build clean
pnpm build

# 2. All tests pass (7797+ expected)
pnpm test

# 3. Type check
pnpm tsc --noEmit

# 4. Compliance check
endiorbot compliance check

# 5. Gate status
endiorbot gate status

# 6. Exec-policy verification
endiorbot exec-policy show
```

---

## Alignment

- **Upstream:** [05-test](../05-test/) (verification), [04-build](../04-build/) (artifacts), [02-design](../02-design/) (NFRs)
- **Downstream:** [07-operate](../07-operate/) (monitoring, incidents)
- **Gates:** G4 (deploy readiness)
- **ADRs:** [ADR-046 Autonomous Execution Policy](../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md)
- **Spine:** [stage-command-workflow-spine.md](../00-foundation/stage-command-workflow-spine.md)

## Stage Artifacts

| Artifact | Location | Owner |
|----------|----------|-------|
| This deployment guide | `docs/06-deploy/README.md` | @devops |
| Sprint launch checklists | `docs/06-deploy/sprint-*.md` | @devops + @cto |
| Environment config template | `.env.example` | @devops |

---

*EndiorBot | SDLC Framework **6.3.0** — Stage 06: Deploy*
