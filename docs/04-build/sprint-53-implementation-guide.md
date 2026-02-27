# Sprint 53: Claude Code Integration - Extended DevEx Pack

**Date**: 2026-02-27
**Sprint**: 53
**Effort**: 16-20 hours (~2-2.5 days)
**Status**: PLANNED (after Sprint 52 completes)
**Assignee**: @dev team
**Prerequisites**: Sprint 52 complete (Minimal DevEx Pack)

**SDLC Framework v6.1.1 Compliance**:
- **Stage**: 04-BUILD (Implementation phase)
- **Gate**: G-Sprint (Sprint completion gate)
- **Tier**: STANDARD
- **Vibecoding Target**: < 40 (Green zone)

---

## Overview

Sprint 53 extends the Minimal DevEx Pack from Sprint 52 with **sub-agents**, **skills**, **full vibecoding index**, and **GitHub MCP integration**.

**Key Deliverables**:
1. 3 Sub-Agents (Architect, Coder, Reviewer - NO PM)
2. 3 Skills (sdlc-compliance, multi-model-router, security-validator)
3. Full Vibecoding Index with baseline
4. GitHub MCP Server integration
5. Plugin packaging (endiorbot-sdlc-plugin)

---

## Prerequisites

### Required from Sprint 52
- [x] CLAUDE.md updated with 4 invariants
- [x] `/project:gate` command working (thin client)
- [x] `/project:consult` command working (thin client)
- [x] PreToolUse hook (secret guard)
- [x] PostToolUse hook (lint on touch)
- [x] Hooks using stdin JSON format
- [x] Evidence collected (sprint-52-evidence/)

### Technical Prerequisites
- [ ] EndiorBot gateway stable (multi-model consultation)
- [ ] Vibecoding baseline data collected (from Sprint 52 hooks)
- [ ] Secret scanner patterns validated (from PreToolUse hook usage)

---

## File Structure to Create

```
.claude/
├── commands/
│   ├── gate.md                    # From Sprint 52 ✅
│   ├── consult.md                 # From Sprint 52 ✅
│   └── vibecoding.md              # NEW: Full vibecoding index
│
├── hooks/
│   ├── pre-tool-use.sh            # From Sprint 52 ✅
│   └── post-tool-use.sh           # From Sprint 52 ✅
│
├── skills/
│   ├── sdlc-compliance/
│   │   └── SKILL.md               # NEW: SDLC gate checking skill
│   ├── multi-model-router/
│   │   └── SKILL.md               # NEW: Multi-model consultation skill
│   └── security-validator/
│       └── SKILL.md               # NEW: Security validation skill
│
├── agents/
│   ├── architect.md               # NEW: Architecture decisions
│   ├── coder.md                   # NEW: Code implementation
│   └── reviewer.md                # NEW: Code review
│
└── settings.json                  # UPDATE: Full configuration

src/sdlc/vibecoding/
├── index.ts                       # NEW: Vibecoding composite index
├── metrics.ts                     # NEW: Metrics collection
└── baseline.ts                    # NEW: Baseline management

scripts/
└── endiorbot-sdlc-plugin.sh       # NEW: Plugin packaging
```

**Total**: 10 new files + 1 update

---

## Implementation Tasks

### Task 1: Sub-Agent - Architect (1.5h)

**File**: `.claude/agents/architect.md`

**Content**:
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

## Key Principle
EndiorBot SOUL decides WHAT to build (PM, requirements, gates).
You decide HOW to build (design, ADRs, specs).

## Responsibilities
1. Architecture decisions (technology selection, patterns)
2. Write ADRs (Architecture Decision Records)
3. Design technical specifications
4. Performance & scalability planning
5. Review breaking changes

## Workflow
1. Receive requirements from PM (via EndiorBot SOUL)
2. Research alternatives using @docs/ and WebSearch
3. Evaluate trade-offs (cost, performance, maintainability)
4. Write ADR at `docs/02-design/01-ADRs/ADR-XXX-Title.md`
5. Create technical spec at `docs/02-design/14-Technical-Specs/`
6. Present to CEO for approval

## Multi-Model Consultation
For major decisions, suggest using:
```bash
/project:consult "Your architecture question"
```

This routes to Claude + GPT + Gemini via EndiorBot gateway.

## Output Formats

