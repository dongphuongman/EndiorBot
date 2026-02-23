# Consultation Questions for External Experts

**Version**: 1.1.0
**Date**: 2026-02-22

We are seeking expert feedback on the EndiorBot Autonomy Epic. Please review the provided documentation and address these specific questions.

---

## Context

**EndiorBot** is a solo developer productivity tool that orchestrates AI agents for enterprise-scale software development. We're planning an "Autonomy Epic" to enable 1-2+ hour autonomous runs with minimal human intervention.

**Key Documents**:
- [01-EndiorBot-Overview](01-EndiorBot-Overview.md) - Current architecture
- [04-Autonomy-Epic-v2](04-Autonomy-Epic-v2.md) - The upgrade plan
- [07-Technical-Challenges](07-Technical-Challenges.md) - Hard problems

---

## Category 1: Checkpoint/Resume Architecture

### Q1.1: State Completeness

We're designing a `CheckpointState` interface to capture agent state for resume after interruption.

```typescript
interface CheckpointState {
  session: SessionState;
  pendingToolCalls: ToolCallState[];
  partialResults: Map<string, unknown>;
  activeSoul: SoulType;
  decisionLog: Decision[];
  modifiedFiles: FileChange[];
  fileHashes: Map<string, string>;
  gitBranch: string;
  uncommittedChanges: string[];
}
```

**Questions**:
- Is this state model sufficient for reliable resume?
- What are we missing?
- How do existing agent frameworks (LangChain, AutoGPT) handle checkpointing?

### Q1.2: Conflict Resolution

When checkpoint references files modified externally since the checkpoint was saved:

**Current Plan**:
```
Detect conflict → Warn CEO → Options: [Force restore] [Merge] [Abort]
```

**Questions**:
- Is this the right approach?
- Should we attempt automatic merge?
- How to handle git conflicts vs. file conflicts?

---

## Category 2: Self-Correction Design

### Q2.1: Fix Strategy Selection

When auto-fixing a type error, multiple strategies may apply:
1. Add type annotation
2. Import missing type
3. Fix upstream definition
4. Add type assertion

**Questions**:
- How to choose between strategies?
- Should we try multiple and pick the one that works?
- How to avoid fixes that technically work but are wrong (e.g., `any`)?

### Q2.2: Scope Boundaries

We've scoped auto-fix to build/lint/type errors. Test failures are marked "experimental."

**Questions**:
- Is this the right boundary?
- What heuristics distinguish "fixable test failure" from "logic error"?
- Should we ever auto-fix test failures, or always escalate?

### Q2.3: Learning Without ML (Iceberg-Based Evolution)

We want EndiorBot to learn and evolve according to the Iceberg 4-layer model:

```
Events → Patterns → Structures → Mental Models
(fix-log)  (weekly)   (update)    (paradigm shift)
```

**Current Plan**:
- **Layer 1 (Events)**: Log all fix attempts to JSON
- **Layer 2 (Patterns)**: CEO weekly review identifies recurring issues
- **Layer 3 (Structures)**: Update fix strategies based on patterns
- **Layer 4 (Mental Models)**: Challenge assumptions about what can be auto-fixed

**Questions**:
- Is this Iceberg-based evolution model sound for AI agent learning?
- Are there pattern-matching approaches that don't require ML?
- How can we automate pattern recognition (Layer 2) without ML?
- What triggers should cause structural changes (Layer 3)?
- How do we know when a mental model shift (Layer 4) is needed?

---

## Category 3: Hybrid AI Resource Management

### Q3.1: Output Quality Validation

When using Ollama (local LLM) instead of cloud models:

**Current Plan**:
```
Ollama output → Build check → Pass? → Use
                      ↓ fail
               Retry with cloud
```

**Questions**:
- Is build check sufficient for code generation quality?
- How to detect "correct but suboptimal" code?
- Should we ever trust Ollama for complex tasks?

### Q3.2: Cost Estimation

We want to predict AI operation cost before execution.

**Questions**:
- How accurate can token estimation be?
- What's a reasonable heuristic for "task type → expected output tokens"?
- How do other tools (GitHub Copilot, Cursor) handle this?

### Q3.3: Resource Routing

Routing algorithm for AI resource selection:

```
Simple tasks → Ollama
Medium tasks → Haiku
Complex tasks → Opus
Budget low? → Force Ollama
```

