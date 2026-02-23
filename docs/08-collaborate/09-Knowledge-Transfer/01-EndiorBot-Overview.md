# EndiorBot Overview

**Version**: 1.1.0
**Date**: 2026-02-22
**Status**: Active Development (Sprint 34)

---

## What is EndiorBot?

EndiorBot is a **solo developer productivity tool** that orchestrates AI agents for enterprise-scale software development. It combines:

1. **Multi-Model Orchestration**: Consult Claude, GPT, and Gemini in parallel for architecture decisions
2. **Project Context Switching**: Maintain separate contexts for multiple large codebases (~1M LOC each)
3. **SDLC Framework Compliance**: Built-in gates, sprints, and artifact generation
4. **AI Agent Personas**: Specialized "souls" (CTO, PM, Developer, Reviewer, etc.)
5. **Core Thinking Frameworks**: System Thinking + Design Thinking as foundation

---

## Core Thinking Frameworks

EndiorBot is built upon two fundamental thinking frameworks that CEO uses daily and are the foundation of SDLC Framework 6.1.1.

### System Thinking: Iceberg 4-Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    ICEBERG 4-LAYER MODEL                         │
│                                                                  │
│   ════════════════════════════════════════════════════════════  │
│   VISIBLE                                                        │
│   ════════════════════════════════════════════════════════════  │
│                                                                  │
│   Layer 1: EVENTS (What happened?)                              │
│   ─────────────────────────────────────────────────────────────  │
│   • Observable symptoms                                          │
│   • Bug reports, build failures, test failures                  │
│   • Reactive responses                                          │
│                                                                  │
│   ~~~~~~~~~~~~~ WATER LINE ~~~~~~~~~~~~~                        │
│                                                                  │
│   HIDDEN                                                         │
│   ════════════════════════════════════════════════════════════  │
│                                                                  │
│   Layer 2: PATTERNS (What trends repeat?)                       │
│   ─────────────────────────────────────────────────────────────  │
│   • Recurring issues                                            │
│   • Historical trends                                           │
│   • Anticipatory responses                                      │
│                                                                  │
│   Layer 3: STRUCTURES (What causes the patterns?)               │
│   ─────────────────────────────────────────────────────────────  │
│   • System architecture                                         │
│   • Organizational design                                       │
│   • Incentive structures                                        │
│   • Design improvements                                         │
│                                                                  │
│   Layer 4: MENTAL MODELS (What beliefs/assumptions drive this?) │
│   ─────────────────────────────────────────────────────────────  │
│   • Core assumptions                                            │
│   • Values and beliefs                                          │
│   • Paradigm shifts                                             │
│   • Transformational change                                     │
└─────────────────────────────────────────────────────────────────┘
```

**How EndiorBot Applies System Thinking:**

| Layer | EndiorBot Application |
|-------|----------------------|
| **Events** | Build error detected → Auto-fix attempt |
| **Patterns** | Same error type repeats → Log to fix-log.json |
| **Structures** | Architecture causing issues → Escalate to CEO for ADR |
| **Mental Models** | Assumptions challenged → Multi-model consultation |

### EndiorBot Self-Evolution via Iceberg Model

EndiorBot không chỉ apply Iceberg model cho problems, mà còn **tự học và tiến hoá** theo mô hình này:

```
┌─────────────────────────────────────────────────────────────────┐
│              ENDIORBOT SELF-EVOLUTION (ICEBERG)                  │
│                                                                  │
│   Layer 1: EVENT LEARNING                                       │
│   ─────────────────────────────────────────────────────────────  │
│   • Log each fix attempt (success/fail)                         │
│   • Track which strategies work                                 │
│   • fix-log.json captures individual events                     │
│                                                                  │
│   ~~~~~~~~~~~~~ Evolution Line ~~~~~~~~~~~~~                    │
│                                                                  │
│   Layer 2: PATTERN RECOGNITION                                  │
│   ─────────────────────────────────────────────────────────────  │
│   • Identify recurring error types                              │
│   • Recognize project-specific patterns                         │
│   • Weekly CEO review surfaces patterns                         │
│                                                                  │
│   Layer 3: STRUCTURAL IMPROVEMENT                               │
│   ─────────────────────────────────────────────────────────────  │
│   • Update fix strategies based on patterns                     │
│   • Improve task routing (Ollama vs Cloud)                      │
│   • Refine escalation thresholds                                │
│                                                                  │
│   Layer 4: MENTAL MODEL EVOLUTION                               │
│   ─────────────────────────────────────────────────────────────  │
│   • Challenge assumptions about what can be auto-fixed          │
│   • Evolve understanding of CEO preferences                     │
│   • Shift paradigms (e.g., "always escalate test failures"      │
│     → "some test failures can be auto-fixed")                   │
└─────────────────────────────────────────────────────────────────┘
```

**Self-Evolution Loop:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Fix Attempt (Event)                                           │
│         │                                                        │
│         ▼                                                        │
│   Log to fix-log.json ─────────────────────┐                    │
│         │                                   │                    │
│         ▼                                   │                    │
│   CEO Weekly Review ◀───────────────────────┤                    │
│         │                                   │                    │
│         ▼                                   │                    │
│   Pattern Identified ───────────────────────┤                    │
│         │                                   │                    │
│         ▼                                   │                    │
│   Update Fix Strategy ──────────────────────┤                    │
│         │                                   │                    │
│         ▼                                   │                    │
│   Better Fix Rate ──────────────────────────┘                    │
│         │                                                        │
│         ▼                                                        │
│   (Loop continues, EndiorBot evolves)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Evolution Metrics:**

| Level | Metric | Target (Sprint 40) |
|-------|--------|-------------------|
| Events | Fix attempts logged | 100% |
| Patterns | Recurring patterns identified | Weekly review |
| Structures | Fix strategies updated | Monthly |
| Mental Models | Paradigm shifts documented | Quarterly |

### Design Thinking: 5-Phase Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESIGN THINKING PROCESS                       │
│                                                                  │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│   │EMPATHIZE│──▶│ DEFINE  │──▶│ IDEATE  │──▶│PROTOTYPE│──▶│  TEST   │
│   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
│        │              │             │             │             │
│   Understand     Frame the      Generate      Build quick    Validate
│   user needs     problem       solutions     solutions     with users
│                                                                  │
│   ◀──────────────────── ITERATE ─────────────────────────────▶  │
└─────────────────────────────────────────────────────────────────┘
```

