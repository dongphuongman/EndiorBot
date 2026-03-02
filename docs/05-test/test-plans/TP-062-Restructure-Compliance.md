# TP-062: Restructure & Compliance Test Plan

| Metadata | Value |
|----------|-------|
| **Test Plan ID** | TP-062 |
| **Feature** | Restructure & Compliance Commands |
| **Sprint** | 61b |
| **Status** | Approved |
| **Date** | 2026-03-01 |
| **Owner** | @qa |
| **Related Specs** | TS-005, TS-006 |

## 1. Overview

### 1.1 Scope

This test plan covers:
- `endiorbot restructure` command (gap analysis and auto-fix)
- `endiorbot compliance` command (scoring and reporting)

### 1.2 Test Coverage Targets

| Module | Target Coverage |
|--------|-----------------|
| `src/sdlc/compliance/gap-analyzer.ts` | 90% |
| `src/sdlc/compliance/compliance-scorer.ts` | 90% |
| `src/cli/commands/restructure.ts` | 85% |
| `src/cli/commands/compliance.ts` | 85% |

## 2. Test Categories

### 2.1 Unit Tests (15 tests)

#### GapAnalyzer (5 tests)

```typescript
describe("GapAnalyzer", () => {
  it("should detect missing stages for each tier");
  it("should detect missing root files (CLAUDE.md, AGENTS.md)");
  it("should detect tier mismatch between config and structure");
  it("should detect missing .claude/ directory");
  it("should mark all detected gaps as fixable");
});
```

#### ComplianceScorer (5 tests)

```typescript
describe("ComplianceScorer", () => {
  it("should calculate overall score as weighted average");
  it("should score all 7 pillars + 3 sections");
  it("should assign correct grade (A/B/C/D/F)");
  it("should generate relevant recommendations");
  it("should handle missing files gracefully");
});
```

#### ReportGenerator (5 tests)

```typescript
describe("ReportGenerator", () => {
  it("should generate valid markdown report");
  it("should generate valid JSON report");
  it("should generate valid text report");
  it("should include all pillars and sections");
  it("should include recommendations and next steps");
});
```

### 2.2 Integration Tests (5 tests)

```typescript
describe("Restructure E2E", () => {
  it("should analyze incomplete project and show gaps");
  it("should fix all gaps with --fix flag");
  it("should generate compliance hub with --compliance");
});

describe("Compliance E2E", () => {
  it("should calculate and display score");
  it("should generate report to file with --output");
});
```

## 3. Test Scenarios

### 3.1 Restructure Command

#### Analyze Mode

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| RA1 | Analyze complete project | `restructure --analyze` | "No gaps found" |
| RA2 | Analyze incomplete STANDARD | `restructure --analyze` | Lists missing stages |
| RA3 | Analyze with tier override | `restructure --analyze --tier PROFESSIONAL` | Uses PROFESSIONAL requirements |
| RA4 | Analyze with verbose | `restructure --analyze --verbose` | Shows detailed check results |

#### Fix Mode

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| RF1 | Fix missing stages | `restructure --fix` | Creates docs/05-test/, docs/06-deploy/, etc. |
| RF2 | Fix missing root files | `restructure --fix` | Creates CLAUDE.md, AGENTS.md |
| RF3 | Fix with compliance hub | `restructure --fix --compliance` | Creates 08-collaborate/01-SDLC-Compliance/ |
| RF4 | Fix preserves user content | `restructure --fix` | Existing files not overwritten |

#### Edge Cases

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| RE1 | No project detected | `restructure` (empty dir) | Error: "No project detected" |
| RE2 | Read-only directory | `restructure --fix` (no write) | Error: "Cannot write to directory" |
| RE3 | Partial fix failure | `restructure --fix` (some fail) | Shows partial results |

### 3.2 Compliance Command

#### Score Mode

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| CS1 | Score complete project | `compliance score` | Score >= 90%, Grade A |
| CS2 | Score incomplete project | `compliance score` | Score < 70%, Grade C/D/F |
| CS3 | Score with verbose | `compliance score --verbose` | Shows all check results |
| CS4 | Score with tier override | `compliance score --tier LITE` | Uses LITE requirements |

#### Report Mode

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| CR1 | Generate markdown report | `compliance report --format markdown` | Valid markdown to stdout |
| CR2 | Generate JSON report | `compliance report --format json` | Valid JSON to stdout |
| CR3 | Save report to file | `compliance report --output report.md` | File created |
| CR4 | Generate text report | `compliance report --format text` | Plain text summary |

### 3.3 Pillar Checks

| Pillar | Check | Pass Condition |
|--------|-------|----------------|
| P0 | Vision document | `docs/00-foundation/vision.md` exists |
| P0 | Problem statement | `docs/00-foundation/**/problem*.md` exists |
| P1 | Required stages | All TIER_STAGES folders exist |
| P1 | Stage READMEs | README.md in each stage folder |
| P2 | Current sprint | `docs/04-build/CURRENT-SPRINT.md` exists |
| P2 | Sprint history | `docs/04-build/sprints/` has files |
| P3 | SDLC config | `.sdlc-config.json` exists |
| P3 | Tier valid | Config tier matches structure |
| P4 | ADRs | `docs/02-design/01-ADRs/` has files |
| P4 | Tech specs | `docs/02-design/14-Technical-Specs/` has files |
| P5 | CLAUDE.md | `CLAUDE.md` exists |
| P5 | AGENTS.md | `AGENTS.md` exists (STANDARD+) |
| P6 | README | `README.md` exists |
| P6 | IDENTITY | `IDENTITY.md` exists |
| S7 | Vibecoding | Index < 40 |
| S7 | Tests | Adequate coverage |
| S8 | Frontmatter | Specs have YAML frontmatter |
| S8 | BDD format | Requirements use Given/When/Then |
| S9 | Archive | `docs/10-archive/` follows RFC-001 |

