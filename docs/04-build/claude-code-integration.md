# Claude Code Integration for EndiorBot

**Date**: 2026-02-27
**Sprint**: 49
**Focus**: Apply Claude Code best practices to EndiorBot development

---

## Overview

EndiorBot is designed to work seamlessly with **Claude Code** as the primary AI development tool. This document maps Claude Code features to EndiorBot's SDLC automation capabilities.

**Critical Architecture Principle**: Claude Code commands are **thin clients** that call EndiorBot gateway. All business logic lives in EndiorBot core (`./endiorbot.mjs`), NOT in `.claude/` files. This ensures **Single Source of Truth (SSOT)** and prevents logic drift.

---

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

---

## 1. Extension System Integration

### 1.1 CLAUDE.md — Project Memory ✅

**Status**: Already implemented at `/CLAUDE.md`

**Current Content**:
- Project context (solo developer tool for enterprise-scale projects)
- SDLC Framework 6.1.1 integration
- TypeScript code style
- Command reference
- Security guidelines
- Multi-model consultation patterns

**Enhancements Needed**:
```markdown
# Add to CLAUDE.md:

## EndiorBot-Specific Patterns

### Multi-Model Consultation
When uncertain about architecture:
```typescript
import { consult } from '@agents/multi-model';
const result = await consult({
  query: 'Design payment gateway integration',
  taskType: 'architecture',
  models: ['claude', 'gpt', 'gemini'],
});
```

### SDLC Gate Checks
Before major changes:
```typescript
const gateStatus = await sdlc.evaluateGate('G2', featureId);
if (gateStatus.result !== 'PASS') {
  // Warn about missing requirements
}
```

### Security Patterns
Always sanitize external input:
```typescript
import { sanitize } from '@security/input-sanitizer';
const safeInput = sanitize(userInput);
```
```

---

### 1.2 Custom Slash Commands 🆕

**Location**: `.claude/commands/`

**Commands to Create**:

#### `/project:gate` - Check SDLC Gate Status
```markdown
<!-- .claude/commands/gate.md -->
---
description: Check SDLC gate status and requirements
argument-hint: gate-id (G0, G0.1, G1, G2, G3, G4)
allowed-tools: ["Bash"]
model: sonnet
---

# Check SDLC Gate Status

**THIN CLIENT**: This command calls EndiorBot core. NO business logic here.

```bash
! ./endiorbot.mjs gate check $ARGUMENTS
```

The output includes:
- Gate ID and status (PASS/FAIL/PENDING)
- Checklist items (✅/❌)
- Evidence collected
- Vibecoding index
- Recommendation

All logic is in `src/sdlc/gates/gate-engine.ts` (SSOT).
```

#### `/project:vibecoding` - Calculate Vibecoding Index
**STATUS**: Sprint 52+ (requires baseline data)

Sprint 52 uses **vibecoding-lite** (tsc + lint + test coverage check) via hooks only.

Full command deferred to Sprint 52 after composite index baseline established.

#### `/project:consult` - Multi-Model Consultation
```markdown
<!-- .claude/commands/consult.md -->
---
description: Query multiple AI models for expert opinions
argument-hint: query or question
allowed-tools: ["Bash"]
model: sonnet
---

# Multi-Model Consultation

**THIN CLIENT**: Calls EndiorBot gateway for multi-model orchestration.

```bash
! ./endiorbot.mjs consult "$ARGUMENTS"
```

EndiorBot gateway will:
1. Classify task type (architecture/security/code_review/research)
2. Select expert panel (Claude + GPT + Gemini + Mistral)
3. Query models in parallel
4. Consolidate responses
5. Return consensus + disagreements + SDLC compliance

Output format:
- RECOMMENDATION: [summary]
- CONSENSUS: [agreements]
- CONCERNS: [disagreements]
- SDLC: [compliance status]

All orchestration logic in `src/agents/multi-model/` (SSOT).
```

#### `/project:switch` - Project Context Switching
**STATUS**: ⚠️ REMOVED FROM SPRINT 50

**Reason**: High risk of state corruption (3/3 expert consensus).

**Alternatives**:
1. Use separate Claude Code sessions per project (safer)
2. Use git worktrees: `claude -w feature-branch`
3. Defer to Sprint 52+ after multi-project workflow validated

---

### 1.3 Skills — Auto-Invoked Knowledge 🆕

**Location**: `.claude/skills/`

**Skills to Create**:

#### `sdlc-compliance/SKILL.md`
**STATUS**: Sprint 53 (deferred from Sprint 52)

**Reason**: Skills require correct format without `trigger:` or `priority:` YAML keys. Claude auto-detects when to use based on description content.

**Correct format** (for Sprint 53):
```markdown
---
description: SDLC compliance checking for gate requirements, vibecoding thresholds, and required artifacts before code changes or PR merges
---

# SDLC Compliance Checker

**When to use this skill**: Before major code changes, PR merges, architecture decisions, or breaking changes.

## Context Detection Keywords
User mentions: "gate", "G0-G4", "SDLC", "compliance", "merge PR", "ready to commit"

## What to Check
1. Current SDLC stage from `.sdlc-config.json`
2. Gate requirements for current stage
3. Vibecoding index threshold (< 60 for merge)
4. Required artifacts (ADRs, specs, tests)
5. Evidence collection status

## Example Workflow
User: "I want to merge this PR"
→ Read `.sdlc-config.json`
→ Check G3 gate requirements
→ Validate test coverage exists
→ Check vibecoding-lite (tsc + lint pass)
→ Recommend approve/reject with evidence
```

**Note**: Skill content should describe behavior, NOT include YAML triggers. Claude decides when to invoke based on semantic match.

#### `multi-model-router/SKILL.md`
**STATUS**: Sprint 53 (after EndiorBot gateway multi-model stable)

**Reason**: Multi-model consultation requires EndiorBot gateway, not native Claude Code. Skills format also corrected.

**Correct format** (for Sprint 53):
```markdown
---
description: Route uncertain architecture decisions and security-critical changes to multi-model consultation via EndiorBot gateway for consensus-based recommendations
---

# Multi-Model Consultation Router

**When to use this skill**: Architecture decisions, security reviews, technology selection, or when Claude confidence < 0.7

## Context Detection Keywords
User asks: "should I use X or Y?", "which is better", "compare alternatives", "security review needed"

## When to Consult
- Architecture decisions (e.g., "Redis vs PostgreSQL for sessions?")
- Security-critical changes
- Performance optimization strategies
- Breaking changes with unclear impact
- Technology/framework selection

## DO NOT Consult For
- Simple bug fixes
- Routine code generation
- File reading/searching
- Documentation writing

## Workflow
Suggest to user: `/project:consult "user's question"`

EndiorBot gateway handles:
1. Task type classification
2. Expert panel selection
3. Parallel querying (Claude + GPT + Gemini + Mistral)
4. Response consolidation
5. SDLC compliance check
```

**Note**: Skill recommends using `/project:consult` command. Does NOT implement multi-model logic itself.

#### `security-validator/SKILL.md`
**STATUS**: Sprint 53 (after secret scanner implementation)

**Reason**: Security validation handled by PreToolUse hook in Sprint 52. Full skill requires secret scanner baseline.

**Sprint 52 Coverage** (via hook in Sprint 52):
- Block writes to: `.env*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*credentials*`
- Warn on ADR missing for `src/providers/*`, `src/gateway/*`

**Sprint 53 Skill** (description-based):
```markdown
---
description: Validate external input and prevent secret exposure in code, especially for OTT messages, API requests, and user-provided data
---

# Security Input Validator

**When to use this skill**: Processing external input (OTT, API, user files, shell commands, database queries)

## Context Detection
User working with: Telegram, Zalo, API endpoints, file uploads, shell commands, database queries

## Validation Patterns
Reference `src/security/input-sanitizer.ts` for 12 patterns:
SQL injection, XSS, command injection, path traversal, LDAP, XML, NoSQL, email header, template, SSI, file upload, XXE

## Auto-Apply Pattern
```typescript
import { sanitize } from '@security/input-sanitizer';
const safeInput = sanitize(userInput);
```

## Output Scrubbing
Never expose: API keys, passwords, tokens, AWS credentials, private keys, database URLs

Reference `src/security/output-scrubber.ts` for patterns.
```

---

### 1.4 Sub-Agents — Specialized Helpers 🆕

**Location**: `.claude/agents/`

**Agents to Create** (Sprint 53):

**IMPORTANT**: NO PM agent in Claude Code to prevent orchestration conflict with EndiorBot SOUL.

