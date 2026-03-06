---
spec_id: ADR-023
title: "SDLC-Aligned Content Quality for compliance fix and init"
spec_version: "1.0.0"
status: accepted
tier: STANDARD
stage: "02-design"
category: technical
owner: "@architect"
created: 2026-03-05
last_updated: 2026-03-05
related_adrs: ["ADR-018", "ADR-022"]
---

# ADR-023: SDLC-Aligned Content Quality

**Date:** 2026-03-05
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

---

## Decision

Apply SDLC 6.1.1 Framework standards directly into the content generation pipeline through **additive prompt engineering and template enrichment**:

1. **Stage Metadata Constants** (`fix-types.ts`) — 4 new exports: `STAGE_QUESTIONS`, `STAGE_UPSTREAM`, `SECTION8_ARTIFACT_TYPES`, `BDD_REQUIRED_STAGES`
2. **System Prompt Enrichment** (`content-generator.ts`) — 5 new blocks appended to `buildSystemPrompt()`: stage question, Section 8 YAML, BDD format, cross-stage traceability, completeness rules
3. **Deterministic Template Enrichment** (`content-generator.ts`) — YAML frontmatter + BDD + upstream References in all stage fallback templates
4. **Stage README Enhancement** (`structure-generator.ts`) — gate requirements checklist + upstream dependency table + artifact checklist in `generateStageReadme()`

### Options Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: Additive prompt blocks (chosen)** | Zero contract changes, backward-compatible, zero test rework | Adds ~300 tokens per prompt | **Selected** |
| B: Separate prompt templates per artifact type | Maximum control | 20+ templates to maintain | Rejected — YAGNI |
| C: External prompt config file | Runtime flexibility | New config format, more infrastructure | Rejected — over-engineering |

### getStageQuestion() Note (CTO N1)

`getStageQuestion()` is imported from `tier-detector.ts` (line 32 of structure-generator.ts) — not defined locally as the plan originally assumed. Resolution: **Option A** — add new `STAGE_QUESTIONS` map to `fix-types.ts` as the canonical SDLC 6.1.1 source. `tier-detector.ts::getStageQuestion()` continues to work unchanged (no duplication of logic in structure-generator.ts — it uses the new `STAGE_QUESTIONS` map from fix-types.ts for the new gate/upstream/checklist sections only).

---

## Consequences

### Positive
- All Claude Code-generated docs will include Section 8 YAML frontmatter → machine-readable, trackable
- Requirements docs will have BDD acceptance criteria → directly drive test cases
- Every generated doc will link to upstream stages → full SDLC traceability chain
- Stage READMEs from `init` become actionable checklists (not placeholders)
- `STAGE_GATE_MAP` complete for all 11 stages

### Constraints (CTO/CPO Advisories)
- **CA1**: 150-line minimum = guideline in prompt, NOT a hard validation in `validateWrittenFile()` (avoids false-positive failures on short but complete docs)
- **CA2**: `SECTION8_ARTIFACT_TYPES` set must be maintained alongside `STAGE_CONTENT_REQUIREMENTS` — add new artifact types to both when extending compliance rules
- **CA3**: Prompt additions (~300 tokens) within budget; monitor at scale

### Neutral
- Deterministic fallback (no bridge) also benefits — same quality standards even without AI

---

## References

- [ADR-018: AI-Generated Compliance Content](ADR-018-AI-Generated-Compliance-Content.md)
- [ADR-022: Smart Init Codebase Analysis](ADR-022-Smart-Init-Codebase-Analysis.md)
- SDLC 6.1.1 Framework Skill — 7-Pillar Architecture, Section 8 Specification Standard
- SDLC Audit Skill — Section 8 YAML frontmatter validation, BDD format requirements
- PM Assessment: open-pencil docs audit 2026-03-05 (score 6.8/10)
