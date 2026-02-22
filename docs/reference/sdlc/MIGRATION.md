# SDLC Migration Guide

This guide helps you migrate from single-agent mode to SDLC multi-agent orchestration.

## Overview

EndiorBot's SDLC module implements the SASE 12-role model from SDLC Framework 6.1.0:
- **8 SE4A executors**: researcher, pm, pjm, architect, coder, reviewer, tester, devops
- **3 SE4H advisors**: ceo, cpo, cto
- **1 Router**: assistant (default)

## Prerequisites

- EndiorBot v2026.1.29 or later
- Node.js 22+
- Existing EndiorBot configuration

## Migration Steps

### Step 1: Enable SDLC Mode

Add the `sdlc` section to your `config.json`:

```json
{
  "sdlc": {
    "enabled": true,
    "tier": "LITE"
  }
}
```

Available tiers:
- **LITE**: 1-2 developers, minimal process
- **STANDARD**: 3-10 developers, basic workflow
- **PROFESSIONAL**: 10-50 developers, full gates
- **ENTERPRISE**: 50+ developers, compliance-ready

### Step 2: Configure Agent Roles

Update your agents list with role assignments:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "role": "assistant",
        "default": true
      },
      {
        "id": "coder",
        "role": "coder",
        "model": "sonnet"
      },
      {
        "id": "reviewer",
        "role": "reviewer",
        "model": "sonnet"
      }
    ]
  }
}
```

### Step 3: Configure Teams (Optional)

For STANDARD tier and above, configure team archetypes:

```json
{
  "sdlc": {
    "enabled": true,
    "tier": "STANDARD",
    "teams": {
      "dev": {
        "archetype": "dev",
        "leader": "coder",
        "members": ["coder", "reviewer"]
      },
      "planning": {
        "archetype": "planning",
        "leader": "pm",
        "members": ["pm", "architect"]
      }
    }
  }
}
```

Available team archetypes:
- **planning**: Requirements and design (pm, architect, researcher)
- **dev**: Implementation and review (coder, reviewer)
- **qa**: Testing and quality (tester, reviewer)
- **fullstack**: All-in-one team
- **executive**: Strategic decisions (ceo, cpo, cto)

### Step 4: Verify Configuration

Run the SDLC CLI commands to verify your setup:

```bash
# List configured agents
endiorbot sdlc agents list

# List configured teams
endiorbot sdlc teams list

# Check gate status
endiorbot sdlc gates status
```

## Role Capabilities

### SE4A Executors (Write Code)

| Role | Stages | Gates | Capabilities |
|------|--------|-------|--------------|
| researcher | 00-01 | G0.1 | Research, discovery |
| pm | 00-01 | G0.1, G1 | Requirements, vision |
| pjm | 01-04 | G-Sprint | Sprint planning |
| architect | 02-03 | G2 | System design |
| coder | 04 | G-Sprint | Implementation |
| reviewer | 04-05 | G3 | Code review |
| tester | 05 | G3 | QA testing |
| devops | 06-07 | G4 | Deployment |

### SE4H Advisors (Approve Gates)

| Role | Gates | Decision Authority |
|------|-------|-------------------|
| ceo | G0.1, G4 | Strategic decisions |
| cpo | G0.1, G1 | Product decisions |
| cto | G2, G3 | Technical decisions |

## Quality Gates

Gates ensure quality at key decision points:

| Gate | Name | Stage | Approvers |
|------|------|-------|-----------|
| G0.1 | Problem Validated | 00 | CEO, CPO |
| G0.2 | Solution Diversity | 00 | CPO, CTO |
| G1 | Requirements Complete | 01 | CPO |
| G2 | Design Approved | 02 | CTO |
| G3 | Ship Ready | 05 | CTO |
| G4 | Production Stable | 06 | CEO, CTO |
| G-Sprint | Sprint Plan Approved | 01 | CPO, CTO |

## Inter-Agent Communication

Use the `[@agent: message]` syntax for delegation:

```
[@coder: Implement the login feature from US-001]
[@reviewer: Please review PR #123]
[@dev: Team, we need help with the API integration]
```

Team mentions route to the team leader:
- `[@dev: message]` → routes to coder (dev team leader)
- `[@planning: message]` → routes to pm (planning team leader)

## Backward Compatibility

- Single-agent mode still works (role defaults to "assistant")
- SDLC features are opt-in via `sdlc.enabled`
- Existing configurations continue to work unchanged

## Troubleshooting

### "Queue not enabled" Warning

Enable the file-based queue:

```json
{
  "sdlc": {
    "enabled": true,
    "queue": {
      "enabled": true,
      "type": "file"
    }
  }
}
```

### "Invalid role" Error

Check that the role is one of the 12 valid roles:
- SE4A: researcher, pm, pjm, architect, coder, reviewer, tester, devops
- SE4H: ceo, cpo, cto
- Router: assistant

### "Team not found" Error

Verify the team is configured in `sdlc.teams` with a valid archetype.

## Next Steps

1. Review the [API Documentation](./API.md) for programmatic access
2. Create SOUL.md files for agent personalities (see `docs/reference/templates/souls/`)
3. Configure quality gate evidence requirements for your tier

## Related Documentation

- [SDLC Framework 6.1.0](/.sdlc-framework/SDLC-Core-Methodology.md)
- [ADR-006: Multi-Agent Architecture](/.sdlc-framework/adrs/ADR-006-Multi-Agent-Architecture.md)
- [SOUL Templates](./templates/souls/)