| Agent | Owner | Purpose |
|-------|-------|---------|
| PM (WHAT to build) | EndiorBot SOUL | Requirements, backlog, priorities, gates |
| Architect (HOW to build) | Claude Code + EndiorBot | Design decisions, ADRs (collaborative) |
| Coder (BUILD it) | Claude Code | Code generation, implementation |
| Reviewer (VERIFY it) | Claude Code + EndiorBot | Code review, quality checks |

**Sprint 53 Agents** (3 agents, not 4):

#### `architect.md` - Architecture Agent
```markdown
---
name: Architect
model: opus
description: Design decisions, ADRs, technical specifications
allowed-tools: ["Read", "Grep", "Glob", "WebSearch"]
max-turns: 15
---

# Architect Agent

## Role
You are the Solution Architect for EndiorBot. Focus on HOW to build.

## Responsibilities
1. Architecture decisions
2. Write ADRs (Architecture Decision Records)
3. Design technical specifications
4. Technology selection
5. Performance & scalability planning

## Workflow
1. Understand requirements (from PM)
2. Research alternatives
3. Evaluate trade-offs
4. Write ADR
5. Create technical spec
6. Present to CEO for approval

## Multi-Model Consultation
For major decisions, use multi-model consultation:
- Claude Opus (primary)
- GPT-5 (scaling analysis)
- Gemini (GCP integration)

## Output Format
- ADR-XXX-Title.md
- Technical spec (docs/02-design/14-Technical-Specs/)
- API spec (docs/02-design/15-API-Specs/)
```

#### `coder.md` - Implementation Agent
```markdown
---
name: Coder
model: sonnet
description: Code generation, implementation, refactoring
allowed-tools: ["Read", "Edit", "Write", "Bash", "Grep"]
max-turns: 20
---

# Coder Agent

## Role
You are the Implementation Engineer. Focus on BUILDING.

## Responsibilities
1. Implement features from specs
2. Follow coding standards
3. Write tests (target 80% coverage)
4. Refactor for maintainability
5. Fix bugs

## Workflow
1. Read ADR and spec
2. Generate code
3. Write tests
4. Run tests
5. Calculate vibecoding index
6. Commit with SDLC metadata

## Quality Standards
- TypeScript strict mode
- No `any` types
- JSDoc for public APIs
- Input sanitization for external data
- Output scrubbing for sensitive data

## Auto-Checks
- Vibecoding index < 40 (green zone)
- Test coverage > 80%
- No security vulnerabilities
```

#### `reviewer.md` - Code Review Agent
```markdown
---
name: Reviewer
model: sonnet
description: Code review, quality checks, security audit
allowed-tools: ["Read", "Grep", "Glob", "Bash"]
max-turns: 10
---

# Reviewer Agent

## Role
You are the Code Reviewer. Focus on QUALITY & SECURITY.

## Responsibilities
1. Review pull requests
2. Check SDLC compliance
3. Security audit
4. Calculate vibecoding index
5. Recommend approve/reject

## Review Checklist
- [ ] Code follows standards
- [ ] Tests pass
- [ ] Test coverage > 80%
- [ ] Vibecoding index < 60
- [ ] No security vulnerabilities
- [ ] ADR exists (if architecture change)
- [ ] Gate requirements met
- [ ] No secrets in code
- [ ] Input sanitized
- [ ] Output scrubbed

## Output Format
- PR review comment
- Gate recommendation
- Security findings
- Quality score
```

---

### 1.5 MCP Servers — External Tool Connections 🆕

**Planned MCP Integrations**:

#### GitHub MCP
```bash
claude mcp add github "npx -y @modelcontextprotocol/server-github"
```

**Use Cases**:
- Create/update issues
- Manage pull requests
- Read repository data
- GitHub Actions integration

#### Telegram MCP (Custom)
```bash
claude mcp add telegram "node ~/.endiorbot/mcp/telegram-server.js"
```

**Use Cases**:
- Send OTT notifications
- Receive magic link approvals
- Bidirectional chat

#### Brain MCP (Custom)
```bash
claude mcp add brain "node ~/.endiorbot/mcp/brain-server.js"
```

**Use Cases**:
- Persistent memory layers
- Context retrieval
- Knowledge graph queries

---

## 2. Permission Modes Workflow

### Plan Mode → Normal → Auto-Accept Pattern

