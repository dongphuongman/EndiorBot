# CLAUDE.md - Claude Code Integration Guide

## Overview

EndiorBot integrates with Claude Code (VSCode extension) as the primary development interface.
This document defines how Claude should behave when working on EndiorBot projects.

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

---

*Claude Code integration for EndiorBot*
*SDLC Framework v6.1.1*
