# ADR Summary

**Version**: 1.0.0
**Date**: 2026-02-22

This document summarizes the key Architectural Decision Records for EndiorBot.

---

## ADR-001: Multi-Model Orchestrator

**Status**: Proposed → Implementing
**Sprint**: 29-31
**Problem**: CEO uses 5+ AI tools manually, spending 30-60 min per decision

### Decision

Automate multi-model consultation within EndiorBot CLI:

```
┌─────────────────────────────────────────────────────┐
│            Multi-Model Orchestrator                  │
│                                                     │
│   Query Dispatcher                                  │
│       │                                             │
│       ├── Claude (Primary)                          │
│       ├── GPT (Expert)                              │
│       └── Gemini (Expert)                           │
│       │                                             │
│   Response Consolidator                             │
│       │                                             │
│   CEO Decision Interface                            │
│   [Approve] [Discuss] [Re-consult]                 │
└─────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
interface MultiModelConfig {
  queryMode: 'parallel' | 'sequential' | 'cascade';
  maxParallelQueries: number;      // 3
  perModelTimeout: number;          // 30000ms
  totalTimeout: number;             // 60000ms
  fallbackBehavior: 'use_available' | 'require_minimum' | 'fail_fast';
  minimumResponses: number;         // 2
}

interface ConsensusResult {
  hasConsensus: boolean;
  consensusPoints: string[];
  disagreements: Disagreement[];
  recommendation: string;
}
```

### Model Routing by Task Type

| Task Type | Primary | Experts | Rationale |
|-----------|---------|---------|-----------|
| Architecture | Claude Opus | GPT-5, Gemini | Diverse perspectives |
| Security | Claude Opus | GPT-5 | Cross-validation |
| Code Gen | Claude Opus | - | Speed |
| Research | Gemini | Claude, GPT | Latest data |

### Impact on Autonomy Epic

- **Phase 2** (Escalation): Uses orchestrator for Level 2 escalation
- **Phase 4** (Hybrid AI): Extends to include Ollama as a provider

---

## ADR-002: Project Context Switching

**Status**: Proposed → Implementing
**Sprint**: 29-31
**Problem**: Switching between projects takes 5+ min, loses context

### Decision

Implement fast context switching with full state preservation:

```
┌─────────────────────────────────────────────────────┐
│            Project Context Manager                   │
│                                                     │
│   Context Registry                                  │
│   Projects: [Bflow, NQH-Bot, MTEP]                 │
│   Active: Bflow                                    │
│                                                     │
│   ┌─────────────┐     ┌─────────────┐              │
│   │   Active    │     │  Inactive   │              │
│   │  (memory)   │     │   (disk)    │              │
│   └─────────────┘     └─────────────┘              │
│                                                     │
│   Storage: ~/.endiorbot/projects/{id}/             │
└─────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
interface ProjectContext {
  id: string;
  name: string;
  path: string;
  tier: 'LITE' | 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE';
  sdlcConfig: SDLCConfig;
  session: SessionState;
  git: GitState;
  createdAt: Date;
  lastActive: Date;
}

interface SessionState {
  conversationId: string;
  tokenCount: number;
  maxTokens: number;
  messages: Message[];
  compactedHistory?: string;
  activeTask?: string;
}
```

### Memory Budget by Tier

| Tier | Max Context | History Tokens | Concurrent |
|------|-------------|----------------|------------|
| LITE | 50MB | 10K | 1 |
| STANDARD | 100MB | 50K | 3 |
| PROFESSIONAL | 200MB | 100K | 5 |
| ENTERPRISE | 500MB | 200K | 5 |

### CLI Commands

```bash
endiorbot switch bflow      # Switch to project
endiorbot projects list     # List all projects
endiorbot context           # Show current context
```

### Impact on Autonomy Epic

- **Phase 1** (Checkpoint): Extends SessionState with checkpoint fields
- **Phase 5** (Parallel): Each track may have separate context

