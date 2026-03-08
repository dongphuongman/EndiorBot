---
spec_id: SPEC-04BUILD-SPRINT83
title: "Sprint 83: Copilot CLI Bridge + Repo Context + Managed Shell"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-07
last_updated: 2026-03-07
related_adrs: ["ADR-024"]
---

# Sprint 83: Copilot CLI Bridge + Repo Context + Managed Shell

**Date:** 2026-03-07
**Gate:** G-Sprint
**Authority:** ADR-024 (D4 Managed Shell Sessions, D5 Copilot CLI as ToolBridge, A7 ExecRunner, A8 UUID Marker)
**Preceding sprint:** Sprint 82.5 (Bridge Telegram Wiring)
**PM Review:** 10 points + 5 ACs, all resolved
**CTO Review:** 3 blocks (BLOCK-1–3) resolved, 3 warnings (W-1–3) addressed, 4 conditions (C1–C4)
**CPO Review:** APPROVED, 3 advisory conditions (CA4–CA6)

---

## Goal

CEO manages repositories, uses GitHub Copilot CLI, and runs shell commands remotely from Telegram. Three new capability tiers:

1. **Repo Context** — `/focus`, `/where`, `/repos` — set which repo commands target
2. **Copilot CLI** — `/cp suggest`, `/cp explain`, `/cp status` — one-shot AI tool via ToolBridge
3. **Managed Shell** — `/sh` (read-only allowlist), `/attach` (capture), `/run` (approval-gated)

**Security model**: Actor identity + read-only allowlist + approval gate + output redaction + audit trail.

---

## New Telegram Commands

| Command | Type | Risk | Approval | Description |
|---------|------|------|----------|-------------|
| `/focus <name>` | Context | None | No | Set repo for current chat |
| `/where` | Context | None | No | Show current focus/workdir |
| `/repos` | Context | None | No | List registered repos |
| `/cp suggest <task>` | One-shot | LOW | No | Copilot suggest in focused repo |
| `/cp explain <cmd>` | One-shot | LOW | No | Copilot explain command |
| `/cp status` | One-shot | LOW | No | Show toolKind + version + path (+ install hint) |
| `/sh <cmd>` | Read-only | LOW | No | Allowlist-only read commands in tmux |
| `/attach` | Capture | LOW | No | Capture last N lines from shell tmux pane |
| `/run <cmd>` | Any command | HIGH | **Always** | One-shot exec after CEO approval |

---

## User Stories

### US-1: Repo Context (`/focus`, `/where`, `/repos`)

```gherkin
Feature: Repo Context Management

  Scenario: Register a repo
    GIVEN repos.json exists at ~/.endiorbot/repos.json
    WHEN admin calls RepoRegistry.add("endiorbot", "/home/deploy/EndiorBot")
    THEN repo is stored with name, path, registeredAt
    AND file is atomically written with version + checksum

  Scenario: /repos add validates path
    GIVEN path "/etc/passwd" does not have .git directory
    WHEN /repos add is attempted with that path
    THEN rejected: "Directory must contain .git"

  Scenario: /repos add rejects path traversal
    GIVEN path "../../etc" contains traversal segments
    WHEN /repos add is attempted
    THEN rejected: "Path traversal not allowed"

  Scenario: /repos add rejects relative paths
    GIVEN path "relative/path" is not absolute
    WHEN /repos add is attempted
    THEN rejected: "Path must be absolute"

  Scenario: /focus sets repo for current chat
    GIVEN repo "endiorbot" exists in registry
    WHEN CEO sends "/focus endiorbot" in chat 12345
    THEN ChatFocus.setFocus("12345", "endiorbot")
    AND responds with repo name + path

  Scenario: /where shows current focus
    GIVEN chat 12345 is focused on "endiorbot"
    WHEN CEO sends "/where"
    THEN responds: repo name, path, default branch

  Scenario: /repos lists all registered repos
    GIVEN 2 repos registered
    WHEN CEO sends "/repos"
    THEN lists both repos with name, path, riskProfile

  Scenario: No focus graceful message (CPO CA6)
    GIVEN chat has no /focus set
    WHEN CEO sends "/sh git status"
    THEN responds "No repo focused. Use /focus <name> or /repos to list available repos."
    AND does NOT crash or throw
```

