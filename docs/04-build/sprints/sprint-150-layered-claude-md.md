# Sprint 150 — Layered CLAUDE.md Generation

| Field | Value |
|-------|-------|
| **Date** | 2026-05-27 |
| **Goal** | `endiorbot init` generates hierarchical CLAUDE.md per directory |
| **ADR** | ADR-055 |
| **Status** | PLANNED |

## Problem

Single root CLAUDE.md causes context bloat in large codebases. Anthropic recommends hierarchical scoping.

## Deliverables

### D1: Split generateClaudeMd() into root + subdir variants
- `generateRootClaudeMd()` — identity, architecture, pointers
- `generateSubdirClaudeMd(subdir, context)` — local conventions per dir

### D2: Scaffold structure-generator adds subdir steps
- LITE: root only (no change)
- STANDARD: root + `src/CLAUDE.md` + `tests/CLAUDE.md`
- PROFESSIONAL: + `docs/CLAUDE.md`
- ENTERPRISE: + per-service subdirs

### D3: Subdir content populated from collectProjectContext()
- `src/CLAUDE.md`: code conventions from tech stack detection
- `tests/CLAUDE.md`: scoped test commands
- `docs/CLAUDE.md`: SDLC stage documentation standards

### D4: ENTERPRISE per-service detection
- Convention: `packages/*/`, `apps/*/`, `services/*/`
- Fallback: `package.json` workspaces
- Override: `.sdlc-config.json` `subdir_claude_md_paths`

## Acceptance Criteria

- [ ] `endiorbot init --tier STANDARD` generates root + src/ + tests/ CLAUDE.md
- [ ] `endiorbot init --tier LITE` generates root ONLY
- [ ] `endiorbot init --tier PROFESSIONAL` generates root + src/ + docs/ + tests/
- [ ] Root CLAUDE.md has pointers to subdir files
- [ ] Subdir CLAUDE.md content reflects detected tech stack
- [ ] All existing tests pass
- [ ] Build succeeds
