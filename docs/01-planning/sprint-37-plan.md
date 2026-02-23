# Sprint 37 Detailed Plan - Autonomy Epic Phase 3

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Autonomy Epic)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 36 Complete (Budget Control + Escalation validated)
- ADR-008 Approved (Self-Correction Architecture)
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 37 implements **Phase 3: Self-Correction (Scoped)** - deterministic error fixing to reduce manual intervention from 80% to 20%.

### Vision: Autonomous Error Recovery

```
Current (Sprint 36):  Agent hits error → escalates → CEO fixes manually
Sprint 37 Target:     Agent fixes 70-90% build/lint/type errors automatically
Future (Sprint 40):   Agent learns from fixes, improves over time
```

### Why Scoped Self-Correction?

> **CPO/CTO Requirement**: "Start with deterministic fixes (build/lint/type). Tests are experimental (30%). Don't over-engineer."

Scope boundaries:
- ✅ **In Scope**: Build errors, lint errors, type errors (70-90% success rate)
- ✅ **In Scope**: 3-strike escalation (prevent infinite loops)
- ✅ **In Scope**: Anti-cheat verifier (reject rule disabling)
- ⚠️ **Experimental**: Test failures (30% success rate, basic patterns)
- ❌ **Out of Scope**: Logic errors, runtime errors, semantic bugs

---

## Sprint Goal

**Enable EndiorBot to automatically fix build, lint, and type errors with 70-90% success rate, using deterministic patterns and 3-strike escalation.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 36** | Budget control validated | PLANNED | Sprint 37 start |
| **ADR-008** | Self-Correction Architecture | DRAFT | Sprint 37 Day 1 |
| **Verifier baseline** | build + lint + typecheck scripts | ✅ READY | package.json |

### Phase 3 Validation Criteria (from Autonomy Epic)

Sprint 36 → Sprint 37 Gate:
- [ ] Error classifier identifies error types accurately (>90%)
- [ ] Deterministic fixer resolves 70-90% build/lint/type errors
- [ ] 3-strike escalation prevents infinite loops
- [ ] Anti-cheat verifier blocks rule disabling
- [ ] Budget tracker prevents runaway costs during fix loops

**Gate**: All criteria must PASS before Sprint 37 Day 1.

---

## Sprint 37 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Error Classification + Deterministic Fixer | error-classifier.ts, deterministic-fixer.ts, verifier.ts |
| **Week 2** | Experimental Test Fixer + Anti-Cheat + Integration | test-fixer.ts, anti-cheat-verifier.ts, self-correction-loop.ts |

**Duration**: 10 working days (April 10-21, 2026)

---

## Week 1: Error Classification & Deterministic Fixing (Day 1-5)

### Day 1: ADR-008 Approval + Error Classifier

**Goal**: Formalize ADR-008 and implement error classification.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create ADR-008 draft | P0 | ADR-008-Self-Correction-Architecture.md | ~400 |
| Review ADR-008 with @cto | P0 | ADR-008.md APPROVED | - |
| Create src/agents/self-correction/types.ts | P0 | Error types | ~200 |
| Create src/agents/self-correction/error-classifier.ts | P0 | Error classification | ~300 |
| Create tests/agents/self-correction/error-classifier.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] ADR-008 defines error taxonomy, fix strategies, escalation rules
- [ ] Error classifier categorizes: build, lint, type, test, logic, unknown
- [ ] Pattern matching for common errors (TS2345, TS2322, ESLint rules)
- [ ] Confidence scoring: high (>90%), medium (60-90%), low (<60%)
- [ ] Tests pass: classification accuracy >90%
- [ ] Build passes

**Error Taxonomy** (per Autonomy Epic):
```typescript
interface ErrorClassification {
  type: 'build' | 'lint' | 'type' | 'test' | 'logic' | 'unknown';
  severity: 'error' | 'warning';
  confidence: 'high' | 'medium' | 'low';
  fixable: boolean;
  file: string;
  line: number;
  message: string;
  rule?: string;  // ESLint rule, TS error code
}

// Error Type Priorities:
// 1. build (deterministic, 90% fix rate)
// 2. lint (deterministic, 85% fix rate)
// 3. type (deterministic, 75% fix rate)
// 4. test (experimental, 30% fix rate)
// 5. logic (out of scope, escalate)
```

**Integration Points**:
```
error-classifier.ts
    └── Verifier (new, Day 2-3)
    └── Logger (src/logging/logger.ts) ✅ Sprint 34
    └── EventsLogger (Sprint 35)
```

---

### Day 2-3: Verifier + Deterministic Fixer

