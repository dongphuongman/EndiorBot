---
spec_id: SPEC-04BUILD-SPRINT80
title: "Sprint 80: SDLC-Aligned Content Quality"
spec_version: "2.0.0"
status: completed
tier: STANDARD
stage: "04-build"
category: functional
owner: "@pjm"
created: 2026-03-05
last_updated: 2026-03-06
related_adrs: ["ADR-023"]
---

# Sprint 80: SDLC-Aligned Content Quality

**Date:** 2026-03-05 (updated 2026-03-06)
**Gate:** G-Sprint (approved)
**Authority:** ADR-023, CTO 9/10 APPROVED (supplement), CPO APPROVED
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

  Scenario: gate-driven prompts include gate pass criteria
    GIVEN the fix engine processes a 02-design/architecture.md task
    WHEN buildUserPrompt() is called
    THEN the prompt includes "Gate G2 — Design Approval"
      AND the prompt lists ALL code modules from project snapshot
      AND the prompt includes all dependencies from tech stack
      AND the prompt specifies minimum 120 lines

  Scenario: quality validation catches incomplete content
    GIVEN a generated architecture.md with only 50 lines and no YAML frontmatter
    WHEN validateContentQuality() is called
    THEN it reports "Missing Section 8 YAML frontmatter"
      AND it reports "Only 50 lines — gate requires minimum 120 lines"
      AND it triggers a refinement retry with feedback

  Scenario: OTT /gate command references correct CLI command
    GIVEN a user sends /gate G2 in Telegram
    WHEN handleGateCommand() processes the message
    THEN the response includes "gate recommend" (not "gate check")

  Scenario: gate:G3 checker queries persisted confirmations
    GIVEN G3 has been confirmed via endiorbot gate confirm G3 --confirm
    WHEN gate recommend G4 evaluates the "G3 gate passed" checker
    THEN the checker returns "pass" (not "pending")
