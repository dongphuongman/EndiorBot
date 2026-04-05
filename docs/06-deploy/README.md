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
| `OPENAI_API_KEY` | Yes (for consult) | OpenAI API key |
| `GOOGLE_API_KEY` | Optional | Gemini API key |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Optional | Your Telegram chat ID |
| `ZALO_BOT_TOKEN` | Optional | Zalo bot token |
| `ENDIORBOT_GATEWAY_PORT` | Optional | Gateway port (default: 18790) |

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

## Pre-Deploy Checklist

```bash
# 1. Build clean
pnpm build

# 2. All tests pass
pnpm test

# 3. Compliance check
endiorbot compliance check

# 4. Gate status
endiorbot gate status
```

---

## Alignment

- **Upstream:** [05-test](../05-test/) (verification), [04-build](../04-build/) (artifacts), [02-design](../02-design/) (NFRs)
- **Downstream:** [07-operate](../07-operate/) (monitoring, incidents)
- **Gates:** G4 (deploy readiness)
- **Spine:** [stage-command-workflow-spine.md](../00-foundation/stage-command-workflow-spine.md)

## Stage Artifacts

| Artifact | Location | Owner |
|----------|----------|-------|
| This deployment guide | `docs/06-deploy/README.md` | @devops |
| Sprint launch checklists | `docs/06-deploy/sprint-*.md` | @devops + @cto |
| Environment config template | `.env.example` | @devops |

---

*EndiorBot | SDLC Framework **6.2.1** — Stage 06: Deploy*