**Goal**: Implement build/lint/typecheck verifier and deterministic fixer.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/self-correction/verifier.ts | P0 | Build/lint/typecheck runner | ~300 |
| Create src/agents/self-correction/deterministic-fixer.ts | P0 | Fix patterns | ~500 |
| Create src/agents/self-correction/fix-patterns/ | P0 | Pattern library | ~400 |
| Create tests/agents/self-correction/verifier.test.ts | P0 | Unit tests | ~150 |
| Create tests/agents/self-correction/deterministic-fixer.test.ts | P0 | Unit tests | ~250 |

**Acceptance Criteria**:
- [ ] Verifier runs: `pnpm build`, `pnpm lint`, `pnpm typecheck`
- [ ] Verifier parses output, extracts errors
- [ ] Verifier returns structured error list
- [ ] Deterministic fixer has patterns for:
  - [ ] Missing imports (TS2304, TS2305)
  - [ ] Type mismatches (TS2322, TS2345)
  - [ ] Unused variables (ESLint no-unused-vars)
  - [ ] Missing types (ESLint @typescript-eslint/explicit-*)
  - [ ] Formatting issues (Prettier violations)
- [ ] Fixer applies patterns, returns modified code
- [ ] Fix success rate 70-90% on test corpus
- [ ] Tests pass: verifier accuracy, fixer correctness
- [ ] Build passes

**Deterministic Fix Patterns** (per Autonomy Epic):
```typescript
interface FixPattern {
  id: string;
  errorPattern: RegExp;
  errorCodes: string[];
  fixStrategy: 'add_import' | 'add_type' | 'remove_unused' | 'format';
  confidence: 'high' | 'medium' | 'low';
  apply: (file: string, error: ErrorClassification) => string;
}

// Example: Missing import fix
const missingImportPattern: FixPattern = {
  id: 'missing-import',
  errorPattern: /Cannot find name '(\w+)'/,
  errorCodes: ['TS2304', 'TS2305'],
  fixStrategy: 'add_import',
  confidence: 'high',
  apply: (file, error) => {
    const symbol = error.message.match(/Cannot find name '(\w+)'/)?.[1];
    // Search codebase for symbol definition
    const importPath = findSymbolDefinition(symbol);
    // Add import at top of file
    return addImport(file, symbol, importPath);
  },
};

// Example: Type mismatch fix
const typeMismatchPattern: FixPattern = {
  id: 'type-mismatch',
  errorPattern: /Type '(.+)' is not assignable to type '(.+)'/,
  errorCodes: ['TS2322', 'TS2345'],
  fixStrategy: 'add_type',
  confidence: 'medium',
  apply: (file, error) => {
    const expectedType = error.message.match(/to type '(.+)'/)?.[1];
    // Add type annotation
    return addTypeAnnotation(file, error.line, expectedType);
  },
};
```

**Verifier Integration**:
```typescript
class Verifier {
  async verify(): Promise<VerificationResult> {
    const results = await Promise.all([
      this.runBuild(),
      this.runLint(),
      this.runTypecheck(),
    ]);

    const errors = results.flatMap(r => r.errors);
    const classified = errors.map(e => errorClassifier.classify(e));

    return {
      passed: errors.length === 0,
      errors: classified,
      fixable: classified.filter(e => e.fixable).length,
      warnings: classified.filter(e => e.severity === 'warning').length,
    };
  }

  private async runBuild(): Promise<CommandResult> {
    // Run pnpm build, parse output
    const output = await exec('pnpm build');
    return parseBuildErrors(output);
  }

  private async runLint(): Promise<CommandResult> {
    // Run pnpm lint, parse output
    const output = await exec('pnpm lint --format json');
    return parseEslintJson(output);
  }

  private async runTypecheck(): Promise<CommandResult> {
    // Run pnpm typecheck, parse output
    const output = await exec('pnpm typecheck');
    return parseTypescriptErrors(output);
  }
}
```

**Integration Points**:
```
verifier.ts
    └── ShellEnv (src/infra/shell-env.ts) ✅ Sprint 34
    └── Platform (src/infra/platform.ts) ✅ Sprint 34
    └── EventsLogger (Sprint 35)

deterministic-fixer.ts
    └── error-classifier.ts (Day 1)
    └── verifier.ts (Day 2-3)
    └── FileSystem (Edit tool, Read tool)
```

---

### Day 4: Anti-Cheat Verifier

