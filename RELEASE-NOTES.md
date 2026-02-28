# Release Notes - v1.0.0

**Release Date**: 2026-02-28
**Sprint**: 54 - CEO Tool MVP
**Codename**: "Three Minds, One Decision"

---

## Highlights

This release introduces the **CEO Tool MVP** - a 3-model consultation system that brings together Claude, OpenAI, and Gemini for comprehensive expert advice.

### Key Features

- **3-Model Consultation**: Query Claude (Primary) + OpenAI + Gemini simultaneously
- **Model Selection**: Choose specific models via CLI flags (`--openai o3`, `--gemini gemini-2.5-pro`)
- **Smart Routing**: Automatic task classification routes coding tasks to Claude only, research to all 3
- **ActionControlPlane**: Security governance with risk-based approval workflow
- **Context Budget**: Token management with 2K/turn limit and 30-turn reset

---

## New Commands

### `endiorbot consult`
Query multiple AI models for expert consultation.

```bash
# Basic usage
endiorbot consult "design payment gateway integration"

# With model selection
endiorbot consult --openai o3 --gemini gemini-2.5-pro "complex design question"

# Force full 3-model consultation
endiorbot consult --full "should we use Redis or PostgreSQL?"

# Verbose output
endiorbot consult -v "architecture review"
```

### `endiorbot models`
List all available AI models for consultation.

```bash
endiorbot models
```

---

## New Modules

| Module | Description |
|--------|-------------|
| `src/gateway/chat-handler.ts` | 3-model consultation handler |
| `src/control-plane/action-control.ts` | ActionControlPlane with persistence |
| `src/brain/context-budget.ts` | Token budget governance |

---

## Available Models

### OpenAI (Critique)
- `o3` - Latest reasoning model
- `o3-mini` - Fast reasoning (default)
- `o1`, `o1-mini` - Previous gen reasoning
- `gpt-4o`, `gpt-4o-mini` - Chat models

### Gemini (Critique)
- `gemini-2.5-pro` - Latest Pro
- `gemini-2.0-flash-thinking` - Fast reasoning (default)
- `gemini-1.5-pro` - Previous gen
- `gemini-2.0-flash` - Fast

### Claude (Primary)
- `claude-opus-4` - Most capable
- `claude-sonnet-4` - Balanced (default)
- `claude-haiku-4` - Fast

---

## Risk Classification

| Level | Auto-Approve | Examples |
|-------|--------------|----------|
| READ | ✅ Yes | `git status`, `SELECT *` |
| WRITE | ✅ Yes | `git commit`, `INSERT INTO` |
| DESTRUCTIVE | ❌ No | `rm`, `DELETE FROM` |
| MONEY | ❌ No | `payment`, `refund` |
| ADMIN | ❌ No | `sudo`, `chmod` |

---

## Breaking Changes

None. This is the first stable release.

---

## Bug Fixes

- Fixed TypeScript `exactOptionalPropertyTypes` compliance
- Fixed unused import warnings
- Fixed provider initialization check in ChatHandler

---

## Test Coverage

- **3490 tests passing**
- **124 test files**
- New test suites:
  - `tests/control-plane/action-control.test.ts`
  - `tests/brain/context-budget.test.ts`

---

## Dependencies

No new dependencies added.

---

## Upgrade Instructions

```bash
# Pull latest code
git pull origin main

# Install dependencies
pnpm install

# Build
pnpm build

# Verify
./endiorbot.mjs --version  # Should show 1.0.0
./endiorbot.mjs models     # Should list available models
```

---

## Known Issues

None at release time.

---

## Contributors

- CEO Tool MVP Team
- CTO Review Complete
- PM Sign-off Complete

---

## Next Sprint

Sprint 55 will focus on:
- Desktop Gateway integration
- OTT channel notifications (Telegram/Zalo)
- Brain provenance tracking

---

*EndiorBot v1.0.0 | CEO Tool MVP | "Three Minds, One Decision"*