### US-2: Copilot CLI Bridge (`/cp`)

```gherkin
Feature: Copilot CLI Bridge

  Scenario: /cp status shows detected runtime
    GIVEN copilot binary is installed at /usr/local/bin/copilot
    WHEN CEO sends "/cp status"
    THEN responds with: toolKind=copilot-cli, version, path

  Scenario: /cp status when no copilot installed
    GIVEN neither copilot nor gh copilot is available
    WHEN CEO sends "/cp status"
    THEN responds: "Copilot CLI not found. Install: github/copilot-cli"

  Scenario: /cp status detects deprecated gh copilot
    GIVEN gh copilot outputs "deprecated" in version string
    WHEN detect() runs
    THEN returns kind="none", notes="gh copilot deprecated"

  Scenario: /cp suggest runs task in focused repo
    GIVEN chat is focused on "endiorbot"
    AND copilot CLI is detected
    WHEN CEO sends "/cp suggest list files recursively"
    THEN CopilotBridge.suggest("list files recursively", repo.path)
    AND execFile runs with 15s timeout
    AND output is ANSI-stripped, redacted, capped at 3500 chars
    AND audit logs "copilot_suggest"

  Scenario: /cp explain explains a command
    GIVEN chat is focused AND copilot detected
    WHEN CEO sends "/cp explain find . -name '*.ts'"
    THEN CopilotBridge.explain("find . -name '*.ts'", repo.path)
    AND returns explanation (ANSI-stripped, redacted)

  Scenario: /cp suggest without focus
    GIVEN chat has no /focus
    WHEN CEO sends "/cp suggest anything"
    THEN responds "No repo focused..." (CPO CA6)

  Scenario: Runtime detection priority
    GIVEN both copilot and gh copilot are available
    WHEN detect() runs
    THEN prefers copilot-cli over gh-copilot

  Scenario: Capability probe before first use
    GIVEN copilot binary exists
    WHEN detect() runs
    THEN probes "copilot suggest --help" to verify flags
    AND if probe fails: kind="none", notes="copilot present but incompatible flags"
```

### US-3: Managed Shell — Read-Only (`/sh`)

```gherkin
Feature: Read-Only Shell via Telegram

  Scenario: /sh with allowed command
    GIVEN chat focused on "endiorbot"
    WHEN CEO sends "/sh git status"
    THEN ShellAllowlist.isAllowed("git status") returns true
    AND ShellSessionManager creates/reuses tmux session in endiorbot-shell
    AND sends command with UUID marker: cmd; echo "__ENDIORBOT_<uuid>__:$?"
    AND polls capturePane every 500ms until marker found or 30s timeout
    AND extracts output + exitCode from marker
    AND redacts via redactBridgeOutput(output, "read")
    AND sends to Telegram
    AND audit logs "shell_send"

  Scenario: /sh with blocked command (rm)
    GIVEN CEO sends "/sh rm -rf /"
    THEN ShellAllowlist.isAllowed("rm -rf /") returns false
    AND responds "Command not in read-only allowlist. Use /run <cmd> (approval required)."

  Scenario: /sh with find -exec blocked
    GIVEN CEO sends "/sh find . -exec cat {} ;"
    WHEN allowlist checks for -exec flag
    THEN returns false (find with -exec is blocked)

  Scenario: /sh with find -delete blocked
    GIVEN CEO sends "/sh find . -name '*.tmp' -delete"
    WHEN allowlist checks for -delete flag
    THEN returns false

  Scenario: /sh with cat outside repo workdir blocked
    GIVEN CEO sends "/sh cat ~/.ssh/id_rsa"
    WHEN allowlist checks path
    THEN returns false (path outside repo workdir)

  Scenario: /sh with git diff --no-index blocked
    GIVEN CEO sends "/sh git diff --no-index /etc/passwd"
    WHEN allowlist checks for --no-index flag
    THEN returns false (arbitrary file read)

  Scenario: /sh command timeout
    GIVEN command takes > 30 seconds
    WHEN poll reaches 30s without finding marker
    THEN returns partial capture with timedOut=true
    AND responds with partial output + "(timed out)"

  Scenario: /sh without focus
    GIVEN chat has no /focus
    WHEN CEO sends "/sh git status"
    THEN responds "No repo focused..." (CPO CA6)

  Scenario: /sh per-repo concurrency limit
    GIVEN 1 command already in-flight for repo "endiorbot"
    WHEN CEO sends another "/sh git log"
    THEN command is queued (max queue depth: 3)
    AND if queue full: rejected with "Too many pending commands"
```