**Goal**: Prevent agents from disabling rules or relaxing strictness.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/self-correction/anti-cheat-verifier.ts | P0 | Anti-cheat checks | ~250 |
| Create src/agents/self-correction/rule-blacklist.ts | P0 | Blacklisted patterns | ~100 |
| Create tests/agents/self-correction/anti-cheat.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Anti-cheat verifier rejects fixes that:
  - [ ] Add `// @ts-ignore` or `// @ts-nocheck`
  - [ ] Add `// eslint-disable` without justification
  - [ ] Change tsconfig.json to relax strictness
  - [ ] Change eslint.config.js to disable rules
  - [ ] Use `any` type without explicit approval
- [ ] Verifier runs before applying fix
- [ ] Verifier escalates to CEO if blacklist violated
- [ ] Blacklist configurable in config
- [ ] Tests pass: anti-cheat detection >95%
- [ ] Build passes

**Anti-Cheat Patterns** (per P0 Checklist #7):
```typescript
const antiCheatPatterns = [
  // TypeScript suppressions
  { pattern: /@ts-ignore/, severity: 'error', message: 'Cannot use @ts-ignore' },
  { pattern: /@ts-nocheck/, severity: 'error', message: 'Cannot use @ts-nocheck' },
  { pattern: /@ts-expect-error/, severity: 'warning', message: '@ts-expect-error requires justification' },

  // ESLint suppressions
  { pattern: /eslint-disable(?!-next-line)/, severity: 'error', message: 'Cannot disable ESLint rules' },
  { pattern: /eslint-disable-next-line/, severity: 'warning', message: 'eslint-disable-next-line requires justification' },

  // Type safety violations
  { pattern: /:\s*any\b/, severity: 'error', message: 'Cannot use "any" type' },
  { pattern: /as\s+any\b/, severity: 'error', message: 'Cannot cast to "any"' },

  // Config relaxations
  { pattern: /"strict":\s*false/, severity: 'error', message: 'Cannot disable TypeScript strict mode' },
  { pattern: /"noImplicitAny":\s*false/, severity: 'error', message: 'Cannot allow implicit any' },
];

class AntiCheatVerifier {
  async verifyFix(originalFile: string, fixedFile: string): Promise<AntiCheatResult> {
    const diff = computeDiff(originalFile, fixedFile);
    const violations: AntiCheatViolation[] = [];

    for (const pattern of antiCheatPatterns) {
      if (pattern.pattern.test(diff.added)) {
        violations.push({
          pattern: pattern.pattern.source,
          severity: pattern.severity,
          message: pattern.message,
        });
      }
    }

    if (violations.some(v => v.severity === 'error')) {
      return { passed: false, violations, action: 'reject_and_escalate' };
    }

    if (violations.some(v => v.severity === 'warning')) {
      return { passed: false, violations, action: 'require_justification' };
    }

    return { passed: true, violations: [] };
  }
}
```

---

### Day 5: 3-Strike Escalation

**Goal**: Implement retry limits and escalation.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/self-correction/strike-counter.ts | P0 | Strike tracking | ~150 |
| Create src/agents/self-correction/escalation-policy.ts | P0 | Escalation rules | ~200 |
| Integration with budget tracker | P0 | Budget-aware escalation | ~50 |
| Create tests/agents/self-correction/strike-counter.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] Strike counter tracks retries per error type
- [ ] Max 3 strikes per error before escalation
- [ ] Strike counter resets on success
- [ ] Escalation policy integrates with escalation router (Sprint 36)
- [ ] Budget tracker pauses if fix loop exceeds cost limit
- [ ] Tests pass: strike counting, escalation triggers
- [ ] Build passes

**3-Strike Escalation Logic** (per Autonomy Epic):
```typescript
class StrikeCounter {
  private strikes = new Map<string, number>();

  recordStrike(errorId: string): EscalationAction {
    const count = (this.strikes.get(errorId) ?? 0) + 1;
    this.strikes.set(errorId, count);

    if (count >= 3) {
      // 3 strikes → escalate
      return { action: 'escalate', reason: 'max_retry_exceeded', strikes: count };
    }

    return { action: 'retry', strikes: count };
  }

  recordSuccess(errorId: string): void {
    // Reset strikes on success
    this.strikes.delete(errorId);
  }

  recordPartialSuccess(errorId: string): void {
    // Reduce strikes by 1 on partial success
    const count = this.strikes.get(errorId) ?? 0;
    if (count > 0) {
      this.strikes.set(errorId, count - 1);
    }
  }
}

interface EscalationPolicy {
  maxStrikesPerError: number;      // Default: 3
  maxTotalStrikesPerSession: number; // Default: 10
  budgetLimitPerFixAttempt: number;  // Default: $0.10
  escalationLevels: {
    level1: 'retry_with_different_pattern';
    level2: 'multi_model_consultation';
    level3: 'human_escalation';
  };
}
```

