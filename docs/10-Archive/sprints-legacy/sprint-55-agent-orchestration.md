# Sprint 55: Agent Orchestration Layer

**Status**: IN PROGRESS
**Duration**: 16-20 hours (55A: Day 1, 55B: Day 2)
**Goal**: Wire existing 12 agents into orchestration layer for Claude Code workflow
**Start Date**: 2026-02-28

---

## Alignment with Master Plan v3.1

This sprint implements the **SDLC Control Plane for Claude Code Workflow**:

```bash
endiorbot @pm "plan payment gateway"
  → PM executes via Claude Code
  → Handoff JSON to @architect
  → Architect executes
  → Handoff to @coder
  → Coder creates patch
  → CEO confirms apply
  → Handoff to @reviewer
  → Review complete
```

---

## Problem Statement

CEO calls agents via EndiorBot CLI/OTT, agents execute via Claude Code and return results/handoffs. Current gap: no orchestration layer connecting existing agents to Claude Code.

**Current State:**
```
CEO → Claude Code directly → Manual context management → No workflow
```

**Target State:**
```
CEO → @agent → EndiorBot orchestrator → Claude Code → Structured response + Handoff
```

---

## Existing Assets (REUSE)

| Asset | Location | Status |
|-------|----------|--------|
| 12 SOUL templates | `docs/reference/templates/souls/SOUL-*.md` | USE |
| 4 Tier configs | `docs/reference/templates/configs/endiorbot-*.json` | USE |
| Brain L1-L4 layers | `src/brain/layers/` | USE |
| Context Budget | `src/brain/context-budget.ts` | USE |
| Task Classifier | `src/agents/orchestrator/task-classifier.ts` | ENHANCE |
| Multi-model orchestrator | `src/agents/orchestrator/multi-model-orchestrator.ts` | USE |
| Routing infrastructure | `src/agents/routing/` | USE |
| Resilience handlers | `src/agents/resilience/` | USE |
| 17 CLI commands | `src/cli/commands/` | EXTEND |
| ActionControlPlane | `src/control-plane/action-control.ts` | USE |

---

## Scope

### In Scope (Sprint 55)

| Component | Priority | Description |
|-----------|----------|-------------|
| Mention Parser | P0 | Parse @agent from CLI/OTT |
| Agent Router | P0 | Route to existing agents, validate transitions |
| Handoff Guards | P0 | Depth, total, transition limits |
| Context Injector | P0 | Wire Brain L1-L4 → Claude prompt |
| Claude Code Bridge | P0 | 3 modes: read/patch/interactive |
| Response Parser | P0 | Extract JSON handoffs, artifacts |
| Workflow Engine | P0 | State machine for agent chains |
| Risk Classifier | P1 | LOW/MEDIUM/HIGH/CRITICAL |
| Audit Logger | P1 | Log every invocation to JSONL |
| CLI @agent command | P0 | Entry point |

### Out of Scope

- OTT channels (Telegram/Zalo) - Sprint 56+
- SE4H roles activation (CEO/CPO/CTO advisors)
- Desktop App integration
- Cross-project workflows

---

## Architecture

### New Orchestration Layer

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NEW: Sprint 55 Orchestration Layer                                    │
│                                                                         │
│  CEO: @pm "task"    ┌─────────────────────────────┐                    │
│        │            │ mention-parser.ts           │                    │
│        ▼            │ Parse @agent from CLI/OTT   │                    │
│  ┌──────────┐       └─────────────────────────────┘                    │
│  │ CLI      │                   │                                      │
│  │ agent.ts │ ──────►  ┌─────────────────────────────┐                 │
│  └──────────┘          │ agent-router.ts             │                 │
│                        │ Load SOUL + route           │                 │
│                        └─────────────────────────────┘                 │
│                                 │                                      │
│                        ┌─────────────────────────────┐                 │
│                        │ context-injector.ts         │                 │
│                        │ Brain → Claude prompt       │──► Uses Brain   │
│                        └─────────────────────────────┘                 │
│                                 │                                      │
│                        ┌─────────────────────────────┐                 │
│                        │ claude-code-bridge.ts       │                 │
│                        │ 3 modes: read/patch/inter   │                 │
│                        └─────────────────────────────┘                 │
│                                 │                                      │
│                        ┌─────────────────────────────┐                 │
│                        │ response-parser.ts          │                 │
│                        │ Extract handoff JSON        │                 │
│                        └─────────────────────────────┘                 │
│                                 │                                      │
│                        ┌─────────────────────────────┐                 │
│                        │ workflow-engine.ts          │──► Uses         │
│                        │ Manage agent chains         │    task-classifier
│                        └─────────────────────────────┘                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Handoff Protocol

