# Sprint 63: Code Search Foundation

| Metadata | Value |
|----------|-------|
| **Sprint** | 63 |
| **Duration** | 22 hours (4 phases) |
| **Status** | 🎯 CTO APPROVED |
| **Start Date** | 2026-03-01 |
| **End Date** | TBD |
| **Prerequisites** | Sprint 61-62 Complete, CTO Conditions Met |
| **Master Plan Version** | v4.2 |

## Sprint Identity

```
Enable EndiorBot to find relevant code in 100K+ LOC repos and inject it as
context before AI model calls, eliminating Semantic Blindness.

SOLUTION: Code Search Layer with ripgrep (P0) + ast-grep (P1 stub)
APPROACH: 3-Tier OSS - Zero infra → Structural → Indexed (1M+ LOC)
```

## Two Critical Problems (Post-MVP)

| Problem | Symptom | Solution | Sprint |
|---------|---------|----------|--------|
| **Semantic Blindness** | AI can't find code in 100K+ LOC | Code Search Layer | 63-64 |
| **Context Drift** | AI forgets Sprint Goals after 50-100K tokens | Context Anchoring | 65 |

## CTO Conditions (BLOCKING)

| # | Condition | Owner | Status |
|---|-----------|-------|--------|
| C1 | Feature flags in `src/config/feature-flags.ts` | @architect | ✅ Created |
| C2 | Regression gate: 172+ tests, compliance 100% | @dev | ⏳ |
| C3 | Rollback checkpoint: `git tag v1.0-pre-search` | @pm | ⏳ |
| C4 | Zoekt gate methodology documented | @architect | ✅ In TS-007 |

## CTO Amendments (MUST apply in code)

| # | Amendment | Apply When |
|---|-----------|------------|
| A1 | SearchResponse.providerVersion field | Define types |
| A2 | RgProvider: log + return empty on error (no throw) | Implement search() |
| A3 | SEARCH_BUDGET: MAX_BYTES_PER_RESULT=500, HARD_CAP_TOKENS=2500 | search-budget.ts |

---

## Sprint Breakdown

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **63-0** | Prerequisites (CTO Conditions) | 1h | ⏳ |
| **63-1** | RgProvider + Types | 9h | ⏳ |
| **63-2** | Integration + Logging | 10h | ⏳ |
| **63-3** | Testing + CLI | 2h | ⏳ |

---

## Phase 63-0: Prerequisites (1h)

### Scope
- Create feature flags infrastructure
- Create rollback checkpoint
- Verify regression baseline

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T0.1 | Create `src/config/feature-flags.ts` | 0.5h | @architect |
| T0.2 | Create `git tag v1.0-pre-search` | 0.25h | @pm |
| T0.3 | Verify 172+ tests, compliance 100% | 0.25h | @dev |
| **Total** | | **1h** | |

### Feature Flags Schema

```typescript
// src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  // Code Search Layer (Sprint 63+)
  SEARCH_ENABLED: true,           // Master switch
  SEARCH_AST_GREP: false,         // Enable ast-grep provider (S64)
  SEARCH_ZOEKT: false,            // Enable Zoekt provider (S66-67)

  // Context Anchoring (Sprint 65)
  CONTEXT_ANCHORING: false,       // Enable context anchoring

  // Observability
  RETRIEVAL_LOGGER: true,         // Log search evidence
} as const;
```

### Definition of Done (63-0)

- [x] `src/config/feature-flags.ts` exists with all flags ✅
- [ ] `git tag v1.0-pre-search` created
- [ ] `pnpm test` shows 172+ passing
- [ ] `./endiorbot.mjs compliance score` shows 100%

---

## Phase 63-1: RgProvider + Types (9h)

