# TS-011: CLI Session Mode (Interactive REPL)

**Status:** CTO Reviewed (3 blocking issues fixed)
**Date:** 2026-03-03
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** 73 (Post E2E Testing Phase)

---

## 1. Overview

The CLI Session Mode provides a persistent REPL (Read-Eval-Print Loop) interface for EndiorBot. Instead of running single commands that exit immediately, the session mode keeps the process alive, maintaining loaded context (GateEngine, active project, config) across multiple commands.

**Identity:** Solo Developer Power Tool — interactive mode for faster iteration without repeated startup cost.

**Command:** `endiorbot shell` (primary) or `endiorbot -i` (shorthand)

---

## 2. Problem Statement

### Current Behavior
```bash
$ endiorbot gate status        # loads config, evaluates, prints, exits
$ endiorbot gate confirm G0    # loads config again, confirms, exits
$ endiorbot gate status        # loads config again, evaluates, prints, exits
```

Each invocation:
- Parses CLI arguments (~10ms)
- Loads .env files (~5ms)
- Resolves state directory (~5ms)
- Loads active project config (~10ms)
- Creates GateEngine instance (~20ms)
- Reads gate confirmations from disk (~10ms)

**Total overhead per command: ~60ms** (acceptable individually, but adds up in workflows)

### Desired Behavior
```bash
$ endiorbot shell
EndiorBot v1.0.0 — Interactive Mode
Project: dyad (STANDARD)
Type 'help' for commands, '/exit' to quit.

endiorbot> gate status
  ✅ G0 - Problem Validation  [2/3 — CONFIRMED]
  ...

endiorbot> gate confirm G1 --confirm
  ✅ G1 confirmed.

endiorbot> ops build --path /path/to/dyad
  🔧 Building...

endiorbot> /exit
Goodbye.
```

---

## 3. Commands

### 3.1 `endiorbot shell`

Enter interactive session mode.

```bash
endiorbot shell [--path <path>] [--no-banner]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--path` | Project directory | Active project or cwd |
| `--no-banner` | Skip welcome banner | false |

### 3.2 `endiorbot -i`

Shorthand for `endiorbot shell`.

### 3.3 Session-Only Commands

These commands are available only inside the session:

| Command | Description |
|---------|-------------|
| `/exit` or `/quit` | Exit the session |
| `/clear` | Clear terminal screen |
| `/reload` | Reload config and project context |
| `/history` | Show command history |
| `/status` | Show session info (uptime, project, commands run) |

---

## 4. Architecture

### 4.1 Component Diagram

```
┌──────────────────────────────────────────────────┐
│  SessionManager                                   │
│  ┌─────────────┐  ┌──────────────┐               │
│  │ REPL Engine  │  │ SessionState │               │
│  │ (readline)   │  │ - project    │               │
│  │              │  │ - gateEngine │               │
│  │ prompt >     │──│ - config     │               │
│  │ parse input  │  │ - startTime  │               │
│  │ dispatch     │  │ - cmdCount   │               │
│  └──────┬───────┘  └──────────────┘               │
│         │                                          │
│         ▼                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │ CommandDispatcher                             │ │
│  │                                                │ │
│  │ 1. Check session-only commands (/exit, etc.)  │ │
│  │ 2. Parse as Commander.js subcommand           │ │
│  │ 3. Execute with shared SessionState           │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 4.2 SessionState

```typescript
interface SessionState {
  /** Active project context (loaded once) */
  project: ActiveProjectState | null;

  /** Project path */
  projectPath: string;

  /** Session start time */
  startedAt: Date;

  /** Commands executed count */
  commandCount: number;

  /** Command history */
  history: string[];

  /** Shared GateEngine instance (optional, lazy-loaded) */
  gateEngine?: GateEngine;
}
```

### 4.3 REPL Engine

Uses Node.js `readline` module for input handling:

```typescript
import { createInterface } from "node:readline";

