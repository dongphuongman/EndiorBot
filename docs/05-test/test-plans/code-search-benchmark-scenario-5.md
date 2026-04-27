# Code Search Benchmark - Scenario #5: Refactor & Anti-Pattern Detection

> **Historical artifact** — this document reflects the framework version and test count at the time of writing. Current stats: 8,124+ tests, SDLC 6.3.1.

---
**Status**: PROPOSED
**Date**: 2026-03-01
**Author**: CTO + Architect
**Sprint**: 65+ (validates ast-grep value)
**Authority**: ADR-015, Research "Autonomous SDLC Agent"
**Purpose**: Justify ast-grep over ripgrep for structural search

---

## Overview

**Goal**: Prove that **ast-grep provides significant value** over ripgrep for:
1. Refactoring (structural code changes)
2. Anti-pattern detection (security/quality gates)
3. ActionControlPlane bypass detection (governance)

**Why this matters**:
- Ripgrep = text-based → false positives in comments/strings
- ast-grep = AST-based → precise structural matches
- **Cost/benefit**: ast-grep stub (Sprint 64) → full implementation (Sprint 66+)

---

## Benchmark Tasks

### Task 1: Find Forbidden `any` Types in React Components

**Query**: Find all React components using TypeScript `any` type (forbidden by exactOptionalPropertyTypes).

**ripgrep attempt**:
```bash
rg ":\s*any" --type ts
```

**Expected ripgrep issues**:
- ❌ Matches comments: `// FIXME: avoid any here`
- ❌ Matches strings: `const msg = "Don't use any type"`
- ❌ Matches function names: `function handleAnyEvent()`
- ❌ False positive rate: ~40%

**ast-grep attempt**:
```yaml
# .ast-grep/rules/no-any-type.yml
rule:
  pattern: |
    const $NAME: any = $$$
  kind: variable_declaration
```

**Expected ast-grep results**:
- ✅ Only matches actual type annotations
- ✅ Precision: 95%+
- ✅ Zero false positives from comments/strings

**Success criteria**: ast-grep precision ≥ 95%, ripgrep ≤ 60%

---

### Task 2: Find Unused Exports (Dead Code)

**Query**: Find exported functions/classes that are never imported elsewhere.

**ripgrep attempt**:
```bash
# Step 1: Find all exports
rg "^export (function|class|const)" > exports.txt

# Step 2: Check each for imports (manual/scripted)
# → Complex, error-prone, misses re-exports
```

**Expected ripgrep issues**:
- ❌ Misses re-exports: `export { foo } from './bar'`
- ❌ Misses namespace imports: `import * as utils`
- ❌ Manual correlation required
- ❌ False positive rate: ~50%

**ast-grep attempt**:
```yaml
# .ast-grep/rules/unused-exports.yml
rule:
  pattern: |
    export function $NAME($$$) { $$$ }
  constraints:
    - not:
        pattern: import { $NAME }
```

**Expected ast-grep results**:
- ✅ AST-aware import/export tracking
- ✅ Handles re-exports correctly
- ✅ Precision: 90%+

**Success criteria**: ast-grep finds ≥20% more true unused exports than ripgrep.

---

### Task 3: Find ActionControlPlane Bypasses (Security)

**Query**: Find code that directly calls destructive operations WITHOUT going through ActionControlPlane.

**Anti-patterns**:
```typescript
// ❌ BAD: Direct fs operations
fs.unlinkSync('file.txt');
fs.rmdirSync('dir', { recursive: true });

// ❌ BAD: Direct git operations
execSync('git push --force');
execSync('rm -rf node_modules');

// ✅ GOOD: Via ActionControlPlane
await actionControlPlane.propose({
  action: 'file_delete',
  risk: 'DESTRUCTIVE',
  target: 'file.txt'
});
```

**ripgrep attempt**:
```bash
rg "fs\.unlink|fs\.rmdir|git push --force|rm -rf" --type ts
```

**Expected ripgrep issues**:
- ❌ Matches comments: `// TODO: avoid fs.unlinkSync`
- ❌ Matches strings in tests: `expect(error).toContain('fs.unlink')`
- ❌ Cannot check if call is wrapped in try/catch or ActionControlPlane
- ❌ False positive rate: ~60%

**ast-grep attempt**:
```yaml
# .ast-grep/rules/no-direct-destructive-ops.yml
rule:
  any:
    # File deletions
    - pattern: fs.unlinkSync($$$)
    - pattern: fs.rmdirSync($$$)
    # Force pushes
    - pattern: execSync('git push --force')
    - pattern: execSync('rm -rf $$$')
  constraints:
    - not:
        # Allow if inside ActionControlPlane wrapper
        inside:
          pattern: |
            await actionControlPlane.propose({ $$$ })
```