**Integration Points**:
```
strike-counter.ts
    └── EscalationRouter (Sprint 36)
    └── BudgetTracker (Sprint 36)
    └── EventsLogger (Sprint 35)
```

---

## Week 2: Experimental Test Fixer & Integration (Day 6-10)

### Day 6-7: Experimental Test Fixer

**Goal**: Attempt basic test failure fixes (30% target).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/self-correction/test-fixer.ts | P1 | Test fix patterns | ~400 |
| Create src/agents/self-correction/test-patterns/ | P1 | Test pattern library | ~300 |
| Create tests/agents/self-correction/test-fixer.test.ts | P1 | Unit tests | ~200 |

**Acceptance Criteria**:
- [ ] Test fixer attempts basic patterns:
  - [ ] Update snapshots (if snapshot mismatch)
  - [ ] Fix assertion values (if off by small amount)
  - [ ] Add missing mocks (if import error in test)
  - [ ] Fix async/await issues (if timeout)
- [ ] Success rate 30% on test corpus (experimental)
- [ ] Always escalate if pattern not found
- [ ] Never change production code to pass tests
- [ ] Tests pass: test fixer correctness
- [ ] Build passes

**Experimental Test Patterns** (per Autonomy Epic):
```typescript
const testFixPatterns: FixPattern[] = [
  {
    id: 'snapshot-update',
    errorPattern: /Snapshot .+ does not match/,
    errorCodes: ['SNAPSHOT_MISMATCH'],
    fixStrategy: 'update_snapshot',
    confidence: 'high',
    apply: async (file, error) => {
      // Run test with --updateSnapshot
      await exec('pnpm test --updateSnapshot');
      return 'snapshot_updated';
    },
  },
  {
    id: 'assertion-value',
    errorPattern: /Expected: (\d+)\s+Received: (\d+)/,
    errorCodes: ['ASSERTION_FAILED'],
    fixStrategy: 'update_assertion',
    confidence: 'low',  // Risky, only if values close
    apply: (file, error) => {
      const [, expected, received] = error.message.match(/Expected: (\d+)\s+Received: (\d+)/) ?? [];
      if (Math.abs(Number(expected) - Number(received)) > 5) {
        return 'escalate';  // Too different, don't auto-fix
      }
      // Update expectation
      return updateAssertion(file, error.line, received);
    },
  },
];

// IMPORTANT: Test fixer is EXPERIMENTAL
// - 30% success rate target (not 70-90%)
// - Always escalate if uncertain
// - Never modify production code
// - Log all test fix attempts for review
```

**Anti-Pattern Detection**:
```typescript
// Reject fixes that modify production code to pass tests
class TestFixAntiPatternDetector {
  async verifyTestFix(files: FileChange[]): Promise<boolean> {
    for (const file of files) {
      if (!file.path.includes('.test.') && !file.path.includes('.spec.')) {
        // Production file modified during test fix
        logger.error('Test fix attempted to modify production code', { file: file.path });
        return false;
      }
    }
    return true;
  }
}
```

---

### Day 8: Self-Correction Loop Integration

**Goal**: Integrate all components into correction loop.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/agents/self-correction/self-correction-loop.ts | P0 | Main correction loop | ~400 |
| Create src/agents/self-correction/index.ts | P0 | Module exports | ~50 |
| Integration with SessionManager | P0 | Auto-correct on tool call | ~100 |
| Create tests/agents/self-correction/integration.test.ts | P0 | Integration tests | ~300 |

**Acceptance Criteria**:
- [ ] Self-correction loop implements 5-step flow:
  - [ ] Step 1: Verify (run build/lint/typecheck)
  - [ ] Step 2: Classify errors
  - [ ] Step 3: Apply deterministic fix
  - [ ] Step 4: Anti-cheat verify
  - [ ] Step 5: Re-verify or escalate
- [ ] Loop integrated with checkpoint (create checkpoint on success)
- [ ] Loop integrated with budget tracker (pause if cost exceeds limit)
- [ ] Loop integrated with strike counter (escalate after 3 strikes)
- [ ] Loop logs all fix attempts to events.jsonl
- [ ] Tests pass: full correction loop
- [ ] Build passes

