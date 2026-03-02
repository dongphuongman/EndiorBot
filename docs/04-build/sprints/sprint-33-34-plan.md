# Sprint 33-34 Detailed Plan

**Version**: 1.2.2
**Date**: February 22, 2026
**Status**: ✅ APPROVED - Ready for Implementation
**Approved By**: CTO/PM
**Authority**: EndiorBot PM
**Pillar**: 2 - Sprint Governance
**Stage**: 01 - PLANNING
**Prerequisites**: Sprint 31-32 Complete
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 33-34 focuses on **Phase 2 Core Infrastructure Completion** before proceeding to Desktop phase. This ensures a solid foundation for all downstream features.

### Why Phase 2 First?

1. Config module needs **schema validation** and **I/O operations** for proper config management
2. Desktop phase (Phase 7) depends on complete core infrastructure
3. CLI commands need proper **logging** and **session persistence**
4. Following SDLC: complete foundation before building features

### Current State (Actual)

| Module | Files | Status | Gaps |
|--------|-------|--------|------|
| config/ | 3 | Partial | Missing: io.ts, defaults.ts, validation.ts |
| utils/ | 1 | Minimal | Missing: string, json, hash, time utilities |
| logging/ | 0 | None | Need full implementation |
| infra/ | 0 | None | Need platform, shell-env |
| sessions/ | 5 | **Functional** | Need: project-context, context-switcher |
| gateway/ | 0 | None | Deferred to Sprint 35 |

**Note**: sessions/ module already has SessionManager, SessionStore, TokenCounter - more complete than originally assessed.

### Scope Prioritization

| Module | Priority | Action | Reason |
|--------|----------|--------|--------|
| config/ | P0 | **Extend** | Add schema validation, I/O |
| utils/ | P1 | **Create** | Shared utilities used everywhere |
| logging/ | P1 | **Create** | Required for debugging and operations |
| infra/ | P2 | **Create** | Shell env, platform detection |
| sessions/ | P0 | **Extend** | Add project context, switcher (ADR-002) |
| gateway/ | P2 | **Defer** | Desktop phase prerequisite |

### Pre-Sprint Exceptions

| File | Type | Status | Notes |
|------|------|--------|-------|
| src/config/schema.ts | Spike | Created | Review against acceptance criteria in Sprint 33 Day 1-2. Fix JSDoc metadata. |

---

## Sprint Overview

| Sprint | Focus | Duration |
|--------|-------|----------|
| Sprint 33 | Phase 2.1: config/ + utils/ + logging/ | 10 days |
| Sprint 34 | Phase 2.2: sessions/ + infra/ (core) | 10 days |

**Note**: Gateway module deferred to Sprint 35 (Desktop phase prerequisite)

---

## Sprint 33: Config, Utils, Logging

### Week 1 (Day 1-5): Config Module Completion

#### Day 1-2: Config Schema & Validation

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/config/schema.ts | P0 | Zod validation schema | ~350 |
| Create src/config/validation.ts | P0 | Config validation logic | ~150 |
| Create tests/config/schema.test.ts | P0 | Unit tests | ~200 |

**Acceptance Criteria:**
- [ ] EndiorBotConfigSchema validates all config fields
- [ ] Gateway, SDLC, Orchestrator sections validated
- [ ] parseConfig() returns typed result with errors
- [ ] parsePartialConfig() supports incremental updates
- [ ] Unit tests pass
- [ ] Build passes

**Reference:**
- MTS-OpenClaw: `src/config/zod-schema.ts` (adapt, not copy)
- Simplify for solo developer use (no enterprise team features)

#### Day 3-4: Config I/O & Defaults

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/config/io.ts | P0 | Config read/write | ~300 |
| Create src/config/defaults.ts | P0 | Default values | ~200 |
| Create src/config/env-vars.ts | P1 | Environment variable handling | ~100 |
| Create tests/config/io.test.ts | P0 | Unit tests | ~150 |

**Acceptance Criteria:**
- [ ] loadConfig() reads from ~/.endiorbot/endiorbot.json
- [ ] writeConfig() safely writes with backup
- [ ] Environment variable substitution works (${VAR})
- [ ] Config caching with TTL implemented
- [ ] Unit tests pass
- [ ] Build passes

#### Day 5: Config Module Integration

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/config/index.ts | P0 | Module exports | ~50 |
| Update existing types.ts | P0 | Add missing types | ~50 |
| Integration with CLI | P0 | Config commands | ~100 |
| Create docs/04-build/config-guide.md | P1 | Developer guide | ~100 |

