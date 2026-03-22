---
description: Close the current sprint — build, test, update sprint docs, commit (optional push)
argument-hint: "[--sprint <N>] [--score <score>] [--push]"
allowed-tools: ["Bash"]
model: sonnet
---

# Sprint Close

**THIN CLIENT**: This command calls EndiorBot core. NO business logic here.

```bash
! ./endiorbot.mjs sprint close $ARGUMENTS
```

## Workflow

1. `pnpm build` → abort if fail
2. `pnpm test` → abort if fail
3. Detect sprint number from `CURRENT-SPRINT.md`
4. Update `sprint-{N}.md`: Status → COMPLETE
5. Update `SPRINT-INDEX.md`
6. `git commit` (sprint docs only)
7. If `--push`: `git push origin main`

## Options

| Option | Description |
|--------|-------------|
| `--sprint <N>` | Sprint number (auto-detected if omitted) |
| `--score <score>` | CTO approval score, e.g. `9/10` |
| `--push` | Push to origin/main (default: local commit only) |

## Examples

```
/sprint-close
/sprint-close --score "9/10"
/sprint-close --sprint 109 --score "9.5/10" --push
```

All logic is in `src/cli/commands/sprint-close.ts` (SSOT).