```bash
# Phase 1: Architecture Planning (Plan Mode)
$ claude
> Shift+Tab → Plan Mode
> "Design payment gateway integration for AR module"
> Claude explores, reads ADRs, researches
> Review plan, approve approach

# Phase 2: Implementation (Normal Mode)
> Shift+Tab → Normal Mode
> "Implement the approved plan"
> Claude asks permission for each file write
> CEO approves critical changes

# Phase 3: Testing (Auto-Accept Mode)
> Shift+Tab → Auto-Accept Mode
> "Run tests and fix any failures"
> Claude iterates quickly without asking
> CEO monitors progress
```

### Recommended Mode per Task

| Task Type | Mode | Reason |
|-----------|------|--------|
| Architecture decisions | Plan | Explore without side effects |
| Spec writing | Plan | Research & draft |
| New feature implementation | Normal | Review each change |
| Bug fixes | Auto-Accept | Fast iteration |
| Refactoring | Normal | Risky changes |
| Test writing | Auto-Accept | Low risk |
| Documentation | Auto-Accept | Low risk |
| SDLC gate evaluation | Plan | Read-only analysis |

---

## 3. Hooks — Event Automation 🆕

**Location**: `.claude/settings.json` → `hooks`

### PostToolUse — Quality Automation

```json
{
  "hooks": {
    "postToolUse": {
      "enabled": true,
      "script": ".claude/hooks/post-tool-use.sh"
    }
  }
}
```

**Script**: `.claude/hooks/post-tool-use.sh`
```bash
#!/bin/bash
# Post-tool-use hook: Auto-quality checks
# Input: JSON via stdin (NOT positional args)

# Read JSON from stdin
INPUT=$(cat /dev/stdin)

# Parse with jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

# Exit if required fields missing
[[ -z "$TOOL_NAME" ]] && exit 0
[[ -z "$FILE_PATH" ]] && exit 0

case $TOOL_NAME in
  "Edit"|"Write")
    # Lint on touched package (NOT auto-format to avoid loops)
    if [[ $FILE_PATH == src/* ]] || [[ $FILE_PATH == apps/* ]]; then
      PKG_DIR=$(dirname "$FILE_PATH")
      # Find nearest package.json
      while [[ "$PKG_DIR" != "." ]] && [[ ! -f "$PKG_DIR/package.json" ]]; do
        PKG_DIR=$(dirname "$PKG_DIR")
      done

      if [[ -f "$PKG_DIR/package.json" ]]; then
        echo "🔍 Linting: $PKG_DIR"
        (cd "$PKG_DIR" && pnpm lint --fix "$FILE_PATH" 2>/dev/null) || true
      fi
    fi

    # Vibecoding-lite check for src/ changes
    if [[ $FILE_PATH == src/* ]]; then
      echo "📊 Vibecoding-lite: $FILE_PATH"
      # Check: tsc pass? lint pass? test exists?
      pnpm tsc --noEmit --project tsconfig.json 2>&1 | grep -q "$FILE_PATH" && echo "⚠️  TypeScript errors"
    fi
    ;;
esac
```

**Test**:
```bash
echo '{"tool_name":"Edit","file_path":"src/test.ts"}' | .claude/hooks/post-tool-use.sh
```

### PreToolUse — SDLC Validation

```json
{
  "hooks": {
    "preToolUse": {
      "enabled": true,
      "script": ".claude/hooks/pre-tool-use.sh"
    }
  }
}
```

**Script**: `.claude/hooks/pre-tool-use.sh`
```bash
#!/bin/bash
# Pre-tool-use hook: SDLC compliance + secret guard
# Input: JSON via stdin (NOT positional args)

# Read JSON from stdin
INPUT=$(cat /dev/stdin)

# Parse with jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

# Exit if required fields missing
[[ -z "$TOOL_NAME" ]] && exit 0
[[ -z "$FILE_PATH" ]] && exit 0

case $TOOL_NAME in
  "Write"|"Edit")
    # EXPANDED SECRET GUARD (P0 from Expert H)
    # Block writes to sensitive files
    if [[ $FILE_PATH =~ \.env ]] || \
       [[ $FILE_PATH =~ secret ]] || \
       [[ $FILE_PATH =~ token ]] || \
       [[ $FILE_PATH =~ \.pem$ ]] || \
       [[ $FILE_PATH =~ \.key$ ]] || \
       [[ $FILE_PATH =~ credential ]] || \
       [[ $FILE_PATH =~ password ]]; then
      echo "❌ BLOCKED: Cannot write to sensitive file: $FILE_PATH"
      echo "Reason: Secret/credential file detected"
      echo "Use secure environment variable management instead"
      exit 1
    fi

    # Warn on breaking changes without ADR
    if [[ $FILE_PATH == src/providers/* ]] || [[ $FILE_PATH == src/gateway/* ]]; then
      BASE_NAME=$(basename "$FILE_PATH" .ts)
      if ! ls docs/02-design/01-ADRs/ADR-*.md 2>/dev/null | grep -qi "$BASE_NAME"; then
        echo "⚠️  WARNING: Potential breaking change without ADR"
        echo "File: $FILE_PATH"
        echo "Consider creating ADR-XXX-${BASE_NAME}.md"
        echo ""
        echo "Continue? This is a warning, not a block."
      fi
    fi
    ;;
esac

exit 0  # Always allow (warnings only, no hard blocks except secrets)
```

