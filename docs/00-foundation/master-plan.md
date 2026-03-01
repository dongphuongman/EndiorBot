# EndiorBot Master Plan v3.1

---
version: 3.1
updated: 2026-03-01
status: ACTIVE
author: PM + Architect (4-Expert Panel Review)
changelog:
  - v3.1: Sprint 55 Agent Orchestration complete, Claude Code Bridge operational
  - v3.0: Agent Orchestration Layer architecture, 12 agent SOULs
  - v2.0: Identity locked as CEO Tool, scope crisis resolved
  - v1.0: Initial master plan (G2 ready) - 2026-02-21
---

## 1. Identity (LOCKED)

> **EndiorBot is a PERSONAL AI POWER TOOL for CEO**
> Not a platform. Not an SDLC enforcer. Not an enterprise product.

**One Sentence**: Help CEO get AI-assisted answers in <30s instead of 30-60 min.

---

## 2. Two Loops (Everything Maps Here)

### Decision Loop (Architecture, Planning, Research)
```
Ask → Retrieve context → 3-model consult → Propose → CEO approve → Record
```
- Claude (Primary) + OpenAI (Critique) + Gemini (Critique)
- **Model Selection**: CEO can choose latest models (o3, gemini-2.5-pro, etc.) - same as chatgpt.com/gemini.com

### Delivery Loop (Implementation)
```
Task → Brain context → Execute (Claude) → Verify → Commit
```
- Claude Code is primary for coding/docs

**Rule**: Every feature must map to one of these loops. If not → defer.

---

## 3. Truth Layers

| Layer | Role | Authority |
|-------|------|-----------|
| **Brain** | Assist (memory, patterns) | Proposes only |
| **Control Plane** | Execute | Final authority |
| **active.json** | State | SSOT for all interfaces |

```
~/.endiorbot/active.json = Single Source of Truth
All interfaces (CLI, Extension, Claude Code) read/update this
```

---

## 4. Three Tiers (Scope-Locked)

### Tier 1 — MVP (2-3 weeks)
```bash
endiorbot consult "<question>"  # 3 models, primary_with_notes
endiorbot gate status G2        # Read-only checklist
endiorbot switch <project>      # Minimal context
```

**IN**: CLI-first, 3 models (Claude + o3-mini + Gemini Thinking), read-only SDLC, Telegram notify
**Routing**: Coding → Claude only | Research → All 3

### Tier 2 — Pro (4-6 weeks after MVP)
- Auto-generate ADR template (CEO approve)
- Gate evidence manifest
- History compaction + session resume
- OTT approvals via magic link

### Tier 3 — Productization (after 2-4 weeks CEO usage)
- Desktop shell
- Skills gateway
- Dynamic context overlay
- Junior hub

---

## 5. Architecture (Minimal)

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot CLI                                │
│                                                                 │
│   Ask → Context → 3 Models → Consolidate → Propose → Approve   │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │   Claude    │  │   o3-mini   │  │   Gemini    │            │
│   │  (Primary)  │  │ (Critique)  │  │  Thinking   │            │
│   │  Coding &   │  │  Reasoning  │  │ (Critique)  │            │
│   │   Docs      │  │  & Debate   │  │  Reasoning  │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                 Control Plane + Brain (L4)              │   │
│   │  propose → approve → execute → audit                    │   │
│   │  Brain injected at session start (max 2K tokens)        │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Brain (4-Layer Iceberg)

| Layer | Content | Inject When |
|-------|---------|-------------|
| L1 Events | Session logs, fix attempts | Never (too noisy) |
| L2 Patterns | Error signatures, fix hints | On similar errors |
| L3 Structures | Module maps, file trees | On project switch |
| L4 Mental Models | Decision heuristics | Session start |

**Token Budget**:
- Max 2K tokens/turn for context injection
- Max 3 blocks injected per turn
- Hard reset after 30 turns

---

## 7. Safety (ActionControlPlane)

```typescript
// Every action goes through Control Plane
interface ActionProposal {
  action: string;
  risk: 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';
  requiresApproval: boolean;
  idempotencyKey: string;
}

// Default behaviors
READ → auto-approve
WRITE → auto-approve (within project)
DESTRUCTIVE → require CEO approval
MONEY → require CEO approval
ADMIN → require CEO approval
```

