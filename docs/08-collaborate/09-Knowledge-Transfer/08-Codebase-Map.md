# Codebase Map

**Version**: 1.0.0
**Date**: 2026-02-22

This document maps the EndiorBot codebase structure and key files.

---

## Directory Structure

```
EndiorBot/
├── src/                      # Source code (~70 files, ~15K LOC)
│   ├── cli/                  # CLI commands
│   ├── config/               # Configuration
│   ├── sessions/             # Session management
│   ├── logging/              # Structured logging
│   ├── providers/            # AI providers
│   ├── agents/               # Agent orchestration
│   ├── security/             # Security modules
│   ├── sdlc/                 # SDLC framework
│   ├── infra/                # Infrastructure [Sprint 34]
│   └── utils/                # Utilities
├── tests/                    # Test files
├── docs/                     # Documentation
│   ├── 00-foundation/        # Problem statement, business case
│   ├── 01-planning/          # Sprint plans, roadmap
│   ├── 02-design/            # ADRs, technical specs
│   ├── 04-build/             # Current sprint, migration
│   └── 08-collaborate/       # Agent guidelines, knowledge transfer
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vitest.config.ts          # Test config
└── CLAUDE.md                 # Claude Code instructions
```

---

## Key Files by Module

### CLI (`src/cli/`)

| File | Purpose | LOC |
|------|---------|-----|
| `index.ts` | CLI entry point | ~50 |
| `commands/start.ts` | Start project session | ~100 |
| `commands/switch.ts` | Switch project context | ~80 |
| `commands/status.ts` | Show current status | ~60 |
| `commands/config.ts` | Config management | ~80 |
| `commands/gate.ts` | SDLC gate evaluation | ~100 |

### Config (`src/config/`)

| File | Purpose | LOC |
|------|---------|-----|
| `types.ts` | EndiorBotConfig interface | ~200 |
| `schema.ts` | Zod validation | ~350 |
| `io.ts` | Read/write config | ~300 |
| `defaults.ts` | Default values | ~200 |
| `paths.ts` | File path resolution | ~100 |

### Sessions (`src/sessions/`)

| File | Purpose | LOC |
|------|---------|-----|
| `session-manager.ts` | Create/load sessions | ~200 |
| `session-store.ts` | Persist to disk | ~150 |
| `token-counter.ts` | Token usage tracking | ~100 |
| `project-context.ts` | Project context (ADR-002) | ~200 |
| `context-switcher.ts` | Switch between projects | ~150 |
| `types.ts` | Session types | ~100 |

### Logging (`src/logging/`)

| File | Purpose | LOC |
|------|---------|-----|
| `logger.ts` | Logger class | ~450 |
| `formatters.ts` | JSON/pretty formats | ~300 |
| `redaction.ts` | Sensitive data scrubbing | ~200 |
| `transports.ts` | Console/file output | ~150 |
| `index.ts` | Module exports | ~160 |

### Providers (`src/providers/`)

| File | Purpose | LOC |
|------|---------|-----|
| `base.ts` | BaseProvider interface | ~100 |
| `registry.ts` | ProviderRegistry | ~150 |
| `types.ts` | Provider types | ~100 |
| `anthropic.ts` | Claude provider | ~200 |
| `openai.ts` | GPT provider | ~200 |
| `google.ts` | Gemini provider | ~200 |

### Agents (`src/agents/`)

| File | Purpose | LOC |
|------|---------|-----|
| `scope.ts` | AgentScope | ~150 |
| `orchestrator.ts` | Multi-model orchestration | ~300 |
| `souls/` | Agent personas (SOUL files) | ~500 |

### Security (`src/security/`)

| File | Purpose | LOC |
|------|---------|-----|
| `input-sanitizer.ts` | Input validation | ~150 |
| `output-scrubber.ts` | Output sanitization | ~100 |
| `shell-guard.ts` | Shell command safety | ~100 |

### SDLC (`src/sdlc/`)

| File | Purpose | LOC |
|------|---------|-----|
| `gate-engine.ts` | Gate evaluation | ~200 |
| `vibecoding/index.ts` | Quality metrics | ~150 |

### Infrastructure (`src/infra/`) - Sprint 34

| File | Purpose | LOC |
|------|---------|-----|
| `platform.ts` | OS detection | ~100 |
| `paths.ts` | Platform paths | ~80 |
| `env.ts` | Environment handling | ~100 |
| `shell-env.ts` | Shell environment | ~150 |

