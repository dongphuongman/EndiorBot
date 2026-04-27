# Sprint 68: v1.8 Compliance

| Metadata | Value |
|----------|-------|
| **Sprint** | 68 |
| **Duration** | 40 hours |
| **Status** | 📋 PLANNED |
| **Start Date** | TBD (After Sprint 65 or 66-67) |
| **End Date** | TBD |
| **Prerequisites** | Sprint 65 Complete (66-67 conditional) |
| **Master Plan Version** | v4.2 |
| **Release** | v1.8 |

## Sprint Identity

```
Enterprise-grade SDLC compliance with Stage Contracts and PatchManager.
Enable autonomous 2h sessions with full audit trail.

GOAL: Enforce SDLC artifacts per stage
APPROACH: Stage Contracts + PatchManager + Compliance Dashboard
OUTPUT: v1.8 with enterprise compliance features
```

## Dependencies

| Dependency | From | Status |
|------------|------|--------|
| Context Anchoring | Sprint 65 | ⏳ |
| Code Search Layer | Sprint 63-64 | ⏳ |
| Retrieval Logger | Sprint 63 | ⏳ |
| Feature Flags | Sprint 63 | ⏳ |

---

## Sprint Breakdown

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **68-1** | Stage Contracts | 12h | ⏳ |
| **68-2** | PatchManager | 10h | ⏳ |
| **68-3** | Compliance Dashboard | 10h | ⏳ |
| **68-4** | Integration & Testing | 8h | ⏳ |

---

## Phase 68-1: Stage Contracts (12h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T1.1 | Define StageContract types | 1.5h | @dev |
| T1.2 | Implement StageContractEngine | 3h | @dev |
| T1.3 | Default contracts for all 10 stages | 2h | @dev |
| T1.4 | Contract evaluation logic | 2h | @dev |
| T1.5 | Integration with Gate Engine | 2h | @dev |
| T1.6 | Unit tests (8+ tests) | 1.5h | @dev |
| **Total** | | **12h** | |

### Stage Contract Types

```typescript
// src/sdlc/contracts/types.ts

/**
 * Stage contract defines required and produced artifacts per SDLC stage.
 */
export interface StageContract {
  stage: string;              // "00-FOUNDATION", "04-BUILD", etc.
  name: string;               // Human-readable name

  // Required artifacts (input)
  required: ArtifactRequirement[];

  // Produced artifacts (output)
  produces: ArtifactProduction[];

  // Gate associations
  gates: string[];            // ["G2", "G3"]

  // Validation rules
  validation: ValidationRule[];
}

export interface ArtifactRequirement {
  pattern: string;            // Glob pattern: "ADR-*.md"
  description: string;
  optional: boolean;
  minCount: number;           // Minimum files matching pattern
}

export interface ArtifactProduction {
  pattern: string;
  description: string;
  autoCreate: boolean;        // Auto-scaffold if missing
  template?: string;          // Template to use
}

export interface ValidationRule {
  type: "file_exists" | "content_match" | "dependency_check";
  pattern: string;
  message: string;
  severity: "error" | "warning";
}
```

### Default Stage Contracts

```typescript
// src/sdlc/contracts/defaults.ts

export const STAGE_CONTRACTS: Record<string, StageContract> = {
  "00-FOUNDATION": {
    stage: "00-FOUNDATION",
    name: "Foundation",
    required: [],
    produces: [
      { pattern: "CLAUDE.md", description: "Claude integration", autoCreate: true },
      { pattern: "IDENTITY.md", description: "Project identity", autoCreate: true },
    ],
    gates: ["G0"],
    validation: [],
  },

  "01-PLANNING": {
    stage: "01-PLANNING",
    name: "Planning",
    required: [
      { pattern: "IDENTITY.md", description: "Project identity", optional: false, minCount: 1 },
    ],
    produces: [
      { pattern: "docs/01-planning/**/*.md", description: "Planning docs", autoCreate: false },
      { pattern: "docs/01-planning/roadmap.md", description: "Roadmap", autoCreate: true },
    ],
    gates: ["G1"],
    validation: [],
  },

  "02-DESIGN": {
    stage: "02-DESIGN",
    name: "Design",
    required: [
      { pattern: "docs/01-planning/roadmap.md", description: "Roadmap", optional: false, minCount: 1 },
    ],
    produces: [
      { pattern: "docs/02-design/01-ADRs/ADR-*.md", description: "ADRs", autoCreate: false },
      { pattern: "docs/02-design/**/*.proto", description: "Protobuf specs", autoCreate: false },
      { pattern: "docs/02-design/**/*.graphql", description: "GraphQL specs", autoCreate: false },
    ],
    gates: ["G2"],
    validation: [
      { type: "file_exists", pattern: "ADR-*.md", message: "At least one ADR required", severity: "error" },
    ],
  },

  "04-BUILD": {
    stage: "04-BUILD",
    name: "Build",
    required: [
      { pattern: "ADR-*.md", description: "Architecture decisions", optional: false, minCount: 1 },
    ],
    produces: [
      { pattern: "src/**/*.ts", description: "Source code", autoCreate: false },
      { pattern: "src/**/*.tsx", description: "React components", autoCreate: false },
    ],
    gates: ["G3", "G4"],
    validation: [
      { type: "file_exists", pattern: "src/**/*.ts", message: "Source code required", severity: "error" },
    ],
  },

  "05-TEST": {
    stage: "05-TEST",
    name: "Test",
    required: [
      { pattern: "src/**/*.ts", description: "Source code", optional: false, minCount: 1 },
    ],
    produces: [
      { pattern: "tests/**/*.test.ts", description: "Unit tests", autoCreate: false },
      { pattern: "tests/**/*.spec.ts", description: "Spec tests", autoCreate: false },
    ],
    gates: ["G5"],
    validation: [
      { type: "file_exists", pattern: "tests/**/*", message: "Tests required", severity: "error" },
    ],
  },
};
```

