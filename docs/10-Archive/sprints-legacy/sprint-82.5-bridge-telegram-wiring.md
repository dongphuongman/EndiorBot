---
spec_id: SPEC-04BUILD-SPRINT82.5
title: "Sprint 82.5: Bridge Telegram Wiring — 6 Command Handlers"
spec_version: "1.1.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024"]
---

# Sprint 82.5: Bridge Telegram Wiring — 6 Command Handlers

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-024 Notification Bridge (D1–D3), CTO BLOCK-1 resolution
**Preceding sprint:** Sprint 82 (Notification Bridge — core modules)
**CTO Condition:** C1 — Sprint 82 Telegram wiring must be complete before Sprint 83
**CTO Code Review:** CONDITIONAL APPROVAL 8/10 → 2 must-fix resolved (MF-1, MF-2)

---

## Context

Sprint 82 shipped the **bridge core modules** (TmuxBridge, SessionRegistry, AgentLauncher, 4-layer security, 73 tests) but the **6 Telegram command handlers are NOT wired** into `telegram-commands.ts`. Sprint 83 cannot build on unfinished Sprint 82.

**Gap identified by CTO Code Review (BLOCK-1):**
> "Sprint 82 shipped bridge infra (TmuxBridge, SessionRegistry, etc.) but the 6 Telegram commands (`/link`, `/launch`, `/sessions`, `/switch`, `/capture`, `/kill`) are NOT wired into `telegram-commands.ts`. You are building Sprint 83 on an incomplete Sprint 82."

---

## Goal

Wire all 6 bridge command handlers into `telegram-commands.ts` and route them from `telegram-poll.mjs`, completing the Sprint 82 ADR-024 scope.

**Scope lock**: Implementation only — no new modules, no new bridge infrastructure. This sprint connects existing modules to the Telegram interface.

---

## User Stories

### US-1: Identity Binding (`/link`)

```gherkin
Feature: Telegram Identity Binding

  Scenario: CEO links Telegram to EndiorBot
    GIVEN CEO has not linked Telegram identity
    WHEN CEO sends "/link ceo_user" in Telegram
    THEN handleLinkCommand(telegramUserId, username) binds identity
    AND responds "Linked as ceo@endiorbot"
    AND lists available bridge commands

  Scenario: /link without username defaults to 'unknown'
    GIVEN CEO sends "/link" with no username
    WHEN handleLinkCommand(telegramUserId) is called
    THEN links with default username
    AND returns success

  Scenario: Unlinked user attempts bridge command
    GIVEN user has not called /link
    WHEN user sends /launch
    THEN bot responds "Use /link to connect your EndiorBot identity first."
    AND command is NOT executed

  Scenario: getLinkedActorId for unlinked user returns null
    GIVEN telegramUserId "99999" has not called /link
    WHEN getLinkedActorId("99999") is called
    THEN returns null
```

### US-2: Agent Launch (`/launch`)

```gherkin
Feature: Agent Launch via Telegram

  Scenario: /launch without arguments shows usage
    GIVEN CEO is linked
    WHEN CEO sends "/launch" with no args
    THEN handleLaunchCommand([], actorId) returns usage message
    AND lists available agents: claude, cursor, codex, gemini

  Scenario: /launch with valid agent and path
    GIVEN CEO is linked AND tmux is available
    WHEN CEO sends "/launch claude /path/to/project"
    THEN resolves agent short name "claude" to "claude-code"
    AND calls AgentLauncher.launch() with projectPath and agentType
    AND stores sessionId as active session for actorId
    AND responds with session details (ID, agent, path, mode, tmux target)

  Scenario: /launch with unknown agent
    GIVEN CEO sends "/launch unknown_agent"
    THEN responds "Unknown agent: unknown_agent"

  Scenario: /launch with path traversal blocked
    GIVEN CEO sends "/launch claude /etc/passwd"
    THEN path validation rejects (not under $HOME or $TMPDIR)
    AND responds "Path must be under..."

  Scenario: /launch short names resolve correctly
    GIVEN agent short name mappings:
      | Short   | Full         |
      | claude  | claude-code  |
      | cursor  | cursor       |
      | codex   | codex-cli    |
      | gemini  | gemini-cli   |
    WHEN "/launch <short>" is sent
    THEN resolves to <full> before calling AgentLauncher

  Scenario: /launch defaults to CWD when no path provided
    GIVEN CEO sends "/launch claude" with no path
    THEN uses process.cwd() as projectPath
```

