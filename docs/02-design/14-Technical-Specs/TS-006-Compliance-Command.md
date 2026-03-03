# TS-006: Compliance Command Technical Specification

---
spec_id: TS-006
spec_name: "Compliance Command"
spec_version: "1.0.0"
status: approved
tier: ALL
stage: "02"
category: technical
owner: "@architect"
created: 2026-03-01
last_updated: 2026-03-03
related_adrs: ["ADR-013"]
related_specs: ["TS-004", "TS-005"]
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

The `endiorbot compliance` command calculates SDLC Framework compliance scores and generates executive reports. It helps CEO and team understand how well a project follows SDLC 6.1.1 guidelines.

### 1.2 Problem Statement

Teams need to:
- Quickly assess SDLC compliance (vs reading 143 files)
- Get actionable recommendations for improvement
- Generate reports for stakeholders
- Track compliance progress over time

### 1.3 Goals

| Goal | Target |
|------|--------|
| Score calculation time | < 5 seconds |
| Report generation time | < 10 seconds |
| Accuracy vs manual audit | > 95% |
| Team onboarding time | 2h → 15 min |

## 2. Command Interface

### 2.1 CLI Options (Actual Implementation)

```bash
endiorbot compliance check    # Check project compliance against SDLC requirements
  --path <path>               # Target directory (auto-resolved from active project)
  --tier <tier>               # Expected tier (auto-detected if not specified)
  --strict                    # Fail on any compliance issue (exit code 1)
  --json                      # Output as JSON

endiorbot compliance score    # Show compliance score (compact)
  --path <path>               # Target directory (auto-resolved from active project)
```

### 2.2 Active Project Resolution (BUG-008)

When `--path` is not specified, the compliance command resolves the target directory
from the active project (set by `endiorbot start`), falling back to `process.cwd()`.

```typescript
// Resolution order:
// 1. Explicit --path flag
// 2. Active project from loadActiveProject()
// 3. Fallback to process.cwd()

.action(async (options: ComplianceOptions) => {
  if (!options.path) {
    const active = loadActiveProject();
    options.path = active?.path ?? process.cwd();
  }
  await executeComplianceCheck(options);
});
```

**Before BUG-008 fix:** `--path` defaulted to `process.cwd()` in the option definition,
always checking EndiorBot's own directory instead of the active project.

### 2.3 Command Registration

```typescript
// src/cli/commands/compliance.ts
export function registerComplianceCommand(program: Command): void {
  const compliance = program
    .command("compliance")
    .description("Check SDLC compliance for project");

  // compliance check — full compliance analysis
  compliance
    .command("check")
    .description("Check project compliance against SDLC requirements")
    .option("--path <path>", "Target directory")
    .option("--tier <tier>", "Expected tier (auto-detected if not specified)")
    .option("--strict", "Fail on any compliance issue")
    .option("--json", "Output as JSON")
    .action(complianceCheckAction);

  // compliance score — compact score display
  compliance
    .command("score")
    .description("Show compliance score")
    .option("--path <path>", "Target directory")
    .action(complianceScoreAction);
}
```

### 2.4 Compliance Result Types

```typescript
interface ComplianceResult {
  passed: boolean;
  score: number;               // 0-100
  tier: ProjectTier;
  issues: ComplianceIssue[];   // missing_file, missing_stage, invalid_config, tier_mismatch
  checkedFiles: string[];
  checkedStages: string[];
  missingFiles: string[];
  missingStages: string[];
}
```

## 3. Scoring System

### 3.1 7-Pillar + Section 7-9 Architecture

```typescript
// src/sdlc/compliance/compliance-scorer.ts
export const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  // 7 Pillars
  { id: "pillar0", name: "Design Thinking Foundation", weight: 5 },
  { id: "pillar1", name: "10-Stage Lifecycle", weight: 15 },
  { id: "pillar2", name: "Sprint Planning Governance", weight: 10 },
  { id: "pillar3", name: "4-Tier Classification", weight: 10 },
  { id: "pillar4", name: "Quality Gates", weight: 15 },
  { id: "pillar5", name: "SASE Integration", weight: 10 },
  { id: "pillar6", name: "Documentation Permanence", weight: 5 },

  // Sections 7-9
  { id: "section7", name: "Quality Assurance (Vibecoding)", weight: 15 },
  { id: "section8", name: "Unified Spec Standard", weight: 10 },
  { id: "section9", name: "Legacy Organization", weight: 5 },
];

// Total weight = 100
```

