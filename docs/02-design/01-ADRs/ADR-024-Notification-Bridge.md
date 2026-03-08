---
spec_id: ADR-024
title: "Notification Bridge + Multi-Agent Session Management"
spec_version: "1.1.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-06
last_updated: 2026-03-07
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

### D4. Managed Shell Sessions (Date: 2026-03-07, Sprint 83)

**Context**: Sprint 83 introduces `/sh` (read-only shell) and `/run` (approval-gated execution) via Telegram. This appears to contradict D1's `shellPanesDisabled = true` invariant.

**Decision**:
- `shellPanesDisabled` blocks sendKeys of shell commands through **agent panes** (tmux paste-buffer to Claude/Cursor/Codex/Gemini prompts). This invariant is UNCHANGED.
- ShellSessionManager is a **separate execution path** in `endiorbot-shell` tmux session (not `endiorbot` agent session). It has its own security stack:
  - `/sh`: read-only allowlist only (positive list, no blocklist bypass risk)
  - `/run`: always approval-gated (`commandDigest` binding, no replay)
  - All: `actorId` allowlist, `ExecRunner` (`execFile` only), audit trail
- These are architecturally different: agent pane protection != managed shell access.
- ShellSessionManager does NOT use `sendKeys` paste-buffer for command execution in `/run`. `/run` uses `ExecRunner.exec()` (`execFile`) directly. Only `/sh` uses tmux sendKeys (with allowlist enforcement).

**Rationale**: CEO needs remote shell access via Telegram for operational tasks. The read-only allowlist + approval gate + actor identity provides sufficient security without weakening the agent pane protection invariant.

### D5. Copilot CLI as ToolBridge (Date: 2026-03-07, Sprint 83)

**Context**: GitHub Copilot CLI provides `suggest` and `explain` capabilities. CEO wants access from Telegram. Copilot CLI is a one-shot tool, NOT a persistent agent — it does not belong in the `AgentProviderType` registry.

**Decision**:
- `CopilotBridge` is a **ToolBridge** (one-shot `execFile`) — separate from `AgentLauncher` (persistent tmux sessions).
- Runtime detection: prefer `copilot` binary (`github/copilot-cli`), fallback to `gh copilot` only if present and not deprecated.
- Capability probe via `--help` before first use — no hardcoded flags.
- Output: ANSI-stripped, redacted via `redactBridgeOutput()`, capped at 3500 chars for Telegram.
- 15s execution timeout.

**Rationale**: Mixing one-shot tools into the persistent session registry creates confusion (ADR-024/ADR-010 separation). ToolBridge pattern is explicit about lifecycle: invoke → capture output → done.

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

### A7. ExecRunner Contract (CTO C3, Sprint 83)

**Decision**: All subprocess execution in bridge modules uses an `ExecRunner` interface backed by `execFile()`.

```typescript
interface ExecRunner {
  exec(binary: string, args: string[], opts: ExecOpts): Promise<ExecResult>;
}
```

- Implementation MUST use `execFile()` from `node:child_process`
- **NEVER** `exec()`, `spawn({shell: true})`, or `child_process.exec()`
- Matches TmuxBridge pattern from Sprint 82
- `ExecRunner` definition lives in `src/bridge/types.ts` (single definition)
- DI: test suites mock `ExecRunner`, no real subprocess in unit tests

**Rationale**: `execFile` does not invoke a shell interpreter, preventing shell injection. The DI interface enables fast unit tests with deterministic behavior.

### A8. Per-Invocation UUID Marker Protocol (CTO W-1, Sprint 83)

**Decision**: Shell output capture uses a per-invocation UUID marker instead of static strings or time-based sleep.

```
1. marker = __ENDIORBOT_${uuid.slice(0,8)}__
2. sendKeys(`${cmd}; echo "${marker}:$?"`)
3. Poll capturePane every 500ms (max 30s)
4. When output contains ${marker}:<exitCode>:
   - Extract output between command echo and marker
   - Parse exit code
   - Redact via redactBridgeOutput()
5. On timeout: return partial capture with timedOut: true
```

**Rationale**: Static markers (e.g., `__ENDIORBOT_DONE__`) can collide with grep output, test logs, or other commands that echo that string. UUID-based markers have negligible collision probability.

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
- **C4 (CTO, Sprint 83)**: ExecRunner uses `execFile()` only — never `exec()` or `spawn({shell: true})`
- **CA4 (CPO, Sprint 83)**: `/repos add` validates: directory exists + has `.git` + no path traversal
- **CA5 (CPO, Sprint 83)**: `envAllowlist` defaults empty — `buildCleanEnv()` = PATH + HOME + LANG + allowlist only
- **CA6 (CPO, Sprint 83)**: No-focus graceful message — never crash on missing `/focus`
- `shellPanesDisabled` is not overridable — safety invariant

### Risks
- sendKeys is still an execution surface even with constraints → mitigated by riskMode + positive allowlist + shell pane block
- Capture redaction regex may miss new credential patterns → mitigated by deny-by-default for high-sensitivity patterns
- tmux dependency → `isAvailable()` check with clear install instructions
- Copilot CLI may be deprecated or change flags → mitigated by capability probe + `detect()` fallback chain
- `/sh` allowlist bypass (e.g., `find -exec`) → mitigated by explicit pattern matching + edge case tests
- `/run` command substitution after approval → mitigated by `commandDigest` binding (sha256 + actorId + chatId)

---

## Implementation Plan

| Sprint | Scope | Priority |
|--------|-------|----------|
| 82 | TmuxBridge + Security + Agent Launcher (no free-text) | P0 |
| 82.5 | Telegram Command Wiring — 6 bridge handlers into `telegram-commands.ts` + `telegram-poll.mjs` | P0 |
| 83 | Copilot CLI Bridge + Repo Context + Managed Shell (`/sh` + `/run`) | P1 |
| 84 | Permission Approval via Telegram (async polling) | P1 |
| 85 | Hook Installer + Bridge Doctor | P2 |

Sprint 82 scope is locked to: core modules (TmuxBridge, SessionRegistry, AgentLauncher, 4-layer security).
Sprint 82.5 scope: wire `/link`, `/launch`, `/sessions`, `/capture`, `/switch`, `/kill` into Telegram.
Sprint 83 scope: `/focus`, `/where`, `/repos`, `/cp suggest`, `/cp explain`, `/cp status`, `/sh`, `/attach`, `/run`.

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
- Sprint 83 PM review: 10 points + 5 ACs, all resolved
- Sprint 83 CTO review: 3 blocks (BLOCK-1–3) + 3 warnings (W-1–3) + 4 conditions (C1–C4), all resolved
- Sprint 83 CPO review: APPROVED, 3 advisory conditions (CA4–CA6), all incorporated
