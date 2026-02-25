---
name: coding-agent
description: Run Codex CLI, Claude Code, OpenCode, or Pi Coding Agent via background process for programmatic control.
metadata:
  emoji: "🧩"
  category: development
  tags:
    - codex
    - claude-code
    - pi
    - automation
  requires:
    - name: claude
    - name: codex
    - name: opencode
    - name: pi
---

# Coding Agent (bash-first)

Use **bash** (with optional background mode) for all coding agent work. Simple and effective.

## PTY Mode Required

Coding agents (Codex, Claude Code, Pi) are **interactive terminal applications** that need a pseudo-terminal (PTY) to work correctly. Without PTY, you'll get broken output, missing colors, or the agent may hang.

**Always use `pty:true`** when running coding agents:

```bash
# Correct - with PTY
bash pty:true command:"codex exec 'Your prompt'"

# Wrong - no PTY, agent may break
bash command:"codex exec 'Your prompt'"
```

### Bash Tool Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string | The shell command to run |
| `pty` | boolean | **Use for coding agents!** Allocates a pseudo-terminal for interactive CLIs |
| `workdir` | string | Working directory (agent sees only this folder's context) |
| `background` | boolean | Run in background, returns sessionId for monitoring |
| `timeout` | number | Timeout in seconds (kills process on expiry) |
| `elevated` | boolean | Run on host instead of sandbox (if allowed) |

### Process Tool Actions (for background sessions)

See [references/process-actions.md](references/process-actions.md) for full action list.
Common: `list`, `poll`, `log`, `write`, `submit`, `kill`.

---

## Quick Start: One-Shot Tasks

For quick prompts/chats, create a temp git repo and run:

```bash
# Quick chat (Codex needs a git repo!)
SCRATCH=$(mktemp -d) && cd $SCRATCH && git init && codex exec "Your prompt here"

# Or in a real project - with PTY!
bash pty:true workdir:~/Projects/myproject command:"codex exec 'Add error handling to the API calls'"
```

---

## The Pattern: workdir + background + pty

For longer tasks, use background mode with PTY:

```bash
# Start agent in target directory (with PTY!)
bash pty:true workdir:~/project background:true command:"codex exec --full-auto 'Build a snake game'"
# Returns sessionId for tracking

# Monitor progress
process action:log sessionId:XXX

# Check if done
process action:poll sessionId:XXX

# Send input (if agent asks a question)
process action:write sessionId:XXX data:"y"

# Submit with Enter (like typing "yes" and pressing Enter)
process action:submit sessionId:XXX data:"yes"

# Kill if needed
process action:kill sessionId:XXX
```

**Why workdir matters:** Agent wakes up in a focused directory, doesn't wander off reading unrelated files.

---

## Codex CLI

**Model:** `gpt-5.2-codex` is the default (set in ~/.codex/config.toml)

### Flags

| Flag | Effect |
|------|--------|
| `exec "prompt"` | One-shot execution, exits when done |
| `--full-auto` | Sandboxed but auto-approves in workspace |
| `--yolo` | NO sandbox, NO approvals (fastest, most dangerous) |

### Building/Creating
```bash
# Quick one-shot (auto-approves) - remember PTY!
bash pty:true workdir:~/project command:"codex exec --full-auto 'Build a dark mode toggle'"

# Background for longer work
bash pty:true workdir:~/project background:true command:"codex --yolo 'Refactor the auth module'"
```

### Reviewing PRs

**CRITICAL: Never review PRs in your own project folder!**
Clone to temp folder or use git worktree.

```bash
# Clone to temp for safe review
REVIEW_DIR=$(mktemp -d)
git clone https://github.com/user/repo.git $REVIEW_DIR
cd $REVIEW_DIR && gh pr checkout 130
bash pty:true workdir:$REVIEW_DIR command:"codex review --base origin/main"
# Clean up after: trash $REVIEW_DIR

# Or use git worktree (keeps main intact)
git worktree add /tmp/pr-130-review pr-130-branch
bash pty:true workdir:/tmp/pr-130-review command:"codex review --base main"
```

---

## Claude Code

```bash
# With PTY for proper terminal output
bash pty:true workdir:~/project command:"claude 'Your task'"

# Background
bash pty:true workdir:~/project background:true command:"claude 'Your task'"
```

---

## OpenCode

```bash
bash pty:true workdir:~/project command:"opencode run 'Your task'"
```

---

## Pi Coding Agent

```bash
# Install: npm install -g @mariozechner/pi-coding-agent
bash pty:true workdir:~/project command:"pi 'Your task'"

# Non-interactive mode (PTY still recommended)
bash pty:true command:"pi -p 'Summarize src/'"

# Different provider/model
bash pty:true command:"pi --provider openai --model gpt-4o-mini -p 'Your task'"
```

---

## Parallel Issue Fixing

Use git worktrees for parallel fixes. See [references/parallel-worktrees.md](references/parallel-worktrees.md).

---

## Rules

1. **pty:true always** - agents need a terminal
2. **Respect tool choice** - use what user asks for
3. **Be patient** - don't kill "slow" sessions
4. **--full-auto for building**, vanilla for reviewing
5. **Parallel OK** - run many agents at once

---

## Progress Updates

For background agents: send 1 message on start, then update only on milestones, questions, errors, or completion. Always explain if you kill a session.

---

## Key Points

- **PTY required:** Always use `pty:true` - agents need a terminal
- **Git required:** Codex needs a git repo. Use `mktemp -d && git init` for scratch
- **exec for one-shots:** `codex exec "prompt"` runs and exits cleanly