```

---

## Tasks

### Phase 1: Prompt & Template Enrichment (Steps 1-5) ✅ DONE

#### Step 1: `fix-types.ts` — Stage Metadata ✅ DONE
- [x] Add `STAGE_QUESTIONS` (11 entries)
- [x] Add `STAGE_UPSTREAM` (9 stage dependency chains)
- [x] Add `SECTION8_ARTIFACT_TYPES` (9 artifact types)
- [x] Add `BDD_REQUIRED_STAGES` (2 stages)
- [x] Complete `STAGE_GATE_MAP` (add 03-integrate, 07-operate, 08-collaborate, 09-govern)

#### Step 2: `content-generator.ts` — buildSystemPrompt() 5 Blocks ✅ DONE
- [x] Block A: Stage question injection
- [x] Block B: Section 8 YAML frontmatter template
- [x] Block C: BDD format requirement
- [x] Block D: Cross-stage upstream traceability
- [x] Block E: Completeness rules (150-line guideline, no truncation)

#### Step 3: `content-generator.ts` — Deterministic Templates ✅ DONE
- [x] YAML frontmatter + BDD + References in all stage fallback templates

#### Step 4: `structure-generator.ts` — generateStageReadme() ✅ DONE
- [x] Gate requirements checklist + upstream + artifact checklist

#### Step 5: Tests ✅ DONE
- [x] 21 new tests (11 system prompt + 10 deterministic template)

### Phase 2: Gate-Driven Generation + Quality Refinement (Steps 6-14) ✅ DONE

**Date:** 2026-03-06
**CTO Review:** 9/10 APPROVED with conditions C1-C4 (all addressed)
**CPO:** ACCEPTED as complete

#### Step 6: Gate-Artifact-Tier Matrix ✅ DONE
- [x] Add `GATE_ARTIFACT_REQUIREMENTS` constant to `fix-types.ts`
- [x] Add `GateArtifactSpec`, `GateRequirement` interfaces
- [x] Add `TIER_COVERAGE_TARGETS` by tier
- [x] Add `findGateRequirement()`, `findArtifactSpec()` helpers
- [x] Gates covered: G0, G0.1, G1, G2, G-Sprint, G3, G4

#### Step 6b: File Header Compliance ✅ DONE
- [x] Add `DOCUMENT_HEADER_TEMPLATE`, `CODE_HEADER_TEMPLATE` patterns
- [x] Add `HeaderCheckResult` type
- [x] Add `DOC_HEADER_REQUIRED_FIELDS`, `CODE_HEADER_REQUIRED_FIELDS` per tier
- [x] Document headers: deterministic fix (no AI needed)
- [x] Code headers: deterministic fix for PRO+/ENT

#### Step 7: Rewrite `buildUserPrompt()` Gate-Driven ✅ DONE
- [x] Replace generic prompt with gate-specific instructions
- [x] Include gate name + pass criteria in prompt
- [x] Include ALL code modules from snapshot (not top 5)
- [x] Include dependency list from tech stack
- [x] Include min line target from `GateArtifactSpec`

#### Step 8: Quality Validation + Refinement Loop ✅ DONE
- [x] Add `validateContentQuality()` — 6 checks (YAML, BDD, refs, minLines, specificity, placeholders)
- [x] Add `ContentQualityResult` type with `{ passed, score, feedback }`
- [x] Add refinement loop: max 2 invocations if first draft fails quality
- [x] (CTO CA3) Add logger.info before refinement retry

#### Step 9: Cross-Stage Context Improvement ✅ DONE
- [x] Replace `content.slice(0, 500)` with `extractKeyContent()` (2000 chars max)
- [x] Preserve YAML frontmatter + headings + first lines

#### Step 10: Upstream Doc Loading from Disk ✅ DONE
- [x] Scan `docs/{upstreamStage}/` for existing .md files
- [x] Inject into `previousStageOutputs` before prompt building

#### Step 11: Content Generator Tests (~16 new) ✅ DONE
- [x] Gate-driven prompt tests (7): G0.1, G2, G3 context; all modules; dependencies; coverage targets; fallback
- [x] Quality validation tests (5): missing YAML, missing BDD, < minLines, passes, feedback
- [x] extractKeyContent tests (3): YAML preservation, heading preservation, maxChars
- [x] Refinement loop test (1): single invocation when file not written

#### Step 12: CLI/OTT Gate Fixes ✅ DONE
- [x] Fix OTT `/gate` command: `gate check` → `gate recommend`
- [x] Implement `gate:` checker in gate-engine.ts (query gate-store, CTO C2: `basename(this.projectRoot)`)
- [x] Add `--run-checks` flag to CLI gate commands, inject `commandRunner` (CTO C1: `{ success, output }` return type)
- [x] (CTO C3) Add `// TODO Sprint N: parse vitest coverage report` in coverage stub

#### Step 13: Align Gate-Checklist Paths ✅ DONE
- [x] G-Sprint checker: `glob:docs/01-planning/sprint-*-plan.md` → `glob:docs/04-build/sprints/sprint-*-plan.md`
- [x] (CTO C4) Remove `G-Sprint-Close` from `STAGE_GATE_MAP` (collapse to `G-Sprint`)

#### Step 14: Gate Engine + OTT Tests (11 new) ✅ DONE
- [x] `gate:G3` checker returns `pass` when confirmed / `pending` when not
- [x] `gate:` checker uses `basename(projectRoot)` for projectId (CTO C2)
- [x] `commandRunner` injection makes `command:` checks functional (pass + fail)
- [x] Without `commandRunner`, `command:` checks return `pending`
- [x] `coverage:` checker returns `pending` (stub, CTO C3)
- [x] OTT gate info references `gate recommend` (not `gate check`)
- [x] OTT gate help does not reference `gate check`
- [x] G-Sprint path targets `docs/04-build/sprints/`, not `01-planning/`

