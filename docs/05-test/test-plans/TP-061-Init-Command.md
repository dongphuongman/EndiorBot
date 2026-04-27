# TP-061: Init Command Test Plan

> **Historical artifact** — this document reflects the framework version and test count at the time of writing. Current stats: 8,124+ tests, SDLC 6.3.1.

| Metadata | Value |
|----------|-------|
| **Test Plan ID** | TP-061 |
| **Feature** | Init Command |
| **Sprint** | 61 |
| **Status** | Approved |
| **Date** | 2026-03-01 |
| **Owner** | @qa |
| **Related Specs** | TS-004, ADR-013 |

## 1. Overview

### 1.1 Scope

This test plan covers the `endiorbot init` command, including:
- Project state detection (6 states)
- Tier detection from docs/ structure
- Auto-migration from tinysdlc and SDLC Orchestrator
- Scaffold generation
- Idempotent behavior

### 1.2 Test Coverage Targets

| Module | Target Coverage |
|--------|-----------------|
| `src/sdlc/scaffold/` | 90% |
| `src/cli/commands/init.ts` | 85% |

## 2. Test Categories

### 2.1 Unit Tests (25 tests)

#### ProjectDetector (6 tests)

```typescript
describe("ProjectDetector", () => {
  it("should detect FRESH state when no .sdlc-config.json and no docs/");
  it("should detect PARTIAL state when docs/ exists but no config");
  it("should detect ENDIORBOT state when generator is 'endiorbot'");
  it("should detect SDLC_ORCHESTRATOR state when generator is 'sdlc-orchestrator'");
  it("should detect TINYSDLC state when sdlc.frameworkVersion exists");
  it("should detect UNKNOWN state when config has unknown format");
});
```

#### TierDetector (5 tests)

```typescript
describe("TierDetector", () => {
  it("should detect LITE tier from 4 stages (00, 01, 02, 04)");
  it("should detect STANDARD tier from 7 stages");
  it("should detect PROFESSIONAL tier from 10 stages");
  it("should detect ENTERPRISE tier from 11 stages");
  it("should return STANDARD for partial stage match");
});
```

#### IdempotentUpdater (5 tests)

```typescript
describe("IdempotentUpdater", () => {
  it("should skip unchanged files when hash matches");
  it("should preserve user-modified files outside managed sections");
  it("should update content within managed section markers");
  it("should track file hashes in state.json");
  it("should detect managed section markers correctly");
});
```

#### Migration (4 tests)

```typescript
describe("Migration", () => {
  it("should migrate tinysdlc config to EndiorBot format");
  it("should migrate SDLC Orchestrator config to EndiorBot format");
  it("should preserve _original field after migration");
  it("should extract correct tier from nested sdlc.tier");
});
```

#### ScaffoldGenerator (5 tests)

```typescript
describe("ScaffoldGenerator", () => {
  it("should generate valid .sdlc-config.json");
  it("should generate CLAUDE.md with managed section markers");
  it("should create docs/ structure for STANDARD tier (7 stages)");
  it("should create .claude/ structure with commands and hooks");
  it("should generate AGENTS.md for STANDARD+ tiers only");
});
```

### 2.2 Integration Tests (5 tests)

```typescript
describe("InitCommand E2E", () => {
  it("should complete full scaffold for fresh project in < 5 seconds");
  it("should show preview with --analyze without writing files");
  it("should create backup before --force overwrite");
  it("should preserve user content on idempotent re-run");
  it("should output Vietnamese messages when LANG=vi");
});
```

## 3. Test Scenarios

### 3.1 FRESH State (No existing project)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| F1 | Init fresh with STANDARD | `endiorbot init --tier STANDARD` | Creates 7 docs/ stages, CLAUDE.md, AGENTS.md |
| F2 | Init fresh with LITE | `endiorbot init --tier LITE` | Creates 4 docs/ stages, CLAUDE.md only |
| F3 | Init fresh without tier | `endiorbot init` | Defaults to STANDARD |
| F4 | Init fresh with --analyze | `endiorbot init --analyze` | Shows preview, no files created |

### 3.2 ENDIORBOT State (Already initialized)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| E1 | Re-run unchanged | `endiorbot init` | "No changes needed" or skip all |
| E2 | Re-run with --force | `endiorbot init --force` | Backup created, all files regenerated |
| E3 | Re-run with --refresh | `endiorbot init --refresh` | Only managed sections updated |
| E4 | Re-run after user edit | Edit CLAUDE.md, then `endiorbot init` | User content preserved |

### 3.3 PARTIAL State (Has docs/ but no config)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| P1 | 4 stages exist | `endiorbot init` | Detects LITE, creates config |
| P2 | 7 stages exist | `endiorbot init` | Detects STANDARD, creates config |
| P3 | Tier override | `endiorbot init --tier PROFESSIONAL` | Uses specified tier, completes structure |

### 3.4 TINYSDLC State (Migration)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| T1 | Auto-migrate | `endiorbot init` | Migrates to EndiorBot format |
| T2 | Preserve original | `endiorbot init` | _original field contains old config |
| T3 | Tier extraction | `endiorbot init` | Uses sdlc.tier from original |

### 3.5 SDLC_ORCHESTRATOR State (Migration)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| S1 | Auto-migrate | `endiorbot init` | Migrates to EndiorBot format |
| S2 | Tier normalization | `endiorbot init` | Converts "professional" to "PROFESSIONAL" |

### 3.6 UNKNOWN State (Interactive)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| U1 | Interactive wizard | `endiorbot init` | Prompts for tier, project name |
| U2 | Skip with --force | `endiorbot init --force` | Auto-migrate with defaults |