### ADR Template
```markdown
# ADR-XXX: Title

**Date**: YYYY-MM-DD
**Status**: PROPOSED | APPROVED | DEPRECATED
**Context**: Why this decision is needed
**Decision**: What we decided
**Consequences**: Trade-offs and implications
```

### Technical Spec Template
```markdown
# Feature Name - Technical Specification

## Overview
## Architecture
## Data Models
## API Specifications
## Security Considerations
## Testing Strategy
```

## DO NOT
- ❌ Implement code (that's Coder agent's job)
- ❌ Make PM decisions (that's EndiorBot SOUL's job)
- ❌ Skip ADR for breaking changes
- ❌ Use Opus for routine tasks (Sonnet is default)
```

**Test**:
```bash
claude --agent architect
> "Design a caching strategy for API responses"
# Expected: Research + ADR draft + consultation suggestion
```

**Acceptance Criteria**:
- [ ] File created at `.claude/agents/architect.md`
- [ ] YAML frontmatter correct (name, model:opus, allowed-tools, max-turns)
- [ ] Role clearly defined (HOW, not WHAT)
- [ ] No PM responsibilities
- [ ] ADR template included
- [ ] Multi-model consultation suggested for major decisions

---

### Task 2: Sub-Agent - Coder (1.5h)

**File**: `.claude/agents/coder.md`

**Content**:
```markdown
---
name: Coder
model: sonnet
description: Code generation, implementation, refactoring
allowed-tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
max-turns: 20
---

# Coder Agent

## Role
You are the Implementation Engineer. Focus on BUILDING.

## Key Principle
Follow specs and ADRs. Don't improvise architecture.

## Responsibilities
1. Implement features from ADRs and specs
2. Write clean TypeScript code
3. Write tests (target 80% coverage)
4. Refactor for maintainability
5. Fix bugs

## Workflow
1. Read ADR and spec from @docs/02-design/
2. Generate code following patterns in @src/
3. Write tests in __tests__/ directory
4. Run tests: `! pnpm test`
5. Check quality: PostToolUse hook runs lint automatically
6. Commit with SDLC metadata

## Code Standards
- TypeScript strict mode
- No `any` types (use `unknown` + type guards)
- JSDoc for public APIs
- Input sanitization for external data
- Output scrubbing for sensitive data

## Quality Checks (Automatic)
PostToolUse hook runs after every Edit/Write:
- Lint with `pnpm lint --fix`
- TypeScript check with `tsc --noEmit`

## Security Patterns
Always use:
```typescript
import { sanitize } from '@security/input-sanitizer';
const safeInput = sanitize(userInput);

import { scrub } from '@security/output-scrubber';
const safeOutput = scrub(response);
```

## DO NOT
- ❌ Make architecture decisions (that's Architect's job)
- ❌ Skip tests for new code
- ❌ Use `any` types
- ❌ Commit secrets (PreToolUse hook will block)
- ❌ Ignore lint errors
```

**Test**:
```bash
claude --agent coder
> "Implement the rate limiter from @docs/02-design/14-Technical-Specs/rate-limiter.md"
# Expected: Code + tests + quality checks
```

**Acceptance Criteria**:
- [ ] File created at `.claude/agents/coder.md`
- [ ] YAML frontmatter correct (name, model:sonnet, allowed-tools, max-turns)
- [ ] Code standards documented
- [ ] Security patterns included
- [ ] References to existing patterns (@src/)

---

### Task 3: Sub-Agent - Reviewer (1h)

**File**: `.claude/agents/reviewer.md`

**Content**:
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

## Key Principle
Protect the codebase. No compromises on security.

## Responsibilities
1. Review pull requests
2. Check SDLC compliance
3. Security audit
4. Verify test coverage
5. Recommend approve/reject

## Review Checklist

### Code Quality
- [ ] Follows TypeScript strict mode
- [ ] No `any` types
- [ ] JSDoc for public APIs
- [ ] Tests exist (80% coverage target)
- [ ] No console.log in production code

### Security
- [ ] Input sanitized (OTT, API, user input)
- [ ] Output scrubbed (no secrets in logs)
- [ ] No hardcoded credentials
- [ ] No path traversal vulnerabilities
- [ ] SQL injection protected (if applicable)

### SDLC Compliance
- [ ] ADR exists (if architecture change)
- [ ] Gate requirements met
- [ ] Evidence collected
- [ ] Vibecoding index < 60

### Tests
- [ ] Unit tests pass: `! pnpm test`
- [ ] Integration tests pass: `! pnpm test:e2e`
- [ ] Coverage adequate: `! pnpm test:coverage`

## Output Format
```markdown
## Code Review: [PR Title]