### Definition of Done (68-1)

- [ ] StageContract types defined
- [ ] StageContractEngine implemented
- [ ] All 10 SDLC stages have contracts
- [ ] Contract evaluation works
- [ ] Gate Engine integration complete
- [ ] 8+ unit tests passing

---

## Phase 68-2: PatchManager (10h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T2.1 | Define Patch types | 1h | @dev |
| T2.2 | Implement PatchManager | 3h | @dev |
| T2.3 | Change tracking (file diff) | 2h | @dev |
| T2.4 | Rollback functionality | 2h | @dev |
| T2.5 | Patch persistence | 1h | @dev |
| T2.6 | Unit tests (6+ tests) | 1h | @dev |
| **Total** | | **10h** | |

### Patch Types

```typescript
// src/sdlc/patches/types.ts

/**
 * Patch represents a set of file changes.
 */
export interface Patch {
  id: string;
  name: string;
  timestamp: string;
  author: string;              // Agent or user

  // Changes
  changes: FileChange[];

  // Metadata
  sprintId?: string;
  taskId?: string;
  checkpointId?: string;

  // State
  applied: boolean;
  canRollback: boolean;
}

export interface FileChange {
  path: string;
  changeType: "create" | "modify" | "delete" | "rename";

  // Content (for rollback)
  previousContent?: string;
  newContent?: string;

  // Diff
  diffHunks: DiffHunk[];
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  content: string;
}
```

### PatchManager Implementation

```typescript
// src/sdlc/patches/patch-manager.ts

export class PatchManager {
  /**
   * Start tracking changes for a patch.
   */
  async startPatch(name: string): Promise<Patch>;

  /**
   * Record a file change.
   */
  async recordChange(patchId: string, change: FileChange): Promise<void>;

  /**
   * Commit patch (finalize changes).
   */
  async commitPatch(patchId: string): Promise<void>;

  /**
   * Rollback patch (revert all changes).
   */
  async rollbackPatch(patchId: string): Promise<void>;

  /**
   * Get patch history.
   */
  async getHistory(options: PatchHistoryOptions): Promise<Patch[]>;

  /**
   * Get changes for a specific file.
   */
  async getFileHistory(path: string): Promise<FileChange[]>;
}
```

### Definition of Done (68-2)

- [ ] Patch types defined
- [ ] PatchManager implemented
- [ ] Change tracking works
- [ ] Rollback works
- [ ] Patch persistence works
- [ ] 6+ unit tests passing

---

## Phase 68-3: Compliance Dashboard (10h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T3.1 | Dashboard data aggregation | 2h | @dev |
| T3.2 | CLI dashboard view | 3h | @dev |
| T3.3 | Real-time compliance updates | 2h | @dev |
| T3.4 | Compliance report generation | 2h | @dev |
| T3.5 | Unit tests (4+ tests) | 1h | @dev |
| **Total** | | **10h** | |

### Dashboard Views