## 4. Grade Verification

| Grade | Score Range | Test Case |
|-------|-------------|-----------|
| A | 90-100 | Complete ENTERPRISE project |
| B | 80-89 | STANDARD with minor gaps |
| C | 70-79 | STANDARD with missing stages |
| D | 60-69 | LITE with significant gaps |
| F | <60 | Fresh project, no SDLC structure |

## 5. Performance Tests

| # | Test | Target | Measurement |
|---|------|--------|-------------|
| PERF1 | Analyze time (small) | < 5 seconds | `time restructure --analyze` |
| PERF2 | Analyze time (large) | < 10 seconds | 1000+ files project |
| PERF3 | Fix time | < 30 seconds | `time restructure --fix` |
| PERF4 | Score time | < 5 seconds | `time compliance score` |
| PERF5 | Report time | < 10 seconds | `time compliance report` |

## 6. Manual Test Procedures

### 6.1 Restructure Analyze Test

```bash
# Setup - incomplete project
mkdir /tmp/test-restructure && cd /tmp/test-restructure
mkdir -p docs/00-foundation docs/01-planning
echo '{"generator":"endiorbot","tier":"STANDARD"}' > .sdlc-config.json

# Test
endiorbot restructure --analyze

# Verify
# Should show:
# - Missing: docs/02-design/, docs/04-build/, docs/05-test/, docs/06-deploy/, docs/08-collaborate/
# - Missing: CLAUDE.md, AGENTS.md
# - Missing: .claude/
```

### 6.2 Restructure Fix Test

```bash
# Continue from above
endiorbot restructure --fix

# Verify
ls docs/                  # Should have 7 directories
ls -la                    # Should have CLAUDE.md, AGENTS.md
ls .claude/               # Should exist with structure

# Re-run (idempotent)
endiorbot restructure --fix
# Should show "No gaps to fix"
```

### 6.3 Compliance Score Test

```bash
# After fix
endiorbot compliance score

# Verify
# Score should be >= 80%
# Grade should be B or higher
```

### 6.4 Compliance Report Test

```bash
# Generate report
endiorbot compliance report --format markdown --output report.md

# Verify
cat report.md
# Should contain:
# - Summary section with score/grade
# - Pillar breakdown table
# - Recommendations
# - Next steps
```

### 6.5 Compliance Hub Test

```bash
endiorbot restructure --fix --compliance

# Verify
ls docs/08-collaborate/01-SDLC-Compliance/
# Should contain:
# - README.md
# - AGENTS-GUIDE.md
# - GATES-CHECKLIST.md
# - TIER-REQUIREMENTS.md
# - QUICK-REFERENCE.md
```

## 7. Test Data

### 7.1 Test Project Structures

```typescript
// tests/fixtures/projects/

export const COMPLETE_STANDARD = {
  // All 7 stages, all root files
  // Expected score: 95%+
};

export const INCOMPLETE_STANDARD = {
  // 4 stages, missing AGENTS.md
  // Expected score: 60-70%
};

export const FRESH_PROJECT = {
  // Empty directory
  // Expected score: 0%
};

export const LITE_PROJECT = {
  // 4 stages, CLAUDE.md only
  // Expected score: 85%+ for LITE tier
};
```

### 7.2 Expected Scores

| Project Type | Tier | Expected Score | Expected Grade |
|--------------|------|----------------|----------------|
| Complete ENTERPRISE | ENTERPRISE | 95-100% | A |
| Complete STANDARD | STANDARD | 90-95% | A |
| Complete LITE | LITE | 90-95% | A |
| Incomplete STANDARD (missing 2 stages) | STANDARD | 70-80% | C/B |
| Fresh project | STANDARD | 0-20% | F |

## 8. Test Execution

### 8.1 Unit Tests

```bash
pnpm test src/sdlc/compliance/
pnpm test src/cli/commands/restructure.test.ts
pnpm test src/cli/commands/compliance.test.ts
```

### 8.2 Integration Tests

```bash
pnpm test:e2e tests/integration/restructure.test.ts
pnpm test:e2e tests/integration/compliance.test.ts
```

### 8.3 Coverage Report

```bash
pnpm test --coverage src/sdlc/compliance/
```

## 9. Exit Criteria

### 9.1 Sprint 61b (Restructure)

- [ ] All 5 GapAnalyzer unit tests passing
- [ ] Manual tests RA1-RA4, RF1-RF4 passing
- [ ] Coverage > 85% for restructure modules

### 9.2 Sprint 61b (Compliance)

- [ ] All 10 ComplianceScorer + ReportGenerator tests passing
- [ ] Manual tests CS1-CS4, CR1-CR4 passing
- [ ] Coverage > 85% for compliance modules

### 9.3 Integration

- [ ] All 5 E2E tests passing
- [ ] Performance targets met
- [ ] No regressions in Sprint 61a functionality

---

*TP-062 created for EndiorBot Restructure & Compliance Commands*
*SDLC Framework v6.1.1*