**Blocked Commands**: `rm -rf`, `DROP TABLE`, `git push --force`, etc.

---

## 8. Success Metrics

| Metric | Target | Tier |
|--------|--------|------|
| Decision time | <30s (not 30-60 min) | MVP |
| Context switch | <2s | MVP |
| No copy/paste | 0 app switches | MVP |
| Gate status | At a glance | MVP |
| Session resume | No context loss | Pro |
| Context drift | <5% re-explanations | Pro |

---

## 9. Agent Orchestration (v3.1)

```
CEO: @pm "plan payment gateway"
  → PM executes via Claude Code
  → Handoff JSON to @architect
  → Architect executes
  → Handoff to @coder
  → Coder creates patch
  → CEO confirms apply
  → Handoff to @reviewer
  → Review complete
```

### Claude Code Bridge (3 Modes)

| Mode | Flag | Description |
|------|------|-------------|
| READ | (default) | No file changes, output text only |
| PATCH | --patch | Claude outputs diff, CEO confirms |
| INTERACTIVE | --interactive | Opens Claude Code for human takeover |

### Agent Transitions (SE4A)

```
researcher → pm
pm → architect, pjm
architect → coder, reviewer
coder → reviewer, tester
reviewer → coder, pm
tester → coder, devops
devops → tester
```

---

## 10. Roadmap

### ✅ COMPLETE (Sprint 49-55)
- [x] Foundation: 11,780 LOC, 641+ tests
- [x] Claude Code DevEx: Sub-agents, skills, MCP
- [x] CEO Tool MVP: 3-model consultation
- [x] Agent Orchestration: @agent → Claude Code

### 🎯 NOW (Sprint 56)
- [ ] Evidence CLI (expose existing types)
- [ ] Gate rename: recommend/confirm
- [ ] Context CLI (expose context-injector)

### NEXT (Sprint 57-58)
- [ ] OTT Agent Integration (Telegram/Zalo)
- [ ] Desktop App v1
- [ ] Production hardening

### LATER (Sprint 59-61)
- [ ] Cross-project workflows
- [ ] SE4H roles (CEO/CPO/CTO advisors)
- [ ] Analytics dashboard
- [ ] v1.0 Release

---

## 11. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-01 | Sprint 55 fix: CLI registration | Agent command blocked, 1 line fix |
| 2026-03-01 | Codebase-verified roadmap | Avoid recreating existing code |
| 2026-03-01 | Gate rename: recommend/confirm | Agent ≠ Authority invariant |
| 2026-02-28 | Agent Orchestration complete | 3 modes: read/patch/interactive |
| 2026-02-28 | Identity = CEO Tool | 4-expert panel: scope crisis resolution |
| 2026-02-28 | 3 reasoning models MVP | Claude (coding) + o3-mini + Gemini Thinking (critique) |
| 2026-02-28 | Read-only SDLC | Checklist, not enforcer |
| 2026-02-28 | Desktop deferred | CLI must prove value first |
| 2026-02-21 | G2 Ready | ADRs, Data Models, NFRs defined |

---

## What's NOT in v1.0

| Feature | Target | Reason |
|---------|--------|--------|
| Enterprise team features | Post v1.0 | Solo developer focus |
| Complex RBAC | Post v1.0 | Just CEO + Junior roles |
| Heavy infrastructure | Never | No DB, Redis, MinIO |
| Usage billing | Post v1.0 | Not needed |
| VS Code Extension | Post v1.0 | CLI-first |
| Slack Integration | Post v1.0 | Telegram/Zalo first |

---

## v1.0 Target: End of April 2026

```
Sprint 56: SDLC Control Plane (8h)
Sprint 57: OTT Channels (8h)
Sprint 58: Production Hardening (14h)
Sprint 59: Advanced Features (12h)
Sprint 60: Polish & Scale (10h)
Sprint 61: v1.0 Release (8h)
```

---

*EndiorBot Master Plan v3.1*
*Identity: CEO Power Tool (LOCKED)*
*Codebase-Verified: 2026-03-01*
*SDLC Framework v6.1.1 compliant*