**Expected ast-grep results**:
- ✅ Only matches actual function calls (not comments/strings)
- ✅ Checks if wrapped in ActionControlPlane
- ✅ Precision: 95%+
- ✅ **Critical for governance**: Prevents accidental bypass

**Success criteria**: ast-grep precision ≥ 95%, catches 100% of true bypasses.

---

### Task 4: Refactor Arrow Functions → Async/Await in Error Handlers

**Query**: Find all arrow functions in error handlers that should be async/await.

**Pattern to find**:
```typescript
// BEFORE (callback style)
.catch((err) => {
  logger.error(err);
  return fallback;
});

// AFTER (async/await style)
.catch(async (err) => {
  await logger.error(err);
  return fallback;
});
```

**ripgrep attempt**:
```bash
rg "\.catch\(\([^)]+\)\s*=>\s*{" --type ts
```

**Expected ripgrep issues**:
- ✅ Finds catch blocks
- ❌ Cannot verify function signature (async vs sync)
- ❌ Cannot check if logger.error is awaited
- ❌ Requires manual review of every match
- ❌ False positive rate: ~30% (includes already-async handlers)

**ast-grep attempt**:
```yaml
# .ast-grep/rules/refactor-catch-to-async.yml
rule:
  pattern: |
    .catch(($ERR) => {
      $$$BODY
    })
  constraints:
    - not:
        pattern: |
          .catch(async ($ERR) => { $$$ })
```

**Expected ast-grep results**:
- ✅ Only matches sync arrow functions in catch
- ✅ Excludes already-async handlers
- ✅ Precision: 90%+
- ✅ **Enables automated refactoring**: Can apply fix mechanically

**Success criteria**: ast-grep precision ≥ 90%, enables automated fix.

---

## Benchmark Setup

### Test Corpus

Use **EndiorBot codebase** as test subject:
- ~50K LOC TypeScript
- Mix of src/ and tests/
- Real-world patterns

### Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Precision** | True positives / (True + False positives) | ≥90% for ast-grep |
| **Recall** | True positives / (True + False negatives) | ≥85% for ast-grep |
| **Time to fix** | Time to apply refactor after finding matches | <10min for ast-grep |
| **CEO confidence** | Would CEO trust results without manual review? | ≥80% for ast-grep |

### Baseline

- **ripgrep**: Precision ~50-60% (high false positive rate)
- **ast-grep**: Target precision ≥90%

---

## Success Criteria

**ast-grep is justified if**:
1. ✅ Precision ≥90% (vs ripgrep ~60%)
2. ✅ Catches ≥1 critical ActionControlPlane bypass
3. ✅ Enables automated refactoring (Task 4)
4. ✅ CEO trusts results without manual review (≥80% confidence)

**If ast-grep fails** (precision <80%):
- ❌ Keep as stub, defer to Sprint 68+
- ⚠️ Re-evaluate cost/benefit

---

## Implementation

### Phase 1: Manual Validation (Sprint 65 - Week 1)

1. Run both ripgrep and ast-grep on all 4 tasks
2. Manually classify results as TP/FP/FN
3. Calculate precision/recall
4. Document false positive examples

### Phase 2: AST-Grep Rules (Sprint 66 - Week 1)

1. Create `.ast-grep/rules/` directory
2. Implement 4 rules:
   - `no-any-type.yml`
   - `unused-exports.yml`
   - `no-direct-destructive-ops.yml`
   - `refactor-catch-to-async.yml`
3. Test on EndiorBot codebase

### Phase 3: Integration (Sprint 66 - Week 2)

1. If precision ≥90%: Full AstGrepProvider implementation
2. If precision <80%: Defer, keep stub
3. Document results in benchmark report

---

## Expected Results

### Task 1: Forbidden `any`
- ripgrep: 40% precision (60% false positives)
- ast-grep: 95% precision (5% false positives)
- **Value**: Enforces TypeScript strictness

### Task 2: Unused Exports
- ripgrep: 50% precision (misses re-exports)
- ast-grep: 90% precision (AST-aware)
- **Value**: Dead code elimination

### Task 3: ActionControlPlane Bypass
- ripgrep: 40% precision (comments/strings)
- ast-grep: 95% precision (only real calls)
- **Value**: **CRITICAL for governance**

### Task 4: Refactor Arrow→Async
- ripgrep: 70% precision (cannot check async status)
- ast-grep: 90% precision (AST-aware)
- **Value**: Enables automated refactoring

**Overall justification**: ast-grep provides **2x precision** and enables **governance + automation**.

---

## References

- ADR-015: Retrieval Explainability & Evidence
- ADR-014: Code Search Layer
- Research: "Nâng cấp EndiorBot thành Autonomous SDLC Agent"
- TS-007: Code Search Layer Technical Spec

---

*Benchmark Scenario #5: Refactor & Anti-Pattern Detection*
*SDLC Framework v6.1.1 compliant*
*Validates ast-grep ROI for Sprint 66+ implementation*