**Test**:
```bash
# Should block
echo '{"tool_name":"Edit","file_path":".env.local"}' | .claude/hooks/pre-tool-use.sh

# Should warn
echo '{"tool_name":"Edit","file_path":"src/providers/gemini/index.ts"}' | .claude/hooks/pre-tool-use.sh

# Should pass
echo '{"tool_name":"Edit","file_path":"src/utils/helpers.ts"}' | .claude/hooks/pre-tool-use.sh
```

### UserPromptSubmit — Query Classification

**STATUS**: ⚠️ VERIFY hook type exists in Claude Code spec

Sprint 52 defers this hook pending verification that `userPromptSubmit` is a valid hook type.

**Alternative**: Use skills to suggest commands based on user query patterns (Sprint 53).

---

## 4. Input Superpowers

### @ Mentions — Smart Context

**Best Practices**:
```bash
# ✅ Good: Use @ for file references
"Review the authentication logic in @src/auth/index.ts"

# ❌ Bad: Copy-paste entire file
"Review this code: [1000 lines of code]"

# ✅ Good: Reference multiple files
"Compare @src/providers/gemini/index.ts with @src/providers/openai/index.ts"

# ✅ Good: Directory references
"Analyze all security patterns in @src/security/"
```

### ! Prefix — Inline Commands

**EndiorBot Usage**:
```bash
# Check git status inline
"Before we commit, ! git status"

# Check test coverage
"What's our coverage? ! pnpm test:coverage --summary"

# Check Gateway status
"Is Gateway running? ! lsof -iTCP:18790 -sTCP:ESTABLISHED"
```

### Paste Images — Visual Debugging

**Use Cases**:
- Paste Desktop UI screenshots for debugging
- Paste error messages from browser DevTools
- Paste architecture diagrams for discussion
- Paste design mockups for implementation

---

## 5. Rewind & Checkpoints

### Rewind Strategies

| Scenario | Strategy |
|----------|----------|
| Broke working code | `Esc Esc` → Full Rewind |
| Wrong architecture direction | `Esc Esc` → Conversation only |
| Need to undo file changes | `Esc Esc` → Code only |
| Want to try alternative approach | Create git branch first |

### Checkpoint Best Practices

```bash
# Before risky operations
$ git commit -m "checkpoint: before refactor"
$ claude
> "Refactor authentication to use JWT"
> If breaks: Esc Esc → Full Rewind
> Or: git reset --hard HEAD
```

---

## 6. Cost Optimization

### Token-Saving Strategies

| Strategy | Savings | When to Use |
|----------|---------|-------------|
| `/compact` | 50-70% | Context > 50K tokens |
| `/clear` | 100% | Between unrelated tasks |
| `@` references | 30-50% | Instead of copy-paste |
| Sonnet vs Opus | 80% cheaper | Routine tasks |
| Background tasks | N/A | Long-running operations |

### Model Selection (Revised for Cost)

**Default**: Sonnet (80% cheaper than Opus)
**Opus only for**: Explicit architecture decisions

```typescript
// EndiorBot query classifier (revised)
interface ModelRouting {
  'architecture': 'opus',      // ONLY for major decisions (explicit request)
  'security': 'sonnet',        // Sonnet sufficient for most security reviews
  'code_gen': 'sonnet',        // Fast implementation (default)
  'bug_fix': 'sonnet',         // Quick fixes (default)
  'refactor': 'sonnet',        // Code cleanup (default)
  'research': 'haiku',         // Fast lookup
  'default': 'sonnet',         // When uncertain, use Sonnet
}
```

**Budget Guard**:
- Track: `/cost` regularly during session
- Alert: If session cost > $5, warn user
- Commands: Default `model: sonnet` unless specified