#### Step 15: Build + Verify ✅ DONE
- [x] `pnpm build` — clean
- [x] `pnpm test` — 5155 passing (5144 + 11 new), 0 failures
- [ ] Manual: `compliance fix` prompts say "Gate G0.1", "Gate G2", "Gate G3" (CPO recommends)
- [ ] Manual: refinement loop fires when quality check fails (CPO recommends)
- [ ] Manual: `gate status --run-checks` runs command checks (CPO recommends)
- [ ] Manual: `gate:G3` returns pass after `gate confirm G3 --confirm` (CPO recommends)

---

## Files Modified

### Phase 1 (Steps 1-5 — DONE)

| File | Change Type | Key Impact |
|------|-------------|------------|
| `src/sdlc/compliance/fix-types.ts` | Edit | 4 new exports + STAGE_GATE_MAP complete |
| `src/sdlc/compliance/content-generator.ts` | Edit | 5 prompt blocks + deterministic template enrichments |
| `src/sdlc/scaffold/structure-generator.ts` | Edit | generateStageReadme() enriched |
| `tests/sdlc/compliance/content-generator.test.ts` | Edit | YAML/BDD/cross-stage assertions |
| `tests/sdlc/scaffold/structure-generator.test.ts` | Edit | Gate + upstream assertions |

### Phase 2 (Steps 6-14 — DONE)

| File | Change Type | Key Impact |
|------|-------------|------------|
| `src/sdlc/compliance/fix-types.ts` | Edit | `GATE_ARTIFACT_REQUIREMENTS` + header templates |
| `src/sdlc/compliance/content-generator.ts` | Edit | Gate-driven `buildUserPrompt()`, `validateContentQuality()`, refinement loop, `extractKeyContent()`, upstream doc loading |
| `src/channels/telegram/telegram-commands.ts` | Edit | Fix `gate check` → `gate recommend` |
| `src/sdlc/gates/gate-engine.ts` | Edit | Implement `gate:` checker + optional `commandRunner` |
| `src/sdlc/gates/gate-checklist.ts` | Edit | Align G-Sprint path to `docs/04-build/sprints/` |
| `src/cli/commands/gate.ts` | Edit | Add `--run-checks` flag + commandRunner injection |
| `tests/sdlc/compliance/content-generator.test.ts` | Edit | ~15 new tests |
| `tests/sdlc/gates/gate-engine.test.ts` | Create | ~5 new tests |

---

## CTO Conditions (Phase 2)

| ID | Severity | Action |
|----|----------|--------|
| C1 | P1 | Fix `commandRunner` return type: `{ success: boolean, output: string }` |
| C2 | P1 | `checkGatePassed()`: use `basename(this.projectRoot)` for projectId |
| C3 | P2 | `coverage:80` explicit out-of-scope, add TODO comment |
| C4 | P2 | Remove `G-Sprint-Close` from `STAGE_GATE_MAP` |

---

## Success Criteria

| Check | Target |
|-------|--------|
| Stage READMEs quality score | 1/10 → 7/10 |
| Generated docs with YAML frontmatter | 0% → 100% (spec-type artifacts) |
| BDD format in requirements | 0% → 100% |
| Cross-stage traceability | Every doc has ## References |
| `STAGE_GATE_MAP` completeness | 11/11 |
| Gate-driven prompts | Every artifact prompt references its gate |
| Quality validation | `validateContentQuality()` catches 6 issue types |
| Refinement loop | Max 2 invocations, retries on quality failure |
| OTT `/gate` fix | References `gate recommend` (not `gate check`) |
| `gate:G3` checker | Queries gate-store (not stub) |
| Build | ✅ clean |
| Tests | 5128+ → 5155 passing (+27 new) |

---

## References

- [ADR-023: SDLC-Aligned Content Quality](../../../02-design/01-ADRs/ADR-023-SDLC-Aligned-Content-Quality.md)
- [Sprint 79: Smart Init](sprint-79-smart-init.md) — preceding sprint
- SDLC 6.1.1 Framework — Tier-Stage-Requirements, Quality-Security-Gates, Exit-Criteria, Naming-Standards
- Gold-standard references: SDLC Orchestrator (PRO), Bflow-Platform (ENT), NQH-Bot-Platform (STD+)
- PM Assessment: open-pencil docs audit 2026-03-05