**Acceptance Criteria:**
- [ ] `endiorbot config show` displays current config
- [ ] `endiorbot config set <key> <value>` updates config
- [ ] `endiorbot config reset` restores defaults
- [ ] All exports properly typed
- [ ] Build passes

### Week 2 (Day 6-10): Utils & Logging Modules

#### Day 6-7: Utils Module

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Expand src/utils/boolean.ts | P1 | Boolean parsing (exists) | +20 |
| Create src/utils/string.ts | P0 | String utilities | ~80 |
| Create src/utils/json.ts | P0 | Safe JSON parsing | ~60 |
| Create src/utils/hash.ts | P0 | Hashing utilities | ~50 |
| Create src/utils/time.ts | P1 | Time/duration parsing | ~80 |
| Create src/utils/index.ts | P0 | Module exports | ~30 |
| Create tests/utils/ | P0 | Unit tests | ~200 |

**Acceptance Criteria:**
- [ ] String utilities: truncate, slugify, sanitize
- [ ] JSON utilities: safeJsonParse, safeJsonStringify
- [ ] Hash utilities: sha256, md5
- [ ] Time utilities: parseDuration, formatRelative
- [ ] All utilities pure functions
- [ ] Unit tests pass
- [ ] Build passes

#### Day 8-9: Logging Module

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/logging/logger.ts | P0 | Core logger | ~200 |
| Create src/logging/formatters.ts | P0 | JSON/pretty formatters | ~150 |
| Create src/logging/redaction.ts | P0 | Sensitive data redaction | ~100 |
| Create src/logging/transports.ts | P1 | Console/file transports | ~150 |
| Create src/logging/index.ts | P0 | Module exports | ~30 |
| Create tests/logging/ | P0 | Unit tests | ~200 |

**Acceptance Criteria:**
- [ ] Logger supports levels: debug, info, warn, error
- [ ] JSON and pretty formats available
- [ ] Sensitive data (API keys, tokens) redacted
- [ ] File transport with rotation (optional)
- [ ] Child loggers with context
- [ ] Unit tests pass
- [ ] Build passes

#### Day 10: Sprint 33 Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Update src/config/types.ts | P0 | Complete type exports |
| Documentation review | P1 | All modules documented |
| G-Sprint Close checklist | P0 | Sprint 33 approved |

---

## Sprint 34: Sessions Extension & Infrastructure

### Week 1 (Day 1-5): Sessions Module Extension

**Note**: Sessions module already has 5 files (SessionManager, SessionStore, TokenCounter, types). Sprint 34 focuses on **extending** with project context features per ADR-002.

#### Day 1-2: Project Context (ADR-002)

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| **Create** src/sessions/project-context.ts | P0 | Project context handling | ~200 |
| **Extend** src/sessions/types.ts | P0 | Add ProjectContext type | ~50 |
| Create tests/sessions/project-context.test.ts | P0 | Unit tests | ~150 |

**Existing Files (Review Only):**
- src/sessions/session-manager.ts ✅ (already has createSession, listeners)
- src/sessions/session-store.ts ✅ (already has FileSessionStore)
- src/sessions/token-counter.ts ✅ (already has TokenCounter)

**Acceptance Criteria:**
- [ ] ProjectContext type includes SDLC state, git state (per ADR-002)
- [ ] Project contexts stored in ~/.endiorbot/projects/{id}/
- [ ] Serialize/deserialize ProjectContext works
- [ ] Unit tests pass
- [ ] Build passes

**Reference:**
- ADR-002: Project Context Switching
- Existing: `src/sessions/session-manager.ts`

#### Day 3-4: Context Switcher + Sprint Tracker

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| **Create** src/sessions/context-switcher.ts | P0 | Context switching logic | ~150 |
| **Create** src/sessions/sprint-tracker.ts | P0 | CURRENT-SPRINT.md maintenance | ~240 |
| **Extend** src/sessions/session-manager.ts | P0 | Add switchProject() | ~50 |
| Create integration tests | P0 | E2E tests | ~150 |

**Acceptance Criteria:**
- [ ] switchProject() preserves current state, loads target
- [ ] Max 5 concurrent projects in memory (per ADR-002)
- [ ] Context switch < 2s (NFR)
- [ ] **Sprint Tracker**: Auto-read CURRENT-SPRINT.md on project start
- [ ] **Sprint Tracker**: Update status when tasks complete
- [ ] **Sprint Tracker**: Create CURRENT-SPRINT.md if not exists
- [ ] **TinySDLC Pattern**: `resolveSprintPath()` helper (shared resolution logic)
- [ ] **TinySDLC Pattern**: 50-line context cap for injection
- [ ] **TinySDLC Pattern**: Activity log rotation (max 20 entries)
- [ ] **TinySDLC Pattern**: Fallback to root workspace if no active project
- [ ] Integration tests pass
- [ ] Build passes