**When to use Opus**:
- User explicitly requests: "use Opus for this"
- Architecture decisions with multi-model consultation
- G2/G3 gate evaluations (critical path)

---

## 7. EndiorBot-Specific Workflows

### Morning Standup

```bash
$ claude
> /project:switch bflow
> "What's the status? ! git log --oneline -5"
> "Any pending gates? /project:gate"
> "Priority for today?"
```

### Architecture Decision

```bash
$ claude
> Shift+Tab → Plan Mode
> /project:consult "Should we use Redis or PostgreSQL for session storage?"
> Review expert opinions
> Shift+Tab → Normal Mode
> "Create ADR for the chosen approach"
```

### Feature Implementation

```bash
$ claude
> @docs/02-design/14-Technical-Specs/payment-gateway.md
> "Implement this spec"
> Claude generates code
> "Run tests: ! pnpm test"
> "/project:vibecoding src/ar/payment/"
> If green: "Commit with SDLC metadata"
```

### Gate Approval

```bash
$ claude
> /project:gate G3
> Review checklist
> If PASS: "git tag g3-ar-457-approved && git push --tags"
```

### PR Review (Junior Dev)

```bash
$ claude --agent reviewer
> @apps/desktop/src/pages/ChatSimple.tsx
> "Review this PR from Junior1"
> Reviewer agent provides feedback
> "Approve if vibecoding < 60"
```

---

## 8. Implementation Plan (REVISED)

### Sprint 52: Minimal DevEx Pack (10-12h)

**Focus**: Thin client commands + essential hooks + CLAUDE.md update

| # | Task | Effort | Priority | Notes |
|---|------|--------|----------|-------|
| 1 | **CLAUDE.md update** | 1h | P0 | Add invariants, gateway patterns, thin client examples |
| 2 | **`/project:gate`** — thin client | 1.5h | P0 | Calls `./endiorbot.mjs gate check $ARGUMENTS` |
| 3 | **`/project:consult`** — thin client | 1.5h | P0 | Calls `./endiorbot.mjs consult "$ARGUMENTS"` |
| 4 | **PreToolUse hook** — expanded secret guard | 2h | P0 | Block: `.env*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*credentials*`. Stdin JSON. |
| 5 | **PostToolUse hook** — lint on touched package | 2h | P0 | `pnpm lint` scoped to changed dir. NO auto-format (avoids loop). Stdin JSON. |
| 6 | **Vibecoding-lite script** | 1.5h | P1 | tsc + lint + test exists + diff size. Called by hooks. |
| 7 | **Verification + docs** | 1.5h | P0 | Test all components. Update README. |
| **Total** | | **12h** | | **~1.5 days** |

### Sprint 53: Extended DevEx (16-20h)

**Deferred from Sprint 52**:

| # | Task | Effort | Priority |
|---|------|--------|----------|
| 1 | Sub-agents: Architect + Coder + Reviewer (NO PM) | 4h | P1 |
| 2 | Skills: sdlc-compliance, multi-model-router, security-validator | 3h | P1 |
| 3 | Full vibecoding index (with baseline) | 4h | P1 |
| 4 | GitHub MCP server setup | 2h | P2 |
| 5 | `.claude/settings.json` configuration | 2h | P1 |
| 6 | Plugin packaging (endiorbot-sdlc-plugin) | 3h | P2 |
| **Total** | | **18h** | |

### Sprint 54+: Future Integration

- Custom MCP servers (Telegram, Brain) — after threat model
- `/project:switch` — only if multi-project workflow validated
- Multi-model via MCP — after EndiorBot gateway stable
- UserPromptSubmit hook — after hook type verified

---

### Sprint 52 Verification Checklist

#### Commands
- [ ] `/project:gate G3` returns gate status from EndiorBot core
- [ ] `/project:consult "Redis vs PostgreSQL"` triggers multi-model via gateway
- [ ] Commands use `model: sonnet` (not opus)
- [ ] Commands are thin clients (no business logic in `.md`)

#### Hooks
- [ ] PreToolUse blocks `.env` writes (secret guard)
- [ ] PreToolUse warns on ADR missing for providers/gateway changes
- [ ] PostToolUse runs lint on touched package
- [ ] Hooks parse stdin JSON (not positional args)
- [ ] Test: `echo '{"tool_name":"Edit","file_path":"test.ts"}' | ./hook.sh`

