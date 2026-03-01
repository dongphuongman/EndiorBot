# TS-007: Code Search Layer Technical Specification

---
spec_id: TS-007
spec_name: "Code Search Layer"
spec_version: "1.0.0"
status: draft
tier: ALL
stage: "02"
category: technical
owner: "@architect"
created: 2026-03-01
last_updated: 2026-03-01
related_adrs: ["ADR-014"]
related_specs: ["TS-003"]
---

| Metadata | Value |
|----------|-------|
| **Status** | Draft - Pending CTO Approval |
| **Date** | 2026-03-01 |
| **Authors** | @architect |
| **Reviewers** | @cto, @ceo |
| **Sprint** | 63-64 |
| **Master Plan** | v4.2 |

## 1. Overview

### 1.1 Purpose

The Code Search Layer enables EndiorBot to find relevant code in 100K+ LOC repositories and inject it as context before AI model calls, eliminating "Semantic Blindness" where AI cannot locate relevant code for context.

### 1.2 Problem Statement

```
POST-MVP: EndiorBot CLI works, but CEO identifies TWO critical issues:

1. CONTEXT DRIFT (Trôi ngữ cảnh) - Solved in Sprint 65
   - AI forgets Sprint Goals after 50-100K tokens

2. SEMANTIC BLINDNESS (Mù ngữ nghĩa) - Solved in Sprint 63-64 ✓
   - No codebase awareness in 100K+ LOC repos
   - AI cannot find relevant code for context
   - Manual file reading is slow and incomplete
```

### 1.3 Goals

| Goal | Target | Sprint |
|------|--------|--------|
| Search latency (100K LOC) | < 500ms | 63 |
| Token budget | ≤ 2500 hard cap | 63 |
| Stage-aware filtering | 60% noise reduction | 64 |
| AST-aware search | Structural queries | 64 |

## 2. Architecture

### 2.1 Component Diagram

```
                              ┌─────────────────────────┐
                              │    Context Injector     │
                              │    (EXISTING)           │
                              └───────────┬─────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼───────┐     ┌───────▼───────┐     ┌───────▼───────┐
            │  Brain L1-L4  │     │  Code Search  │     │   Context     │
            │  (EXISTING)   │     │  Layer (NEW)  │     │  Anchoring    │
            └───────────────┘     └───────┬───────┘     │  (Sprint 65)  │
                                          │             └───────────────┘
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼───────┐     ┌───────▼───────┐     ┌───────▼───────┐
            │ RgProvider    │     │ AstGrepProv.  │     │ ZoektProvider │
            │ (Sprint 63)   │     │ (Sprint 64)   │     │ (Sprint 66-67)│
            └───────────────┘     └───────────────┘     └───────────────┘
```

### 2.2 3-Tier Provider Strategy

| Tier | Provider | Infrastructure | Target Codebase | Sprint |
|------|----------|----------------|-----------------|--------|
| A | **ripgrep** | Zero (CLI) | < 100K LOC | 63 |
| B | **ast-grep** | npm package | < 500K LOC | 64 |
| C | **Zoekt** | Go binary + index | 1M+ LOC | 66-67 |

**Decision Gate for Zoekt:**
```
IF ripgrep P95 > 2000ms on BFlow benchmark (1M LOC, 5 CEO queries):
  → Proceed with ZoektProvider
ELSE:
  → Skip, mark as deferred
```

## 3. Data Structures

### 3.1 SearchResult

```typescript
export interface SearchResult {
  // Core match data
  path: string;                // Relative file path
  line: number;                // 1-indexed line number
  column: number;              // 1-indexed column
  content: string;             // Matched line content
  contextBefore: string[];     // Lines before match (configurable)
  contextAfter: string[];      // Lines after match (configurable)

  // Ranking metadata (required for retrieval logging)
  score: number;               // 0-100 relevance score
  ranking_reason: string;      // "spec_snapshot_match" | "stage_boost" | "recency"

  // Provider metadata (anti-hallucination)
  provider: string;            // "ripgrep" | "ast-grep" | "zoekt"
  specSnapshotMatch: boolean;  // true if file in spec_snapshot.sources

  // AST metadata (only from AstGrepProvider)
  astKind?: string;            // "function_declaration" | "class_declaration"
}
```

