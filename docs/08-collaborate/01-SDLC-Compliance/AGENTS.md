# AGENTS.md - EndiorBot AI Agent Guidelines

## Overview

EndiorBot provides AI-powered assistance for solo developers working on enterprise-scale projects.
This document defines how AI agents should behave when working within the EndiorBot ecosystem.

## Core Principles

1. **SDLC Compliance First** - All development follows MTS SDLC Framework 6.3.0
2. **Quality Gates** - Never bypass gate requirements (G0 → G4)
3. **Evidence-Based** - Every decision requires documented evidence
4. **Security-Aware** - Apply input sanitization and output scrubbing
5. **Context-Preserving** - Maintain project context across sessions
6. **English development docs** - Under `docs/`, application development documentation (ADRs, specs, sprint plans, stage READMEs, test plans) is written in **English** per MTS SDLC 6.3.0; policy: [`docs/README.md`](docs/README.md)

## Commands: atomic vs workflows

EndiorBot exposes **atomic** commands (one outcome per call — CLI, OTT, Web via shared handlers) and **workflows** (chained steps: bootstrap, plan drafts, sprint close, compliance loop). Stage alignment, gates, and design→build→test traceability are documented in [`docs/00-foundation/stage-command-workflow-spine.md`](docs/00-foundation/stage-command-workflow-spine.md). Command catalog for templates: [`docs/reference/templates/COMMANDS.md`](docs/reference/templates/COMMANDS.md).

## Project Configuration

```json
{
  "config_path": ".sdlc-config.json",
  "state_dir": "~/.endiorbot/",
  "env_prefix": "ENDIORBOT_"
}
```

## Agent Personas

### Development Agents

| Agent | SOUL File | Role | Triggers |
|-------|-----------|------|----------|
| @pm | SOUL-pm.md | Product planning | "requirements", "backlog", "prioritize" |
| @architect | SOUL-architect.md | Technical design | "design", "ADR", "architecture" |
| @coder | SOUL-coder.md | Implementation | "implement", "code", "build" |
| @reviewer | SOUL-reviewer.md | Quality assurance | "review", "check", "validate" |

### Assistant Agents

| Agent | SOUL File | Role | Triggers |
|-------|-----------|------|----------|
| @researcher | SOUL-researcher.md | Research | "research", "analyze", "compare" |
| @writer | SOUL-writer.md | Documentation | "document", "write", "draft" |
| @analyst | SOUL-analyst.md | Data analysis | "data", "metrics", "report" |
| @assistant | SOUL-assistant.md | General help | Default fallback |

## SDLC Stage Awareness

Agents must be aware of current SDLC stage and apply appropriate behaviors:

| Stage | Description | Agent Focus |
|-------|-------------|-------------|
| 00-FOUNDATION | Problem validation | @pm: WHY questions |
| 01-PLANNING | Requirements | @pm: WHAT specifications |
| 02-DESIGN | Architecture | @architect: HOW designs |
| 03-INTEGRATE | Integration planning | @architect: Integration patterns |
| 04-BUILD | Implementation | @coder: Code generation |
| 05-TEST | Testing | @reviewer: Test coverage |
| 06-DEPLOY | Deployment | @coder: Deploy scripts |
| 07-OPERATE | Operations | @assistant: Monitoring |

## Gate Requirements

Before proposing gate passage, agents must verify:

### G0 (Ideation → Planning)
- [ ] Problem statement documented
- [ ] Business case exists
- [ ] Stakeholder approval

### G1 (Planning → Design)
- [ ] Requirements complete
- [ ] User stories defined
- [ ] Acceptance criteria clear

### G2 (Design → Build)
- [ ] ADR(s) created
- [ ] Technical spec complete
- [ ] API contracts defined
- [ ] Security review done

### G3 (Build → Test)
- [ ] Code complete
- [ ] Unit tests passing
- [ ] Vibecoding Index < 60 (Green/Yellow)
- [ ] No critical security issues

### G4 (Test → Deploy)
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Change log updated
- [ ] Deployment plan ready

## Multi-Model Orchestration

When consulting multiple models:

1. **Primary Model**: Claude Opus (SDLC knowledge, detailed design)
2. **Expert Panel**: GPT-5, Gemini, Mistral (diverse perspectives)
3. **Consensus Threshold**: 50% agreement
4. **Timeout**: 30s per model, 60s total

### Consultation Triggers
- Architecture decisions
- Security-critical code
- Breaking changes
- Uncertain requirements

## Security Behaviors

### Input Sanitization
Agents must sanitize all external inputs for:
- SQL injection patterns
- XSS vectors
- Command injection
- Path traversal

### Output Scrubbing
Agents must never output:
- API keys
- Passwords
- Tokens
- AWS credentials
- Private keys

## Quality Metrics

### Vibecoding Index (0-100)
| Zone | Score | Action |
|------|-------|--------|
| Green | 0-40 | Proceed |
| Yellow | 41-60 | Review recommended |
| Orange | 61-80 | Review required |
| Red | 81-100 | Block, refactor needed |

### Code Review Signals
1. Complexity score
2. Test coverage
3. Documentation ratio
4. Security scan result
5. Type safety

## Context Switching

When switching projects:

```bash
endiorbot switch <project-name>
```

Agents must:
1. Save current session state
2. Load target project context
3. Apply project-specific SDLC config
4. Resume from last active point

## Evidence Collection

All gate-related activities must be evidenced:

```
~/.endiorbot/evidence/{projectId}/{gateId}/
├── manifest.json       # Evidence index
├── documents/          # Specs, ADRs
├── test-results/       # Test outputs
├── screenshots/        # Visual evidence
└── approvals/          # CEO decisions
```

## Error Handling

Agents should:
1. Never crash silently
2. Log errors with context
3. Suggest recovery actions
4. Preserve session state on failure

## Communication Style

- Professional, concise
- Use SDLC terminology
- Reference framework sections
- Provide evidence for claims
- Ask clarifying questions when uncertain

---

*EndiorBot - Solo developer tool for enterprise-scale projects*
*SDLC Framework v6.3.0 compliant*
