# MTS-OpenClaw → EndiorBot Migration Checklist

## Overview

This document tracks the migration of MTS-OpenClaw core modules to EndiorBot.
Following Option B: Sprint 29 parallel execution (code + ADRs).

---

## Environment Variables Transformation

| Current | New | Files Affected |
|---------|-----|----------------|
| `OPENCLAW_NIX_MODE` | `ENDIORBOT_NIX_MODE` | paths.ts |
| `OPENCLAW_STATE_DIR` | `ENDIORBOT_STATE_DIR` | paths.ts, utils.ts |
| `OPENCLAW_CONFIG_PATH` | `ENDIORBOT_CONFIG_PATH` | paths.ts |
| `OPENCLAW_OAUTH_DIR` | `ENDIORBOT_OAUTH_DIR` | paths.ts |
| `OPENCLAW_GATEWAY_PORT` | `ENDIORBOT_GATEWAY_PORT` | paths.ts |
| `OPENCLAW_GATEWAY_TOKEN` | `ENDIORBOT_GATEWAY_TOKEN` | paths.ts |
| `OPENCLAW_PROFILE` | `ENDIORBOT_PROFILE` | paths.ts |
| `OPENCLAW_AGENT_DIR` | `ENDIORBOT_AGENT_DIR` | paths.ts |
| `OPENCLAW_SKIP_*` | `ENDIORBOT_SKIP_*` | various |
| `OPENCLAW_TEST_*` | `ENDIORBOT_TEST_*` | tests |
| `OPENCLAW_DEBUG_*` | `ENDIORBOT_DEBUG_*` | logging |

## Directory & File Names

| Current | New | Context |
|---------|-----|---------|
| `~/.openclaw/` | `~/.endiorbot/` | User state directory |
| `openclaw.json` | `endiorbot.json` | Config file |
| `openclaw-<uid>` | `endiorbot-<uid>` | Temp/lock directory |
| `.clawdbot`, `.moltbot` | Keep as legacy | Backward compatibility |

## Hardcoded Strings

| File | Current | New |
|------|---------|-----|
| cli-name.ts | `DEFAULT_CLI_NAME = "openclaw"` | `"endiorbot"` |
| cli-name.ts | `/(openclaw)\b/` | `/(endiorbot)\b/` |
| banner.ts | `"🦞 MTS-OpenClaw"` | `"🤖 EndiorBot"` |
| zod-schema.ts | `z.literal("openclaw")` | `z.literal("endiorbot")` |

## Type Names (Optional Refactoring)

| Current | New |
|---------|-----|
| `MTS-OpenClawConfig` | `EndiorBotConfig` |
| `MTS-OpenClawSchema` | `EndiorBotSchema` |

---

## Migration Phases

### Phase 1: Critical (Week 1) ✅ In Progress

- [x] Create directory structure
- [x] Create package.json, tsconfig.json
- [x] Create endiorbot.mjs CLI entry
- [x] Create .sdlc-config.json
- [x] Create IDENTITY.md, AGENTS.md, CLAUDE.md
- [ ] Migrate src/config/paths.ts (with transformations)
- [ ] Migrate src/config/schema.ts
- [ ] Migrate src/utils/utils.ts
- [ ] Migrate src/shared/text/

### Phase 2: Core Config (Week 1-2)

- [ ] config/types.ts → EndiorBotConfig
- [ ] config/zod-schema.ts (core validation)
- [ ] config/defaults.ts
- [ ] config/validation.ts
- [ ] config/io.ts

### Phase 3: CLI Framework (Week 2)

- [ ] cli/cli-name.ts (transformed)
- [ ] cli/program.ts
- [ ] cli/banner.ts (transformed)
- [ ] cli/argv.ts
- [ ] cli/route.ts

### Phase 4: Providers & Sessions (Week 2-3)

- [ ] providers/ (AI model adapters)
- [ ] sessions/ (state management)
- [ ] gateway/ (WebSocket server core)

---

## Grep Verification Commands

```bash
# Before release, verify no old references remain:

# Check for openclaw in source files
grep -r "openclaw" src/ --include="*.ts" | grep -v "// legacy"

# Check for OPENCLAW in env vars
grep -r "OPENCLAW_" src/ --include="*.ts"

# Check for .openclaw directory references
grep -r "\.openclaw" src/ --include="*.ts"

# Check config file references
grep -r "openclaw\.json" src/ --include="*.ts"
```

---

## Module Statistics (from MTS-OpenClaw)

| Module | Files | LOC | Priority |
|--------|-------|-----|----------|
| config/ | 132 | ~17,000 | P0 |
| utils/ | 13 | ~900 | P0 |
| shared/ | 2 | ~116 | P0 |
| cli/ | 170 | ~17,000 | P1 |
| agents/ | ~50 | ~8,000 | P1 |
| providers/ | ~30 | ~5,000 | P1 |
| gateway/ | ~20 | ~3,000 | P2 |
| channels/ | ~15 | ~2,000 | P2 |

---

## Dependency Graph

```
shared/ (pure utils, no deps)
   ↓
utils/ (depends on shared/)
   ↓
config/ (depends on utils/, shared/)
   ↓
cli/ (depends on config/, utils/, shared/)
   ↓
agents/ (depends on config/, providers/)
   ↓
gateway/ (depends on config/, agents/, channels/)
```

---

## Verification Checklist

- [ ] `pnpm install` succeeds
- [ ] `pnpm build` succeeds (TypeScript compiles)
- [ ] `pnpm test` passes
- [ ] `./endiorbot.mjs --help` works
- [ ] `./endiorbot.mjs --version` shows correct version
- [ ] No grep matches for "openclaw" (except legacy comments)
- [ ] State directory created at `~/.endiorbot/`
- [ ] Config file created at `~/.endiorbot/endiorbot.json`

---

*Last updated: 2026-02-22*
*Sprint 29, Day 1*