### US-4: Managed Shell — Capture (`/attach`)

```gherkin
Feature: Shell Pane Capture

  Scenario: /attach captures shell output
    GIVEN shell session exists for focused repo
    WHEN CEO sends "/attach" or "/attach 50"
    THEN captures last N lines from endiorbot-shell tmux pane
    AND redacts via redactBridgeOutput()
    AND sends to Telegram
    AND audit logs "shell_capture"

  Scenario: /attach without shell session
    GIVEN no shell session exists for focused repo
    WHEN CEO sends "/attach"
    THEN responds "No shell session. Use /sh <cmd> to start one."
```

### US-5: Managed Shell — Approval-Gated (`/run`)

```gherkin
Feature: Approval-Gated Command Execution

  Scenario: /run submits for approval
    GIVEN chat focused on "endiorbot"
    WHEN CEO sends "/run npm test"
    THEN computes commandDigest = sha256("npm test" + "endiorbot" + timestamp)
    AND creates approval request showing FULL command text (CTO W-3)
    AND responds "Approval required. Sent to approval queue."
    AND audit logs "run_request"

  Scenario: /run approved — executes command
    GIVEN approval request exists for "/run npm test"
    WHEN CEO sends "/approve <approvalId>"
    THEN verifies approvalId matches stored commandDigest
    AND executes: ExecRunner.exec("/bin/bash", ["-lc", "npm test"], {
         cwd: repo.path, timeout: 30000,
         env: buildCleanEnv(repo.envAllowlist)
       })
    AND redacts output via redactBridgeOutput(output, "interactive")
    AND sends result to Telegram (exit code + output)
    AND audit logs "run_executed"

  Scenario: /run rejected
    GIVEN approval request exists
    WHEN CEO sends "/reject <approvalId>"
    THEN cancels execution
    AND audit logs "run_rejected"

  Scenario: /run without focus
    GIVEN chat has no /focus
    WHEN CEO sends "/run anything"
    THEN responds "No repo focused..." (CPO CA6)

  Scenario: /run environment is clean (CPO CA5)
    GIVEN repo has envAllowlist = ["NODE_ENV"]
    WHEN /run executes
    THEN env contains only: PATH, HOME, LANG, NODE_ENV
    AND does NOT leak ENDIORBOT_*, API keys, or other env vars

  Scenario: /run approval shows full command (CTO W-3)
    GIVEN CEO sends "/run rm -rf node_modules && npm install"
    WHEN approval message is sent to Telegram
    THEN message shows exact command: "rm -rf node_modules && npm install"
    AND CEO can see exactly what they are approving
```

---

## `/sh` Read-Only Allowlist

Positive allowlist — only these commands are permitted:

| Category | Allowed Commands |
|----------|-----------------|
| **Git (read)** | `git status`, `git diff`, `git log`, `git branch`, `git show`, `git remote -v` |
| **File inspection** | `ls`, `cat`, `head`, `tail`, `wc`, `file` |
| **Search** | `find` (no `-exec`, `-execdir`, `-delete`, `-ok`), `rg`, `grep` |
| **Version checks** | `node -v`, `pnpm -v`, `npm -v`, `tsc --version` |
| **Build (dry-run)** | `pnpm test -- --listTests`, `pnpm build --dry-run` |
| **Env inspection** | `env | grep ENDIORBOT` (filtered) |

**Blocked examples** (test cases required):

| Input | Result | Reason |
|-------|--------|--------|
| `find -exec` | BLOCKED | Arbitrary command execution |
| `find -delete` | BLOCKED | File deletion |
| `git diff --no-index /etc/passwd` | BLOCKED | Arbitrary file read |
| `cat ~/.ssh/id_rsa` | BLOCKED | Path outside repo workdir |
| `sudo anything` | BLOCKED | Privilege escalation |
| `rm`, `mv`, `cp`, `chmod` | BLOCKED | Write operations |
| `curl`, `wget` | BLOCKED | Network operations |
| `python -c`, `node -e` | BLOCKED | Arbitrary code execution |