### Scope
- Create search module structure
- Define enriched types with CTO amendments
- Implement RgProvider with error handling

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T1.1 | Create `src/search/` module structure | 0.5h | @dev |
| T1.2 | Define enriched types (CTO A1, A3) | 1.5h | @dev |
| T1.3 | Define CodeSearchProvider interface | 1h | @dev |
| T1.4 | Implement RgProvider.search() (CTO A2) | 2h | @dev |
| T1.5 | Implement RgProvider.searchStream() | 1.5h | @dev |
| T1.6 | Health check + rg not installed fallback | 1h | @dev |
| T1.7 | Unit tests (8+ tests) | 1h | @dev |
| T1.8 | AstGrepProvider stub + feature flag | 0.5h | @dev |
| **Total** | | **9h** | |

### Files to Create

```
src/search/
├── index.ts                      # Barrel export
├── types.ts                      # SearchResult, SearchResponse, SearchOptions
├── code-search-provider.ts       # Abstract interface
├── search-budget.ts              # Token budget constants (CTO A3)
├── providers/
│   ├── index.ts                  # Provider exports
│   ├── rg-provider.ts            # RipgrepProvider (P0)
│   └── ast-grep-provider.ts      # AstGrepProvider stub (P1)
└── __tests__/
    ├── rg-provider.test.ts       # 8+ tests
    └── types.test.ts             # Type validation
```

### Key Types (with CTO Amendments)

```typescript
// SearchResponse with CTO A1: providerVersion
export interface SearchResponse {
  hits: SearchResult[];
  totalHits: number;
  truncated: boolean;
  elapsed_ms: number;
  provider: string;
  providerVersion: string;        // CTO A1
  tokensUsed: number;
}

// SEARCH_BUDGET with CTO A3
export const SEARCH_BUDGET = {
  DEFAULT_TOP_K: 15,
  DEFAULT_MAX_BYTES: 50_000,
  MAX_BYTES_PER_RESULT: 500,      // CTO A3
  DEFAULT_TIMEOUT_MS: 5_000,
  TOKEN_LIMIT: 2_000,
  HARD_CAP_TOKENS: 2_500,         // CTO A3
} as const;
```

### RgProvider Error Handling (CTO A2)

```typescript
// RgProvider MUST NOT throw - return empty on error
async search(options: SearchOptions): Promise<SearchResponse> {
  try {
    // ... search logic
  } catch (error) {
    this.logger.warn('RgProvider search failed', { query: options.query, error });
    return this.emptyResponse();
  }
}
```

### Definition of Done (63-1)

- [ ] `src/search/` module structure created
- [ ] All types defined with CTO amendments
- [ ] CodeSearchProvider interface defined
- [ ] RgProvider.search() implemented with A2 error handling
- [ ] RgProvider.searchStream() implemented
- [ ] Health check fallback works
- [ ] 8+ unit tests passing
- [ ] AstGrepProvider stub created with feature flag

---

## Phase 63-2: Integration + Logging (10h)

### Scope
- Extend ContextSource enum
- Implement retrieval policy
- Create retrieval logger
- Wire into Context Injector

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T2.1 | Extend ContextSource enum ('search', 'anchor') | 0.5h | @dev |
| T2.2 | Implement loadCodebaseContext() | 2h | @dev |
| T2.3 | Create retrieval-policy.ts (basic stage filters) | 1.5h | @dev |
| T2.4 | Add stage-aware filtering (BUILD→.ts, PLAN→.md) | 1h | @dev |
| T2.5 | Add role-aware filtering (@coder→src/, @architect→docs/) | 1h | @dev |
| T2.6 | Implement search-budget.ts with CTO A3 | 1h | @dev |
| T2.7 | Retrieval Logger → SESSION-PROGRESS.md | 1.5h | @dev |
| T2.8 | SearchResponse wrapper with providerVersion | 0.5h | @dev |
| T2.9 | Integration tests (7+ tests) | 1h | @dev |
| **Total** | | **10h** | |

### Files to Create/Modify

