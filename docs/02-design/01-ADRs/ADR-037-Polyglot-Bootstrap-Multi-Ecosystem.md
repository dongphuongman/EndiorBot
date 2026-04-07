# ADR-037: Polyglot Bootstrap & Multi-Ecosystem DevOps

**Status:** ACCEPTED
**Date:** 2026-03-29
**Sprint:** 123
**Authority:** PM — CTO 7/10 APPROVED, CPO 7.5/10 APPROVED
**SDLC Framework:** 6.3.0

---

## Context

The CEO frequently experiments with OSS repos from GitHub. Testing with Glass (Rust) showed EndiorBot supported only the Node.js ecosystem:

- `detectPackageManager()` only checked npm/pnpm/yarn/bun lock files
- `collectProjectContext()` only detected TypeScript/JavaScript
- `ops build/run` hardcoded `npm install` + `npm run build`
- No `git clone` integration

The Glass repo (Rust monorepo, Cargo workspace) was mis-detected as "JavaScript" and `ops build` failed.

---

## Decision

### 1. Unified Ecosystem Detection (CTO C1: SSOT)

Single `detectEcosystem()` function in `src/cli/commands/ecosystem-detector.ts`, imported by both `devops.ts` and `project-context-collector.ts`. No parallel detection paths.

Priority-ordered by marker file:

```
docker-compose.yml → Docker (docker compose) — HIGHEST priority
Cargo.toml → Rust (cargo)
go.mod → Go (go) — detect only, "coming soon"
pyproject.toml → Python (poetry/pip)
requirements.txt → Python (pip)
pom.xml → Java (maven) — detect only, "coming soon"
build.gradle(.kts) → Java (gradle) — detect only, "coming soon"
{lock files} → Node.js (pnpm/yarn/bun/npm)
package.json → Node.js (npm fallback)
```

**Monorepo detection:** When `docker-compose.yml` exists at root AND multiple ecosystem markers in subdirs (e.g., `backend/go.mod` + `frontend/package.json`), classify as Docker ecosystem. Scan `backend/`, `frontend/`, `server/`, `client/`, `app/`, `api/` for sub-ecosystems and report them.

**`--ecosystem <name>` override** for monorepos (CPO recommendation).

### 2. Ecosystem Command Mapping (4 ecosystems for Sprint 123)

Node.js + Rust + Python + Docker. Go/Java detected but "coming soon".

| Ecosystem | Install | Build | Run | Dev |
|-----------|---------|-------|-----|-----|
| Docker | _(none)_ | `docker compose build` | `docker compose up` | `docker compose up` |
| Node.js | `{pm} install` | `{pm} run build` | `{pm} run start` | `{pm} run dev` |
| Rust | _(built-in)_ | `cargo build --release` | `cargo run --release` | `cargo run` |
| Python | `pip install -r requirements.txt` / `poetry install` | _(none)_ | `python {entry}` | `python {entry}` |

### 3. Bootstrap Command

New `endiorbot bootstrap <url>` chains: clone → detect → init → build → run.

### 4. Security Constraints (CTO C2 + PM)

- **URL validation:** HTTPS + SSH `git@` only. Reject `file://`, relative paths.
- **Toolchain pre-check (CTO C3):** `which cargo/go/python` before build. Actionable error: "Rust toolchain not found. Install from rustup.rs"
- **Python venv (CTO C4):** Detect `.venv/`/`venv/`, warn if missing.
- **Shell safety:** `spawn` with argv array, no `shell: true` with attacker-controlled paths.
- **Git hooks trust:** Bootstrap output includes note that cloning runs repo hooks.

### 5. Handler Architecture (CTO C5)

`bootstrap-handler.ts` returns result objects. Only CLI wrapper calls `process.exit()`. OTT parity maintained.

### 6. UX Constraints (CPO C-CPO-1, C-CPO-3, C-CPO-4)

- **Failure UX:** Every phase → one-line summary + one actionable suggestion. No raw compiler output in OTT.
- **Post-bootstrap guidance:** After clone without `--build`, print detected ecosystem + next command.
- **OTT progress:** Immediate ack → phase updates → final summary.

---

## Alternatives Considered

### A: Shell script wrapper (rejected)
- Con: No cross-platform, no OTT parity, violates Thin Client Pattern

### B: Plugin system per ecosystem (deferred)
- Con: Over-engineering for 3-6 ecosystems. Revisit when count > 10

### C: Read build commands from CLAUDE.md (complementary)
- Use as fallback when CLAUDE.md exists with `## Commands` section

### D: 6 ecosystems in Sprint 123 (rejected by CPO)
- CPO: "6 half-baked > 3 polished". Go/Java deferred to Sprint 124+

---

## Consequences

### Positive
- CEO can try any OSS repo in one command
- EndiorBot supports Node.js, Rust, Python (Go/Java detected, future support)
- `init` correctly detects tech stack for context-aware SDLC docs
- OTT parity: `/bootstrap <url>` works in Telegram/Zalo

### Negative
- 3 ecosystem command mappings to maintain (expandable)
- Some projects need custom build commands not covered by standard mapping

### Risks
- Polyglot repos (Cargo.toml + package.json) may misdetect → mitigated by `--ecosystem` override
- Git clone hooks execute arbitrary code → mitigated by trust note in output
- Python entry detection heuristic may fail → mitigated by actionable error + `--main` flag

---

## Key Type Definitions

```typescript
// ecosystem-detector.ts — SSOT for all ecosystem detection
type Ecosystem = "node" | "rust" | "python" | "go" | "java";
type SupportLevel = "full" | "detect-only";

interface EcosystemDetectResult {
  ecosystem: Ecosystem;
  language: string;
  packageManager: string;
  support: SupportLevel;
  markerFile: string;
}

interface EcosystemCommands {
  install: string[] | null;
  build: string[] | null;
  run: string[];
  dev: string[];
}

// bootstrap-handler.ts — shared handler (no process.exit)
interface BootstrapResult {
  success: boolean;
  phases: BootstrapPhase[];
  ecosystem?: EcosystemDetectResult;
  nextSteps: string[];
  error?: PhaseError;
  totalDurationMs: number;
}

interface PhaseError {
  phase: "clone" | "detect" | "init" | "build" | "run";
  summary: string;   // One-line for OTT
  guidance: string;   // One actionable step
  rawError?: string;  // Full error (CLI only)
}
```

See `sprint-123-bootstrap-polyglot.md` Appendix A for full design specs of all CTO/CPO conditions.

---

## References

- Glass repo trial: `endiorbot ops build` failed on Rust project (Sprint 122 testing)
- ADR-006: CLI Architecture (Thin Client Pattern)
- gstack: platform-agnostic design — reads CLAUDE.md for project config, asks user if missing