Any command not in allowlist → "Command not in read-only allowlist. Use `/run <cmd>` (approval required)."

---

## Architecture

```
Telegram Commands (Sprint 83)
├── /focus, /where, /repos     → RepoContextManager (per-chat focus)
├── /cp suggest, /cp explain   → CopilotBridge (ToolBridge, one-shot execFile)
├── /sh <read-only cmd>        → ShellSessionManager → TmuxBridge (allowlist-only)
├── /attach                    → ShellSessionManager → TmuxBridge (capture pane)
└── /run <any cmd>             → ApprovalQueue → ExecRunner (approval-gated, execFile)
        ↓                               ↓                    ↓
   bridge-audit.ts           shell-allowlist.ts       output-redactor.ts
   (actorId+chatId+hash)     (positive allowlist)     (secrets scrubbed)
```

### Security Stack (per ADR-024 D4)

```
Agent Panes (endiorbot session)         Shell Sessions (endiorbot-shell session)
├── shellPanesDisabled = true           ├── /sh: read-only allowlist ONLY
├── sendKeys blocked for shell cmds     ├── /run: always approval-gated
├── riskMode governs input              ├── /attach: capture only
└── Controlled by AgentLauncher         └── Controlled by ShellSessionManager

These are SEPARATE execution paths — agent pane protection is UNCHANGED.
```

---

## Technical Design

### Block 1: Repo Context (Foundation)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/bridge/repo/types.ts` | ~40 | `RepoConfig`, `ReposRegistryFile`, `ChatFocus`, `ChatFocusRegistryFile` |
| `src/bridge/repo/repo-registry.ts` | ~120 | File-backed CRUD at `~/.endiorbot/repos.json`. Atomic writes, version+checksum. Methods: `add()`, `get()`, `list()`, `remove()`. Path validation: exists + has `.git` + no traversal + absolute (CPO CA4). |
| `src/bridge/repo/chat-focus.ts` | ~60 | Per-chatId focus at `~/.endiorbot/chat-focus.json`. Methods: `getFocus()`, `setFocus()`, `clearFocus()`. |
| `src/bridge/repo/index.ts` | ~5 | Barrel exports |

### Block 2: Copilot CLI Bridge

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/bridge/copilot/copilot-bridge.ts` | ~150 | ToolBridge with runtime detection. Methods: `detect()`, `suggest()`, `explain()`, `getStatus()`. 15s timeout. ANSI stripping. Output via `redactBridgeOutput()`. Uses `ExecRunner` (DI). Output capped at 3500 chars. |
| `src/bridge/copilot/index.ts` | ~5 | Barrel exports |

**Runtime detection strategy (`detect()`):**

```
1. command -v copilot → if found:
   a. copilot --version → if exits 0 → kind: "copilot-cli"
   b. copilot suggest --help → capability probe (verify flags)
   c. if probe fails → kind: "none", notes: "copilot present but incompatible"
2. command -v gh → if found:
   a. gh copilot --version → if exits 0 AND stdout !contains "deprecated"
      → kind: "gh-copilot"
3. Otherwise → kind: "none", notes: "Install: github/copilot-cli"
```

**Return type:**
```typescript
interface CopilotDetectResult {
  kind: "copilot-cli" | "gh-copilot" | "none";
  version?: string;
  path?: string;
  notes?: string;
}
```

### Block 3: Shell Session Manager

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/bridge/shell/types.ts` | ~30 | `TmuxClient` interface (DI), `ShellAllowlistResult`, `MarkerResult`, `CommandQueueEntry` |
| `src/bridge/shell/shell-allowlist.ts` | ~80 | Read-only command allowlist. `isAllowed(cmd): boolean`. Pattern-based. |
| `src/bridge/shell/shell-session-manager.ts` | ~200 | Per-repo tmux sessions in `endiorbot-shell`. UUID marker protocol (A8). Methods: `getOrCreateSession()`, `sendCommand()`, `captureOutput()`, `killSession()`. Per `{actorId, repo}`: max 1 in-flight, queue max 3. |
| `src/bridge/shell/index.ts` | ~5 | Barrel exports |

