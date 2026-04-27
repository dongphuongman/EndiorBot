# Stage × Command × Workflow Spine (CPO / CTO)

**Status:** APPROVED (living document)  
**Framework:** SDLC **6.3.0**  
**Audience:** Solo developer shipping **enterprise-grade** behavior; **CEO vision** in [`product-vision.md`](./product-vision.md) (autonomous SDLC, design→build→test continuity, escalate only on critical issues).  
**Technical SSOT:** Commands implement in `./endiorbot.mjs` core; CLI, **OTT** (Telegram/Zalo), and **Web** share [`CommandDispatcher`](../../src/commands/command-dispatcher.ts) + gateway ingress where applicable — *thin client everywhere*.

**Language:** Application development documentation under `docs/` is authored in **English** (SDLC 6.3.0). See [`docs/README.md`](../README.md) (section *Documentation language*).

---

## 1. Why this document exists

EndiorBot exposes **two complementary surfaces**:

| Surface | Purpose | CEO / solo-dev value |
|--------|---------|----------------------|
| **A — Atomic commands** | One clear outcome per invocation (status, one analysis, one file generation, one build). | Fast answers &lt;30s; predictable, auditable. |
| **B — Workflows** | Ordered steps across stages (idea → plan → scaffold → build → verify) with shared handlers and gates. | Seamless chains from [`product-vision.md`](./product-vision.md): fewer manual handoffs. |

**Design ↔ Build ↔ Test consistency:** Every feature line must trace **forward** (requirements → design → code → tests) and **backward** (tests prove acceptance; design artifacts explain *why* code shape). Atomic commands *inspect* or *nudge* one link; workflows *chain* links without skipping gates.

---

## 2. Stage pipeline (00 → 05) and gates

| Stage | Folder | Key question | Primary SDLC concern | Typical gates |
|-------|--------|--------------|----------------------|---------------|
| **00** | `docs/00-foundation/` | **WHY** | Problem, vision, business case | G0.1 (problem validated) |
| **01** | `docs/01-planning/` | **WHAT** | Requirements, scope, backlog | G1 (requirements complete) |
| **02** | `docs/02-design/` | **HOW (design)** | ADR, APIs, threat model | G2 (design approved) |
| **03** | `docs/03-integrate/` | **CONNECT** | Contracts, channels, external systems | G2 (contracts aligned with design) |
| **04** | `docs/04-build/` | **BUILD** | Implementation, quality bar | G-Sprint, G3 (build/test ready) |
| **05** | `docs/05-test/` | **VERIFY** | Tests, evidence, regression | G3, G4 readiness |

**CTO invariant (from product vision):** pipeline is **01 → 02 → 03 → 04 → 05** — integration stage is not optional for platform work.

### 2.1 Extended lifecycle (06 → 09)

Same governance model: **atomic** commands vs **workflows**; docs live under `docs/06-*` … `docs/09-*`. Full table: [`docs/README.md`](../README.md).

| Stage | Folder | Key question |
|-------|--------|--------------|
| **06** | `docs/06-deploy/` | **SHIP** — release, CI/CD, environments |
| **07** | `docs/07-operate/` | **RUN** — monitoring, incidents, runbooks |
| **08** | `docs/08-collaborate/` | **ALIGN** — compliance templates, handover, humans + agents |
| **09** | `docs/09-govern/` | **IMPROVE** — RFCs, retros, process evolution |

---

## 3. Atomic commands (Group A) — by stage

*Representative* mappings; full matrix: [`docs/reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md). *Web* parity = same handler as OTT when exposed through gateway.

| Stage focus | CLI (examples) | OTT (examples) | Notes |
|-------------|----------------|------------------|--------|
| 00–01 | `consult`, `plan` (draft), `init --analyze` | `/consult`, `/plan` | Plan is **display-only** until execution engine (124b+) is approved; drafts under `docs/04-build/sprints/drafts/`. |
| 02 | `gate check G2`, `compliance check` | `/gate`, `/compliance` | Evidence before declaring design done. |
| 03 | `compliance check`, `config`, bridge status | `/config` | Integration artifacts live under `docs/03-integrate/`. |
| 04 | `ops build`, `ops run`, `bootstrap`, `fix` (dry-run default) | — (mostly CLI); AI via `@coder` | Polyglot **ops**; **bootstrap** = clone → detect → init SDLC. |
| 05 | `pnpm test` / project test command, `compliance`, `gate` | — | Test evidence feeds G3. |

**Memory / context (cross-cutting):** ClawVault read/write policy per ADR-038; opt-out `ENDIORBOT_MEMORY_DISABLED=true`.

---

## 4. Workflows (Group B) — seamless chains

| Workflow | Steps (conceptual) | Primary entry today | Maturity |
|----------|-------------------|---------------------|----------|
| **Try OSS repo** | clone → detect ecosystem → init SDLC → optional build | `endiorbot bootstrap <url> …` | Shipped (Sprint 123). |
| **Idea → structured plan** | decompose → assign agents → save draft | `endiorbot plan "…"` / `/plan` | Shipped (124a); **no auto-execute** until 124b. |
| **Sprint closure** | test → build → docs → commit discipline | `endiorbot sprint close` (OTT `/sprint-close` → same handler) | Shipped. |
| **Compliance loop** | check → optional fix (dry-run) → re-check | `compliance check`, `fix` | Shipped. |
| **Autonomous stage session** | long-running design/build/test with checkpoints | Vision in `product-vision.md` (Gate A/B/C); wiring **124b+** | Partially stubbed — do not market as full until CTO sign-off. |

Workflows **reuse** the same core modules as atomic commands (no duplicate business logic in `.md` files).

---

## 5. Design–build–test traceability (CPO checklist)

1. **01** acceptance criteria exist → **02** ADR/spec references them → **04** implementation maps to tasks → **05** tests map to criteria.  
2. **03** integration contracts do not contradict **02** design.  
3. **Gate** status is recorded (e.g. `.sdlc-config.json` / evidence dirs) — not “vibe passed”.  
4. **CEO sovereignty:** multi-model **consult** informs; **human approves** gates and production paths (per `CLAUDE.md` / AGENTS).

---

## 6. Revision ownership

| Role | Responsibility |
|------|----------------|
| **CPO** | Stage outcomes, gate meaning, UX of atomic vs workflow; alignment with `product-vision.md`. |
| **CTO** | Command wiring, execution safety, OTT/Web parity, stub vs shipped truth. |
| **CEO** | Vision and autonomy level (L1–L4); when to enable deeper workflows. |

---

## 7. Related documents

- [`product-vision.md`](./product-vision.md) — north star & autonomy levels  
- [`../README.md`](../README.md) — **stage index** (00–09) and cross-links  
- [`../reference/templates/COMMANDS.md`](../reference/templates/COMMANDS.md) — command catalog for templates & agents  
- Stage READMEs `docs/**/README.md` (per-stage folders) — pointers back to this spine  

---

*EndiorBot — Solo Developer Power Tool + enterprise SDLC discipline for solo dev | SDLC 6.3.0*