### Summary
[Brief description of changes]

### Quality Score: X/10

### Findings
- ✅ [Good practice found]
- ⚠️ [Warning - should fix]
- ❌ [Blocker - must fix]

### Security Review
- [ ] Input validation: PASS/FAIL
- [ ] Output scrubbing: PASS/FAIL
- [ ] Secrets check: PASS/FAIL

### SDLC Compliance
- Gate: [G0-G4]
- ADR: [Required/Not required/Missing]
- Vibecoding: [Score]

### Recommendation
APPROVE / REQUEST_CHANGES / REJECT
```

## DO NOT
- ❌ Implement fixes (suggest to Coder agent)
- ❌ Approve code with security issues
- ❌ Skip security checklist
- ❌ Approve without tests
```

**Test**:
```bash
claude --agent reviewer
> "Review @src/providers/gemini/index.ts for security issues"
# Expected: Structured review with checklist
```

**Acceptance Criteria**:
- [ ] File created at `.claude/agents/reviewer.md`
- [ ] YAML frontmatter correct (name, model:sonnet, allowed-tools, max-turns)
- [ ] Review checklist complete
- [ ] Security review included
- [ ] SDLC compliance check included
- [ ] Output format documented

---

### Task 4: Skill - SDLC Compliance (1h)

**File**: `.claude/skills/sdlc-compliance/SKILL.md`

**Content**:
```markdown
---
description: SDLC compliance checking for gate requirements, vibecoding thresholds, and required artifacts before code changes or PR merges
---

# SDLC Compliance Checker

**When to use this skill**: Before major code changes, PR merges, architecture decisions, or breaking changes.

## Context Detection Keywords
User mentions: "gate", "G0-G4", "SDLC", "compliance", "merge PR", "ready to commit", "can I merge", "is this ready"

## What to Check

### 1. Current SDLC Stage
```bash
! cat .sdlc-config.json | jq '.current_stage'
```

### 2. Gate Requirements
Use `/project:gate [gate-id]` to check:
- G0: Project Inception
- G0.1: Scope Definition
- G1: Requirements
- G2: Design (ADR required)
- G3: Code Complete (tests required)
- G4: Production Ready

### 3. Vibecoding Index
```bash
! pnpm tsc --noEmit && echo "✅ TypeScript OK" || echo "❌ TypeScript errors"
! pnpm lint && echo "✅ Lint OK" || echo "❌ Lint errors"
```

Target: < 40 (green), < 60 (yellow), ≥ 60 (red - block merge)

### 4. Required Artifacts
| Gate | Required Artifacts |
|------|-------------------|
| G1 | Requirements doc |
| G2 | ADR, Technical spec |
| G3 | Tests (80% coverage) |
| G4 | Deployment doc, Runbook |

### 5. Evidence Collection
Check: `docs/08-collaborate/01-SDLC-Compliance/`

## Example Workflow

User: "I want to merge this PR"
1. Read `.sdlc-config.json` for current stage
2. Identify gate (usually G3 for code changes)
3. Run `/project:gate G3`
4. Check vibecoding-lite (tsc + lint)
5. Verify tests exist and pass
6. Recommend approve/reject with evidence

## DO NOT
- ❌ Auto-approve without checking
- ❌ Skip vibecoding check
- ❌ Ignore missing ADRs for architecture changes
```

**Test**:
```bash
claude
> "Is this PR ready to merge?"
# Expected: Claude invokes SDLC compliance skill automatically
```

**Acceptance Criteria**:
- [ ] Directory created: `.claude/skills/sdlc-compliance/`
- [ ] File created: `SKILL.md`
- [ ] No `trigger:` or `priority:` in YAML (description-based only)
- [ ] Context detection keywords listed
- [ ] Gate requirements documented
- [ ] Vibecoding check included

---

### Task 5: Skill - Multi-Model Router (1h)

**File**: `.claude/skills/multi-model-router/SKILL.md`