**Per-invocation UUID marker protocol (CTO W-1, A8):**

```typescript
async sendCommand(repo: string, cmd: string): Promise<MarkerResult> {
  const marker = `__ENDIORBOT_${randomUUID().slice(0, 8)}__`;
  const fullCmd = `${cmd}; echo "${marker}:$?"`;

  await this.tmux.sendKeys(target, fullCmd);

  // Poll every 500ms, max 30s
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const capture = await this.tmux.capturePane(target, 200);
    const markerIdx = capture.indexOf(`${marker}:`);
    if (markerIdx !== -1) {
      const exitCode = parseInt(capture.slice(markerIdx + marker.length + 1), 10);
      const output = extractBetween(capture, cmd, marker);
      return {
        output: redactBridgeOutput(output, "read").content,
        exitCode,
        timedOut: false,
      };
    }
  }
  return { output: partialCapture, exitCode: -1, timedOut: true };
}
```

### Block 4: Telegram Integration

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/channels/telegram/remote-commands.ts` | ~250 | 9 command handlers. All check `getLinkedActorId()` + `shellActorAllowlist`. No-focus → friendly message (CPO CA6). |

### Modified Files

| File | Changes |
|------|---------|
| `src/bridge/types.ts` | Add `ExecRunner` interface, `ExecOpts`, `ExecResult`. Extend `BridgeAuditEventType` with: `repo_focus`, `copilot_detect`, `copilot_suggest`, `copilot_explain`, `shell_send`, `shell_capture`, `run_request`, `run_approved`, `run_rejected`, `run_executed`. |
| `src/bridge/security/bridge-policy.ts` | Add `shellSessionsPerRepo` (default 1), `maxShellSessions` (default 3), `shellActorAllowlist: string[]` to `BridgePolicy`. |
| `src/bridge/security/output-redactor.ts` | Add ANSI escape code stripping to `redactBridgeOutput()`. |
| `src/bridge/index.ts` | Add barrel exports for `repo/`, `copilot/`, `shell/`. |
| `src/channels/telegram/telegram-commands.ts` | Add switch cases for 9 new commands; update help with Remote Shell section. |
| `scripts/telegram-poll.mjs` | Wire 9 new commands. |
| `docs/02-design/01-ADRs/ADR-024-Notification-Bridge.md` | D4 + D5 + A7 + A8 added (Sprint 82.5 prerequisite). |

---

## ExecRunner Contract (CTO C3, A7)

```typescript
// Defined in src/bridge/types.ts (single definition)
interface ExecOpts {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecRunner {
  exec(binary: string, args: string[], opts?: ExecOpts): Promise<ExecResult>;
}
```

**Implementation rules:**
- MUST use `execFile()` from `node:child_process`
- NEVER `exec()`, `spawn({shell: true})`, or `child_process.exec()`
- Matches TmuxBridge pattern from Sprint 82
- Test suites mock `ExecRunner` — no real subprocess in unit tests

**`/run` execution model:**
```typescript
ExecRunner.exec("/bin/bash", ["-lc", cmd], {
  cwd: repo.path,
  timeout: 30000,
  env: buildCleanEnv(repo.envAllowlist),
});
```

**`buildCleanEnv()` (CPO CA5):**
```typescript
function buildCleanEnv(allowlist: string[] = []): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    LANG: process.env.LANG ?? "en_US.UTF-8",
  };
  for (const key of allowlist) {
    const val = process.env[key];
    if (val !== undefined) env[key] = val;
  }
  return env;
}
```

---

## Repo Config

File: `~/.endiorbot/repos.json`

```json
{
  "version": 1,
  "checksum": "sha256...",
  "repos": [
    {
      "name": "endiorbot",
      "path": "/home/deploy/projects/EndiorBot",
      "registeredAt": "2026-03-07T...",
      "defaultBranch": "main",
      "riskProfile": "dev"
    }
  ]
}
```

**RepoConfig fields:**
- `name`, `path`, `registeredAt` — required
- `defaultBranch` — optional (for context display)
- `riskProfile`: `"read-only"` | `"dev"` | `"deploy"` — optional, default `"read-only"`
- `envAllowlist`: `string[]` — optional, env var names for `/run`; default empty

**`/repos add` validation (CPO CA4):**
- Directory must exist on server
- Must contain `.git` directory
- No path traversal (`..` segments rejected)
- Path must be absolute

---

## Security

### Actor Identity (PM guardrail #4)

- Every remote command requires `actorId` (Telegram userId) in `shellActorAllowlist`
- Rate limit: per actorId (via BridgePolicyManager)
- Audit log mandatory fields: `actorId`, `chatId`, `repo`, `riskMode`, `commandHash`
- Audit log NEVER logs raw secrets — hash + truncated preview

### `shellPanesDisabled` vs ShellSessionManager (ADR-024 D4)

- `shellPanesDisabled = true` blocks sendKeys to **agent panes** — UNCHANGED
- ShellSessionManager operates in **separate** `endiorbot-shell` tmux session
- `/sh` uses tmux sendKeys but ONLY for allowlisted read-only commands
- `/run` uses `ExecRunner.exec()` (execFile) directly — does NOT use tmux sendKeys
- Architecturally different execution paths

### Approval Binding (PM guardrail #6)

- Approval record: `approvalId` ↔ `actorId` ↔ `chatId` ↔ `repoName` ↔ `commandDigest`
- `commandDigest = sha256(cmd + repoName + requestTimestamp)`
- Telegram approval message shows **full command text** (CTO W-3)
- On approve: execute exactly the command that was hashed — no edit/substitute

### Reused Security Modules (CTO C1)

| Module | Reuses From |
|--------|-------------|
| CopilotBridge output | `redactBridgeOutput()` from `output-redactor.ts` |
| ShellSessionManager output | `redactBridgeOutput()` from `output-redactor.ts` |
| ShellAllowlist | **New** module (positive read-only patterns) |
| Rate limits | `BridgePolicyManager` from `bridge-policy.ts` |
| Audit trail | `BridgeAuditLogger` from `bridge-audit.ts` |
| `/run` approval | `createApprovalRequestWithEvents()` from `events.ts` |

---

## Test Plan

### Unit Tests (~93 new tests)

| Test File | Cases | Coverage |
|-----------|-------|----------|
| `tests/bridge/repo/repo-registry.test.ts` | ~15 | CRUD, atomic writes, path validation (exists, .git, traversal, absolute) |
| `tests/bridge/repo/chat-focus.test.ts` | ~10 | get/set/clear focus per chatId, concurrent chats |
| `tests/bridge/copilot/copilot-bridge.test.ts` | ~15 | detect() (copilot-cli, gh-copilot, none, deprecated), suggest(), explain(), ANSI strip, timeout, mocked ExecRunner |
| `tests/bridge/shell/shell-allowlist.test.ts` | ~15 | Allowed commands, blocked commands (find -exec, cat ~/.ssh, git diff --no-index, sudo, rm, curl, python -c) |
| `tests/bridge/shell/shell-session-manager.test.ts` | ~18 | UUID marker protocol, poll loop, timeout, exitCode parsing, queue limits, concurrent commands, mocked TmuxClient |
| `tests/channels/telegram/remote-commands.test.ts` | ~20 | All 9 handlers: identity guard, no-focus message, happy path, error cases |
| **Total** | **~93** | |

### Security Edge Cases (mandatory test cases)

| Input | Handler | Expected | Why |
|-------|---------|----------|-----|
| `/sh find . -exec cat {} ;` | ShellAllowlist | BLOCKED | `-exec` enables arbitrary execution |
| `/sh find . -execdir rm {} ;` | ShellAllowlist | BLOCKED | `-execdir` variant |
| `/sh find . -delete` | ShellAllowlist | BLOCKED | File deletion |
| `/sh find . -ok rm {} ;` | ShellAllowlist | BLOCKED | `-ok` variant |
| `/sh cat ~/.ssh/id_rsa` | ShellAllowlist | BLOCKED | Path outside repo workdir |
| `/sh git diff --no-index /etc/passwd` | ShellAllowlist | BLOCKED | Arbitrary file read |
| `/sh sudo anything` | ShellAllowlist | BLOCKED | Privilege escalation |
| `/sh rm -rf /` | ShellAllowlist | BLOCKED | Destructive |
| `/sh curl evil.com` | ShellAllowlist | BLOCKED | Network access |
| `/sh python -c "import os"` | ShellAllowlist | BLOCKED | Code execution |
| `/sh node -e "process.exit()"` | ShellAllowlist | BLOCKED | Code execution |
| `/cp suggest` without `/focus` | remote-commands | "No repo focused..." | CPO CA6 |
| `/sh` without `/focus` | remote-commands | "No repo focused..." | CPO CA6 |
| `/run` without `/focus` | remote-commands | "No repo focused..." | CPO CA6 |

### DI Interfaces for Testing

```typescript
// ExecRunner — mocked in unit tests
const mockExec: ExecRunner = {
  async exec(binary, args, opts) {
    return { stdout: "mocked output", stderr: "", exitCode: 0 };
  },
};

