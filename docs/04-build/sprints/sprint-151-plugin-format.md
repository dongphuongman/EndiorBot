# Sprint 151 — Plugin Format Scaffold (Base Profile)

| Field | Value |
|-------|-------|
| **Date** | 2026-05-27 |
| **Goal** | `endiorbot init` generates Anthropic-compatible plugin manifest |
| **ADR** | ADR-056 |
| **Status** | PLANNED |
| **Dependency** | MTClaw S120 ADR Plugin Manifest (Base profile freeze by Day-3) |

## Deliverables

### D1: generatePluginManifest()
- New `src/sdlc/scaffold/templates/plugin-manifest.ts`
- Strict Base profile: `schema_profile`, `name`, `version`, `description`, `compatibility_version`, `required_context`
- Name = kebab-case via `slugify()`
- No Governed fields (policy, trust, permissions, required_evidence)

### D2: Scaffold integration
- STANDARD+: `.claude-plugin/plugin.json` + seed `commands/README.md` + `skills/README.md`
- LITE: skip (per D1 decision)
- Additive-only: skip if present, EXCEPT `draft` profile auto-upgrades to `base`

### D3: Draft→Base migration path
- If S151 shipped with `schema_profile: "draft"` (fallback D6):
  - `endiorbot plugin migrate-manifest` command upgrades in-place
  - Auto-runs on `init --force` or `init --refresh`

## Acceptance Criteria

- [ ] `endiorbot init --tier STANDARD` creates `.claude-plugin/plugin.json` with Base profile
- [ ] `plugin.json.name` is kebab-case normalized
- [ ] No Governed fields in output
- [ ] LITE tier: no `.claude-plugin/` directory
- [ ] Re-init skips existing plugin.json (unless draft profile)
- [ ] CI JSON schema validator passes
- [ ] All existing tests pass
