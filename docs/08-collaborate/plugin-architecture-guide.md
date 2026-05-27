# Plugin Architecture Guide — EndiorBot Sprint 149-154

**Date:** 2026-05-27
**Version:** v0.1.0-beta.3
**ADRs:** ADR-054, ADR-055, ADR-056

## Overview

EndiorBot now generates Anthropic-compatible plugin scaffolds and provides a self-improving harness for Claude Code sessions. This guide covers the 6 new features added in Sprint 149-154.

---

## 1. Tier Auto-Recommendation (Sprint 149)

`endiorbot init` scans your project and recommends the right tier automatically.

```bash
endiorbot init                    # Auto-recommend tier
endiorbot init --tier STANDARD    # Override with explicit tier
```

**7 signals scanned:** source file count, test files, CI/CD, dependencies, monorepo, team files, compliance indicators.

**Score → Tier mapping:**
- 0-1 → LITE (small scripts, utilities)
- 2-4 → STANDARD (medium apps)
- 5-7 → PROFESSIONAL (large apps with CI/CD)
- 8+ → ENTERPRISE (monorepos, compliance)

---

## 2. Layered CLAUDE.md (Sprint 150)

Instead of one root CLAUDE.md, init generates tier-appropriate hierarchy:

| Tier | Files |
|------|-------|
| LITE | Root only |
| STANDARD | Root + `src/CLAUDE.md` + `tests/CLAUDE.md` |
| PROFESSIONAL | + `docs/CLAUDE.md` |
| ENTERPRISE | + per-service subdirs |

Each subdir file contains scoped conventions. Root has pointers.

---

## 3. Plugin Format (Sprint 151)

STANDARD+ projects get Anthropic-compatible plugin output:

```
.claude-plugin/plugin.json    # Base profile manifest
commands/README.md            # Seed commands directory
skills/README.md              # Seed skills directory
```

The manifest uses **Base profile** (no MTS governance fields):
```json
{
  "schema_profile": "base",
  "schema_version": "0.1.0",
  "runtime_compat": ">=0.1.0 <1.0.0",
  "name": "my-project",
  "version": "0.1.0"
}
```

---

## 4. Plugin Loader (Sprint 152)

Skills in `skills/` are discovered and loaded at runtime:

```bash
endiorbot skills              # List discovered skills
```

**Two layouts supported:**
- Folder-per-skill: `skills/code-review/SKILL.md` (Anthropic standard)
- Flat: `skills/my-skill.md` (simple fallback)

**SKILL.md format:**
```markdown
---
name: code-review
description: Review code for security, performance, correctness
argument-hint: "<PR URL or file path>"
---

# /code-review

Instructions Claude draws on automatically...
```

---

## 5. CLAUDE.md Audit (Sprint 153)

Automated health check for CLAUDE.md files:

```bash
endiorbot audit-claude-md                     # Check current project
endiorbot audit-claude-md --path /other/project
endiorbot audit-claude-md --accept W001       # Suppress known-OK warning
```

**5 checks:** stale file references, outdated framework version, root size >300 lines, subdir size >100 lines, age >90 days.

Baseline suppression: `.endiorbot/audit-baseline.json` persists accepted warnings.

---

## 6. Self-Improving Hooks (Sprint 154)

Init generates 3 hooks registered in `.claude/settings.json`:

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-tool-use.sh` | PreToolUse | Block access to secrets/credentials |
| `post-tool-use-tracker.sh` | PostToolUse | Track file changes (Write/Edit/NotebookEdit) |
| `stop-suggest.sh` | Stop | Generate CLAUDE.md update suggestions |

After a session, check `.endiorbot/audit-suggestions.md` for recommendations.

---

## Adding Custom Skills

1. Create `skills/my-skill/SKILL.md` with YAML frontmatter
2. Run `endiorbot skills` to verify discovery
3. Use `/my-skill` or let Claude auto-match from description

## Running CLAUDE.md Maintenance

Recommended cadence: run `endiorbot audit-claude-md` monthly or after major model updates. Accept known-OK warnings with `--accept` to avoid noise.
