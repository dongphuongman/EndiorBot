# Sprint 56-60 Plan: OTT Integration & Desktop App

**PM:** @pm (EndiorBot AI)
**Date:** 2026-03-01
**Approval Status:** PENDING CEO
**Context:** Post-Sprint 55 (Agent Orchestration Layer Complete)

---

## Executive Summary

Sprint 55 delivered the **Agent Orchestration Layer** - CEO can now invoke agents via CLI:

```bash
endiorbot @pm "plan payment gateway"
# → PM executes → Handoff @architect → Handoff @coder → Patch applied
```

**Next Phase (Sprint 56-60):** Extend orchestration to OTT channels (Telegram/Zalo) and Desktop App.

---

## Sprint Overview

| Sprint | Duration | Focus | Priority |
|--------|----------|-------|----------|
| **56** | 2 days | OTT Agent Integration (Telegram) | P0 |
| **57** | 2 days | OTT Agent Integration (Zalo) + Magic Links | P0 |
| **58** | 2 days | Desktop App v1 (Electron Shell) | P1 |
| **59** | 2 days | Cross-Project Workflows + Evidence CLI | P1 |
| **60** | 2 days | SE4H Roles + Polish | P2 |

---

## Sprint 56: OTT Agent Integration - Telegram

**Duration:** 2 days (~12-16h)
**Goal:** CEO can invoke agents via Telegram

### Problem Statement

Sprint 55 CLI agent invocation works, but CEO often uses Telegram for quick tasks. Need to extend orchestration to OTT channel.

### Target State

```
CEO (Telegram): @pm plan payment gateway
  → EndiorBot parses mention
  → Invokes PM agent via orchestration layer
  → Returns structured response in Telegram
  → Shows handoff options as inline buttons
```

### Tasks

| # | Task | File | Hours | Priority |
|---|------|------|-------|----------|
| 1 | OTT Mention Parser | `src/channels/ott/mention-parser.ts` | 1h | P0 |
| 2 | Telegram Agent Handler | `src/channels/telegram/agent-handler.ts` | 2h | P0 |
| 3 | Telegram Inline Keyboards | `src/channels/telegram/keyboards.ts` | 1.5h | P0 |
| 4 | Handoff Buttons | `src/channels/telegram/handoff-buttons.ts` | 1h | P0 |
| 5 | Response Formatter (Telegram) | `src/channels/telegram/response-formatter.ts` | 1.5h | P0 |
| 6 | Wire to Orchestration Layer | `src/channels/telegram/index.ts` | 2h | P0 |
| 7 | Rate Limiting | `src/channels/ott/rate-limiter.ts` | 1h | P1 |
| 8 | Integration Tests | `tests/channels/telegram-agent.test.ts` | 2h | P0 |

### Success Criteria

```
# Test 1: Basic agent invocation
CEO → Telegram: @pm analyze codebase
→ Bot shows typing indicator
→ PM agent executes
→ Response with handoff button [Continue to @architect?]

# Test 2: Handoff flow
CEO taps [Continue to @architect]
→ Architect executes
→ Response with next handoff or completion

# Test 3: Cancel flow
CEO taps [Cancel Workflow]
→ Workflow cancelled
→ Audit log recorded

# Test 4: Error handling
Agent fails → Friendly error message + retry button
```

---

## Sprint 57: OTT Agent Integration - Zalo + Magic Links

**Duration:** 2 days (~12-16h)
**Goal:** Zalo agent integration + Magic link approvals for both OTT channels

### Tasks

| # | Task | File | Hours | Priority |
|---|------|------|-------|----------|
| 1 | Zalo Agent Handler | `src/channels/zalo/agent-handler.ts` | 2h | P0 |
| 2 | Zalo Response Formatter | `src/channels/zalo/response-formatter.ts` | 1.5h | P0 |
| 3 | Zalo Quick Reply Buttons | `src/channels/zalo/quick-replies.ts` | 1.5h | P0 |
| 4 | Magic Link Generator | `src/security/magic-link.ts` | 2h | P0 |
| 5 | Magic Link Handler | `src/gateway/magic-link-handler.ts` | 1.5h | P0 |
| 6 | Approval via Magic Link | `src/agents/safety/link-approval.ts` | 1.5h | P0 |
| 7 | OTT Unified Router | `src/channels/ott/unified-router.ts` | 1h | P1 |
| 8 | Integration Tests | `tests/channels/zalo-agent.test.ts` | 2h | P0 |

### Magic Link Flow

```
1. Agent needs HIGH/CRITICAL approval
2. EndiorBot generates magic link (JWT, 15min expiry)
3. Sends link to Telegram/Zalo:
   "⚠️ PATCH requires approval"
   "[Approve] [Reject] or click: https://endiorbot.local/approve/abc123"
4. CEO clicks link → Browser confirms → Patch applied
5. Alternative: CEO types /approve abc123 in OTT
```

### Success Criteria

