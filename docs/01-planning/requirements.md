# Requirements Specification

**Project:** EndiorBot
**Version:** 2.0.0
**Date:** 2026-02-28
**SDLC Stage:** 01-PLANNING
**Identity:** CEO Power Tool (LOCKED)

---

## MVP Scope (Tier 1)

> Per Master Plan v2.0, MVP features are scope-locked.

```bash
endiorbot consult "<question>"  # 2 models, primary_with_notes
endiorbot gate status G2        # Read-only checklist
endiorbot switch <project>      # Minimal context
```

---

## Functional Requirements

### FR-001: 2-Model Consultation (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-001.1 | Query 2 models: Gemini (primary) + Opus (backup) | P0 | MVP |
| FR-001.2 | Consolidate with primary_with_notes algorithm | P0 | MVP |
| FR-001.3 | Fallback to single model on timeout | P0 | MVP |
| FR-001.4 | Full 4+ model orchestration | P2 | Tier 3 |

### FR-002: Project Context Switching (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-002.1 | Quick switch between projects | P0 | MVP |
| FR-002.2 | Context switch < 2s | P0 | MVP |
| FR-002.3 | Warn about uncommitted changes | P1 | Pro |
| FR-002.4 | Full session resume with Brain | P1 | Pro |

### FR-003: Gate Status Read-Only (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-003.1 | Show gate checklist (read-only) | P0 | MVP |
| FR-003.2 | Gate status at a glance | P0 | MVP |
| FR-003.3 | Auto-evaluate gate criteria | P1 | Pro |
| FR-003.4 | Evidence collection | P1 | Pro |
| FR-003.5 | Full SDLC enforcement | P2 | Tier 3 |

### FR-004: ActionControlPlane (MVP Stub)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-004.1 | Propose → Approve → Execute pattern | P0 | MVP |
| FR-004.2 | Auto-approve READ/WRITE actions | P0 | MVP |
| FR-004.3 | Require CEO approval for DESTRUCTIVE | P0 | MVP |
| FR-004.4 | Block dangerous commands | P0 | MVP |
| FR-004.5 | Full audit logging | P1 | Pro |

### FR-005: Context Budget Governance (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-005.1 | Max 2K tokens per turn | P0 | MVP |
| FR-005.2 | Max 3 blocks per turn | P0 | MVP |
| FR-005.3 | Hard reset every 30 turns | P0 | MVP |
| FR-005.4 | Brain L4 injection at session start | P0 | MVP |

### FR-006: Brain Integration (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-006.1 | L4 Mental Models injection | P0 | MVP |
| FR-006.2 | L3 Structures on project switch | P1 | Pro |
| FR-006.3 | L2 Patterns on similar errors | P1 | Pro |
| FR-006.4 | Full Brain provenance | P1 | Pro |

### FR-007: CLI Interface (MVP)

| ID | Requirement | Priority | Tier |
|----|-------------|----------|------|
| FR-007.1 | `endiorbot consult "<question>"` | P0 | MVP |
| FR-007.2 | `endiorbot gate status G2` | P0 | MVP |
| FR-007.3 | `endiorbot switch <project>` | P0 | MVP |
| FR-007.4 | Full CLI with all commands | P1 | Pro |

---

## Non-Functional Requirements

### NFR-001: Performance (MVP Targets)

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-001.1 | Decision time | <30s (not 30-60 min) | P0 |
| NFR-001.2 | Context switch | <2s | P0 |
| NFR-001.3 | CLI startup | <1s | P0 |

### NFR-002: Context Drift Prevention

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-002.1 | Token budget per turn | 2K max | P0 |
| NFR-002.2 | Blocks per turn | 3 max | P0 |
| NFR-002.3 | Context drift rate | <5% re-explanations | P1 |

### NFR-003: Security

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-003.1 | API keys in OS keychain | Required | P0 |
| NFR-003.2 | Never log sensitive data | Required | P0 |
| NFR-003.3 | Block dangerous commands | Required | P0 |

---

## What's NOT in MVP

| Feature | Status | Reason |
|---------|--------|--------|
| Desktop shell | Tier 3 | CLI-first |
| Skills gateway | Tier 3 | Complexity |
| Full multi-model (4+) | Tier 3 | 2 models enough |
| SDLC enforcement | Tier 3 | Checklist first |
| Dynamic overlay | Tier 2 | Session anchor first |
| Junior hub | Tier 3 | Solo developer focus |

---

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| TypeScript | 5.8+ | Language |
| Google AI SDK | Latest | Gemini API |
| Anthropic SDK | Latest | Claude API |

---

## References

- [Master Plan v2.0](../00-foundation/master-plan.md)
- [Sprint 54 Plan](../04-build/sprints/sprint-54-ai-chat-integration.md)

---

*CEO Power Tool | SDLC Framework v6.1.1 - Stage 01: Planning*
*Identity: LOCKED (2026-02-28)*