**Self-Correction Loop** (per Autonomy Epic):
```typescript
class SelfCorrectionLoop {
  async attemptFix(context: CorrectionContext): Promise<CorrectionResult> {
    let strikes = 0;
    const maxStrikes = 3;

    while (strikes < maxStrikes) {
      // Step 1: Verify current state
      const verification = await verifier.verify();
      if (verification.passed) {
        await checkpoint.create({ reason: 'auto_fix_success' });
        return { success: true, strikesUsed: strikes };
      }

      // Step 2: Classify errors
      const fixableErrors = verification.errors.filter(e => e.fixable);
      if (fixableErrors.length === 0) {
        return { success: false, reason: 'no_fixable_errors', escalate: true };
      }

      // Step 3: Apply deterministic fix
      const fix = await deterministicFixer.fix(fixableErrors[0]);
      if (!fix) {
        strikes++;
        continue;
      }

      // Step 4: Anti-cheat verify
      const antiCheatResult = await antiCheatVerifier.verifyFix(fix.originalFile, fix.fixedFile);
      if (!antiCheatResult.passed) {
        logger.error('Anti-cheat violation detected', antiCheatResult.violations);
        return { success: false, reason: 'anti_cheat_violation', escalate: true };
      }

      // Step 5: Apply fix and check budget
      await applyFix(fix);
      const cost = await budgetTracker.estimateCost('auto_fix', 'claude');
      if (await budgetTracker.wouldExceedLimit(cost)) {
        await checkpoint.create({ reason: 'auto_fix_budget_limit' });
        return { success: false, reason: 'budget_limit', escalate: true };
      }

      strikes++;
    }

    // Max strikes exceeded
    return { success: false, reason: 'max_strikes_exceeded', escalate: true, strikes };
  }
}
```

**Integration Points**:
```
self-correction-loop.ts
    └── verifier.ts (Day 2-3)
    └── error-classifier.ts (Day 1)
    └── deterministic-fixer.ts (Day 2-3)
    └── anti-cheat-verifier.ts (Day 4)
    └── strike-counter.ts (Day 5)
    └── CheckpointState (Sprint 35)
    └── BudgetTracker (Sprint 36)
    └── EscalationRouter (Sprint 36)
```

---

### Day 9: CLI Integration

**Goal**: Add auto-fix commands to CLI.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/cli/commands/fix.ts | P0 | `endiorbot fix` command | ~200 |
| Update src/cli/index.ts | P0 | Register fix commands | +20 |
| Create tests/cli/fix-cli.test.ts | P0 | CLI tests | ~150 |

**Acceptance Criteria**:
- [ ] `endiorbot fix` runs self-correction loop
- [ ] `endiorbot fix --dry-run` shows what would be fixed
- [ ] `endiorbot fix --verify-only` runs verifier without fixing
- [ ] CLI shows progress: errors found, fixes attempted, success rate
- [ ] CLI shows budget cost during fix loop
- [ ] Tests pass: CLI execution
- [ ] Build passes

**CLI Output Example**:
```bash
$ endiorbot fix

Running verification...
✓ Build: 0 errors
✗ Lint: 3 errors
✗ Typecheck: 5 errors

Fixable errors: 7/8 (87.5%)

Attempting fixes...
  [1/7] TS2304: Cannot find name 'Logger' → Adding import ✓
  [2/7] TS2322: Type 'string' not assignable → Adding type annotation ✓
  [3/7] no-unused-vars: 'result' is never used → Removing variable ✓
  [4/7] TS2345: Argument type mismatch → Pattern not found, escalating ⚠
  [5/7] prettier: Missing semicolon → Formatting ✓
  [6/7] TS2304: Cannot find name 'Config' → Adding import ✓
  [7/7] @typescript-eslint/explicit-*: Missing return type → Adding type ✓

Results:
  ✓ Fixed: 6/7 (85.7%)
  ⚠ Escalated: 1/7 (14.3%)
  Strikes used: 2/3
  Cost: $0.08

Re-verification...
✓ Build: 0 errors
✓ Lint: 0 errors
✗ Typecheck: 1 error (escalated)

Checkpoint created: ckpt-20260415-100000
Escalation required for: TS2345 (Argument type mismatch)

View escalation: endiorbot queue
```

---

### Day 10: E2E Testing & Sprint Review

**Goal**: End-to-end testing and sprint closure.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create tests/e2e/self-correction.test.ts | P0 | E2E tests | ~400 |
| Create docs/06-test/self-correction-scenarios.md | P1 | Test scenarios | ~200 |
| Run full test suite | P0 | All tests pass | - |
| Update CURRENT-SPRINT.md | P0 | Sprint 37 CLOSE | - |
| G-Sprint-37 checklist | P0 | Sprint approved | - |