### Utils (`src/utils/`)

| File | Purpose | LOC |
|------|---------|-----|
| `boolean.ts` | Boolean parsing | ~40 |
| `string.ts` | String utilities | ~80 |
| `json.ts` | Safe JSON | ~60 |
| `hash.ts` | Hashing | ~50 |
| `time.ts` | Duration parsing | ~80 |

---

## Key Interfaces

### EndiorBotConfig (`src/config/types.ts`)

```typescript
interface EndiorBotConfig {
  version: string;
  profiles: Record<string, ProfileConfig>;
  activeProfile: string;
  gateway: GatewayConfig;
  sdlc: SDLCConfig;
  orchestrator: OrchestratorConfig;
  security: SecurityConfig;
}
```

### SessionState (`src/sessions/types.ts`)

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
```

### LogEntry (`src/logging/logger.ts`)

```typescript
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  logger?: string;
  correlationId?: string;
  sessionId?: string;
  projectId?: string;
  context?: Record<string, unknown>;
  error?: Error;
}
```

---

## Module Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                         Dependency Graph                         │
│                                                                  │
│   cli/                                                          │
│     └── config/, sessions/, logging/                            │
│                                                                  │
│   sessions/                                                     │
│     └── config/, logging/, utils/                               │
│                                                                  │
│   agents/                                                       │
│     └── providers/, logging/, sessions/, sdlc/                  │
│                                                                  │
│   providers/                                                    │
│     └── config/, logging/                                       │
│                                                                  │
│   sdlc/                                                         │
│     └── config/, logging/                                       │
│                                                                  │
│   logging/                                                      │
│     └── (no internal deps)                                      │
│                                                                  │
│   config/                                                       │
│     └── utils/ (minimal)                                        │
│                                                                  │
│   utils/                                                        │
│     └── (no internal deps)                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Planned New Modules (Autonomy Epic)

### Phase 1: Checkpoint (Sprint 35)

| File | Purpose |
|------|---------|
| `src/sessions/checkpoint.ts` | Save/restore state |
| `src/infra/git-automation.ts` | Auto-commit |
| `src/sessions/resume-handler.ts` | Resume logic |

### Phase 2: Escalation (Sprint 36)

| File | Purpose |
|------|---------|
| `src/agents/escalation-router.ts` | Route decisions |
| `src/agents/approval-queue.ts` | Pending approvals |
| `src/agents/budget-tracker.ts` | Cost monitoring |
| `src/agents/notification.ts` | Alert human |

### Phase 3: Self-Correction (Sprint 37)

| File | Purpose |
|------|---------|
| `src/agents/error-classifier.ts` | Classify errors |
| `src/agents/deterministic-fixer.ts` | Auto-fix |
| `src/agents/verifier.ts` | Verify fixes |

### Phase 4: Hybrid AI (Sprint 38)

| File | Purpose |
|------|---------|
| `src/providers/resource-router.ts` | Select AI |
| `src/providers/ollama.ts` | Local Ollama |
| `src/providers/quality-gate.ts` | Validate output |

### Phase 5: Parallel (Sprint 39)

| File | Purpose |
|------|---------|
| `src/agents/track-manager.ts` | Orchestrate tracks |
| `src/infra/file-lock.ts` | Prevent conflicts |

### Phase 6: Fix Logging (Sprint 40)

| File | Purpose |
|------|---------|
| `src/agents/fix-logger.ts` | Log attempts |
| `src/cli/commands/fixes.ts` | Review fixes |

---

## Test Coverage

| Module | Files | Coverage |
|--------|-------|----------|
| config/ | 8 | 85% |
| utils/ | 6 | 90% |
| logging/ | 6 | 82% |
| sessions/ | 5 | 75% |
| providers/ | 4 | 70% |
| security/ | 3 | 80% |

---

## Entry Points

| Entry | Path | Purpose |
|-------|------|---------|
| CLI | `src/cli/index.ts` | Command-line interface |
| Config | `src/config/index.ts` | Configuration API |
| Logging | `src/logging/index.ts` | Logging API |
| Sessions | `src/sessions/index.ts` | Session API |

---

*Codebase Map v1.0.0*
*SDLC Framework 6.1.1*
