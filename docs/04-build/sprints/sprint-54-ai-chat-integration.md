# Sprint 54: CEO Tool MVP - AI Chat Integration

**Status**: IN PROGRESS
**Duration**: 8-10 hours (~1 day)
**Goal**: Implement MVP CEO Tool with 2-model consultation

---

## Alignment with Master Plan v2.0

This sprint implements **Tier 1 — MVP** features from Master Plan v2.0:

```bash
endiorbot consult "<question>"  # 2 models, primary_with_notes
endiorbot gate status G2        # Read-only checklist
endiorbot switch <project>      # Minimal context
```

---

## Problem Statement

CEO spends 30-60 min per decision copying/pasting between AI apps.
EndiorBot reduces this to <30s with automated 2-model consultation.

**Current State:**
```
CEO → Open 5 apps → Copy/paste → Manually consolidate → 30-60 min
```

**Target State:**
```
CEO → EndiorBot → 2 models (auto) → Consolidated response → <30s
```

---

## Scope

### In Scope (MVP)

| Feature | Priority | Description |
|---------|----------|-------------|
| ChatHandler | P0 | 2-model consultation (Gemini + Opus) |
| AIRouter | P0 | Primary + fallback only |
| Context Budget | P0 | Max 2K tokens/turn, 3 blocks |
| ActionControlPlane Stub | P0 | propose → approve → execute pattern |
| Gate Status Read-only | P0 | `endiorbot gate status G2` |
| Web Chat AI | P1 | Real AI responses in browser |
| Telegram/Zalo notify | P1 | Notification only (not full chat) |

### Out of Scope (Per Master Plan v2.0)

- Full 4-provider multi-model (Tier 3)
- SDLC enforcement (Tier 3)
- Desktop shell (Tier 3)
- Skills gateway (Tier 3)
- Full OTT bidirectional chat (Tier 2)

---

## Architecture (MVP Minimal)

### Two Loops (from Master Plan v2.0)

```
Decision Loop:
Ask → Context → 2 Models → Consolidate → Propose → CEO Approve → Record

Delivery Loop:
Task → Brain context → Execute (single model) → Verify → Commit
```

### Message Flow (3 Models)

```
┌─────────────────────────────────────────────────────────────────┐
│                  CEO Tool MVP Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Ask: endiorbot consult "design payment gateway"               │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Chat Handler                           │   │
│  │                                                          │   │
│  │   1. Detect task type (coding vs research)              │   │
│  │   2. Inject Brain L4 context (max 2K tokens)            │   │
│  │   3. Route to appropriate models                         │   │
│  │   4. Consolidate with primary_with_notes                │   │
│  │   5. Return merged response                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AI Router (3 Models)                   │   │
│  │                                                          │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │   │   Claude    │  │   OpenAI    │  │   Gemini    │     │   │
│  │   │  (Primary)  │  │  (Critique) │  │  (Critique) │     │   │
│  │   │  Coding &   │  │  Research   │  │  Research   │     │   │
│  │   │   Docs      │  │  & Debate   │  │  & Debate   │     │   │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │   │
│  │          │                │                │             │   │
│  │          └────────────────┼────────────────┘             │   │
│  │                           ▼                              │   │
│  │           primary_with_notes consolidation               │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ActionControlPlane (Stub)                   │   │
│  │                                                          │   │
│  │   READ      → auto-approve                              │   │
│  │   WRITE     → auto-approve (within project)             │   │
│  │   DESTRUCT  → require CEO approval                      │   │
│  │   MONEY     → require CEO approval                      │   │
│  │   ADMIN     → require CEO approval                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Roles (3 Models)

| Provider | Default Model | Role | Use Case |
|----------|---------------|------|----------|
| **Anthropic** | Claude (via Claude Code) | Primary | Coding, documentation, SDLC |
| **OpenAI** | o3-mini (configurable) | Critique | Deep reasoning, design critique |
| **Google** | gemini-2.0-flash-thinking (configurable) | Critique | Reasoning, latest trends |

**Model Selection** (same as chatgpt.com/gemini.com):
```bash
# Use latest models via CLI flag
endiorbot consult --openai o3 --gemini gemini-2.5-pro "design question"

# Or configure defaults
~/.endiorbot/config.json: { "models": { "openai": "o3", "gemini": "gemini-2.5-pro" } }
```

**Available Models**:
- OpenAI: o3, o3-mini, o1, o1-mini, gpt-4o
- Gemini: gemini-2.5-pro, gemini-2.0-flash-thinking, gemini-1.5-pro

**Routing:**
- Coding/Docs → Claude only (fast)
- Architecture/Research → Claude + OpenAI + Gemini (full consultation)

### Merging Algorithm

```typescript
type MergeStrategy = 'primary_with_notes';

// primary_with_notes:
// - Use Claude response as primary (coding/docs)
// - Append OpenAI + Gemini critiques if different
// - Max combined response: 4K tokens

interface ConsolidatedResponse {
  primary: string;         // Claude response
  critiques?: {
    openai?: string;       // OpenAI critique
    gemini?: string;       // Gemini critique
  };
  agreement: 'full' | 'partial' | 'divergent';
  recommendation: string;
}

// Task Routing
// - Coding/Docs → Claude only (fast)
// - Architecture/Research → Claude + OpenAI + Gemini
```

---

## Technical Design

### 1. ChatHandler (`src/gateway/chat-handler.ts`)

```typescript
interface ChatRequest {
  message: string;
  channel: 'cli' | 'web' | 'telegram' | 'zalo';
  clientId: string;
  conversationId?: string;
}