// TmuxClient — mocked in unit tests
const mockTmux: TmuxClient = {
  async createSession(name, cmd) { return { target: "test:0", sessionName: "test" }; },
  async sendKeys(target, text) {},
  async capturePane(target, lines) { return "$ git status\nnothing to commit\n__ENDIORBOT_abc12345__:0\n"; },
  async killWindow(target) {},
};
```

---

## Key Flows

### `/cp suggest <task>`

```
1. Verify actorId in shellActorAllowlist
2. ChatFocus.getFocus(chatId) → if null: "No repo focused..." (CA6)
3. CopilotBridge.suggest(task, repo.path)
   → detect() → copilot-cli or gh-copilot
   → ExecRunner.exec(binary, args, { cwd: repo.path, timeout: 15000 })
   → stripAnsi(stdout)
   → redactBridgeOutput(stdout, "read")
   → truncate to 3500 chars
4. BridgeAudit.log("copilot_suggest", { actorId, chatId, task, repo, toolKind })
5. Send to Telegram
```

### `/sh <cmd>`

```
1. Verify actorId in shellActorAllowlist
2. ChatFocus.getFocus(chatId) → if null: "No repo focused..."
3. ShellAllowlist.isAllowed(cmd) → if false: "Use /run (approval required)"
4. ShellSessionManager.sendCommand(repo, cmd)
   → marker = __ENDIORBOT_${uuid.slice(0,8)}__
   → tmux.sendKeys(target, cmd + '; echo "' + marker + ':$?"')
   → poll capturePane every 500ms until marker or 30s timeout
   → parse exitCode, extract output
   → redactBridgeOutput(output, "read")
