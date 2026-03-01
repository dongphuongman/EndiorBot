# Context Anchoring System

**Module:** `src/context/`
**Sprint:** 65
**Status:** Active
**Version:** 1.0.0

## Overview

The Context Anchoring system prevents "context drift" in long AI conversations by persisting and injecting critical context like sprint goals, checkpoints, and git state.

## Problem Statement

AI assistants experience **Context Drift** after 50-100K tokens:
- Forget sprint objectives mid-task
- Lose track of decisions made earlier
- No persistent "north star" across sessions

## Solution

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT ANCHORING SYSTEM                                       │
├─────────────────────────────────────────────────────────────────┤
│  Sprint Goals    → Persistent objectives across sessions        │
│  Checkpoints     → Conversation save points                     │
│  Git Context     → Branch/commit awareness                      │
│  Budget Manager  → Token-aware context injection                │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. ContextAnchor (`context-anchor.ts`)

Core storage and management for all anchor types.

```typescript
import { getContextAnchor } from "./context/index.js";

const anchor = getContextAnchor();

// Create an anchor
const decision = await anchor.create({
  type: "decision",
  title: "Use PostgreSQL for sessions",
  content: "Decided based on ACID requirements",
  priority: "high",
  state: "active",
  tags: ["architecture", "database"],
  metadata: { adr: "ADR-003" },
});

// Query anchors
const activeDecisions = await anchor.query({
  types: ["decision"],
  states: ["active"],
  limit: 10,
});

// Archive when done
await anchor.archive(decision.id);
```

**Anchor Types:**
- `sprint_goal` - Sprint objectives
- `checkpoint` - Conversation save points
- `spec_snapshot` - Spec file states
- `decision` - Key decisions made
- `blocker` - Active blockers

### 2. SprintGoalManager (`sprint-goals.ts`)

Manages sprint goals - the "north star" that prevents drift.

```typescript
import { getSprintGoalManager } from "./context/index.js";

const manager = getSprintGoalManager();

// Create sprint goal
const goal = await manager.create({
  sprintNumber: "65",
  title: "Context Anchoring",
  content: "Implement context anchoring system",
  objectives: [
    { description: "Implement ContextAnchor", taskRefs: ["T5.3"] },
    { description: "Implement SprintGoalManager", taskRefs: ["T5.4"] },
  ],
  successCriteria: ["Tests pass", "Integration complete"],
  definitionOfDone: ["Code reviewed", "Committed"],
  estimatedHours: 40,
});

// Update progress
await manager.updateObjective(goal.id, {
  objectiveId: "obj_1",
  status: "completed",
  progress: 100,
});

// Get current goal for context injection
const current = await manager.getCurrent();
const contextText = manager.formatForContext(current);
```

### 3. CheckpointManager (`checkpoint-manager.ts`)

Creates and restores conversation checkpoints.

```typescript
import { getCheckpointManager } from "./context/index.js";

const checkpoints = getCheckpointManager();

// Create checkpoint before risky operation
const checkpoint = await checkpoints.create({
  name: "Pre-refactor",
  trigger: "pre_destructive",
  description: "Before major refactoring",
});

// List checkpoints
const all = await checkpoints.list();
const restorable = await checkpoints.getRestorable();

// Restore if needed
const result = await checkpoints.restore(checkpoint.id);
```

**Triggers:**
- `manual` - User-initiated
- `auto_time` - Time-based (every N minutes)
- `auto_tokens` - Token threshold reached
- `auto_milestone` - Task completion
- `pre_destructive` - Before risky operations
- `session_end` - Session ending

### 4. GitContextManager (`git-context.ts`)

Provides git context and time-travel queries.

```typescript
import { getGitContextManager } from "./context/index.js";

const git = getGitContextManager();

// Get current git context
const context = await git.getContext(5); // Last 5 commits
console.log(`Branch: ${context.branch}`);
console.log(`Commit: ${context.shortCommit}`);
console.log(`State: ${context.workingTreeState}`);

// Time-travel: get file at specific commit
const oldVersion = await git.getFileAtCommit("src/index.ts", "HEAD~5");
if (oldVersion.existed) {
  console.log(oldVersion.content);
}

// Get file history
const history = await git.getFileHistory("src/index.ts", 10);

// Format for AI context
const aiContext = git.formatForContext(context);
const compactContext = git.getCompactContext(context);
```

