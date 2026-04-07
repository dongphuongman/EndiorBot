# BUG-012: `plan` Command — Unicode Slug Mangling & Poor Task Decomposition

**Status:** DISCOVERED
**Severity:** P2 (Medium - Feature degraded)
**Component:** EndiorBot CLI / Plan Command
**Sprint:** Pre-124b (discovered during VideoLingo testing)
**Discovered:** 2026-04-05
**Discovered By:** @ceo
**Fixed:** —
**Fixed By:** —

---

## Summary

`endiorbot plan` with Vietnamese (Unicode) input produces a mangled file slug and fails to decompose the goal into meaningful subtasks — outputting a single generic task assigned to `@assistant` instead of role-specific tasks.

---

## Reproduction Steps

```bash
endiorbot plan "Thêm hỗ trợ tiếng Việt cho VideoLingo installer và UI"
```

**Expected:**
1. File slug preserves or transliterates Vietnamese properly (e.g., `plan-2026-04-05-them-ho-tro-tieng-viet-cho-videolingo-inst.md`)
2. Plan decomposes into multiple tasks with appropriate agent assignments (e.g., @pm for requirements, @coder for implementation, @tester for verification)

**Actual:**
1. File slug: `plan-2026-04-05-th-m-h-tr-ti-ng-vi-t-cho-videolingo-inst.md` — diacritics stripped incorrectly, producing unreadable fragments
2. Only 1 task generated, assigned to `@assistant`:
   ```
   | 1 | @assistant | Thêm hỗ trợ tiếng Việt cho VideoLingo installer và UI | — |
   ```

---

## Root Cause

### Issue 1: Unicode slug generation

The slug function strips diacritics but does not transliterate Vietnamese characters properly. Vietnamese `ê` → should be `e`, `ỗ` → `o`, `ệ` → `e`, etc. Current behavior appears to strip the base vowel along with the diacritic in some cases:

```
"Thêm"  → "th-m"   (expected: "them")
"hỗ"    → "h"      (expected: "ho")
"trợ"   → "tr"     (expected: "tro")
"tiếng" → "ti-ng"  (expected: "tieng")
"Việt"  → "vi-t"   (expected: "viet")
```

**Likely cause:** slug function uses a regex that strips combining characters but also strips the modified base character in precomposed Unicode forms (NFC). Should normalize to NFD first, then strip combining marks only.

### Issue 2: Task decomposition

The plan command does not analyze the goal to break it into subtasks. It wraps the entire input as a single task and defaults to `@assistant`. This defeats the purpose of `plan` as a decomposition tool.

**Expected decomposition for this goal:**

| # | Agent | Description |
|---|-------|-------------|
| 1 | @pm | Define requirements: which strings need Vietnamese translation |
| 2 | @coder | Add `"🇻🇳 Tiếng Việt": "vi"` to DISPLAY_LANGUAGES |
| 3 | @coder | Create `translations/vi.json` with all translated strings |
| 4 | @tester | Verify installer and UI display Vietnamese correctly |

---

## Impact

**User Impact:**
- Plan file names are unreadable for non-ASCII project goals
- Plan output provides no actionable task breakdown — user must manually decompose
- Undermines `plan` command's value proposition as an AI-assisted planning tool

**System Impact:**
- File slugs with mangled characters may cause issues on some filesystems or git operations
- Plans that don't decompose create no value over simply writing a goal in a text file

---

## Proposed Solution

### Issue 1: Unicode slug fix

```javascript
// Use NFD normalization + strip combining marks
function slugify(text) {
  return text
    .normalize('NFD')                    // decompose: ê → e + ̂
    .replace(/[\u0300-\u036f]/g, '')     // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')        // non-alnum → dash
    .replace(/^-+|-+$/g, '')            // trim dashes
    .substring(0, 60);                   // reasonable length
}
```

### Issue 2: Task decomposition

Plan command should use the AI model to analyze the goal and:
1. Identify distinct work items
2. Assign appropriate agents based on AGENTS.md roster
3. Set dependencies between tasks
4. Consider the project's SDLC stage and gate requirements

---

## Verification

**Test when fixed:**

```bash
endiorbot plan "Thêm hỗ trợ tiếng Việt cho VideoLingo installer và UI"
```

1. File slug should be: `plan-2026-04-05-them-ho-tro-tieng-viet-cho-videolingo-inst.md`
2. Plan should contain 3+ tasks with role-specific agent assignments
3. Test with other Unicode inputs: Japanese, Russian, Chinese, emoji

---

## Lessons Learned

1. **i18n for the tool itself:** EndiorBot supports multilingual projects but its own internals (slug generation) don't handle non-ASCII well
2. **Plan = decomposition:** A plan command that doesn't decompose is just a `echo > file` with extra steps
3. **Testing with real users:** This was caught immediately in first CEO usage with Vietnamese input

---

## Recommendations

### Immediate
- [ ] Fix slugify function with NFD normalization

### Short-term
- [ ] Plan command should use AI to decompose goals into subtasks
- [ ] Plan should respect AGENTS.md roster for agent assignment
- [ ] Add Unicode test cases for slug generation (Vietnamese, Japanese, Chinese, Russian, Arabic)

### Long-term
- [ ] Plan command should be context-aware: read project files to suggest relevant tasks
- [ ] Plan → execute pipeline (Sprint 124b roadmap item)

---

**SDLC Framework v6.3.0 | Stage 05-TEST | EndiorBot**
