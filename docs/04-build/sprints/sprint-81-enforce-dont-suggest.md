---
spec_id: SPEC-04BUILD-SPRINT81
title: "Sprint 81: Enforce, Don't Suggest — Quality Gap Fixes"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-06
last_updated: 2026-03-06
related_adrs: ["ADR-023"]
---

# Sprint 81: Enforce, Don't Suggest — Quality Gap Fixes

**Date:** 2026-03-06
**Gate:** G-Sprint
**Authority:** ADR-023 SDLC-Aligned Content Quality
**Preceding sprint:** Sprint 80 (SDLC Content Quality — COMPLETE, CTO 9/10)
**CTO Review:** 9/10 APPROVED, C1-C4 binding
**CPO Review:** APPROVED, no blocking conditions

---

## Goal

Shift content generation from **prompt-based suggestions** to **deterministic post-processing guarantees**. Sprint 80 achieved average 70/100 on open-pencil docs; this sprint targets **85+/100** by fixing 5 root causes identified in the quality gap analysis.

---

## Root Causes (from Sprint 80 quality audit)

| RC | Issue | Score Impact | Root Cause |
|----|-------|-------------|------------|
| RC-1 | `architecture.md` unchanged (30 lines) | -60 pts | `02-design` has `requiredArtifacts: []` — file is optional, never regenerated |
| RC-2 | `## References` missing on 6/8 docs | -15 pts each | Prompt says "MUST" but AI compliance ~30%; refinement returns first draft on failure |
| RC-3 | BDD GIVEN/WHEN/THEN truncated | -15 pts | No post-generation append for truncated sections |
| RC-4 | YAML frontmatter missing on 3 docs | -15 pts | AI path doesn't enforce; only `validateContentQuality()` detects |
| RC-5 | `minContentLines` too low | blocks RC-1 | 30-line file passes check (threshold=15), no `insufficient_content` raised |

---

## Acceptance Criteria

```gherkin
Feature: Enforce Don't Suggest — Quality Gap Fixes

  Scenario: architecture.md flagged as required artifact
    GIVEN a project missing docs/02-design/architecture.md
    WHEN endiorbot compliance check is run
    THEN the issue list includes a missing_artifact issue for architecture.md

  Scenario: sparse content detected on existing files
    GIVEN docs/02-design/architecture.md exists with 30 lines
    AND GATE_ARTIFACT_REQUIREMENTS specifies minLines: 120 for architecture.md
    WHEN endiorbot compliance check is run
    THEN the issue list includes a sparse_content issue for architecture.md

  Scenario: enforceQualityGate prepends YAML frontmatter
    GIVEN AI-generated content starting with "# Architecture"
    AND the artifact spec has section8Yaml: true
    WHEN enforceQualityGate() is called
    THEN the output starts with YAML frontmatter (spec_id, status, tier, stage)
    AND the "# Architecture" heading follows after the frontmatter

  Scenario: enforceQualityGate is idempotent (CTO C2)
    GIVEN content that already has YAML frontmatter and ## References
    WHEN enforceQualityGate() is called
    THEN the output is identical to the input (no duplicate sections)

  Scenario: refinement returns higher-scoring version (CTO C3)
    GIVEN a first draft scoring 55/100
    AND a refined draft scoring 80/100
    WHEN the refinement loop completes
    THEN the 80/100 version is returned

  Scenario: STAGE_CONTENT_REQUIREMENTS stays in sync with GATE_ARTIFACT_REQUIREMENTS (CTO C1)
    GIVEN STAGE_CONTENT_REQUIREMENTS and GATE_ARTIFACT_REQUIREMENTS both exist
    WHEN the sync test runs
    THEN every stage's minContentLines >= max(gate artifact minLines) * 0.5
    AND every gate-required artifact is in requiredArtifacts for its stage
```

---

## Fixes (ordered by priority)

### Fix 3: Promote Key Artifacts to `requiredArtifacts`

**File:** `src/sdlc/compliance/content-checker.ts`
**Effort:** Trivial (config change)

