# Sprint 65: v1.5 Context Anchoring

| Metadata | Value |
|----------|-------|
| **Sprint** | 65 |
| **Duration** | 40 hours (3 weeks) |
| **Status** | 📋 PLANNED |
| **Start Date** | TBD (After Sprint 64) |
| **End Date** | TBD |
| **Prerequisites** | Sprint 63-64 Complete |
| **Master Plan Version** | v4.2 |
| **Release** | v1.5 |

## Sprint Identity

```
Solve Context Drift by anchoring session state across conversations.
Sprint Goals persist, Checkpoints enable restore points, Spec Snapshots
track specification changes.

PROBLEM: AI forgets Sprint Goals after 50-100K tokens
SOLUTION: Persistent anchors that auto-inject into every context
APPROACH: Sprint Goals + Checkpoints + Spec Snapshots + Git Time-Travel
```

## Dependencies

| Dependency | From | Status |
|------------|------|--------|
| RgProvider | Sprint 63 | ⏳ |
| AstGrepProvider | Sprint 64 | ⏳ |
| Retrieval Logger | Sprint 63 | ⏳ |
| Code Search Layer | Sprint 63-64 | ⏳ |

---

## Sprint Breakdown

| Phase | Focus | Hours | Status |
|-------|-------|-------|--------|
| **65-1** | Context Anchoring Foundation | 16h | ⏳ |
| **65-2** | Advanced Anchoring | 12h | ⏳ |
| **65-3** | Integration and Polish | 12h | ⏳ |

---

## Phase 65-1: Context Anchoring Foundation (16h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T1.1 | Create `src/context/` module structure | 0.5h | @dev |
| T1.2 | Define anchor types (AnchorType, AnchorPoint) | 1h | @dev |
| T1.3 | Implement context-anchor.ts (ContextAnchorEngine) | 2h | @dev |
| T1.4 | Implement sprint-goals.ts (SprintGoalsPersistence) | 2h | @dev |
| T1.5 | Add anchor persistence to Brain L3 | 1.5h | @dev |
| T1.6 | Integration with ContextInjector | 1h | @dev |
| T1.7 | Checkpoint auto-creation logic | 3h | @dev |
| T1.8 | Checkpoint restore functionality | 2h | @dev |
| T1.9 | Spec Snapshot manager | 3h | @dev |
| **Total** | | **16h** | |

### Files to Create

```
src/context/
├── index.ts                      # Barrel export
├── types.ts                      # AnchorPoint, Checkpoint, SpecSnapshot
├── context-anchor.ts             # Context Anchoring Engine
├── sprint-goals.ts               # Sprint Goals persistence
├── checkpoint-manager.ts         # Checkpoint create/restore
├── spec-snapshot.ts              # Spec Snapshot manager
└── __tests__/
    ├── context-anchor.test.ts    # 8+ tests
    ├── sprint-goals.test.ts      # 6+ tests
    └── checkpoint.test.ts        # 6+ tests
```

### Key Types

```typescript
// src/context/types.ts

/**
 * Anchor types for context persistence.
 * Each type has different persistence and injection behavior.
 */
export type AnchorType =
  | "sprint_goal"      // Sprint objectives (persistent across sessions)
  | "checkpoint"       // Conversation checkpoint (restorable)
  | "spec_snapshot"    // Current spec state (versioned)
  | "identity"         // Project identity (always inject)
  | "decision"         // Key decisions made (audit trail)
  | "blocker";         // Active blockers (high priority)

/**
 * Anchor point in the context timeline.
 */
export interface AnchorPoint {
  id: string;
  type: AnchorType;
  timestamp: string;
  content: string;
  metadata: AnchorMetadata;

  // Persistence
  persistent: boolean;      // Survives session end
  autoInject: boolean;      // Auto-inject into context
  priority: number;         // Injection priority (0-100)

  // Token budget
  tokenEstimate: number;
  maxTokens: number;
}

/**
 * Checkpoint for conversation state.
 */
export interface Checkpoint {
  id: string;
  name: string;
  timestamp: string;

  // State captured
  anchors: AnchorPoint[];
  brainState: BrainStateSnapshot;

  // Git state (optional)
  gitBranch?: string;
  gitCommit?: string;

  // Restoration
  canRestore: boolean;
  restoredFrom?: string;
}

/**
 * Spec Snapshot for specification tracking.
 */
export interface SpecSnapshot {
  id: string;
  timestamp: string;
  version: string;

  // Tracked specs
  sources: SpecSource[];

  // Change detection
  contentHash: string;
  previousHash?: string;
  changesSinceLastSnapshot: SpecChange[];
}

export interface SpecSource {
  path: string;
  type: "adr" | "spec" | "proto" | "graphql" | "openapi";
  contentHash: string;
  lastModified: string;
}

export interface SpecChange {
  path: string;
  changeType: "added" | "modified" | "deleted";
  summary: string;
}
```

