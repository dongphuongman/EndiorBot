# ADR-042: Autonomous Execution Engine

**Status:** ACCEPTED
**Date:** 2026-04-03
**Sprint:** 124b
**Authority:** PM + Architect — CTO 8/10 APPROVED
**SDLC Framework:** 6.3.0
**Traces:** ADR-038 (Autonomous Workflow), Sprint 72 (AutonomousSessionManager), Sprint 124a (plan command)

---

## Context

Sprint 72 built `AutonomousSessionManager` with task queue, model tiering, budget management, failure classification, and recovery engine. But `executeTaskWork()` throws `NOT_WIRED` — the core is a stub. Every autonomous feature (plan execute, workflow run, multi-agent coordination) is blocked.

Sprint 124a shipped the `plan` command (display-only). Sprint 124b wires the execution engine to enable `workflow execute` in future sprints.

---

## Decision

### Wire executeTaskWork() → callCloudFallback()

**CTO C1:** Use `callCloudFallback()` directly from `providers.ts`, NOT `callAI()`. The autonomous manager has its own `ModelSelector` (ELITE/STANDARD/EFFICIENCY) — routing through `callAI()` would create competing model selection.

### Integration point

```
AutonomousSessionManager.executeTask()
  → ModelSelector.selectModel(task.type)     // Already wired
  → executeTaskWork(task, tier)              // THE FIX
    → taskTypeToAgent(task.type)             // NEW: 18-type mapping
    → buildTaskContext(task, manager)         // NEW: SOUL + sprint + deps
    → router.callCloudFallback(agent, context, model)  // Existing provider path
    → Parse result → cost + output
  → FailureClassifier                        // Already wired
  → RecoveryEngine                           // Already wired
  → SessionBudget.recordCall()               // Already wired
```

### Gate B: Read-Only MVP

**CTO C4:** Gate B = CEO approves every task. MVP auto-approves but enforces read-only:
- deployment, infrastructure, monitoring → throw Error ("requires Gate C")
- All other task types → read/analyze/generate (no file modifications)

### Constructor Injection

**CTO C5:** `AutonomousSessionManager` constructor accepts `ChannelRouter` instance.

---

## Task Type → Agent Mapping (CTO C2)

| TaskType | Agent | Mode |
|----------|-------|------|
| architecture | architect | READ |
| code_generation | coder | READ (Gate B) |
| code_review | reviewer | READ |
| testing | tester | READ |
| deployment | devops | BLOCKED (Gate C) |
| research | researcher | READ |
| planning | pm | READ |
| documentation | coder | READ |
| bug_fix | coder | READ |
| refactoring | coder | READ |
| security_review | cso | READ |
| performance | coder | READ |
| integration | architect | READ |
| migration | coder | READ |
| configuration | devops | BLOCKED (Gate C) |
| monitoring | devops | BLOCKED (Gate C) |
| infrastructure | devops | BLOCKED (Gate C) |
| general | assistant | READ |

EFFICIENCY tasks (lint, format): No agent call — return success with zero cost.

---

## Context Template (CTO C3)

```
[Session Context]
Sprint: {sprintGoal}
Project: {projectRoot}
Tier: {modelTier}
[/Session Context]

[Agent: {agentName}]
{SOUL template content}
[/Agent]

[Task]
{task.description}
[/Task]

[Prior Task: {depId}]
{completedTasks.get(depId).output — first 500 chars}
[/Prior Task]
```

No conversation history. No memory facts. Clean per-task context.

---

## Consequences

### Positive
- Unblocks entire autonomous workflow vision (plan → execute → verify)
- Uses existing production AI path (callCloudFallback)
- Budget management and failure recovery already wired
- Foundation for Gate C (full autonomy with PATCH mode) in future

### Negative
- Gate B is read-only — agents cannot modify files autonomously
- Cost depends on cloud provider availability
- No Claude Code Bridge path (Bridge has its own model selection)

### Risks
- Cloud provider rate limits during multi-task execution → mitigated by existing retry logic
- Task context may exceed token budget → mitigated by 500-char cap on dependency outputs

---

## References

- Sprint 72: AutonomousSessionManager, ModelSelector, FailureClassifier
- ADR-038: Autonomous Workflow Integration (Phase 2 = this sprint)
- CTO review: "Use callCloudFallback directly, pass model tier from ModelSelector"