### 5. AnchorBudget (`anchor-budget.ts`)

Token budget management for context injection.

```typescript
import { getAnchorBudget } from "./context/index.js";

const budget = getAnchorBudget();

// Allocate budget for components
const allocation = budget.allocate({
  gitTokens: 150,
  sprintGoalTokens: 400,
  checkpointTokens: 100,
  blockerTokens: 50,
});

// Check strategy
if (allocation.strategy === "compact") {
  // Use compact formatting
}

// Check if items were dropped
if (allocation.droppedItems.includes("checkpoint")) {
  // Checkpoint was dropped due to budget
}
```

**Strategies:**
- `full` - Complete formatting (~800 tokens max)
- `compact` - Abbreviated (~400 tokens max)
- `minimal` - Single-line summaries (~200 tokens max)

**Priority Order:**
1. Git context (always included if available)
2. Sprint goal (critical for drift prevention)
3. Blockers (important for awareness)
4. Checkpoint (lowest priority)

## Integration with ContextInjector

The context anchoring system integrates with `ContextInjector`:

```typescript
// In context-injector.ts
if (isFeatureEnabled("CONTEXT_ANCHORING")) {
  const anchorContext = await this.loadAnchorContext();
  if (anchorContext) {
    items.push(
      createContextItem("anchor", "MUST", "Sprint goals and anchors", anchorContext)
    );
  }
}
```

## Feature Flag

Enable via feature flag:

```typescript
// src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  CONTEXT_ANCHORING: false, // Enable when ready
};
```

## CLI Commands

```bash
# Anchor status
./endiorbot.mjs context anchor status

# Sprint goals
./endiorbot.mjs context anchor goals

# Checkpoints
./endiorbot.mjs context anchor checkpoint create "Pre-merge"
./endiorbot.mjs context anchor checkpoint list
./endiorbot.mjs context anchor checkpoint restore <id>

# Cleanup
./endiorbot.mjs context anchor cleanup --expired
./endiorbot.mjs context anchor cleanup --archived --older-than 30
```

## Performance

Based on benchmarks (Sprint 65 T5.15):

| Operation | Performance |
|-----------|-------------|
| Sprint goal lifecycle | 63,141 ops/sec |
| Context injection simulation | 6.65 ops/sec (~150ms) |
| Budget allocation | ~100,000 ops/sec |
| Git context retrieval | ~3-7 ops/sec |

## Token Budget

Default budget allocation:

| Component | Full | Compact | Minimal |
|-----------|------|---------|---------|
| **Total** | 800 | 400 | 200 |
| Git Context | 150 | 80 | 40 |
| Sprint Goal | 400 | 150 | 80 |
| Checkpoint | 150 | 80 | 40 |
| Blockers | 200 | 100 | 40 |

## Best Practices

1. **Sprint Goals**: Create at sprint start, update daily
2. **Checkpoints**: Create before risky operations
3. **Git Context**: Included automatically when in git repo
4. **Budget**: System auto-selects strategy based on usage

## Files

```
src/context/
├── index.ts                 # Barrel exports
├── types.ts                 # Type definitions
├── context-anchor.ts        # Core anchor storage
├── sprint-goals.ts          # Sprint goal management
├── checkpoint-manager.ts    # Checkpoint system
├── spec-snapshot-anchor.ts  # Spec snapshot (future)
├── git-context.ts           # Git context manager
├── anchor-budget.ts         # Token budget management
└── __tests__/
    ├── context-anchor.test.ts
    ├── sprint-goals.test.ts
    ├── checkpoint-manager.test.ts
    ├── anchor-budget.test.ts
    └── performance.bench.ts
```

## Related

- [Master Plan v4.2](../00-foundation/master-plan.md) - Sprint 65 spec
- [ContextInjector](../../src/agents/context/context-injector.ts) - Integration point
- [Feature Flags](../../src/config/feature-flags.ts) - CONTEXT_ANCHORING flag

---

*Sprint 65 - Context Anchoring System*
*EndiorBot v1.5*