### Sprint Goals Persistence

```typescript
// src/context/sprint-goals.ts

export interface SprintGoalConfig {
  sprintId: string;
  goals: string[];
  startDate: string;
  endDate?: string;

  // Persistence
  persistPath: string;      // ~/.endiorbot/sprints/<id>/goals.json
  autoLoad: boolean;        // Load on session start

  // Injection
  injectFormat: "bullet" | "numbered" | "summary";
  maxTokens: number;
}

export class SprintGoalsPersistence {
  /**
   * Load sprint goals from disk.
   * Auto-loads current sprint on session start.
   */
  async load(sprintId: string): Promise<SprintGoalConfig>;

  /**
   * Save sprint goals to disk.
   * Persists across sessions.
   */
  async save(config: SprintGoalConfig): Promise<void>;

  /**
   * Get current sprint goals for context injection.
   * Returns formatted string ready for injection.
   */
  async getForInjection(): Promise<string>;

  /**
   * Mark goal as completed.
   * Updates persistence and logs evidence.
   */
  async completeGoal(goalIndex: number, evidence: string): Promise<void>;
}
```

### Definition of Done (65-1)

- [ ] `src/context/` module structure created
- [ ] All anchor types defined
- [ ] ContextAnchorEngine implemented
- [ ] SprintGoalsPersistence working
- [ ] Anchors persist to Brain L3
- [ ] ContextInjector integrates anchors
- [ ] Checkpoints can be created
- [ ] Checkpoints can be restored
- [ ] Spec Snapshot manager working
- [ ] 20+ unit tests passing

---

## Phase 65-2: Advanced Anchoring (12h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T2.1 | Git time-travel (branch context) | 3h | @dev |
| T2.2 | Anchor expiration/cleanup | 2h | @dev |
| T2.3 | CLI commands for anchors | 3h | @dev |
| T2.4 | Context Injector full integration | 2h | @dev |
| T2.5 | Token budget optimization | 2h | @dev |
| **Total** | | **12h** | |

### Git Time-Travel

```typescript
// src/context/git-context.ts

export interface GitContext {
  branch: string;
  commit: string;
  commitMessage: string;
  author: string;
  timestamp: string;

  // Branch history
  recentCommits: GitCommitSummary[];

  // Working state
  hasUncommittedChanges: boolean;
  changedFiles: string[];
}

export class GitContextProvider {
  /**
   * Get current git context for injection.
   * Captures branch, recent commits, and working state.
   */
  async getContext(): Promise<GitContext>;

  /**
   * Format git context for injection.
   * Respects token budget.
   */
  formatForInjection(context: GitContext, maxTokens: number): string;

  /**
   * Detect branch change and trigger context refresh.
   */
  async onBranchChange(callback: (newBranch: string) => void): Promise<void>;
}
```

### CLI Commands

```bash
# Anchor management
./endiorbot.mjs anchor list                    # List all anchors
./endiorbot.mjs anchor create <type> <content> # Create anchor
./endiorbot.mjs anchor delete <id>             # Delete anchor

# Checkpoint management
./endiorbot.mjs checkpoint create <name>       # Create checkpoint
./endiorbot.mjs checkpoint list                # List checkpoints
./endiorbot.mjs checkpoint restore <id>        # Restore checkpoint
./endiorbot.mjs checkpoint delete <id>         # Delete checkpoint

# Sprint goals
./endiorbot.mjs goals set <goals...>           # Set sprint goals
./endiorbot.mjs goals list                     # List current goals
./endiorbot.mjs goals complete <index>         # Mark goal complete

# Spec snapshots
./endiorbot.mjs spec snapshot                  # Create spec snapshot
./endiorbot.mjs spec diff                      # Show changes since last
./endiorbot.mjs spec history                   # Show snapshot history
```

