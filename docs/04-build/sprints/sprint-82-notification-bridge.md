---
spec_id: SPEC-04BUILD-SPRINT82
title: "Sprint 82: Notification Bridge — TmuxBridge + Security + Agent Launcher"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-06
last_updated: 2026-03-06
related_adrs: ["ADR-024"]
---

# Sprint 82: Notification Bridge — TmuxBridge + Security + Agent Launcher

**Date:** 2026-03-06
**Gate:** G-Sprint
**Authority:** ADR-024 Notification Bridge + Multi-Agent Session Management
**Preceding sprint:** Sprint 81 (Enforce Don't Suggest)
**CTO Review:** 10/10 APPROVED (v3), C1-C3 binding
**CPO Review:** APPROVED, CA1-CA3 advisory
**Expert Governance:** 18 items resolved, D1-D3 decisions

---

## Goal

CEO launches and manages AI agents (Claude Code, Cursor, Codex, Gemini) in tmux panes from Telegram. **Security-first**: policy enforcement, input sanitization, output redaction, and audit trail from day 1.

**Scope lock**: `/link`, `/launch`, `/sessions`, `/capture`, `/switch`, `/kill` only. **No free-text routing** — deferred to Sprint 83 after riskMode policy is validated by CEO usage.

---

## User Stories

### US-1: Identity Binding (`/link`)

```gherkin
Feature: Telegram Identity Binding

  Scenario: CEO links Telegram to EndiorBot
    GIVEN CEO has not linked Telegram identity
    WHEN CEO sends /link in Telegram
    THEN EndiorBot binds telegram_user_id to actorId
    AND responds "Linked as ceo@endiorbot"
    AND audit logs event: identity_link

  Scenario: Unlinked user attempts bridge command
    GIVEN user has not linked identity
    WHEN user sends /launch claude
    THEN EndiorBot responds "Use /link to connect your EndiorBot identity first."
    AND command is NOT executed
```

### US-2: Agent Launch (`/launch`)

```gherkin
Feature: Agent Launch via Telegram

  Scenario: Launch Claude Code in tmux
    GIVEN CEO is linked AND tmux is available
    WHEN CEO sends "/launch claude /path/to/project"
    THEN TmuxBridge creates new pane in "endiorbot" session
    AND AgentLauncher starts "claude" CLI in the pane
    AND SessionRegistry stores session with riskMode=read, workspaceFingerprint
    AND Telegram shows: session ID, agent type, path, mode, tmux target
    AND audit logs event: session_create

  Scenario: Launch fails — tmux not installed
    GIVEN tmux is NOT available on system
    WHEN CEO sends /launch claude
    THEN responds "tmux not found. Install: brew install tmux"
    AND no session is created

  Scenario: Launch blocked by policy — max sessions
    GIVEN 2 claude-code sessions already active (maxSessionsPerAgent=2)
    WHEN CEO sends /launch claude
    THEN responds "Max sessions reached for claude-code (2/2). Kill a session first."
    AND audit logs event: policy_violation
```

### US-3: Session Management (`/sessions`, `/switch`, `/kill`)

```gherkin
Feature: Session Management

  Scenario: List active sessions
    GIVEN 2 sessions active (claude-code, codex-cli)
    WHEN CEO sends /sessions
    THEN lists all sessions with: id, agent, status, riskMode, project path, elapsed time

  Scenario: Switch active session
    GIVEN session "abc123" exists and is active
    WHEN CEO sends "/switch abc123"
    THEN sets "abc123" as the active session for 2-way chat
    AND responds with session details

  Scenario: Kill a session
    GIVEN session "abc123" exists
    WHEN CEO sends "/kill abc123"
    THEN TmuxBridge kills the tmux pane
    AND SessionRegistry updates status to "stopped"
    AND audit logs event: session_kill
```

### US-4: Capture Output (`/capture`)

```gherkin
Feature: Capture Terminal Output

  Scenario: Capture with redaction
    GIVEN active session in read mode
    WHEN CEO sends "/capture 20"
    THEN TmuxBridge captures last 20 lines from pane
    AND OutputRedactor scrubs credentials via OutputScrubber.scrub()
    AND sends redacted output to Telegram
    AND audit logs event: capture

  Scenario: Capture blocked — sensitive content
    GIVEN capture output contains "BEGIN PRIVATE KEY"
    WHEN output is processed by OutputRedactor
    THEN capture is BLOCKED entirely (not sent to Telegram)
    AND responds "Sensitive output detected — not sent to Telegram"
    AND audit logs event: capture_blocked

  Scenario: Capture line limits by riskMode
    GIVEN active session in read mode (max 30 lines)
    WHEN CEO sends "/capture 100"
    THEN captures only 30 lines (capped by riskMode)
```

---

## Technical Design

### New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/bridge/types.ts` | ~80 | BridgeSession, BridgePolicy, SessionRegistryFile, AgentProviderType, SessionRiskMode |
| `src/bridge/security/input-sanitizer.ts` | ~60 | Wraps ShellGuard.checkCommand() + bridge-specific (C1) |
| `src/bridge/security/output-redactor.ts` | ~70 | Wraps OutputScrubber.scrub() + deny-by-default (C1) |
| `src/bridge/security/bridge-audit.ts` | ~80 | JSONL at ~/.endiorbot/bridge_event_log.jsonl (C1) |
| `src/bridge/security/bridge-policy.ts` | ~50 | BridgePolicy defaults + riskMode enforcement |
| `src/bridge/tmux/tmux-bridge.ts` | ~120 | sendKeys (paste-buffer), capturePane, createSession, killSession, isAvailable |
| `src/bridge/session-registry.ts` | ~100 | File-backed, version + checksum, atomic writes, lockfile |
| `src/bridge/agent-launcher.ts` | ~80 | Creates pane, starts CLI, workspaceFingerprint |
| `src/bridge/index.ts` | ~15 | Barrel exports |

### Modified Files

| File | Changes |
|------|---------|
| `src/channels/telegram/telegram-commands.ts` | Add handlers: handleLink, handleLaunch, handleSessions, handleSwitch, handleCapture, handleKill |
| `scripts/telegram-poll.mjs` | Route `/link`, `/launch`, `/sessions`, `/switch`, `/capture`, `/kill` to telegram-commands.ts |

### Security Module Reuse (CTO C1)

```typescript
// input-sanitizer.ts — wraps ShellGuard
import { checkCommand } from "../../security/shell-guard.js";

export function sanitizeBridgeInput(input: string, riskMode: SessionRiskMode): string {
  // 1. ShellGuard base check
  const shellCheck = checkCommand(input);
  if (!shellCheck.allowed) throw new Error(`ShellGuard: ${shellCheck.reason}`);

  // 2. Bridge-specific: strip control chars, ANSI escapes
  // 3. Bridge-specific: riskMode positive allowlist
  // 4. Bridge-specific: length limit
}
```

```typescript
// output-redactor.ts — wraps OutputScrubber
import { scrub } from "../../security/output-scrubber.js";

export function redactBridgeOutput(output: string, riskMode: SessionRiskMode): RedactResult {
  // 1. OutputScrubber base redaction
  const { scrubbed, violations } = scrub(output);

  // 2. Bridge-specific: line limit by riskMode
  // 3. Bridge-specific: deny-by-default for high-sensitivity
}
```

### TmuxBridge Implementation

```typescript
// tmux-bridge.ts — key methods
class TmuxBridge {
  // Use paste-buffer instead of send-keys (CTO M1)
  async sendKeys(target: string, text: string): Promise<void> {
    // tmux load-buffer -b bridge - <<< "$input"
    // tmux paste-buffer -b bridge -t $target
    await this.execTmux(["load-buffer", "-b", "bridge", "-"], { input: text });
    await this.execTmux(["paste-buffer", "-b", "bridge", "-t", target]);
  }

  async capturePane(target: string, lines: number): Promise<string> {
    return this.execTmux(["capture-pane", "-p", "-t", target, "-S", `-${lines}`]);
  }

  async createSession(name: string, command: string): Promise<string> {
    return this.execTmux(["new-session", "-d", "-s", name, "-x", "200", "-y", "50", command]);
  }

  // All calls via execFile (not exec) with 5s timeout
  private async execTmux(args: string[], opts?: { input?: string }): Promise<string>;
}
```

### SessionRegistry Implementation

```typescript
interface SessionRegistryFile {
  version: number;       // incremented on each write
  checksum: string;      // sha256(json_without_checksum)
  sessions: BridgeSession[];
}

// Atomic writes: .tmp + rename()
// lockfileSync() for concurrent access
// Version + checksum for corruption detection
```

### Agent Launcher

```typescript
const AGENT_COMMANDS: Record<AgentProviderType, string> = {
  "claude-code": "claude",
  "cursor": "cursor agent --force",
  "codex-cli": "codex",
  "gemini-cli": "gemini",
};

// workspaceFingerprint = sha256(projectPath + gitRemoteUrl)
```

---

## Test Plan

### Unit Tests

| Test File | Cases (est.) | Coverage |
|-----------|-------------|----------|
| `tests/bridge/security/input-sanitizer.test.ts` | 15 | riskMode allowlist, injection patterns, control chars, ANSI, length |
| `tests/bridge/security/output-redactor.test.ts` | 12 | scrub delegation, line limits, deny-by-default, high-sensitivity block |
| `tests/bridge/security/bridge-audit.test.ts` | 8 | JSONL write, inv_* IDs, rotation, entry format |
| `tests/bridge/security/bridge-policy.test.ts` | 8 | defaults, rate limits, max sessions, riskMode enforcement |
| `tests/bridge/tmux-bridge.test.ts` | 10 | sendKeys, capturePane, createSession, killSession, isAvailable, timeout |
| `tests/bridge/session-registry.test.ts` | 10 | CRUD, atomic write, version increment, checksum validation, lockfile |
| `tests/bridge/agent-launcher.test.ts` | 8 | launch, workspaceFingerprint, error handling, policy check |
| **Total** | **~71** | |

### Security Test Scenarios

```gherkin
Scenario: Shell injection blocked by ShellGuard
  GIVEN input "rm -rf /"
  WHEN sanitizeBridgeInput(input, "read") is called
  THEN ShellGuard.checkCommand() returns allowed=false
  AND error is thrown

Scenario: Control characters stripped
  GIVEN input containing \x1B[31m (ANSI red)
  WHEN sanitizeBridgeInput(input, "read") is called
  THEN ANSI escape is removed from output

Scenario: Read mode blocks git commands
  GIVEN input "git push origin main"
  AND riskMode is "read"
  WHEN sanitizeBridgeInput(input, "read") is called
  THEN error "Blocked: commands not allowed in read mode"

Scenario: High-sensitivity capture blocked
  GIVEN capture contains "-----BEGIN RSA PRIVATE KEY-----"
  WHEN redactBridgeOutput(capture, "read") is called
  THEN result.blocked = true
  AND result.reason = "Sensitive output detected"
```

---

## Regression Gate (CTO C3)

```bash
pnpm build     # must be clean, no errors
pnpm test      # must pass 5155+ tests (current baseline + ~71 new)
# No new `any` types
```

---

## Dependencies

- **ADR-024**: Must be committed before implementation starts (CTO C2) ✅
- **Sprint 81**: Should ship first (quality fixes)
- **tmux**: Must be installed on CEO's MacBook (`brew install tmux`)
- **Existing modules**: ShellGuard, OutputScrubber, AuditLogger patterns

---

## /launch UX Response (CPO CA2)

Success:
```
✅ Session launched
🆔 ID: abc12345
📋 Agent: claude-code
📂 Path: /Users/dttai/projects/my-app
🔒 Mode: read
🖥️ Tmux: endiorbot:claude.0
```

Error — tmux missing:
```
❌ tmux not found. Install: brew install tmux
```

Error — max sessions:
```
❌ Max sessions reached for claude-code (2/2). Kill a session first.
```

---

## Definition of Done

- [ ] All new files created and building clean
- [ ] 71+ new tests passing
- [ ] Total test count 5155+ (regression gate C3)
- [ ] Security modules reuse ShellGuard + OutputScrubber (C1)
- [ ] No new `any` types
- [ ] `/link` → identity bound, actorId in audit
- [ ] `/launch claude` → tmux session created
- [ ] `/sessions` → lists sessions with riskMode
- [ ] `/capture` → redacted output, high-sensitivity blocked
- [ ] `/kill` → session terminated, audit logged
- [ ] Audit: bridge_event_log.jsonl records all actions with actorId