### 3.7 Tier Mismatch

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| M1 | Config=LITE, docs=STANDARD | `endiorbot init` | Uses STANDARD, suggests config update |
| M2 | Config=ENTERPRISE, docs=LITE | `endiorbot init` | Uses LITE, warns about mismatch |

## 4. Edge Cases

### 4.1 Error Handling

| # | Case | Expected Behavior |
|---|------|-------------------|
| ERR1 | Read-only directory | Error: "Cannot write to directory" |
| ERR2 | Invalid tier option | Error: "Invalid tier. Choose: LITE/STANDARD/..." |
| ERR3 | Corrupted JSON config | Treat as UNKNOWN, offer migration |
| ERR4 | Missing jq for hooks | Warning, skip hooks generation |

### 4.2 Boundary Conditions

| # | Case | Expected Behavior |
|---|------|-------------------|
| BC1 | Empty project name | Use directory name |
| BC2 | Very long project name | Truncate to 50 chars |
| BC3 | Special chars in name | Slugify for ID |
| BC4 | Nested project paths | Use leaf directory name |

## 5. Performance Tests

| # | Test | Target | Measurement |
|---|------|--------|-------------|
| PERF1 | Fresh init time | < 5 seconds | `time endiorbot init` |
| PERF2 | Re-run init time | < 2 seconds | `time endiorbot init` (second run) |
| PERF3 | Migration time | < 3 seconds | `time endiorbot init` on tinysdlc project |
| PERF4 | Analyze mode | < 1 second | `time endiorbot init --analyze` |

## 6. Manual Test Procedures

### 6.1 Fresh Project Test

```bash
# Setup
mkdir /tmp/test-fresh && cd /tmp/test-fresh

# Test
endiorbot init --tier STANDARD

# Verify
ls -la                              # Should show CLAUDE.md, IDENTITY.md, .sdlc-config.json
ls docs/                            # Should show 7 directories
cat .sdlc-config.json | jq .generator  # Should be "endiorbot"
```

### 6.2 Idempotent Re-run Test

```bash
# First init
endiorbot init --tier STANDARD

# Add custom content
echo "## My Section" >> CLAUDE.md

# Re-run
endiorbot init

# Verify custom content preserved
grep "My Section" CLAUDE.md  # Should exist
```

### 6.3 Migration Test (tinysdlc)

```bash
# Setup
mkdir /tmp/test-migrate && cd /tmp/test-migrate
cp /path/to/tinysdlc/.sdlc-config.json .

# Test
endiorbot init

# Verify
cat .sdlc-config.json | jq .generator       # Should be "endiorbot"
cat .sdlc-config.json | jq .migrated_from   # Should be "tinysdlc"
cat .sdlc-config.json | jq ._original       # Should contain original
```

### 6.4 Tier Mismatch Test

```bash
# Setup
mkdir /tmp/test-mismatch && cd /tmp/test-mismatch
mkdir -p docs/00-foundation docs/01-planning docs/02-design docs/04-build \
         docs/05-test docs/06-deploy docs/08-collaborate

# Create config with wrong tier
echo '{"generator":"endiorbot","tier":"LITE"}' > .sdlc-config.json

# Test
endiorbot init

# Verify
# Should show warning about mismatch
# Should use STANDARD (from docs/) not LITE (from config)
```

### 6.5 Force Overwrite Test

```bash
# Setup
endiorbot init --tier STANDARD
echo "IMPORTANT USER DATA" >> CLAUDE.md

# Test
endiorbot init --force

# Verify
ls ~/.endiorbot/projects/*/backups/  # Should have backup
grep "IMPORTANT USER DATA" CLAUDE.md  # Should NOT exist (overwritten)
```

## 7. Test Data

### 7.1 Sample Configs

| Config | Location |
|--------|----------|
| tinysdlc | `/path/to/tinysdlc/.sdlc-config.json` |
| SDLC Orchestrator | `/path/to/SDLC-Orchestrator/.sdlc-config.json` |

### 7.2 Test Fixtures

```typescript
// tests/fixtures/configs/
export const FRESH_STATE = {}; // Empty directory

export const TINYSDLC_CONFIG = {
  version: "1.0.0",
  project: { id: "test", name: "Test" },
  sdlc: { frameworkVersion: "6.1.0", tier: "LITE" }
};

export const SDLC_ORCH_CONFIG = {
  generator: "sdlc-orchestrator",
  project: { id: "test", name: "Test" },
  tier: "professional"
};

export const UNKNOWN_CONFIG = {
  custom_field: "unknown_value"
};
```

## 8. Test Execution

### 8.1 Unit Tests

```bash
pnpm test src/sdlc/scaffold/
pnpm test src/cli/commands/init.test.ts
```

### 8.2 Integration Tests

```bash
pnpm test:e2e tests/integration/init.test.ts
```

### 8.3 Coverage Report

```bash
pnpm test --coverage src/sdlc/scaffold/
```

## 9. Exit Criteria

### 9.1 Sprint 61a-1

- [ ] All 15 unit tests passing
- [ ] Coverage > 85% for scaffold modules
- [ ] Manual tests F1-F4, E1-E4, P1-P3 passing
- [ ] Performance targets PERF1, PERF2 met

### 9.2 Sprint 61a-2

- [ ] All 10 migration tests passing
- [ ] Manual tests T1-T3, S1-S2, U1-U2 passing
- [ ] Coverage > 90% for migration modules

### 9.3 Sprint 61b

- [ ] All 5 E2E tests passing
- [ ] Restructure and compliance commands working

---

*TP-061 created for EndiorBot Init Command*
*SDLC Framework v6.1.1*
