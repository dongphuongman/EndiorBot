---
spec_id: ADR-023
title: "SDLC-Aligned Content Quality for compliance fix and init"
spec_version: "2.0.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-05
last_updated: 2026-03-06
related_adrs: ["ADR-018", "ADR-022"]
---

# ADR-023: SDLC-Aligned Content Quality

**Date:** 2026-03-05 (updated 2026-03-06)
**Status:** Accepted
**Deciders:** PM + CTO (9/10 APPROVED) + CPO (APPROVED)
**Authority:** Sprint 80, sdlc-framework skill, sdlc-audit skill

---

## Context

`endiorbot compliance fix` and `endiorbot init` generate SDLC documentation that passes L2 compliance checks (no placeholders, sufficient content lines) but fails the **Design-First quality standard** defined in SDLC Framework 6.1.1:

**PM assessment of open-pencil generated docs (2026-03-05):** 6.8/10 overall

| Issue | Impact |
|-------|--------|
| No Section 8 YAML frontmatter | Specs not machine-readable; no spec_id/status/owner |
| No BDD format in requirements | Acceptance criteria not verifiable; cannot drive tests |
| No cross-stage traceability | Cannot trace requirement → design → sprint → test |
| No stage guiding question in prompts | Agents don't anchor to WHY/WHAT/HOW framework |
| Stage READMEs are empty scaffolds | 1/10 quality; no gate requirements, no artifact checklists |
| `STAGE_GATE_MAP` incomplete (6/11 stages) | 5 stages (03, 07, 08, 09, 10) have no gate references in generated docs |

**Root cause:** The AI system prompt (`buildSystemPrompt()`) and deterministic fallback templates in `content-generator.ts` were written before the SDLC 6.1.1 skills (`sdlc-audit`, `sdlc-framework`) were applied to the codebase.

### Supplemental Context (2026-03-06)

Live testing on open-pencil after Steps 1-5 showed the quality gap remains:
- System doesn't know **exactly what artifacts each gate requires per tier**
- User prompts are generic ("Generate the file") instead of gate-specific
- Single-shot generation with no quality validation feedback loop
- Code file headers have no SDLC references — reverse-engineered design docs are untraceable

Three gold-standard projects demonstrate expected quality:

| Project | Tier | Key Patterns |
|---------|------|--------------|
| SDLC Orchestrator | PROFESSIONAL | 14 docs/30K lines (00), G4 PASSED |
| Bflow-Platform | ENTERPRISE | 415 design docs, 27 microservice APIs |
| NQH-Bot-Platform | STANDARD+ | Module-granular requirements, 750+ test cases |

CLI/OTT gate commands also have issues: OTT `/gate` references non-existent `gate check`, `gate:G3` checker is a stub, `commandRunner` not injected.

---

## Decision

### Phase 1 (Steps 1-5): Additive Prompt Engineering ✅ DONE

Apply SDLC 6.1.1 Framework standards directly into the content generation pipeline:

1. **Stage Metadata Constants** (`fix-types.ts`) — `STAGE_QUESTIONS`, `STAGE_UPSTREAM`, `SECTION8_ARTIFACT_TYPES`, `BDD_REQUIRED_STAGES`
2. **System Prompt Enrichment** (`content-generator.ts`) — 5 new blocks in `buildSystemPrompt()`
3. **Deterministic Template Enrichment** — YAML frontmatter + BDD + References in all templates
4. **Stage README Enhancement** (`structure-generator.ts`) — gate checklist + upstream + artifacts

### Phase 2 (Steps 6-14): Gate-Driven Generation + Quality Refinement

Supplement Phase 1 with **gate-specific artifact generation** and **quality validation**:

