# BUG-013: @coder Agent Overwrites Entire File Instead of Editing Target Lines

**Status:** FIXED (Sprint 129) — 3 layers of defense added
**Severity:** P0 (Critical - Destroys existing code)
**Component:** EndiorBot CLI / Agent @coder / File Write Operation
**Sprint:** Pre-124b (discovered during VideoLingo testing)
**Discovered:** 2026-04-05
**Discovered By:** @ceo
**Fixed:** —
**Fixed By:** —

---

## Summary

`endiorbot agent @coder` overwrote the entire `translations/translations.py` file, keeping only the last 4 lines of the intended edit and destroying all existing code — imports, functions, and logic. This caused the VideoLingo app to crash with `IndentationError`.

---

## Reproduction Steps

1. File before: `translations/translations.py` — 33 lines with `import json`, `DISPLAY_LANGUAGES` dict, `load_translations()`, `translate()` functions
2. Run command:
   ```bash
   endiorbot agent @coder "Thêm tiếng Việt vào DISPLAY_LANGUAGES"
   ```
3. File after: only 4 lines remaining:
   ```python
       "🇷🇺 Русский": "ru",
       "🇫🇷 Français": "fr",
       "🇻🇳 Tiếng Việt": "vi",
   }
   ```
4. Launch app → `IndentationError: unexpected indent` at line 1

**Expected:** @coder adds one line (`"🇻🇳 Tiếng Việt": "vi",`) to the existing `DISPLAY_LANGUAGES` dict, preserving all other code.

**Actual:** @coder overwrites the entire file, destroying:
- `import json`
- `DISPLAY_LANGUAGES` dict opening (`DISPLAY_LANGUAGES = {`) and first 5 entries
- `load_translations()` function (7 lines)
- `translate()` function (10 lines)

---

## Root Cause

The @coder agent likely used a **Write** operation (full file overwrite) instead of an **Edit** operation (targeted replacement). The Write payload only contained the tail portion of the dict + the new entry, discarding everything above.

**Possible causes in EndiorBot agent orchestration:**
1. Agent received truncated file context (only last N lines) and wrote back what it saw + the addition
2. Agent used Write tool instead of Edit tool for a single-line insertion
3. No validation that the output file is a valid superset of the original content (or at minimum, not significantly shorter)

---

## Evidence

**File before (@coder)** — from `git show HEAD:translations/translations.py`:
```python
import json

DISPLAY_LANGUAGES = {
    "🇬🇧 English": "en",
    "🇨🇳 简体中文": "zh-CN",
    "🇭🇰 繁体中文": "zh-HK",
    "🇯🇵 日本語": "ja",
    "🇪🇸 Español": "es",
    "🇷🇺 Русский": "ru",
    "🇫🇷 Français": "fr",
}

# Load the language file based on user selection
def load_translations(language="en"):
    ...

def translate(key):
    ...
```

**File after (@coder)** — 4 lines, orphaned dict entries:
```python
    "🇷🇺 Русский": "ru",
    "🇫🇷 Français": "fr",
    "🇻🇳 Tiếng Việt": "vi",
}
```

**Crash output:**
```
IndentationError: unexpected indent
  /Users/dttai/Projects/VideoLingo/translations/translations.py:1
     "🇷🇺 Русский": "ru",
    ▲
```

---

## Impact

**User Impact:**
- App completely broken — cannot launch VideoLingo
- Data loss: entire file content destroyed (recoverable from git, but user may not know how)
- Trust violation: CEO delegated a simple task and @coder destroyed working code

**System Impact:**
- Any `endiorbot agent @coder` edit command is potentially destructive
- No safeguard against catastrophic file overwrites
- Risk applies to ALL files, not just this one

---

## Resolution (Manual)

Fixed manually by @pm in Claude Code session:
1. Retrieved original file from `git show HEAD:translations/translations.py`
2. Restored full content + added the Vietnamese entry
3. Verified app launches successfully

---

## Proposed Solution

### Safeguard 1: Prefer Edit over Write

@coder agent should use **Edit** (targeted replacement) by default for modifications to existing files. Write (full overwrite) should only be used for new file creation.

### Safeguard 2: Pre-write validation

Before writing a file, EndiorBot should validate:
- If file exists and new content is **>50% shorter** → BLOCK and warn
- If file exists and new content **removes imports/function definitions** → BLOCK and warn
- Compute a diff and require confirmation for destructive changes

### Safeguard 3: Auto-backup before agent writes

```bash
# Before any agent file write:
cp target_file target_file.bak.$(date +%s)
```

Or leverage git:
```bash
git stash push -m "pre-agent-backup" -- target_file
```

### Safeguard 4: Post-write syntax check

After writing a Python file, run:
```bash
python -m py_compile target_file
```
If it fails → auto-rollback and report error to user.

---

## Verification

**Test when fixed:**

1. Run `endiorbot agent @coder "Add X to existing dict in file Y"`
2. Verify file retains ALL original content + only the addition
3. Verify `python -m py_compile` passes after edit
4. Test with files of various sizes (10 lines, 100 lines, 1000 lines)

---

## Lessons Learned

1. **Destructive by default:** Agent file operations without safeguards can destroy working code in one command
2. **Simple tasks, catastrophic failures:** A 1-line addition became a full file deletion — complexity of change does not correlate with risk
3. **Git is the safety net:** Without version control, this data loss would be unrecoverable
4. **Trust requires guardrails:** If EndiorBot agents can silently destroy files, CEO cannot safely delegate

---

## Recommendations

### Immediate (P0)
- [ ] Add file size comparison check before Write operations
- [ ] Add `python -m py_compile` post-write check for .py files
- [ ] @coder agent should default to Edit tool, not Write tool

### Short-term
- [ ] Pre-write diff preview for existing files
- [ ] Auto git-stash backup before agent file modifications
- [ ] Syntax validation for known file types (.py, .js, .ts, .json, .yaml)

### Long-term
- [ ] Agent sandbox: run file modifications in a temp branch, verify, then merge
- [ ] Rollback command: `endiorbot undo` to revert last agent action
- [ ] File integrity monitoring: track file hashes before/after agent operations

---

## Related Issues

- [BUG-012](./BUG-012-plan-command-unicode-slug-and-decomposition.md) — `plan` command issues (same testing session)

---

**SDLC Framework v6.2.1 | Stage 05-TEST | EndiorBot**