**Questions**:
- How to classify task complexity automatically?
- Should complexity be static (task type) or dynamic (context-dependent)?
- What signals indicate "need more powerful model"?

---

## Category 4: Parallel Execution

### Q4.1: Concurrency Model

Our plan: Single-process, `Promise.all` for AI calls, file-level locks.

**Questions**:
- Is single-process sufficient for 2-3 tracks?
- Should we consider worker threads or child processes?
- What's the overhead of file-level locking in Node.js?

### Q4.2: Track Coordination

Tracks: Research, Design, Implement, Test, Review.

**Questions**:
- How to handle dependencies between tracks? (e.g., Implement depends on Design)
- Should tracks communicate, or stay fully isolated?
- What if Track A discovers something that invalidates Track B's work?

---

## Category 5: Escalation and UX

### Q5.1: Notification Design

Balance: Notify CEO when needed, don't interrupt flow state.

**Questions**:
- What's a reasonable notification frequency? (per hour? per issue?)
- How to batch multiple pending decisions?
- What's the minimum context for a CEO decision?

### Q5.2: Async Approval

CEO may be away when approval is needed.

**Current Plan**: Queue approvals, continue non-blocked tasks.

**Questions**:
- Is this the right approach?
- Should some approvals have timeouts? (auto-approve if no response in X hours)
- How to handle dependencies on pending approvals?

---

## Category 6: Desktop Integration

### Q6.1: Architecture

Porting ClawX (Electron app) into EndiorBot.

**Questions**:
- Single codebase (CLI + Desktop) or separate packages?
- How to share code between CLI and Desktop (SessionManager, etc.)?
- Build tooling recommendations for Electron + Node.js CLI hybrid?

### Q6.2: State Sync

CLI and Desktop both modify state (sessions, config).

**Questions**:
- How to keep them in sync?
- Event-based (file watchers) or polling?
- What if both modify simultaneously?

---

## Category 7: Overall Architecture

### Q7.1: Phase Order

We've ordered phases: Checkpoint → Budget → Self-Correct → Hybrid AI → Parallel → Logging.

**Questions**:
- Does this order make sense?
- Should any phases be combined or split?
- Are there dependencies we've missed?

### Q7.2: Risk Assessment

Biggest risks we see:
1. Checkpoint state incomplete → resume fails
2. Auto-fix introduces bugs → quality degrades
3. Budget tracking inaccurate → cost overrun
4. Parallel tracks conflict → wasted work

**Questions**:
- Are these the right risks to focus on?
- What risks are we missing?
- Which risk should we address first?

### Q7.3: Alternative Approaches

**Questions**:
- Are there existing tools we should evaluate instead of building?
- What open-source projects solve similar problems?
- Should we consider a different architecture entirely?

---

## Category 8: EndiorBot Brain Architecture (PROPOSED)

> **Note**: This is a PROPOSED design, not yet decided. We want expert feedback before committing. CEO emphasizes incremental evolution over feature ambition.

### Q8.1: Knowledge Storage Architecture

We want EndiorBot to have a **persistent "brain"** - LLM-agnostic knowledge storage that captures CEO preferences, learned patterns, and evolving strategies.

**Proposed Structure**:
```
~/.endiorbot/brain/
├── iceberg/                    # Knowledge by Iceberg layer
│   ├── events/                 # Layer 1: Raw events
│   │   └── fix-log.json        # Fix attempts, outcomes
│   │   └── decisions-log.json  # Escalation decisions
│   │
│   ├── patterns/               # Layer 2: Recognized patterns
│   │   └── error-patterns.json # Recurring error types
│   │   └── project-patterns.json
│   │
│   ├── structures/             # Layer 3: System knowledge
│   │   └── fix-strategies.json # Which strategies work
│   │   └── routing-rules.json  # Ollama vs Cloud
│   │
│   └── mental-models/          # Layer 4: Core beliefs
│       └── assumptions.json    # What can/cannot auto-fix
│
├── ceo-profile/                # CEO-specific identity
│   ├── preferences.json        # Coding style, strictness
│   ├── values.json             # Priorities
│   └── communication.json      # Notification preferences
│
└── evolution/                  # Self-tracking
    ├── metrics.json            # Fix rates over time
    └── changelog.md            # Brain evolution history
```

