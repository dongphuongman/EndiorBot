# Sprint 61: Init + Compliance

| Metadata | Value |
|----------|-------|
| **Sprint** | 61 |
| **Duration** | 26 hours (3 phases) |
| **Status** | Documentation Phase |
| **Start Date** | 2026-03-01 |
| **Prerequisites** | Sprint 57-60 ✅ Complete |

## Sprint Identity

```
EndiorBot là công cụ để CEO dùng SDLC Framework quản trị được các AI codex
(tập trung Claude Code) cho các dự án mà chính CEO chịu trách nhiệm.

NOT: Platform, SDLC enforcer, blocker
IS: CEO Power Tool, fast (<30s), auto-healing
```

## Sprint Breakdown

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **61a-1** | Core Init (FRESH, ENDIORBOT, PARTIAL) | 8h | 🎯 NEXT |
| **61a-2** | Migration (TINYSDLC, SDLC_ORCHESTRATOR) | 6h | After 61a-1 |
| **61b** | Restructure + Compliance | 12h | After 61a-2 |

## CEO Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tier Mismatch** | Trust docs/, suggest config update | docs/ = source of truth |
| **Invalid Config** | Auto-migrate to valid schema | CEO tool = fast, no blocking |
| **Interactive Mode** | UNKNOWN state only | Simple = auto, Complex = prompt |
| **Config Detection** | Content-based, not filename | All 3 tools use .sdlc-config.json |

---

## Phase 61a-1: Core Init (8h)

### Scope

- Project states: FRESH, ENDIORBOT, PARTIAL
- Full scaffold generation
- Tier detection from docs/
- Idempotent re-run

### Files to Create

```
src/cli/commands/init.ts              # Main command (2h)
src/sdlc/scaffold/
├── index.ts                          # Exports
├── types.ts                          # All types (0.5h)
├── project-detector.ts               # Detection logic (1h)
├── tier-detector.ts                  # TIER_STAGES, detectTierFromDocs (0.5h)
├── structure-generator.ts            # scaffoldProject() (1.5h)
└── templates/                        # Template generators (2h)
    ├── sdlc-config.ts                # generateSdlcConfig()
    ├── claude-md.ts                  # generateClaudeMd()
    ├── identity-md.ts                # generateIdentityMd()
    └── agents-md.ts                  # generateAgentsMd()
```

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| 1 | Create types.ts with all interfaces | 0.5h | @dev |
| 2 | Create tier-detector.ts with TIER_STAGES | 0.5h | @dev |
| 3 | Create project-detector.ts (3 states) | 1h | @dev |
| 4 | Create 4 template generators | 2h | @dev |
| 5 | Create structure-generator.ts | 1.5h | @dev |
| 6 | Create init.ts command | 2h | @dev |
| 7 | Unit tests (15) | 0.5h | @dev |
| **Total** | | **8h** | |

### Definition of Done (61a-1)

- [ ] `endiorbot init` creates full scaffold for fresh project
- [ ] `endiorbot init --tier LITE|STANDARD` works
- [ ] `endiorbot init --analyze` shows preview without writing
- [ ] `endiorbot init --force` overwrites with backup
- [ ] Re-run on existing project → no unnecessary changes
- [ ] Detects: FRESH, ENDIORBOT, PARTIAL states
- [ ] 15 unit tests pass
- [ ] `pnpm build` passes

---

## Phase 61a-2: Migration (6h)

### Scope

- Project states: TINYSDLC, SDLC_ORCHESTRATOR, UNKNOWN
- Auto-migration for known formats
- Interactive wizard for UNKNOWN
- Managed section markers

### Files to Create

```
src/sdlc/scaffold/
├── config-reader.ts                  # Parse config formats (1h)
├── config-validator.ts               # Schema validation (0.5h)
├── idempotent-updater.ts             # Hash tracking, managed sections (1h)
└── migration/
    ├── index.ts                      # Migration orchestrator (0.5h)
    ├── from-tinysdlc.ts              # tinysdlc → EndiorBot (1h)
    ├── from-sdlc-orchestrator.ts     # SDLC Orchestrator → EndiorBot (1h)
    └── interactive-wizard.ts         # UNKNOWN state handler (0.5h)
```

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| 1 | Create config-reader.ts + validator | 1.5h | @dev |
| 2 | Create from-tinysdlc.ts | 1h | @dev |
| 3 | Create from-sdlc-orchestrator.ts | 1h | @dev |
| 4 | Create interactive-wizard.ts | 0.5h | @dev |
| 5 | Create idempotent-updater.ts | 1h | @dev |
| 6 | Update project-detector.ts (all 6 states) | 0.5h | @dev |
| 7 | Migration tests (10) | 0.5h | @dev |
| **Total** | | **6h** | |

### Definition of Done (61a-2)

- [ ] Detects: TINYSDLC, SDLC_ORCHESTRATOR, UNKNOWN states
- [ ] `endiorbot init` auto-migrates tinysdlc
- [ ] `endiorbot init` auto-migrates SDLC Orchestrator
- [ ] Interactive wizard triggers for UNKNOWN only
- [ ] Managed section markers preserve user content
- [ ] 10 migration tests pass

---

## Phase 61b: Restructure + Compliance (12h)

### Scope

- `endiorbot restructure` command (gap analysis, auto-fix)
- `endiorbot compliance` command (scoring, reporting)
- 7-Pillar + Section 7-9 compliance scoring

### Files to Create

