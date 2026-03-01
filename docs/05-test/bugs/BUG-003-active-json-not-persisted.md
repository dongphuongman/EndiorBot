# BUG-003: active.json Not Persisted

**Status:** ✅ RESOLVED
**Severity:** P1 (High)
**Component:** Project Context Switching
**Sprint:** 62 (Project Context Switching)
**Discovered:** 2026-03-01 (Manual Test Session 1)
**Fixed:** 2026-03-01
**Fixed By:** @tester

---

## Summary

The `switch` command did not persist the active project to `active-project.json`, causing the `status` command to fail with "Project path not found" error.

---

## Reproduction Steps

1. Run: `./endiorbot.mjs switch /path/to/project`
2. Verify: `cat ~/.endiorbot/active-project.json` → File exists but may have stale data
3. Run: `./endiorbot.mjs status` → Fails with wrong project path

**Expected:** `active-project.json` updated with current project path
**Actual:** File not updated, status command uses stale data

---

## Root Cause

**File:** [src/cli/commands/switch.ts](../../src/cli/commands/switch.ts)

The switch command only called `saveState(state)` which writes to `projects.json`, but did not call `saveActiveProject()` to write to `active-project.json`.

**Code Path:**
- Line 178: `saveState(state)` → writes to `~/.endiorbot/projects.json`
- Missing: `saveActiveProject()` → should write to `~/.endiorbot/active-project.json`
- `status.ts` reads from `active-project.json` via `loadActiveProject()`

---

## Impact

**User Impact:**
- Status command unusable
- Project context not persisted across sessions
- Users must re-switch every session

**Test Impact:**
- TC-5.1 (Status Command) failing
- Blocks project context switching workflow tests

---

## Solution

**Files Modified:** [src/cli/commands/switch.ts](../../src/cli/commands/switch.ts)

### Change 1: Import Addition (Line 25)
```typescript
import { STATE_DIR, saveActiveProject } from "../../config/paths.js";
```

### Change 2: Save Active Project (Lines 180-186)
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

---

## Verification

**Test Case:** TC-5.1 (Status Command)

**Before Fix:**
```bash
$ ./endiorbot.mjs switch /Users/dttai/Documents/Python/01.NQH/EndiorBot
📂 Switched to: EndiorBot

$ ./endiorbot.mjs status
❌ Project path not found: /var/folders/.../endiorbot-test-project
Use 'endiorbot switch <project>' to change projects.
```

**After Fix:**
```bash
$ ./endiorbot.mjs switch /Users/dttai/Documents/Python/01.NQH/EndiorBot
📂 Switched to: EndiorBot

$ cat ~/.endiorbot/active-project.json
{
  "path": "/Users/dttai/Documents/Python/01.NQH/EndiorBot",
  "name": "EndiorBot",
  "tier": "STANDARD",
  "startedAt": 1772377260913
}

$ ./endiorbot.mjs status
┌─────────────────────────────────────────────────────────────┐
│  📊 Project Status                                          │
├─────────────────────────────────────────────────────────────┤
│  Name: EndiorBot                                           │
│  Path: /Users/dttai/Documents/Python/01.NQH/EndiorBot      │
│  Tier: 🔵 STANDARD                                         │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ✅ VERIFIED - TC-5.1 passes

---

## Related Issues

- None

---

## Lessons Learned

1. **State Management Consistency:** Ensure read/write operations use matching file paths
2. **Integration Testing:** Need integration test for `switch + status` workflow
3. **Documentation:** Active project state format should be documented in ADR

---

## Recommendations

### Immediate (Complete)
- ✅ Fix implemented and verified

### Short-term
- [x] Add integration test: `switch + status` workflow *(Completed 2026-03-01 - tests/integration/project-context.test.ts)*
- [ ] Document active project state format in ADR
- [ ] Validate file existence in status command

### Long-term
- [ ] Unify state file handling
- [ ] Consider single source of truth for active project
- [ ] Add state file migration support

---

**Resolution:** Fixed in commit (to be committed)
**Technical Spec:** [TS-009](../02-design/14-Technical-Specs/TS-009-Bug-Fixes-Session-1.md)
**Test Evidence:** [Test Report 2026-03-01](./test-reports/test-report-2026-03-01.md)