**Content**:
```markdown
---
description: Route uncertain architecture decisions and security-critical changes to multi-model consultation via EndiorBot gateway for consensus-based recommendations
---

# Multi-Model Consultation Router

**When to use this skill**: Architecture decisions, security reviews, technology selection, or when Claude confidence < 0.7

## Context Detection Keywords
User asks: "should I use X or Y?", "which is better", "compare alternatives", "security review needed", "what do you think about", "help me decide"

## When to Consult Multi-Model

### ALWAYS Consult For
- Architecture decisions (e.g., "Redis vs PostgreSQL for sessions?")
- Security-critical changes (new auth flow, encryption)
- Breaking changes with unclear impact
- Technology/framework selection
- Performance optimization strategies
- Major refactoring decisions

### DO NOT Consult For
- Simple bug fixes
- Routine code generation
- File reading/searching
- Documentation writing
- Formatting/linting

## How to Route

Suggest to user:
```bash
/project:consult "Your question here"
```

Example:
```bash
/project:consult "Should we use Redis or PostgreSQL for session storage in a serverless environment?"
```

## What Happens

EndiorBot gateway will:
1. Classify task type (architecture/security/code_review/research)
2. Select expert panel (Claude + GPT-4 + Gemini + Mistral)
3. Query models in parallel
4. Consolidate responses
5. Return consensus + disagreements + SDLC compliance

## Expected Output Format

```
RECOMMENDATION: [Summary of best approach]

CONSENSUS (3/4 models agree):
- [Point 1]
- [Point 2]

CONCERNS (1/4 models disagree):
- [Dissenting opinion]

SDLC COMPLIANCE:
- Gate impact: [G2/G3]
- ADR required: Yes/No
- Breaking change: Yes/No
```

## DO NOT
- ❌ Implement multi-model logic in Claude Code
- ❌ Skip consultation for architecture decisions
- ❌ Ignore disagreements from expert panel
```

**Test**:
```bash
claude
> "Which database should I use for this feature?"
# Expected: Claude suggests /project:consult
```

**Acceptance Criteria**:
- [ ] Directory created: `.claude/skills/multi-model-router/`
- [ ] File created: `SKILL.md`
- [ ] No `trigger:` or `priority:` in YAML
- [ ] Clear guidance on when to consult
- [ ] Example command provided
- [ ] Output format documented

---

### Task 6: Skill - Security Validator (1h)

**File**: `.claude/skills/security-validator/SKILL.md`

**Content**:
```markdown
---
description: Validate external input and prevent secret exposure in code, especially for OTT messages, API requests, and user-provided data
---

# Security Input Validator

**When to use this skill**: Processing external input (OTT, API, user files, shell commands, database queries)

## Context Detection Keywords
User working with: Telegram, Zalo, API endpoints, file uploads, shell commands, database queries, user input, external data

## Input Validation Patterns

### 12 Security Patterns (from src/security/input-sanitizer.ts)

| Pattern | Risk | Example |
|---------|------|---------|
| SQL Injection | Critical | `'; DROP TABLE users;--` |
| XSS | Critical | `<script>alert(1)</script>` |
| Command Injection | Critical | `; rm -rf /` |
| Path Traversal | High | `../../etc/passwd` |
| LDAP Injection | High | `*)(uid=*))(|(uid=*` |
| XML Injection | High | `<!ENTITY xxe SYSTEM "file:///etc/passwd">` |
| NoSQL Injection | High | `{"$gt": ""}` |
| Email Header | Medium | `\r\nBcc: attacker@evil.com` |
| Template Injection | Medium | `{{constructor.constructor('return this')()}}` |
| SSI Injection | Medium | `<!--#exec cmd="ls" -->` |
| File Upload | Medium | `.php`, `.exe`, `.sh` extensions |
| XXE | High | XML external entity |

### Auto-Apply Pattern
```typescript
import { sanitize } from '@security/input-sanitizer';
const safeInput = sanitize(userInput);
```

## Output Scrubbing

### Never Expose
- API keys (`sk-*`, `AKIA*`)
- Passwords
- OAuth tokens
- AWS credentials
- Private keys (`.pem`, `.key`)
- Database connection strings
- JWT tokens

### Auto-Apply Pattern
```typescript
import { scrub } from '@security/output-scrubber';
const safeOutput = scrub(response);
```

## Secret Guard (PreToolUse Hook)

