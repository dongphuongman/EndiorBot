# TS-004: Init Command Technical Specification

---
spec_id: TS-004
spec_name: "Init Command"
spec_version: "1.0.0"
status: approved
tier: ALL
stage: "02"
category: technical
owner: "@architect"
created: 2026-03-01
last_updated: 2026-03-03
related_adrs: ["ADR-013"]
related_specs: ["TS-002"]
---

| Metadata | Value |
|----------|-------|
| **Status** | Approved |
| **Date** | 2026-03-01 |
| **Authors** | @architect |
| **Reviewers** | @cto, @pjm |
| **Sprint** | 61 |

## 1. Overview

### 1.1 Purpose

The `endiorbot init` command initializes a project with SDLC Framework structure and AI governance files, enabling CEO to govern AI agents (especially Claude Code) using SDLC Framework 6.1.1.

### 1.2 Identity

```
EndiorBot là công cụ để CEO dùng SDLC Framework quản trị được các AI codex
(tập trung Claude Code) cho các dự án mà chính CEO chịu trách nhiệm.

NOT: Platform, SDLC enforcer, blocker
IS: CEO Power Tool, fast (<30s), auto-healing
```

### 1.3 Goals

| Goal | Target |
|------|--------|
| Init time (fresh project) | < 5 seconds |
| Init time (re-run) | < 2 seconds |
| Detection accuracy | 100% |
| User content preserved | 100% (unless --force) |

## 2. Project Detection

### 2.1 Detection Flow

```
endiorbot init
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  STEP 1: Check .sdlc-config.json exists?                     │
│                                                               │
│  NO  ──────────────────────► Check docs/ exists?              │
│                                    │                          │
│                               YES: PARTIAL                    │
│                                NO: FRESH                      │
│                                                               │
│  YES ────► Parse content:                                     │
│            │                                                  │
│            ├── generator: "endiorbot"         → ENDIORBOT    │
│            ├── generator: "sdlc-orchestrator" → SDLC_ORCH    │
│            ├── sdlc.frameworkVersion (no gen) → TINYSDLC     │
│            └── No generator, no sdlc.*        → UNKNOWN      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Project States (6 states)

| State | Detection Criteria | Action |
|-------|-------------------|--------|
| **FRESH** | No `.sdlc-config.json`, no `docs/` | Full scaffold |
| **ENDIORBOT** | `generator: "endiorbot"` | Merge/update |
| **SDLC_ORCHESTRATOR** | `generator: "sdlc-orchestrator"` | Auto-migrate |
| **TINYSDLC** | Has `sdlc.frameworkVersion` (no generator) | Auto-migrate |
| **PARTIAL** | Has `docs/` but no `.sdlc-config.json` | Infer tier + complete |
| **UNKNOWN** | Has config but unknown format | Interactive wizard |

### 2.3 Detection Code

```typescript
// src/sdlc/scaffold/types.ts
export type ProjectState =
  | "FRESH"
  | "ENDIORBOT"
  | "SDLC_ORCHESTRATOR"
  | "TINYSDLC"
  | "PARTIAL"
  | "UNKNOWN";

// src/sdlc/scaffold/project-detector.ts
export interface DetectionResult {
  state: ProjectState;
  generator?: string;
  generatorVersion?: string;
  configPath?: string;
  detectedTier?: string;
  structureTier?: string;
  tierMismatch: boolean;
  existingFiles: string[];
  missingFiles: string[];
  originalConfig?: unknown;
}

