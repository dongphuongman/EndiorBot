# TS-005: Restructure Command Technical Specification

---
spec_id: TS-005
spec_name: "Restructure Command"
spec_version: "1.0.0"
status: approved
tier: ALL
stage: "02"
category: technical
owner: "@architect"
created: 2026-03-01
last_updated: 2026-03-01
related_adrs: ["ADR-013"]
related_specs: ["TS-004"]
---

| Metadata | Value |
|----------|-------|
| **Status** | Approved |
| **Date** | 2026-03-01 |
| **Authors** | @architect, @pm |
| **Reviewers** | @cto |
| **Sprint** | 61b |

## 1. Overview

### 1.1 Purpose

The `endiorbot restructure` command analyzes and fixes SDLC structure gaps in existing projects. It ensures projects comply with their tier requirements and Claude Code can operate effectively.

### 1.2 Problem Statement

Existing projects often have:
- Missing SDLC stages (e.g., no `05-test/` folder)
- Incomplete root files (e.g., CLAUDE.md exists but missing sections)
- Tier mismatch (config says STANDARD but structure is LITE)
- Missing `.claude/` structure for Claude Code integration

### 1.3 Goals

| Goal | Target |
|------|--------|
| Analysis time | < 10 seconds |
| Fix time | < 30 seconds |
| Gap detection accuracy | 100% |
| Non-destructive | Never delete user content |

## 2. Command Interface

### 2.1 CLI Options

```bash
endiorbot restructure [target]
  --analyze               # Show gaps without fixing (default)
  --fix                   # Auto-fix structure issues
  --tier <tier>           # Target tier (default: from config)
  --compliance            # Also generate 08-collaborate/01-SDLC-Compliance/
  --dry-run               # Same as --analyze (alias)
  --verbose               # Show detailed progress
```

### 2.2 Command Registration

```typescript
// src/cli/commands/restructure.ts
import type { Command } from "commander";

export interface RestructureOptions {
  analyze?: boolean;
  fix?: boolean;
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  compliance?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface RestructureResult {
  tier: string;
  gaps: GapItem[];
  fixed: string[];
  skipped: string[];
  warnings: string[];
  duration_ms: number;
}

export function registerRestructureCommand(program: Command): void {
  program
    .command("restructure [target]")
    .description("Analyze and fix SDLC structure gaps")
    .option("--analyze", "Show gaps without fixing", true)
    .option("--fix", "Auto-fix structure issues", false)
    .option("--tier <tier>", "Target tier")
    .option("--compliance", "Generate compliance hub", false)
    .option("--dry-run", "Same as --analyze", false)
    .option("--verbose", "Show detailed progress", false)
    .action(restructureAction);
}
```

## 3. Gap Analysis

### 3.1 Gap Types

```typescript
// src/sdlc/compliance/gap-analyzer.ts
export type GapType =
  | "MISSING_STAGE"        // Required docs/ stage folder missing
  | "MISSING_ROOT_FILE"    // CLAUDE.md, AGENTS.md, etc.
  | "MISSING_SECTION"      // Required section in existing file
  | "MISSING_CLAUDE_DIR"   // .claude/ structure missing
  | "TIER_MISMATCH"        // Config tier != structure tier
  | "OUTDATED_TEMPLATE"    // Template version outdated
  | "INVALID_CONFIG";      // Config schema invalid

export interface GapItem {
  type: GapType;
  path: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  fixable: boolean;
  fix?: () => Promise<void>;
}
```

### 3.2 Gap Detection Matrix

| Gap Type | Detection Logic | Severity | Fixable |
|----------|-----------------|----------|---------|
| MISSING_STAGE | Stage in TIER_STAGES not in docs/ | critical | Yes |
| MISSING_ROOT_FILE | CLAUDE.md, AGENTS.md not found | high | Yes |
| MISSING_SECTION | Required section missing in file | medium | Yes |
| MISSING_CLAUDE_DIR | .claude/ not found | high | Yes |
| TIER_MISMATCH | detectTierFromDocs() != config.tier | medium | Yes |
| OUTDATED_TEMPLATE | Template version < current | low | Yes |
| INVALID_CONFIG | Config fails schema validation | critical | Yes |