### Definition of Done (65-2)

- [ ] Git time-travel captures branch context
- [ ] Anchor expiration works automatically
- [ ] All CLI commands implemented
- [ ] ContextInjector fully integrated
- [ ] Token budget respected (< 500 tokens for anchors)

---

## Phase 65-3: Integration and Polish (12h)

### Task Breakdown

| # | Task | Hours | Owner |
|---|------|-------|-------|
| T3.1 | Performance benchmarking | 2h | @dev |
| T3.2 | Documentation | 2h | @dev |
| T3.3 | E2E tests for context anchoring | 4h | @dev |
| T3.4 | E2E tests for code search | 4h | @dev |
| **Total** | | **12h** | |

### Performance Benchmarks

| Metric | Target |
|--------|--------|
| Anchor injection latency | < 10ms |
| Checkpoint create | < 100ms |
| Checkpoint restore | < 500ms |
| Spec snapshot create | < 200ms |
| Git context fetch | < 50ms |

### E2E Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Create sprint goals, restart session, verify persistence | Goals available on new session |
| 2 | Create checkpoint, make changes, restore | State restored to checkpoint |
| 3 | Create spec snapshot, modify spec, detect changes | Changes reported accurately |
| 4 | Switch git branch, verify context update | New branch context injected |
| 5 | Anchor token budget overflow | Truncation with warning |

### Definition of Done (65-3)

- [ ] Performance benchmarks pass
- [ ] Documentation complete
- [ ] E2E tests for anchoring pass
- [ ] E2E tests for search pass
- [ ] All 40h of tasks complete

---

## Files to Create/Modify

```
src/context/                          # NEW MODULE
├── index.ts                          # Barrel export
├── types.ts                          # Anchor types
├── context-anchor.ts                 # ContextAnchorEngine
├── sprint-goals.ts                   # SprintGoalsPersistence
├── checkpoint-manager.ts             # Checkpoint operations
├── spec-snapshot.ts                  # Spec tracking
├── git-context.ts                    # Git time-travel
└── __tests__/
    ├── context-anchor.test.ts
    ├── sprint-goals.test.ts
    ├── checkpoint.test.ts
    ├── spec-snapshot.test.ts
    └── git-context.test.ts

src/agents/context/
├── context-injector.ts               # MODIFY: Add anchor injection
└── context-manifest.ts               # MODIFY: Add "anchor" source

src/cli/commands/
├── anchor.ts                         # NEW: Anchor CLI
├── checkpoint.ts                     # NEW: Checkpoint CLI
├── goals.ts                          # NEW: Goals CLI
└── spec.ts                           # NEW: Spec CLI
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Sprint Goals persistence | 100% reliable |
| Checkpoint restore success | 100% |
| Spec change detection | 100% accuracy |
| Anchor injection latency | < 10ms |
| Token budget compliance | < 500 tokens for anchors |
| New tests | 40+ tests |
| Context Drift reduction | 70% (measured via survey) |

---

## v1.5 Release Criteria

| Criterion | Status |
|-----------|--------|
| Sprint Goals persist across sessions | ⏳ |
| Checkpoints can be created/restored | ⏳ |
| Spec Snapshots detect content changes | ⏳ |
| Git branch context auto-injected | ⏳ |
| Token budget respected | ⏳ |
| All E2E tests pass | ⏳ |
| Documentation complete | ⏳ |

---

## Related Documents

| Document | Location |
|----------|----------|
| Sprint 63 Plan | `docs/04-build/sprints/sprint-63-code-search-foundation.md` |
| Sprint 64 Plan | `docs/04-build/sprints/sprint-64-retrieval-intelligence.md` |
| TS-007 | `docs/02-design/14-Technical-Specs/TS-007-Code-Search-Layer.md` |
| Master Plan | `docs/00-foundation/master-plan.md` |

---

*Sprint 65 | v1.5 Context Anchoring | PLANNED*
*Master Plan v4.2 | SDLC Framework v6.1.1*
