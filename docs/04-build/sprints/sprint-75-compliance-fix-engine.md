# Sprint 75: Compliance Fix Engine

**Date:** 2026-03-03
**Status:** COMPLETE (retroactive documentation)
**Duration:** 24h
**Prerequisites:** Sprint 74 ✅ Complete (Team Agent System, 4,785 tests)

---

## 1. Sprint Goal

Implement an **automated compliance fix engine** that detects SDLC compliance gaps and generates real content to replace placeholder docs. All writes route through the existing `invokePatch()` pipeline (PatchValidator + CEO confirmation gate).

---

## 2. Context

- **Problem:** `endiorbot compliance check` detects gaps but cannot fix them. Projects scaffolded with `endiorbot init` have placeholder docs → low L2 Content scores (e.g., dyad: 14%, 17 issues).
- **Solution:** Compliance Fix Engine — detect gaps → map to agent fix tasks → generate content via `invokePatch()` → validate → write.
- **Design Docs:** [ADR-018](../../02-design/01-ADRs/ADR-018-AI-Generated-Compliance-Content.md) (Accepted)
- **CTO Review:** 7/10 APPROVED WITH P0 FIXES (4 P0 issues fixed, 4 P1 advisory addressed)
- **CPO Review:** APPROVED

### CTO Review Summary

**v2 → v3 evolution:** CTO rejected v2 approach (`invokeRead() + fs.writeFile()`) for bypassing PatchValidator security. v3 routes all writes through `invokePatch()` pipeline, retaining CEO confirmation gate.

---

## 3. Scope

### In Scope

| # | Pri | Task | Hours | Deliverable |
|---|-----|------|-------|-------------|
| 0 | P0 | ADR-018 document | 1.5h | Architecture decisions committed before code |
| 1 | P0 | Fix types & constants (`fix-types.ts`) | 2h | Agent mapping, stage processing order, gate map, skill map |
| 2 | P0 | Fix engine (`fix-engine.ts`) | 3h | `ComplianceFixEngine` class, full pipeline orchestration |
| 3 | P0 | Content generator (`content-generator.ts`) | 4h | `generateContent()`, SOUL + skill prompt building, deterministic fallback |
| 4 | P0 | Issue mapper (`issue-mapper.ts`) | 2h | `mapIssuesToFixTasks()`, tier-aware grouping, prompt context builder |
| 5 | P0 | Project context collector (`project-context-collector.ts`) | 2.5h | `collectProjectContext()`, tech stack detection, module scanning |
| 6 | P1 | Post-write validation gate | 1.5h | Placeholder detection, security scrub, 50KB size cap, rollback |
| 7 | P1 | PatchManager audit trail integration | 1h | SHA256 hashing, `recordChange()`, patch lifecycle |
| 8 | P0 | CTO P0 fixes (4 issues) | 1.5h | Path traversal, normalizeStageKey, fallback validation, scrub cleanup |
| 9 | — | Tests (41 cases, 9 suites) | 4h | Unit tests for all modules |
| 10 | — | Build + full test suite | 1h | `pnpm build` + `pnpm test` pass |

**Total: 24h, 41 new tests (9 suites)**

### Out of Scope

- Team-based compliance fix (use individual agents, not @planning/@qa teams)
- OTT channel integration (deferred to Sprint 76)
- Real-time progress reporting during fix
- Parallel stage processing (sequential for cross-stage context consistency)
- Custom compliance templates per project

---

## 4. Acceptance Criteria

### AC-1: End-to-End Fix Pipeline
```
Given a project with placeholder compliance docs (L2 score 14%)
When CEO runs `endiorbot compliance fix`
Then engine detects all compliance gaps
And generates real content for each missing/placeholder artifact
And L2 score improves (e.g., 14% → higher)
```

### AC-2: invokePatch() Security Pipeline
```
Given a compliance fix is in progress
When content is generated for a stage
Then the write goes through invokePatch() → PatchValidator → CEO confirm → applyPatch()
And NOT through direct fs.writeFile()
```

### AC-3: Dry-Run Mode
```
Given CEO runs `endiorbot compliance fix --dry-run`
When engine processes all stages
Then preview content is shown but no files are written
And before/after scores are reported (same value since no changes)
```