**Sprint Tracker Feature (CEO Requirement + SDLC 6.1.1 G-Sprint Compliance)**:
```
When EndiorBot works on ANY project (Bflow, NQH-Bot, MTEP, etc.):
1. On project start: Read {project}/docs/04-build/CURRENT-SPRINT.md
2. On task complete: Update task status in CURRENT-SPRINT.md
3. On project switch: Save sprint state to CURRENT-SPRINT.md
4. If not exists: Create CURRENT-SPRINT.md from template
5. G-Sprint-Close: Update status to COMPLETED within 24h (Rule 2)
6. SSOT Validation: Ensure consistency with SPRINT-INDEX.md (Rule 6)
7. Doc Freeze Detection: Warn if CURRENT-SPRINT.md stale >24h (Rule 9)
```

**TinySDLC Reference Patterns** (proven in production):
```typescript
// 1. Shared helper for sprint file resolution
function resolveSprintPath(projectPath: string | null, fallbackPath: string): string | null {
  const baseDir = projectPath ?? fallbackPath;
  const sprintFile = path.join(baseDir, 'docs/04-build/CURRENT-SPRINT.md');
  return fs.existsSync(sprintFile) ? sprintFile : null;
}

// 2. Context injection with 50-line cap
const lines = sprintContent.split('\n').slice(0, 50);
const cappedContext = lines.join('\n');

// 3. Activity log rotation (max 20 entries)
function appendActivityLog(file: string, entry: string): void {
  const entries = parseActivityLog(file);
  entries.push(entry);
  if (entries.length > 20) entries.shift(); // Trim oldest
  writeActivityLog(file, entries);
}

// 4. Fallback resolution
const sprintFile = resolveSprintPath(getActiveProject()?.path, workspacePath);
```

**SDLC 6.1.1 G-Sprint Requirements Reference**:
```yaml
Golden Rules Implemented:
  Rule 2: Post-Sprint Docs Within 24h
    - Auto-update CURRENT-SPRINT.md status to COMPLETED
    - Add entry to SPRINT-INDEX.md
    - Blocking: Warn if deadline approaching

  Rule 6: SSOT Validation
    - Validate CURRENT-SPRINT.md ↔ SPRINT-INDEX.md consistency
    - Check sprint number matches active sprint plan

  Rule 9: Documentation Freeze = Sprint Freeze
    - Detect stale CURRENT-SPRINT.md (>24h post-completion)
    - Block new sprint actions until docs updated
    - Provide escalation warning

G-Sprint-Close Checklist (Automated):
  □ CURRENT-SPRINT.md updated (status: COMPLETED)
  □ SPRINT-INDEX.md entry added
  □ All tasks accounted (completed or carried over)
  □ Documentation lag < 24 business hours
```

**CTO Clarifications (v1.2.1)**:

```yaml
# 1. SSOT Fields (Rule 6) - Exact fields that must match
ssot_validation:
  required_fields:
    - sprint_number: "Sprint 33" must match in both files
    - sprint_status: ACTIVE | COMPLETE | PARTIAL must be consistent
    - sprint_dates: Start/end dates must align
    - completion_timestamp: When marked COMPLETED (ISO 8601)
  optional_fields:
    - gate_results: G-Sprint, G-Sprint-Close status
    - deliverables_count: Files/LOC summary

# 2. Enforcement Mode (Rule 9) - Warn vs Block
enforcement_mode:
  tier: STANDARD  # EndiorBot project tier
  mode: WARN_ONLY  # Per SDLC 6.1.1 tier matrix (STANDARD = "Recommended")

  blocked_commands: []  # None blocked for STANDARD tier

  warned_commands:
    - "endiorbot start <new-project>"  # Warn about stale docs
    - "endiorbot gate propose G-Sprint"  # Warn before new sprint
    - "endiorbot switch <project>"  # Warn if leaving stale project

  allowed_always:
    - "endiorbot status"  # Read-only
    - "endiorbot config *"  # Configuration
    - "endiorbot gate status"  # Read-only gate check

  escalation_to_block: false  # STANDARD tier never hard-blocks

# 3. Time Source (24h Window)
time_source:
  primary: "git_commit_timestamp"  # When CURRENT-SPRINT.md last committed
  fallback: "file_mtime"  # If not in git (new project)
  timezone: "UTC"  # Normalize to UTC for comparison

  calculation:
    stale_threshold: "24 business hours"
    business_hours:
      start: "09:00"
      end: "18:00"
      timezone: "Asia/Ho_Chi_Minh"  # CEO's timezone
      exclude: ["Saturday", "Sunday"]

    # Example: Sprint ends Friday 17:00 → Deadline Monday 17:00 (skip weekend)
```

