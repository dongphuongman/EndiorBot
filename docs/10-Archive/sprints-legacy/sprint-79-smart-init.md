# Sprint 79: Smart Init — Codebase Analysis for `endiorbot init`

**Date:** 2026-03-05
**Duration:** ~10h (estimate)
**Status:** IN PROGRESS
**ADR:** [ADR-022](../../02-design/01-ADRs/ADR-022-Smart-Init-Codebase-Analysis.md)
**Authority:** PM + Architect + CTO (9/10 Approved)

---

## Problem Statement

`endiorbot init /path` generated scaffold files with **generic placeholders** because `collectProjectContext()` (Sprint 75) was never wired into the init flow.

**Before:**
```markdown
# IDENTITY.md
- Language: [Primary language]
- Framework: [Framework]
```

```bash
# CLAUDE.md
pnpm install        # Install dependencies  ← always pnpm, wrong for Bun projects
pnpm build          # Build TypeScript
```

**After (open-pencil):**
```markdown
# IDENTITY.md
## Tech Stack
- **Language:** TypeScript
- **Framework:** Vue/Vite
- **Package Manager:** bun
- **Desktop Runtime:** Tauri 2
```

```bash
# CLAUDE.md
bun install        # Install dependencies
bun run dev        # Watch mode / dev server
bun run build      # Build / compile
bun run test       # Run tests
```

---

## Architecture

```
endiorbot init /path/to/project
       │
       ▼
collectProjectContext() ──── bun.lock check (binary + text)
       │                 ├── Vue/Vite enrichment
       │                 └── Tauri 2 detection
       ▼
ProjectSnapshot (optional)
       │
       ▼
handleProjectState()
       │
       ├── scaffoldProject({ ..., snapshot })
       │       │
       │       ├── generateSdlcConfig(project, snapshot)  → techStack + analyzedAt
       │       ├── generateClaudeMd(project, snapshot)    → script-aware commands
       │       ├── generateIdentityMd(project, snapshot)  → ## Tech Stack section
       │       └── generateStageReadme("05-test", snapshot) → test infra section
       │
       └── [Analysis failure] → warn + continue generic (no crash)
```

---

## Implementation Steps

### Step 0: Pre-existing gap fixes

| File | Fix |
|------|-----|
| `fix-types.ts` | Add `desktop?: string` to `TechStackInfo` |
| `project-context-collector.ts` | bun.lock text format (Bun 1.2+) |
| `project-context-collector.ts` | Vue/Vite → `"Vue/Vite"` framework string |
| `project-context-collector.ts` | Tauri: `@tauri-apps/api` / `@tauri-apps/cli` → `desktop: "Tauri 2"` |

### Step 1: Type extensions

- `ScaffoldConfig.snapshot?: ProjectSnapshot`
- `InitOptions.snapshot?: ProjectSnapshot`
- `SdlcConfig.techStack?: TechStackInfo`
- `SdlcConfig.analyzedAt?: string`

### Step 2: Template updates (snapshot-optional)

- `generateIdentityMd(project, snapshot?)` — `## Tech Stack` section
- `generateClaudeMd(project, snapshot?)` — package manager + script-aware commands
- `generateSdlcConfig(project, snapshot?)` — `techStack` + `analyzedAt` fields

### Step 3: Structure generator threading

- `scaffoldProject(config)` → `config.snapshot` threaded to all templates
- `generateStageReadme("05-test", project, snapshot?)` → test infra detection

### Step 4: CLI init.ts

- `--skip-analysis` flag (avoids collision with `--analyze` = dry-run)
- Analysis step before `handleProjectState()` with spinner
- Graceful failure: analysis error → `warn` + `snapshot = undefined`
- Thread snapshot through all `scaffoldProject()` calls

---

## Test Counts

| File | New Tests |
|------|-----------|
| `tests/sdlc/compliance/project-context-collector.test.ts` | 13 (NEW) |
| `tests/sdlc/scaffold/templates.test.ts` | 14 (added) |
| `tests/sdlc/scaffold/structure-generator.test.ts` | 4 (added) |
| **Total new tests** | **~31** |

---

## Success Criteria

- [x] `IDENTITY.md` after init contains detected framework (not `[Framework]`)
- [x] `CLAUDE.md` Commands section uses detected package manager
- [x] `.sdlc-config.json` has `techStack` field
- [x] `docs/05-test/README.md` (STANDARD+) mentions detected test infra
- [x] `--skip-analysis` preserves current generic behavior
- [x] Analysis failure → warn + fallback gracefully
- [x] `bun.lock` text format detected as Bun
- [x] Tauri 2 detected (`desktop: "Tauri 2"`)
- [x] Vue + Vite → `"Vue/Vite"` framework string
- [x] Build clean
- [x] 5100+ tests passing
- [x] ADR-022 written

---

## Verification

```bash
# 1. Build clean
pnpm build

# 2. All tests pass
pnpm test

# 3. Live test — open-pencil
node dist/cli/index.js init /path/to/open-pencil/ \
  --tier STANDARD --force

# Expected IDENTITY.md:
cat /path/to/open-pencil/IDENTITY.md
# → "## Tech Stack", "TypeScript", "Vue/Vite", "bun", "Tauri 2"

# Expected CLAUDE.md:
cat /path/to/open-pencil/CLAUDE.md
# → "bun install", "bun run dev", "bun run build", "bun run test"

# Expected .sdlc-config.json:
cat /path/to/open-pencil/.sdlc-config.json
# → "techStack": { "language": "TypeScript", "framework": "Vue/Vite", ... }

# 4. --skip-analysis preserves current behavior
node dist/cli/index.js init /tmp/test-empty --tier LITE --skip-analysis --force
cat /tmp/test-empty/IDENTITY.md
# → No "## Tech Stack" section
```

---

*Sprint 79 — Smart Init | EndiorBot v2.1*
*ADR-022 | SDLC Framework v6.1.1*