**E2E Test Scenarios**:
- [ ] Scenario 1: Fix missing import (TS2304) → success
- [ ] Scenario 2: Fix type mismatch (TS2322) → success
- [ ] Scenario 3: Fix unused variable (ESLint) → success
- [ ] Scenario 4: Reject @ts-ignore fix → anti-cheat violation
- [ ] Scenario 5: 3 failed fix attempts → escalation
- [ ] Scenario 6: Budget limit during fix loop → pause
- [ ] Scenario 7: Test failure (snapshot) → experimental fix
- [ ] Scenario 8: Test failure (assertion) → escalate (too uncertain)
- [ ] Scenario 9: Fix loop success → checkpoint created
- [ ] Scenario 10: Full correction loop with mixed errors → partial success

**Acceptance Criteria**:
- [ ] All E2E tests pass
- [ ] All unit tests pass (target: 100+ tests)
- [ ] Build passes
- [ ] Zero lint warnings
- [ ] Code coverage >80% for self-correction module
- [ ] Documentation complete
- [ ] G-Sprint-37 checklist signed off

---

## Sprint 37 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Tests passing** | 100% | All unit + E2E tests |
| **Lint warnings** | 0 | pnpm lint |
| **Build** | Pass | pnpm build |
| **Code coverage** | >80% | vitest --coverage |
| **Fix success rate (build)** | 70-90% | E2E test corpus |
| **Fix success rate (lint)** | 70-90% | E2E test corpus |
| **Fix success rate (type)** | 70-90% | E2E test corpus |
| **Fix success rate (test)** | 30% | Experimental corpus |
| **Anti-cheat detection** | >95% | Anti-cheat tests |
| **Documentation** | Complete | ADR-008, test scenarios |
| **LOC added** | ~5,200 | Self-correction module |

---

## Files Created (Sprint 37)

### New Files

| File | LOC | Purpose |
|------|-----|---------|
| **Self-Correction** | | |
| `src/agents/self-correction/types.ts` | ~200 | Error types |
| `src/agents/self-correction/error-classifier.ts` | ~300 | Error classification |
| `src/agents/self-correction/verifier.ts` | ~300 | Build/lint/typecheck runner |
| `src/agents/self-correction/deterministic-fixer.ts` | ~500 | Fix patterns |
| `src/agents/self-correction/fix-patterns/import-fixer.ts` | ~150 | Import fixes |
| `src/agents/self-correction/fix-patterns/type-fixer.ts` | ~150 | Type fixes |
| `src/agents/self-correction/fix-patterns/lint-fixer.ts` | ~100 | Lint fixes |
| `src/agents/self-correction/anti-cheat-verifier.ts` | ~250 | Anti-cheat checks |
| `src/agents/self-correction/rule-blacklist.ts` | ~100 | Blacklisted patterns |
| `src/agents/self-correction/strike-counter.ts` | ~150 | Strike tracking |
| `src/agents/self-correction/escalation-policy.ts` | ~200 | Escalation rules |
| `src/agents/self-correction/test-fixer.ts` | ~400 | Test fix patterns |
| `src/agents/self-correction/test-patterns/snapshot-fixer.ts` | ~150 | Snapshot fixes |
| `src/agents/self-correction/test-patterns/assertion-fixer.ts` | ~150 | Assertion fixes |
| `src/agents/self-correction/self-correction-loop.ts` | ~400 | Main correction loop |
| `src/agents/self-correction/index.ts` | ~50 | Module exports |
| **CLI** | | |
| `src/cli/commands/fix.ts` | ~200 | Fix command |
| **Tests** | | |
| `tests/agents/self-correction/error-classifier.test.ts` | ~200 | Classifier tests |
| `tests/agents/self-correction/verifier.test.ts` | ~150 | Verifier tests |
| `tests/agents/self-correction/deterministic-fixer.test.ts` | ~250 | Fixer tests |
| `tests/agents/self-correction/anti-cheat.test.ts` | ~200 | Anti-cheat tests |
| `tests/agents/self-correction/strike-counter.test.ts` | ~150 | Strike counter tests |
| `tests/agents/self-correction/test-fixer.test.ts` | ~200 | Test fixer tests |
| `tests/agents/self-correction/integration.test.ts` | ~300 | Integration tests |
| `tests/cli/fix-cli.test.ts` | ~150 | CLI tests |
| `tests/e2e/self-correction.test.ts` | ~400 | E2E tests |
| **Documentation** | | |
| `docs/02-design/ADR-008-Self-Correction-Architecture.md` | ~400 | Self-correction ADR |
| `docs/06-test/self-correction-scenarios.md` | ~200 | Test scenarios |
| **Total** | **~5,950** | |

