# Sprint 66-67: Search Scale-Up (Conditional)

| Metadata | Value |
|----------|-------|
| **Sprint** | 66-67 |
| **Duration** | 20 hours (conditional) |
| **Status** | 📋 CONDITIONAL |
| **Start Date** | TBD (After Sprint 65) |
| **End Date** | TBD |
| **Prerequisites** | Sprint 63-65 Complete, Decision Gate Pass |
| **Master Plan Version** | v4.2 |

## Sprint Identity

```
Enable search at 1M+ LOC scale with Zoekt (Google Code Search).
This sprint is CONDITIONAL on ripgrep performance benchmark.

TRIGGER: ripgrep P95 > 2000ms on BFlow benchmark
SOLUTION: ZoektProvider with trigram indexing
FALLBACK: Skip to Sprint 68 if ripgrep is sufficient
```

## Decision Gate (BLOCKING)

### Gate Criteria

```
IF ripgrep P95 > 2000ms on BFlow benchmark (1M LOC, 5 CEO queries):
  → PROCEED with ZoektProvider implementation
  → Execute full 20h sprint

ELSE ripgrep P95 ≤ 2000ms:
  → SKIP Sprint 66-67
  → Mark P1 (ZoektProvider) as DEFERRED
  → Proceed directly to Sprint 68

RATIONALE:
  - 500ms is normal for rg on 100K LOC
  - Real test is 1M LOC on BFlow codebase
  - All 3 experts (CTO, PM, Architect) agreed on 2s threshold
```

### BFlow Benchmark Specification

| # | Query | Type | Expected Files |
|---|-------|------|----------------|
| 1 | "login authenticate session" | Keyword | auth/*.ts |
| 2 | "interface.*Request.*Response" | Regex | types/*.ts |
| 3 | "describe.*should" | Regex | tests/**/*.test.ts |
| 4 | "prisma.*findMany.*include" | Regex | services/*.ts |
| 5 | "export function" | Keyword | src/**/*.ts |

### Benchmark Execution

```bash
# 1. Clone BFlow benchmark repo (1M+ LOC)
git clone https://github.com/bflow/benchmark-repo /tmp/bflow

# 2. Run 5 CEO queries, record P50/P95 latency
./scripts/benchmark-search.sh /tmp/bflow

# 3. Decision
if [ $P95 -gt 2000 ]; then
  echo "PROCEED with Sprint 66-67"
else
  echo "SKIP to Sprint 68 - ripgrep is sufficient"
fi
```

---

## Dependencies (If Proceeding)

| Dependency | From | Status |
|------------|------|--------|
| RgProvider | Sprint 63 | ⏳ |
| AstGrepProvider | Sprint 64 | ⏳ |
| Retrieval Policy | Sprint 64 | ⏳ |
| Context Anchoring | Sprint 65 | ⏳ |

---

## Sprint Breakdown (If Proceeding)

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **66-1** | Zoekt Setup | 8h | ⏳ |
| **66-2** | ZoektProvider | 8h | ⏳ |
| **67-1** | Integration & Testing | 4h | ⏳ |

---

## Phase 66-1: Zoekt Setup (8h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T1.1 | Zoekt binary installation (Go build) | 2h | @dev |
| T1.2 | Index creation scripts | 2h | @dev |
| T1.3 | Index management (update, rebuild) | 2h | @dev |
| T1.4 | Health check and monitoring | 2h | @dev |
| **Total** | | **8h** | |

### Zoekt Installation

```bash
# 1. Install Go (if not present)
brew install go  # macOS
apt-get install golang  # Ubuntu

# 2. Install Zoekt
go install github.com/sourcegraph/zoekt/cmd/...@latest

# 3. Verify installation
zoekt-index --help
zoekt --help
```

### Index Management