### 3.2 SearchResponse (with CTO Amendment A1)

```typescript
export interface SearchResponse {
  // Results
  hits: SearchResult[];        // Matched results
  totalHits: number;           // Total before truncation
  truncated: boolean;          // true if results were cut

  // Performance
  elapsed_ms: number;          // Search duration

  // Provider info (CTO A1)
  provider: string;            // Provider name
  providerVersion: string;     // 🆕 e.g., "ripgrep 14.1.0"

  // Budget
  tokensUsed: number;          // Estimated tokens consumed
}
```

### 3.3 SearchOptions

```typescript
export interface SearchOptions {
  // Query
  query: string;               // Search pattern (regex supported)
  structural?: boolean;        // Force ast-grep for structural search

  // Limits
  topK: number;                // Max results (default: 15)
  maxBytes: number;            // Max total bytes (default: 50KB)
  timeout: number;             // Timeout in ms (default: 5000)

  // Filtering
  stage?: string;              // SDLC stage filter
  role?: string;               // Agent role filter
  includePatterns?: string[];  // Glob patterns to include
  excludePatterns?: string[];  // Glob patterns to exclude
}
```

### 3.4 Search Budget (with CTO Amendment A3)

```typescript
export const SEARCH_BUDGET = {
  // Defaults
  DEFAULT_TOP_K: 15,
  DEFAULT_MAX_BYTES: 50_000,        // 50KB total
  DEFAULT_TIMEOUT_MS: 5_000,

  // CTO Amendments
  MAX_BYTES_PER_RESULT: 500,        // 🆕 A3: per-result byte limit
  TOKEN_LIMIT: 2_000,               // Soft limit
  HARD_CAP_TOKENS: 2_500,           // 🆕 A3: Never exceed

  // Context
  CONTEXT_LINES_BEFORE: 2,
  CONTEXT_LINES_AFTER: 2,
} as const;
```

## 4. CodeSearchProvider Interface

### 4.1 Abstract Interface

```typescript
export abstract class CodeSearchProvider {
  abstract readonly name: string;
  abstract readonly version: string;

  /**
   * Check if provider is available and healthy
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Search codebase with options
   * CTO A2: MUST NOT throw - return empty response on error
   */
  abstract search(options: SearchOptions): Promise<SearchResponse>;

  /**
   * Stream search results for large codebases
   */
  abstract searchStream(
    options: SearchOptions
  ): AsyncGenerator<SearchResult, void, unknown>;

  /**
   * Get provider version info
   */
  abstract getVersion(): Promise<string>;
}
```

### 4.2 RgProvider Implementation

```typescript
export class RgProvider extends CodeSearchProvider {
  readonly name = "ripgrep";
  private _version: string | null = null;

  async isAvailable(): Promise<boolean> {
    try {
      const result = await execAsync("rg --version");
      this._version = result.stdout.trim().split("\n")[0];
      return true;
    } catch {
      return false;
    }
  }

  // CTO A2: MUST NOT throw - return empty on error
  async search(options: SearchOptions): Promise<SearchResponse> {
    const start = Date.now();
    try {
      // Build rg command with --json output
      const args = this.buildArgs(options);
      const result = await execAsync(`rg ${args.join(" ")}`);
      const hits = this.parseJsonOutput(result.stdout);

      return {
        hits: this.applyBudget(hits, options),
        totalHits: hits.length,
        truncated: hits.length > options.topK,
        elapsed_ms: Date.now() - start,
        provider: this.name,
        providerVersion: this._version ?? "unknown",
        tokensUsed: this.estimateTokens(hits),
      };
    } catch (error) {
      // CTO A2: Log and return empty
      this.logger.warn("RgProvider search failed", {
        query: options.query,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.emptyResponse(Date.now() - start);
    }
  }

  private emptyResponse(elapsed_ms: number): SearchResponse {
    return {
      hits: [],
      totalHits: 0,
      truncated: false,
      elapsed_ms,
      provider: this.name,
      providerVersion: this._version ?? "unknown",
      tokensUsed: 0,
    };
  }
}
```

### 4.3 AstGrepProvider Stub (Sprint 63)

