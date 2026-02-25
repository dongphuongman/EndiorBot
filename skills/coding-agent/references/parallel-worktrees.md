# Parallel Issue Fixing with Git Worktrees

Use git worktrees to fix multiple issues in parallel.

## Setup

```bash
# 1. Create worktrees for each issue
git worktree add -b fix/issue-78 /tmp/issue-78 main
git worktree add -b fix/issue-99 /tmp/issue-99 main
```

## Launch Agents

```bash
# 2. Launch Codex in each (background + PTY!)
bash pty:true workdir:/tmp/issue-78 background:true \
  command:"pnpm install && codex --yolo 'Fix issue #78: <description>. Commit and push.'"

bash pty:true workdir:/tmp/issue-99 background:true \
  command:"pnpm install && codex --yolo 'Fix issue #99: <description>. Commit and push.'"
```

## Monitor

```bash
# 3. Monitor progress
process action:list
process action:log sessionId:XXX
```

## Create PRs

```bash
# 4. Create PRs after fixes
cd /tmp/issue-78 && git push -u origin fix/issue-78
gh pr create --repo user/repo --head fix/issue-78 --title "fix: ..." --body "..."

cd /tmp/issue-99 && git push -u origin fix/issue-99
gh pr create --repo user/repo --head fix/issue-99 --title "fix: ..." --body "..."
```

## Cleanup

```bash
# 5. Remove worktrees when done
git worktree remove /tmp/issue-78
git worktree remove /tmp/issue-99
```

## Benefits

- **Isolated**: Each issue gets its own directory
- **Parallel**: Multiple agents can work simultaneously
- **Safe**: Main branch untouched during work
- **Clean**: Easy cleanup after PRs merged