```
# Test 1: Zalo agent invocation
CEO → Zalo OA: @coder fix auth bug
→ Coder executes → Response in Zalo

# Test 2: Magic link approval
Agent: "Apply patch? [Magic Link]"
CEO clicks link → Patch approved → Notification in Zalo

# Test 3: Cross-channel consistency
Telegram and Zalo show same agent behavior
```

---

## Sprint 58: Desktop App v1 (Electron Shell)

**Duration:** 2 days (~12-16h)
**Goal:** Standalone desktop app with integrated terminal + agent panel

### Problem Statement

CEO switches between Terminal + Telegram + Browser for different tasks. Desktop app provides unified interface.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  EndiorBot Desktop v1.0                                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────────────┐│
│  │   Agent Panel        │  │   Terminal                   ││
│  │                      │  │                              ││
│  │  @pm: Ready          │  │  $ endiorbot @pm "task"     ││
│  │  @architect: Idle    │  │  🤖 Planning task...        ││
│  │  @coder: Executing   │  │                              ││
│  │  @reviewer: Idle     │  │  Response here...           ││
│  │                      │  │                              ││
│  │  [Start Workflow]    │  │  $ _                        ││
│  │  [View Audit Log]    │  │                              ││
│  │                      │  │                              ││
│  └──────────────────────┘  └──────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┤
│  │  Status Bar: Project: bflow | Tier: LITE | Git: main   ││
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

### Tasks

| # | Task | File | Hours | Priority |
|---|------|------|-------|----------|
| 1 | Electron Setup | `apps/desktop/` | 1h | P0 |
| 2 | Main Window | `apps/desktop/src/main/index.ts` | 1.5h | P0 |
| 3 | Terminal Component | `apps/desktop/src/renderer/terminal.tsx` | 2h | P0 |
| 4 | Agent Panel | `apps/desktop/src/renderer/agent-panel.tsx` | 2h | P0 |
| 5 | IPC Bridge | `apps/desktop/src/main/ipc.ts` | 1.5h | P0 |
| 6 | EndiorBot Process Manager | `apps/desktop/src/main/process.ts` | 1.5h | P0 |
| 7 | Status Bar | `apps/desktop/src/renderer/status-bar.tsx` | 1h | P1 |
| 8 | Build & Package | `apps/desktop/scripts/build.ts` | 1.5h | P0 |

### Success Criteria

```
# Test 1: Launch app
Double-click EndiorBot.app → Window opens

# Test 2: Terminal integration
Type command → Executes endiorbot CLI → Output shown

# Test 3: Agent panel
Shows active agents → Real-time status updates

# Test 4: Workflow from desktop
Click [Start Workflow] → Modal for @agent selection → Executes
```

---

## Sprint 59: Cross-Project Workflows + Evidence CLI

**Duration:** 2 days (~12-16h)
**Goal:** Multi-project context + Evidence management CLI

### Cross-Project Workflow

```bash
# Current: Single project
endiorbot @pm "plan feature"  # Uses current project context

# New: Cross-project
endiorbot @pm "plan integration between bflow and nqh-bot"
# → Loads context from both projects
# → PM analyzes both codebases
# → Produces integration plan
```

### Evidence CLI

```bash
# Attach evidence to gates
endiorbot evidence add G2 --file "docs/adr-001.md" --type ADR
endiorbot evidence add G2 --url "https://jira.io/PROJ-123" --type ticket

# List evidence
endiorbot evidence list G2
# G2: Architecture Ready
#   ✓ ADR-001: Multi-model orchestrator [docs/adr-001.md]
#   ✓ PROJ-123: Design ticket [https://jira.io/PROJ-123]
#   ✗ Missing: API specification

# Generate evidence manifest
endiorbot evidence manifest G2 --output evidence-g2.json
```

### Tasks

| # | Task | File | Hours | Priority |
|---|------|------|-------|----------|
| 1 | Multi-Project Context | `src/agents/context/multi-project.ts` | 2h | P0 |
| 2 | Project Resolver | `src/agents/context/project-resolver.ts` | 1.5h | P0 |
| 3 | Evidence Types | `src/sdlc/evidence/types.ts` | 1h | P0 |
| 4 | Evidence Store | `src/sdlc/evidence/store.ts` | 1.5h | P0 |
| 5 | Evidence CLI Commands | `src/cli/commands/evidence.ts` | 2h | P0 |
| 6 | Evidence Manifest | `src/sdlc/evidence/manifest.ts` | 1.5h | P0 |
| 7 | Gate-Evidence Integration | `src/sdlc/gates/evidence-checker.ts` | 1.5h | P1 |
| 8 | Integration Tests | `tests/sdlc/evidence.test.ts` | 1h | P0 |

### Success Criteria