**Questions**:
- Is this the right structure for LLM-agnostic knowledge storage?
- How do other AI agents (AutoGPT, AgentGPT, BabyAGI) persist learned knowledge?
- Is JSON sufficient, or should we consider SQLite/other formats?
- How to handle brain versioning and migration?

### Q8.2: CEO Profile vs. Learned Knowledge

We separate "CEO profile" (static preferences) from "learned knowledge" (evolving patterns).

**CEO Profile Example**:
```json
{
  "codingStyle": {
    "strictMode": true,
    "noAny": true,
    "preferConst": true
  },
  "reviewStrictness": "high",
  "escalationThreshold": "conservative"
}
```

**Questions**:
- Is this separation correct?
- Should CEO profile also evolve based on observed behavior?
- How to handle conflicts between CEO profile and learned patterns?

### Q8.3: Inject Knowledge into LLM Context

**Proposed Flow**:
```
User Request
     │
     ▼
Load relevant brain context
     │
     ▼
Inject into LLM prompt:
  - CEO preferences
  - Relevant patterns
  - Past similar decisions
     │
     ▼
Any LLM (Claude, GPT, Gemini, Ollama)
     │
     ▼
Response + Update brain if new learning
```

**Questions**:
- What's the optimal way to inject stored knowledge into prompts?
- How much context to inject without overwhelming the LLM?
- Should injection be automatic or selective?
- How to measure if injected context actually improves outcomes?

### Q8.4: Domain/Project Knowledge

CPO/CTO feedback suggests adding project-specific knowledge:

**Proposed**:
```
brain/projects/{projectId}/
├── patterns.json     # Project-specific patterns
├── decisions.json    # Project ADR history
└── conventions.json  # Project naming, structure
```

**Questions**:
- Should project knowledge be in brain/ or in ~/.endiorbot/projects/?
- How to handle knowledge that applies across projects vs. project-specific?
- How to migrate knowledge when refactoring projects?

### Q8.5: Evolution Without ML

We want the brain to evolve WITHOUT machine learning:

**Proposed Evolution Model**:
```
Events (fix-log.json)
     │
     ▼ (automated aggregation - simple heuristics)
Patterns (error-patterns.json)
     │
     ▼ (CEO weekly review)
Structures (fix-strategies.json)
     │
     ▼ (quarterly paradigm review)
Mental Models (assumptions.json)
```

**Questions**:
- What simple heuristics can aggregate events into patterns without ML?
  - Example: "If same error type occurs 5+ times with same fix, create pattern"
- How to automate Layer 2 (pattern recognition) without ML?
- What triggers should cause structural changes (Layer 3)?
- Are there rule-based systems that achieve similar results to ML?

### Q8.6: ADR Scope Question

**Internal Debate**:
- **Option A**: Include brain storage in ADR-006 (Checkpoint State Model)
- **Option B**: Create separate ADR-009 (EndiorBot Brain Architecture)

CPO/CTO recommends **Option B** because:
- Checkpoint = "snapshot of execution state" (ephemeral)
- Brain = "persistent knowledge" (long-lived)

**Questions**:
- Is this separation correct architecturally?
- Are there concerns with having checkpoint reference brain state?
- How do other systems separate execution state from learned knowledge?

### Q8.7: Incremental Evolution Strategy

CEO emphasizes: **"tiến hoá từ từ, không tham lam tính năng"** (evolve incrementally, avoid feature greed)

**Proposed MVP**:
1. Sprint 40: `fix-log.json` only (events layer)
2. Post-MVP: Add patterns layer (manual CEO review)
3. Future: Add structures/mental-models layers

**Questions**:
- Is this the right incremental path?
- What's the minimum viable brain for initial value?
- What can we defer without losing the core benefit?
- How do we avoid over-engineering before validating the concept?

---

## How to Respond

Please provide:
1. **Assessment**: Is our approach sound?
2. **Alternatives**: What would you do differently?
3. **Recommendations**: Specific, actionable suggestions
4. **References**: Relevant projects, papers, or tools to evaluate

---

## Response Format

```markdown
## Question X.X: [Question Title]

### Assessment
[Your assessment of our current approach]

### Recommendations
- [Specific recommendation 1]
- [Specific recommendation 2]

### References
- [Relevant project/paper/tool]
```

---

Thank you for your expertise!

---

*Consultation Questions v1.0.0*
*SDLC Framework 6.1.1*
