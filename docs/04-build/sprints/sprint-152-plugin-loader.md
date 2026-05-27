# Sprint 152 — Plugin Loader Runtime MVP

| Field | Value |
|-------|-------|
| **Date** | 2026-05-27 |
| **Goal** | EndiorBot discovers and loads `skills/` at runtime |
| **ADR** | ADR-056 (plugin format) |
| **Status** | PLANNED |
| **Dependency** | S151 (plugin scaffold) |

## Problem

U2 (S151) generates plugin-compatible artifacts but skills directory is not loaded at runtime. "Plugin-compatible" but not "plugin-capable."

## Deliverables

### D1: Plugin Loader — discoverSkills() + loadSkill()
- Recursive scan `skills/**/SKILL.md` (Anthropic standard: folder-per-skill)
- Backward-compatible fallback: also match `skills/*.md` for flat layouts
- Parse YAML frontmatter: `name`, `description`, `argument-hint`

### D2: Deterministic Trigger Contract
- Primary: exact match on `name` → `/skillname` command invocation
- Secondary: keyword match on `description` → auto-inject when topic matches (simple substring)
- Priority: explicit `/skillname` > description match > no match
- Conflict: 2 skills match same trigger → log warning + first-discovered (alphabetical path order)

### D3: `endiorbot skills` list command
- Shows discovered skills with name, description, trigger info

## Acceptance Criteria

- [ ] `skills/code-review/SKILL.md` discovered and loaded
- [ ] `skills/test-skill.md` (flat layout) also discovered (backward compat)
- [ ] `endiorbot skills` lists all discovered skills
- [ ] Trigger priority: explicit > description > none
- [ ] Conflict logged as warning
- [ ] All existing tests pass
- [ ] Build succeeds