interface ChatResponse {
  text: string;
  model: string;
  provider: string;
  agreement?: 'full' | 'partial' | 'divergent';
  notes?: string;
  tokenUsage: {
    input: number;
    output: number;
    budget: number;  // 2K max
  };
}

class ChatHandler {
  constructor(
    private aiRouter: AIRouter,
    private brain: BrainService,
    private controlPlane: ActionControlPlane
  ) {}

  // Inject Brain L4 at session start
  private injectBrainContext(): string;

  // 2-model consultation
  async consult(request: ChatRequest): Promise<ChatResponse>;

  // Single model for delivery loop
  async execute(request: ChatRequest): Promise<ChatResponse>;
}
```

### 2. AIRouter (`src/agents/ai-router.ts`)

```typescript
interface AIRouter {
  // 2-model consultation (Decision Loop)
  consultTwoModels(request: AIRequest): Promise<ConsolidatedResponse>;

  // Single model (Delivery Loop)
  querySingle(request: AIRequest): Promise<AIResponse>;

  // Fallback when primary fails
  queryWithFallback(request: AIRequest): Promise<AIResponse>;
}

interface RoutingContext {
  loop: 'decision' | 'delivery';
  channel: string;
  tokenBudget: number;  // 2K max
}
```

### 3. ActionControlPlane (`src/control-plane/action-control.ts`)

```typescript
// Stub implementation for MVP
interface ActionProposal {
  action: string;
  risk: 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';
  requiresApproval: boolean;
  idempotencyKey: string;
}

interface ActionControlPlane {
  // Evaluate action risk
  propose(action: string): ActionProposal;

  // Auto-approve or request CEO approval
  evaluate(proposal: ActionProposal): 'approve' | 'pending';

  // Execute approved action
  execute(proposal: ActionProposal): Promise<ActionResult>;

  // Record to audit log
  audit(proposal: ActionProposal, result: ActionResult): void;
}

// Default behaviors (MVP stub)
const RISK_RULES = {
  READ: { autoApprove: true },
  WRITE: { autoApprove: true, withinProject: true },
  DESTRUCTIVE: { autoApprove: false },
  MONEY: { autoApprove: false },
  ADMIN: { autoApprove: false },
};

// Blocked commands
const BLOCKED = ['rm -rf', 'DROP TABLE', 'git push --force'];
```

### 4. Context Budget Governance

```typescript
interface ContextBudget {
  maxTokensPerTurn: 2000;      // 2K max
  maxBlocksPerTurn: 3;         // 3 blocks max
  hardResetAfterTurns: 30;     // Reset context

  // Injection priority
  priority: [
    'brain.mentalModels',     // L4 always
    'brain.structures',       // L3 on project switch
    'brain.patterns',         // L2 on similar errors
    // L1 events: never (too noisy)
  ];
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/gateway/chat-handler.ts` | CREATE | 2-model consultation with Brain injection |
| `src/agents/ai-router.ts` | MODIFY | Reduce to 2 providers, add consolidation |
| `src/control-plane/action-control.ts` | CREATE | ActionControlPlane stub |
| `src/brain/context-budget.ts` | CREATE | Token budget governance |
| `src/cli/commands/consult.ts` | CREATE | `endiorbot consult` command |
| `src/cli/commands/gate.ts` | MODIFY | Add read-only status |

---

## Sprint Tasks

| # | Task | Hours | Priority | Status |
|---|------|-------|----------|--------|
| 1 | ChatHandler with 2-model consultation | 2h | P0 | PENDING |
| 2 | AIRouter (Gemini + Opus only) | 1.5h | P0 | PENDING |
| 3 | primary_with_notes consolidation | 1h | P0 | PENDING |
| 4 | ActionControlPlane stub | 1h | P0 | PENDING |
| 5 | Context Budget governance | 1h | P0 | PENDING |
| 6 | Gate status read-only | 0.5h | P0 | PENDING |
| 7 | CLI `consult` command | 1h | P0 | PENDING |
| 8 | Testing & documentation | 2h | P0 | PENDING |
| **Total** | | **10h** | | |

---

## Success Criteria (Per Master Plan v2.0)

| Metric | Target |
|--------|--------|
| Decision time | <30s (not 30-60 min) |
| Context switch | <2s |
| No copy/paste | 0 app switches |
| Gate status | At a glance |

### Test Cases

| Test | Expected |
|------|----------|
| `endiorbot consult "design payment gateway"` | Gemini + Opus consolidated response |
| Gemini timeout | Fallback to Opus only |
| Token budget exceeded | Truncate to 2K, warn user |
| `endiorbot gate status G2` | Read-only checklist |
| DESTRUCTIVE action proposed | Require CEO approval |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini rate limit | Medium | Fallback to Opus |
| Opus cost | Low | Primary is Gemini (free tier) |
| Brain context too large | Medium | Token budget governance |
| ActionControlPlane complexity | Low | MVP stub only |

---

## Definition of Done

- [ ] `endiorbot consult` returns 2-model response
- [ ] primary_with_notes consolidation works
- [ ] Token budget enforced (2K/turn)
- [ ] ActionControlPlane stub evaluates risk
- [ ] Gate status read-only works
- [ ] All tests passing
- [ ] Documentation updated

---

**CEO Tool MVP | Master Plan v2.0 Aligned**
*Sprint 54 | Created 2026-02-28*
