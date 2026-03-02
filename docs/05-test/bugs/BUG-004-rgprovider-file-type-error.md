# BUG-004: RgProvider File Type Error

**Status:** ✅ RESOLVED
**Severity:** P0 (Critical - Blocks Sprint 63-64 features)
**Component:** Code Search (RgProvider)
**Sprint:** 63-64 (Code Search Foundation)
**Discovered:** 2026-03-01 (Manual Test Session 1)
**Fixed:** 2026-03-01
**Fixed By:** @tester

---

## Summary

RgProvider failed with "unrecognized file type" error when executing searches, blocking all Sprint 63-64 search functionality.

---

## Reproduction Steps

1. Run any search command: `./endiorbot.mjs context search "query" -c`
2. Observe: Error "rg: unrecognized file type..."
3. Verify ripgrep binary works: `/opt/homebrew/bin/rg "query" src/`

**Expected:** Search results from ripgrep
**Actual:** Error, no results

---

## Root Cause

**File:** [src/search/retrieval-policy.ts](../../src/search/retrieval-policy.ts)

The retrieval policy used invalid ripgrep file types in `priorityTypes` arrays:
```typescript
priorityTypes: ["ts", "tsx", "js", "jsx"]  // ❌ INVALID
```

**Analysis:**

ripgrep's type system already includes file extensions:
```bash
$ rg --type-list | grep "^ts:"
ts: *.ts, *.tsx

$ rg --type-list | grep "^js:"
js: *.js, *.jsx
```

**Problem:**
- "tsx" is NOT a valid ripgrep type name
- "jsx" is NOT a valid ripgrep type name
- Passing invalid types → ripgrep exits with code 2
- RgProvider interprets exit code 2 as search failure

---

## Evidence

**Workaround Verification:**
```bash
$ /opt/homebrew/bin/rg "SEARCH_BUDGET" src/search/ | head -3
src/search/search-budget.ts:  SEARCH_BUDGET,
src/search/search-budget.ts:    private readonly maxTokens: number = SEARCH_BUDGET.HARD_CAP_TOKENS,
src/search/search-budget.ts:    private readonly softLimit: number = SEARCH_BUDGET.TOKEN_LIMIT,
```

✅ ripgrep binary works correctly - issue is in RgProvider integration

---

## Impact

**User Impact:**
- All search commands fail
- Sprint 63-64 deliverables blocked
- Manual testing blocked

**Test Impact:**
- TC-1.1 through TC-1.6 all failing
- Search module unusable
- Context search features non-functional

---

## Solution

**Files Modified:** [src/search/retrieval-policy.ts](../../src/search/retrieval-policy.ts)

### Changes

**Line 108 (BUILD stage):**
```typescript
// Before
priorityTypes: ["ts", "tsx", "js", "jsx"]

// After
priorityTypes: ["ts", "js"]
```

**Line 184 (@coder role):**
```typescript
// Before
priorityTypes: ["ts", "tsx", "js", "jsx"]

// After
priorityTypes: ["ts", "js"]
```

**Line 190 (@reviewer role):**
```typescript
// Before
priorityTypes: ["ts", "tsx"]

// After
priorityTypes: ["ts"]
```

**Rationale:**
- Use only valid ripgrep type names
- "ts" type already covers .ts AND .tsx files
- "js" type already covers .js AND .jsx files
- Simpler, more maintainable

---

## Verification

**Test Suite:** TC-1.1 through TC-1.6 (Context Search)

**Before Fix:**
```bash
$ ./endiorbot.mjs context search "SEARCH_BUDGET" -c
🔍 Codebase Search: "SEARCH_BUDGET"
────────────────────────────────────────────────
Stage: 04-BUILD

⚠️  RgProvider search failed
    query="SEARCH_BUDGET" error="rg: unrecognized file ty..."
❌ No matches found.
```

**After Fix:**
```bash
$ ./endiorbot.mjs context search "SEARCH_BUDGET" -c
🔍 Codebase Search: "SEARCH_BUDGET"
────────────────────────────────────────────────
Stage: 04-BUILD

Found 15 matches (showing 15):

./src/search/__tests__/types.test.ts:5
  * Tests CTO Amendment A3 (SEARCH_BUDGET constants).

./src/search/types.ts:5
  * Includes CTO amendments A1 (providerVersion) and A3 (SEARCH_BUDGET).

[... 13 more results ...]

────────────────────────────────────────────────
Elapsed: 62ms | Tokens: 120 | Provider: ripgrep 15.1.0
```

**Test Results:**
- ✅ TC-1.1: Basic search - PASS (15 matches found, 62ms)
- ✅ TC-1.2: Stage filtering - PASS (3 results in 01-PLANNING)
- ✅ TC-1.3: Role filtering - PASS (@coder role works)
- ✅ TC-1.4: File type filter - PASS (--type md works)
- ✅ TC-1.5: Verbose mode - PASS (debug logs shown)
- ✅ TC-1.6: Empty query - PASS (warning displayed)

**Status:** ✅ VERIFIED - All 6 test cases pass

---

## Debug Information

**Environment:**
- ripgrep version: 15.1.0
- ripgrep path: /opt/homebrew/bin/rg
- OS: macOS Darwin 25.3.0
- Node: v24.11.0

**ripgrep Type System:**
```bash
$ rg --type-list | grep -E "^(ts|js|tsx|jsx):"
ts: *.ts, *.tsx
js: *.js, *.jsx
```

Note: "tsx" and "jsx" are not standalone types!

---

## Related Issues

- None

---

## Lessons Learned

1. **External Tool Knowledge:** Must understand ripgrep's built-in type system
2. **Validation:** File type filters should validate against `rg --type-list`
3. **Error Messages:** Need better parsing/display of ripgrep errors
4. **Testing:** Unit tests should verify file type filter correctness

---

## Recommendations

### Immediate (Complete)
- ✅ Fix implemented and verified
- ✅ All search tests passing

### Short-term
- [ ] Add file type validation helper
- [ ] Parse ripgrep exit codes properly
- [ ] Improve error messages for invalid types
- [ ] Add unit test for file type validation

### Long-term
- [ ] Create `validateFileType()` helper
- [ ] Check against `rg --type-list` at startup
- [ ] Cache valid types for performance
- [ ] Add telemetry for search failures

---

## Performance Impact

**Before Fix:** Search fails immediately (error)
**After Fix:** Search completes in ~50-100ms

**Token Usage:** ~70-120 tokens per search (efficient)

---

**Resolution:** Fixed in commit (to be committed)
**Technical Spec:** [TS-009](../02-design/14-Technical-Specs/TS-009-Bug-Fixes-Session-1.md)
**Test Evidence:** [Test Report 2026-03-01](./test-reports/test-report-2026-03-01.md)
