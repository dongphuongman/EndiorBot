# Problem Statement

**Project:** EndiorBot
**Version:** 1.0.0
**Date:** 2026-02-21
**Author:** CEO/Solo Developer
**SDLC Stage:** 00-FOUNDATION

---

## Executive Summary

EndiorBot addresses the inefficiency of solo developers managing enterprise-scale projects (~1M LOC) using fragmented AI tooling and manual SDLC compliance.

---

## Problem Definition

### Current State (Pain Points)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CEO's Current Workflow                          │
│                                                                     │
│   ┌──────────────┐                                                  │
│   │ Claude Code  │ ◄── PRIMARY: Development, coding                │
│   │   (VSCode)   │                                                  │
│   └──────┬───────┘                                                  │
│          │ Manual copy/paste                                        │
│          ▼                                                          │
│   ┌──────────────┐  ┌──────────────┐                               │
│   │   Cursor     │  │GitHub Copilot│ ◄── CPO/CTO support           │
│   └──────┬───────┘  └──────┬───────┘                               │
│          │ Manual copy/paste                                        │
│          ▼                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│   │   ChatGPT    │  │   Gemini     │  │  Claude AI   │             │
│   │  (Expert 1)  │  │  (Expert 2)  │  │  (Expert 3)  │             │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│          │                 │                 │                      │
│          └─────────────────┼─────────────────┘                      │
│                            │ Manual consolidate                     │
│                            ▼                                        │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              CEO Decision                                    │   │
│   │  • Review multiple expert opinions                          │   │
│   │  • Consolidate manually                                     │   │
│   │  • Approve plan/design                                      │   │
│   │  • Go back to Claude Code to implement                      │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Pain Points:                                                      │
│   ❌ Open multiple apps (Claude Code, Cursor, ChatGPT, Gemini...)  │
│   ❌ Copy/paste prompts and responses between apps                 │
│   ❌ Multiple rounds back and forth                                │
│   ❌ Manually consolidate expert opinions                          │
│   ❌ Context lost between apps                                     │
│   ❌ Time-consuming (30-60 min per decision)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Pain Points

| # | Pain Point | Impact | Frequency |
|---|------------|--------|-----------|
| 1 | Multi-app context switching | Lost context, mental fatigue | Daily |
| 2 | Manual copy/paste between AI tools | Time waste, error-prone | 10+ times/day |
| 3 | No automated SDLC compliance | Manual tracking, missed gates | Every feature |
| 4 | Manual expert opinion consolidation | Decision delays | Every architecture decision |
| 5 | Project context switching overhead | 5+ min per switch | Multiple times/day |

### Quantified Impact

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Architecture decision time | 30-60 min | 5 min | 90% reduction |
| Gate evaluation time | 20 min | 1 min | 95% reduction |
| Project context switch | 5 min | 10 sec | 97% reduction |
| CRP/MRP generation | 30 min | 2 min | 93% reduction |

---

## Target Users

### Primary User: Solo Developer (CEO)

**Profile:**
- Single developer managing enterprise-scale codebases
- Projects: Bflow (~1M LOC), NQH-Bot (~200K LOC), MTEP (~500K LOC)
- Uses multiple AI tools daily
- Needs to maintain SDLC compliance across all projects

**Goals:**
- Reduce time spent on tooling overhead
- Automate SDLC compliance tracking
- Get consolidated expert opinions without manual effort
- Quick context switching between projects

### Secondary Users: Junior Developers (1-2)

**Profile:**
- On-job training developers
- Mentored by CEO + AI
- Limited permissions (sandbox)

**Goals:**
- Learn best practices through AI assistance
- Safe environment for experimentation
- Clear task assignments and feedback

---

## Constraints

| Constraint | Description |
|------------|-------------|
| Solo developer focus | Not enterprise team features |
| Lightweight infrastructure | No heavy DB, Redis, MinIO |
| TypeScript ecosystem | Must integrate with Claude Code |
| SDLC Framework v6.1.1 | Must be compliant |

---

## Success Criteria

| Criteria | Measurement | Target |
|----------|-------------|--------|
| Build time | `pnpm build` | < 30 sec |
| CLI startup | Time to prompt | < 1 sec |
| Context switch | Project to project | < 2 sec |
| Multi-model query | End-to-end | < 60 sec |
| Gate evaluation | Auto-check | < 5 sec |

---

## References

- [MTS SDLC Framework v6.1.1](/.sdlc-framework)
- [OpenClaw Source](../../../openclaw) - Base platform
- [SDLC Orchestrator](../../../SDLC-Orchestrator) - Automation patterns

---

*SDLC Framework v6.1.1 - Stage 00: Foundation*