```typescript
// src/search/providers/zoekt/index-manager.ts

export interface ZoektIndexConfig {
  repoPath: string;
  indexPath: string;
  excludePatterns: string[];
  includePatterns: string[];

  // Index settings
  maxFileSize: number;        // 1MB default
  maxTrigrams: number;        // 10M default

  // Update strategy
  updateInterval: number;      // ms between incremental updates
  fullRebuildInterval: number; // ms between full rebuilds
}

export class ZoektIndexManager {
  /**
   * Create initial index for repository.
   */
  async createIndex(config: ZoektIndexConfig): Promise<void>;

  /**
   * Update index incrementally (changed files only).
   */
  async updateIndex(): Promise<void>;

  /**
   * Full rebuild of index.
   */
  async rebuildIndex(): Promise<void>;

  /**
   * Get index statistics.
   */
  async getStats(): Promise<ZoektIndexStats>;
}
```

### Definition of Done (66-1)

- [ ] Zoekt binaries installed
- [ ] Index creation works
- [ ] Index update works (incremental)
- [ ] Index rebuild works (full)
- [ ] Health check endpoint exists

---

## Phase 66-2: ZoektProvider (8h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T2.1 | ZoektProvider implementation | 4h | @dev |
| T2.2 | Query translation (rg → zoekt) | 2h | @dev |
| T2.3 | Result normalization | 1h | @dev |
| T2.4 | Unit tests (6+ tests) | 1h | @dev |
| **Total** | | **8h** | |

### ZoektProvider Interface

```typescript
// src/search/providers/zoekt-provider.ts

import { CodeSearchProvider, SearchOptions, SearchResponse } from '../types';

export interface ZoektProviderConfig {
  indexPath: string;
  timeout: number;

  // Feature flag
  enabled: boolean;  // SEARCH_ZOEKT feature flag
}

export class ZoektProvider implements CodeSearchProvider {
  readonly name = 'zoekt';
  readonly version: string;  // zoekt version

  constructor(config: ZoektProviderConfig);

  /**
   * Search using Zoekt trigram index.
   * Falls back to RgProvider if Zoekt unavailable.
   */
  async search(options: SearchOptions): Promise<SearchResponse>;

  /**
   * Streaming search for large result sets.
   */
  searchStream(options: SearchOptions): AsyncGenerator<SearchResult>;

  /**
   * Check if Zoekt is available and index exists.
   */
  async isAvailable(): Promise<boolean>;

  /**
   * Get index statistics.
   */
  async getIndexStats(): Promise<ZoektIndexStats>;
}
```

### Query Translation

```typescript
// Convert ripgrep query to Zoekt query
// Zoekt uses RE2 syntax (different from PCRE)

function translateQuery(rgQuery: string): string {
  // Basic regex → RE2
  let zoektQuery = rgQuery;

  // Handle file type filters
  // rg --type ts → zoekt: "file:\.ts$"
  if (options.fileType) {
    zoektQuery = `file:\\.${options.fileType}$ ${zoektQuery}`;
  }

  // Handle path filters
  // rg -g "src/**" → zoekt: "file:src/"
  if (options.glob) {
    const pathFilter = globToRegex(options.glob);
    zoektQuery = `file:${pathFilter} ${zoektQuery}`;
  }

  return zoektQuery;
}
```

### Definition of Done (66-2)

- [ ] ZoektProvider implements CodeSearchProvider
- [ ] Query translation works
- [ ] Results normalized to SearchResult format
- [ ] 6+ unit tests passing
- [ ] Feature flag SEARCH_ZOEKT controls enable/disable

---

## Phase 67-1: Integration & Testing (4h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T3.1 | Provider selection logic | 1.5h | @dev |
| T3.2 | Integration tests | 1.5h | @dev |
| T3.3 | Performance benchmarking | 1h | @dev |
| **Total** | | **4h** | |

### Provider Selection Logic

```typescript
// src/search/search-orchestrator.ts

export class SearchOrchestrator {
  private providers: Map<string, CodeSearchProvider>;

  /**
   * Select best provider based on codebase size and query type.
   *
   * Selection logic:
   * 1. If SEARCH_ZOEKT enabled AND index exists → ZoektProvider
   * 2. If SEARCH_AST_GREP enabled AND structural query → AstGrepProvider
   * 3. Default → RgProvider
   *
   * Fallback chain: Zoekt → ast-grep → ripgrep
   */
  selectProvider(options: SearchOptions): CodeSearchProvider;

  /**
   * Execute search with automatic fallback.
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const provider = this.selectProvider(options);

    try {
      return await provider.search(options);
    } catch (error) {
      // Fallback to next provider
      return this.searchWithFallback(options, provider.name);
    }
  }
}
```

