---
spec_id: SPEC-04BUILD-SPRINT80
title: "Sprint 80: SDLC-Aligned Content Quality"
spec_version: "1.0.0"
status: active
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-05
last_updated: 2026-03-05
related_adrs: ["ADR-023"]
---

# Sprint 80: SDLC-Aligned Content Quality

**Date:** 2026-03-05
**Gate:** G-Sprint (approved)
**Authority:** ADR-023, CTO 9/10 APPROVED, CPO APPROVED
**Preceding sprint:** Sprint 79 (Smart Init — COMPLETE)

---

## Goal

Apply SDLC 6.1.1 Framework standards to the content generation pipeline so that `compliance fix` and `init` produce **Design-First quality documentation** — not just L2-compliant placeholders.

**Target score:** 6.8/10 (current) → 8.5/10+ (post-sprint)

---

## Acceptance Criteria

```gherkin
Feature: SDLC-Aligned Content Quality

  Scenario: compliance fix generates Section 8 compliant requirements
    GIVEN a project with missing 01-planning/requirements.md
    WHEN endiorbot compliance fix --stage 01-planning is run
    THEN the generated requirements.md starts with YAML frontmatter (spec_id, status, tier, stage)
      AND the acceptance criteria section uses Given/When/Then BDD format
      AND a ## References section links to docs/00-foundation/

  Scenario: compliance fix generates cross-stage linked design docs
    GIVEN a project with missing 02-design/architecture.md
    WHEN endiorbot compliance fix --stage 02-design is run
    THEN the generated architecture.md includes YAML frontmatter
      AND a ## References section cites docs/00-foundation/ and docs/01-planning/

  Scenario: init creates actionable stage READMEs
    GIVEN endiorbot init is run on a new STANDARD tier project
    WHEN the docs/ structure is created
    THEN docs/02-design/README.md contains "G2" gate requirements as checkboxes
      AND docs/01-planning/README.md links to ../00-foundation/
      AND docs/04-build/README.md shows G-Sprint checklist

  Scenario: compliance fix prompts include SDLC stage context
    GIVEN the fix engine processes a 01-planning task
    WHEN buildSystemPrompt() is called
    THEN the prompt includes "WHAT are we building?" (stage question)
      AND the prompt includes spec_id YAML template
      AND the prompt includes BDD Given/When/Then example
      AND the prompt includes upstream reference to docs/00-foundation/
```

---

## Tasks

### Step 1: `fix-types.ts` — Stage Metadata ✅ DONE
- [x] Add `STAGE_QUESTIONS` (11 entries)
- [x] Add `STAGE_UPSTREAM` (9 stage dependency chains)
- [x] Add `SECTION8_ARTIFACT_TYPES` (9 artifact types)
- [x] Add `BDD_REQUIRED_STAGES` (2 stages)
- [x] Complete `STAGE_GATE_MAP` (add 03-integrate, 07-operate, 08-collaborate, 09-govern)

### Step 2: `content-generator.ts` — buildSystemPrompt() 5 Blocks
- [ ] Block A: Stage question injection
- [ ] Block B: Section 8 YAML frontmatter template
- [ ] Block C: BDD format requirement
- [ ] Block D: Cross-stage upstream traceability
- [ ] Block E: Completeness rules (150-line guideline, no truncation)

### Step 3: `content-generator.ts` — Deterministic Templates
- [ ] `buildFoundationTemplate()` — YAML frontmatter + References
- [ ] `buildPlanningTemplate()` — YAML frontmatter + BDD format + References
- [ ] `buildDesignTemplate()` — YAML frontmatter + References (upstream: 00, 01)
- [ ] `buildTestTemplate()` — YAML frontmatter + References (upstream: 01, 04)
- [ ] `buildDeployTemplate()` — YAML frontmatter + References (upstream: 05)
- [ ] `buildCollaborateTemplate()` — YAML frontmatter + References (upstream: 04)

### Step 4: `structure-generator.ts` — generateStageReadme()
- [ ] Gate requirements checklist (from `STAGE_GATE_MAP`)
- [ ] Upstream dependency table (from `STAGE_UPSTREAM`)
- [ ] Artifact checklist with required/optional status (from `STAGE_CONTENT_REQUIREMENTS`)

### Step 5: Tests
- [ ] `content-generator.test.ts` — YAML/BDD/cross-stage assertions on `buildSystemPrompt()`
- [ ] `content-generator.test.ts` — YAML + BDD in deterministic template outputs
- [ ] `structure-generator.test.ts` — gate requirements + upstream links in stage READMEs

### Step 6: Build + Verify
- [ ] `pnpm build` — clean
- [ ] `pnpm test` — 5107+ passing
- [ ] `endiorbot init /tmp/test-sprint80 --tier STANDARD --force` → inspect READMEs
- [ ] `endiorbot compliance fix /open-pencil --stage 01-planning` → inspect requirements.md

---

## Files Modified

| File | Change Type | Key Impact |
|------|-------------|------------|
| `src/sdlc/compliance/fix-types.ts` | Edit | 4 new exports + STAGE_GATE_MAP complete |
| `src/sdlc/compliance/content-generator.ts` | Edit | 5 prompt blocks + 6 template enrichments |
| `src/sdlc/scaffold/structure-generator.ts` | Edit | generateStageReadme() enriched |
| `tests/sdlc/compliance/content-generator.test.ts` | Edit | YAML/BDD/cross-stage assertions |
| `tests/sdlc/scaffold/structure-generator.test.ts` | Edit | Gate + upstream assertions |
| `docs/02-design/01-ADRs/ADR-023-*.md` | Create | Design decision recorded |
| `docs/04-build/sprints/sprint-80-*.md` | Create | This sprint plan |

---

## Success Criteria

| Check | Target |
|-------|--------|
| Stage READMEs quality score | 1/10 → 7/10 |
| Generated docs with YAML frontmatter | 0% → 100% (for spec-type artifacts) |
| BDD format in requirements | 0% → 100% |
| Cross-stage traceability | Partial → Every doc has ## References |
| `STAGE_GATE_MAP` completeness | 6/11 → 11/11 |
| Build | ✅ clean |
| Tests | 5107+ passing |

---

## References

- [ADR-023: SDLC-Aligned Content Quality](../../../02-design/01-ADRs/ADR-023-SDLC-Aligned-Content-Quality.md)
- [Sprint 79: Smart Init](sprint-79-smart-init.md) — preceding sprint
- SDLC 6.1.1 Framework Skill — Section 8 Specification Standard
- PM Assessment: open-pencil docs audit 2026-03-05
