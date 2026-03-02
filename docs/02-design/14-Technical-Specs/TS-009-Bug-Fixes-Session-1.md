# TS-009: Bug Fixes - Session 1 (2026-03-01)

**Type:** Bug Fix Documentation
**Date:** 2026-03-01
**Sprint:** 63-64 (Code Search Foundation)
**Tester:** @tester
**Authority:** Manual Test Plan, Test Report 2026-03-01

---

## Executive Summary

Two critical bugs (BUG-003 and BUG-004) discovered during manual testing were fixed, restoring 100% test pass rate for Context Search and Core Commands test suites.

---

## BUG-003: active.json Not Persisted

### Problem Statement

**Severity:** P1 (High)
**Component:** Project Context Switching
**Impact:** Status command unusable, context switching broken

**Symptom:**
```bash
$ ./endiorbot.mjs switch /path/to/project
📂 Switched to: EndiorBot

$ ./endiorbot.mjs status
❌ Project path not found: /var/folders/.../endiorbot-test-project
```

### Root Cause Analysis

**File:** [src/cli/commands/switch.ts](../../src/cli/commands/switch.ts)

The switch command only saved to `projects.json` via `saveState()`, but the status command reads from `active-project.json` via `loadActiveProject()`.

**Code Path:**
1. `switch.ts:178` - Called `saveState(state)` → writes to `projects.json`
2. `status.ts` - Called `loadActiveProject()` → reads from `active-project.json`
3. **Mismatch:** No file written to `active-project.json`

### Solution

**Files Modified:** [src/cli/commands/switch.ts](../../src/cli/commands/switch.ts)

1. **Import Addition (Line 25):**
   ```typescript
   import { STATE_DIR, saveActiveProject } from "../../config/paths.js";
   ```

2. **Save Active Project (Lines 180-186):**
   ```typescript
   // Save state
   saveState(state);

   // Save active project (for status command)
   saveActiveProject({
     path: projectPath,
     name: sdlcInfo.name,
     tier: sdlcInfo.tier,
     startedAt: Date.now(),
   });
   ```

### Verification

**Test Case:** TC-5.1 (Status Command)

**Before Fix:**
```bash
$ ./endiorbot.mjs status
❌ Project path not found: /var/folders/.../endiorbot-test-project
```

**After Fix:**
```bash
$ ./endiorbot.mjs status
┌─────────────────────────────────────────────────────────────┐
│  📊 Project Status                                          │
├─────────────────────────────────────────────────────────────┤
│  Name: EndiorBot                                           │
│  Path: /Users/dttai/Documents/Python/01.NQH/EndiorBot      │
│  Tier: 🔵 STANDARD                                         │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ✅ **FIXED** - Verified by TC-5.1

---

## BUG-004: RgProvider File Type Error

### Problem Statement

**Severity:** P0 (Critical - Blocks Sprint 63-64 features)
**Component:** Code Search (RgProvider)
**Impact:** All search commands fail

**Symptom:**
```bash
$ ./endiorbot.mjs context search "SEARCH_BUDGET" -c
⚠️  RgProvider search failed
    query="SEARCH_BUDGET" error="rg: unrecognized file type..."
❌ No matches found.
```

### Root Cause Analysis

**File:** [src/search/retrieval-policy.ts](../../src/search/retrieval-policy.ts)

The retrieval policy used invalid ripgrep file types: `["ts", "tsx", "js", "jsx"]`

**Evidence:**
```bash
$ /opt/homebrew/bin/rg --type-list | grep "^ts:"
ts: *.ts, *.tsx

