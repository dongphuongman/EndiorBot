---
spec_id: SPEC-04BUILD-SPRINT92
title: "Sprint 92: Unified App Launcher"
spec_version: "1.0.0"
status: planned
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024"]
---

# Sprint 92: Unified App Launcher

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-024 (Notification Bridge — infrastructure layer)
**Preceding sprint:** Sprint 91 (Agent Teams — Monitoring + Lifecycle)
**Est. effort:** ~30h
**Est. tests:** ~15

---

## Goal

Replace the current per-session launch model with a single unified launcher process that manages all Bridge sessions — individual and team alike. The launcher owns PID tracking, liveness monitoring, automatic crash recovery, and session re-attachment after launcher restart. CEO never loses a session due to launcher downtime.

**Key principle:** The launcher is infrastructure. It must be invisible when healthy and self-healing when not. CEO interaction model is unchanged — all commands still flow through Telegram.

---

## Depends On

- Sprint 91 (team lifecycle + health monitor) — PID tracking and crash detection patterns established.
- Sprint 85 (audit logger + sendKeys) — Session re-attachment relies on tmux pane IDs persisted in audit-adjacent session store.

---

## Scope

| In Scope | Out of Scope (moved) |
|----------|---------------------|
| Unified launcher process (single process for all sessions) | New agent provider support (Claude Max, etc.) |
| `providerPid` field on `BridgeSession` + liveness check | Enterprise team features (cross-org orchestration) |
| Process monitor: crash detection + auto-restart | Full distributed session clustering |
| Session recovery on launcher restart (re-attach to tmux) | UI changes to Telegram commands |
| Launcher lock file (prevent duplicate launcher instances) | |
| Audit events: `launcher_started`, `session_recovered`, `session_crash_restart` | |

---

## Architecture

### Unified Launcher Process

The launcher runs as a long-lived Node.js process (`endiorbot bridge launcher`). It is the single owner of all `BridgeSession` state and all tmux interactions. No session is started without going through the launcher.

```
endiorbot bridge launcher start
  → Acquires lock file: ~/.endiorbot/launcher.lock
  → Loads session store: ~/.endiorbot/sessions.json
  → Re-attaches to existing tmux sessions (recovery path)
  → Opens Telegram webhook listener
  → Enters event loop: process monitor + session manager
```

### PID Tracking

`providerPid` is added to `BridgeSession` (additive — Sprint 84 types are extended, not replaced):

```typescript
interface BridgeSession {
  // ... existing fields from Sprint 84 ...
  providerPid?: number;       // PID of the Claude Code process in tmux
  tmuxPaneId?: string;        // tmux pane identifier for re-attachment
  launcherStartTime?: number; // Unix ms — used to detect stale sessions
}
```

Liveness check: `process.kill(providerPid, 0)` — returns `true` if process is alive, `false` (ESRCH) if it has exited.

### Process Monitor

The process monitor polls all active sessions on a 15s interval:

```
For each active BridgeSession:
  1. liveness check via providerPid
  2. If alive: update lastSeen timestamp
  3. If crashed:
     a. Classify: was it solo or team leader?
     b. Write audit event: session_crash_restart
     c. Re-launch with same SOUL/team context (SoulLoader + TeamRegistry)
     d. Persist new PID to session store
     e. Notify CEO via Telegram: "Session #N recovered automatically"
```

Auto-restart uses the same `SoulLoader` and `TeamRegistry` used at initial launch — SOUL context is preserved across crashes.

### Launcher Lock File

```
Lock file: ~/.endiorbot/launcher.lock
Contents:  { "pid": 12345, "startTime": 1741305600000 }
```

On startup: if lock file exists and process is alive → exit with "launcher already running (PID 12345)". If lock file exists and process is dead → remove stale lock and proceed. On exit (SIGTERM/SIGINT): remove lock file.

### Session Recovery on Launcher Restart

The session store (`~/.endiorbot/sessions.json`) persists `tmuxPaneId` alongside `providerPid`. On launcher restart:

```
1. Load sessions.json
2. For each session with tmuxPaneId:
   a. Check if tmux pane still exists (tmux has-session)
   b. If exists and process alive: mark session RECOVERED, update lastSeen
   c. If pane gone: mark session LOST, notify CEO via Telegram
3. Emit audit event: session_recovered or session_lost per session
4. Resume monitoring
```

