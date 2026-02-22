---
name: github
description: Interact with GitHub using the gh CLI. Use gh issue, gh pr, gh run, and gh api for issues, PRs, CI runs, and advanced queries.
metadata:
  emoji: "🐙"
  category: development
  tags:
    - github
    - pr
    - issues
    - ci
  requires:
    - name: gh
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub. Always specify `--repo owner/repo` when not in a git directory, or use URLs directly.

## Pull Requests

Check CI status on a PR:
```bash
gh pr checks 55 --repo owner/repo
```

List recent workflow runs:
```bash
gh run list --repo owner/repo --limit 10
```

View a run and see which steps failed:
```bash
gh run view <run-id> --repo owner/repo
```

View logs for failed steps only:
```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## Issues

List open issues:
```bash
gh issue list --repo owner/repo --state open
```

Create an issue:
```bash
gh issue create --repo owner/repo --title "Bug: ..." --body "..."
```

Close an issue:
```bash
gh issue close <issue-number> --repo owner/repo
```

## API for Advanced Queries

The `gh api` command is useful for accessing data not available through other subcommands.

Get PR with specific fields:
```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

Get repository info:
```bash
gh api repos/owner/repo --jq '{name, stars: .stargazers_count, forks: .forks_count}'
```

## JSON Output

Most commands support `--json` for structured output. You can use `--jq` to filter:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```

List PRs with labels:
```bash
gh pr list --repo owner/repo --json number,title,labels --jq '.[] | "\(.number): \(.title) [\(.labels | map(.name) | join(", "))]"'
```

## Common Workflows

### Review a PR
```bash
# View PR details
gh pr view 123 --repo owner/repo

# Check CI status
gh pr checks 123 --repo owner/repo

# Checkout PR locally
gh pr checkout 123 --repo owner/repo

# Approve PR
gh pr review 123 --repo owner/repo --approve

# Merge PR
gh pr merge 123 --repo owner/repo --squash
```

### Create a Release
```bash
gh release create v1.0.0 --repo owner/repo --title "Release 1.0.0" --notes "Release notes..."
```

## SDLC Integration

For EndiorBot SDLC compliance, use GitHub for:
- **G3 Gate**: PR reviews, CI checks
- **G4 Gate**: Release creation, deployment workflows
- **G-Sprint**: Sprint milestone tracking via issues

```bash
# Get all PRs for a milestone
gh pr list --repo owner/repo --search "milestone:Sprint-45"

# Get sprint issues
gh issue list --repo owner/repo --milestone "Sprint 45"
```