function startREPL(state: SessionState): void {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "endiorbot> ",
    historySize: 100,
  });

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    state.commandCount++;
    state.history.push(input);

    await dispatchCommand(input, state);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye.");
    process.exit(0);
  });

  rl.prompt();
}
```

### 4.4 Command Dispatching

Two-tier dispatch:

1. **Session commands** (`/exit`, `/clear`, `/reload`, `/history`, `/status`) — handled directly
2. **CLI commands** — parsed as if they were `endiorbot <input>` arguments, executed via Commander.js

```typescript
async function dispatchCommand(input: string, state: SessionState): Promise<void> {
  // Tier 1: Session-only commands
  if (input.startsWith("/")) {
    return handleSessionCommand(input, state);
  }

  // Tier 2: CLI commands — split input into argv-style tokens
  const tokens = parseTokens(input);
  // e.g., "gate status" → ["gate", "status"]
  // e.g., "ops build --path /foo" → ["ops", "build", "--path", "/foo"]

  try {
    await executeSubcommand(tokens, state);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
  }
}
```

### 4.5 Command Reuse Strategy

**Key design decision:** Reuse existing Commander.js command registrations.

Instead of duplicating command logic, the session dispatcher creates a fresh `Command` instance per input, registers all commands using the same `register*Command` functions from `cli/commands/index.ts`, and calls `parseAsync` with the tokenized input.

**Note:** There is no `registerAllCommands()` helper in the codebase. The shell module must import and call each `register*Command` function explicitly, mirroring `cli/index.ts`. A `registerAllCommands(program)` wrapper function MUST be created in `shell.ts` (or extracted into `cli/commands/register-all.ts`) to avoid duplication drift between `cli/index.ts` and the session dispatcher.

```typescript
// src/cli/commands/register-all.ts (NEW — extracted helper)
import type { Command } from "commander";
import {
  registerStartCommand, registerSwitchCommand, registerStatusCommand,
  registerGateCommand, registerConsultCommand, registerConfigCommand,
  registerCheckpointCommand, registerResumeCommand, registerQueueCommand,
  registerFixCommand, registerFixStatsCommand, registerGatewayCommand,
  registerBrainCommand, registerEvalCommand, registerSetupCommand,
  registerSecretsCommand, registerAgentCommand, registerEvidenceCommand,
  registerContextCommand, registerWorkflowCommand, registerAnalyticsCommand,
  registerPerformanceCommand, registerInitCommand, registerComplianceCommand,
  registerDevopsCommand,
} from "./index.js";

export function registerAllCommands(program: Command): void {
  registerStartCommand(program);
  registerSwitchCommand(program);
  registerStatusCommand(program);
  registerGateCommand(program);
  registerConsultCommand(program);
  registerConfigCommand(program);
  registerCheckpointCommand(program);
  registerResumeCommand(program);
  registerQueueCommand(program);
  registerFixCommand(program);
  registerFixStatsCommand(program);
  registerGatewayCommand(program);
  registerBrainCommand(program);
  registerEvalCommand(program);
  registerSetupCommand(program);
  registerSecretsCommand(program);
  registerAgentCommand(program);
  registerEvidenceCommand(program);
  registerContextCommand(program);
  registerWorkflowCommand(program);
  registerAnalyticsCommand(program);
  registerPerformanceCommand(program);
  registerInitCommand(program);
  registerComplianceCommand(program);
  registerDevopsCommand(program);
  // NOTE: Do NOT register shell here (avoid recursion)
}
```

**Refactoring:** `cli/index.ts` SHOULD also be updated to use `registerAllCommands()` + `registerShellCommand()`, eliminating the duplicate registration list.

#### Session State: Module-Scoped Context (Not Commander Options)

Commander.js `program.setOptionValue()` does NOT propagate to subcommand action handlers — each action only sees its own command's options. Therefore, session state is managed via a **module-scoped singleton**, not Commander options.

```typescript
// src/cli/session/context.ts (NEW)
let _sessionState: SessionState | null = null;

/** Set by shell.ts at session start */
export function setSessionState(state: SessionState): void {
  _sessionState = state;
}

/** Called by command handlers to check if running in session mode */
export function getSessionState(): SessionState | null {
  return _sessionState;
}