#### Day 5: Session CLI Integration

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| **Refactor** src/cli/commands/start.ts | P0 | Use SessionManager properly | ~50 |
| **Refactor** src/cli/commands/switch.ts | P0 | Use context-switcher | ~50 |
| **Refactor** src/cli/commands/status.ts | P0 | Show session state from store | ~50 |
| **Extend** src/sessions/index.ts | P0 | Export new modules | ~20 |

**Acceptance Criteria:**
- [ ] `endiorbot start` creates/loads session via SessionManager
- [ ] `endiorbot switch` uses context-switcher
- [ ] `endiorbot status` reads from persistent session state
- [ ] Session state persists across CLI invocations
- [ ] Build passes

### Week 2 (Day 6-10): Infrastructure Module (Core)

#### Day 6-7: Platform Detection

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/infra/platform.ts | P0 | OS/arch detection | ~100 |
| Create src/infra/paths.ts | P0 | Platform-specific paths | ~80 |
| Create src/infra/env.ts | P0 | Environment handling | ~100 |
| Create tests/infra/ | P0 | Unit tests | ~150 |

**Acceptance Criteria:**
- [ ] Platform: darwin, linux, win32 detection
- [ ] Arch: x64, arm64 detection
- [ ] Platform-specific temp/cache paths
- [ ] HOME, XDG_* paths resolved correctly
- [ ] Unit tests pass (mock platforms)
- [ ] Build passes

#### Day 8-9: Shell Environment

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/infra/shell-env.ts | P1 | Shell env loading | ~150 |
| Create src/infra/process.ts | P1 | Process utilities | ~100 |
| Create src/infra/index.ts | P0 | Module exports | ~40 |
| Create integration tests | P1 | Shell env tests | ~100 |

**Acceptance Criteria:**
- [ ] Shell env loaded from user's .bashrc/.zshrc
- [ ] Expected keys (API keys) detected
- [ ] Process spawning utilities
- [ ] Cross-platform compatibility
- [ ] Build passes

#### Day 10: Sprint 34 Review

| Task | Priority | Deliverable |
|------|----------|-------------|
| Run full test suite | P0 | All tests pass |
| Create ADR-009 (Session Management) | P0 | docs/02-design/01-ADRs/ |
| Create TS-007 (Infrastructure) | P0 | docs/02-design/14-Technical-Specs/ |
| Test coverage report | P0 | > 80% coverage |
| G-Sprint Close checklist | P0 | Sprint 34 approved |

---

## Deliverables Summary

### Sprint 33 Deliverables

| Category | Files | Est. LOC |
|----------|-------|----------|
| Config modules | 6 | ~1,100 |
| Utils modules | 6 | ~320 |
| Logging modules | 5 | ~630 |
| Unit tests | 8+ | ~750 |
| Documentation | 1 | ~100 |
| **Total** | **26+** | **~2,900** |

### Sprint 34 Deliverables

| Category | Files | Est. LOC |
|----------|-------|----------|
| Sessions modules | 7 | ~1,190 |
| Infrastructure modules | 5 | ~470 |
| CLI updates | 3 | ~150 |
| Unit/Integration tests | 8+ | ~550 |
| ADRs & Tech Specs | 2 | ~300 |
| **Total** | **25+** | **~2,660** |

**New**: Sprint Tracker module (`sprint-tracker.ts`) - maintains CURRENT-SPRINT.md for all projects

---

## Dependencies

### Sprint 33 Dependencies

```
src/config/schema.ts
    └── zod (npm package) ✅
    └── src/config/types.ts (existing) ✅

src/config/io.ts
    └── src/config/schema.ts (Day 1-2)
    └── src/config/paths.ts (existing) ✅
    └── json5 (npm package) ✅

src/logging/logger.ts
    └── src/config/schema.ts (Day 1-2)
    └── src/utils/time.ts (Day 6-7)
```

### Sprint 34 Dependencies