5. **Gate-Artifact-Tier Matrix** (`fix-types.ts`) — `GATE_ARTIFACT_REQUIREMENTS` mapping each gate → required artifacts per tier, sourced from 4 SDLC Framework authority docs (Tier-Stage-Requirements, Project Structure, Quality-Security-Gates, Exit Criteria)
6. **File Header Compliance** (`fix-types.ts`) — document header template, code file header template, Section 8 YAML template. Deterministic generation (no AI). Legacy project code files get headers referencing design docs.
7. **Gate-Driven User Prompts** (`content-generator.ts`) — rewrite `buildUserPrompt()` to include gate name, pass criteria, ALL code modules, all dependencies, min line target
8. **Quality Validation + Refinement** (`content-generator.ts`) — `validateContentQuality()` with 6 checks, max 2 invocations (retry once if quality fails)
9. **Smart Cross-Stage Context** (`content-generator.ts`) — 500→2000 chars, preserve YAML/headings
10. **Upstream Doc Loading** — scan existing docs from disk for context
11. **CLI/OTT Gate Fixes** — fix OTT `gate check` → `gate recommend`, implement `gate:` checker via gate-store, add `--run-checks` flag for commandRunner injection
12. **Gate-Checklist Alignment** — G-Sprint path to `docs/04-build/sprints/`

### Options Considered (Phase 2)

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: Gate-artifact matrix + quality loop (chosen)** | Precise per-gate requirements, retry on failure, backward-compatible | ~200 lines data, adds 1 retry invocation | **Selected** |
| B: Multi-pass generation with AI critic | Higher quality potential | 3+ invocations per artifact, high latency/cost | Rejected — diminishing returns |
| C: Pre-built artifact templates per gate | Zero AI needed | 30+ templates to maintain, fragile | Rejected — YAGNI |

### getStageQuestion() Note (CTO N1)

`getStageQuestion()` is imported from `tier-detector.ts` (line 32 of structure-generator.ts) — not defined locally. Resolution: **Option A** — add new `STAGE_QUESTIONS` map to `fix-types.ts` as the canonical SDLC 6.1.1 source.

---

## Consequences

### Positive
- All generated docs include Section 8 YAML frontmatter → machine-readable, trackable
- Requirements docs have BDD acceptance criteria → directly drive test cases
- Every generated doc links to upstream stages → full SDLC traceability chain
- Stage READMEs from `init` become actionable checklists
- **Gate-driven prompts** include exact pass criteria, all modules, all dependencies
- **Quality validation** catches 6 issue types before output → fewer manual corrections
- **Refinement loop** retries once, improving success rate without high cost
- **Code file headers** reference design docs → legacy project reverse-engineering is traceable
- **OTT/CLI gate fixes** make gate workflow functional end-to-end

### Constraints
- **CA1**: 150-line minimum = guideline in prompt, NOT hard validation in `validateWrittenFile()`
- **CA2**: `SECTION8_ARTIFACT_TYPES` maintained alongside `GATE_ARTIFACT_REQUIREMENTS`
- **CA3**: Prompt additions (~300 tokens Phase 1, ~500 tokens Phase 2) within budget
- **C1 (CTO)**: `commandRunner` returns `{ success: boolean, output: string }` (not `{ status: string }`)
- **C2 (CTO)**: `checkGatePassed()` uses `basename(this.projectRoot)` for projectId
- **C3 (CTO)**: `coverage:80` checker remains stub — out of scope (needs vitest coverage parser)
- **C4 (CTO)**: `G-Sprint-Close` removed from `STAGE_GATE_MAP` (collapsed to `G-Sprint`)

### Neutral
- Deterministic fallback (no bridge) also benefits — same quality standards even without AI

---

## References

- [ADR-018: AI-Generated Compliance Content](ADR-018-AI-Generated-Compliance-Content.md)
- [ADR-022: Smart Init Codebase Analysis](ADR-022-Smart-Init-Codebase-Analysis.md)
- SDLC 6.1.1 Framework — Tier-Stage-Requirements, Project-Structure-Standard, Quality-Security-Gates, Stage-Exit-Criteria, Naming-Standards, Compliance-Enforcement-Guide, Specification-Standard
- Gold-standard references: SDLC Orchestrator (PRO), Bflow-Platform (ENT), NQH-Bot-Platform (STD+)
- PM Assessment: open-pencil docs audit 2026-03-05 (score 6.8/10)