### 3.2 Pillar Checks

```typescript
interface PillarCheck {
  id: string;
  pillar: string;
  name: string;
  check: (projectPath: string, tier: string) => Promise<CheckResult>;
  weight: number;
}

const PILLAR_CHECKS: PillarCheck[] = [
  // Pillar 0: Design Thinking
  {
    id: "p0-vision",
    pillar: "pillar0",
    name: "Vision document exists",
    check: async (p) => fileExists(p, "docs/00-foundation/vision.md"),
    weight: 2.5
  },
  {
    id: "p0-problem",
    pillar: "pillar0",
    name: "Problem statement defined",
    check: async (p) => fileExists(p, "docs/00-foundation/**/problem*.md"),
    weight: 2.5
  },

  // Pillar 1: 10-Stage Lifecycle
  {
    id: "p1-stages",
    pillar: "pillar1",
    name: "Required stages exist",
    check: async (p, tier) => checkStagesExist(p, tier),
    weight: 10
  },
  {
    id: "p1-readmes",
    pillar: "pillar1",
    name: "Stage READMEs present",
    check: async (p, tier) => checkStageReadmes(p, tier),
    weight: 5
  },

  // Pillar 2: Sprint Governance
  {
    id: "p2-sprint-plan",
    pillar: "pillar2",
    name: "Current sprint documented",
    check: async (p) => fileExists(p, "docs/04-build/CURRENT-SPRINT.md"),
    weight: 5
  },
  {
    id: "p2-sprint-history",
    pillar: "pillar2",
    name: "Sprint history maintained",
    check: async (p) => directoryHasFiles(p, "docs/04-build/sprints/"),
    weight: 5
  },

  // Pillar 3: Tier Classification
  {
    id: "p3-config",
    pillar: "pillar3",
    name: "SDLC config exists",
    check: async (p) => fileExists(p, ".sdlc-config.json"),
    weight: 5
  },
  {
    id: "p3-tier-valid",
    pillar: "pillar3",
    name: "Tier properly configured",
    check: async (p) => checkTierValid(p),
    weight: 5
  },

  // Pillar 4: Quality Gates
  {
    id: "p4-adrs",
    pillar: "pillar4",
    name: "ADRs documented",
    check: async (p) => directoryHasFiles(p, "docs/02-design/01-ADRs/"),
    weight: 7.5
  },
  {
    id: "p4-tech-specs",
    pillar: "pillar4",
    name: "Technical specs exist",
    check: async (p) => directoryHasFiles(p, "docs/02-design/14-Technical-Specs/"),
    weight: 7.5
  },

  // Pillar 5: SASE Integration
  {
    id: "p5-claude-md",
    pillar: "pillar5",
    name: "CLAUDE.md exists",
    check: async (p) => fileExists(p, "CLAUDE.md"),
    weight: 5
  },
  {
    id: "p5-agents-md",
    pillar: "pillar5",
    name: "AGENTS.md exists (STANDARD+)",
    check: async (p, tier) => tier === "LITE" || fileExists(p, "AGENTS.md"),
    weight: 5
  },

  // Pillar 6: Documentation Permanence
  {
    id: "p6-readme",
    pillar: "pillar6",
    name: "Root README exists",
    check: async (p) => fileExists(p, "README.md"),
    weight: 2.5
  },
  {
    id: "p6-identity",
    pillar: "pillar6",
    name: "IDENTITY.md exists",
    check: async (p) => fileExists(p, "IDENTITY.md"),
    weight: 2.5
  },

  // Section 7: Quality Assurance
  {
    id: "s7-vibecoding",
    pillar: "section7",
    name: "Vibecoding index < 40",
    check: async (p) => checkVibecodingIndex(p),
    weight: 10
  },
  {
    id: "s7-tests",
    pillar: "section7",
    name: "Test coverage adequate",
    check: async (p) => checkTestCoverage(p),
    weight: 5
  },

  // Section 8: Unified Spec Standard
  {
    id: "s8-frontmatter",
    pillar: "section8",
    name: "Specs have YAML frontmatter",
    check: async (p) => checkSpecFrontmatter(p),
    weight: 5
  },
  {
    id: "s8-bdd",
    pillar: "section8",
    name: "Requirements use BDD format",
    check: async (p) => checkBddFormat(p),
    weight: 5
  },

  // Section 9: Legacy Organization
  {
    id: "s9-archive",
    pillar: "section9",
    name: "Archive structure follows RFC-001",
    check: async (p) => checkArchiveStructure(p),
    weight: 5
  },
];
```