```
# Test 1: Cross-project agent
endiorbot @architect "design API between bflow and nqh-bot"
→ Loads both project contexts
→ Analyzes compatibility

# Test 2: Evidence attachment
endiorbot evidence add G2 --file ADR-001.md
→ Evidence recorded in ~/.endiorbot/evidence/

# Test 3: Evidence manifest
endiorbot evidence manifest G2
→ JSON with all evidence, checksums, dates
```

---

## Sprint 60: SE4H Roles + Polish

**Duration:** 2 days (~12-16h)
**Goal:** Activate SE4H advisor roles (CEO/CPO/CTO) + Polish all features

### SE4H Roles

```
Current SE4A (Executors):
  researcher, pm, pjm, architect, coder, reviewer, tester, devops

New SE4H (Advisors):
  ceo  - Business decisions, budget, priorities
  cpo  - Product direction, user experience
  cto  - Technical strategy, architecture governance
```

### Advisor Behavior

```bash
endiorbot @cto "evaluate Redis vs PostgreSQL for sessions"
# → CTO SOUL loaded (strategic, not tactical)
# → Considers: scalability, team expertise, maintenance
# → Returns: Recommendation with trade-offs
# → Cannot handoff to executors (advisory only)

endiorbot @cpo "review user onboarding flow"
# → CPO SOUL loaded
# → Analyzes: UX patterns, conversion, friction
# → Returns: Product recommendations
```

### Tasks

| # | Task | File | Hours | Priority |
|---|------|------|-------|----------|
| 1 | SE4H Role Types | `src/agents/types/se4h.ts` | 1h | P0 |
| 2 | CEO SOUL Template | `docs/reference/templates/souls/SOUL-ceo.md` | 1h | P0 |
| 3 | CPO SOUL Template | `docs/reference/templates/souls/SOUL-cpo.md` | 1h | P0 |
| 4 | CTO SOUL Template | `docs/reference/templates/souls/SOUL-cto.md` | 1h | P0 |
| 5 | Advisor Router | `src/agents/orchestrator/advisor-router.ts` | 1.5h | P0 |
| 6 | Polish: Error Messages | Various | 1.5h | P1 |
| 7 | Polish: CLI Help | `src/cli/commands/` | 1h | P1 |
| 8 | Polish: Documentation | `docs/` | 2h | P1 |
| 9 | Full System Tests | `tests/e2e/full-system.test.ts` | 2h | P0 |

### Success Criteria

```
# Test 1: CTO consultation
endiorbot @cto "evaluate microservices vs monolith"
→ Strategic analysis, no code changes

# Test 2: CPO review
endiorbot @cpo "review checkout UX"
→ Product recommendations

# Test 3: Advisor cannot handoff
@cto tries to handoff to @coder → BLOCKED
→ "Advisors cannot delegate to executors"
```

---

## Dependencies & Prerequisites

### For Sprint 56 (OTT Telegram)
- [x] Sprint 55 complete (Agent Orchestration)
- [x] Telegram channel operational (Sprint 46)
- [x] Orchestration layer tested (Sprint 55)

### For Sprint 57 (OTT Zalo + Magic Links)
- [ ] Sprint 56 complete
- [x] Zalo channel operational (Sprint 46)
- [ ] Magic link security review

### For Sprint 58 (Desktop App)
- [ ] Sprint 56-57 complete (stable orchestration)
- [x] Electron setup (existing in apps/desktop)
- [ ] UI design approval

### For Sprint 59 (Cross-Project + Evidence)
- [ ] Sprint 58 complete
- [ ] Multi-project strategy approved

### For Sprint 60 (SE4H Roles)
- [ ] Sprint 59 complete
- [ ] SE4H SOUL templates reviewed

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Telegram API rate limits | Medium | Medium | Implement rate limiter, queue |
| Zalo API changes | Low | High | Abstract behind adapter |
| Electron memory issues | Medium | Medium | Lazy loading, process isolation |
| Cross-project context explosion | High | High | Token budget, selective loading |
| SE4H role confusion | Low | Medium | Clear documentation, warnings |

---

## Milestones

| Milestone | Target | Criteria |
|-----------|--------|----------|
| **M5: OTT Integration** | End Sprint 57 | @agent works in Telegram + Zalo |
| **M6: Desktop App** | End Sprint 58 | EndiorBot.app functional |
| **M7: Full Feature Set** | End Sprint 60 | All roles, evidence, cross-project |

---

## Resource Allocation

| Sprint | CEO Time | PM Time | Dev Time |
|--------|----------|---------|----------|
| 56 | 1h review | 2h | 12h |
| 57 | 2h (magic link security) | 2h | 12h |
| 58 | 2h (UX review) | 2h | 12h |
| 59 | 1h review | 2h | 12h |
| 60 | 2h (polish review) | 2h | 12h |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | @pm | 2026-03-01 | ✅ Plan Created |
| CEO | @CEO | PENDING | |
| Architect | @architect | PENDING | |

---

**Next Action:** CEO review and approval for Sprint 56 start.

---

*EndiorBot PM | Sprint 56-60 Planning | SDLC Framework v6.1.1*
