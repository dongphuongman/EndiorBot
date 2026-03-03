# BUG-011: Compliance Checker False Positive on Placeholder Docs

**Status:** OPEN
**Priority:** P1
**Found:** 2026-03-03 (E2E Testing Phase, Tier 1)
**Found By:** CEO
**Sprint:** Fix in Sprint 73

---

## Description

`endiorbot compliance score` reports 100% for Dyad, but stage directories (01-planning through 08-collaborate) contain only EndiorBot-generated README.md template files with placeholder content like `TODO: Add artifacts` and `TBD`.

The compliance checker validates **file/directory existence only** (L1), not **content quality** (L2). This gives a false sense of SDLC compliance.

## Steps to Reproduce

```bash
endiorbot start dyad
endiorbot compliance score
# → "Compliance score: 100%"  ← FALSE POSITIVE

# But actual content:
cat /path/to/dyad/docs/01-planning/README.md
# → "- [ ] TODO: Add planning artifacts"  ← PLACEHOLDER
```

## Expected Behavior

Compliance score should reflect that stage docs contain placeholder content, not real SDLC artifacts. A score of ~30-40% would be more accurate for Dyad's actual state.

## Root Cause

`checkCompliance()` in [compliance.ts](../../../src/cli/commands/compliance.ts) only checks:
1. Root files exist (CLAUDE.md, IDENTITY.md, etc.)
2. Stage directories exist (docs/00-foundation/, etc.)
3. Config validity
4. Tier mismatch

It does NOT check:
- File content length (placeholder vs real content)
- Presence of placeholder markers (`TODO:`, `TBD`, `<!-- Add`)
- Required artifacts per stage (requirements.md, ADRs, test plans)
- Cross-stage consistency (design ↔ code ↔ test)

## Fix

Add **L2 Content Checks** to compliance command:

1. Detect placeholder markers (`TODO: Add`, `TBD`, `<!-- Add stage-specific`)
2. Require minimum content length per stage artifact
3. Check for required artifacts per stage (not just README.md)
4. Add `--level L1|L2` flag (default L2)

## Dyad's Real State

| Stage | Files | Real Content? |
|-------|-------|---------------|
| 00-foundation | problem-statement.md (39L), business-case.md (51L) | ✅ Real |
| 01-planning | README.md (27L placeholder) | ❌ Placeholder |
| 02-design | README.md (27L placeholder) | ❌ Placeholder |
| 04-build | README.md (27L placeholder) | ❌ Placeholder |
| 05-test | README.md (27L placeholder) | ❌ Placeholder |
| 06-deploy | README.md (27L placeholder) | ❌ Placeholder |
| 08-collaborate | README.md (27L placeholder) | ❌ Placeholder |
| adrs/ (outside stage) | 3 real ADRs (115-131L each) | ⚠️ Misplaced |

## Impact

- CEO cannot trust compliance score for go/no-go decisions
- Pre-existing projects scaffolded by `endiorbot init` appear fully compliant when they're not
- Undermines SDLC Framework governance value

---

*SDLC Framework v6.1.1 - Stage 05: Test*