---

## Key Deliverables

1. **`src/bridge/launcher/unified-launcher.ts`** — `UnifiedLauncher` class: startup sequence (lock acquisition, session store load, recovery pass, event loop), `startSession(options: LaunchOptions): BridgeSession`, `stopSession(sessionId: string)`, `stopAll()`. Emits typed events for monitoring integration.

2. **`src/bridge/launcher/lock-manager.ts`** — `LockManager`: acquire (with stale lock detection), release (on clean shutdown), `isRunning()` check. Lock file path: `~/.endiorbot/launcher.lock`.

3. **`src/bridge/launcher/process-monitor.ts`** — `ProcessMonitor`: 15s polling loop per active session, liveness check via `providerPid`, crash detection, auto-restart using existing `SoulLoader`/`TeamRegistry`, CEO Telegram notification on recovery.

4. **`src/bridge/launcher/session-store.ts`** — Persistent JSON store at `~/.endiorbot/sessions.json`. CRUD for `BridgeSession` with `providerPid` and `tmuxPaneId` fields. Atomic write (write to `.tmp` then rename) to prevent corruption.

5. **`BridgeSession` type extension** — Add `providerPid?: number`, `tmuxPaneId?: string`, `launcherStartTime?: number` to `src/bridge/types.ts`. Additive only — no existing field renamed or removed.

6. **`endiorbot bridge launcher` CLI subcommand** — `start` (daemonize or foreground with `--fg`), `stop`, `status` (shows running sessions + launcher uptime). Registered in `src/cli/commands/bridge.ts`.

---

## Test Plan (~15 tests)

### Launcher Creation + Startup (3 tests)

| Test | Description |
|------|-------------|
| Clean start | Launcher starts, acquires lock, enters event loop |
| Stale lock removed | Dead PID in lock file → stale lock removed, launcher starts |
| Duplicate prevented | Live PID in lock file → launcher exits with "already running" message |

### PID Tracking (2 tests)

| Test | Description |
|------|-------------|
| PID stored | `providerPid` written to session store after launch |
| Liveness check | `process.kill(pid, 0)` correctly distinguishes alive vs. exited |

### Crash Detection + Auto-Restart (3 tests)

| Test | Description |
|------|-------------|
| Solo crash detected | Solo session process exit detected within 15s poll |
| Auto-restart solo | Same SOUL context re-launched, new PID persisted |
| Team leader crash | Team leader crash triggers restart with `{teamId}-team.md` context |

### Session Recovery on Restart (4 tests)

| Test | Description |
|------|-------------|
| tmux pane alive | Pane present and process alive → session marked RECOVERED |
| tmux pane gone | Pane absent → session marked LOST, CEO notified |
| Multiple sessions | Recovery pass handles N sessions without race conditions |
| Audit events | `session_recovered` and `session_lost` events written correctly |

### Re-Attach (3 tests)

| Test | Description |
|------|-------------|
| `tmuxPaneId` persisted | Pane ID written to session store on launch |
| Re-attach after restart | Launcher restart re-attaches to existing pane via `tmuxPaneId` |
| Session continuity | CEO can `/send` to recovered session without re-launching |

---

## Milestone

Sprint 92 completes the **Bridge and Intelligence system** for EndiorBot v2.0:

| Sprint | Capability |
|--------|-----------|
| 82–83 | Notification Bridge + Copilot CLI Remote Shell |
| 84 | SOUL Bridge Foundation (agent roles, install-agents) |
| 85 | Permission Approval via Telegram |
| 86 | /send Command + Hook Installer |
| 87 | Brain L4 + Context Anchoring in Bridge |
| 88 | Evaluator + Vibecoding in Bridge Output Pipeline |
| 89 | Agent Teams — Team File Generation |
| 90 | Agent Teams — Telegram Integration + Smart Routing |
| 91 | Agent Teams — Monitoring + Lifecycle |
| **92** | **Unified App Launcher** — infrastructure complete |

---

## Next Sprints

| Sprint | Scope |
|--------|-------|
| 93+ | TBD — v2.1 planning based on post-launch CEO feedback |
