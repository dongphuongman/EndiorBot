# Technical Challenges

**Version**: 1.0.0
**Date**: 2026-02-22

This document outlines the known hard problems and open questions for the Autonomy Epic.

---

## Challenge 1: Checkpoint State Completeness

### Problem

What state needs to be captured for reliable resume after interruption?

### Current Understanding

```typescript
interface CheckpointState {
  session: SessionState;           // ✅ Defined
  pendingToolCalls: ToolCallState[]; // ❓ How to serialize?
  partialResults: Map<string, unknown>; // ❓ What results?
  activeSoul: SoulType;            // ✅ Enum
  decisionLog: Decision[];         // ❓ How detailed?
  modifiedFiles: FileChange[];     // ❓ Full content or diff?
  gitBranch: string;               // ✅ Simple
  uncommittedChanges: string[];    // ❓ File list or full diff?
  fileHashes: Map<string, string>; // ✅ SHA256
}
```

### Open Questions

1. **Tool Call Serialization**: How to serialize in-flight tool calls? Some may have side effects (file writes, git operations).

2. **Partial Results**: What intermediate results need preservation? LLM responses? File reads?

3. **Conflict Detection**: When checkpoint references files modified externally, what's the merge strategy?

### Expert Input Needed

- Best practices for checkpoint/restore in AI agent systems
- Existing solutions (LangChain checkpointing, AutoGPT state management)
- Granularity tradeoffs (full state vs. minimal state)

---

## Challenge 2: Self-Correction Boundaries

### Problem

What errors can be reliably auto-fixed? Where's the line between "try to fix" and "escalate"?

### Current Scoping

| Category | Auto-Fix | Confidence |
|----------|----------|------------|
| Build errors | ✅ | High |
| Lint errors | ✅ | High |
| Type errors | ✅ | Medium |
| Test failures | ⚠️ Experimental | Low |
| Logic errors | ❌ | None |

### Open Questions

1. **Fix Strategy Selection**: How to choose between multiple fix strategies? (e.g., type error → add type vs. import type vs. fix upstream)

2. **Root Cause Analysis**: Type error might be symptom of architectural issue. How to detect?

3. **Fix Validation**: Build passes, but did the fix introduce new issues? (e.g., added `any` type)

4. **Learning from Fixes**: How to improve fix success rate over time without ML?

### Expert Input Needed

- Patterns from static analysis tools (ESLint --fix, TypeScript compiler suggestions)
- Heuristics for fix prioritization
- Quality gates to prevent bad fixes

---

## Challenge 3: Budget and Cost Estimation

### Problem

Accurate cost prediction for AI operations to enable proactive budget management.

### Current Approach

```typescript
interface CostEstimation {
  inputTokens: number;
  outputTokens: number;
  model: string;
  estimatedCost: number;  // ❓ How accurate?
}
```

### Open Questions

1. **Pre-execution Estimation**: How to estimate output tokens before the call? (Output length varies wildly)

2. **Streaming Cost Tracking**: How to track cost during streaming responses?

3. **Budget Reallocation**: When task exceeds estimate, continue or stop?

4. **Ollama Cost**: Ollama is "free" but has compute cost. How to factor?

### Expert Input Needed

- Token estimation heuristics (task type → expected output length)
- Industry practices for AI cost management
- When to switch from cloud to local (quality vs. cost tradeoff)

---

## Challenge 4: Parallel Track Coordination

### Problem

Running 2-3 tracks concurrently without file conflicts or inconsistent state.

### Proposed Model

```
Track A (Research) → Read-only, any files
Track B (Design)   → Write docs/, read src/
Track C (Implement) → Write src/, read docs/
```

### Open Questions

1. **File Lock Granularity**: Lock file or directory? How long to hold?

2. **Conflict Resolution**: When tracks need same file, who wins? Queue or fail?

3. **State Consistency**: If Track A discovers something that invalidates Track C's work, how to handle?

4. **Resource Contention**: Both tracks want to call Claude Opus. Serialize or parallel?

### Expert Input Needed

- Concurrent file access patterns in build systems
- Transaction models for file operations
- Coordination primitives (locks, semaphores) in Node.js

---

## Challenge 5: Quality Validation for Ollama Output

### Problem

Ollama (local LLM) output may be lower quality than cloud models. Need validation.

### Proposed Gates

| Task Type | Validation | Action on Fail |
|-----------|------------|----------------|
| Lint/Format | Build check | Retry with cloud |
| Code Gen | Build + Test | Retry with cloud |
| Architecture | N/A | **Always use cloud** |

### Open Questions

1. **Semantic Validation**: Code builds but is it correct? How to check without running tests?

2. **Quality Threshold**: What defines "good enough" for Ollama output?

3. **Retry Strategy**: Retry same task or escalate immediately?

4. **Pattern Learning**: Which tasks consistently fail with Ollama? (Without ML)

### Expert Input Needed

- Output quality metrics for code generation
- Local LLM best practices (model selection, prompt optimization)
- Hybrid cloud/local architectures

---

## Challenge 6: Desktop Integration Architecture

### Problem

Porting ClawX (Electron app) into EndiorBot while maintaining CLI functionality.

### Current Plan

```
EndiorBot
├── CLI (existing)
│   └── commands/
└── Desktop (new)
    ├── main/ (Electron)
    ├── preload/
    └── renderer/ (React)
```

### Open Questions

1. **Shared Code**: How much code shared between CLI and Desktop? (SessionManager, ProviderRegistry)

2. **Build Complexity**: Single build or separate? (CLI: Node, Desktop: Electron)

3. **State Sync**: When CLI modifies state, how does Desktop know?

4. **Update Path**: Auto-update for Desktop, npm for CLI?

### Expert Input Needed

- Electron + CLI hybrid architectures
- State synchronization patterns
- Build tooling for multi-target projects

---

## Challenge 7: Escalation UX

### Problem

How to notify CEO and get decisions without breaking flow state?

### Current Approach

```yaml
notification:
  channels:
    - desktop_notification
    - email (optional)
    - slack (optional)

  escalation_levels:
    1: in_app_banner
    2: desktop_notification
    3: email
```

### Open Questions

1. **Notification Fatigue**: Too many notifications defeats the purpose. What's the threshold?

2. **Async Approval**: CEO is away. Queue approval or fail task?

3. **Context in Notification**: How much context to include? (Too little: CEO can't decide. Too much: TL;DR)

4. **Batch Decisions**: Multiple approvals pending. Show together or separately?

### Expert Input Needed

- UX patterns for async approvals
- Notification design for developer tools
- Context compression techniques

---

## Challenge Priority

| Challenge | Impact | Blocking |
|-----------|--------|----------|
| 1. Checkpoint State | High | Sprint 35 |
| 2. Self-Correction | High | Sprint 37 |
| 3. Budget Estimation | Medium | Sprint 36 |
| 4. Parallel Tracks | Medium | Sprint 39 |
| 5. Ollama Quality | Medium | Sprint 38 |
| 6. Desktop Integration | Low | Future |
| 7. Escalation UX | Low | Sprint 36 |

---

## Expert Feedback Requested

For each challenge:
1. Are we framing the problem correctly?
2. What approaches have worked in similar systems?
3. What pitfalls should we avoid?
4. Are there open-source solutions we should evaluate?

---

*Technical Challenges v1.0.0*
*SDLC Framework 6.1.1*