```typescript
export class AstGrepProvider extends CodeSearchProvider {
  readonly name = "ast-grep";
  private _version: string | null = null;

  async isAvailable(): Promise<boolean> {
    // Check feature flag first
    if (!FEATURE_FLAGS.SEARCH_AST_GREP) {
      return false;
    }
    // Check if @ast-grep/napi is installed
    try {
      await import("@ast-grep/napi");
      return true;
    } catch {
      return false;
    }
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    // Sprint 63: Stub implementation - fall back to ripgrep
    this.logger.info("AstGrepProvider: Using RgProvider fallback (stub mode)");
    const rgProvider = new RgProvider();
    return rgProvider.search(options);
  }
}
```

## 5. Feature Flags

### 5.1 Flag Definitions

```typescript
// src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  // Code Search Layer (Sprint 63+)
  SEARCH_ENABLED: true,           // Master switch for search
  SEARCH_AST_GREP: false,         // Enable ast-grep (Sprint 64)
  SEARCH_ZOEKT: false,            // Enable Zoekt (Sprint 66-67)

  // Context Anchoring (Sprint 65)
  CONTEXT_ANCHORING: false,       // Enable context anchoring

  // Observability
  RETRIEVAL_LOGGER: true,         // Log search evidence
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}
```

### 5.2 Flag Usage

```typescript
// In RgProvider
if (!isFeatureEnabled("SEARCH_ENABLED")) {
  throw new Error("Code search is disabled");
}

// In AstGrepProvider
if (!isFeatureEnabled("SEARCH_AST_GREP")) {
  return false; // Provider not available
}
```

## 6. Retrieval Policy

### 6.1 Stage-Aware Filtering

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

### 6.2 Role-Aware Filtering

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

## 7. Retrieval Logger

### 7.1 Evidence Pack Structure

```typescript
interface RetrievalEvidence {
  timestamp: string;
  query: string;
  provider: "ripgrep" | "ast-grep" | "zoekt";
  elapsed_ms: number;
  totalHits: number;
  topKReturned: number;
  truncated: boolean;
  tokensUsed: number;
  stage?: string;
  role?: string;
  results: {
    path: string;
    line: number;
    ranking_reason: string;
    specSnapshotMatch: boolean;
    sourceExcerpt: string;
  }[];
}
```

### 7.2 Logging to SESSION-PROGRESS.md

```typescript
export class RetrievalLogger {
  async logEvidence(evidence: RetrievalEvidence): Promise<void> {
    if (!isFeatureEnabled("RETRIEVAL_LOGGER")) {
      return;
    }

    const entry = this.formatEvidence(evidence);
    await this.appendToProgress(entry);
  }

  private formatEvidence(evidence: RetrievalEvidence): string {
    return `
## Search Evidence [${evidence.timestamp}]

**Query:** \`${evidence.query}\`
**Provider:** ${evidence.provider} (${evidence.elapsed_ms}ms)
**Results:** ${evidence.topKReturned}/${evidence.totalHits} (${evidence.truncated ? "truncated" : "complete"})
**Tokens:** ${evidence.tokensUsed}

| File | Line | Reason | Spec Match |
|------|------|--------|------------|
${evidence.results.map(r =>
  `| ${r.path} | ${r.line} | ${r.ranking_reason} | ${r.specSnapshotMatch ? "✓" : ""} |`
).join("\n")}
`;
  }
}
```

## 8. Context Injector Integration

### 8.1 Extended ContextSource Enum

```typescript
// src/agents/context/types.ts
export type ContextSource =
  | "project"      // Project files (CLAUDE.md, IDENTITY.md)
  | "brain"        // Brain L1-L4 layers
  | "history"      // Conversation history
  | "search"       // 🆕 Code search results
  | "anchor";      // 🆕 Context anchors (Sprint 65)
