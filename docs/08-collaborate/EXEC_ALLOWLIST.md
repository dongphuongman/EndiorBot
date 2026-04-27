# Exec Allowlist — Shell Command Execution Inventory

**Last updated:** 2026-04-12 (Sprint 135)
**Policy:** All `execSync`/`execFileSync` calls in `src/` must be documented here with justification. New `exec*` calls require PR review and allowlist update.

## Summary

| Category | Count | Risk Level |
|----------|-------|------------|
| `execFileSync` with argument arrays | 25 | Safe — no shell injection possible |
| `execSync` with hardcoded strings | 10 | Safe — no user input |
| `execSync` with variable arguments | 4 | Review required — traced below |
| `execSync` with template literals | **0** | None remaining (Sprint 118) |

## Safe: execFileSync with Argument Arrays

These use `execFileSync(cmd, [...args])` which bypasses shell parsing entirely.

| File | Line(s) | Command | Purpose |
|------|---------|---------|---------|
| `src/context/git-context.ts` | 242,256,300,344,397,454,480 | `git` (7 calls) | Branch info, commit log, time-travel, diff |
| `src/skills/skill-loader.ts` | 468 | `which` | Check binary availability |
| `src/agents/context/project-verifier.ts` | 348 | `git` | Git status for project verification |
| `src/agents/intelligence/workspace-context.ts` | 112 | `git` | Workspace branch/commit context |
| `src/cli/commands/evidence.ts` | 183 | `git cat-file` | Validate git commit evidence |
| `src/cli/commands/sprint-close.ts` | 122,123 | `git add`, `git commit` | Sprint close auto-commit |
| `src/sessions/checkpoint/git-automation.ts` | 291,299,413,417,500,506,544,554,565,566,639,744,764,818,870 | `git` (15 calls) | Checkpoint/restore operations (Sprint 116) |

## Safe: execSync with Hardcoded Strings

These use string literals with no interpolation — no injection possible.

| File | Line(s) | Command | Purpose |
|------|---------|---------|---------|
| `src/cli/commands/sprint-close.ts` | 84 | `pnpm build` | Sprint close build step |
| `src/cli/commands/sprint-close.ts` | 93 | `pnpm test` | Sprint close test step |
| `src/cli/commands/sprint-close.ts` | 133 | `git push origin main` | Sprint close push (opt-in) |
| `src/cli/commands/context.ts` | 272 | `pbcopy` | Copy context to clipboard (macOS) |
| `src/sessions/checkpoint/checkpoint.ts` | 99,110,121 | `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain` | Checkpoint state queries |
| `src/sessions/checkpoint/git-automation.ts` | 192,209,225,241 | `git rev-parse`, `git status` | Git state queries |
| `src/sessions/checkpoint/git-automation.ts` | 642,649 | `git stash list`, `git stash pop` | Stash operations |

## Review Required: execSync with Variable Arguments

These pass a variable to `execSync()`. Data flow traced to confirm safety.

| File | Line | Pattern | Data Source | Risk Assessment |
|------|------|---------|-------------|-----------------|
| `src/cli/commands/fix.ts` | 150 | `execSync(command, ...)` | `command` built from `args.join(" ")` where args come from CLI `--run` flag | **MEDIUM** — CLI-only, local execution, user explicitly passes the command |
| `src/self-correction/verifier.ts` | 190 | `execSync(command, ...)` | `command` from `verification.command` field (internal config) | **LOW** — internal verification config, not user-facing |
| `src/self-correction/verifier.ts` | 324 | `execSync(command, ...)` | Same as above | **LOW** — internal config |
| `src/cli/commands/gate.ts` | 115 | `execSync(cmd, ...)` | `cmd` from gate config `evidence.command` | **LOW** — defined in `.sdlc-config.json`, project-local |
| `src/agents/orchestrator/subprocess-orchestrator.ts` | 64 | `execSync("which claude-code-proxy")` | Kimi proxy binary detection | **Safe** — Hardcoded string, no user input |

## Removed (Sprint 118)

All template-literal interpolated `execSync` calls have been converted to `execFileSync` with argument arrays:

- `src/context/git-context.ts` — 7 sites converted
- `src/skills/skill-loader.ts` — 1 site converted
- `src/agents/context/project-verifier.ts` — 1 site converted
- `src/agents/intelligence/workspace-context.ts` — 1 site converted
- `src/cli/commands/evidence.ts` — 1 site converted
- `src/cli/commands/sprint-close.ts` — 2 sites converted

## Exec-Policy Layer (Sprint 132-135)

In addition to this static allowlist, EndiorBot has a runtime exec-policy system that gates autonomous command execution:

| Layer | Scope | Mechanism |
|-------|-------|-----------|
| This allowlist | `exec*` calls in source code | Static code review |
| Exec-policy (Sprint 132) | Commands run by autonomous agents | Runtime allowlist/deny patterns via `checkCommand()` |
| Shell-guard (`src/security/shell-guard.ts`) | 8 deny patterns | Runtime reactive blocking |
| SSRF validator (`src/security/http-validator.ts`, Sprint 133) | Outbound fetch URLs | Runtime URL validation |

Exec-policy presets (`open`/`balanced`/`strict`) control agent behavior at runtime. Hard-deny list (26 patterns) blocks destructive commands regardless of preset. See [ADR-046](../02-design/01-ADRs/ADR-046-Autonomous-Execution-Policy.md).

Webhooks ingress (Sprint 134) adds `handleWebhookRequest()` which validates auth via `timingSafeEqual`, rate-limits per trigger, and strips auth headers before dispatch. No `exec*` calls — webhook handlers are async functions, not shell commands.

## Adding New exec* Calls

1. Prefer `execFileSync(cmd, [...args])` — immune to shell injection
2. If `execSync` is necessary, use hardcoded strings only
3. Never use template literals with `execSync`
4. Document the new call in this allowlist via PR
5. Include data flow analysis for any variable arguments
