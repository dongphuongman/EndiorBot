# 02-design — Design

## Purpose

**Key question:** **HOW** will the system behave — architecture, ADRs, APIs, security design?

Design artifacts **constrain build (04)** and **inform integration (03)**. **Tests (05)** validate behavior against design and requirements.

---

## Alignment

- **Upstream:** `docs/01-planning/` (requirements)  
- **Peer:** `docs/03-integrate/` (contracts must match design)  
- **Downstream:** `docs/04-build/` (implementation), `docs/05-test/` (verification design)  
- **Gates:** **G2** (design approved) — often with **@architect** + **@cso** (security) per tier  
- **Stage index:** [`../README.md`](../README.md)

---

## Design ↔ build ↔ test consistency

| Link | Rule |
|------|------|
| Requirements → design | Every ADR/spec references scope from planning or explicit change record. |
| Design → code | No new public surface without ADR or documented extension point. |
| Design → test | Non-functional reqs (security, perf) appear in test strategy or gate evidence. |

Spine: [`../00-foundation/stage-command-workflow-spine.md`](../00-foundation/stage-command-workflow-spine.md).

---

## EndiorBot command hints (this stage)

| Type | Examples |
|------|----------|
| **Atomic** | `endiorbot gate check G2`, `compliance check`; `consult` for architecture options. |
| **Workflow** | `plan` output → human-reviewed → formal ADRs; long autonomous design sessions per `product-vision.md` (when enabled). |

Catalog: [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md).

---

## Stage artifacts (living)

| Artifact | Location | Owner |
|----------|----------|-------|
| ADRs | `docs/02-design/01-ADRs/` | @architect |
| API / TS specs | `docs/02-design/` | @architect |

---

## Key ADRs (Recent)

| ADR | Title | Sprint | Status |
|-----|-------|--------|--------|
| ADR-009 | Brain Architecture (Iceberg 4-layer) | 45 | Approved + Sprint 143 amendment (17th mechanism) |
| ADR-046 | Autonomous Execution Policy | 131-132 | Approved |
| ADR-050 | OpenMythos Evaluator Optimization Patterns | 139 | Approved |
| ADR-051 | Kimi Proxy Subprocess Orchestrator | 140 | Approved |
| ADR-052 | Agent-Model Tier Mapping | 140 | Approved + Sprint 142 amendment (vendor-agnostic enrichment) |

## Architecture Highlights (Sprint 142-143)

### Vendor-Agnostic Enrichment Layer

```
buildEnrichedPrompt(agent, task, history, workspace)  ← UNIVERSAL
    ├── SOUL identity
    ├── Workspace context (ALWAYS — not PATCH-only)
    ├── IDENTITY.md content (500 token cap)
    ├── Workspace Awareness directive (L1.25)
    ├── RL enrichment
    └── History context
    │
    ▼
Provider function  ← JUST API transport
    ├── claude-code: invokeRead/invokePatch
    ├── kimi: provider.chat()
    ├── openai: provider.chat()
    ├── ollama: fetch()
    └── [new-model]: register + ~20 LoC
```

Adding a new LLM provider = register endpoint + zero context code.

---

*EndiorBot | SDLC Framework **6.3.1** — Stage 02: Design — Updated Sprint 143 (2026-04-26)*
