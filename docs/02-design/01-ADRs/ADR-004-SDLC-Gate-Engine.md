# ADR-004: SDLC Gate Engine

**Status:** Proposed
**Date:** 2026-02-22
**Author:** Architect
**SDLC Stage:** 02-DESIGN

---

## Context

EndiorBot requires automated gate evaluation to reduce manual SDLC compliance tracking. The gate engine must support all gates defined in SDLC Framework v6.1.1:
- G0: Idea Validation
- G0.1: Scope Lock
- G1: Requirements Sign-off
- G2: Design Approval
- G3: Build Complete
- G4: Release Ready
- G-Sprint: Sprint Close

---

## Decision

Implement a rule-based gate evaluation engine with:
1. Tier-specific checklists (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)
2. Auto-checkable items (file existence, test coverage, etc.)
3. Manual-check items (CEO approval required)
4. Evidence collection and storage
5. Vibecoding Index integration

---

## Design

### Gate Evaluation Algorithm

```typescript
interface GateEvaluation {
  gateId: 'G0' | 'G0.1' | 'G1' | 'G2' | 'G3' | 'G4' | 'G-Sprint';
  featureId: string;
  projectId: string;
  tier: 'LITE' | 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE';

  checklist: ChecklistItem[];
  evidence: Evidence[];
  vibecodingIndex: VibecodingResult;

  result: 'PASS' | 'FAIL' | 'PENDING';
  evaluatedAt: Date;
  evaluatedBy: 'auto' | 'ceo';

  manualOverride?: {
    reason: string;
    approvedBy: string;
    timestamp: Date;
  };
}

interface ChecklistItem {
  id: string;
  description: string;
  required: boolean;
  autoCheck: boolean;
  status: 'pass' | 'fail' | 'manual' | 'pending';
  evidence?: string;
}

interface Evidence {
  type: 'file' | 'commit' | 'test_result' | 'screenshot' | 'document';
  path: string;
  hash: string;  // SHA256 for integrity
  description: string;
  collectedAt: Date;
}
```

### Checklist by Gate

| Gate | Auto-Check Items | Manual Items |
|------|------------------|--------------|
| G0 | None | Problem statement exists |
| G0.1 | Scope document exists | CEO scope approval |
| G1 | Requirements.md exists | Stakeholder sign-off |
| G2 | ADR exists, API spec exists | Design review passed |
| G3 | Build passes, tests pass, coverage > 80% | Code review complete |
| G4 | All G3 + deployment ready | CEO release approval |

### Vibecoding Index Integration

```typescript
interface VibecodingResult {
  score: number;  // 0-100
  zone: 'green' | 'yellow' | 'orange' | 'red';
  signals: {
    name: string;
    value: number;
    weight: number;
    threshold: number;
    passed: boolean;
  }[];
}

// Zone definitions
// Green:  0-30  - Ship with confidence
// Yellow: 31-60 - Review recommended
// Orange: 61-80 - Significant review required
// Red:    81-100 - Block until fixed
```

### Evidence Storage

```
~/.endiorbot/evidence/
├── {projectId}/
│   ├── G0/
│   │   ├── manifest.json
│   │   └── {evidence files}
│   ├── G2/
│   │   ├── manifest.json
│   │   ├── ADR-001.md.sha256
│   │   └── api-spec.md.sha256
│   └── G3/
│       ├── manifest.json
│       ├── build-log.txt
│       └── test-results.json
```

---

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Manual tracking | No implementation | Time-consuming, error-prone | ❌ Reject |
| External tool (Jira) | Rich features | Overkill, requires sync | ❌ Reject |
| Database-backed | Flexible queries | Heavy infrastructure | ❌ Reject |
| File-based engine | Lightweight, portable | Limited querying | ✅ Selected |

---

## Consequences

### Positive
- Automated gate compliance checking
- Evidence audit trail
- Reduced manual tracking effort
- Consistent evaluation across projects

### Negative
- File-based storage limits complex queries
- Manual items still require CEO action
- Evidence storage grows over time (mitigated by retention policy)

### Risks
- Checklist drift from framework updates (mitigate: version check)
- Evidence corruption (mitigate: hash verification)

---

## Implementation Plan

| Sprint | Task |
|--------|------|
| 31 | Core gate engine, G0-G2 support |
| 32 | G3-G4 support, evidence collection |
| 32 | Vibecoding integration |

---

## References

- [SDLC Framework v6.1.1](/.sdlc-framework)
- [Requirements: FR-003](../../../01-planning/requirements.md)

---

*SDLC Framework v6.1.1 - Stage 02: Design*
