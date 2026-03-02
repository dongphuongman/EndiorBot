# ADR-015: Retrieval Explainability & Evidence

---
**Status**: PROPOSED
**Date**: 2026-03-01
**Author**: CTO + Architect
**Sprint**: 65+ (Context Anchoring & Beyond)
**Authority**: Master Plan v4.2, Research "Autonomous SDLC Agent"
**Supersedes**: None
**Related**: ADR-014 (Code Search Layer), TS-007

---

## Context

Research report "Nâng cấp EndiorBot thành Autonomous SDLC Agent" identifies **explainability** and **evidence logging** as critical for:

1. **Anti-hallucination**: Proof of what context the agent relied on
2. **AER calculation**: Autonomy Efficiency Ratio metrics (TCR, RR, Cost)
3. **Debug capability**: CEO can trace why agent made decisions
4. **Spec Snapshot integration**: Use snapshot sources to boost retrieval relevance

Current state (Sprint 63-64):
- ✅ RgProvider and AstGrepProvider implemented
- ✅ Basic ranking with `ranking_reason: string`
- ⚠️ Only human-readable output (`SESSION-PROGRESS.md`)
- ❌ No machine-readable audit trail for AER metrics
- ⚠️ Ranking reasons are free-text, not contract-based

**Problem**: CEO tool identity requires observability without over-engineering.

---

## Decision

Implement **dual-output retrieval logging** with **typed ranking reasons** for Sprint 65+:

### 1. Dual-Output Logger (Human + Machine)

```typescript
// Outputs
Human:   SESSION-PROGRESS.md  (existing, enhanced)
Machine: retrieval-log.jsonl   (NEW)
```

**Why both?**
- Human: CEO reads during/after session
- Machine: AER metrics, debug, replay

### 2. Typed Ranking Reason Enum

```typescript
enum RankingReason {
  // Existing (Sprint 63-64)
  EXACT_SYMBOL_MATCH = 'exact_symbol_match',
  SPEC_SNAPSHOT_MATCH = 'spec_snapshot_match',
  EXACT_MATCH = 'exact_match',
  REGEX_MATCH = 'regex_match',
  STRUCTURAL_MATCH = 'structural_match',
  DEFAULT = 'default',

  // NEW (Sprint 65+)
  STAGE_BOOST = 'stage_boost',           // Stage-specific relevance
  ROLE_BOOST = 'role_boost',             // Role-specific relevance
  RECENCY_BOOST = 'recency_boost',       // Git blame/mtime
  AST_STRUCTURAL_MATCH = 'ast_structural_match',  // AST pattern match
  TRIGRAM_MATCH = 'trigram_match'        // Zoekt indexing (future)
}
```

**Why enum?**
- Contract-based: No free-text drift
- Analyzable: Query logs by reason
- Explainable: CEO understands ranking

### 3. Spec Snapshot Integration

Use `spec_snapshot.yaml` sources to **boost retrieval**, not just detect drift:

```typescript
// If search result path matches snapshot sources → boost ranking
const isSpecSnapshotMatch = specSnapshotSources.some(src =>
  result.path.startsWith(src)
);

if (isSpecSnapshotMatch) {
  result.score += 0.3;  // Boost by 30%
  result.ranking_reason = RankingReason.SPEC_SNAPSHOT_MATCH;
}
```

**Why?**
- Gate A/B: Restrict scope during planning/limited writes
- Relevance: Specs are high-signal for design/build stages
- Drift detection: Still works (hash mismatch → pause)

---

## Implementation

### Phase 1: Enhanced Types (Sprint 65 - Week 1)

Update `src/search/types.ts`:

```typescript
// Add new enum values
export enum RankingReason {
  EXACT_SYMBOL_MATCH = 'exact_symbol_match',
  SPEC_SNAPSHOT_MATCH = 'spec_snapshot_match',
  EXACT_MATCH = 'exact_match',
  REGEX_MATCH = 'regex_match',
  STRUCTURAL_MATCH = 'structural_match',
  STAGE_BOOST = 'stage_boost',           // NEW
  ROLE_BOOST = 'role_boost',             // NEW
  RECENCY_BOOST = 'recency_boost',       // NEW
  AST_STRUCTURAL_MATCH = 'ast_structural_match',  // NEW
  TRIGRAM_MATCH = 'trigram_match',       // NEW
  DEFAULT = 'default'
}

// SearchResult now uses enum, not string
export interface SearchResult {
  path: string;
  line: number;
  column: number;
  content: string;
  score: number;
  ranking_reason: RankingReason[];  // Array: multiple reasons possible
  provider: ProviderName;
  specSnapshotMatch: boolean;
  astKind?: AstNodeKind;
}
```

**Change**: `ranking_reason` is now `RankingReason[]` (array) because results can match multiple criteria.

### Phase 2: Dual-Output Logger (Sprint 65 - Week 1)

Create `src/search/retrieval-logger.ts`:

```typescript
/**
 * Dual-output retrieval logger.
 * Human: SESSION-PROGRESS.md
 * Machine: retrieval-log.jsonl
 */
export class RetrievalLogger {
  private humanLog: string;   // SESSION-PROGRESS.md path
  private machineLog: string; // retrieval-log.jsonl path

  constructor(sessionId: string) {
    this.humanLog = `SESSION-PROGRESS.md`;
    this.machineLog = `.endiorbot/sessions/${sessionId}/retrieval-log.jsonl`;
  }

  async log(evidence: RetrievalEvidence): Promise<void> {
    // 1. Human-readable (Markdown)
    const humanEntry = this.formatHuman(evidence);
    await appendFile(this.humanLog, humanEntry);

    // 2. Machine-readable (JSONL)
    const machineEntry = this.formatMachine(evidence);
    await appendFile(this.machineLog, machineEntry + '\n');
  }

  private formatHuman(evidence: RetrievalEvidence): string {
    // Existing formatRetrievalEvidence() logic
    return formatRetrievalEvidence(evidence);
  }

  private formatMachine(evidence: RetrievalEvidence): string {
    // JSONL: one line per search
    return JSON.stringify({
      ts: evidence.timestamp,
      query: evidence.query,
      stage: evidence.context?.stage,
      role: evidence.context?.role,
      provider: evidence.provider,
      providerVersion: evidence.providerVersion,
      elapsed_ms: evidence.elapsed_ms,
      topK: evidence.topKReturned,
      totalHits: evidence.totalHits,
      truncated: evidence.truncated,
      tokensUsed: evidence.tokensUsed,
      hits: evidence.results.map(r => ({
        path: r.path,
        line: r.line,
        score: r.score,  // ADD score to evidence
        reasons: r.ranking_reason,  // Now array
        specMatch: r.specSnapshotMatch
      }))
    });
  }
}
```

### Phase 3: Spec Snapshot Boosting (Sprint 65 - Week 2)

Update `src/search/retrieval-policy.ts`:

```typescript
/**
 * Boost results that match spec snapshot sources.
 */
function applySpecSnapshotBoost(
  results: SearchResult[],
  specSnapshot: SpecSnapshot | null
): SearchResult[] {
  if (!specSnapshot) return results;

  const sources = specSnapshot.sources || [];

  return results.map(result => {
    const isMatch = sources.some(src => result.path.startsWith(src));

    if (isMatch) {
      return {
        ...result,
        score: result.score + 0.3,  // 30% boost
        ranking_reason: [
          ...result.ranking_reason,
          RankingReason.SPEC_SNAPSHOT_MATCH
        ],
        specSnapshotMatch: true
      };
    }

    return result;
  });
}
```

### Phase 4: Stage/Role Boosting (Sprint 65 - Week 2)

```typescript
/**
 * Boost results based on SDLC stage and agent role.
 *
 * Examples:
 * - Stage 02 (Design) + @architect → boost docs/02-design/**
 * - Stage 04 (Build) + @coder → boost src/**
 * - Stage 05 (Test) + @tester → boost tests/**
 */
function applyStageRoleBoost(
  results: SearchResult[],
  stage?: string,
  role?: string
): SearchResult[] {
  const stageBoosts: Record<string, string[]> = {
    '01-planning': ['docs/01-planning/**', 'requirements.md'],
    '02-design': ['docs/02-design/**', '*.md'],
    '04-build': ['src/**', 'lib/**'],
    '05-test': ['tests/**', '**/*.test.ts', '**/*.spec.ts']
  };

  const roleBoosts: Record<string, string[]> = {
    '@architect': ['docs/02-design/**', 'ADR-*.md'],
    '@coder': ['src/**', 'lib/**'],
    '@reviewer': ['src/**', 'tests/**'],
    '@tester': ['tests/**']
  };

  return results.map(result => {
    const reasons: RankingReason[] = [...result.ranking_reason];
    let boost = 0;

    // Stage boost
    if (stage && stageBoosts[stage]) {
      const patterns = stageBoosts[stage];
      if (patterns.some(p => minimatch(result.path, p))) {
        boost += 0.2;
        reasons.push(RankingReason.STAGE_BOOST);
      }
    }

    // Role boost
    if (role && roleBoosts[role]) {
      const patterns = roleBoosts[role];
      if (patterns.some(p => minimatch(result.path, p))) {
        boost += 0.15;
        reasons.push(RankingReason.ROLE_BOOST);
      }
    }

    return {
      ...result,
      score: result.score + boost,
      ranking_reason: reasons
    };
  });
}
```

---

## Consequences

### Positive

✅ **Anti-hallucination**: Machine-readable evidence trail
✅ **Observability**: CEO can query `retrieval-log.jsonl` for analytics
✅ **AER metrics**: TCR, RR, Cost per task calculable from logs
✅ **Explainability**: Typed reasons → understandable ranking
✅ **Spec-aware retrieval**: Snapshot integration boosts relevance
✅ **Stage/role context**: Smart filtering without over-complexity

### Negative

⚠️ **Storage**: JSONL logs grow over time → need rotation policy
⚠️ **Parsing cost**: CEO must parse JSONL for analytics (but one-time)
⚠️ **Enum maintenance**: New ranking reasons require enum updates

### Mitigations

- **Log rotation**: `.endiorbot/sessions/{sessionId}/retrieval-log.jsonl` (per-session, auto-archive)
- **Analytics CLI**: `endiorbot analytics aer` to parse logs (future)
- **Enum versioning**: Document reason code changes in ADR amendments

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Evidence completeness | 100% of searches logged | JSONL entry count = search count |
| Reason code coverage | >90% non-DEFAULT | Query `retrieval-log.jsonl` by reason |
| Spec boost impact | +20% relevance for design stage | A/B test ranking quality |
| CEO debug time | <5min to trace decision | Time to find relevant log entry |

---

## References

- Research: "Nâng cấp EndiorBot thành Autonomous SDLC Agent" (PDF)
- Master Plan v4.2: Sprint 65 Context Anchoring
- ADR-014: Code Search Layer
- TS-007: Code Search Layer Technical Spec
- ADR-011: Spec Snapshot & Drift Policy

---

## Amendments

None yet.

---

*ADR-015: Retrieval Explainability & Evidence*
*SDLC Framework v6.1.1 compliant*
*CEO Tool - No Over-Engineering*