#### CLAUDE.md
- [ ] 4 Non-Negotiable Invariants documented
- [ ] Thin client pattern explained
- [ ] Stdin JSON format for hooks
- [ ] Default model = Sonnet

#### Integration
- [ ] @ references work in prompts
- [ ] Rewind works (Esc Esc)
- [ ] `/cost` shows budget tracking
- [ ] No PM agent created (prevents orchestration conflict)

---

## 9. Success Metrics (Measurable)

### Sprint 52 Success Criteria

| Metric | Before | After Sprint 52 | Target |
|--------|--------|-----------------|--------|
| **Gate check time** | 5-10 min (manual) | 10 sec (`/project:gate`) | < 15 sec |
| **Secret exposure risk** | High (no guard) | Low (hook blocks) | 0 secrets committed |
| **Multi-model consultation time** | 30-60 min (manual) | 2-5 min (`/project:consult`) | < 10 min |
| **SDLC compliance errors** | Unknown | Warned by hooks | 0 blocked commits |
| **Token usage** | Baseline | -30% (@ refs, Sonnet default) | -20% to -40% |
| **Commands working** | 0 | 2 (/gate, /consult) | 2/2 pass |
| **Hooks working** | 0 | 2 (pre, post) | 2/2 pass |

### Sprint 53 Success Criteria

| Metric | Target |
|--------|--------|
| Sub-agents working | 3/3 (Architect, Coder, Reviewer) |
| Skills auto-invoking | 3/3 (sdlc, multi-model, security) |
| Full vibecoding index | Baseline established |
| GitHub MCP integrated | PR creation via command |

### Long-Term Metrics (Sprint 54+)

| Metric | Baseline | Target (6 months) |
|--------|----------|-------------------|
| Average feature cycle time | 2-3 days | 1-2 days |
| Gate approval time | 30 min | 5 min |
| Code quality incidents | Tracked | -50% |
| Token cost per feature | Baseline | -30% |

**Note**: No vague "40-50% productivity gain" claims. All metrics are measurable.

---

---

## 10. Revision History & Expert Review

### Initial Draft (2026-02-27 AM)
- Created comprehensive Claude Code integration guide
- Scope: 16h (4 commands, 3 skills, 4 agents, 3 hooks)
- Issues: Business logic in commands, incorrect hook format, vague metrics

### Revision 1 (2026-02-27 PM) — 3-Expert Review Applied

**Expert H (Doc 19) + Expert J (Doc 20) + Internal Review**

**Consensus Changes** (3/3 agreement):
1. ✅ **Thin Client Pattern**: Commands call `./endiorbot.mjs`, NO business logic in `.md`
2. ✅ **Stdin JSON for Hooks**: Parse with `jq`, not positional args
3. ✅ **Multi-Model via Gateway**: Cannot be done in Claude Code native, requires EndiorBot gateway
4. ✅ **Remove PM Agent**: Prevents orchestration conflict with EndiorBot SOUL
5. ✅ **Expanded Secret Guard**: Block `.env*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*credentials*`
6. ✅ **Default Sonnet**: 80% cost reduction vs Opus
7. ✅ **Scope Reduction**: Sprint 52 = 10-12h (minimal DevEx), Sprint 53 = 16-20h (extended)
8. ✅ **Remove /project:switch**: High risk, defer to Sprint 52+
9. ✅ **Measurable Metrics**: Replace vague "40-50%" with specific KPIs

**Technical Corrections**:
- Skills format: No `trigger:` or `priority:` in YAML (description-based)
- Hooks format: Stdin JSON, not `$1`, `$2`
- Vibecoding-lite for Sprint 52 (full composite index in Sprint 53)
- UserPromptSubmit hook deferred (verify hook type exists)

**Architecture Clarifications**:
- EndiorBot SOUL = Governance layer (WHAT to build)
- Claude Code = Execution layer (HOW to build)
- Single Source of Truth = EndiorBot core
- Claude Code commands = thin clients

### Current Status
- **Document**: REVISED (technical accuracy verified)
- **Sprint 52 Scope**: 10-12h Minimal DevEx Pack
- **Sprint 53 Scope**: 16-20h Extended DevEx
- **Ready for**: Implementation (Exit Plan Mode)

---

*Document created by @pm and @architect*
*Revised based on 3-expert consensus review*
*SDLC Framework v6.1.1 compliant*
*Sprint 52 - Claude Code Integration Phase*