export function detectProjectState(projectPath: string): DetectionResult {
  const configPath = path.join(projectPath, ".sdlc-config.json");

  if (!fs.existsSync(configPath)) {
    const hasDocsStructure = fs.existsSync(path.join(projectPath, "docs"));
    return {
      state: hasDocsStructure ? "PARTIAL" : "FRESH",
      tierMismatch: false,
      existingFiles: scanExistingFiles(projectPath),
      missingFiles: [],
    };
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  let state: ProjectState;
  if (config.generator === "endiorbot") {
    state = "ENDIORBOT";
  } else if (config.generator === "sdlc-orchestrator") {
    state = "SDLC_ORCHESTRATOR";
  } else if (config.sdlc?.frameworkVersion) {
    state = "TINYSDLC";
  } else {
    state = "UNKNOWN";
  }

  const structureTier = detectTierFromDocs(projectPath);
  const configTier = config.tier || config.sdlc?.tier;

  return {
    state,
    generator: config.generator,
    configPath,
    detectedTier: configTier,
    structureTier,
    tierMismatch: structureTier !== undefined && structureTier !== configTier,
    existingFiles: scanExistingFiles(projectPath),
    missingFiles: [],
    originalConfig: config,
  };
}
```

## 3. Tier Detection

### 3.1 CEO Decision: Trust docs/, suggest config update

When tier mismatch is detected between config and docs/ structure:
- **Use**: Tier from docs/ structure (source of truth)
- **Suggest**: Update `.sdlc-config.json` to match

### 3.2 Tier Stages Definition

```typescript
// src/sdlc/scaffold/tier-detector.ts
export const TIER_STAGES: Record<string, string[]> = {
  LITE: [
    "00-foundation",
    "01-planning",
    "02-design",
    "04-build"
  ],
  STANDARD: [
    "00-foundation",
    "01-planning",
    "02-design",
    "04-build",
    "05-test",
    "06-deploy",
    "08-collaborate"
  ],
  PROFESSIONAL: [
    "00-foundation",
    "01-planning",
    "02-design",
    "03-integrate",
    "04-build",
    "05-test",
    "06-deploy",
    "07-operate",
    "08-collaborate",
    "09-govern"
  ],
  ENTERPRISE: [
    "00-foundation",
    "01-planning",
    "02-design",
    "03-integrate",
    "04-build",
    "05-test",
    "06-deploy",
    "07-operate",
    "08-collaborate",
    "09-govern",
    "10-governance"
  ]
};

export function detectTierFromDocs(projectPath: string): string | undefined {
  const docsPath = path.join(projectPath, "docs");
  if (!fs.existsSync(docsPath)) return undefined;

  const stages = fs.readdirSync(docsPath)
    .filter(d => /^\d{2}-/.test(d))
    .sort();

  // Find best matching tier (highest first)
  for (const tier of ["ENTERPRISE", "PROFESSIONAL", "STANDARD", "LITE"]) {
    const required = TIER_STAGES[tier];
    if (required.every(s => stages.includes(s))) {
      return tier;
    }
  }

  return "STANDARD"; // Default fallback
}
```

### 3.3 Tier Mismatch Handling

```typescript
export async function handleTierMismatch(detection: DetectionResult): Promise<string> {
  if (!detection.tierMismatch) {
    return detection.detectedTier || "STANDARD";
  }

  console.log(`
⚠️ Tier Mismatch Detected:

  Config tier:    ${detection.detectedTier}
  Structure tier: ${detection.structureTier} (from docs/)

  ✅ Using structure tier: ${detection.structureTier}
  💡 Suggestion: Update .sdlc-config.json tier to "${detection.structureTier}"
`);

  return detection.structureTier!;
}
```

## 4. Auto-Migration

### 4.1 CEO Decision: Auto-migrate invalid configs

Invalid or unknown config formats are automatically migrated to EndiorBot schema.
Interactive mode only triggers for **UNKNOWN** state when migration cannot proceed automatically.

### 4.2 Migration Schema

```typescript
// src/sdlc/scaffold/types.ts
export interface SdlcConfig {
  schema_version: string;        // "1.0.0"
  framework_version: string;     // "6.1.1"
  generator: string;             // "endiorbot"
  generated_at: string;          // ISO timestamp
  migrated_from?: string;        // "tinysdlc" | "sdlc-orchestrator"
  migrated_at?: string;          // ISO timestamp
  project: {
    id: string;
    name: string;
    description: string;
  };
  tier: string;                  // "LITE" | "STANDARD" | etc.
  stages?: Record<string, string>;
  gates?: {
    current: string;
    passed: string[];
  };
  _original?: unknown;           // Original config for debug/rollback
}
```

### 4.3 Migration Functions

```typescript
// src/sdlc/scaffold/migration/from-tinysdlc.ts
export function migrateFromTinysdlc(config: TinysdlcConfig): SdlcConfig {
  return {
    schema_version: "1.0.0",
    framework_version: config.sdlc?.frameworkVersion || "6.1.1",
    generator: "endiorbot",
    generated_at: new Date().toISOString(),
    migrated_from: "tinysdlc",
    migrated_at: new Date().toISOString(),
    project: config.project || {
      id: slugify(path.basename(process.cwd())),
      name: path.basename(process.cwd()),
      description: ""
    },
    tier: config.sdlc?.tier || "STANDARD",
    stages: config.sdlc?.stages,
    gates: config.gates,
    _original: config
  };
}

// src/sdlc/scaffold/migration/from-sdlc-orchestrator.ts
export function migrateFromSdlcOrchestrator(config: SdlcOrchestratorConfig): SdlcConfig {
  return {
    schema_version: "1.0.0",
    framework_version: "6.1.1",
    generator: "endiorbot",
    generated_at: new Date().toISOString(),
    migrated_from: "sdlc-orchestrator",
    migrated_at: new Date().toISOString(),
    project: config.project || {
      id: config.project?.id || slugify(path.basename(process.cwd())),
      name: config.project?.name || path.basename(process.cwd()),
      description: ""
    },
    tier: (config.tier || "STANDARD").toUpperCase(),
    stages: buildStagesFromEnabled(config.stages?.enabled),
    _original: config
  };
}
```

## 5. State Management

### 5.1 State Location

```
~/.endiorbot/
├── projects/
│   └── <project-key>/           # Hash of project path or project ID
│       ├── state.json           # File hashes, last init time
│       └── backups/             # Backups when --force used
│           └── <timestamp>/
└── config.json                  # Global user preferences
```

### 5.2 State Schema

```typescript
// src/sdlc/scaffold/types.ts
export interface InitState {
  last_init: string;              // ISO timestamp
  generator_version: string;      // EndiorBot version
  files_managed: Record<string, ManagedFile>;
}

export interface ManagedFile {
  hash: string;                   // SHA-256 of content
  last_updated: string;           // ISO timestamp
  user_modified: boolean;         // Detected modification
  managed_sections?: string[];    // For partial management
}
```

### 5.3 Idempotent Behavior

| Scenario | Action |
|----------|--------|
| File exists + hash matches | SKIP (no changes) |
| File exists + hash differs + EndiorBot sections | UPDATE managed sections only |
| File exists + hash differs + user modified | PRESERVE + warn |
| File missing | CREATE |
| --force flag | BACKUP + overwrite all |

## 6. Command Interface

### 6.1 CLI Options

```bash
endiorbot init [project-name]
  --tier <LITE|STANDARD|PROFESSIONAL|ENTERPRISE>  # Target tier (default: auto-detect)
  --analyze                                        # Dry-run, show preview
  --force                                          # Overwrite with backup
  --refresh                                        # Update EndiorBot sections only
  --path <directory>                               # Target directory (default: cwd)
```

### 6.2 Command Registration

```typescript
// src/cli/commands/init.ts
import type { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init [project-name]")
    .description("Initialize project with SDLC + AI governance files")
    .option("--tier <tier>", "Project tier (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)", "STANDARD")
    .option("--path <path>", "Target directory", process.cwd())
    .option("--analyze", "Show preview without writing (dry-run)")
    .option("--force", "Overwrite existing files (creates backup)")
    .option("--no-scaffold", "Skip docs/ structure creation")
    .option("--refresh", "Update EndiorBot-managed sections only")
    .action(async (projectName, options) => {
      // BUG-007 FIX: If projectName looks like a path, redirect to --path
      if (projectName && (projectName.startsWith("/") || projectName.startsWith("./") || projectName.startsWith("../"))) {
        options.path = projectName;
        projectName = undefined;
      }
      await executeInit(projectName, options);
    });
}
```

### 6.3 Path-as-Name Handling (BUG-007)

Commander.js treats the first positional argument after `init` as `[project-name]`. When users run
`endiorbot init /path/to/project`, the path is captured as `projectName` instead of `--path`.

**Detection logic:** If `projectName` starts with `/`, `./`, or `../`, it is treated as `--path`.

```
endiorbot init MyProject             → name="MyProject", path=cwd
endiorbot init /path/to/project      → name=basename(path), path="/path/to/project"
endiorbot init --path /path/to/proj  → name=basename(path), path="/path/to/proj"
```

## 7. Scaffold Structure

### 7.1 Generated Files by Tier

| Tier | Root Files | docs/ Stages | .claude/ |
|------|------------|--------------|----------|
| **LITE** | CLAUDE.md, IDENTITY.md, .sdlc-config.json | 4 stages | commands/, hooks/ |
| **STANDARD** | + AGENTS.md | 7 stages | + skills/ |
| **PROFESSIONAL** | + USER.md | 10 stages | + agents/ |
| **ENTERPRISE** | + TOOLS.md, HEARTBEAT.md | 11 stages | Full |

### 7.2 Template Functions

```typescript
// src/sdlc/scaffold/templates/sdlc-config.ts
export function generateSdlcConfig(options: GeneratorOptions): string;

// src/sdlc/scaffold/templates/claude-md.ts
export function generateClaudeMd(options: GeneratorOptions): string;

// src/sdlc/scaffold/templates/identity-md.ts
export function generateIdentityMd(options: GeneratorOptions): string;

// src/sdlc/scaffold/templates/agents-md.ts
export function generateAgentsMd(options: GeneratorOptions): string;
```

### 7.3 Managed Section Markers

```markdown
<!-- ENDIORBOT:MANAGED:START -->
## 4 Non-Negotiable Invariants

1. THIN CLIENT PATTERN
2. STDIN JSON FOR HOOKS
3. ENDIORBOT SOUL = GOVERNANCE, CLAUDE CODE = EXECUTION
4. DEFAULT MODEL = SONNET
<!-- ENDIORBOT:MANAGED:END -->

<!-- User content below is preserved -->
## My Custom Section
...
```

## 8. Error Handling

### 8.1 Error Types

```typescript
export type InitErrorCode =
  | "INIT_EXISTS"           // Project already initialized
  | "INIT_PARTIAL"          // Incomplete initialization detected
  | "INIT_PERMISSION"       // Cannot write to directory
  | "INIT_INVALID_TIER"     // Invalid tier specified
  | "INIT_MIGRATION_FAILED" // Migration from other format failed
  | "INIT_UNKNOWN_CONFIG";  // Unknown config format, needs interactive

export class InitError extends EndiorBotError {
  constructor(
    code: InitErrorCode,
    message: string,
    suggestion: string,
    recoverable: boolean = true
  ) {
    super({ code, message, suggestion, recoverable });
  }
}
```

### 8.2 Graceful Degradation

```typescript
import { withFallback } from "../../resilience/graceful-degradation.js";

// Use fallback for file operations
const tierConfig = await withFallback(
  () => loadTierConfigFromFile(tier),
  {
    fallbackValue: DEFAULT_TIER_CONFIGS[tier],
    operationName: "loadTierConfig"
  }
);
```

## 9. File Structure

### 9.1 New Files (Sprint 61a-1)

```
src/sdlc/scaffold/
├── index.ts                      # Exports
├── types.ts                      # All interfaces and types
├── project-detector.ts           # detectProjectState()
├── tier-detector.ts              # detectTierFromDocs(), TIER_STAGES
├── structure-generator.ts        # scaffoldProject()
└── templates/
    ├── sdlc-config.ts            # generateSdlcConfig()
    ├── claude-md.ts              # generateClaudeMd()
    ├── identity-md.ts            # generateIdentityMd()
    └── agents-md.ts              # generateAgentsMd()

src/cli/commands/init.ts          # Command registration
```

### 9.2 New Files (Sprint 61a-2)

```
src/sdlc/scaffold/
├── config-reader.ts              # Parse config formats
├── config-validator.ts           # Schema validation
├── idempotent-updater.ts         # Hash tracking, managed sections
└── migration/
    ├── index.ts                  # Migration orchestrator
    ├── from-tinysdlc.ts          # tinysdlc → EndiorBot
    ├── from-sdlc-orchestrator.ts # SDLC Orchestrator → EndiorBot
    └── interactive-wizard.ts     # UNKNOWN state handler
```

## 10. Integration Points

### 10.1 Existing Modules to Reuse

| Module | Location | Usage |
|--------|----------|-------|
| Active Project State | `src/config/paths.ts` | `saveActiveProject()` after init |
| Graceful Degradation | `src/resilience/graceful-degradation.ts` | `withFallback()` for file ops |
| i18n | `src/i18n/index.ts` | Vietnamese messages |
| EndiorBotError | `src/errors/index.ts` | Structured errors |

### 10.2 DO NOT Reuse (Independence)

| Module | Reason |
|--------|--------|
| `gate-checklist.ts` | Init has its own TIER_STAGES |
| `gate-engine.ts` | Not needed for scaffolding |

## 11. Verification

### 11.1 Unit Tests (15 tests)

```typescript
describe("ProjectDetector", () => {
  it("should detect FRESH state (no SDLC files)");
  it("should detect ENDIORBOT state (generator: endiorbot)");
  it("should detect SDLC_ORCHESTRATOR state");
  it("should detect TINYSDLC state (sdlc.frameworkVersion)");
  it("should detect PARTIAL state (docs/ but no config)");
  it("should detect UNKNOWN state (config without generator)");
});

describe("TierDetector", () => {
  it("should detect LITE tier from 4 stages");
  it("should detect STANDARD tier from 7 stages");
  it("should detect PROFESSIONAL tier from 10 stages");
  it("should detect ENTERPRISE tier from 11 stages");
  it("should return STANDARD for partial match");
});

describe("InitCommand", () => {
  it("should create full scaffold for FRESH project");
  it("should show preview with --analyze");
  it("should create backup with --force");
  it("should preserve user content on re-run");
  it("should output Vietnamese messages when locale=vi");
});
```

### 11.2 Manual Testing

```bash
# Test 1: Fresh project
mkdir /tmp/test-fresh && cd /tmp/test-fresh
endiorbot init --tier STANDARD
# Expected: Full scaffold created

# Test 2: Re-run (idempotent)
endiorbot init
# Expected: "No changes needed" or minimal updates

# Test 3: Analyze mode
endiorbot init --analyze
# Expected: Shows preview, no writes

# Test 4: Force overwrite
endiorbot init --force
# Expected: Backup at ~/.endiorbot/projects/<key>/backups/
```

---

*TS-004 created for EndiorBot Init Command*
*SDLC Framework v6.1.1*
