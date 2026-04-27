# ADR-013: Init Command Architecture

| Metadata | Value |
|----------|-------|
| **Status** | Approved |
| **Date** | 2026-03-01 |
| **Last Updated** | 2026-03-01 |
| **Authors** | @cto |
| **Reviewers** | CEO, @architect, @pjm |
| **Sprint** | 61 |

## Context

### Problem Statement

CEO works on multiple projects and needs to quickly initialize them with SDLC Framework structure. Current manual process takes 30-60 minutes per project. Three different tools exist that generate SDLC configs:

1. **EndiorBot** - Solo Developer Power Tool (this project)
2. **tinysdlc** - Lightweight SDLC generator
3. **SDLC Orchestrator** - Web platform

All three tools use the same filename: `.sdlc-config.json`, but with different content formats.

### Requirements

1. Detect existing project state (6 possible states)
2. Auto-migrate from tinysdlc and SDLC Orchestrator formats
3. Handle tier mismatch between config and docs/ structure
4. Be idempotent (safe to re-run)
5. Complete in < 30 seconds

### Key Questions

1. **Tier Mismatch**: When config tier differs from docs/ structure, which to trust?
2. **Invalid Config**: How to handle configs that don't match any known schema?
3. **Interactive Mode**: When to prompt user vs auto-proceed?

## Decision

### CEO Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tier Mismatch** | Trust docs/, suggest config update | docs/ = source of truth |
| **Invalid Config** | Auto-migrate to valid schema | CEO tool = fast, no blocking |
| **Interactive Mode** | UNKNOWN state only | Simple = auto, Complex = prompt |
| **Config Detection** | Content-based, not filename | All 3 tools use .sdlc-config.json |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          endiorbot init                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Project Detector                              │   │
│  │  Input: project path                                            │   │
│  │  Output: DetectionResult { state, tier, files, config }         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                    │
│         ▼                    ▼                    ▼                    │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐             │
│  │   FRESH    │       │  PARTIAL   │       │ ENDIORBOT  │             │
│  │   Full     │       │  Infer +   │       │  Merge/    │             │
│  │  Scaffold  │       │  Complete  │       │  Update    │             │
│  └────────────┘       └────────────┘       └────────────┘             │
│         │                    │                    │                    │
│         ▼                    ▼                    ▼                    │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐             │
│  │  TINYSDLC  │       │ SDLC_ORCH  │       │  UNKNOWN   │             │
│  │   Auto-    │       │   Auto-    │       │Interactive │             │
│  │  Migrate   │       │  Migrate   │       │   Wizard   │             │
│  └────────────┘       └────────────┘       └────────────┘             │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Structure Generator                            │   │
│  │  - Generate docs/ stages                                        │   │
│  │  - Generate root files (CLAUDE.md, AGENTS.md, etc.)            │   │
│  │  - Generate .claude/ structure                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Detection Logic

All three tools use `.sdlc-config.json`. Detection is by **content**, not filename:

```typescript
function detectProjectState(projectPath: string): ProjectState {
  const configPath = path.join(projectPath, ".sdlc-config.json");

  if (!fs.existsSync(configPath)) {
    return fs.existsSync(path.join(projectPath, "docs")) ? "PARTIAL" : "FRESH";
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Detection by content
  if (config.generator === "endiorbot") return "ENDIORBOT";
  if (config.generator === "sdlc-orchestrator") return "SDLC_ORCHESTRATOR";
  if (config.sdlc?.frameworkVersion) return "TINYSDLC"; // Nested format
  return "UNKNOWN";
}
```

### Tier Detection

TIER_STAGES is defined in `tier-detector.ts` (independent of gate-checklist):

```typescript
const TIER_STAGES = {
  LITE: ["00-foundation", "01-planning", "02-design", "04-build"],
  STANDARD: ["00-foundation", "01-planning", "02-design", "04-build",
             "05-test", "06-deploy", "08-collaborate"],
  PROFESSIONAL: [...], // 10 stages
  ENTERPRISE: [...]    // 11 stages
};
```