**How EndiorBot Applies Design Thinking:**

| Phase | EndiorBot Application |
|-------|----------------------|
| **Empathize** | Understand CEO's workflow, pain points |
| **Define** | Frame problem statements (ADRs, requirements) |
| **Ideate** | Multi-model consultation for diverse solutions |
| **Prototype** | Quick implementation with checkpoint/resume |
| **Test** | Self-correction loop, verify with build/test |

### Integration: System + Design Thinking

```
Problem Detected (Event)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    SYSTEM THINKING                             │
│                                                                │
│   Analyze: Is this Event → Pattern → Structure → Mental Model?│
└───────────────────────────────────────────────────────────────┘
        │
        ▼ (If structural/mental model issue)
┌───────────────────────────────────────────────────────────────┐
│                    DESIGN THINKING                             │
│                                                                │
│   Empathize → Define → Ideate → Prototype → Test → Iterate   │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
Solution Implemented
```

---

## SDLC Automation Principle

### "Do Stage 00-01 Well, Automate the Rest"

**CEO Insight**: Nếu Stage 00 (Foundation) và Stage 01 (Planning) được làm rất kỹ, việc tự động chạy các stage sau cho đến khi hoàn thiện project là hoàn toàn khả thi với sức mạnh của AI codex tools hiện nay (Claude Code, Cursor, etc.).