The PreToolUse hook already blocks writes to:
- `.env*`
- `*secret*`
- `*token*`
- `*.pem`
- `*.key`
- `*credential*`
- `*password*`

## Example Workflow

User: "Process this Telegram message"
1. Identify as external input (OTT)
2. Recommend wrapping with sanitizer
3. Check for injection patterns
4. Verify output doesn't expose secrets

## DO NOT
- ❌ Trust external input without sanitization
- ❌ Log sensitive data
- ❌ Expose secrets in error messages
- ❌ Skip validation for "trusted" sources
```

**Test**:
```bash
claude
> "Handle this user input from Telegram"
# Expected: Claude invokes security-validator skill
```

**Acceptance Criteria**:
- [ ] Directory created: `.claude/skills/security-validator/`
- [ ] File created: `SKILL.md`
- [ ] All 12 patterns documented
- [ ] Input sanitization example provided
- [ ] Output scrubbing example provided
- [ ] Integration with PreToolUse hook mentioned

---

### Task 7: Full Vibecoding Index (4h)

**File**: `src/sdlc/vibecoding/index.ts`

**Content**:
```typescript
/**
 * Vibecoding Composite Index
 * Calculates code quality score from multiple metrics
 *
 * Sprint 53: Full implementation with baseline
 * Sprint 52: Lite version (tsc + lint only) via hooks
 */

import { execSync } from 'child_process';
import type { VibecodingMetrics, VibecodingReport } from './types.js';

// Weight configuration (totals 100)
const WEIGHTS = {
  typescript: 25,      // TypeScript strict compliance
  lint: 20,            // ESLint issues
  testCoverage: 20,    // Test coverage %
  complexity: 15,      // Cyclomatic complexity
  duplication: 10,     // Code duplication %
  documentation: 10,   // JSDoc coverage
};

export class VibecodingIndex {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Calculate full vibecoding index
   * Returns score 0-100 (lower is better)
   *
   * Thresholds:
   * - < 40: Green (excellent)
   * - 40-60: Yellow (acceptable)
   * - ≥ 60: Red (needs improvement)
   */
  async calculate(targetPath?: string): Promise<VibecodingReport> {
    const metrics = await this.collectMetrics(targetPath);
    const score = this.calculateScore(metrics);
    const issues = this.identifyIssues(metrics);

    return {
      score,
      zone: score < 40 ? 'green' : score < 60 ? 'yellow' : 'red',
      metrics,
      issues,
      timestamp: new Date(),
      targetPath: targetPath ?? this.projectRoot,
    };
  }

  /**
   * Lite version for hooks (Sprint 52 compatibility)
   */
  async calculateLite(targetPath?: string): Promise<{ score: number; zone: string }> {
    const tsErrors = this.countTypeScriptErrors(targetPath);
    const lintErrors = this.countLintErrors(targetPath);

    // Simple formula: errors * 5 (max 100)
    const score = Math.min(100, (tsErrors + lintErrors) * 5);

    return {
      score,
      zone: score < 40 ? 'green' : score < 60 ? 'yellow' : 'red',
    };
  }

  private async collectMetrics(targetPath?: string): Promise<VibecodingMetrics> {
    const path = targetPath ?? this.projectRoot;

    return {
      typescript: {
        errors: this.countTypeScriptErrors(path),
        strictCompliance: this.checkStrictMode(),
      },
      lint: {
        errors: this.countLintErrors(path),
        warnings: this.countLintWarnings(path),
      },
      testCoverage: await this.getTestCoverage(path),
      complexity: await this.getComplexity(path),
      duplication: await this.getDuplication(path),
      documentation: await this.getDocCoverage(path),
    };
  }

  private calculateScore(metrics: VibecodingMetrics): number {
    let score = 0;

    // TypeScript (0-25)
    const tsScore = metrics.typescript.errors > 0 ? 25 : (metrics.typescript.strictCompliance ? 0 : 10);
    score += tsScore;

    // Lint (0-20)
    const lintScore = Math.min(20, metrics.lint.errors * 2 + metrics.lint.warnings * 0.5);
    score += lintScore;

    // Test Coverage (0-20, inverse: higher coverage = lower score)
    const coverageScore = Math.max(0, 20 - (metrics.testCoverage.percentage / 5));
    score += coverageScore;

    // Complexity (0-15)
    const complexityScore = Math.min(15, (metrics.complexity.average - 5) * 2);
    score += Math.max(0, complexityScore);

    // Duplication (0-10)
    const duplicationScore = Math.min(10, metrics.duplication.percentage);
    score += duplicationScore;

    // Documentation (0-10, inverse: higher doc = lower score)
    const docScore = Math.max(0, 10 - metrics.documentation.percentage / 10);
    score += docScore;

    return Math.round(score);
  }