```

### 8.2 loadCodebaseContext Method

```typescript
// src/agents/context/context-injector.ts
export class ContextInjector {
  async loadCodebaseContext(options: {
    query: string;
    stage?: string;
    role?: string;
  }): Promise<ContextChunk[]> {
    if (!isFeatureEnabled("SEARCH_ENABLED")) {
      return [];
    }

    const provider = await this.selectProvider();
    const searchOptions = this.buildSearchOptions(options);
    const response = await provider.search(searchOptions);

    // Log evidence
    await this.retrievalLogger.logEvidence({
      timestamp: new Date().toISOString(),
      query: options.query,
      provider: response.provider as any,
      elapsed_ms: response.elapsed_ms,
      totalHits: response.totalHits,
      topKReturned: response.hits.length,
      truncated: response.truncated,
      tokensUsed: response.tokensUsed,
      stage: options.stage,
      role: options.role,
      results: response.hits.map(h => ({
        path: h.path,
        line: h.line,
        ranking_reason: h.ranking_reason,
        specSnapshotMatch: h.specSnapshotMatch,
        sourceExcerpt: h.content.slice(0, 100),
      })),
    });

    return this.convertToChunks(response.hits);
  }
}
```

## 9. CLI Command

### 9.1 Command Definition

```bash
endiorbot context search <query> [options]

Options:
  --type <ext>     File type filter (ts, md, json)
  --stage <stage>  SDLC stage filter
  --role <role>    Agent role filter
  --top <n>        Max results (default: 15)
  --json           Output as JSON
  --verbose        Show timing and metadata
```

### 9.2 Example Usage

```bash
# Search for function definitions
endiorbot context search "async function" --type ts --top 10

# Stage-aware search
endiorbot context search "gate" --stage 04-BUILD

# Role-aware search
endiorbot context search "test" --role @coder --verbose
```

## 10. Testing Strategy

### 10.1 Unit Tests (Sprint 63)

| Test | Description | File |
|------|-------------|------|
| RgProvider.isAvailable | Check rg installation | rg-provider.test.ts |
| RgProvider.search | Basic search | rg-provider.test.ts |
| RgProvider.search error | Return empty on error (A2) | rg-provider.test.ts |
| SearchResponse.providerVersion | Version populated (A1) | types.test.ts |
| SEARCH_BUDGET.HARD_CAP | Enforce 2500 limit (A3) | search-budget.test.ts |
| FeatureFlags | All flags defined | feature-flags.test.ts |
| AstGrepProvider.stub | Fallback to rg | ast-grep-provider.test.ts |

### 10.2 Integration Tests (Sprint 63)

| Test | Description |
|------|-------------|
| ContextInjector.loadCodebaseContext | Search + inject |
| RetrievalLogger.logEvidence | Write to SESSION-PROGRESS |
| CLI search command | End-to-end search |

### 10.3 Performance Benchmarks

| Benchmark | Target | Measurement |
|-----------|--------|-------------|
| EndiorBot search | < 500ms | E2E timing |
| 100K LOC search | < 500ms | BFlow benchmark |
| 1M LOC search | < 2000ms | Zoekt gate |

## 11. Rollout Plan

### 11.1 Sprint 63 (Foundation)

- [x] Feature flags infrastructure
- [ ] RgProvider implementation
- [ ] AstGrepProvider stub
- [ ] Context Injector wiring
- [ ] Retrieval Logger
- [ ] CLI search command
- [ ] 15+ tests

### 11.2 Sprint 64 (Intelligence)

- [ ] Full AstGrepProvider
- [ ] Stage-aware filtering
- [ ] Role-aware filtering
- [ ] CEO benchmark (5 scenarios)

### 11.3 Sprint 66-67 (Scale)

- [ ] ZoektProvider (if gate passed)
- [ ] Index management
- [ ] Provider selection logic

## 12. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ripgrep not installed | Low | High | Auto-install script, grep fallback |
| Large file timeout | Medium | Medium | Streaming, result limits |
| Token overflow | Medium | Low | Hard cap at 2500 |
| AST-grep learning curve | Medium | Low | Fallback to ripgrep |

## 13. Related Documents

| Document | Status |
|----------|--------|
| Master Plan v4.2 | ✅ Approved |
| ADR-014: Code Search Layer | ⏳ Pending |
| Sprint 63 Plan | ✅ Approved |
| TP-063: Code Search Tests | ⏳ Pending |

---

*TS-007: Code Search Layer | Version 1.0.0*
*Sprint 63-64 | SDLC Framework v6.1.1 | 2026-03-01*
