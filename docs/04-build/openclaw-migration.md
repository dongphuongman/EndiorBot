# MTS-OpenClaw to EndiorBot Migration Guide

**Date**: 2026-02-25
**Status**: Active Migration
**Authority**: Production Hardening Complete

---

## Overview

EndiorBot replaces MTS-OpenClaw as the primary AI development assistant with enhanced capabilities:

| Feature | MTS-OpenClaw | EndiorBot |
|---------|----------|-----------|
| Gateway Protocol | Proprietary | JSON-RPC 2.0 WebSocket |
| Desktop UI | Web-based | Electron Native |
| OTT Channels | ❌ | ✅ (Telegram, Zalo) |
| Brain Architecture | ❌ | ✅ (4-layer iceberg) |
| Evaluator-Optimizer | ❌ | ✅ (5-dimension scoring) |
| Multi-Model Support | Limited | 28 models (6 providers) |
| Rate Limiting | Basic | ✅ Per-provider |
| Production Hardening | ❌ | ✅ Complete |

---

## Command Mapping

### Gateway Commands

| MTS-OpenClaw | EndiorBot | Notes |
|----------|-----------|-------|
| `pnpm openclaw gateway run` | `./endiorbot.mjs gateway start` | JSON-RPC 2.0 |
| `--port 18789` | `--port 19000` | New default port |
| `--bind loopback` | `--host 127.0.0.1` | Explicit host |
| N/A | `./endiorbot.mjs gateway status` | New: Check status |
| N/A | `./endiorbot.mjs gateway stop` | New: Graceful shutdown |

### Desktop App

| MTS-OpenClaw | EndiorBot | Notes |
|----------|-----------|-------|
| Web UI at `http://localhost:18789` | Native Electron app | Better performance |
| N/A | `cd apps/desktop && pnpm dev` | Dev mode |
| N/A | `./start-endiorbot.sh desktop` | Production mode |

### CLI Commands

| MTS-OpenClaw | EndiorBot | Notes |
|----------|-----------|-------|
| N/A | `./endiorbot.mjs gate status` | SDLC gate evaluation |
| N/A | `./endiorbot.mjs brain status` | Brain layer status |
| N/A | `./endiorbot.mjs eval <query>` | Evaluate response quality |
| N/A | `./endiorbot.mjs setup <provider>` | Provider setup wizard |
| N/A | `./endiorbot.mjs secrets list` | List credentials |

---

## Migration Steps

### 1. Stop MTS-OpenClaw

```bash
# Kill all MTS-OpenClaw processes
pkill -f "openclaw"

# Verify stopped
ps aux | grep openclaw
```

### 2. Source EndiorBot Aliases

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# EndiorBot (replaces MTS-OpenClaw)
source ~/Documents/Python/01.NQH/EndiorBot/.endiorbot-aliases
```

Then reload:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

### 3. Start EndiorBot

```bash
# All-in-one (Gateway + Desktop)
eb-start

# Or separately
eb-gateway    # Start Gateway only
eb-desktop    # Start Desktop only

# Check status
eb-status
```

### 4. Configure Providers

```bash
# Interactive setup
eb-setup anthropic
eb-setup openai
eb-setup gemini

# List configured secrets
eb secrets list
```

---

## Port Changes

| Service | MTS-OpenClaw Port | EndiorBot Port |
|---------|---------------|----------------|
| Gateway | 18789 | 19000 |
| Desktop | 18789 (web) | N/A (native) |

**Firewall Note**: If you have firewall rules for port 18789, update to 19000.

---

## New Features in EndiorBot

### 1. OTT Channels

Receive approvals via Telegram/Zalo:

```bash
# Configure Telegram
export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CEO_CHAT_ID="your-chat-id"

# Configure Zalo
export ZALO_OA_ID="your-oa-id"
export ZALO_ACCESS_TOKEN="your-token"
```

### 2. Brain Architecture

4-layer learning system:

```bash
# View brain status
eb-brain status

# Export brain data
eb brain export --output brain-backup.json

# View layers
eb brain layers
```

### 3. Evaluator-Optimizer Loop

Quality-driven response optimization:

```bash
# Evaluate a query
eb eval "How do I implement OAuth?"

# Run with optimization
eb eval "Fix login bug" --optimize

# Show loop metrics
eb eval metrics
```

### 4. Multi-Model Orchestration

Intelligent routing across 28 models:

```bash
# Consult multiple models
eb consult "Design payment gateway" --models claude,gpt,gemini

# Show routing decision
eb consult "Quick bug fix" --explain
```

---

## Configuration Files

### MTS-OpenClaw Config

```
~/.openclaw/config.json  ❌ (deprecated)
```

### EndiorBot Config

```
~/.endiorbot/
├── config.json          # User preferences
├── channels.json        # OTT channel config
├── brain/               # Brain data storage
│   ├── events/
│   ├── patterns/
│   ├── structures/
│   └── mental-models/
├── evidence/            # SDLC gate evidence
└── logs/                # Structured logs
```

---

## Troubleshooting

### Gateway Won't Start

```bash
# Check if port is in use
lsof -i :19000

# Kill process on port
lsof -ti:19000 | xargs kill -9

# Restart
eb-gateway
```

### Desktop App Blank Screen

```bash
# Rebuild desktop
cd apps/desktop
pnpm build:main
pnpm build:preload
pnpm build:renderer

# Restart
eb-desktop
```

### Provider Authentication Failed

```bash
# Re-setup provider
eb-setup anthropic

# Verify secrets
eb secrets list

# Test connection
eb eval "test" --provider anthropic
```

---

## Performance Comparison

| Metric | MTS-OpenClaw | EndiorBot |
|--------|----------|-----------|
| Startup Time | ~3s | ~1.5s |
| Memory Usage | ~200MB | ~150MB |
| Gateway Latency | ~50ms | ~20ms |
| Desktop FPS | 30 (web) | 60 (native) |
| Test Coverage | - | 3,171 tests |

---

## Rollback Plan

If you need to rollback to MTS-OpenClaw:

```bash
# Stop EndiorBot
eb-stop

# Restart MTS-OpenClaw
pnpm openclaw gateway run --bind loopback --port 18789
```

---

## Support

- **Docs**: `/docs/04-build/`
- **Issues**: `docs/04-build/troubleshooting-guide.md`
- **Security**: `docs/04-build/security-best-practices.md`
- **Config**: `docs/04-build/configuration-reference.md`

---

*Migration complete. Welcome to EndiorBot!*
*SDLC Framework 6.1.1*