  private countTypeScriptErrors(path?: string): number {
    try {
      execSync(`pnpm tsc --noEmit ${path ? `--project ${path}` : ''}`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      return 0;
    } catch (error) {
      const output = (error as { stdout?: string }).stdout ?? '';
      const errorLines = output.split('\n').filter(line => line.includes('error TS'));
      return errorLines.length;
    }
  }

  private countLintErrors(path?: string): number {
    try {
      const result = execSync(`pnpm lint ${path ?? 'src/'} --format json`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      const parsed = JSON.parse(result);
      return parsed.reduce((sum: number, file: { errorCount: number }) => sum + file.errorCount, 0);
    } catch {
      return 0;
    }
  }

  private countLintWarnings(path?: string): number {
    try {
      const result = execSync(`pnpm lint ${path ?? 'src/'} --format json`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      const parsed = JSON.parse(result);
      return parsed.reduce((sum: number, file: { warningCount: number }) => sum + file.warningCount, 0);
    } catch {
      return 0;
    }
  }

  private checkStrictMode(): boolean {
    try {
      const tsconfig = require(`${this.projectRoot}/tsconfig.json`);
      return tsconfig.compilerOptions?.strict === true;
    } catch {
      return false;
    }
  }

  private async getTestCoverage(path?: string): Promise<{ percentage: number }> {
    try {
      const result = execSync(`pnpm test:coverage --reporter json-summary`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      // Parse coverage report
      return { percentage: 80 }; // Placeholder - implement actual parsing
    } catch {
      return { percentage: 0 };
    }
  }

  private async getComplexity(path?: string): Promise<{ average: number }> {
    // Use eslint complexity rule or external tool
    return { average: 5 }; // Placeholder
  }

  private async getDuplication(path?: string): Promise<{ percentage: number }> {
    // Use jscpd or similar tool
    return { percentage: 3 }; // Placeholder
  }

  private async getDocCoverage(path?: string): Promise<{ percentage: number }> {
    // Count JSDoc comments vs public APIs
    return { percentage: 60 }; // Placeholder
  }

  private identifyIssues(metrics: VibecodingMetrics): string[] {
    const issues: string[] = [];

    if (metrics.typescript.errors > 0) {
      issues.push(`${metrics.typescript.errors} TypeScript errors`);
    }
    if (metrics.lint.errors > 0) {
      issues.push(`${metrics.lint.errors} lint errors`);
    }
    if (metrics.testCoverage.percentage < 80) {
      issues.push(`Test coverage ${metrics.testCoverage.percentage}% (target: 80%)`);
    }
    if (metrics.complexity.average > 10) {
      issues.push(`High complexity: ${metrics.complexity.average} (target: < 10)`);
    }
    if (metrics.duplication.percentage > 5) {
      issues.push(`Code duplication: ${metrics.duplication.percentage}% (target: < 5%)`);
    }

    return issues;
  }
}

// Export singleton for CLI use
export const vibecoding = new VibecodingIndex();
```

**Additional Files**:

**File**: `src/sdlc/vibecoding/types.ts`
```typescript
export interface VibecodingMetrics {
  typescript: {
    errors: number;
    strictCompliance: boolean;
  };
  lint: {
    errors: number;
    warnings: number;
  };
  testCoverage: {
    percentage: number;
  };
  complexity: {
    average: number;
  };
  duplication: {
    percentage: number;
  };
  documentation: {
    percentage: number;
  };
}

export interface VibecodingReport {
  score: number;
  zone: 'green' | 'yellow' | 'red';
  metrics: VibecodingMetrics;
  issues: string[];
  timestamp: Date;
  targetPath: string;
}
```

**File**: `.claude/commands/vibecoding.md`
```markdown
---
description: Calculate vibecoding index for code quality
argument-hint: path (optional, defaults to src/)
allowed-tools: ["Bash"]
model: sonnet
---

# Calculate Vibecoding Index

**THIN CLIENT**: Calls EndiorBot core. NO business logic here.

```bash
! ./endiorbot.mjs vibecoding $ARGUMENTS
```

Output includes:
- Overall score (0-100, lower is better)
- Zone (green/yellow/red)
- Metrics breakdown
- Issues to address

Thresholds:
- < 40: Green (excellent) - ready to merge
- 40-60: Yellow (acceptable) - review needed
- ≥ 60: Red (needs improvement) - block merge
```

**Acceptance Criteria**:
- [ ] `src/sdlc/vibecoding/index.ts` created
- [ ] `src/sdlc/vibecoding/types.ts` created
- [ ] `.claude/commands/vibecoding.md` created (thin client)
- [ ] Lite version compatible with Sprint 52 hooks
- [ ] All 6 metrics implemented (TypeScript, lint, coverage, complexity, duplication, docs)
- [ ] Tests written for vibecoding module

---

### Task 8: GitHub MCP Server Setup (2h)

**Setup**:
```bash
# Install GitHub MCP server
claude mcp add github "npx -y @modelcontextprotocol/server-github"

# Configure authentication
export GITHUB_TOKEN="your-github-pat"
```

**File**: `.claude/settings.json` (update)

```json
{
  "hooks": {
    "preToolUse": {
      "enabled": true,
      "script": ".claude/hooks/pre-tool-use.sh"
    },
    "postToolUse": {
      "enabled": true,
      "script": ".claude/hooks/post-tool-use.sh"
    }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  "defaultModel": "sonnet",
  "allowedTools": {
    "github": ["create_issue", "create_pull_request", "get_issue", "list_issues", "add_comment"]
  }
}
```

**Test**:
```bash
claude
> "Create a GitHub issue for implementing dark mode"
# Expected: Issue created via MCP
```

**Acceptance Criteria**:
- [ ] GitHub MCP server installed
- [ ] Authentication configured (GITHUB_TOKEN)
- [ ] settings.json updated with mcpServers
- [ ] Can create issues via Claude Code
- [ ] Can create PRs via Claude Code

---

### Task 9: Plugin Packaging (3h)

**File**: `scripts/endiorbot-sdlc-plugin.sh`

```bash
#!/bin/bash
# Package EndiorBot SDLC Plugin for Claude Code
# Creates distributable .claude/ directory

set -e

VERSION="1.0.0"
OUTPUT_DIR="dist/endiorbot-sdlc-plugin"

echo "📦 Packaging EndiorBot SDLC Plugin v${VERSION}"

# Clean
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy files
cp -r .claude/* "$OUTPUT_DIR/"

# Remove local settings
rm -f "$OUTPUT_DIR/settings.local.json"

# Create README
cat > "$OUTPUT_DIR/README.md" << 'EOF'
# EndiorBot SDLC Plugin for Claude Code

## Installation

1. Copy this directory to your project root as `.claude/`
2. Make hooks executable: `chmod +x .claude/hooks/*.sh`
3. Install jq: `brew install jq`

## Contents

- **Commands**: /project:gate, /project:consult, /project:vibecoding
- **Hooks**: PreToolUse (secret guard), PostToolUse (lint)
- **Skills**: sdlc-compliance, multi-model-router, security-validator
- **Agents**: Architect, Coder, Reviewer

## Requirements

- Claude Code CLI
- EndiorBot gateway running (port 18790)
- jq for JSON parsing

## Usage

```bash
claude
> /project:gate G3        # Check SDLC gate
> /project:consult "..."  # Multi-model consultation
> /project:vibecoding     # Code quality index
```

*EndiorBot SDLC Plugin v1.0.0*
*SDLC Framework v6.1.1*
EOF

# Create manifest
cat > "$OUTPUT_DIR/manifest.json" << EOF
{
  "name": "endiorbot-sdlc-plugin",
  "version": "${VERSION}",
  "description": "SDLC compliance automation for Claude Code",
  "author": "EndiorBot Team",
  "requires": {
    "claude-code": ">=1.0.0",
    "jq": ">=1.6"
  },
  "commands": ["gate", "consult", "vibecoding"],
  "hooks": ["preToolUse", "postToolUse"],
  "skills": ["sdlc-compliance", "multi-model-router", "security-validator"],
  "agents": ["architect", "coder", "reviewer"]
}
EOF

# Create archive
cd dist
tar -czf "endiorbot-sdlc-plugin-${VERSION}.tar.gz" endiorbot-sdlc-plugin/
cd ..

echo "✅ Package created: dist/endiorbot-sdlc-plugin-${VERSION}.tar.gz"
echo "📁 Directory: $OUTPUT_DIR"
```

**Make executable**:
```bash
chmod +x scripts/endiorbot-sdlc-plugin.sh
```

**Test**:
```bash
./scripts/endiorbot-sdlc-plugin.sh
ls dist/endiorbot-sdlc-plugin/
```

**Acceptance Criteria**:
- [ ] Script created and executable
- [ ] Creates distributable package
- [ ] Includes README with installation instructions
- [ ] Includes manifest.json with metadata
- [ ] Excludes local settings

---

### Task 10: Verification & Documentation (1.5h)

#### 10.1 Agent Verification
```bash
# Test Architect agent
claude --agent architect
> "Design a caching strategy"

# Test Coder agent
claude --agent coder
> "Implement a rate limiter"

# Test Reviewer agent
claude --agent reviewer
> "Review @src/providers/gemini/index.ts"
```

#### 10.2 Skill Verification
```bash
claude
> "Is this PR ready to merge?"
# Expected: SDLC compliance skill auto-invoked

> "Should I use Redis or PostgreSQL?"
# Expected: Multi-model router skill suggests /project:consult

> "Handle this Telegram message"
# Expected: Security validator skill invoked
```

#### 10.3 Vibecoding Verification
```bash
# CLI test
./endiorbot.mjs vibecoding src/providers/

# Command test
claude
> /project:vibecoding src/
```

#### 10.4 GitHub MCP Verification
```bash
claude
> "Create a GitHub issue titled 'Test Issue' in endiorbot repo"
# Expected: Issue created via MCP
```

---

## Acceptance Criteria Summary

### Sprint 53 Must-Have (G-Sprint Exit Criteria)

**Agents (3)**:
- [ ] Architect agent working (model: opus)
- [ ] Coder agent working (model: sonnet)
- [ ] Reviewer agent working (model: sonnet)
- [ ] NO PM agent (prevents orchestration conflict)

**Skills (3)**:
- [ ] sdlc-compliance skill auto-invokes
- [ ] multi-model-router skill suggests consultation
- [ ] security-validator skill catches input issues

**Vibecoding**:
- [ ] Full index implemented (6 metrics)
- [ ] Lite version compatible with hooks
- [ ] /project:vibecoding command working

**GitHub MCP**:
- [ ] MCP server configured
- [ ] Can create issues via Claude
- [ ] Can create PRs via Claude

**Plugin**:
- [ ] Packaging script working
- [ ] Distributable archive created

**Quality**:
- [ ] All tests pass
- [ ] Vibecoding index < 40
- [ ] Evidence collected

---

## Success Metrics (Sprint 53)

| Metric | Before | After Sprint 53 | Target |
|--------|--------|-----------------|--------|
| Agents working | 0 | 3 | 3/3 |
| Skills auto-invoking | 0 | 3 | 3/3 |
| Vibecoding composite | Lite only | Full index | 6 metrics |
| GitHub MCP | Not configured | Working | Create issues/PRs |
| Plugin packaged | No | Yes | Distributable |

---

## Rollback Plan

If Sprint 53 implementation fails:

```bash
# Keep Sprint 52 working
# Remove Sprint 53 additions only

rm -rf .claude/agents/
rm -rf .claude/skills/
rm -f .claude/commands/vibecoding.md
rm -rf src/sdlc/vibecoding/

# Revert settings.json to Sprint 52 version
git checkout .claude/settings.json

# Verify Sprint 52 still works
claude
> /project:gate G3
> /project:consult "test"
```

---

## References

- [Sprint 52 Implementation Guide](./sprint-52-implementation-guide.md)
- [Claude Code Integration Spec](./claude-code-integration.md)
- [SDLC Framework 6.1.1](../00-foundation/)
- [ADR-010: Evaluator-Optimizer](../02-design/01-ADRs/ADR-010-Evaluator-Optimizer.md)

---

*Implementation guide for Sprint 53*
*Created: 2026-02-27*
*Status: PLANNED (after Sprint 52)*
*SDLC Framework v6.1.1 compliant*
