# CLAUDE.md - Claude Code Integration Guide

## Identity (LOCKED)

> **EndiorBot is a CEO Power Tool** — not a platform, not an SDLC enforcer.
> Help CEO get answers in <30s instead of 30-60 min.

## Overview

EndiorBot integrates with Claude Code (VSCode extension) as the primary development interface.
This document defines how Claude should behave when working on EndiorBot projects.

## 🚨 4 Non-Negotiable Invariants

```
1. THIN CLIENT PATTERN
   Claude Code commands = wrappers that call ./endiorbot.mjs
   NO business logic in .md files
   Gate checks, vibecoding, multi-model → all in EndiorBot core

2. STDIN JSON FOR HOOKS
   Hooks receive JSON via stdin, NOT positional arguments
   Always parse with jq: cat /dev/stdin | jq -r '.tool_name'
   Test: echo '{"tool_name":"Edit","file_path":"test.ts"}' | ./hook.sh

3. ENDIORBOT SOUL = GOVERNANCE, CLAUDE CODE = EXECUTION
   EndiorBot SOUL decides WHAT to build (PM, requirements, gates)
   Claude Code executes HOW to build (Architect, Coder, Reviewer)
   No PM agent in Claude Code (prevents orchestration conflict)

4. DEFAULT MODEL = SONNET
   Opus only for explicit architecture decisions
   Commands use model: sonnet unless specified
   Budget guard: track /cost regularly
```

## Claude Code Integration Examples

### Thin Client Pattern
```bash
# Commands call EndiorBot core, no business logic in .md files
! ./endiorbot.mjs gate check G3
! ./endiorbot.mjs consult "Redis vs PostgreSQL for sessions?"
```

### Hook stdin JSON Format
```bash
# Hooks receive JSON via stdin
INPUT=$(cat /dev/stdin)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')
```

### Custom Commands Available
- `/project:gate <gate-id>` - Check SDLC gate status
- `/project:consult <query>` - Multi-model consultation

## Project Context

- **Project:** EndiorBot
- **Type:** Solo developer tool for enterprise-scale projects
- **Framework:** MTS SDLC Framework 6.1.1
- **Primary Language:** TypeScript (ES2022, NodeNext)

## Configuration Files

| File | Purpose |
|------|---------|
| `.sdlc-config.json` | SDLC framework configuration |
| `IDENTITY.md` | Project identity and capabilities |
| `AGENTS.md` | AI agent guidelines (this links here) |
| `CLAUDE.md` | Claude-specific integration (this file) |
| `package.json` | Node.js package configuration |
| `tsconfig.json` | TypeScript configuration |

## Working Directory

```
~/.endiorbot/           # State directory
  ├── projects/         # Project contexts
  ├── evidence/         # Gate evidence
  ├── backups/          # Daily/weekly backups
  └── config.json       # User preferences
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ENDIORBOT_STATE_DIR` | State directory | `~/.endiorbot/` |
| `ENDIORBOT_CONFIG_PATH` | Config file path | `.sdlc-config.json` |
| `ENDIORBOT_PROFILE` | Active profile | `default` |
| `ENDIORBOT_DEBUG` | Debug mode | `false` |

## Code Style

### TypeScript
- Use strict mode
- Explicit types (no `any`)
- Prefer `const` over `let`
- Use template literals
- Document public APIs with JSDoc

### File Organization
```
src/
├── config/        # Configuration management
├── cli/           # CLI commands
├── agents/        # AI agent logic
│   ├── quality/   # Reflect, history compactor
│   └── resilience/ # Failover, tracking
├── security/      # Sanitizer, scrubber, guard
├── sdlc/          # Gate engine, CRP/MRP
│   ├── gates/     # Gate evaluation
│   └── vibecoding/ # Quality index
├── providers/     # AI model providers
├── gateway/       # WebSocket server
├── channels/      # Message channels
└── ceo/           # CEO convenience features
```

## Commands

### Development
```bash
pnpm install        # Install dependencies
pnpm build          # Build TypeScript
pnpm dev            # Watch mode
pnpm test           # Run tests
pnpm lint           # Check code style
```