```typescript
// src/sdlc/dashboard/types.ts

export interface ComplianceDashboard {
  // Overall status
  overallScore: number;       // 0-100
  status: "compliant" | "warning" | "non-compliant";

  // Stage breakdown
  stages: StageCompliance[];

  // Recent activity
  recentPatches: Patch[];
  recentGateChecks: GateResult[];

  // Issues
  issues: ComplianceIssue[];
}

export interface StageCompliance {
  stage: string;
  score: number;
  status: "pass" | "warning" | "fail";
  missingArtifacts: string[];
  issues: ComplianceIssue[];
}

export interface ComplianceIssue {
  stage: string;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}
```

### CLI Dashboard

```bash
# Real-time compliance dashboard
./endiorbot.mjs compliance dashboard

# Output:
# ╔══════════════════════════════════════════════════════════════╗
# ║                    COMPLIANCE DASHBOARD                       ║
# ║                      Score: 92/100                            ║
# ╠══════════════════════════════════════════════════════════════╣
# ║ Stage           │ Score │ Status │ Issues                     ║
# ╠═════════════════╪═══════╪════════╪════════════════════════════╣
# ║ 00-FOUNDATION   │ 100%  │  ✅   │ -                          ║
# ║ 01-PLANNING     │ 100%  │  ✅   │ -                          ║
# ║ 02-DESIGN       │  90%  │  ⚠️   │ Missing: TS-008            ║
# ║ 04-BUILD        │ 100%  │  ✅   │ -                          ║
# ║ 05-TEST         │  75%  │  ⚠️   │ Coverage: 75% (target 80%) ║
# ╚══════════════════════════════════════════════════════════════╝

# Generate compliance report
./endiorbot.mjs compliance report --format markdown > compliance-report.md
```

### Definition of Done (68-3)

- [ ] Dashboard data aggregation works
- [ ] CLI dashboard view renders correctly
- [ ] Real-time updates work
- [ ] Report generation works
- [ ] 4+ unit tests passing

---

## Phase 68-4: Integration & Testing (8h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T4.1 | Integration with existing systems | 2h | @dev |
| T4.2 | E2E tests | 3h | @dev |
| T4.3 | Performance testing | 1.5h | @dev |
| T4.4 | Documentation | 1.5h | @dev |
| **Total** | | **8h** | |

### E2E Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Stage contract violation | Block transition, show missing artifacts |
| 2 | Patch rollback | All changes reverted, system stable |
| 3 | Dashboard refresh | Updates within 1 second |
| 4 | Compliance report | Accurate report generated |
| 5 | Full SDLC flow | All stages pass contracts |

### Definition of Done (68-4)

- [ ] All integrations complete
- [ ] E2E tests pass
- [ ] Performance benchmarks pass
- [ ] Documentation complete

---

## Files to Create

```
src/sdlc/contracts/
├── index.ts                          # Barrel export
├── types.ts                          # StageContract types
├── stage-contract-engine.ts          # Contract evaluation
├── defaults.ts                       # Default contracts
└── __tests__/
    └── stage-contract.test.ts        # 8+ tests

src/sdlc/patches/
├── index.ts                          # Barrel export
├── types.ts                          # Patch types
├── patch-manager.ts                  # Patch operations
└── __tests__/
    └── patch-manager.test.ts         # 6+ tests

src/sdlc/dashboard/
├── index.ts                          # Barrel export
├── types.ts                          # Dashboard types
├── compliance-dashboard.ts           # Dashboard logic
├── report-generator.ts               # Report generation
└── __tests__/
    └── dashboard.test.ts             # 4+ tests

src/cli/commands/
├── compliance.ts                     # MODIFY: Add dashboard, report
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Stage contract coverage | 10/10 stages |
| Patch rollback success | 100% |
| Dashboard latency | < 100ms |
| Report generation | < 2s |
| New tests | 20+ tests |

---

## v1.8 Release Criteria

| Criterion | Status |
|-----------|--------|
| Stage Contracts for all 10 stages | ⏳ |
| PatchManager with rollback | ⏳ |
| Compliance Dashboard | ⏳ |
| Report generation | ⏳ |
| All E2E tests pass | ⏳ |
| Documentation complete | ⏳ |

---

## Related Documents

| Document | Location |
|----------|----------|
| Sprint 63 Plan | `docs/04-build/sprints/sprint-63-code-search-foundation.md` |
| Sprint 64 Plan | `docs/04-build/sprints/sprint-64-retrieval-intelligence.md` |
| Sprint 65 Plan | `docs/04-build/sprints/sprint-65-context-anchoring.md` |
| Sprint 66-67 Plan | `docs/04-build/sprints/sprint-66-67-search-scale-up.md` |
| Master Plan | `docs/00-foundation/master-plan.md` |

---

*Sprint 68 | v1.8 Compliance | PLANNED*
*Master Plan v4.2 | SDLC Framework v6.1.1*