### 3.3 Gap Analyzer Implementation

```typescript
// src/sdlc/compliance/gap-analyzer.ts
import { TIER_STAGES } from "../scaffold/tier-detector.js";
import { detectProjectState } from "../scaffold/project-detector.js";

export interface AnalysisResult {
  projectPath: string;
  detectedTier: string;
  configTier: string;
  gaps: GapItem[];
  score: number;  // 0-100
}

export async function analyzeGaps(
  projectPath: string,
  targetTier?: string
): Promise<AnalysisResult> {
  const detection = detectProjectState(projectPath);
  const tier = targetTier || detection.structureTier || detection.detectedTier || "STANDARD";
  const requiredStages = TIER_STAGES[tier];

  const gaps: GapItem[] = [];

  // Check missing stages
  for (const stage of requiredStages) {
    const stagePath = path.join(projectPath, "docs", stage);
    if (!fs.existsSync(stagePath)) {
      gaps.push({
        type: "MISSING_STAGE",
        path: `docs/${stage}/`,
        description: `Required stage folder missing for ${tier} tier`,
        severity: "critical",
        fixable: true,
        fix: async () => createStageFolder(projectPath, stage)
      });
    }
  }

  // Check root files
  const rootFiles = getRootFilesForTier(tier);
  for (const file of rootFiles) {
    if (!fs.existsSync(path.join(projectPath, file))) {
      gaps.push({
        type: "MISSING_ROOT_FILE",
        path: file,
        description: `Required file missing for ${tier} tier`,
        severity: "high",
        fixable: true,
        fix: async () => createRootFile(projectPath, file, tier)
      });
    }
  }

  // Check .claude/ structure
  if (!fs.existsSync(path.join(projectPath, ".claude"))) {
    gaps.push({
      type: "MISSING_CLAUDE_DIR",
      path: ".claude/",
      description: "Claude Code integration structure missing",
      severity: "high",
      fixable: true,
      fix: async () => createClaudeStructure(projectPath, tier)
    });
  }

  // Check tier mismatch
  if (detection.tierMismatch) {
    gaps.push({
      type: "TIER_MISMATCH",
      path: ".sdlc-config.json",
      description: `Config tier (${detection.detectedTier}) differs from structure (${detection.structureTier})`,
      severity: "medium",
      fixable: true,
      fix: async () => updateConfigTier(projectPath, detection.structureTier!)
    });
  }

  // Calculate score
  const score = calculateComplianceScore(gaps, tier);

  return {
    projectPath,
    detectedTier: detection.structureTier || "UNKNOWN",
    configTier: detection.detectedTier || "UNKNOWN",
    gaps,
    score
  };
}
```

### 3.4 Required Files by Tier

```typescript
function getRootFilesForTier(tier: string): string[] {
  const base = [".sdlc-config.json", "CLAUDE.md", "IDENTITY.md"];

  switch (tier) {
    case "LITE":
      return base;
    case "STANDARD":
      return [...base, "AGENTS.md"];
    case "PROFESSIONAL":
      return [...base, "AGENTS.md", "USER.md"];
    case "ENTERPRISE":
      return [...base, "AGENTS.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"];
    default:
      return base;
  }
}
```

## 4. Fix Implementation

### 4.1 Fix Strategy

