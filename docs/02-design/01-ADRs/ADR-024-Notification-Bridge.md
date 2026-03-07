---
spec_id: ADR-024
title: "Notification Bridge + Multi-Agent Session Management"
spec_version: "1.0.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-06
last_updated: 2026-03-06
related_adrs: ["ADR-019", "ADR-020", "ADR-021"]
---

# ADR-024: Notification Bridge + Multi-Agent Session Management

**Date:** 2026-03-06
**Status:** Accepted
**Deciders:** Expert Governance + CTO (10/10 APPROVED) + CPO (APPROVED)
**Authority:** Sprint 82–85, ccpoke inspiration

---

## Context

CEO uses 4 AI agents in parallel: **Claude Code, Cursor CLI, Codex CLI, Gemini CLI**. Current workflow requires switching between browser tabs, IDE windows, and terminals — copy-pasting context between agents. This creates significant friction:

| Pain Point | Impact |
|------------|--------|
| Context switching between 4 agents | Lost focus, ~30s per switch |
| No completion notification | CEO polls terminals manually |
| Permission approval requires terminal | Cannot approve from phone |
| No unified session view | Forgets which agent is doing what |

**Key insight**: 1 tmux interface managing all agents (controllable from Telegram) is more efficient than multiple windows.

**Inspiration**: [ccpoke](https://github.com/kaida-palooza/ccpoke) — notification bridge for AI agents via tmux. EndiorBot adds HMAC auth, policy enforcement, audit trail, and riskMode governance that ccpoke lacks.

**Scope exclusions**: Discord/Slack (have Telegram+Zalo), Copilot Chat (no CLI/tmux integration path).

---

## Decisions

### D1. Bridge = "Notification + Input relay", NOT "remote terminal"

**Context**: The bridge enables Telegram → tmux communication. Without constraints, this becomes a remote shell — an unacceptable attack surface.

**Decision**:
- Bridge is **notification-first**: completion alerts, permission forwarding, session status
- Input relay is **secondary** and heavily constrained by riskMode (D2)
- Shell panes are **permanently disabled** (`shellPanesDisabled = true`)
- sendKeys uses **positive allowlist by riskMode**, not just negative blocklist
- **Universally blocked** regardless of mode: `!`, `sudo`, `ssh`, `curl`, `wget`, `python -c`, `node -e`, `docker`, `kubectl`, `chmod`, `rm`
- Sprint 82 ships **without free-text routing** — only structured commands (`/launch`, `/sessions`, `/capture`, `/switch`, `/kill`)
- Free-text sendKeys enabled in Sprint 83 only after riskMode policy is validated by CEO usage

**Rationale**: If Telegram bot token is compromised, the attacker gains at most a constrained text relay to agent CLI prompts — not a shell. Defense in depth through 4 layers (see Security Architecture).

### D2. RiskMode governs capabilities (hard gate)

**Context**: Different use cases need different permission levels. A "read the code" session should not allow shell command injection.

**Decision**: Every `BridgeSession` has a `riskMode` that acts as a hard policy gate:

| Mode | sendKeys Allowed | sendKeys Blocked | Capture Limit | Permission Required |
|------|-----------------|------------------|---------------|-------------------|
| `read` | Plain text prompts | `!`, `git`, `pnpm`, `npm`, `rm`, `chmod`, `docker`, `kubectl`, `python`, `node` | 30 lines, heavy redaction | No |
| `patch` | Prompts + "apply patch" workflow | Direct shell commands | 50 lines, standard redaction | No |
| `interactive` | Broader input, dangerous commands blocked | Universal blocklist still applies | 100 lines, standard redaction | Yes (Bash/Edit/Write via Sprint 84) |

- Default riskMode for new sessions: `read`
- CEO can upgrade via `/switch <id> --mode patch`
- Mode change logged in audit trail

**Rationale**: Positive allowlist per mode is safer than a single negative blocklist. `read` mode allows only natural language prompts — even `git status` typed in Telegram is blocked.

### D3. Telegram identity binding = non-negotiable

**Context**: Without identity binding, any Telegram user who knows the bot could send commands.

**Decision**:
- CEO must `/link` with EndiorBot identity before any bridge command
- Every request carries `actorId` in the audit log
- Unlinked users receive: `"Use /link to connect your EndiorBot identity first."`

**Rationale**: Same pattern as SDLC Orchestrator identity binding. Single source of truth for "who issued this command."

---

## Architectural Decisions

### A1. Standalone HookServer vs Gateway Integration

**Options considered**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: Standalone HTTP server (chosen)** | Different lifecycle, 127.0.0.1 only, simple http.createServer() | Extra port (18792) | **Selected** |
| B: Add routes to Gateway WebSocket server | Single server | Gateway is WebSocket-only, different security model, lifecycle coupling | Rejected |
| C: Add routes to web-server.ts | Reuse existing HTTP | web-server.ts is for desktop UI, may be exposed externally | Rejected |

**Decision**: Standalone `hook-server.ts` on `127.0.0.1:18792`.

**Rationale**:
- Gateway (`src/gateway/`) uses `new WebSocketServer()` — cannot add HTTP POST routes
- `web-server.ts` serves desktop UI and may be exposed for Telegram webhook callbacks — different security model
- HookServer lifecycle = "always on when agents are active" vs gateway = "started by CLI command"
- Binding to `127.0.0.1` ensures no external access

### A2. HMAC-SHA256 vs Bearer Token

**Options considered**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: HMAC-SHA256 + nonce + timestamp (chosen)** | Replay protection, drift protection, tamper detection | More complex hook scripts | **Selected** |
| B: Bearer token | Simple | Token replay, no tamper detection | Rejected |
| C: mTLS | Strongest | Overkill for localhost, complex cert management | Rejected |

**Decision**: HMAC-SHA256 with:
- 30s timestamp window (tightened from standard 60s)
- Session-prefixed nonce (`sessionId:randomHex`) — prevents cross-session replay
- `crypto.timingSafeEqual()` for comparison
- In-memory nonce Set with 120s TTL

**Rationale**: Bearer tokens can be replayed if intercepted. HMAC proves the sender knows the secret AND the payload hasn't been tampered with. The 30s window is sufficient for localhost communication.

### A3. Async Polling vs Held HTTP for Permission Approval

**Options considered**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: Async polling (chosen)** | Resilient, no held connections, works across restarts | Slightly more complex | **Selected** |
| B: Held HTTP connection + heartbeat | Simpler conceptually | Fragile: timeouts, process restarts, proxy interference | Rejected |
| C: WebSocket notification | Real-time | Adds WebSocket complexity to hook scripts | Rejected |

**Decision**: POST returns `202 {id, pollUrl}` → hook script polls `GET /hook/permission/:id` at 1s intervals.

**Rationale**: 1s polling for up to 3min = 180 local requests — negligible overhead. No held connections means HookServer can restart without breaking in-flight permissions. File-backed permission store survives process restarts.

### A4. BridgePolicy Defaults and Override

**Default policy** (`~/.endiorbot/bridge-policy.json`):

```json
{
  "allowedAgentTypes": ["claude-code", "cursor", "codex-cli", "gemini-cli"],
  "maxSessionsPerAgent": 2,
  "maxTotalSessions": 6,
  "telegramRateLimit": {
    "commandsPerMinute": 20,
    "sendKeysPerMinute": 10
  },
  "perSessionSendKeysInterval": 3000,
  "sendKeysMaxLength": 500,
  "shellPanesDisabled": true
}
```

- Override: edit `bridge-policy.json` directly or via `endiorbot bridge config`
- `shellPanesDisabled` is **not overridable** — hardcoded `true` in code as safety invariant
- Rate limits are per-Telegram-user (tied to `actorId`)

### A5. Security Module Reuse Strategy (CTO C1)

**Decision**: Bridge security modules wrap existing EndiorBot security infrastructure — no duplication.

| Bridge Module | Imports From | Adds Only |
|--------------|-------------|-----------|
| `bridge/security/input-sanitizer.ts` | `ShellGuard.checkCommand()` from `src/security/shell-guard.ts` | Control char stripping, ANSI escape removal, riskMode positive allowlist, length limit |
| `bridge/security/output-redactor.ts` | `scrub()` from `src/security/output-scrubber.ts` | `captureRedactPatterns` from policy, deny-by-default for high-sensitivity (`BEGIN PRIVATE KEY`, `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`) |
| `bridge/security/bridge-audit.ts` | Follows `AuditLogger` pattern from `src/agents/safety/audit-logger.ts` | JSONL format, `inv_*` ID prefix, rotation config, `bridge_event_log.jsonl` path |

**Rationale**: Single source of truth for injection patterns (ShellGuard) and credential patterns (OutputScrubber). New patterns added to base modules automatically protect bridge. Bridge modules add only domain-specific concerns.

### A6. Why tmux (vs screen/other)

**Decision**: tmux as the terminal multiplexer.

**Rationale**:
- tmux is the de facto standard on macOS (CEO's platform)
- Scriptable: `tmux send-keys`, `tmux capture-pane`, `tmux new-session` — well-documented API
- Session persistence: survives SSH disconnects, terminal crashes
- Layout control: split panes, named windows — visual multi-agent dashboard
- `screen` has fewer features and less active development
- CEO already uses tmux for development workflow

---

## Architecture

```
┌──────────────── tmux ────────────────┐
│ pane 0: claude    │ pane 1: codex    │
│ pane 2: gemini    │ pane 3: cursor   │
└──────────────────────────────────────┘
        │ hooks (HMAC-signed)      ▲ sendKeys (paste-buffer, sanitized)
        ▼                          │
   HookServer (standalone HTTP,    │
   127.0.0.1 only, port 18792)    │
        │                          │
        ▼                          │
   SessionRegistry ◄──────────────┘
        │       ↕ BridgePolicy (riskMode hard gate)
        ▼
   Telegram / telegram-commands.ts
   (CEO phone, identity-linked)
```

### Security Architecture (4 layers)

```
Layer 4: BridgePolicy     — rate limit, max sessions, allowed agent types
Layer 3: RiskMode gate     — read/patch/interactive positive allowlists
Layer 2: Input sanitizer   — ShellGuard base + control chars + ANSI + length
Layer 1: Identity binding  — actorId from /link, every request authenticated
```

Combined with existing:
- ShellGuard (8 deny patterns)
- OutputScrubber (7 credential patterns + PEM blocks)
- HMAC hook auth (30s window, nonce replay, timing-safe)
- tmux `execFile` (no shell injection)
- Audit trail (every action logged with actor)

### Two-Layer Approval Model

```
Layer 1: Claude Code tool permission (Bridge, Sprint 84)
  → Controls: Bash, Edit, Write tool calls
  → Scope: Claude Code execution only

Layer 2: EndiorBot governance (ActionControlPlane, existing)
  → Controls: gate confirms, destructive ops, SDLC policy
  → Bridge CANNOT bypass this layer
```

---

## Consequences

### Positive
- CEO manages 4 AI agents from Telegram — no more tab switching
- Agent completion notifications → no manual polling
- Permission approval from phone → CEO doesn't need terminal access
- Security-first: 4-layer defense, riskMode governance, HMAC auth, audit trail
- Reuses ShellGuard + OutputScrubber — no security pattern drift (CTO C1)
- Phased rollout: structured commands first (Sprint 82), free-text after validation (Sprint 83)

### Constraints
- **C1 (CTO)**: Security modules wrap existing infrastructure, no duplication
- **C2 (CTO)**: This ADR committed before Sprint 82 implementation
- **C3 (CTO)**: Regression gate: 5155+ tests per sprint merge, no new `any`
- **CA3 (CPO)**: Permission timeout default 3min (not 5min), configurable via env
- **CC2 (CTO)**: Hook config format verified against current Claude Code version before Sprint 83
- `shellPanesDisabled` is not overridable — safety invariant

### Risks
- sendKeys is still an execution surface even with constraints → mitigated by riskMode + positive allowlist + shell pane block
- Capture redaction regex may miss new credential patterns → mitigated by deny-by-default for high-sensitivity patterns
- tmux dependency → `isAvailable()` check with clear install instructions

---

## Implementation Plan

| Sprint | Scope | Priority |
|--------|-------|----------|
| 82 | TmuxBridge + Security + Agent Launcher (no free-text) | P0 |
| 83 | HookServer + Stop Notification + 2-Way Chat | P1 |
| 84 | Permission Approval via Telegram (async polling) | P1 |
| 85 | Hook Installer + Bridge Doctor | P2 |

Sprint 82 scope is locked to: `/link`, `/launch`, `/sessions`, `/capture`, `/switch`, `/kill`.

---

## References

- [ADR-019: OTT Channel Enhancement](ADR-019-OTT-Channel-Enhancement.md)
- [ADR-020: OTT Channel Completion](ADR-020-OTT-Channel-Completion.md)
- [ADR-021: Local Ollama Router](ADR-021-Local-Ollama-Router.md)
- [ccpoke](https://github.com/kaida-palooza/ccpoke) — Notification bridge inspiration
- Expert Governance Review: 18 items (G1–G18), all resolved
- CTO Review v1: 6 blocks (B1–B6), all resolved
- CTO Review v2: 3 conditions (C1–C3), all addressed
- CTO Review v3: 10/10 approved
- CPO Review: 3 advisory conditions (CA1–CA3), all incorporated