### Performance Benchmark (CEO Queries on BFlow)

| # | Query | RgProvider P95 | ZoektProvider P95 | Improvement |
|---|-------|----------------|-------------------|-------------|
| 1 | Auth entrypoints | TBD | TBD | TBD |
| 2 | DTO mapping | TBD | TBD | TBD |
| 3 | Test coverage | TBD | TBD | TBD |
| 4 | Prisma queries | TBD | TBD | TBD |
| 5 | Unused exports | TBD | TBD | TBD |

**Target:** ZoektProvider P95 < 500ms on 1M LOC

### Definition of Done (67-1)

- [ ] Provider selection logic implemented
- [ ] Fallback chain works
- [ ] Integration tests pass
- [ ] Performance benchmark completed
- [ ] ZoektProvider P95 < 500ms on 1M LOC

---

## Files to Create (If Proceeding)

```
src/search/providers/
├── zoekt/
│   ├── index.ts                      # Barrel export
│   ├── zoekt-provider.ts             # ZoektProvider implementation
│   ├── index-manager.ts              # Index create/update/rebuild
│   ├── query-translator.ts           # rg → zoekt query translation
│   └── __tests__/
│       ├── zoekt-provider.test.ts    # 6+ tests
│       └── index-manager.test.ts     # 4+ tests

src/search/
├── search-orchestrator.ts            # Provider selection + fallback

scripts/
├── install-zoekt.sh                  # Zoekt installation script
├── benchmark-search.sh               # BFlow benchmark runner
└── zoekt-index.sh                    # Index management CLI
```

---

## Skip Criteria (If Not Proceeding)

If decision gate fails (ripgrep P95 ≤ 2000ms):

1. **Update CURRENT-SPRINT.md**
   ```markdown
   ## Sprint 66-67: SKIPPED
   **Reason:** ripgrep P95 = Xms (≤ 2000ms threshold)
   **Action:** Proceed to Sprint 68 (v1.8 Compliance)
   ```

2. **Mark ZoektProvider as DEFERRED**
   ```typescript
   // src/config/feature-flags.ts
   SEARCH_ZOEKT: false,  // DEFERRED - ripgrep sufficient for current scale
   ```

3. **Document Decision**
   ```markdown
   # ADR-015: Zoekt Deferred

   ## Context
   Benchmark results showed ripgrep P95 = Xms on BFlow (1M LOC),
   which is below the 2000ms threshold.

   ## Decision
   Defer ZoektProvider to future sprint when codebase exceeds 2M LOC.

   ## Consequences
   - Continue using RgProvider as primary search
   - Monitor search latency in production
   - Re-evaluate when search latency exceeds 2s
   ```

---

## Success Metrics (If Proceeding)

| Metric | Target |
|--------|--------|
| ZoektProvider P95 | < 500ms on 1M LOC |
| Index creation | < 5 minutes for 1M LOC |
| Index update (incremental) | < 30 seconds |
| Fallback reliability | 100% |
| New tests | 10+ tests |

---

## Related Documents

| Document | Location |
|----------|----------|
| Sprint 63 Plan | `docs/04-build/sprints/sprint-63-code-search-foundation.md` |
| Sprint 64 Plan | `docs/04-build/sprints/sprint-64-retrieval-intelligence.md` |
| Sprint 65 Plan | `docs/04-build/sprints/sprint-65-context-anchoring.md` |
| TS-007 | `docs/02-design/14-Technical-Specs/TS-007-Code-Search-Layer.md` |
| Master Plan | `docs/00-foundation/master-plan.md` |

---

*Sprint 66-67 | Search Scale-Up | CONDITIONAL*
*Master Plan v4.2 | SDLC Framework v6.1.1*
