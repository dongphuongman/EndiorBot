# ADR-039: Claude Code research artifacts — governance & best practices (CPO / CTO)

**Status:** ACCEPTED  
**Date:** 2026-04-01  
**Approved:** CEO (2026-04-01) · **Reviewed:** CPO, CTO  
**SDLC:** 6.3.0  
**Related:** ADR-006 (Bridge), `CLAUDE.md` thin-client pattern, `docs/README.md` (English documentation policy)

---

## Context

Several **local reference trees** exist under the EndiorBot workspace (not necessarily committed to public remotes). They represent different reactions to **public reports (March 2026)** that Claude Code’s npm package had shipped artifacts that exposed original TypeScript via **source maps** (`sourcesContent`). EndiorBot’s product strategy remains: **Solo Developer Power Tool** integrated with **official** Claude Code / Anthropic surfaces — not a fork of proprietary CLI internals.

| Path (workspace) | Nature (high level) | Relevance to EndiorBot |
|------------------|---------------------|-------------------------|
| `claude-code/` | Third-party repo: **spec** (`spec/`) + **Rust reimplementation** (`src-rust/`); README describes clean-room from spec, not copied TS | **Process pattern:** spec-first + separate implementation; **not** a license to ship Anthropic expression |
| `claude-code-source/` | README states recovery from **source map** of a published npm version; unofficial | **Treat as Anthropic-proprietary study material** — no merge into product |
| `claude-code-sourcemap/` | Older **source-map extraction** research tree; points to other forks | Same as above; historical reference only |
| `leaked-claude-code/` | Reconstructed **TypeScript** tree + build scaffolding; README markets “unlocked” behavior | **High legal/contamination risk** — must not become a dependency or copy source |
| `claw-code/` | Community **Python / Rust** “harness” port; positions as patterns study + tooling | **Architecture ideas only** (tools, coordinator, hooks); verify license per upstream before any reuse |

**Important:** A file named `LICENSE` inside a third-party tree **does not** retroactively open-source Anthropic’s original work. EndiorBot assumes **Anthropic retains rights** to Claude Code unless explicitly stated otherwise in a **signed** or **public** license grant.

---

## Decision

### 1. Compliance posture (non-negotiable)

1. **No production dependency** on `leaked-claude-code/`, `claude-code-source/`, `claude-code-sourcemap/`, or any tree whose primary content is recovered proprietary TypeScript from npm source maps.  
2. **No copy-paste** of implementation from those trees into `src/` (EndiorBot core). Features must be implemented **originally** or via **documented public APIs** (Anthropic API, official extension behavior, published docs).  
3. **Clean-room Rust + spec** (`claude-code/` style) may inform **EndiorBot’s own** design discussions only as *behavioral* inspiration; any shared code must come with **compatible OSS licenses** and counsel approval if ambiguous.  
4. **CTO gate:** Release artifacts (npm tarball, Docker image, public GitHub) must not bundle the research directories unless explicitly re-licensed and approved.

### 2. Repository hygiene

| Practice | Owner | Rationale |
|----------|-------|-----------|
| **`.gitignore`** the five research directory names at repo root (see Implementation notes) | CTO / DevOps | Prevents accidental push of proprietary-derived trees; use submodule or separate clone if team needs tracked mirrors |
| **CI:** fail or warn if `package.json` / `pnpm` workspace references paths under `leaked-claude-code` or `claude-code-source*` | CTO | License contamination guard |
| Document allowed integration surfaces in **one** place: official Claude Code extension + Bridge (ADR-006) + `endiorbot.mjs` | CPO | Avoid “shadow CLI” drift |

### 3. Supply-chain lessons (apply to EndiorBot itself)

The incident reinforces practices EndiorBot should enforce for **its own** publishes:

- **Production bundles:** disable or strip **inline `sourcesContent`**; do not ship `.map` files to npm/registry consumers unless policy explicitly allows.  
- **`.npmignore` / publish config:** exclude `*.map`, `docs/10-Archive`, and any local research dirs.  
- **Release checklist:** `npm pack --dry-run` inspect file list; optional script to grep for `sourcesContent` in published JSON.

### 4. Product / architecture best practices (abstract)

Derived **without** adopting leaked code — aligned with public agent-harness discourse and EndiorBot’s existing ADRs:

| Theme | Best practice for EndiorBot |
|-------|------------------------------|
| **Thin client** | Keep orchestration, gates, and business logic in **EndiorBot core**; Claude Code remains **execution** (already in `CLAUDE.md`). |
| **Tooling & permissions** | Maintain explicit **allowlists** (`EXEC_ALLOWLIST.md`), structured tool policy, and **stdin JSON** hooks — same class of controls as mature harnesses. |
| **Bridge & sessions** | Continue **tmux/session** model (ADR-006) for resilience; avoid duplicating undocumented IDE bridge protocols from study trees. |
| **Multi-model & routing** | EndiorBot’s value is **gateway + SDLC**; do not depend on unofficial “unlock” transport paths. |
| **Parity / regression** | If comparing behavior to Claude Code, test against **installed official CLI** and **documented** flags — not internal symbols from research repos. |
| **Spec-first new features** | For large new modules, prefer **TS/spec + separate implementation** (internal docs under `docs/02-design/`) to reduce accidental derivation from third-party expression. |

### 5. CPO responsibilities

- Positioning: EndiorBot is **not** “Claude Code leaked edition”; marketing and docs stay on **solo dev + SDLC + CEO vision**.  
- If external research is cited in ADRs, cite **public articles** or **official Anthropic docs**, not filenames inside leaked trees.

### 6. CTO responsibilities

- Periodic **dependency audit** (`pnpm why`, lockfile, Docker COPY).  
- Ensure **Bridge** and **agent launcher** only use **supported** integration mechanisms.  
- Optional: small **`scripts/check-no-leaked-imports.mjs`** (grep `from ['"]\.\./leaked` etc.) in CI — implement when/if needed.

---

## Consequences

### Positive

- Clear **legal and engineering boundary** between study material and shipping product.  
- Stronger **release hygiene** (source maps, publish lists) for EndiorBot’s own packages.  
- CPO/CTO shared vocabulary for **why** we do not vendor leaked TS.

### Negative / cost

- Engineers cannot “speed run” by pasting from `leaked-claude-code/` — intentional friction.  
- Some community ports (e.g. `claw-code`) may look tempting; **each** reuse needs license + scope review.

---

## References (public)

- Anthropic **Claude Code** product and docs: [https://code.claude.com/docs](https://code.claude.com/docs) (overview as linked from official materials).  
- General **source map** risk: MDN / TC39 discussions on `sourcesContent` in distribution artifacts (industry practice: omit from production npm).

---

## Implementation notes

- **`.gitignore`:** Repository root ignores `claude-code/`, `claude-code-source/`, `claude-code-sourcemap/`, `claw-code/`, `leaked-claude-code/` (2026-04-01) so they are not pushed to public remotes by default.  
- **`SECURITY.md`:** Links to this ADR for third-party research trees.

## Local inventory (maintenance)

Onboarding: *Research clones live only on approved workstations; not part of the distributable product.*

---

*ADR-039 — EndiorBot | CPO/CTO governance for Claude Code research trees | SDLC 6.3.0*