```
src/search/
├── retrieval-policy.ts           # Stage/role filtering
├── retrieval-logger.ts           # Evidence logging
└── __tests__/
    └── integration.test.ts       # 7+ integration tests

src/agents/context/
├── context-injector.ts           # MODIFY: Add loadCodebaseContext()
└── context-manifest.ts           # MODIFY: Add "search" source
```

### Definition of Done (63-2)

- [ ] ContextSource enum extended
- [ ] loadCodebaseContext() implemented
- [ ] Stage-aware filtering works (BUILD→.ts)
- [ ] Role-aware filtering works (@coder→src/)
- [ ] Search budget enforced (2000 soft, 2500 hard)
- [ ] Retrieval Logger writes to SESSION-PROGRESS.md
- [ ] 7+ integration tests passing

---

## Phase 63-3: Testing + CLI (2h)

### Scope
- CLI search command
- Final regression verification
- Documentation

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T3.1 | CLI: `endiorbot context search "query" --type ts` | 1h | @dev |
| T3.2 | Final regression: 172+ tests passing | 0.5h | @dev |
| T3.3 | Update CURRENT-SPRINT.md | 0.25h | @pm |
| T3.4 | Sprint completion checklist | 0.25h | @pm |
| **Total** | | **2h** | |

### Definition of Done (63-3)

- [ ] CLI search command works
- [ ] 172+ existing tests still passing
- [ ] 15+ new search tests passing
- [ ] Sprint docs updated

---

## Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Search latency (EndiorBot) | < 500ms | Performance test |
| Token budget | ≤ 2500 (hard cap) | Unit test |
| New tests | 15+ | `pnpm test src/search/` |
| Total tests | 172+ | `pnpm test` |
| Compliance score | 100% | `./endiorbot.mjs compliance score` |

---

## Verification Commands

```bash
# Phase 63-0: Prerequisites
git tag v1.0-pre-search
pnpm test                                    # 172+ passing
./endiorbot.mjs compliance score             # 100%

# Phase 63-1: RgProvider
pnpm test src/search/                        # 8+ passing
./endiorbot.mjs context search "function"    # Works

# Phase 63-2: Integration
pnpm test src/search/                        # 15+ passing
cat SESSION-PROGRESS.md | grep "Search"      # Evidence logged

# Phase 63-3: Final
pnpm build                                   # Passes
pnpm test                                    # 172+ passing (no regression)
```

---

## Dependencies

### Existing Modules to Import

| Module | Location | Usage |
|--------|----------|-------|
| Context Injector | `src/agents/context/context-injector.ts` | Add codebase source |
| Logger | `src/logging/index.ts` | createLogger() |
| Feature Flags | `src/config/feature-flags.ts` | SEARCH_* flags |

### External Dependencies

| Package | Purpose | Sprint |
|---------|---------|--------|
| `@ast-grep/napi` | AST-aware search (stub) | 63 (stub), 64 (full) |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ripgrep not installed | Low | High | Health check + fallback to grep |
| Large file timeout | Medium | Medium | Streaming + result limits |
| Token budget overflow | Medium | Low | Hard cap at 2500 tokens |
| Regression in existing tests | Low | High | v1.0-pre-search rollback tag |

---

## Related Documents

| Document | Location | Status |
|----------|----------|--------|
| Master Plan v4.2 | `~/.claude/plans/velvet-whistling-waterfall.md` | ✅ |
| Technical Spec | `docs/02-design/14-Technical-Specs/TS-007-Code-Search-Layer.md` | ⏳ |
| ADR | `docs/02-design/01-ADRs/ADR-014-Code-Search-Layer.md` | ⏳ |
| Test Plan | `docs/05-test/test-plans/TP-063-Code-Search.md` | ⏳ |

---

*Sprint 63 | Code Search Foundation | CTO APPROVED*
*Master Plan v4.2 | SDLC Framework v6.1.1 | 2026-03-01*