### Auto-Migration

Configs are migrated preserving `_original` for debug/rollback:

```typescript
function migrateToValidSchema(config: unknown, state: ProjectState): SdlcConfig {
  return {
    schema_version: "1.0.0",
    framework_version: "6.1.1",
    generator: "endiorbot",
    migrated_from: state.toLowerCase(),
    migrated_at: new Date().toISOString(),
    project: extractProject(config),
    tier: extractTier(config),
    _original: config  // Debug only, not used in runtime
  };
}
```

### State Location

Init state is stored in `~/.endiorbot/projects/<project-key>/`:

```
~/.endiorbot/projects/
└── <hash-of-project-path>/
    ├── state.json       # File hashes, last init time
    └── backups/         # Created when --force used
        └── <timestamp>/
```

## Alternatives Considered

### 1. Trust Config Tier Over docs/ Structure

- **Pros**: Config is explicit declaration of intent
- **Cons**: Config may be stale, docs/ is actual state
- **Decision**: Rejected - docs/ is source of truth

### 2. Always Prompt for Migration

- **Pros**: User has full control
- **Cons**: Blocks CEO workflow, contradicts "fast" goal
- **Decision**: Rejected - auto-migrate for known formats

### 3. Separate Config Filenames per Tool

- **Pros**: Easier detection
- **Cons**: Not backward compatible, fragmentation
- **Decision**: Rejected - content-based detection works

### 4. Use Gate Engine TIER_STAGES

- **Pros**: Single source of truth
- **Cons**: Couples init to gate evaluation
- **Decision**: Rejected - init has its own TIER_STAGES

## Consequences

### Positive

- **Fast**: < 30 seconds to initialize any project
- **Safe**: Idempotent, preserves user content
- **Auto-healing**: Migrates invalid configs automatically
- **Clear**: 6 distinct states with defined actions

### Negative

- **Two TIER_STAGES definitions**: One in tier-detector.ts, one in gate-checklist.ts
- **_original bloat**: Migrated configs carry original data

### Risks

| Risk | Mitigation |
|------|------------|
| TIER_STAGES drift | Document as intentional separation |
| Migration data loss | Preserve _original for rollback |
| Unknown config format | Interactive wizard for UNKNOWN state |

## Implementation Plan

### Phase 1: Sprint 61a-1 (8h)

States handled: FRESH, ENDIORBOT, PARTIAL

Files created:
- `src/sdlc/scaffold/types.ts`
- `src/sdlc/scaffold/project-detector.ts`
- `src/sdlc/scaffold/tier-detector.ts`
- `src/sdlc/scaffold/structure-generator.ts`
- `src/sdlc/scaffold/templates/*.ts`
- `src/cli/commands/init.ts`

### Phase 2: Sprint 61a-2 (6h)

States handled: TINYSDLC, SDLC_ORCHESTRATOR, UNKNOWN

Files created:
- `src/sdlc/scaffold/migration/from-tinysdlc.ts`
- `src/sdlc/scaffold/migration/from-sdlc-orchestrator.ts`
- `src/sdlc/scaffold/migration/interactive-wizard.ts`
- `src/sdlc/scaffold/idempotent-updater.ts`

## Verification

### Definition of Done

- [ ] `endiorbot init` creates full scaffold for FRESH project
- [ ] Detects all 6 project states correctly
- [ ] Auto-migrates TINYSDLC and SDLC_ORCHESTRATOR
- [ ] Preserves user content on re-run
- [ ] Interactive wizard for UNKNOWN state
- [ ] 25 unit tests passing
- [ ] `pnpm build` passes

### Manual Testing

```bash
# Fresh project
mkdir /tmp/test && cd /tmp/test
endiorbot init --tier STANDARD

# Re-run (idempotent)
endiorbot init

# tinysdlc migration
cp /path/to/tinysdlc/.sdlc-config.json .
endiorbot init
```

---

*ADR-013 created for EndiorBot Init Command*
*SDLC Framework v6.1.1*