```typescript
interface HandoffItem {
  to: AgentRole;
  intent: string;
  priority: "P0" | "P1" | "P2";
  inputs: Record<string, unknown>;
  reason: string;
}

interface HandoffRequest {
  handoff: HandoffItem[];
}
```

### Allowed Transitions

```typescript
const ALLOWED_TRANSITIONS = {
  // SE4A Executors
  researcher: ["pm"],
  pm: ["architect", "pjm"],
  pjm: ["coder", "tester"],
  architect: ["coder", "reviewer"],
  coder: ["reviewer", "tester"],
  reviewer: ["coder", "pm"],
  tester: ["coder", "devops"],
  devops: ["tester"],
  // SE4H Advisors (cannot delegate)
  ceo: [], cpo: [], cto: [],
  // Router
  assistant: ["researcher", "pm", "pjm", "architect", "coder", "reviewer", "tester", "devops"],
};
```

### Handoff Guards

```typescript
const HANDOFF_GUARDS = {
  maxDepth: 3,              // PM → Architect → Coder (3 levels)
  maxTotalPerRequest: 5,    // Max 5 handoffs per CEO request
  timeoutPerAgent: 300,     // 5 minutes per agent
  maxRetries: 2,            // Retry 2x on failure
  retryCooldownMs: 1000,    // 1 second between retries
};
```

### Claude Code Bridge: 3 Modes

| Mode | Flag | Description |
|------|------|-------------|
| READ | (default) | No file changes, output text only |
| PATCH | --patch | Claude outputs unified diff, CEO confirms |
| INTERACTIVE | --interactive | Opens Claude Code for human takeover |

### Risk Classification

```typescript
const RISK_LEVELS = {
  LOW: {
    actions: ["read_file", "search", "generate_spec", "generate_plan", "analyze"],
    confirmation: "none",
    agents: ["researcher", "pm", "architect"] // in READ mode
  },
  MEDIUM: {
    actions: ["create_test", "update_docs", "create_draft_pr", "run_tests"],
    confirmation: "batch",
    agents: ["tester"] // in READ mode
  },
  HIGH: {
    actions: ["modify_source", "apply_patch", "merge_pr", "update_config"],
    confirmation: "explicit",
    agents: ["coder", "reviewer"] // in PATCH mode
  },
  CRITICAL: {
    actions: ["delete_file", "db_migration", "deploy", "modify_secrets", "push_main"],
    confirmation: "explicit_with_audit",
    agents: ["devops"] // any mode
  }
};
```

---

## Files to Create

### Sprint 55A Files

```
src/agents/
├── types/
│   └── handoff.ts                    # Handoff JSON schema + guards [DONE]
├── orchestrator/
│   ├── mention-parser.ts             # Parse @agent mentions [DONE]
│   ├── agent-router.ts               # Route to existing agents [DONE]
│   └── handoff-guards.ts             # Validate transitions + limits
├── context/
│   ├── context-manifest.ts           # Manifest types
│   └── context-injector.ts           # Build Claude prompt from Brain
└── invoke/
    ├── claude-code-bridge.ts         # 3 modes: read/patch/interactive
    ├── patch-validator.ts            # Validate unified diff
    └── response-parser.ts            # Extract handoffs from response

src/cli/commands/
└── agent.ts                          # endiorbot @agent "message"
```

### Sprint 55B Files

```
src/agents/
├── orchestrator/
│   ├── workflow-engine.ts            # State machine for agent chains
│   └── resilience.ts                 # Retry, timeout, circuit breaker
├── handoff/
│   └── handoff-detector.ts           # Detect handoffs in responses
├── context/
│   └── project-verifier.ts           # Verify active.json state
└── safety/
    ├── risk-classifier.ts            # Classify action risk
    └── audit-logger.ts               # Log to JSONL

tests/integration/
├── agent-loop.test.ts                # Basic routing tests
└── workflow.test.ts                  # Full chain tests
```

---

## Sprint 55A Tasks (Day 1, 8-10h)

| # | Task | File | Hours | Status |
|---|------|------|-------|--------|
| 1 | Handoff Types + Schema | `src/agents/types/handoff.ts` | 0.5h | DONE |
| 2 | Mention Parser | `src/agents/orchestrator/mention-parser.ts` | 0.5h | DONE |
| 3 | Agent Router | `src/agents/orchestrator/agent-router.ts` | 1h | DONE |
| 4 | Handoff Guards | `src/agents/orchestrator/handoff-guards.ts` | 0.5h | PENDING |
| 5 | Context Manifest | `src/agents/context/context-manifest.ts` | 0.5h | PENDING |
| 6 | Context Injector | `src/agents/context/context-injector.ts` | 1.5h | PENDING |
| 7 | Claude Bridge (3 modes) | `src/agents/invoke/claude-code-bridge.ts` | 2.5h | PENDING |
| 8 | Patch Validator | `src/agents/invoke/patch-validator.ts` | 1h | PENDING |
| 9 | Response Parser | `src/agents/invoke/response-parser.ts` | 1h | PENDING |
| 10 | CLI @agent command | `src/cli/commands/agent.ts` | 1h | PENDING |