### AC-4: Tier-Aware Agent Assignment
```
Given a STANDARD tier project
When stage 05-test needs content
Then @reviewer is assigned (not @tester, which is PROFESSIONAL+)
And SOUL template matches the assigned agent
```

### AC-5: Deterministic Fallback
```
Given Claude Code bridge is unavailable
When content generation is attempted
Then deterministic fallback templates produce valid content
And content passes post-write validation (no placeholders, no scrub violations)
```

### AC-6: Cross-Stage Context
```
Given stages are processed sequentially (00 → 01 → 02 → ...)
When stage 02-design is generated
Then it receives truncated output from 00-foundation and 01-planning as context
And generated content references earlier stages appropriately
```

### AC-7: Path Traversal Protection (P0-1)
```
Given a malicious relativePath like "../../../etc/passwd"
When writeDirectly() is called
Then the write is blocked with "Path traversal blocked" error
And no file is written outside project root
```

---

## 5. CTO P0 Fixes (Post-Implementation)

| # | Issue | Fix | File |
|---|-------|-----|------|
| P0-1 | Path traversal in `writeDirectly()` | `resolve()` + `startsWith(projectRoot + sep)` guard | `fix-engine.ts:272-278` |
| P0-2 | `normalizeStageKey()` defined but not called | Added `normalizeStageKey(issue.stage)` in `mapIssuesToFixTasks()` | `issue-mapper.ts:55` |
| P0-3 | Deterministic fallback skips post-write validation | Added `validateWrittenFile()` + `unlinkSync()` rollback after `writeDirectly()` | `fix-engine.ts:227-234` |
| P0-4 | Scrub violations detected but file not cleaned | Write scrubbed content back or `unlinkSync()` on violation | `content-generator.ts` |

## 6. CTO P1 Advisory (Addressed)

| # | Advisory | Action |
|---|----------|--------|
| P1-1 | `ContentGeneratorBridge` may leak abstraction | Interface kept minimal: `isAvailable()`, `invokePatch()` |
| P1-2 | `AGENT_SKILL_MAP` only has 1 entry | Extensible by design; more skills added as needed |
| P1-3 | `MAX_GENERATED_FILE_SIZE` 50KB may be low | Configurable via constant; 50KB covers all compliance docs |
| P1-4 | Cross-stage context truncation (500 chars) | Sufficient for reference; full output available via PatchManager |

---

## 7. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Write pipeline | `invokePatch()` (not `fs.writeFile()`) | CTO mandate: retain PatchValidator + CEO confirmation gate |
| Stage processing | Sequential, not parallel | Cross-stage context requires ordered execution |
| No handoff chains | Independent invocations per stage | Doc generation ≠ multi-agent conversation |
| Agent assignment | Tier-aware with fallback | PROFESSIONAL @tester → STANDARD @reviewer → LITE @fullstack |
| Skill injection | Only @tester (e2e-api-testing) | Other agents don't need specialized skill for doc generation |
| Post-write validation | 3 layers (quality + security + size) | Defense-in-depth for AI-generated content |
| Deterministic fallback | Template-based when bridge unavailable | Ensures fix works even without Claude Code |

---

## 8. Architecture

### Pipeline Flow
```
CEO → `endiorbot compliance fix [--dry-run] [--yes] [--stage <stage>]`
  ↓
collectProjectContext() → ProjectSnapshot (tech stack, modules, tests, docs)
  ↓
checkL2Compliance() → before score + issues[]
  ↓
mapIssuesToFixTasks() → AgentFixTask[] (sorted by STAGE_PROCESSING_ORDER)
  ↓
For each task (sequential):
  generateContent() → invokePatch() → PatchValidator → CEO confirm → applyPatch()
  validateWrittenFile() → quality gate + security scrub + size cap
  previousStageOutputs.set(key, content)  ← cross-stage context
  ↓
checkL2Compliance() → after score
  ↓
Report: before% → after%, issues fixed/failed, duration
```

### Stage Agent Mapping (Tier-Aware)

| Stage | PROFESSIONAL | STANDARD | LITE |
|-------|-------------|----------|------|
| 00-foundation | pm | pm | pm |
| 01-planning | pm | pm | pm |
| 02-design | architect | architect | architect |
| 03-integrate | architect | architect | architect |
| 04-build | pjm | pjm | pjm |
| 05-test | tester | reviewer | fullstack |
| 06-deploy | devops | devops | devops |
| 07-operate | devops | devops | devops |
| 08-collaborate | pm | pm | pm |
| 09-govern | pm | pm | pm |
| 10-archive | pm | pm | pm |

