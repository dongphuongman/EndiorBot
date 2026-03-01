# Sprint 64: Retrieval Intelligence

| Metadata | Value |
|----------|-------|
| **Sprint** | 64 |
| **Duration** | 16 hours |
| **Status** | 📋 PLANNED |
| **Start Date** | TBD (After Sprint 63) |
| **End Date** | TBD |
| **Prerequisites** | Sprint 63 Complete |
| **Master Plan Version** | v4.2 |

## Sprint Identity

```
Enable intelligent code retrieval with stage-aware and role-aware filtering,
plus full AstGrepProvider for structural/AST-aware search.

GOAL: Reduce search noise by 60% through smart filtering
APPROACH: Stage filters + Role filters + AST patterns
```

## Dependencies

| Dependency | From | Status |
|------------|------|--------|
| RgProvider | Sprint 63 | ⏳ |
| AstGrepProvider stub | Sprint 63 | ⏳ |
| Feature flags | Sprint 63 | ✅ Created |
| Retrieval Logger | Sprint 63 | ⏳ |

---

## Sprint Breakdown

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **64-1** | Policy Engine | 8h | ⏳ |
| **64-2** | Search Enrichment | 8h | ⏳ |

---

## Phase 64-1: Policy Engine (8h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T1.1 | STAGE_FILTERS defaults (all 10 stages) | 1h | @dev |
| T1.2 | ROLE_FILTERS defaults (all agent roles) | 1h | @dev |
| T1.3 | Search term extraction from task | 2h | @dev |
| T1.4 | Result ranking and scoring | 2h | @dev |
| T1.5 | Token budget enforcement | 1h | @dev |
| T1.6 | Spec Snapshot cross-ref | 1h | @dev |
| **Total** | | **8h** | |

### Stage Filters

```typescript
export const STAGE_FILTERS: Record<string, StageFilter> = {
  "00-FOUNDATION": {
    priorityPatterns: ["*.md", "README*", "CLAUDE.md", "IDENTITY.md"],
    excludePatterns: ["node_modules/**", "dist/**", ".git/**"],
    contextDepth: 1,
  },
  "01-PLANNING": {
    priorityPatterns: ["docs/01-planning/**/*", "ADR-*.md", "*.md"],
    excludePatterns: ["src/**/*.ts", "node_modules/**"],
    contextDepth: 2,
  },
  "04-BUILD": {
    priorityPatterns: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"],
    excludePatterns: ["docs/**/*", "*.md", "node_modules/**"],
    contextDepth: 3,
  },
  "05-TEST": {
    priorityPatterns: ["tests/**/*", "*.test.ts", "*.spec.ts"],
    excludePatterns: ["node_modules/**", "dist/**"],
    contextDepth: 2,
  },
};
```

### Role Filters

```typescript
export const ROLE_FILTERS: Record<string, RoleFilter> = {
  "@architect": {
    focusPaths: ["docs/**/*", "ADR-*.md", "*.proto", "*.graphql"],
    contextDepth: 2,
    tokenBudget: 3000,
  },
  "@coder": {
    focusPaths: ["src/**/*", "tests/**/*", "*.ts", "*.tsx"],
    contextDepth: 4,
    tokenBudget: 4000,
  },
  "@reviewer": {
    focusPaths: ["src/**/*", "tests/**/*", "docs/05-test/**/*"],
    contextDepth: 3,
    tokenBudget: 3500,
  },
};
```

### Definition of Done (64-1)

- [ ] STAGE_FILTERS for all 10 SDLC stages
- [ ] ROLE_FILTERS for all agent roles
- [ ] Search term extraction works
- [ ] Result ranking implemented
- [ ] Token budget enforced (2000 soft, 2500 hard)

---

## Phase 64-2: Search Enrichment (8h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T2.1 | AstGrepProvider full implementation | 4h | @dev |
| T2.2 | Spec Snapshot cross-ref (mark matching files) | 2h | @dev |
| T2.3 | Decision Packet enrichment with search evidence | 1h | @dev |
| T2.4 | CEO benchmark (5 scenarios) | 1h | @dev |
| **Total** | | **8h** | |

### CEO Benchmark Scenarios

| # | Scenario | Query | Expected Result |
|---|----------|-------|-----------------|
| 1 | Auth entrypoints | "login authenticate session" | auth/*.ts, middleware/auth.ts |
| 2 | DTO mapping | "interface.*Request.*Response" | types/*.ts, api/*.ts |
| 3 | Test coverage | "describe.*should" | tests/**/*.test.ts |
| 4 | Prisma queries | "prisma.*findMany.*include" | services/*.ts |
| 5 | Unused exports | exported functions not imported | (ast-grep structural) |

### Benchmark Metrics

| Metric | Target |
|--------|--------|
| P50/P95 latency | P95 < 2s on 1M LOC |
| Recall | > 80% (top-15 has correct file) |
| Tokens used | After truncation |

### Definition of Done (64-2)

- [ ] AstGrepProvider fully working
- [ ] Feature flag SEARCH_AST_GREP=true
- [ ] Spec Snapshot files marked in SearchResult
- [ ] 5 CEO benchmark scenarios pass
- [ ] P95 < 2s on benchmark

---

## Files to Create/Modify

```
src/search/
├── retrieval-policy.ts           # MODIFY: Add full stage/role filters
├── providers/
│   └── ast-grep-provider.ts      # MODIFY: Full implementation
└── __tests__/
    ├── retrieval-policy.test.ts  # NEW: Policy tests
    └── benchmark.test.ts         # NEW: CEO benchmark tests
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Stage-aware filtering | 60% noise reduction |
| Role-aware filtering | Context depth adjustment |
| AstGrepProvider | Full structural search |
| CEO benchmark | 5/5 pass |
| Tests | 10+ new tests |

---

## Related Documents

| Document | Location |
|----------|----------|
| Sprint 63 Plan | `docs/04-build/sprints/sprint-63-code-search-foundation.md` |
| TS-007 | `docs/02-design/14-Technical-Specs/TS-007-Code-Search-Layer.md` |
| Master Plan | `docs/00-foundation/master-plan.md` |

---

*Sprint 64 | Retrieval Intelligence | PLANNED*
*Master Plan v4.2 | SDLC Framework v6.1.1*