```typescript
// src/cli/commands/restructure.ts
async function restructureAction(
  target: string | undefined,
  options: RestructureOptions
): Promise<void> {
  const projectPath = target || process.cwd();

  // Analyze gaps
  const analysis = await analyzeGaps(projectPath, options.tier);

  // Display analysis
  displayAnalysis(analysis);

  if (!options.fix) {
    // Analyze-only mode
    console.log("\n💡 Run with --fix to auto-fix these issues");
    return;
  }

  // Fix mode
  console.log("\n🔧 Fixing issues...\n");

  const results: { path: string; status: "fixed" | "skipped" | "error" }[] = [];

  for (const gap of analysis.gaps) {
    if (!gap.fixable) {
      results.push({ path: gap.path, status: "skipped" });
      continue;
    }

    try {
      if (gap.fix) {
        await gap.fix();
        results.push({ path: gap.path, status: "fixed" });
        console.log(`  ✅ Fixed: ${gap.path}`);
      }
    } catch (err) {
      results.push({ path: gap.path, status: "error" });
      console.log(`  ❌ Error: ${gap.path} - ${err.message}`);
    }
  }

  // Generate compliance hub if requested
  if (options.compliance) {
    await generateComplianceHub(projectPath, analysis.detectedTier);
    console.log(`  ✅ Generated: docs/08-collaborate/01-SDLC-Compliance/`);
  }

  // Summary
  const fixed = results.filter(r => r.status === "fixed").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;

  console.log(`\n📊 Summary: ${fixed} fixed, ${skipped} skipped, ${errors} errors`);
}
```

### 4.2 Stage Folder Creation

```typescript
async function createStageFolder(projectPath: string, stage: string): Promise<void> {
  const stagePath = path.join(projectPath, "docs", stage);

  // Create folder
  await fs.promises.mkdir(stagePath, { recursive: true });

  // Create README.md with stage description
  const readme = generateStageReadme(stage);
  await fs.promises.writeFile(path.join(stagePath, "README.md"), readme);
}

function generateStageReadme(stage: string): string {
  const STAGE_INFO: Record<string, { name: string; question: string }> = {
    "00-foundation": { name: "Foundation", question: "WHY?" },
    "01-planning": { name: "Planning", question: "WHAT?" },
    "02-design": { name: "Design", question: "HOW?" },
    "03-integrate": { name: "Integrate", question: "How connect?" },
    "04-build": { name: "Build", question: "Building right?" },
    "05-test": { name: "Test", question: "Works correctly?" },
    "06-deploy": { name: "Deploy", question: "Ship safely?" },
    "07-operate": { name: "Operate", question: "Running reliably?" },
    "08-collaborate": { name: "Collaborate", question: "Team effective?" },
    "09-govern": { name: "Govern", question: "Compliant?" },
    "10-governance": { name: "Governance", question: "Enterprise ready?" },
  };

  const info = STAGE_INFO[stage] || { name: stage, question: "" };

  return `# ${stage}: ${info.name}

**Key Question**: ${info.question}

## Overview

This stage contains documentation for the ${info.name.toLowerCase()} phase of the SDLC.

## Contents

<!-- Add your stage-specific documentation here -->

---

*SDLC Framework v6.1.1*
`;
}
```

### 4.3 Compliance Hub Generation

```typescript
async function generateComplianceHub(
  projectPath: string,
  tier: string
): Promise<void> {
  const hubPath = path.join(projectPath, "docs/08-collaborate/01-SDLC-Compliance");

  await fs.promises.mkdir(hubPath, { recursive: true });

  // Generate hub files
  const files = [
    { name: "README.md", content: generateComplianceReadme(tier) },
    { name: "AGENTS-GUIDE.md", content: generateAgentsGuide(tier) },
    { name: "GATES-CHECKLIST.md", content: generateGatesChecklist(tier) },
    { name: "TIER-REQUIREMENTS.md", content: generateTierRequirements(tier) },
    { name: "QUICK-REFERENCE.md", content: generateQuickReference() },
  ];

  for (const file of files) {
    await fs.promises.writeFile(
      path.join(hubPath, file.name),
      file.content
    );
  }
}
```

## 5. Output Format

### 5.1 Analyze Mode Output

