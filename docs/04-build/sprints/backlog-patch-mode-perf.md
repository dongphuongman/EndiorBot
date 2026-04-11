# Backlog: PATCH Mode Performance

**Priority:** P1 (Sprint 135)
**Discovery:** Dogfooding Sprint 134 T1 (2026-04-11)

## Problem

`endiorbot agent @coder --patch` PATCH mode spawns a **new Claude Code CLI session** to apply diffs. This means:
1. READ mode generates diff (~114s)
2. User approves (`y`)
3. PATCH mode spawns **second** Claude Code session
4. Second session re-reads entire codebase + re-understands context → 300s timeout

A 4-file edit that takes 2 seconds manually takes 300s+ via PATCH mode.

## Root Cause

`src/agents/invoke/claude-code-bridge.ts` — PATCH mode invokes `claude -p --patch` which is a full AI invocation, not a simple file-edit operation. The diff from step 1 is not passed to step 3 — Claude has to re-derive the changes.

## Proposed Fix

Option A (quick): Apply diff directly using `fs.writeFileSync` / `child_process.exec('git apply')` instead of re-invoking Claude Code. The diff is already validated in step 1.

Option B (better): Pass the diff from READ mode to PATCH mode as context, so Claude Code only needs to confirm + apply, not re-derive.

Option C (best): Use Claude Code's `--continue` or `--resume` to continue the same session that generated the diff — no re-read needed.

## Impact

Blocks dogfooding of EndiorBot for multi-file changes. CEO had to fall back to manual apply during Sprint 134.
