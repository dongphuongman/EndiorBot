# EndiorBot Master Plan v2.0

---
version: 2.0
updated: 2026-02-28
status: ACTIVE
author: PM + Architect (4-Expert Panel Review)
changelog:
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

## 9. Roadmap

### NOW (Sprint 54)
- [ ] ChatHandler (3 models: Claude + o3-mini + Gemini Thinking)
- [ ] Gate status read-only
- [ ] Context Budget governance
- [ ] ActionControlPlane stub

### NEXT (Sprint 55-56)
- [ ] Brain provenance (schema_version)
- [ ] Session resume with Brain
- [ ] Telegram magic link approvals

### LATER (After CEO validates MVP)
- [ ] Desktop shell
- [ ] Skills gateway
- [ ] Full SDLC enforcement
- [ ] Junior hub

---

## 10. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-28 | Identity = CEO Tool | 4-expert panel: scope crisis resolution |
| 2026-02-28 | 3 reasoning models MVP | Claude (coding) + o3-mini + Gemini Thinking (critique) |
| 2026-02-28 | Read-only SDLC | Checklist, not enforcer |
| 2026-02-28 | Desktop deferred | CLI must prove value first |
| 2026-02-21 | G2 Ready | ADRs, Data Models, NFRs defined |

---

## What's NOT in MVP

| Feature | Status | Reason |
|---------|--------|--------|
| Desktop shell | Tier 3 | CLI-first |
| Skills gateway | Tier 3 | Complexity |
| Full multi-model (4+) | Tier 3 | 3 reasoning models enough |
| SDLC enforcement | Tier 3 | Checklist first |
| Dynamic overlay | Tier 2 | Session anchor first |
| Junior hub | Tier 3 | Solo developer focus |

---

*EndiorBot Master Plan v2.0*
*Identity: CEO Power Tool (LOCKED)*
*4-Expert Panel Review: 2026-02-28*
*SDLC Framework v6.1.1 compliant*