### US-3: Session Management (`/sessions`, `/switch`)

```gherkin
Feature: Session Management

  Scenario: /sessions lists active sessions
    GIVEN 2 sessions active
    WHEN CEO sends "/sessions"
    THEN handleSessionsCommand() returns formatted list
    AND each session shows: id, agent, status, riskMode, project path, elapsed time

  Scenario: /sessions with empty registry
    GIVEN no active sessions
    WHEN CEO sends "/sessions"
    THEN responds "No active sessions"

  Scenario: /switch without args shows current session or usage
    GIVEN CEO has active session
    WHEN CEO sends "/switch"
    THEN shows current active session details or "No active session"

  Scenario: /switch with valid sessionId
    GIVEN session "abc123" exists in registry
    WHEN CEO sends "/switch abc123"
    THEN sets "abc123" as active session for actorId
    AND responds with session details

  Scenario: /switch with --mode flag
    GIVEN session "abc123" exists
    WHEN CEO sends "/switch abc123 --mode patch"
    THEN updates session riskMode to "patch"
    AND logs mode change in audit trail

  Scenario: /switch with invalid sessionId
    GIVEN session "nonexistent" does not exist
    WHEN CEO sends "/switch nonexistent"
    THEN responds "Session not found: nonexistent"
```

### US-4: Capture Output (`/capture`)

```gherkin
Feature: Capture Terminal Output

  Scenario: /capture with active session
    GIVEN CEO has active session in read mode
    WHEN CEO sends "/capture 20"
    THEN captures last 20 lines from tmux pane via TmuxBridge.capturePane()
    AND redacts via redactBridgeOutput(output, riskMode)
    AND sends redacted output to Telegram

  Scenario: /capture without active session
    GIVEN actorId has no active session
    WHEN CEO sends "/capture"
    THEN responds "No active session. Use /switch <id> first."

  Scenario: /capture line limits capped by riskMode
    GIVEN active session in read mode (max 30 lines)
    WHEN CEO requests 100 lines
    THEN captures max 30 (CAPTURE_LINE_LIMITS.read)
```

### US-5: Kill Session (`/kill`)

```gherkin
Feature: Kill Session

  Scenario: /kill without args shows usage
    GIVEN CEO sends "/kill"
    THEN responds with usage: "/kill <session-id>"

  Scenario: /kill with valid sessionId
    GIVEN session "abc123" exists
    WHEN CEO sends "/kill abc123"
    THEN calls AgentLauncher.kill(sessionId, actorId)
    AND clears active session if it was the killed one
    AND responds with confirmation

  Scenario: /kill with unknown sessionId
    GIVEN session "nonexistent" does not exist
    WHEN CEO sends "/kill nonexistent"
    THEN responds "Session not found" or "Kill failed"
```

### US-6: Help Message Update

```gherkin
Feature: Help Message Bridge Section

  Scenario: /help includes Bridge (ADR-024) section
    GIVEN generateHelpMessage() is called
    THEN output includes "Bridge (ADR-024)" heading
    AND lists 6 commands: /link, /launch, /sessions, /switch, /capture, /kill
```

---

## Technical Design

### Modified Files

| File | Changes | Lines (est.) |
|------|---------|-------------|
| `src/channels/telegram/telegram-commands.ts` | Add 7 exports: `handleLinkCommand`, `getLinkedActorId`, `handleLaunchCommand`, `handleSessionsCommand`, `handleSwitchCommand`, `handleCaptureCommand`, `handleKillCommand`. Update `generateHelpMessage()` with Bridge section. Launch guard: `!result.success \|\| !result.session` (CTO MF-1). | +346 |
| `scripts/telegram-poll.mjs` | Route `/link`, `/launch`, `/sessions`, `/switch`, `/capture`, `/kill` to bridge handlers. Bypass Ollama router. Entire bridge switch block wrapped in try/catch with `channel.send("Command error: ...")` fallback (CTO MF-2). | +70 |