### 3.3 Score Calculation

```typescript
// src/sdlc/compliance/compliance-scorer.ts
export async function calculateComplianceScore(
  projectPath: string,
  tier: string
): Promise<ComplianceScore> {
  const results: CheckResult[] = [];

  // Run all checks
  for (const check of PILLAR_CHECKS) {
    const result = await check.check(projectPath, tier);
    results.push({
      checkId: check.id,
      pillar: check.pillar,
      name: check.name,
      passed: result.passed,
      weight: check.weight,
      details: result.details
    });
  }

  // Calculate pillar scores
  const pillarScores: PillarScore[] = COMPLIANCE_CATEGORIES.map(cat => {
    const checks = results.filter(r => r.pillar === cat.id);
    const earned = checks.filter(r => r.passed).reduce((sum, r) => sum + r.weight, 0);
    const total = checks.reduce((sum, r) => sum + r.weight, 0);
    return {
      id: cat.id,
      name: cat.name,
      score: total > 0 ? Math.round((earned / total) * 100) : 100,
      weight: cat.weight,
      checks
    };
  });

  // Calculate overall score (weighted average)
  const overall = Math.round(
    pillarScores.reduce((sum, p) => sum + (p.score * p.weight / 100), 0)
  );

  // Determine grade
  const grade = getGrade(overall);

  // Generate recommendations
  const recommendations = generateRecommendations(results);

  return {
    overall,
    pillars: pillarScores,
    sections: pillarScores.filter(p => p.id.startsWith("section")),
    grade,
    recommendations
  };
}

function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
```

### 3.4 Grade Definitions

| Grade | Score | Description |
|-------|-------|-------------|
| A | 90-100 | Excellent - Full SDLC compliance |
| B | 80-89 | Good - Minor gaps |
| C | 70-79 | Adequate - Some improvements needed |
| D | 60-69 | Below standard - Significant gaps |
| F | <60 | Failing - Major restructuring required |

## 4. Report Generation

### 4.1 Executive Report Structure

```typescript
// src/sdlc/compliance/report-generator.ts
export interface ComplianceReport {
  metadata: {
    project: string;
    tier: string;
    generatedAt: string;
    generator: string;
  };
  summary: {
    score: number;
    grade: string;
    status: string;
  };
  pillars: PillarReport[];
  recommendations: RecommendationItem[];
  nextSteps: string[];
}

export async function generateReport(
  projectPath: string,
  tier: string,
  format: "text" | "json" | "markdown"
): Promise<string> {
  const score = await calculateComplianceScore(projectPath, tier);
  const projectName = path.basename(projectPath);

  const report: ComplianceReport = {
    metadata: {
      project: projectName,
      tier,
      generatedAt: new Date().toISOString(),
      generator: "EndiorBot v1.0"
    },
    summary: {
      score: score.overall,
      grade: score.grade,
      status: getStatusText(score.grade)
    },
    pillars: score.pillars.map(p => ({
      name: p.name,
      score: p.score,
      checks: p.checks.map(c => ({
        name: c.name,
        passed: c.passed
      }))
    })),
    recommendations: score.recommendations.map((r, i) => ({
      priority: i + 1,
      action: r
    })),
    nextSteps: generateNextSteps(score)
  };

  switch (format) {
    case "json":
      return JSON.stringify(report, null, 2);
    case "markdown":
      return formatAsMarkdown(report);
    default:
      return formatAsText(report);
  }
}
```

### 4.2 Markdown Report Template

```typescript
function formatAsMarkdown(report: ComplianceReport): string {
  return `# SDLC Compliance Report

**Project**: ${report.metadata.project}
**Tier**: ${report.metadata.tier}
**Generated**: ${report.metadata.generatedAt}
**Generator**: ${report.metadata.generator}

---

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | ${report.summary.score}% |
| **Grade** | ${report.summary.grade} |
| **Status** | ${report.summary.status} |

---

## Pillar Scores

| Pillar | Score | Status |
|--------|-------|--------|
${report.pillars.map(p =>
  `| ${p.name} | ${p.score}% | ${p.score >= 80 ? '✅' : p.score >= 60 ? '⚠️' : '❌'} |`
).join('\n')}

---

## Recommendations

${report.recommendations.map(r =>
  `${r.priority}. ${r.action}`
).join('\n')}

---

## Next Steps

${report.nextSteps.map(s => `- ${s}`).join('\n')}

