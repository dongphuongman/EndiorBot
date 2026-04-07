# 07-operate — Operate

## Purpose

**How to RUN reliably** — daily workflows, use cases, troubleshooting, and operational guidance.

---

## Daily Workflows

### CEO Workflow

```
Morning:
  endiorbot chat                     # Start chat session
  "What's the sprint status?"        # AI summarizes from project context
  /gate status                       # Check pending gates (via OTT or CLI)
  Approve/Reject gates via Telegram  # Tap magic link

During the day:
  @architect "design API for module X"   # Personal SDLC agent team
  endiorbot plan "add feature Y"         # Generate structured plan
  endiorbot consult "Redis vs Postgres?" # Multi-model analysis

Evening:
  "Summarize today's progress"       # In chat session
  /exit                              # Save and close
```

### Developer Workflow

```bash
# 1. Bootstrap a new repo to explore
endiorbot bootstrap https://github.com/user/repo --build

# 2. Initialize SDLC structure
endiorbot init --tier STANDARD

# 3. Work with AI agents
endiorbot @coder --patch "fix the auth bug in login.ts"
endiorbot @reviewer "review the payment module"

# 4. Check quality gates
endiorbot gate status
endiorbot compliance check

# 5. Interactive chat for deep work
endiorbot chat --model ollama       # Free, local, private
```

### OTT Workflow (Telegram / Zalo)

```
/focus my-project                   # Set active repo
@pm plan the next sprint            # Talk to PM agent
@coder fix the login bug            # Talk to Coder agent
/gate status                        # Check gates
/consult "should we use GraphQL?"   # Multi-model consultation
/help                               # Full command list
```

---

## Key Use Cases

### 1. Multi-Model Consultation

Query 2-3 AI models simultaneously for balanced analysis:

```bash
endiorbot consult "microservices vs monolith for a 50K LOC app?"
# → GPT-5.4 analysis + Gemini 2.5-pro analysis + consensus
```

### 2. Project Bootstrap

Try any OSS repo in one command:

```bash
endiorbot bootstrap https://github.com/nicholasareed/glass --build --run
# → Clone → Detect Rust → cargo build → cargo run
```

Supported ecosystems: Docker, Node.js, Rust, Python, Go (detect-only), Java (detect-only).

### 3. Interactive Chat with Project Context

```bash
endiorbot chat
# AI knows your project (IDENTITY.md, git branch, recent commits)
# 40-turn history with auto-compaction
# Switch providers mid-session: /model gemini
```

### 4. SDLC Compliance

```bash
endiorbot init --tier PROFESSIONAL  # Set up 10-stage SDLC
endiorbot compliance check          # Verify structure
endiorbot compliance fix --yes      # Auto-fix missing files
```

### 5. Agent Orchestration (14 SOUL agents)

```bash
endiorbot @pm "plan sprint 130"
endiorbot @architect "design caching layer"
endiorbot @coder --patch "implement Redis cache"
endiorbot @tester "write integration tests"
endiorbot @reviewer "security review the cache module"
endiorbot @cso "audit permission model"
```

### 6. Sprint Planning

```bash
endiorbot plan "add user authentication with JWT"
# → Structured plan with agent assignments, saved to drafts/
```

---

## Monitoring & Health

```bash
# Gateway health
curl http://localhost:18790/health

# Cost tracking
/cost                               # OTT: token usage & cost
endiorbot chat → /status            # Per-session cost in chat

# Session management
endiorbot chat --resume chat-abc123  # Resume saved chat
/sessions                            # List active tmux sessions
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 18790 in use | `ENDIORBOT_GATEWAY_PORT=3000 endiorbot serve` |
| Telegram not responding | Check `TELEGRAM_BOT_TOKEN` in `.env` |
| Agent says "no Bash tool" | Agent is in READ mode; use `--risk patch` |
| Chat: "Provider not available" | Check API key for selected provider |
| Bootstrap: "Toolchain not found" | Install ecosystem toolchain first |

---

## Alignment

- **Upstream:** [06-deploy](../06-deploy/) (what was shipped), [03-integrate](../03-integrate/) (live integrations)
- **Downstream:** [09-govern](../09-govern/) (retros, RFCs), [04-build](../04-build/) (fixes)
- **Spine:** [stage-command-workflow-spine.md](../00-foundation/stage-command-workflow-spine.md)

---

*EndiorBot | SDLC Framework **6.3.0** — Stage 07: Operate*