5. BridgeAudit.log("shell_send", { actorId, chatId, cmd, repo, cmdHash, exitCode })
6. Send to Telegram
```

### `/run <cmd>`

```
1. Verify actorId in shellActorAllowlist
2. ChatFocus.getFocus(chatId) → if null: "No repo focused..."
3. commandDigest = sha256(cmd + repo.name + timestamp)
4. createApprovalRequestWithEvents("action", "Run: <cmd> in <repo>", {
     details: { actorId, chatId, repo: repo.name, cmd, commandDigest }
   })
5. Send approval alert — shows FULL command text (CTO W-3)
6. Wait for /approve or /reject
7. On approve: verify approvalId matches commandDigest
8. ExecRunner.exec("/bin/bash", ["-lc", cmd], {
     cwd: repo.path, timeout: 30000,
     env: buildCleanEnv(repo.envAllowlist)
   })
9. redactBridgeOutput(output, "interactive")
10. BridgeAudit.log("run_executed", { actorId, chatId, cmd, repo, cmdHash, exitCode })
11. Send result to Telegram
```

---

## Implementation Order

1. `src/bridge/repo/types.ts` → `repo-registry.ts` → `chat-focus.ts` + tests
2. `src/bridge/types.ts` extensions (audit events, ExecRunner interface)
3. `src/bridge/copilot/copilot-bridge.ts` with detect + capability probe + ANSI strip + tests
4. `src/bridge/shell/types.ts` → `shell-allowlist.ts` → `shell-session-manager.ts` with UUID marker + tests
5. `src/bridge/security/bridge-policy.ts` extensions (shell limits, actor allowlist)
6. `src/bridge/security/output-redactor.ts` ANSI stripping
7. `src/channels/telegram/remote-commands.ts` + tests
8. Wire into `telegram-commands.ts` + `telegram-poll.mjs`
9. Update `src/bridge/index.ts` barrel exports
10. `pnpm build` clean + `pnpm test`

---

## Regression Gate (CTO C4)

```bash
pnpm build     # must be clean, no errors, no new `any` types
pnpm test      # must pass 5475+ tests (5382 Sprint 82.5 + ~93 new)
```

---

## Dependencies

- **Sprint 82.5** (prerequisite): 6 bridge command handlers wired into Telegram
- **ADR-024 v1.1.0** (prerequisite): D4, D5, A7, A8 amendments
- **Sprint 82 core modules** (DONE): TmuxBridge, SessionRegistry, AgentLauncher, 4-layer security
- **Preferred**: `copilot` CLI binary (`github/copilot-cli`)
- **Optional fallback**: `gh copilot` only if present and not deprecated
- **Graceful degradation**: `/cp status` reports missing + install instructions
- **Existing approval system**: `/approve`, `/reject` (already working)

---

## Sign-off Conditions Traceability

### CTO Conditions

| # | Condition | Resolution |
|---|-----------|------------|
| C1 | Sprint 82 Telegram wiring complete first | Sprint 82.5 prerequisite |
| C2 | ADR-024 D4 amendment | D4+D5+A7+A8 in ADR-024 v1.1.0 |
| C3 | ExecRunner uses execFile only | Contract defined in types.ts; never exec/spawn |
| C4 | 5475+ tests, pnpm build clean, no any | Regression gate at end |

### CTO Warnings

| # | Warning | Resolution |
|---|---------|------------|
| W-1 | Static marker collision | UUID marker: `__ENDIORBOT_${uuid.slice(0,8)}__` |
| W-2 | ExecRunner must use execFile | Contract explicit in types.ts |
| W-3 | /run approval must show full command | Approval alert displays full command text |

### PM Acceptance Criteria

| # | Criterion | Resolution |
|---|-----------|------------|
| AC1 | CopilotBridge works with copilot v1.0.2 | Capability probe via --help; no hardcoded flags |
| AC2 | detect() identifies deprecated gh-copilot | String match on "deprecated" in stdout |
| AC3 | Random marker per command | UUID-based, per-invocation |
| AC4 | /sh allowlist 100% enforced | 11+ edge case test scenarios |
| AC5 | /run execute model defined | execFile("/bin/bash", ["-lc", cmd]) |

### CPO Advisory

| # | Advisory | Resolution |
|---|----------|------------|
| CA4 | /repos add path validation | exists + .git + no traversal + absolute |
| CA5 | envAllowlist limits | buildCleanEnv() = PATH+HOME+LANG + allowlist only |
| CA6 | No-focus graceful message | "No repo focused. Use /focus or /repos" |

---

## Definition of Done

- [ ] All new files created and building clean
- [ ] 93+ new tests passing
- [ ] Total test count 5475+ (regression gate C4)
- [ ] No new `any` types
- [ ] `/repos` → lists registered repos
- [ ] `/focus <name>` → sets chat focus
- [ ] `/where` → shows focused repo
- [ ] `/cp status` → shows Copilot CLI detection (kind, version, path)
- [ ] `/cp suggest <task>` → returns copilot output (ANSI-stripped, redacted, capped)
- [ ] `/cp explain <cmd>` → returns explanation
- [ ] `/sh git status` → marker-based capture, redacted
- [ ] `/sh rm -rf /` → BLOCKED by allowlist
- [ ] `/sh find -exec` → BLOCKED
- [ ] `/sh cat ~/.ssh/id_rsa` → BLOCKED (path outside repo)
- [ ] `/attach` → captures from shell tmux pane
- [ ] `/run npm test` → approval alert with full command → approve → execFile → result
- [ ] No-focus commands → "No repo focused..." (never crash)
- [ ] Audit: all actions logged with actorId, chatId, commandHash
- [ ] ExecRunner uses execFile() only (verified by code review)
- [ ] buildCleanEnv() passes only PATH+HOME+LANG + allowlist