/** Check if currently in session mode */
export function isSessionMode(): boolean {
  return _sessionState !== null;
}
```

Commands that need session awareness (e.g., `gate.ts` to reuse cached GateEngine) can optionally import `getSessionState()`. Commands that don't need it remain unchanged.

```typescript
async function executeSubcommand(tokens: string[], state: SessionState): Promise<void> {
  const program = new Command();
  program.exitOverride(); // Prevent process.exit() in session mode

  // Set module-scoped session context (accessible by command handlers)
  setSessionState(state);

  // Register all commands
  registerAllCommands(program);

  try {
    await executeWithExitGuard(async () => {
      await program.parseAsync(["node", "endiorbot", ...tokens]);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "commander.helpDisplayed") return;
    if ((err as { code?: string }).code === "commander.unknownCommand") {
      console.error(`  Unknown command: ${tokens[0]}`);
      return;
    }
    throw err;
  }
}
```

**Critical: `exitOverride()`** — Prevents Commander.js from calling `process.exit()` on errors or `--help`, which would kill the session.

### 4.6 process.exit() Interception

Existing commands use `process.exit(1)` for error conditions. In session mode, this must NOT terminate the process.

**Strategy:** Override `process.exit` within command execution scope:

```typescript
async function executeWithExitGuard(fn: () => Promise<void>): Promise<number> {
  let exitCode = 0;
  const originalExit = process.exit;

  // @ts-expect-error — intentional override
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new SessionExitSignal(exitCode);
  }) as typeof process.exit;

  try {
    await fn();
  } catch (err) {
    if (err instanceof SessionExitSignal) {
      exitCode = err.code;
    } else {
      throw err;
    }
  } finally {
    process.exit = originalExit;
  }

  return exitCode;
}
```

---

## 5. Prompt Customization

### Default Prompt

```
endiorbot>
```

### With Active Project

```
endiorbot [dyad]>
```

### After Error

```
endiorbot [dyad] ✗>
```

---

## 6. Welcome Banner

```
┌─────────────────────────────────────────────────────────────┐
│  EndiorBot v1.0.0 — Interactive Mode                        │
├─────────────────────────────────────────────────────────────┤
│  Project: dyad (STANDARD)                                   │
│  Gates: G0-G3 ✅  G4 🔒                                     │
│  Session: 2026-03-03 14:30                                  │
├─────────────────────────────────────────────────────────────┤
│  Type 'help' for commands, '/exit' to quit.                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Token Parsing

Handle quoted strings and backslash escape sequences:

```typescript
function parseTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    // Handle backslash escapes: \" \' \\ \<space>
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (inQuote) {
      if (ch === inQuote) { inQuote = null; }
      else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) { tokens.push(current); current = ""; }
    } else {
      current += ch;
    }
  }

  // Trailing backslash treated as literal
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}
```

