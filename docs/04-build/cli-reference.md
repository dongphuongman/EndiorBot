# EndiorBot CLI Reference

**Sprint 58 - Production Hardening**
**Date**: 2026-03-01

## Quick Reference

```bash
endiorbot --help              # Show all commands
endiorbot --version           # Show version
```

---

## Agent Commands (Sprint 55-57)

### Agent Invocation

```bash
# Basic agent invocation
endiorbot @pm "plan payment gateway"
endiorbot @architect "design auth system"
endiorbot @coder "implement login endpoint"
endiorbot @reviewer "review PR #123"
endiorbot @tester "write tests for auth module"

# With mode override
endiorbot @coder --patch "fix auth bug"     # Apply as patch
endiorbot @coder --interactive "refactor"   # Interactive mode

# Multi-model consultation
endiorbot @consult "Redis vs PostgreSQL for sessions?"
```

### Available Agents

#### SE4A Agents (All Tiers)

| Agent | Role | Default Mode | Can Hand Off To |
|-------|------|--------------|-----------------|
| `@pm` | Product Manager | READ | architect, pjm |
| `@pjm` | Project Manager | READ | coder, tester |
| `@architect` | System Architect | READ | coder, reviewer |
| `@coder` | Developer | PATCH | reviewer, tester |
| `@reviewer` | Code Reviewer | READ | coder, pm |
| `@tester` | QA Engineer | READ | coder, devops |
| `@researcher` | Research Analyst | READ | pm |
| `@devops` | DevOps Engineer | INTERACTIVE | tester |
| `@assistant` | General Assistant | READ | all SE4A agents |

#### SE4H Agents (STANDARD+ Tier - Advisors Only)

| Agent | Role | Description |
|-------|------|-------------|
| `@ceo` | Chief Executive Officer | Strategic direction, executive review |
| `@cpo` | Chief Product Officer | Product vision, prioritization |
| `@cto` | Chief Technology Officer | Technical standards, architecture review |

> **Note:** SE4H agents are advisors - they provide guidance but cannot delegate to other agents.

```bash
# SE4H invocation (requires STANDARD+ tier)
endiorbot @ceo "review Q1 roadmap"
endiorbot @cpo "prioritize feature backlog"
endiorbot @cto "evaluate architecture options"

# Set tier for SE4H
endiorbot config set tier STANDARD
```

---

## SDLC Control Plane (Sprint 56)

### Gate Commands

```bash
# Show gate status
endiorbot gate status

# Show gate recommendation (read-only)
endiorbot gate recommend G2

# Human confirmation (explicit flag required)
endiorbot gate confirm G2 --confirm
```

### Evidence Commands

```bash
# List evidence
endiorbot evidence list
endiorbot evidence list --gate G2

# Add evidence
endiorbot evidence add ./docs/ADR-001.md --gate G2 --type adr
endiorbot evidence add ./specs/API.yaml --gate G3 --type api

# Verify evidence
endiorbot evidence verify

# Remove evidence
endiorbot evidence remove <evidence-id>
```

### Context Commands

```bash
# Show Brain layer status
endiorbot context status

# Generate context for Claude Code
endiorbot context inject > context.md

# Search across Brain layers
endiorbot context search "payment"

# Clear specific layer
endiorbot context clear --layer L4
```

---

## Project Management

### Project Commands

```bash
# Start new project
endiorbot start <project-id>

# Switch project
endiorbot switch <project-id>

# Show current project
endiorbot status
```

### Session Commands

```bash
# Show session info
endiorbot session info

# List recent sessions
endiorbot session list
```

---

## Configuration

### Config Commands

```bash
# Initialize config
endiorbot config init

# Validate config
endiorbot config validate

# Show config path
endiorbot config path

# Get config value
endiorbot config get tier
endiorbot config get logging.level

# Set config value
endiorbot config set tier STANDARD
endiorbot config set logging.level debug
```

### Secrets Management

```bash
# List configured secrets
endiorbot secrets list
```

---

## Gateway & Channels

### Gateway Commands

```bash
# Show gateway status
endiorbot gateway status

# Start gateway server
endiorbot gateway start

# Stop gateway server
endiorbot gateway stop
```

Default port: `18790`

### Setup Commands

```bash
# Show provider status
endiorbot setup status

# Configure GitHub Models
endiorbot setup github-models

# Configure Telegram
endiorbot setup telegram

# Configure Zalo
endiorbot setup zalo
```

---

## OTT Channel Integration (Sprint 57)

### Telegram Bot

From Telegram, send messages to `@Endior_bot`:

```
[@pm: plan payment gateway integration]
[@architect: design database schema]
[@consult: should we use PostgreSQL or MongoDB?]
```

### Zalo OA

From Zalo, send messages to `Bot Endior`:

```
[@pm: plan payment integration]
[@coder: fix bug authentication]
```

---

## Budget & Cost

### Budget Commands

```bash
# Show budget status
endiorbot budget status

# Show session cost
endiorbot budget session

# Show daily cost
endiorbot budget daily
```

---

## Checkpoints

### Checkpoint Commands

```bash
# List checkpoints
endiorbot checkpoint list

# Create checkpoint
endiorbot checkpoint create "before refactor"

# Restore checkpoint
endiorbot checkpoint restore <checkpoint-id>
```

---

## Troubleshooting

### Diagnostic Commands

```bash
# Validate configuration
endiorbot config validate

# Check provider connectivity
endiorbot setup status

# Check secrets
endiorbot secrets list

# Check gateway
endiorbot gateway status
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Config not found" | `endiorbot config init` |
| "API key not set" | Check `.env.local` or run `endiorbot setup` |
| "Gateway not running" | `endiorbot gateway start` |
| "Permission denied" | `chmod 700 ~/.endiorbot/` |

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ENDIORBOT_STATE_DIR` | State directory | `~/.endiorbot/` |
| `ENDIORBOT_CONFIG_PATH` | Config file path | `.sdlc-config.json` |
| `ENDIORBOT_DEBUG` | Debug mode | `false` |
| `ANTHROPIC_API_KEY` | Anthropic API key | (required) |
| `OPENAI_API_KEY` | OpenAI API key | (optional) |
| `GEMINI_API_KEY` | Google Gemini API key | (optional) |

---

*EndiorBot CLI Reference v1.0 | Sprint 58 | SDLC Framework 6.2.0*