| Stage | Before | After |
|-------|--------|-------|
| `02-design` | `requiredArtifacts: []` | `requiredArtifacts: ["architecture.md"]` |
| `05-test` | `requiredArtifacts: []` | `requiredArtifacts: ["test-plans/test-plan.md"]` |
| `06-deploy` | `requiredArtifacts: []` | `requiredArtifacts: ["deploy-guide.md"]` |

Move promoted artifacts from `optionalArtifacts` to `requiredArtifacts`.

---

### Fix 2: Raise `minContentLines` to Match Gate Requirements

**File:** `src/sdlc/compliance/content-checker.ts`
**Effort:** Trivial (config change) + C1 sync test

| Stage | Before | After | Gate Source |
|-------|--------|-------|------------|
| `01-planning` | 15 | 60 | G0.1 requirements.md minLines=120 |
| `02-design` | 15 | 80 | G2 architecture.md minLines=120 |
| `05-test` | 10 | 60 | G3 test-plan.md minLines=100 |
| `06-deploy` | 10 | 50 | G4 deploy-guide.md minLines=80 |

**C1 sync test:** Assert `STAGE_CONTENT_REQUIREMENTS` values stay aligned with `GATE_ARTIFACT_REQUIREMENTS`.

---

### Fix 4: `sparse_content` Issue Type

**Files:** `src/sdlc/compliance/content-checker.ts`, `src/sdlc/compliance/issue-mapper.ts`
**Effort:** Small

Add new issue type that fires when a file exists but is below its gate-required `minLines`:

```typescript
type: "placeholder" | "insufficient_content" | "missing_artifact" | "sparse_content"
```

Detection: per-file line count vs `GATE_ARTIFACT_REQUIREMENTS[stage].artifacts[file].minLines`.

---

### Fix 1: Post-Generation Enforcement Layer (`enforceQualityGate`)

**File:** `src/sdlc/compliance/content-generator.ts`
**Effort:** Medium

New function `enforceQualityGate()` runs deterministically after AI generation (or deterministic fallback):

| Check | Action | Deterministic |
|-------|--------|--------------|
| Missing YAML frontmatter | Prepend from template | Yes |
| `# Title` on line 1 before YAML | Insert YAML above title (CTO -1 edge case) | Yes |
| Missing `## References` | Append with upstream links | Yes |
| Missing `## Quality Gates` | Append gate section | Yes |
| BDD header without GIVEN | Append template BDD block | Yes |

**C2 idempotency:** `enforce(enforce(content)) === enforce(content)` — must check for existing sections before appending.

Flow:
```
AI generates → enforceQualityGate() patches → validateContentQuality() → return
```

---

### Fix 5: Refinement Score Comparison

**File:** `src/sdlc/compliance/content-generator.ts`
**Effort:** Small

Replace blind `refinedResult.success ? refinedResult : firstResult` with score comparison:

```typescript
if (!refinedResult.success || !refinedResult.content) return firstResult;
const refinedCheck = validateContentQuality(refinedResult.content, task, action, snapshot);
return refinedCheck.score >= qualityCheck.score ? refinedResult : firstResult;
```

**C3:** Handle `refinedResult.content` being empty/undefined.

---

## CTO Conditions

| # | Condition | Implementation |
|---|-----------|---------------|
| C1 | Single Source of Truth sync test | Test asserts STAGE_CONTENT_REQUIREMENTS aligned with GATE_ARTIFACT_REQUIREMENTS |
| C2 | `enforceQualityGate()` idempotent | Test: `enforce(enforce(content)) === enforce(content)` |
| C3 | Score-guarded refinement return | Validate refined content before comparing; handle empty |
| C4 | Regression gate | `pnpm build` clean + `pnpm test` 5155+ passing, no new `any` |

---

## Test Plan (~18 new tests)

| Fix | Tests | Description |
|-----|-------|-------------|
| Fix 3 | 2 | architecture.md in required; promoted artifacts removed from optional |
| Fix 2 | 2 | minContentLines raised; stage with 30 lines flagged |
| C1 sync | 2 | STAGE_CONTENT_REQUIREMENTS aligned with GATE_ARTIFACT_REQUIREMENTS |
| Fix 4 | 3 | sparse_content detected; above-threshold passes; per-file granularity |
| Fix 1 | 6 | YAML prepend; References append; BDD append; title-before-YAML edge case; idempotency (C2); already-compliant passthrough |
| Fix 5 | 3 | Higher-score returned; lower-score rejected; empty refined handled |
| **Total** | **18** | |