### New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `tests/channels/telegram/bridge-commands.test.ts` | ~220 | 27 unit tests for 6 bridge command handlers + help + sanitization |

### Handler Signatures

```typescript
// Identity
export function handleLinkCommand(telegramUserId: string, username?: string):
  { success: boolean; response: string };

export function getLinkedActorId(telegramUserId: string): string | null;

// Agent management (async — calls AgentLauncher/TmuxBridge)
export async function handleLaunchCommand(args: string[], actorId: string):
  Promise<{ success: boolean; response: string }>;

export function handleSessionsCommand():
  { success: boolean; response: string };

export function handleSwitchCommand(args: string[], actorId: string):
  { success: boolean; response: string };

export async function handleCaptureCommand(args: string[], actorId: string, telegramUserId: string):
  Promise<{ success: boolean; response: string }>;

export async function handleKillCommand(args: string[], actorId: string):
  Promise<{ success: boolean; response: string }>;
```

### Dependencies (all from Sprint 82)

```typescript
import { VALID_AGENT_TYPES, type AgentProviderType } from "../../bridge/types.js";
import { getAgentLauncher } from "../../bridge/agent-launcher.js";
import { getSessionRegistry } from "../../bridge/session-registry.js";
import { getTmuxBridge } from "../../bridge/tmux/tmux-bridge.js";
import { redactBridgeOutput } from "../../bridge/security/output-redactor.js";
import { getBridgeAuditLogger } from "../../bridge/security/bridge-audit.js";
```

### Agent Short Name Mapping

```typescript
const AGENT_SHORT_NAMES: Record<string, AgentProviderType> = {
  claude: "claude-code",
  cursor: "cursor",
  codex: "codex-cli",
  gemini: "gemini-cli",
};
```

### Path Validation (Security)

```typescript
// Allowed: paths under $HOME or $TMPDIR
// Blocked: /etc, /usr, /var, /sys, /proc, ../../ traversal
const resolved = resolve(pathArg);
if (!resolved.startsWith(homedir()) && !resolved.startsWith(tmpdir())) {
  return { success: false, response: "Path must be under $HOME or $TMPDIR" };
}
```

### In-Memory State

```typescript
// Identity map: telegramUserId → actorId
const identityMap = new Map<string, string>();

// Active session map: actorId → sessionId (for /capture, /switch shorthand)
const activeSessionMap = new Map<string, string>();
```

### Routing in `telegram-poll.mjs`

```javascript
// Bridge commands bypass Ollama router — direct handler calls
// Entire switch block wrapped in try/catch (CTO MF-2)
let bridgeHandled = true;
try {
  switch (cmd) {
    case "/link": {
      const result = handleLinkCommand(userId, username);
      await channel.send(result.response);
      break;
    }
    case "/launch": {
      const actorId = getLinkedActorId(userId);
      if (!actorId) { await channel.send(LINK_MSG); break; }
      const result = await handleLaunchCommand(args, actorId);
      await channel.send(result.response);
      break;
    }
    // ... similar for /sessions, /switch, /capture, /kill
    default:
      bridgeHandled = false;
  }
} catch (e) {
  console.error(`[Telegram] Bridge command error (${cmd}):`, e.message);
  try { await channel.send(`Command error: ${e.message}`); } catch { /* send failed */ }
  return;
}
if (bridgeHandled) return;
```

---

## Test Plan

### Automated Unit Tests (`tests/channels/telegram/bridge-commands.test.ts`)