```
src/cli/commands/restructure.ts       # Command registration (2h)
src/cli/commands/compliance.ts        # Command registration (2h)
src/sdlc/compliance/
├── gap-analyzer.ts                   # analyzeGaps(), GapItem types (2h)
├── compliance-scorer.ts              # calculateComplianceScore() (2h)
├── report-generator.ts               # generateReport() (1.5h)
├── compliance-hub.ts                 # generateComplianceHub() (1h)
├── stage-readme.ts                   # generateStageReadme() (0.5h)
└── check-functions.ts                # Individual check implementations (1h)
```

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| 1 | Create gap-analyzer.ts (6 gap types) | 2h | @dev |
| 2 | Create restructure.ts command | 2h | @dev |
| 3 | Create compliance-scorer.ts (7 Pillars + Sections) | 2h | @dev |
| 4 | Create report-generator.ts (markdown/json/text) | 1.5h | @dev |
| 5 | Create compliance.ts command | 2h | @dev |
| 6 | Create compliance-hub.ts | 1h | @dev |
| 7 | Unit + E2E tests (15 unit + 5 E2E) | 1.5h | @dev |
| **Total** | | **12h** | |

### Gap Types

| Type | Description | Severity | Fixable |
|------|-------------|----------|---------|
| MISSING_STAGE | Required docs/ stage missing | critical | Yes |
| MISSING_ROOT_FILE | CLAUDE.md, AGENTS.md missing | high | Yes |
| MISSING_SECTION | Required section in file missing | medium | Yes |
| MISSING_CLAUDE_DIR | .claude/ structure missing | high | Yes |
| TIER_MISMATCH | Config tier != structure tier | medium | Yes |
| OUTDATED_TEMPLATE | Template version outdated | low | Yes |

### Compliance Categories (100 points total)

| Category | Weight | Checks |
|----------|--------|--------|
| Pillar 0: Design Thinking | 5% | Vision, Problem Statement |
| Pillar 1: 10-Stage Lifecycle | 15% | Stage folders, READMEs |
| Pillar 2: Sprint Governance | 10% | CURRENT-SPRINT, history |
| Pillar 3: Tier Classification | 10% | Config, tier validity |
| Pillar 4: Quality Gates | 15% | ADRs, Tech Specs |
| Pillar 5: SASE Integration | 10% | CLAUDE.md, AGENTS.md |
| Pillar 6: Documentation | 5% | README, IDENTITY |
| Section 7: Quality Assurance | 15% | Vibecoding, Tests |
| Section 8: Unified Specs | 10% | Frontmatter, BDD |
| Section 9: Legacy Org | 5% | Archive structure |

### Grade Scale

| Grade | Score | Description |
|-------|-------|-------------|
| A | 90-100 | Excellent - Full compliance |
| B | 80-89 | Good - Minor gaps |
| C | 70-79 | Adequate - Improvements needed |
| D | 60-69 | Below standard - Significant gaps |
| F | <60 | Failing - Major restructuring required |

### Definition of Done (61b)

- [ ] `endiorbot restructure --analyze` shows gaps with severity
- [ ] `endiorbot restructure --fix` creates missing structure
- [ ] `endiorbot restructure --fix --compliance` generates compliance hub
- [ ] `endiorbot compliance score` shows 7-Pillar breakdown
- [ ] `endiorbot compliance report` generates markdown/json/text
- [ ] Grade calculation correct (A/B/C/D/F)
- [ ] 15 unit tests pass
- [ ] 5 E2E tests pass

---

## Command Summary

```bash
# Init commands (61a-1, 61a-2)
endiorbot init                    # Auto-detect, auto-migrate
endiorbot init --tier STANDARD    # Specify tier
endiorbot init --analyze          # Dry-run
endiorbot init --force            # Overwrite with backup
endiorbot init --refresh          # Update templates only

# Restructure commands (61b)
endiorbot restructure --analyze   # Show gaps
endiorbot restructure --fix       # Fix structure

# Compliance commands (61b)
endiorbot compliance score        # Get score
endiorbot compliance report       # Executive summary
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Init time (fresh) | < 5 seconds |
| Init time (re-run) | < 2 seconds |
| Detection accuracy | 100% |
| Auto-migration success | 100% (TINYSDLC, SDLC_ORCH) |
| User content preserved | 100% (unless --force) |
| Unit tests | 25 passing |
| E2E tests | 5 passing |

---

## Dependencies

### Existing Modules to Import

| Module | Location | Usage |
|--------|----------|-------|
| Active Project State | `src/config/paths.ts` | `saveActiveProject()` |
| Graceful Degradation | `src/resilience/graceful-degradation.ts` | `withFallback()` |
| i18n | `src/i18n/index.ts` | Vietnamese messages |
| EndiorBotError | `src/errors/index.ts` | Structured errors |

### Sample Configs (Available)

| Source | Location |
|--------|----------|
| tinysdlc | `/Users/dttai/Documents/Python/01.NQH/tinysdlc/.sdlc-config.json` |
| SDLC Orchestrator | `/Users/dttai/Documents/Python/01.NQH/SDLC-Orchestrator/.sdlc-config.json` |

---

## Related Documents

### Sprint 61a (Init)

| Document | Location | Owner |
|----------|----------|-------|
| Technical Spec | `docs/02-design/14-Technical-Specs/TS-004-Init-Command.md` | @architect |
| ADR | `docs/02-design/01-ADRs/ADR-013-Init-Command.md` | @cto |
| Test Plan | `docs/05-test/test-plans/TP-061-Init-Command.md` | @qa |

### Sprint 61b (Restructure + Compliance)

| Document | Location | Owner |
|----------|----------|-------|
| Restructure Spec | `docs/02-design/14-Technical-Specs/TS-005-Restructure-Command.md` | @architect |
| Compliance Spec | `docs/02-design/14-Technical-Specs/TS-006-Compliance-Command.md` | @architect |
| Test Plan | `docs/05-test/test-plans/TP-062-Restructure-Compliance.md` | @qa |

---

*Sprint 61 Implementation Guide*
*SDLC Framework v6.1.1*