```
┌─────────────────────────────────────────────────────────────────┐
│              SDLC AUTOMATION FEASIBILITY MODEL                   │
│                                                                  │
│   HUMAN-INTENSIVE (Deep Thinking Required)                      │
│   ════════════════════════════════════════════════════════════  │
│                                                                  │
│   Stage 00: FOUNDATION                                          │
│   ─────────────────────────────────────────────────────────────  │
│   • Problem Statement (Why are we building this?)               │
│   • Business Case (What value does it create?)                  │
│   • Mental Models (What assumptions are we making?)             │
│   │                                                              │
│   │  ◀─── Iceberg Layer 4: Mental Models                       │
│   │  ◀─── Design Thinking: Empathize                            │
│   │                                                              │
│   Stage 01: PLANNING                                            │
│   ─────────────────────────────────────────────────────────────  │
│   • Requirements (What exactly do we need?)                     │
│   • Architecture Decisions (How will we build it?)              │
│   • Sprint Plans (When will we build what?)                     │
│   │                                                              │
│   │  ◀─── Iceberg Layer 3: Structures                          │
│   │  ◀─── Design Thinking: Define + Ideate                      │
│                                                                  │
│   ~~~~~~~~~~~~~ AUTOMATION LINE ~~~~~~~~~~~~~                   │
│                                                                  │
│   AI-AUTOMATABLE (With Good Foundation)                         │
│   ════════════════════════════════════════════════════════════  │
│                                                                  │
│   Stage 02: DESIGN                                              │
│   • Technical specs, API design, UI mockups                     │
│   │  ◀─── Design Thinking: Prototype                            │
│                                                                  │
│   Stage 03: DEVELOP                                             │
│   • Write code, implement features                              │
│   │  ◀─── Iceberg Layer 1-2: Events & Patterns                 │
│                                                                  │
│   Stage 04: BUILD                                               │
│   • Compile, bundle, package                                    │
│                                                                  │
│   Stage 05: TEST                                                │
│   • Unit tests, integration tests, E2E                          │
│   │  ◀─── Design Thinking: Test                                 │
│                                                                  │
│   Stage 06: DEPLOY                                              │
│   • CI/CD, staging, production                                  │
│                                                                  │
│   Stage 07: OPERATE                                             │
│   • Monitor, maintain, support                                  │
│                                                                  │
│   Stage 08: RETIRE                                              │
│   • Deprecate, migrate, archive                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Works

| Stage | Human Input | AI Automation | Rationale |
|-------|-------------|---------------|-----------|
| **00-01** | 80% | 20% | Mental models, structures need human judgment |
| **02** | 40% | 60% | Technical specs can be generated from requirements |
| **03-04** | 20% | 80% | Code generation is AI's strength |
| **05** | 10% | 90% | Test generation is highly automatable |
| **06-08** | 30% | 70% | CI/CD automation + AI monitoring |

### Implications for EndiorBot Autonomy

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Stage 00-01 Quality ────────────▶ Automation Confidence       │
│                                                                  │
│   Poor Foundation     → Low confidence → More escalations       │
│   Good Foundation     → Medium confidence → Some escalations    │
│   Excellent Foundation → High confidence → Minimal escalations  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**EndiorBot Strategy**:
1. **Assist thoroughly in Stage 00-01**: Multi-model consultation, ADR generation
2. **Gate quality**: G0 and G1 gates must be rigorous
3. **Then automate**: Stages 02-08 can run with minimal intervention
4. **Self-correct**: Auto-fix at Events/Patterns level
5. **Escalate**: Only for Structures/Mental Models issues

### Quality Gates for Automation Readiness

| Gate | Stage | Quality Criteria for Automation |
|------|-------|--------------------------------|
| **G0** | 00→01 | Problem statement clear, business case validated |
| **G1** | 01→02 | Requirements complete, ADRs approved, sprint planned |
| **G2** | 02→03 | Technical specs complete, APIs defined |

**Key Insight**: G0 and G1 are the "automation enablers". If they pass with high quality, G2-G8 can largely self-execute.

### Target User

A solo developer (CEO) working on multiple enterprise-scale projects who needs:
- Reduced decision time (30-60 min → 5 min)
- Context preservation across projects
- Consistent SDLC compliance
- Eventually: autonomous multi-hour work sessions

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 22+ LTS |
| Language | TypeScript | 5.x (strict mode) |
| Module System | ES2022 + NodeNext | - |
| Package Manager | pnpm | 10+ |
| Schema Validation | Zod | 3.x |
| Testing | Vitest | 2.x |
| Build | TypeScript Compiler | 5.x |

### Key Dependencies

```json
{
  "dependencies": {
    "zod": "^3.24.0",
    "chalk": "^5.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         EndiorBot CLI                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Command Layer                          │   │
│  │  start | switch | status | consult | gate | config       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Agent Layer                            │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │   CTO   │ │   PM    │ │  Dev    │ │Reviewer │        │   │
│  │  │  SOUL   │ │  SOUL   │ │  SOUL   │ │  SOUL   │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  │                                                          │   │
│  │  Multi-Model Orchestrator (ADR-001)                      │   │
│  │  • Query Dispatcher → Claude, GPT, Gemini               │   │
│  │  • Response Consolidator → Consensus                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Session Layer                           │   │
│  │  SessionManager | SessionStore | ProjectContext          │   │
│  │  (ADR-002: Context Switching)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Infrastructure Layer                      │   │
│  │  Config | Logging | Providers | Security | SDLC Engine   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Structure

```
src/
├── cli/                    # Command-line interface
│   └── commands/           # start, switch, status, config, gate
├── config/                 # Configuration management
│   ├── types.ts           # EndiorBotConfig interface
│   ├── schema.ts          # Zod validation
│   └── paths.ts           # File paths
├── sessions/               # Session management (ADR-002)
│   ├── session-manager.ts # Create/restore sessions
│   ├── session-store.ts   # Persist to disk
│   ├── token-counter.ts   # Token usage tracking
│   └── types.ts           # Session types
├── logging/                # Structured logging
│   ├── logger.ts          # Logger class with levels
│   ├── formatters.ts      # JSON/pretty output
│   ├── redaction.ts       # Sensitive data scrubbing
│   └── transports.ts      # Console/file output
├── providers/              # AI model providers
│   ├── base.ts            # BaseProvider interface
│   ├── registry.ts        # ProviderRegistry
│   └── types.ts           # Provider types
├── agents/                 # Agent orchestration
│   ├── scope.ts           # AgentScope
│   └── orchestrator.ts    # Multi-model orchestration
├── security/               # Security modules
│   ├── input-sanitizer.ts
│   ├── output-scrubber.ts
│   └── shell-guard.ts
├── sdlc/                   # SDLC Framework
│   ├── gate-engine.ts     # Gate evaluation
│   └── vibecoding/        # Quality metrics
└── infra/                  # Infrastructure [Sprint 34]
    ├── platform.ts        # OS detection
    ├── paths.ts           # Platform paths
    └── shell-env.ts       # Shell environment
```

---

## Key Interfaces

### Session Management

```typescript
interface SessionState {
  id: string;
  projectId: string;
  conversationId: string;
  tokenCount: number;
  maxTokens: number;
  messages: Message[];
  activeTask?: string;
  sdlcStage: SDLCStage;
  createdAt: Date;
  lastActive: Date;
}

interface ProjectContext {
  id: string;
  name: string;
  path: string;
  tier: 'LITE' | 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE';
  sdlcConfig: SDLCConfig;
  session: SessionState;
  git: GitState;
}
```

### Multi-Model Orchestration

```typescript
interface ExpertConsultation {
  taskId: string;
  taskType: 'architecture' | 'security' | 'code_review' | 'research';
  query: string;
  models: ModelQuery[];
  responses: ModelResponse[];
  consensus: ConsensusResult;
  decision?: CEODecision;
}

interface ConsensusResult {
  hasConsensus: boolean;
  consensusPoints: string[];
  disagreements: Disagreement[];
  recommendation: string;
}
```

### Logging

```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  logger?: string;
  correlationId?: string;  // ADR-001
  sessionId?: string;      // ADR-002
  projectId?: string;      // ADR-002
  context?: Record<string, unknown>;
  error?: Error;
}
```

---

## Configuration

```typescript
interface EndiorBotConfig {
  version: string;
  profiles: Record<string, ProfileConfig>;
  activeProfile: string;

  gateway: {
    port: number;
    host: string;
    autoStart: boolean;
    connectionTimeout: number;
  };

  sdlc: {
    enabled: boolean;
    framework: string;  // "6.1.1"
    tier: ProjectTier;
    docsRoot: string;
    strict: boolean;
  };

  orchestrator: {
    maxParallelQueries: number;
    perModelTimeout: number;
    totalTimeout: number;
    fallbackBehavior: 'use_available' | 'require_minimum' | 'fail_fast';
  };

  security: {
    inputSanitizer: { enabled: boolean };
    outputScrubber: { enabled: boolean };
    shellGuard: { enabled: boolean };
  };
}
```

---

## Current Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-model consultation | ✅ | Claude, GPT, Gemini |
| Project context switching | ✅ | Up to 5 projects |
| Session persistence | ✅ | Disk-based |
| SDLC gate evaluation | ✅ | G-Sprint gates |
| Structured logging | ✅ | JSON + pretty |
| Sensitive data redaction | ✅ | API keys, tokens |
| Token counting | ✅ | Per-session limits |

---

## Planned Capabilities (Autonomy Epic)

| Feature | Sprint | Status |
|---------|--------|--------|
| Checkpoint/Resume | 35 | Planned |
| Budget Control | 36 | Planned |
| Self-Correction | 37 | Planned |
| Hybrid AI (Ollama) | 38 | Planned |
| Parallel Tracks | 39 | Planned |
| Fix Logging | 40 | Planned |
| Desktop UI | Future | Planned |

---

## Storage Layout

```
~/.endiorbot/
├── config.json              # User configuration
├── projects/
│   ├── bflow-001/
│   │   ├── context.json     # Project context
│   │   └── history.jsonl    # Conversation history
│   └── nqh-bot-001/
│       ├── context.json
│       └── history.jsonl
├── active.json              # Currently active project
├── registry.json            # Registered projects
└── logs/
    └── endiorbot.log        # Application logs
```

---

## Related Documents

- [ADR-001: Multi-Model Orchestrator](02-ADR-Summary.md#adr-001)
- [ADR-002: Project Context Switching](02-ADR-Summary.md#adr-002)
- [Sprint 33-34 Progress](03-Sprint-33-34-Progress.md)
- [Codebase Map](08-Codebase-Map.md)

---

*EndiorBot Overview v1.0.0*
*SDLC Framework 6.1.1*