---

## Critical Files

| File | Action | Key Change |
|------|--------|-----------|
| `src/sdlc/compliance/content-checker.ts` | Edit | Fix 2 + Fix 3 + Fix 4 |
| `src/sdlc/compliance/issue-mapper.ts` | Edit | Fix 4 sparse_content mapping |
| `src/sdlc/compliance/content-generator.ts` | Edit | Fix 1 + Fix 5 |
| `tests/sdlc/compliance/content-checker.test.ts` | New | Fix 2 + Fix 3 + Fix 4 + C1 tests |
| `tests/sdlc/compliance/content-generator.test.ts` | Edit | Fix 1 + Fix 5 tests |

## Reuse (DO NOT recreate)

| Existing | Location | Use |
|----------|----------|-----|
| `GATE_ARTIFACT_REQUIREMENTS` | `fix-types.ts` | C1 sync test source of truth |
| `findArtifactSpec()` | `fix-types.ts` | Fix 4 per-file minLines lookup |
| `STAGE_UPSTREAM` | `fix-types.ts` | Fix 1 References section links |
| `SECTION8_ARTIFACT_TYPES` | `fix-types.ts` | Fix 1 YAML enforcement check |
| `validateContentQuality()` | `content-generator.ts` | Fix 5 score comparison |
| `countContentLines()` | `content-checker.ts` | Fix 4 per-file line count |
| `CapturingBridge` | `content-generator.test.ts` | Fix 5 refinement tests |

---

## Verification

```bash
# 1. Build clean
pnpm build

# 2. Run all tests (target: 5173+ passing, 0 failures)
pnpm test

# 3. Run Sprint 81 specific tests
pnpm vitest run tests/sdlc/compliance/content-checker.test.ts tests/sdlc/compliance/content-generator.test.ts

# 4. Re-run compliance fix on open-pencil and measure quality
node dist/cli/index.js compliance fix /path/to/open-pencil --stage 02-design
# Expected: architecture.md regenerated, 120+ lines, YAML + References + Quality Gates

# 5. Quality audit: average score should be 85+
node tests/manual/mt-80-content-quality.mjs
```

---

## Success Criteria

- [ ] `02-design` requiredArtifacts includes `architecture.md`
- [ ] `minContentLines` raised for 4 stages (01, 02, 05, 06)
- [ ] C1 sync test passes — STAGE_CONTENT_REQUIREMENTS aligned with GATE_ARTIFACT_REQUIREMENTS
- [ ] `sparse_content` issue type detects files below gate minLines
- [ ] `enforceQualityGate()` deterministically adds YAML/References/Gates/BDD
- [ ] C2 idempotency: `enforce(enforce(x)) === enforce(x)`
- [ ] C3 score-guarded refinement: returns higher-scoring version
- [ ] C4 regression: `pnpm build` clean + 5173+ tests passing
- [ ] All 18 new tests pass

---

## References

- [ADR-023 SDLC-Aligned Content Quality](../../02-design/01-ADRs/ADR-023-SDLC-Aligned-Content-Quality.md)
- [Sprint 80 — SDLC Content Quality](./sprint-80-sdlc-content-quality.md)
- [GATE_ARTIFACT_REQUIREMENTS](../../../src/sdlc/compliance/fix-types.ts)
- [STAGE_CONTENT_REQUIREMENTS](../../../src/sdlc/compliance/content-checker.ts)

## Quality Gates

This document supports **G-Sprint** for Sprint 81.

| G-Sprint Criterion | Status | Evidence |
|-------------------|--------|---------|
| Sprint goals defined | ✅ | 5 fixes with clear acceptance criteria |
| Stories/tasks listed | ✅ | Fix 1-5 with effort estimates |
| CTO conditions documented | ✅ | C1-C4 with implementation details |
| Test plan defined | ✅ | 18 tests across 5 fixes |