---

## Modified Files (Sprint 37)

| File | Changes |
|------|---------|
| `src/cli/index.ts` | Register fix command |
| `src/sessions/session-manager.ts` | Hook self-correction on tool call errors |

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT 37 INTEGRATION                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ CLI Layer    │  │Self-Correction│ │ Budget       │           │
│  │              │  │ Loop          │ │ (Sprint 36)  │           │
│  │ fix.ts       │──▶ • Verify     │◀──│ Cost check   │           │
│  │              │  │ • Classify   │  │              │           │
│  │              │  │ • Fix        │  │              │           │
│  │              │  │ • Anti-cheat │  │              │           │
│  └──────────────┘  │ • Re-verify  │  └──────────────┘           │
│                    └──────┬───────┘                              │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────┐           │
│  │         Self-Correction Components                │           │
│  │                                                   │           │
│  │  • Error Classifier (build/lint/type/test)       │           │
│  │  • Verifier (pnpm build/lint/typecheck)          │           │
│  │  • Deterministic Fixer (70-90% success)          │           │
│  │  • Test Fixer (30% success, experimental)        │           │
│  │  • Anti-Cheat Verifier (reject rule disabling)   │           │
│  │  • Strike Counter (3-strike escalation)          │           │
│  └───────────────────────────────────────────────────┘           │
│                           │                                      │
│  ┌────────────────────────┴─────────────────────────┐           │
│  │         Integration Points (Existing)            │           │
│  │                                                   │           │
│  │  • Checkpoint (Sprint 35) ✅                     │           │
│  │  • Budget Tracker (Sprint 36) ✅                 │           │
│  │  • Escalation Router (Sprint 36) ✅              │           │
│  │  • Logger (Sprint 34) ✅                         │           │
│  │  • EventsLogger (Sprint 35) ✅                   │           │
│  └───────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## CEO Experience (Sprint 37)

### Touchpoint 1: Automatic Fix Success

```bash
$ endiorbot start myproject
# ... agent makes changes ...
# Build fails due to missing import

Auto-correction triggered: Build errors detected

Running verification...
✗ Build: 1 error
  src/config/index.ts:42:10 - error TS2304: Cannot find name 'Logger'

Applying fix...
  ✓ Adding import: import { Logger } from '../logging/logger';

Re-verification...
✓ Build: 0 errors
✓ Lint: 0 errors
✓ Typecheck: 0 errors

Checkpoint created: ckpt-20260415-143000
Auto-fix successful (cost: $0.02)

Continuing with task...
```

### Touchpoint 2: Anti-Cheat Violation

```bash
# Agent attempts to add @ts-ignore

Auto-correction triggered: Type errors detected

Running verification...
✗ Typecheck: 1 error
  src/sessions/types.ts:15:5 - error TS2322: Type 'string' is not assignable to type 'number'

Applying fix...
  ⚠ Fix attempted to add @ts-ignore

Anti-cheat violation detected:
  Pattern: @ts-ignore
  Severity: error
  Message: Cannot use @ts-ignore

Fix rejected, escalating to CEO.

🔔 Approval Required: Type Safety Violation
  Decision: Agent attempted to suppress type error with @ts-ignore
  Recommended: Fix the actual type mismatch instead
  File: src/sessions/types.ts:15

Options:
  1. Review and fix manually
  2. Reject fix, provide guidance
  3. Allow @ts-ignore with justification (rare)

Choose option [1-3]: 1
```

### Touchpoint 3: 3-Strike Escalation

```bash
# Agent attempts same fix 3 times

Auto-correction triggered: Type errors detected

Attempt 1/3: Applying fix... ✗ Failed, re-verifying
Attempt 2/3: Applying fix... ✗ Failed, re-verifying
Attempt 3/3: Applying fix... ✗ Failed, max strikes exceeded

🛑 Auto-Fix Failed: Max Retries Exceeded

Errors remaining: 1
  src/api/handler.ts:22:10 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'

Strikes used: 3/3
Cost: $0.09

Escalating to CEO.

🔔 Manual Review Required
  Error: TS2345 (Type mismatch)
  File: src/api/handler.ts:22
  Attempted fixes: 3 (all failed)

Recommendation:
  This error requires semantic understanding. Auto-fix patterns did not match.

View file: endiorbot show src/api/handler.ts:22
Fix manually: edit src/api/handler.ts
```

### Touchpoint 4: Test Fix Experimental