---

## 9. Files

### New Files (6 source + 1 test + 1 ADR)

| File | Lines | Purpose |
|------|-------|---------|
| `docs/02-design/01-ADRs/ADR-018-AI-Generated-Compliance-Content.md` | 97 | Architecture decisions |
| `src/sdlc/compliance/fix-types.ts` | 376 | Types, constants, agent/gate/skill maps |
| `src/sdlc/compliance/fix-engine.ts` | 315 | `ComplianceFixEngine` class, pipeline orchestrator |
| `src/sdlc/compliance/content-generator.ts` | 576 | Content generation, SOUL prompts, fallback templates |
| `src/sdlc/compliance/issue-mapper.ts` | 239 | Issue → task mapping, prompt context builder |
| `src/sdlc/compliance/project-context-collector.ts` | 368 | Project snapshot collection |
| `tests/sdlc/compliance-fix.test.ts` | 821 | 41 tests, 9 suites |

**Total: 2,695 LOC (1,874 source + 821 test)**

### Modified Files

| File | Change |
|------|--------|
| `src/sdlc/compliance/index.ts` | Barrel exports for fix-engine module (v2.0.0) |

---

## 10. Test Coverage

| Suite | Tests | Coverage |
|-------|-------|----------|
| Fix Types & Constants | 8 | Agent mapping, skill mapping, gate mapping, size cap |
| normalizeStageKey | 3 | UPPERCASE→lowercase, mixed case, passthrough |
| getAgentForStage | 5 | Tier-aware fallback, default to PM |
| Stage Key Standardization | 4 | 10-ARCHIVE support, contract alignment |
| Project Context Collector | 7 | Tech stack detection, module scanning, test classification |
| Issue Mapper | 6 | Agent assignment, sorting, tier whitelist, gate context |
| Content Generator | 7 | Dry-run, deterministic fallback, gate/module inclusion |
| Fix Engine | 5 | No-op, placeholder+dry-run, fallback+write, score improvement |
| **Total** | **41** | **9 suites** |

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI content quality varies | Medium | Post-write validation (3 layers), deterministic fallback |
| Path traversal in generated paths | High | P0-1 fixed: `resolve()` + `startsWith()` containment |
| Scrub violations in AI content | High | P0-4 fixed: write scrubbed content or delete file |
| Bridge unavailable in CI/test | Low | Deterministic fallback templates, mock in tests |
| Stage key case mismatch | Medium | P0-2 fixed: `normalizeStageKey()` wired in issue-mapper |
| Large file generation | Low | W4: 50KB size cap enforced in validation |

---

## 12. Definition of Done

- [x] ADR-018 committed before code
- [x] `pnpm build` — zero errors
- [x] All 4,785 existing tests pass
- [x] 41 new tests pass (9 suites)
- [x] CTO P0 fixes (4/4) applied and tested
- [x] CTO P1 advisory (4/4) addressed
- [x] Post-write validation: placeholder + scrub + size cap
- [x] Path traversal protection in `writeDirectly()`
- [x] Deterministic fallback generates valid content
- [x] Cross-stage context forwarding works
- [x] Tier-aware agent assignment verified

---

## 13. Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| ADR-018 | ✅ Accepted | `docs/02-design/01-ADRs/ADR-018-AI-Generated-Compliance-Content.md` |
| L2 Content Checker (Sprint 73) | ✅ Reused | `src/sdlc/compliance/content-checker.ts` |
| PatchManager (Sprint 68) | ✅ Reused | `src/sdlc/patches/patch-manager.ts` |
| ClaudeCodeBridge | ✅ Reused | `src/agents/invoke/claude-code-bridge.ts` |
| TIER_STAGES (Sprint 61) | ✅ Reused | `src/sdlc/scaffold/types.ts` |
| Output Scrubber | ✅ Reused | `src/security/output-scrubber.ts` |
| PatchValidator | ✅ Reused | `src/agents/invoke/patch-validator.ts` |

---

**Note:** This sprint plan was created retroactively after implementation. Sprint 75 was implemented before the plan was documented in the SDLC system — a process violation identified and corrected to maintain SDLC 6.1.1 compliance.