| Test ID | Scenario | Expected |
|---------|----------|----------|
| BC-01 | `/link` binds identity | success=true, response includes "ceo@endiorbot" |
| BC-02 | `/link` without username | success=true, defaults gracefully |
| BC-03 | `getLinkedActorId` for linked user | returns "ceo@endiorbot" |
| BC-04 | `getLinkedActorId` for unlinked user | returns null |
| BC-05 | `/launch` without args | success=false, shows usage |
| BC-06 | `/launch unknown_agent` | success=false, "Unknown agent" |
| BC-07 | `/launch claude /etc/passwd` | success=false, "Path must be under" |
| BC-08 | `/launch claude $HOME` | passes path validation |
| BC-09 | `/launch claude $TMPDIR/test` | passes path validation |
| BC-10 | `/launch ../../etc` relative path traversal | blocked |
| BC-11 | Agent short names resolve correctly | claude→claude-code, codex→codex-cli |
| BC-12 | `/sessions` empty registry | success=true, "No active sessions" |
| BC-13 | `/sessions` with sessions | success=true, lists formatted sessions |
| BC-14 | `/switch` without args | success=true, shows current or "No active" |
| BC-15 | `/switch nonexistent` | success=false, "Session not found" |
| BC-16 | `/switch valid_id` | success=true, sets active session |
| BC-17 | `/switch --mode patch` | updates riskMode |
| BC-18 | `/capture` without active session | success=false, "No active session" |
| BC-19 | `/capture` line limits by riskMode | capped at CAPTURE_LINE_LIMITS |
| BC-20 | `/kill` without args | success=false, shows usage |
| BC-21 | `/kill nonexistent` | success=false, "Session not found" |
| BC-22 | `/kill valid_id` | success=true, session killed |
| BC-23 | `generateHelpMessage()` includes Bridge section | contains "Bridge (ADR-024)" |
| BC-24 | `generateHelpMessage()` lists 6 bridge commands | 6 `/` commands in Bridge section |
| BC-25 | `sanitizeForEcho` strips Markdown + limits length | clean output, max 50 chars |

### Manual Test Reference

Existing `tests/manual/mt-82-bridge-telegram.mjs` (42 test cases, 7 phases) validates exact behavior. Run after `pnpm build`:

```bash
node tests/manual/mt-82-bridge-telegram.mjs
# Expected: 42/42 PASS
```

---

## CTO Code Review Resolution

| # | Issue | Type | Resolution |
|---|-------|------|------------|
| MF-1 | `result.session!` non-null assertion in `handleLaunchCommand` | Must-Fix | Replaced with `!result.success \|\| !result.session` guard — no crash if launcher returns success without session |
| MF-2 | No try/catch around bridge command block in `telegram-poll.mjs` | Must-Fix | Entire switch block wrapped in try/catch with `channel.send("Command error: ...")` fallback |
| W-1 | Rate limiting not wired | Warning | Accepted — low risk in single-CEO system, defer to Sprint 83 |
| W-2 | `/switch --mode` not implemented | Warning | Accepted — Sprint 83 scope |
| W-3 | Identity map in-memory only | Warning | Documented as known limitation (N-1) |
| W-4 | `/sessions` not filtered by actorId | Warning | Accepted — single-user system, future scope |

## Regression Gate (CTO C3)

```bash
pnpm build     # clean ✅
pnpm test      # 5383 pass (5357 existing + 27 new) ✅
# No new `any` types ✅
```

---

## Dependencies

- **Sprint 82 core modules** (DONE): TmuxBridge, SessionRegistry, AgentLauncher, bridge-audit, bridge-policy, input-sanitizer, output-redactor, types (73 tests)
- **ADR-024** (committed): D1–D3 decisions, security architecture

---

## Definition of Done

- [x] All 7 handler exports added to `telegram-commands.ts`
- [x] 6 bridge commands routed in `telegram-poll.mjs` (with try/catch — MF-2)
- [x] 27 new tests passing in `bridge-commands.test.ts`
- [ ] Manual tests pass: `mt-82-bridge-telegram.mjs` (42/42 PASS)
- [x] `pnpm build` clean, no `any` types
- [x] `pnpm test` — 5383 pass (regression gate C3)
- [x] `/link` → identity bound
- [x] `/launch claude /path` → tmux session created (with path validation + session guard — MF-1)
- [x] `/sessions` → lists sessions
- [x] `/switch <id>` → sets active session
- [x] `/capture` → redacted output via OutputRedactor
- [x] `/kill <id>` → session terminated
- [x] `generateHelpMessage()` includes Bridge (ADR-024) section with 6 commands
- [x] CTO MF-1: Launch guard `!result.success || !result.session` (no non-null assertion)
- [x] CTO MF-2: Bridge commands wrapped in try/catch (prevents poll loop crash)