**55A Total: ~10h**

---

## Sprint 55B Tasks (Day 2, 8-10h)

| # | Task | File | Hours | Status |
|---|------|------|-------|--------|
| 1 | Workflow Engine | `src/agents/orchestrator/workflow-engine.ts` | 2h | PENDING |
| 2 | Risk Classifier | `src/agents/safety/risk-classifier.ts` | 1.5h | PENDING |
| 3 | Audit Logger | `src/agents/safety/audit-logger.ts` | 1h | PENDING |
| 4 | Resilience | `src/agents/orchestrator/resilience.ts` | 1h | PENDING |
| 5 | Handoff Detector | `src/agents/handoff/handoff-detector.ts` | 0.5h | PENDING |
| 6 | Project Verifier | `src/agents/context/project-verifier.ts` | 1h | PENDING |
| 7 | Integration Tests | `tests/integration/workflow.test.ts` | 1h | PENDING |
| 8 | Wire to existing CLI | Update `src/cli/commands/` | 1h | PENDING |

**55B Total: ~10h**

---

## Success Criteria

### Sprint 55A Definition of Done

```bash
# Test 1: Full agent invocation
endiorbot @pm "plan user authentication feature"
# → Loads SOUL-pm.md
# → Injects context (Tier 1 + 2)
# → Invokes Claude Code (READ mode)
# → Returns plan + handoff JSON

# Test 2: All 3 Claude modes work
endiorbot @coder "implement login endpoint"              # READ (default)
endiorbot @coder --patch "implement login endpoint"     # PATCH
endiorbot @coder --interactive "complex refactor"       # INTERACTIVE

# Test 3: Handoff routing
# PM returns: {"handoff":[{"to":"architect",...}]}
# → Router validates PM → Architect allowed
# → Prompts CEO: "Continue to @architect? (y/n)"

# Test 4: Context manifest logged
# Shows: injected files, token count, tier loaded

# Test 5: Invalid transition blocked
# @pm tries handoff to @devops → BLOCKED
```

### Sprint 55B Definition of Done

```bash
# Test 1: Full workflow chain
endiorbot @pm "implement payment gateway"
# → PM creates plan → handoff @architect
# → Architect creates spec → handoff @coder
# → Coder creates patch → CEO confirms
# → Applied → handoff @reviewer
# → Review complete

# Test 2: Risk classification
endiorbot @coder --patch "delete all test files"
# → Risk: CRITICAL
# → Explicit confirm required with warning

# Test 3: Audit log
cat ~/.endiorbot/logs/audit.jsonl | tail -5
# Shows: timestamp, agent, task, mode, cost, status

# Test 4: Timeout handling
# Agent takes >5 min → graceful timeout, workflow paused

# Test 5: Retry on transient failure
# Claude API timeout → retry 2x → then fail gracefully
```

---

## Audit Log Format

```jsonl
{"ts":"2026-02-28T10:30:00Z","id":"inv_abc123","agent":"pm","task":"plan payment gateway","project":"bflow","branch":"main","commit":"abc123","mode":"read","tier":"LITE","duration_ms":45000,"tokens_in":1500,"tokens_out":2000,"cost_usd":0.05,"risk":"LOW","status":"success","handoff_to":"architect","context_manifest":{"tier1":true,"tier2":true,"tokens":2500}}
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude Code CLI changes | High | Abstract behind bridge interface |
| Context too large | Medium | Token budget governance |
| Infinite handoff loops | High | Depth + total guards |
| Patch corruption | High | Patch validator + CEO confirm |

---

## References

- [Master Plan v3.1](../00-foundation/master-plan.md)
- [TS-003 Agent Orchestration](../02-design/14-Technical-Specs/TS-003-Agent-Orchestration.md)
- [ADR-001 Multi-Model Orchestrator](../02-design/01-ADRs/ADR-001-Multi-Model-Orchestrator.md)
- [SOUL Templates](../reference/templates/souls/)
- [Tier Configs](../reference/templates/configs/)

---

**Sprint 55 | Agent Orchestration Layer | 2026-02-28**