### CLI
```bash
./endiorbot.mjs --help           # Show help
./endiorbot.mjs start <project>  # Start project
./endiorbot.mjs switch <project> # Switch context
./endiorbot.mjs gate status      # Show gate status
./endiorbot.mjs consult <query>  # Multi-model query

# Project Setup (Sprint 61)
./endiorbot.mjs init                          # Initialize SDLC structure
./endiorbot.mjs init --tier STANDARD          # Specify tier
./endiorbot.mjs init --analyze                # Dry-run preview
./endiorbot.mjs compliance check              # Verify SDLC compliance
./endiorbot.mjs compliance score              # Quick compliance score
```

## SDLC Integration

### Current Stage Detection
Claude should detect SDLC stage from:
1. Active branch name (feature/*, bugfix/*, etc.)
2. Recent file changes
3. `.sdlc-config.json` current_stage

### Gate Awareness
Before major changes, check gate requirements:
```typescript
// In code review or implementation
const gateStatus = await sdlc.evaluateGate('G2', featureId);
if (gateStatus.result !== 'PASS') {
  // Warn about missing requirements
}
```

## Security

### Input Handling
Always sanitize external input:
```typescript
import { sanitize } from '@security/input-sanitizer';

const safeInput = sanitize(userInput);
```

### Output Handling
Never expose sensitive data:
```typescript
import { scrub } from '@security/output-scrubber';

const safeOutput = scrub(response);
```

## Multi-Model Consultation

When uncertain or for architecture decisions:
```typescript
import { consult } from '@agents/multi-model';

const result = await consult({
  query: 'Design payment gateway integration',
  taskType: 'architecture',
  models: ['claude', 'gpt', 'gemini'],
});

// result.consensus contains merged recommendations
// result.disagreements contains differing opinions
```

## Error Messages

Use structured error format:
```typescript
throw new EndiorBotError({
  code: 'GATE_NOT_READY',
  message: 'G2 gate requirements not met',
  details: { missing: ['ADR', 'API spec'] },
  suggestion: 'Create ADR-001 before proceeding',
});
```

## Testing

### Unit Tests
```typescript
// src/security/__tests__/input-sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitize } from '../input-sanitizer';

describe('InputSanitizer', () => {
  it('should block SQL injection', () => {
    expect(sanitize("'; DROP TABLE users;--")).not.toContain('DROP');
  });
});
```

### Integration Tests
```bash
pnpm test:e2e       # End-to-end tests
pnpm test:security  # Security pattern tests
pnpm test:quality   # Quality layer tests
```

## Commit Messages

Follow conventional commits:
```
feat(sdlc): add G2 gate evaluation
fix(security): patch input sanitizer XSS pattern
docs(agents): update SDLC stage awareness
refactor(cli): simplify project switching
test(gates): add G3 checklist tests
```

## Pull Requests

Include:
1. Description of changes
2. SDLC stage affected
3. Gate requirements checked
4. Test coverage
5. Vibecoding Index score

## Context Drift Prevention

EndiorBot prevents context drift through these mechanisms:

### 1. Session Anchoring
- Brain L4 (Mental Models) injected at session start
- Max 2K tokens for context injection
- CEO profile preferences included

### 2. Single Source of Truth
```
~/.endiorbot/active.json = SSOT for all interfaces
All interfaces (CLI, Extension, Claude Code) must:
- Read active.json before executing
- Update timestamp after executing
```

### 3. Token Budget Governance
| Budget | Limit |
|--------|-------|
| Tokens per turn | 2K max |
| Blocks per turn | 3 max |
| Hard reset | Every 30 turns |

### 4. Injection Rules
| Block | When |
|-------|------|
| Anchor | Session start + every 10 turns |
| Refresh | On gate change |
| Dynamic | On architecture decision |
| Pattern | From Brain L2 on similar errors |

### 5. Big Picture Checkpoints
- Every 10 turns: Inject project vision summary
- Every 20 turns: Inject sprint goals
- On task completion: Inject next priorities

## Brain Integration

Brain has 4 layers (Iceberg model):

| Layer | Content | Inject When |
|-------|---------|-------------|
| L4 Mental Models | Decision heuristics | Session start |
| L3 Structures | Module maps | Project switch |
| L2 Patterns | Error signatures | On similar errors |
| L1 Events | Session logs | Never (too noisy) |

```typescript
// Access Brain context
import { getBrain } from '@brain';

const mentalModels = await getBrain().getMentalModels();
// Inject at session start
```

---

*Claude Code integration for EndiorBot v2.0*
*Identity: CEO Power Tool (LOCKED)*
*SDLC Framework v6.1.1*