---

*Generated by EndiorBot | SDLC Framework v6.1.1*
`;
}
```

## 5. Output Format

### 5.1 Score Command Output

```
$ endiorbot compliance score

🔍 Calculating SDLC compliance...

┌─────────────────────────────────────────────────────────────┐
│  📊 SDLC Compliance Score                                  │
│                                                             │
│  Project: EndiorBot                                        │
│  Tier: STANDARD                                            │
│                                                             │
│  ██████████████████████████████░░░░░░░░  78%               │
│  Grade: C                                                   │
└─────────────────────────────────────────────────────────────┘

📋 Pillar Breakdown:

  Pillar 0 - Design Thinking      ████████████████████  100%
  Pillar 1 - 10-Stage Lifecycle   ██████████████░░░░░░   70%
  Pillar 2 - Sprint Governance    ████████████████████  100%
  Pillar 3 - Tier Classification  ████████████████████  100%
  Pillar 4 - Quality Gates        ████████████████░░░░   80%
  Pillar 5 - SASE Integration     ██████████░░░░░░░░░░   50%
  Pillar 6 - Documentation        ████████████████████  100%
  Section 7 - Quality Assurance   ██████████████░░░░░░   70%
  Section 8 - Unified Specs       ████████░░░░░░░░░░░░   40%
  Section 9 - Legacy Org          ████████████████████  100%

💡 Top 3 Recommendations:
  1. Create AGENTS.md for STANDARD tier
  2. Add YAML frontmatter to specification files
  3. Create .claude/ directory for Claude Code integration

Run 'endiorbot compliance report' for full details.
```

### 5.2 Report Command Output

```
$ endiorbot compliance report --format markdown --output compliance-report.md

📝 Generating compliance report...

✅ Report saved to: compliance-report.md

📊 Summary:
  Score: 78%
  Grade: C
  Status: Adequate - Some improvements needed
```

## 6. Integration Points

### 6.1 Reuse from Sprint 61a

| Module | Usage |
|--------|-------|
| `detectProjectState()` | Get project info |
| `detectTierFromDocs()` | Detect tier |
| `TIER_STAGES` | Verify stage completeness |

### 6.2 Reuse from Sprint 61b (Restructure)

| Module | Usage |
|--------|-------|
| `analyzeGaps()` | Get gap list for scoring |
| `getRootFilesForTier()` | Check required files |

### 6.3 New Modules

| Module | Purpose |
|--------|---------|
| `compliance-scorer.ts` | Score calculation |
| `report-generator.ts` | Report generation |

## 7. File Structure

### 7.1 New Files (Sprint 61b)

```
src/cli/commands/compliance.ts        # Command registration
src/sdlc/compliance/
├── compliance-scorer.ts              # calculateComplianceScore()
├── report-generator.ts               # generateReport()
└── check-functions.ts                # Individual check implementations
```

## 8. Error Handling

```typescript
export type ComplianceErrorCode =
  | "COMPLIANCE_NO_PROJECT"     // No project detected
  | "COMPLIANCE_INVALID_TIER"   // Invalid tier specified
  | "COMPLIANCE_WRITE_ERROR";   // Cannot write report

export class ComplianceError extends EndiorBotError {
  constructor(code: ComplianceErrorCode, message: string) {
    super({ code, message, recoverable: true });
  }
}
```

## 9. Verification

### 9.1 Unit Tests

```typescript
describe("ComplianceScorer", () => {
  it("should calculate correct overall score");
  it("should weight pillars correctly (total = 100)");
  it("should assign correct grade for score ranges");
  it("should generate relevant recommendations");
});

describe("ReportGenerator", () => {
  it("should generate valid markdown report");
  it("should generate valid JSON report");
  it("should include all pillars in report");
});

describe("ComplianceCommand", () => {
  it("should display score in text format");
  it("should save report to file with --output");
  it("should respect --format option");
});
```

### 9.2 Manual Testing

```bash
# Test 1: Score command
endiorbot compliance score
# Expected: Shows score with pillar breakdown

# Test 2: Verbose score
endiorbot compliance score --verbose
# Expected: Shows all individual checks

# Test 3: Generate markdown report
endiorbot compliance report --format markdown --output report.md
# Expected: Creates report.md with full details

# Test 4: JSON output
endiorbot compliance report --format json
# Expected: JSON to stdout
```

---

*TS-006 created for EndiorBot Compliance Command*
*SDLC Framework v6.1.1*
