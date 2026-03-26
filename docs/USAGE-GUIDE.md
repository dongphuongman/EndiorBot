# EndiorBot Usage Guide

> **CEO Power Tool** — AI assistant that answers in <30s instead of 30-60 min

EndiorBot is a personal AI tool for solo developers. It integrates with Claude Code as an Agent Orchestrator, supporting CLI, Web, Telegram, and Zalo channels.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Channels Overview](#channels-overview)
4. [Workflow 1: Setup & First Run](#workflow-1-setup--first-run)
5. [Workflow 2: SDLC Operations](#workflow-2-sdlc-operations)
6. [Workflow 3: Agent Orchestration](#workflow-3-agent-orchestration)
7. [Workflow 4: Claude Code Bridge](#workflow-4-claude-code-bridge)
8. [Workflow 5: Multi-Model Consultation](#workflow-5-multi-model-consultation)
9. [Workflow 6: Per-Chat Workspace](#workflow-6-per-chat-workspace)
10. [Workflow 7: Team Agents](#workflow-7-team-agents)
11. [Command Reference](#command-reference)
12. [Troubleshooting](#troubleshooting)

---

## Installation

### Via npx (recommended)

```bash
npx @dttai/endiorbot --help
npx @dttai/endiorbot init
npx @dttai/endiorbot serve
```

### Global install

```bash
npm install -g @dttai/endiorbot
endiorbot --help
```

### From source

```bash
git clone https://github.com/Minh-Tam-Solution/EndiorBot.git
cd EndiorBot
pnpm install && pnpm build
./endiorbot.mjs --help
```

### Prerequisites

- Node.js >= 20
- pnpm (via corepack: `corepack enable`)
- At least one AI API key (Anthropic, Google Gemini, or OpenAI)

---

## Quick Start

```bash
# 1. Initialize SDLC structure in your project
cd /path/to/your-project
endiorbot init --tier STANDARD

# 2. Check compliance
endiorbot compliance check

# 3. Start all channels (Web + Telegram + Zalo)
endiorbot serve

# 4. Open Web UI
open http://localhost:18790
```

---

## Channels Overview

| Channel | Access | Commands | AI Chat | Best For |
|---------|--------|----------|---------|----------|
| **CLI** | `endiorbot <cmd>` | 40 commands | Via `@agent` | Automation, scripting |
| **Web UI** | `http://localhost:18790` | Not supported | Yes (`@agent`) | Quick AI conversations |
| **Telegram** | `@Endior_bot` | 30 commands | Yes (`@agent`) | Mobile, full features |
| **Zalo** | Bot Endior | 14 commands | Yes (`@agent`) | Vietnam market |

### Channel Feature Comparison

```
CLI ........... Full commands + agent shortcuts + all features
Telegram ...... Full commands + agent mentions + inline keyboards
Web UI ........ AI chat only (no slash commands)
Zalo .......... Basic commands + agent mentions (no bridge commands)
```

---

## Workflow 1: Setup & First Run

### Step 1: Initialize SDLC Structure

```bash
cd /path/to/your-project
endiorbot init --tier STANDARD
```

This creates:
- `.sdlc-config.json` — Project configuration
- `IDENTITY.md` — Project identity
- `docs/` — 10-stage SDLC documentation structure
- `.claude/` — Claude Code commands and settings

**Tier options:**
| Tier | Files Created | Stages | Agents | Best For |
|------|--------------|--------|--------|----------|
| LITE | 2 | 4 | 3 | Side projects |
| STANDARD | 3 | 7 | 6 | Solo dev projects |
| PROFESSIONAL | 4 | 10 | 10 | Team projects |
| ENTERPRISE | 6 | 11 | 13 | Enterprise apps |

### Step 2: Verify Compliance

```bash
endiorbot compliance check
# L1 Structure: 100%
# L2 Content: XX%

endiorbot compliance score
# Summary with warnings
```

### Step 3: Start the Server

```bash
endiorbot serve                    # All channels
endiorbot serve --no-telegram      # Skip Telegram
endiorbot serve --no-zalo          # Skip Zalo
endiorbot serve -p 3000            # Custom port
```

**Environment variables needed:**

| Variable | Required For |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude AI responses |
| `GOOGLE_API_KEY` | Gemini fallback |
| `OPENAI_API_KEY` | OpenAI fallback |
| `TELEGRAM_BOT_TOKEN` | Telegram channel |
| `ZALO_APP_ID` + `ZALO_APP_SECRET` | Zalo channel |

### Step 4: Connect from Telegram

1. Open Telegram, find `@Endior_bot`
2. Send `/link` to bind your identity
3. Send `/help` to see available commands

---

## Workflow 2: SDLC Operations

### Check Gate Status

```bash
# CLI
endiorbot gate status

# Telegram
/gate status
```

### Check Compliance

```bash
# CLI
endiorbot compliance check
endiorbot compliance score

# Telegram
/compliance check
/compliance score
```

### Auto-Fix Compliance Issues

```bash
# CLI
endiorbot compliance fix
endiorbot compliance fix --dry-run    # Preview only
endiorbot compliance fix --stage 04   # Fix specific stage

# Telegram
/fix
/fix --dry-run
/fix --stage 04
```

### View Available Agents

```bash
# CLI
endiorbot @pm "list sprint tasks"

# Telegram
/agents                # List all agents
@pm list sprint tasks  # Talk to PM agent
```

---

## Workflow 3: Agent Orchestration

EndiorBot provides 13 SOUL-based AI agents:

### Executor Agents (do work)

| Agent | Mode | Use Case | Example |
|-------|------|----------|---------|
| `@pm` | READ | Planning, sprints | `@pm plan next sprint` |
| `@architect` | READ | Design, ADRs | `@architect review auth design` |
| `@coder` | PATCH | Code generation | `@coder fix the login bug` |
| `@reviewer` | READ | Code review | `@reviewer check PR quality` |
| `@tester` | READ | Test strategy | `@tester write test plan` |
| `@fullstack` | PATCH | Full-stack work | `@fullstack add user profile page` |
| `@devops` | PATCH | CI/CD, infra | `@devops setup Docker` |
| `@pjm` | READ | Project management | `@pjm show project status` |
| `@researcher` | READ | Research | `@researcher compare Redis vs Postgres` |

### Advisor Agents (give opinions)

| Agent | Use Case | Example |
|-------|----------|---------|
| `@ceo` | Strategic decisions | `@ceo should we pivot?` |
| `@cto` | Technical review | `@cto review architecture` |
| `@cpo` | Product review | `@cpo review feature roadmap` |

### Router Agent

| Agent | Use Case |
|-------|----------|
| `@assistant` | General queries (default if no agent specified) |

### Multi-Agent Routing

Send to multiple agents at once:

```
# Telegram
@pm @cto review the authentication module

# The system decomposes the task and routes to each agent
```

### Using Agents from CLI

```bash
# Direct agent invocation
endiorbot @pm "plan payment gateway"
endiorbot @coder --patch "fix auth bug"
endiorbot @researcher "compare Redis vs PostgreSQL"
```

---

## Workflow 4: Claude Code Bridge

The bridge launches Claude Code CLI in tmux sessions, allowing remote control from any channel.

### Launch an Agent Session

```
/launch claude --as coder --risk patch
```

**Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| Agent | `claude`, `cursor`, `codex`, `gemini` | Which CLI to launch |
| `--as` | `pm`, `architect`, `coder`, `reviewer`, etc. | SOUL role |
| `--as-team` | `dev`, `planning`, `design`, `qa`, `ops` | Team mode |
| `--risk` | `read` (default), `patch` | File modification permission |

**Examples:**

```
# Read-only architect review
/launch claude --as architect

# Coder with file modification rights
/launch claude --as coder --risk patch

# Launch on a specific project
/launch claude /path/to/project --as coder --risk patch

# Launch a dev team
/launch claude --as-team dev "Implement user auth"
```

> **Note:** `--mode` is accepted as a deprecated alias for `--risk`. Prefer `--risk`.

### Manage Sessions

```
/sessions              # List active tmux sessions
/switch <sessionId>    # Switch to a session
/capture               # Capture current session output
/send <message>        # Send message to active session
/kill                  # Kill active session
```

### Full Bridge Workflow

```
# 1. Register your project
/repos add myapp /path/to/myapp

# 2. Focus on it
/focus myapp

# 3. Launch a coder session
/launch claude --as coder --risk patch

# 4. The agent works in your project...

# 5. Check output
/capture

# 6. Send follow-up instructions
/send "also add input validation"

# 7. When done, kill the session
/kill
```

---

## Workflow 5: Multi-Model Consultation

Query multiple AI models simultaneously for architecture decisions:

```bash
# CLI — quick consultation
endiorbot consult "Redis vs PostgreSQL for sessions?"

# CLI — full multi-model (3 models)
endiorbot consult --full "What architecture for payment gateway?"

# CLI — override primary model
endiorbot consult --primary openai "Explain microservices vs monolith"

# Telegram
/consult Redis vs PostgreSQL for sessions?
```

The consultation:
1. Sends your query to 2-3 AI models in parallel
2. Collects responses
3. Shows consensus and disagreements
4. Provides a merged recommendation

---

## Workflow 6: Per-Chat Workspace

Different Telegram/Zalo chats can focus on different projects:

### Register Repositories

```
/repos add endiorbot /path/to/EndiorBot
/repos add myapp /path/to/my-app
/repos add website /path/to/website
/repos                    # List all repos
```

### Set Focus

```
# Chat A: focus on EndiorBot
/focus endiorbot
@pm check sprint status

# Chat B: focus on myapp
/focus myapp
@coder fix the login bug
```

### Check Current Focus

```
/where                   # Shows current chat's focused repo
```

### How It Works

- Each chat has independent workspace focus
- Agent commands run in the focused repo's context
- `/launch` uses the focused repo as default path
- State stored in `~/.endiorbot/repos.json` and `~/.endiorbot/chat-focus.json`

---

## Workflow 7: Team Agents

Launch a team of agents for complex tasks:

### Available Teams

| Team | Leader | Members | Use Case |
|------|--------|---------|----------|
| `dev` | Coder | Architect, Reviewer, Tester | Feature development |
| `planning` | PM | Architect, PJM | Sprint planning |
| `design` | Architect | PM, Reviewer | Architecture design |
| `qa` | Tester | Reviewer, Coder | Quality assurance |
| `ops` | DevOps | Coder, Tester | Deployment, infra |
| `executive` | CEO | CTO, CPO | Strategic review |

### Launch a Team

```
/launch claude --as-team dev "Implement user authentication"
```

### Monitor Team

```
/team-status            # Show team progress
/kill-team              # Kill entire team session
```

> **Note:** `--as` and `--as-team` are mutually exclusive. You cannot use both.

---

## Command Reference

### Information Commands (no auth required)

| Command | Description | Channels |
|---------|-------------|----------|
| `/help` | Show all commands | All |
| `/agents` | List available agents | All |
| `/teams` | List tier teams | All |
| `/config` | Show project config | All |
| `/cost` | Show token usage & cost | All |

### SDLC Commands (no auth required)

| Command | Description | Channels |
|---------|-------------|----------|
| `/gate status` | Quality gate status | All |
| `/compliance check` | Check SDLC compliance | All |
| `/compliance score` | Show compliance score | All |
| `/compliance fix` | Auto-fix compliance issues | All |
| `/fix [--dry-run] [--stage N]` | Compliance auto-fix | All |
| `/consult <query>` | Multi-model consultation | All |
| `/init` | Project initialization status | All |

### Bridge Commands (auth required, Telegram only)

| Command | Description |
|---------|-------------|
| `/link` | Bind channel identity (required first) |
| `/launch <agent> [--as role] [--risk mode]` | Launch agent in tmux |
| `/sessions` | List active tmux sessions |
| `/switch <id>` | Switch active session |
| `/capture` | Capture session output |
| `/send <message>` | Send to active session |
| `/kill` | Kill active session |
| `/eval <code>` | Evaluate code in session |
| `/mode <read\|patch>` | Set session risk mode |

### Remote Commands (auth required, Telegram only)

| Command | Description |
|---------|-------------|
| `/repos [add\|remove name path]` | Manage repositories |
| `/focus <name>` | Set workspace focus |
| `/where` | Show current focus |
| `/cp <src> <dst>` | Copy files in repo |
| `/sh <command>` | Shell command (needs approval) |
| `/attach` | Attach to shell session |
| `/run <command>` | Run with approval queue |

### Team Commands (auth required, Telegram only)

| Command | Description |
|---------|-------------|
| `/team-status` | Show team monitoring |
| `/kill-team` | Kill team session |

### Approval Commands (auth required)

| Command | Description | Channels |
|---------|-------------|----------|
| `/approve` | Approve pending request | Telegram |
| `/reject` | Reject pending request | Telegram |

---

## Troubleshooting

### "Unknown skill" when typing commands in Web UI

**Cause:** Web UI is an AI chat interface. It does NOT support slash commands.
**Solution:** Use Telegram or CLI for commands. Web UI only supports `@agent` mentions for AI chat.

### `/launch` says "Warning: --mode is deprecated"

**Cause:** `--mode` is accepted but deprecated. Use `--risk` instead.
**Solution:** Replace `--mode` with `--risk`:
```
/launch claude --as coder --risk patch
```

### "No active project"

**Cause:** Some CLI commands require an active project via `endiorbot start`.
**Solution:**
```bash
endiorbot start myproject    # Activate a project
endiorbot gate status        # Now works
```

### "EADDRINUSE: address already in use"

**Cause:** Another EndiorBot instance is running on the same port.
**Solution:**
```bash
# Find the process
lsof -i :18790

# Kill it
kill -9 <PID>

# Restart
endiorbot serve
```

### Agent says "no Bash tool available"

**Cause:** Agent launched in READ mode (default). READ mode cannot modify files or run commands.
**Solution:** Relaunch with PATCH mode:
```
/launch claude --as coder --risk patch
```

### Telegram bot not responding

**Cause:** Bot token not set or server not running.
**Solution:**
1. Verify `TELEGRAM_BOT_TOKEN` is set in `.env`
2. Ensure `endiorbot serve` is running (not `--no-telegram`)
3. Send `/link` to bind your identity

### Zalo commands limited

**Cause:** Zalo channel supports only 14 of 31 commands by design.
**Solution:** Use Telegram for bridge commands (`/launch`, `/sessions`, `/capture`, etc.) and remote commands (`/repos`, `/focus`, `/sh`, etc.).

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Recommended | — | Claude AI (primary) |
| `GOOGLE_API_KEY` | Recommended | — | Gemini AI (fallback) |
| `OPENAI_API_KEY` | Optional | — | OpenAI (fallback) |
| `TELEGRAM_BOT_TOKEN` | For Telegram | — | Telegram bot |
| `ZALO_APP_ID` | For Zalo | — | Zalo mini app |
| `ZALO_APP_SECRET` | For Zalo | — | Zalo authentication |
| `ENDIORBOT_STATE_DIR` | No | `~/.endiorbot/` | State directory |
| `ENDIORBOT_DEBUG` | No | `false` | Debug mode |

---

## Architecture Quick Reference

```
User Input → Channel Adapter → GatewayIngress
  ├── /command → CommandDispatcher → Handler → Response
  └── @agent  → ChannelRouter → AI Provider → Response

AI Routing Fallback:
  Claude Code Bridge (tmux) → Cloud API (Gemini/OpenAI/Claude) → Remote Ollama
```

### State Files

```
~/.endiorbot/
  ├── repos.json          # Registered repositories
  ├── chat-focus.json     # Per-chat workspace focus
  ├── audit-logs/         # Bridge audit logs
  └── config.json         # User preferences
```

---

*EndiorBot v0.1.0-beta.1 | CEO Power Tool | SDLC Framework v6.2.0*