```bash
# Test failure detected

Auto-correction triggered: Test errors detected

Running verification...
✓ Build: 0 errors
✓ Lint: 0 errors
✓ Typecheck: 0 errors
✗ Tests: 1 failure
  tests/config/schema.test.ts: Snapshot mismatch

Experimental test fix available (30% confidence)
  Pattern: Snapshot mismatch
  Fix: Update snapshot

Apply experimental fix? [y/N]: y

Applying fix...
  Running: pnpm test --updateSnapshot
  ✓ Snapshot updated

Re-verification...
✓ Tests: 0 failures

⚠ Note: Test fix was experimental
  Review the snapshot diff to ensure correctness
  Commit: git diff tests/__snapshots__/

Checkpoint created: ckpt-20260415-150000
Auto-fix successful (cost: $0.03)
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Fix patterns too simple** | Low success rate | Start with common patterns, iterate based on telemetry |
| **Infinite fix loops** | Runaway costs | 3-strike escalation, budget tracking, anti-cheat verifier |
| **Anti-cheat too strict** | Blocks valid fixes | Allow overrides with justification, configurable blacklist |
| **Test fixer breaks tests** | CI failures | Experimental flag, always review snapshots, never modify production code |
| **Classification inaccurate** | Wrong fixes applied | Conservative confidence thresholds, escalate on uncertainty |

---

## Success Criteria (Sprint 37)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| **Build fix success** | 70-90% | E2E test corpus |
| **Lint fix success** | 70-90% | E2E test corpus |
| **Type fix success** | 70-90% | E2E test corpus |
| **Test fix success** | 30% | Experimental corpus |
| **Anti-cheat detection** | >95% | Anti-cheat tests |
| **3-strike escalation** | 100% | Strike counter tests |
| **No infinite loops** | 100% | E2E tests |
| **Test coverage** | >80% | vitest --coverage |
| **Build status** | Pass | CI/CD |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 36 complete | PLANNED | Budget control needed |
| ADR-008 approved | DRAFT → APPROVED | Day 1 task |
| package.json scripts | ✅ | build, lint, typecheck available |
| ESLint JSON output | ✅ | --format json flag |
| TypeScript CLI | ✅ | tsc --noEmit |

---

## Next Sprint Preview (Sprint 38)

**Sprint Goal**: Phase 4 - Hybrid AI/Ollama Resource Router

**Key Deliverables**:
- Resource router (Cloud vs Ollama)
- Quality gates per model
- Cost optimization (use Ollama for simple tasks)
- Fallback on budget exhaustion
- Integration with self-correction

**Prerequisite**: Sprint 37 PASS (self-correction validated)

---

## Approval Checklist (G-Sprint-37)

### Code Quality
- [ ] Build passes (`pnpm build`)
- [ ] All tests pass (>100 tests)
- [ ] Zero lint warnings (`pnpm lint`)
- [ ] Code coverage >80% for self-correction module
- [ ] TypeScript strict mode compliant

### Features
- [ ] Error classifier identifies error types (>90% accuracy)
- [ ] Deterministic fixer resolves 70-90% build/lint/type errors
- [ ] Test fixer experimental (30% success rate)
- [ ] Anti-cheat verifier blocks rule disabling (>95% detection)
- [ ] 3-strike escalation prevents infinite loops
- [ ] Budget tracker integrates with fix loop
- [ ] CLI commands work (fix, fix --dry-run, fix --verify-only)

### Testing
- [ ] 10 E2E scenarios pass
- [ ] Unit tests cover all edge cases
- [ ] Anti-cheat tests pass
- [ ] Strike counter tests pass
- [ ] Manual testing: fix loop success

### Documentation
- [ ] ADR-008 approved and committed
- [ ] Test scenarios documented
- [ ] CLI help text complete
- [ ] Integration diagram accurate

### Integration
- [ ] Self-correction loop integrates with checkpoint
- [ ] Self-correction loop integrates with budget tracker
- [ ] Self-correction loop integrates with escalation router
- [ ] CLI fix command works

---

## Approval Status

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | PENDING | |
| CTO | @cto | PENDING | |
| Reviewer | @reviewer | PENDING | |
| CEO | @CEO | PENDING | Awaiting Sprint 36 close |

---

**Last Updated**: 2026-02-22
**Sprint Owner**: @coder (AI)
**Sprint Status**: DRAFT - Pending CEO Approval
**Blocking**: Sprint 36 close + ADR-008 approval

---

*Sprint 37 Plan - Autonomy Epic Phase 3*
*EndiorBot Self-Correction System*
*SDLC Framework 6.1.1*