```
$ endiorbot restructure --analyze

🔍 Analyzing project structure...

┌─────────────────────────────────────────────────────────────┐
│  📊 SDLC Structure Analysis                                │
│                                                             │
│  Project: EndiorBot                                        │
│  Tier: STANDARD (from docs/)                               │
│  Config Tier: STANDARD                                     │
│  Compliance Score: 72%                                     │
└─────────────────────────────────────────────────────────────┘

📋 Gaps Found (5):

  ❌ [CRITICAL] docs/05-test/
     Required stage folder missing for STANDARD tier

  ❌ [CRITICAL] docs/06-deploy/
     Required stage folder missing for STANDARD tier

  ⚠️  [HIGH] .claude/
     Claude Code integration structure missing

  ⚠️  [HIGH] AGENTS.md
     Required file missing for STANDARD tier

  ℹ️  [MEDIUM] CLAUDE.md
     Missing section: "## 4 Non-Negotiable Invariants"

💡 Run with --fix to auto-fix these issues
```

### 5.2 Fix Mode Output

```
$ endiorbot restructure --fix

🔍 Analyzing project structure...
📊 Found 5 gaps to fix

🔧 Fixing issues...

  ✅ Fixed: docs/05-test/
  ✅ Fixed: docs/06-deploy/
  ✅ Fixed: .claude/
  ✅ Fixed: AGENTS.md
  ⏭️  Skipped: CLAUDE.md (user modified, use --force)

📊 Summary: 4 fixed, 1 skipped, 0 errors
🎯 New Compliance Score: 92%
```

## 6. Integration Points

### 6.1 Reuse from Sprint 61a

| Module | Usage |
|--------|-------|
| `detectProjectState()` | Get current project state |
| `detectTierFromDocs()` | Detect tier from structure |
| `TIER_STAGES` | Get required stages per tier |
| Template generators | Create missing files |

### 6.2 New Modules

| Module | Purpose |
|--------|---------|
| `gap-analyzer.ts` | Gap detection logic |
| `compliance-hub.ts` | Generate 08-collaborate/01-SDLC-Compliance/ |

## 7. File Structure

### 7.1 New Files (Sprint 61b)

```
src/cli/commands/restructure.ts       # Command registration
src/sdlc/compliance/
├── gap-analyzer.ts                   # analyzeGaps()
├── compliance-hub.ts                 # generateComplianceHub()
└── stage-readme.ts                   # generateStageReadme()
```

## 8. Error Handling

### 8.1 Error Types

```typescript
export type RestructureErrorCode =
  | "RESTRUCTURE_NO_PROJECT"    // No project detected
  | "RESTRUCTURE_PERMISSION"    // Cannot write to directory
  | "RESTRUCTURE_PARTIAL_FIX";  // Some fixes failed

export class RestructureError extends EndiorBotError {
  constructor(code: RestructureErrorCode, message: string) {
    super({ code, message, recoverable: true });
  }
}
```

## 9. Verification

### 9.1 Unit Tests

```typescript
describe("GapAnalyzer", () => {
  it("should detect missing stages for STANDARD tier");
  it("should detect missing root files");
  it("should detect tier mismatch");
  it("should calculate correct compliance score");
  it("should mark all gaps as fixable");
});

describe("RestructureCommand", () => {
  it("should show gaps in analyze mode without writing");
  it("should fix all fixable gaps in fix mode");
  it("should generate compliance hub with --compliance");
  it("should preserve user-modified files");
});
```

### 9.2 Manual Testing

```bash
# Test 1: Analyze incomplete project
mkdir /tmp/test-restructure && cd /tmp/test-restructure
mkdir -p docs/00-foundation docs/01-planning
endiorbot restructure --analyze
# Expected: Shows missing stages for STANDARD tier

# Test 2: Fix gaps
endiorbot restructure --fix
# Expected: Creates missing stages, CLAUDE.md, etc.

# Test 3: Generate compliance hub
endiorbot restructure --fix --compliance
# Expected: Creates docs/08-collaborate/01-SDLC-Compliance/
```

---

*TS-005 created for EndiorBot Restructure Command*
*SDLC Framework v6.1.1*