$ /opt/homebrew/bin/rg --type-list | grep "^js:"
js: *.js, *.jsx
```

**Analysis:**
- ripgrep's "ts" type already includes `.tsx` files
- ripgrep's "js" type already includes `.jsx` files
- "tsx" and "jsx" are NOT valid standalone type names
- Passing invalid types caused ripgrep to exit with error code 2

### Solution

**Files Modified:** [src/search/retrieval-policy.ts](../../src/search/retrieval-policy.ts)

**Changes:**

1. **Line 108 (BUILD stage):**
   ```typescript
   // Before
   priorityTypes: ["ts", "tsx", "js", "jsx"]

   // After
   priorityTypes: ["ts", "js"]
   ```

2. **Line 184 (@coder role):**
   ```typescript
   // Before
   priorityTypes: ["ts", "tsx", "js", "jsx"]

   // After
   priorityTypes: ["ts", "js"]
   ```

3. **Line 190 (@reviewer role):**
   ```typescript
   // Before
   priorityTypes: ["ts", "tsx"]

   // After
   priorityTypes: ["ts"]
   ```

**Rationale:**
- Use only valid ripgrep type names
- Rely on ripgrep's built-in type definitions
- "ts" type covers both .ts and .tsx files
- "js" type covers both .js and .jsx files

### Verification

**Test Suite:** TC-1.1 through TC-1.6 (Context Search)

**Before Fix:**
```bash
$ ./endiorbot.mjs context search "SEARCH_BUDGET" -c
⚠️  RgProvider search failed
❌ No matches found.
```

**After Fix:**
```bash
$ ./endiorbot.mjs context search "SEARCH_BUDGET" -c
Found 15 matches (showing 15):
./src/search/__tests__/types.test.ts:5
  * Tests CTO Amendment A3 (SEARCH_BUDGET constants).
[... 14 more results ...]
────────────────────────────────────────────────────────────
Elapsed: 62ms | Tokens: 120 | Provider: ripgrep 15.1.0
```

**Status:** ✅ **FIXED** - Verified by TC-1.1 through TC-1.6 (6/6 passing)

---

## Additional Fix: TypeScript Error TS6133

### Problem

**File:** [src/context/git-context.ts](../../src/context/git-context.ts:139)
**Error:** `TS6133: '_logger' is declared but its value is never read.`

### Solution

**Line 139:**
```typescript
// Before
private readonly _logger: Logger;

// After
private readonly logger: Logger;
```

**Rationale:** Removed underscore prefix to indicate logger is used (debug logging).

**Status:** ✅ **FIXED** - Build passes

---

## Impact Analysis

### Test Results

**Before Fixes:**
- Tests Executed: 7
- Tests Passed: 5 (71%)
- Tests Failed: 2
- Critical Bugs: 2

**After Fixes:**
- Tests Executed: 14
- Tests Passed: 14 (100%)
- Tests Failed: 0
- Critical Bugs: 0

### Files Modified

| File | Lines Changed | Type |
|------|---------------|------|
| src/cli/commands/switch.ts | +7 | Import + function call |
| src/search/retrieval-policy.ts | 3 lines | Type arrays simplified |
| src/context/git-context.ts | 1 line | Rename variable |

**Total LOC Changed:** ~11 lines

### Dependencies

**New Dependency Installed:**
- `ast-grep` v0.41.0 (via Homebrew)
- Enables 9 previously-skipped search tests

---

## Lessons Learned

### BUG-003 Lessons

1. **State Management Consistency**: Ensure read/write operations use matching file paths
2. **Integration Testing**: Status command should have integration test with switch command
3. **Documentation**: Active project state format should be documented in ADR

### BUG-004 Lessons

1. **External Tool Knowledge**: Understand ripgrep's built-in type system
2. **Validation**: File type filters should validate against `rg --type-list`
3. **Error Messages**: Parse and display ripgrep errors more clearly
4. **Testing**: Unit tests should verify file type filter correctness

---

## Recommendations

### Immediate Actions (Complete)

- ✅ Fix BUG-003: active.json persistence
- ✅ Fix BUG-004: RgProvider file types
- ✅ Install ast-grep binary
- ✅ Re-run test suite

### Short-term (Sprint 64-65)

1. **Add Integration Tests:**
   - `switch + status` workflow test
   - RgProvider file type validation test

2. **Error Handling:**
   - Parse ripgrep error codes
   - Provide actionable error messages

3. **Documentation:**
   - ADR for active project state format
   - Update retrieval policy docs with ripgrep types

### Long-term (Sprint 66+)

1. **Type System Validation:**
   - Create `validateFileType()` helper
   - Check against `rg --type-list` at startup

2. **State Management:**
   - Unify state file handling
   - Consider single source of truth for active project

3. **Monitoring:**
   - Add telemetry for search failures
   - Track ripgrep error rates

---

## References

- **Test Report:** [test-report-2026-03-01.md](../../05-test/test-reports/test-report-2026-03-01.md)
- **Manual Test Plan:** [manual-test-plan.md](../../05-test/manual-test-plan.md)
- **ripgrep Documentation:** https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md#automatic-filtering

---

**Document Version:** 1.0
**Last Updated:** 2026-03-01
**Status:** ✅ Complete
**Authority:** SDLC Framework v6.1.1, Stage 02-DESIGN