**Escape handling scope (Sprint 73):**
- `\"` → literal `"` inside or outside quotes
- `\'` → literal `'` inside or outside quotes
- `\\` → literal `\`
- `\ ` → literal space (prevents token split)
- Trailing `\` → treated as literal `\`

**Examples:**
```
consult "What is SDLC?"          → ["consult", "What is SDLC?"]
ops build --path /foo\ bar       → ["ops", "build", "--path", "/foo bar"]
consult "He said \"hello\""      → ["consult", 'He said "hello"']
gate confirm G0 --confirm        → ["gate", "confirm", "G0", "--confirm"]
```

---

## 8. Coexistence with Single-Command Mode

Both modes MUST coexist:

| Mode | Entry | Behavior |
|------|-------|----------|
| Single-command | `endiorbot gate status` | Execute once, exit |
| Session | `endiorbot shell` | REPL, stays alive |
| Shorthand | `endiorbot -i` | Same as `shell` |

No breaking changes to existing single-command mode.

---

## 9. Graceful Shutdown

| Signal | Action |
|--------|--------|
| `/exit` or `/quit` | Clean exit (code 0) |
| `Ctrl+C` (once) | Print "Press Ctrl+C again to exit" |
| `Ctrl+C` (twice) | Force exit |
| `Ctrl+D` (EOF) | Clean exit |
| `SIGTERM` | Clean exit |

---

## 10. Implementation

### Files

| File | Type | Purpose |
|------|------|---------|
| `src/cli/commands/shell.ts` | NEW | Shell command registration, REPL loop |
| `src/cli/commands/register-all.ts` | NEW | `registerAllCommands(program)` helper |
| `src/cli/session/context.ts` | NEW | Module-scoped session state singleton |
| `src/cli/session/exit-interceptor.ts` | NEW | `executeWithExitGuard()`, `SessionExitSignal` |
| `src/cli/session/token-parser.ts` | NEW | `parseTokens()` with escape handling |
| `src/cli/session/index.ts` | NEW | Barrel exports |
| `src/cli/commands/index.ts` | MODIFY | Export `registerShellCommand` |
| `src/cli/index.ts` | MODIFY | Register shell command, refactor to use `registerAllCommands` |

### Key Functions
- `startREPL(state)` — Initialize readline, start prompt loop
- `dispatchCommand(input, state)` — Two-tier command routing
- `handleSessionCommand(input, state)` — /exit, /clear, /reload, etc.
- `executeSubcommand(tokens, state)` — Commander.js reuse via `registerAllCommands`
- `parseTokens(input)` — Quoted string + escape tokenizer
- `printBanner(state)` — Welcome message
- `registerShellCommand(program)` — Commander.js registration
- `setSessionState(state)` / `getSessionState()` — Module-scoped context
- `executeWithExitGuard(fn)` — process.exit() override with finally restore

### SIGTERM Handler (CTO Warning)

```typescript
// Explicit SIGTERM handler in startREPL()
process.on("SIGTERM", () => {
  console.log("\n  Received SIGTERM. Saving history and exiting...");
  saveHistory(state.history);
  rl.close();
  process.exit(0);
});
```

### GateEngine Staleness (CTO Warning)

The shared `GateEngine` in `SessionState` may hold stale confirmation state if another process confirms a gate while the session is running. Mitigation:

```typescript
// In /reload handler — refresh gate state
async function handleReload(state: SessionState): Promise<void> {
  state.project = loadActiveProject();
  state.gateEngine = undefined; // Force lazy re-creation on next gate command
  console.log("  Config and gate state reloaded.");
}
```

Gate commands should check `isSessionMode()` and use the session's lazy-loaded engine, but `/reload` always clears it.

### Dependencies
- `node:readline` (built-in)
- All existing `register*Command` functions from `cli/commands/index.ts`
- `loadActiveProject` from `config/paths.ts`

### Estimated LOC
~350-400 (increased from 250-300 to account for escape handling, SIGTERM, and session context module)

---

## 11. Future Enhancements (Not Sprint 73)

| Enhancement | Description | Sprint |
|-------------|-------------|--------|
| Tab completion | Auto-complete command names | TBD |
| Color themes | Customizable prompt colors | TBD |
| Plugin commands | Load custom commands from project | TBD |
| Session persistence | Resume session across restarts | TBD |

---

## 12. Test Plan

| # | Test | Expected |
|---|------|----------|
| 1 | `endiorbot shell` launches REPL | Banner shown, prompt active |
| 2 | Type `gate status` in session | Shows gate status without exiting |
| 3 | Type `/exit` | Session ends cleanly |
| 4 | Type invalid command | Error shown, prompt returns |
| 5 | Ctrl+C once | Warning message |
| 6 | Ctrl+C twice | Force exit |
| 7 | Ctrl+D | Clean exit |
| 8 | `ops build --path ...` in session | Build runs, returns to prompt |
| 9 | `--no-banner` flag | No welcome banner |
| 10 | `/reload` after config change | Config reloaded |
| 11 | `/history` | Shows command history |
| 12 | `/status` | Shows session uptime, command count |
| 13 | Quoted strings | `consult "What is SDLC?"` parsed correctly |
| 14 | Error in command | Session continues, shows error |
| 15 | `endiorbot -i` shorthand | Same as `endiorbot shell` |

---

*SDLC Framework v6.1.1 - Stage 02: Design*