---

## ADR-003: Autonomous Multi-Agent Orchestration (Planned)

**Status**: Draft (pending ADR-006, ADR-007, ADR-008)
**Sprint**: 35+

This ADR will define the overall autonomy architecture. Blocked by:
- ADR-006: Checkpoint State Model
- ADR-007: Autonomous Execution Budget
- ADR-008: Concurrency Model

---

## ADR-006: Checkpoint State Model (Required for Sprint 35)

**Status**: Draft
**Blocking**: Sprint 35 (Phase 1)

### Problem

Current SessionState doesn't capture enough for resume after interruption:
- No in-flight tool calls
- No file system delta
- No git working tree state

### Proposed Interface

```typescript
interface CheckpointState {
  // Existing
  session: SessionState;

  // NEW: In-flight state
  pendingToolCalls: ToolCallState[];
  partialResults: Map<string, unknown>;

  // NEW: Agent persona state
  activeSoul: SoulType;
  decisionLog: Decision[];

  // NEW: File system delta
  modifiedFiles: FileChange[];
  createdFiles: string[];

  // NEW: Git working tree
  gitBranch: string;
  uncommittedChanges: string[];
  lastCheckpointCommit: string;

  // NEW: Conflict detection
  fileHashes: Map<string, string>;  // path → SHA256
}
```

### Restore Semantics

```
On restore:
1. Load checkpoint
2. Check file hashes for conflicts
3. If conflicts:
   - Warn CEO: "Files modified since checkpoint"
   - Options: [Force restore] [Merge] [Abort]
4. If no conflicts:
   - Restore session state
   - Resume pending tool calls
```

---

## ADR-007: Autonomous Execution Budget (Required for Sprint 36)

**Status**: Draft
**Blocking**: Sprint 36 (Phase 2)

### Problem

Autonomous runs can incur unexpected costs. Need budget control.

### Proposed Configuration

```yaml
budget:
  daily_limit: $10
  per_session_limit: $2
  warning_threshold: 80%

  on_limit_reached:
    action: "pause_and_notify"
    fallback: "switch_to_ollama"

  excluded:
    - "lint_check"
    - "format_check"
```

### Interface

```typescript
interface BudgetTracker {
  track(cost: number, metadata: CostMetadata): void;
  getCurrentUsage(): BudgetUsage;
  isLimitReached(): boolean;
  onLimitReached(callback: () => void): void;
}
```

---

## ADR-008: Concurrency Model (Required for Sprint 39)

**Status**: Draft
**Blocking**: Sprint 39 (Phase 5)

### Problem

Parallel tracks need clear concurrency model to avoid conflicts.

### Proposed Model

- **Single-process** with `Promise.all` for I/O-bound AI calls
- **File-level locks** for writes
- **Shared state**: Logger, Config (read-only during parallel)
- **Track isolation**: Each track owns specific files

### Interface

```typescript
interface TrackManager {
  createTrack(config: TrackConfig): Track;
  runParallel(tracks: Track[]): Promise<TrackResult[]>;
  resolveConflict(conflict: FileConflict): Resolution;
}

interface FileLock {
  acquire(path: string, track: TrackId): Promise<void>;
  release(path: string, track: TrackId): void;
  isLocked(path: string): boolean;
}
```

---

## Summary Table

| ADR | Status | Blocking | Key Interface |
|-----|--------|----------|---------------|
| ADR-001 | Implementing | - | MultiModelConfig |
| ADR-002 | Implementing | - | ProjectContext |
| ADR-003 | Draft | ADR-006,7,8 | (TBD) |
| ADR-006 | Draft | Sprint 35 | CheckpointState |
| ADR-007 | Draft | Sprint 36 | BudgetTracker |
| ADR-008 | Draft | Sprint 39 | TrackManager |

---

*ADR Summary v1.0.0*
*SDLC Framework 6.1.1*