```
src/sessions/session-manager.ts
    └── src/config/io.ts (Sprint 33)
    └── src/logging/logger.ts (Sprint 33)
    └── src/utils/hash.ts (Sprint 33)

src/infra/shell-env.ts
    └── src/logging/logger.ts (Sprint 33)
    └── src/infra/platform.ts (Day 6-7)
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Zod schema complexity | Low | Medium | Start simple, iterate |
| Session state corruption | Medium | High | Atomic writes, backups |
| Cross-platform issues | Medium | Medium | CI on all platforms |
| Test coverage gap | Low | Medium | TDD approach |
| Scope creep | Medium | High | Defer gateway to Sprint 35 |

---

## Success Criteria

### Sprint 33

- [ ] Config module complete (schema, io, defaults, validation)
- [ ] Utils module complete (string, json, hash, time)
- [ ] Logging module complete (logger, formatters, redaction)
- [ ] Test coverage > 80% for new modules
- [ ] Build passes
- [ ] G-Sprint Close approved

### Sprint 34

- [ ] Sessions module complete (manager, storage, context-switcher)
- [ ] Infrastructure module (core) complete
- [ ] CLI commands use SessionManager
- [ ] Session state persists across processes
- [ ] Test coverage > 80% for new modules
- [ ] ADR-009 and TS-007 created
- [ ] G-Sprint Close approved
- [ ] Ready for Sprint 35 (Gateway + Desktop prep)

---

## Out of Scope (Deferred)

The following are explicitly **deferred to Sprint 35+**:

| Module | Reason | Target Sprint |
|--------|--------|---------------|
| gateway/ | Desktop prerequisite, complex | Sprint 35 |
| channels/ | Depends on gateway | Sprint 35 |
| Desktop UI | Needs stable core | Sprint 36-37 |
| Skills framework | Lower priority | Sprint 35+ |

---

## Notes for @dev Team

### Code Style Requirements

1. **TypeScript Strict Mode**: All new code must pass `strict: true`
2. **exactOptionalPropertyTypes**: Use `prop: Type | undefined` not `prop?: Type`
3. **No any**: All types must be explicit
4. **JSDoc**: Public APIs must have documentation
5. **Tests**: Each module must have corresponding test file

### File Templates

```typescript
/**
 * Module Name
 *
 * Brief description.
 *
 * @module path/to/module
 * @version 1.0.0
 * @date 2026-02-XX
 * @status ACTIVE - Phase 2 Implementation
 * @authority ADR-XXX
 * @pillar 2 - Sprint Governance
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */
```

### MTS-OpenClaw Reference

When porting from MTS-OpenClaw:
1. Transform: `openclaw` → `endiorbot`, `MTS-OpenClaw` → `EndiorBot`
2. Update paths: `~/.openclaw/` → `~/.endiorbot/`
3. Update env vars: `OPENCLAW_*` → `ENDIORBOT_*`
4. Simplify: Remove enterprise team features
5. Keep: Core functionality, skip channel integrations

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | EndiorBot PM | 2026-02-22 | ✅ APPROVED |
| CTO | CTO/PM | 2026-02-22 | ✅ APPROVED (Conditional → Clarified) |
| Reviewer | @reviewer | 2026-02-22 | ✅ APPROVED (10/10 Quality Score) |
| CEO | @CEO | 2026-02-22 | ✅ APPROVED - "@dev team bắt đầu nhé" |

### Approval Conditions (Met)

1. ✅ Wording updated: "Create" → "Extend/Refactor" for sessions module
2. ✅ Current State section added with accurate module status
3. ✅ Pre-sprint exception documented for schema.ts

### Pre-Sprint Code Validation

| File | Review | Decision |
|------|--------|----------|
| src/config/schema.ts | ✅ 10/10 quality | **KEEP** as Day 1-2 deliverable |

---

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-22 | Initial Sprint 33-34 Plan |
| 1.1.0 | 2026-02-22 | Added Current State, Extend wording, Pre-sprint exceptions |
| 1.2.0 | 2026-02-22 | Incorporated SDLC 6.1.1 G-Sprint requirements for Sprint Tracker |
| 1.2.1 | 2026-02-22 | CTO clarifications (SSOT fields, enforcement mode, time source) + CEO approval |
| 1.2.2 | 2026-02-22 | Incorporated TinySDLC patterns (resolveSprintPath, 50-line cap, activity rotation) |

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
*Created: 2026-02-22*
*Updated: 2026-02-22 (v1.2.0)*
*Status: READY FOR CEO APPROVAL*
