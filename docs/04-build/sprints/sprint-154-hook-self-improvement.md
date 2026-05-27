# Sprint 154 — Hook-Based Self-Improvement

| Field | Value |
|-------|-------|
| **Date** | 2026-05-27 |
| **Goal** | Init generates hooks that make the harness self-improve |
| **Cross-product** | = MTClaw S124 (cross-product packaging sprint) |
| **Status** | PLANNED |

## Problem

Sessions generate implicit knowledge (new dirs, new patterns) that should feed back into CLAUDE.md. Without stop hooks, context drifts silently. Blog: hooks are the "self-improving setup" layer.

## Deliverables

### D1: PostToolUse tracker hook
- `post-tool-use-tracker.sh`: tracks `Write`, `Edit`, `NotebookEdit`, any tool with `tool_input.file_path`
- Accumulates paths in session temp file `/tmp/.endiorbot-session-$$`

### D2: Stop suggest hook
- `stop-suggest.sh`: reads accumulated file list
- Fallback: `git diff --name-only HEAD` when temp file empty/missing
- Generates CLAUDE.md update suggestions → `.endiorbot/audit-suggestions.md`

### D3: Cross-product packaging (MTClaw S124 shared)
- EndiorBot Plugin Pack (publishable npm): `packages/plugin-loader/`
- `mts-sdlc-lite` published as OSS demo on GitHub
- Context Doctor command: `endiorbot /eng:context-doctor`
- Fresh-machine install/test CI

## Acceptance Criteria

- [ ] `endiorbot init --tier STANDARD` generates both hook files
- [ ] PostToolUse hook tracks Write/Edit/NotebookEdit file paths
- [ ] Stop hook generates suggestions when new directories created
- [ ] git diff fallback works when temp file missing
- [ ] `npm install @endiorbot/sdlc-lite` runs on fresh machine
- [ ] All existing tests pass
