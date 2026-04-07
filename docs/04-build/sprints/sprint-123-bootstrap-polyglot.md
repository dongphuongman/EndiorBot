# Sprint 123 — Bootstrap Command + Polyglot DevOps

**Date:** 2026-03-29
**Status:** COMPLETE
**Prerequisite:** Sprint 122 COMPLETE (7,453 tests, CSO audit done)
**Framework:** SDLC 6.3.0
**Authority:** PM — pending CTO/CPO review

---

## Context

The CEO frequently experiments with OSS repos from GitHub. The current workflow required four manual steps (clone → init → build → run) and `ops build` only supported Node.js (npm/pnpm/yarn/bun). Testing the Glass (Rust) repo exposed three gaps:

1. **No `git clone` integration** — clone had to be done manually
2. **`ops` was Node-only** — Rust/Python/Go/Java failed
3. **Weak tech stack detection** — Glass (Rust) was mis-detected as "JavaScript"

**Goal:** One-command bootstrap (`endiorbot bootstrap <url>`) + multi-language ops support.

**Baseline:** 7,453 tests passing, 10 skipped, 0 failing, build clean.

---

## CTO Conditions (binding)

1. **C1 — Single detection function:** `detectEcosystem()` in ONE file, imported by both devops.ts and project-context-collector.ts. No parallel detection paths.
2. **C2 — URL validation:** Whitelist HTTPS + SSH `git@`. Reject `file://`, relative paths, bare paths.
3. **C3 — Toolchain pre-check:** `which cargo/go/python` before attempting build. Clear error: "Rust toolchain not found. Install from rustup.rs"
4. **C4 — Python venv awareness:** Detect `.venv/`/`venv/`, use if present. Warn if missing.
5. **C5 — No `process.exit()` in handler:** `bootstrap-handler.ts` returns result objects. Only CLI wrapper calls `process.exit()`.

## CPO Conditions (binding)

1. **C-CPO-1 — Failure UX:** Every phase (invalid URL, network failure, missing toolchain, build error) → one-line summary + one actionable suggestion. No raw compiler dumps in OTT.
2. **C-CPO-2 — 3 ecosystems for Sprint 123:** Node.js, Rust, Python with solid support. Go/Java detected but return "coming soon".
3. **C-CPO-3 — Post-bootstrap guidance:** After clone without `--build`, print what was detected and what to run next.
4. **C-CPO-4 — OTT progress pattern:** Telegram: immediate ack → phase updates → final summary. No silent 30s gaps.

## PM Acceptance Criteria (binding)

1. **AC1:** Glass repo → `init --analyze` reports **Rust + cargo**, not JavaScript.
2. **AC2:** `ops build` on Glass runs **`cargo build`**, using `spawn` with argv (no shell string concatenation).
3. **AC3:** `bootstrap <url> --dir … --build` completes clone → detect → init → build, exits 0 on success. `--skip-init` works.
4. **AC4:** Unit tests for priority detection + at least 1 integration test fixture (temp dir + fake marker files, no GitHub clone in CI).
5. **AC5:** OTT `/bootstrap` returns short status — no sync long-running build in message handler.

## Security Notes (PM + CTO)

- **Shell injection:** `runCommand()` must use `spawn` with explicit argv array, NOT `shell: true` with attacker-controlled directory names.
- **Git clone hooks:** `.git/hooks/post-checkout` executes arbitrary code. Document trust requirement.
- **Java glob:** `target/*.jar` resolved in code, not shell glob.
- **Python entry:** Clear error with guidance when entry point cannot be detected (suggest `--main` flag).
- **`--dir` overwrite:** Reject if directory exists and not empty (unless `--force`).

---

## Scope

### IN SCOPE

| Track | What | Est. |
|-------|------|------|
| T0 — Refactor detection into shared module | Extract existing detection to shared `ecosystem-detector.ts`, update consumers | 1-2h |
| T1 — Polyglot Tech Stack Detection | Expand `detectEcosystem()` for Rust, Python, Go, Java | 2-3h |
| T2 — Multi-Ecosystem DevOps | Expand `ops build/run` using ecosystem commands | 4-5h |
| T3 — Bootstrap Command | `endiorbot bootstrap <url>` = clone → detect → init → build → run | 3-4h |

### OUT OF SCOPE

| Item | Why |
|------|-----|
| Go / Java ecosystem ops support | CPO C-CPO-2: detect but return "coming soon". Ship in Sprint 124+ |
| `compliance fix` for non-JS projects | Separate sprint — needs AI agent work |
| Language-specific linting (clippy, pylint, golint) | Future enhancement |
| Cross-compilation support | Not needed for bootstrap workflow |
| CI/CD pipeline generation | Separate feature |

---

## Track 1: Polyglot Tech Stack Detection (T1)

**Problem:** `collectProjectContext()` only detects JS/TS. Glass (Rust) detected as "JavaScript".

### New `detectEcosystem()` function

Priority-ordered detection (first match wins):

| Ecosystem | Detect By | Language | Package Manager | Sprint 123 |
|-----------|-----------|----------|-----------------|------------|
| **Docker** | `docker-compose.yml` or `compose.yml` at root | Multi-language | docker | ✅ Full support |
| **Rust** | `Cargo.toml` | Rust | cargo | ✅ Full support |
| **Python (Poetry)** | `pyproject.toml` with `[tool.poetry]` | Python | poetry | ✅ Full support |
| **Python (pip)** | `requirements.txt` or `pyproject.toml` | Python | pip | ✅ Full support |
| **Go** | `go.mod` | Go | go | 🔜 Detect only |
| **Java (Maven)** | `pom.xml` | Java | maven | 🔜 Detect only |
| **Java (Gradle)** | `build.gradle` or `build.gradle.kts` | Java | gradle | 🔜 Detect only |
| **TypeScript** | `tsconfig.json` + `package.json` | TypeScript | npm/pnpm/yarn/bun | ✅ Full support |
| **JavaScript** | `package.json` (no tsconfig) | JavaScript | npm/pnpm/yarn/bun | ✅ Full support |

**Monorepo detection:** When `docker-compose.yml` exists + multiple ecosystem markers in subdirs, classify as Docker. Scan common subdirs (`backend/`, `frontend/`, `server/`, `client/`, `app/`, `api/`) for sub-ecosystems.

**`--ecosystem <name>` override flag** (CPO recommendation): For monorepos with multiple marker files (e.g., Tauri with both Cargo.toml + package.json), user can force ecosystem.

**Files:**
- CREATE: `src/cli/commands/ecosystem-detector.ts` — shared `detectEcosystem()` (CTO C1: SSOT)
- MODIFY: `src/sdlc/compliance/project-context-collector.ts` — import from shared module
- MODIFY: `src/cli/commands/devops.ts` — import from shared module
- MODIFY: `src/sdlc/compliance/fix-types.ts` — expand `TechStackInfo.language` union

### TechStackInfo expansion

```typescript
// Current: language is free string
language: string;  // "TypeScript" | "JavaScript"

// After: support all detected languages
language: string;  // "TypeScript" | "JavaScript" | "Rust" | "Python" | "Go" | "Java"
```

---

## Track 2: Multi-Ecosystem DevOps (T2)

**Problem:** `ops build/run` hardcodes `npm install` + `npm run build`. Rust/Python/Go/Java fail.

### Ecosystem command mapping

| Ecosystem | Install | Build | Run (prod) | Run (dev) |
|-----------|---------|-------|------------|-----------|
| **Node.js** | `{pm} install` | `{pm} run build` | `{pm} run start` | `{pm} run dev` |
| **Rust** | _(built-in)_ | `cargo build --release` | `cargo run --release` | `cargo run` |
| **Python** | `pip install -r requirements.txt` / `poetry install` | _(none or `python -m build`)_ | `python -m {main}` | `python -m {main}` |
| **Go** | `go mod download` | `go build -o ./bin/app .` | `./bin/app` | `go run .` |
| **Maven** | `mvn install -DskipTests` | `mvn package -DskipTests` | `java -jar target/*.jar` | `mvn spring-boot:run` |
| **Gradle** | `gradle build -x test` | `gradle build -x test` | `java -jar build/libs/*.jar` | `gradle bootRun` |

### Implementation

Replace `detectPackageManager()` with `detectEcosystem()` in devops.ts:

```typescript
type Ecosystem = "node" | "rust" | "python" | "go" | "java";

interface EcosystemInfo {
  ecosystem: Ecosystem;
  packageManager: string;  // npm, cargo, pip, go, maven, etc.
  installCmd: string[];    // ["cargo", "build"] or ["npm", "install"]
  buildCmd: string[];      // ["cargo", "build", "--release"]
  runCmd: string[];        // ["cargo", "run"]
  devCmd: string[];        // ["cargo", "run"] (no --release)
}
```

**Files:**
- MODIFY: `src/cli/commands/devops.ts` — replace PM detection with ecosystem detection, refactor build/run actions
- CREATE: `src/cli/commands/ecosystem-detector.ts` — `detectEcosystem()` + `getEcosystemCommands()`

### Detection priority (project root)

```
Cargo.toml          → Rust
go.mod              → Go
pyproject.toml      → Python (check poetry vs pip)
requirements.txt    → Python (pip)
pom.xml             → Java (Maven)
build.gradle(.kts)  → Java (Gradle)
pnpm-lock.yaml      → Node (pnpm)
yarn.lock           → Node (yarn)
bun.lockb/bun.lock  → Node (bun)
package.json        → Node (npm fallback)
```

### Python main detection

```
1. pyproject.toml [project.scripts] or [tool.poetry.scripts]
2. manage.py → Django: "python manage.py runserver"
3. app.py / main.py → "python app.py" / "python main.py"
4. src/__main__.py → "python -m src"
```

### Rust binary detection

```
1. Cargo.toml [package] name → default binary
2. src/main.rs exists → "cargo run"
3. Multiple [[bin]] entries → prompt user or use first
```

---

## Track 3: Bootstrap Command (T3)

**The CEO's one-command workflow:**

```bash
endiorbot bootstrap https://github.com/Glass-HQ/Glass.git \
  --dir ~/Projects/Glass \
  --tier STANDARD \
  --build \
  --run
```

### Command options

| Flag | Default | Description |
|------|---------|-------------|
| `<url>` | _(required)_ | Git repo URL (HTTPS or SSH) |
| `--dir <path>` | `./<repo-name>` | Clone destination |
| `--tier <tier>` | auto-detect | SDLC tier |
| `--build` | false | Run build after init |
| `--run` | false | Run after build |
| `--branch <branch>` | default branch | Clone specific branch |
| `--depth <n>` | full | Shallow clone depth |
| `--skip-init` | false | Skip SDLC init (just clone + build) |

### Execution phases

```
Phase 1: Clone
  ├── Parse URL → extract repo name
  ├── Validate --dir (no overwrite unless --force)
  ├── git clone [--depth N] [--branch B] <url> <dir>
  └── Verify .git exists

Phase 2: Detect
  ├── detectEcosystem() → Rust/Python/Go/Java/Node
  ├── collectProjectContext() → ProjectSnapshot
  └── Display: "Detected: Rust (cargo), 42 crates"

Phase 3: Init (unless --skip-init)
  ├── Detect existing SDLC state (FRESH/PARTIAL/etc.)
  ├── executeInitCommand() with detected tier
  └── Display: "SDLC initialized (STANDARD tier)"

Phase 4: Build (if --build or --run)
  ├── getEcosystemCommands() → install + build commands
  ├── Run install (deps)
  ├── Run build
  └── Display: "Build complete (42s)"

Phase 5: Run (if --run)
  ├── getEcosystemCommands() → run/dev command
  ├── Run with live output (stdio: inherit)
  └── Ctrl+C to stop
```

### Output format

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 EndiorBot Bootstrap                                     │
├─────────────────────────────────────────────────────────────┤
│  Repo: Glass-HQ/Glass                                       │
│  Path: /Users/dttai/Documents/Python/01.NQH/Glass          │
│  Ecosystem: Rust (cargo)                                    │
│  Tier: STANDARD (auto-detected)                             │
├─────────────────────────────────────────────────────────────┤
│  ✅ Clone     (2.3s)                                        │
│  ✅ Detect    Rust, 42 crates, Docker, CI                   │
│  ✅ Init      SDLC STANDARD, 13 files created               │
│  ✅ Build     cargo build --release (38s)                    │
│  ⏳ Run       cargo run --release                            │
└─────────────────────────────────────────────────────────────┘
```

**Files:**
- CREATE: `src/cli/commands/bootstrap.ts` — CLI command
- CREATE: `src/commands/handlers/bootstrap-handler.ts` — shared logic (OTT-compatible)
- MODIFY: `src/cli/commands/register-all.ts` — register bootstrap command

### OTT parity (Conversation-First)

```
/bootstrap https://github.com/Glass-HQ/Glass.git --tier STANDARD
→ "✅ Cloned Glass (Rust/cargo). SDLC STANDARD initialized. Run /ops build to build."
```

---

## Execution Order

```
Sprint 123:
├── T0: Refactor detection into shared module               [1-2h]
│   ├── CREATE ecosystem-detector.ts (extract from devops.ts + project-context-collector.ts)
│   ├── Update devops.ts + project-context-collector.ts to import from shared module
│   └── Verify existing tests still pass (CTO C1)
├── T1: Polyglot detection expansion                        [2-3h]
│   ├── Add Rust/Python/Go/Java detection to detectEcosystem()
│   ├── Add toolchain pre-check: which cargo/go/python (CTO C3)
│   └── Test: verify Glass → "Rust (cargo)" (PM AC1)
├── T2: Multi-ecosystem ops build/run                       [4-5h]
│   ├── Refactor devops.ts to use ecosystem commands
│   ├── Python venv awareness (CTO C4)
│   ├── URL validation for bootstrap (CTO C2)
│   ├── spawn with argv, no shell: true (Security)
│   └── Test: cargo build on Glass repo (PM AC2)
├── T3: Bootstrap command                                   [3-4h]
│   ├── bootstrap-handler.ts (shared, no process.exit — CTO C5)
│   ├── bootstrap.ts (CLI wrapper)
│   ├── register in register-all.ts
│   └── Test: end-to-end bootstrap (PM AC3)
├── Build + full test suite
└── Verify: endiorbot bootstrap https://github.com/Glass-HQ/Glass.git --build
```

**Total estimated effort:** 8-10h (revised: CTO +T0, CPO scope trim to 3 ecosystems)

---

## Appendix A: Condition Design Specs

### A1: Shared Ecosystem Detection — CTO C1

**File:** `src/cli/commands/ecosystem-detector.ts` (CREATE — single source of truth)

```typescript
// Types
type Ecosystem = "node" | "rust" | "python" | "go" | "java";
type SupportLevel = "full" | "detect-only";

interface EcosystemDetectResult {
  ecosystem: Ecosystem;
  language: string;           // "Rust", "Python", "TypeScript", "JavaScript", "Go", "Java"
  packageManager: string;     // "cargo", "pip", "poetry", "npm", "pnpm", "yarn", "bun", "go", "maven", "gradle"
  support: SupportLevel;      // "full" for Node/Rust/Python, "detect-only" for Go/Java
  markerFile: string;         // file that triggered detection (e.g. "Cargo.toml")
}

interface EcosystemCommands {
  install: string[] | null;   // null = no install step needed
  build: string[] | null;     // null = no build step
  run: string[];
  dev: string[];
}

// Main detection function — imported by devops.ts AND project-context-collector.ts
function detectEcosystem(projectPath: string, override?: Ecosystem): EcosystemDetectResult;

// Command mapping — only for "full" support ecosystems
function getEcosystemCommands(result: EcosystemDetectResult, projectPath: string): EcosystemCommands;

// Toolchain check — CTO C3
function checkToolchain(ecosystem: Ecosystem): { available: boolean; command: string; installUrl: string };
```

**Consumers (refactored, no own detection):**
- `devops.ts`: import `detectEcosystem()` + `getEcosystemCommands()`, remove `detectPackageManager()`
- `project-context-collector.ts`: import `detectEcosystem()`, remove inline language/PM detection
- `bootstrap-handler.ts`: import all three functions

### A2: URL Validation — CTO C2

```typescript
// In bootstrap-handler.ts
const ALLOWED_URL_PATTERNS = [
  /^https:\/\/.+/,              // HTTPS
  /^http:\/\/localhost[:/].+/,  // Local HTTP (for Gitea/GitLab self-hosted)
  /^git@[\w.-]+:.+/,           // SSH git@host:repo
];

const BLOCKED_URL_PATTERNS = [
  /^file:\/\//,                 // Local file protocol
  /^\//,                        // Absolute path (not a URL)
  /^\.\./,                      // Relative path traversal
];

function validateRepoUrl(url: string): { valid: boolean; error?: string } {
  for (const blocked of BLOCKED_URL_PATTERNS) {
    if (blocked.test(url)) return { valid: false, error: `Blocked URL pattern: ${url}. Use HTTPS or SSH git@ format.` };
  }
  for (const allowed of ALLOWED_URL_PATTERNS) {
    if (allowed.test(url)) return { valid: true };
  }
  return { valid: false, error: `Invalid repo URL: ${url}. Use https://github.com/... or git@github.com:...` };
}
```

### A3: Toolchain Pre-Check — CTO C3

```typescript
const TOOLCHAIN_INFO: Record<Ecosystem, { command: string; installUrl: string }> = {
  rust:   { command: "cargo",  installUrl: "https://rustup.rs" },
  python: { command: "python3", installUrl: "https://www.python.org/downloads/" },
  go:     { command: "go",     installUrl: "https://go.dev/dl/" },
  java:   { command: "java",   installUrl: "https://adoptium.net" },
  node:   { command: "node",   installUrl: "https://nodejs.org" },
};

async function checkToolchain(ecosystem: Ecosystem): Promise<{ available: boolean; version?: string; installUrl: string }> {
  const info = TOOLCHAIN_INFO[ecosystem];
  try {
    const { stdout } = await execFileAsync("which", [info.command]);
    const version = await execFileAsync(info.command, ["--version"]);
    return { available: true, version: version.stdout.trim(), installUrl: info.installUrl };
  } catch {
    return { available: false, installUrl: info.installUrl };
  }
}

// Error message format (C-CPO-1):
// "❌ Rust toolchain not found. Install from https://rustup.rs"
```

### A4: Python Venv Awareness — CTO C4

```typescript
function detectPythonVenv(projectPath: string): { hasVenv: boolean; venvPath?: string; activateCmd?: string } {
  const candidates = [".venv", "venv", ".env", "env"];
  for (const dir of candidates) {
    const venvPath = join(projectPath, dir);
    const activatePath = join(venvPath, "bin", "activate");
    if (existsSync(activatePath)) {
      return {
        hasVenv: true,
        venvPath,
        activateCmd: `source ${join(dir, "bin", "activate")}`,
      };
    }
  }
  return { hasVenv: false };
}

// In getEcosystemCommands for Python:
// If hasVenv → prefix python/pip with venv path: [join(venvPath, "bin", "python"), ...]
// If !hasVenv → warn: "⚠️ No virtual environment found. Consider: python3 -m venv .venv"
```

### A5: Failure UX — CPO C-CPO-1

Every bootstrap phase returns structured error with one-line summary + one actionable suggestion:

```typescript
interface PhaseError {
  phase: "clone" | "detect" | "init" | "build" | "run";
  summary: string;     // One-line: "Clone failed: repository not found"
  guidance: string;     // One actionable step: "Check the URL and ensure the repo is public"
  rawError?: string;    // Full error (CLI only, NOT sent to OTT)
}

// Error mapping:
const PHASE_ERRORS: Record<string, { summary: string; guidance: string }> = {
  // Clone phase
  "CLONE_NOT_FOUND":      { summary: "Repository not found",           guidance: "Check URL spelling. Ensure repo is public or you have SSH access." },
  "CLONE_NETWORK":        { summary: "Network error during clone",     guidance: "Check internet connection. Try again." },
  "CLONE_DIR_EXISTS":     { summary: "Directory already exists",       guidance: "Use --force to overwrite, or choose a different --dir." },
  "CLONE_AUTH":           { summary: "Authentication failed",          guidance: "For private repos, use SSH URL (git@github.com:...) with configured SSH key." },
  // Detect phase
  "DETECT_UNKNOWN":       { summary: "Could not detect project type",  guidance: "Use --ecosystem <node|rust|python> to specify manually." },
  "DETECT_UNSUPPORTED":   { summary: "Detected {lang} — not yet supported", guidance: "Go/Java support coming soon. Use endiorbot init for SDLC setup." },
  // Build phase
  "BUILD_NO_TOOLCHAIN":   { summary: "{tool} not found",              guidance: "Install from {url}" },
  "BUILD_FAILED":         { summary: "Build failed (exit code {code})", guidance: "Check build output above. Common: missing dependencies or wrong toolchain version." },
  // Run phase
  "RUN_NO_ENTRY":         { summary: "Could not detect entry point",  guidance: "Use --main <file> to specify, or add entry point to pyproject.toml/Cargo.toml." },
};
```

**OTT format (Telegram/Zalo):**
```
❌ *Bootstrap failed at Build phase*
Build failed (exit code 1)
→ Check build output above. Common: missing dependencies or wrong toolchain version.
```

**CLI format (full detail):**
```
❌ Build failed (exit code 1)
  → Check build output above. Common: missing dependencies or wrong toolchain version.

  Raw output:
  error[E0433]: failed to resolve: could not find `serde` in the list of imported crates
```

### A6: Post-Bootstrap Guidance — CPO C-CPO-3

When `--build` is NOT specified, print next steps:

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 EndiorBot Bootstrap                                     │
├─────────────────────────────────────────────────────────────┤
│  ✅ Clone     Glass-HQ/Glass (2.3s)                         │
│  ✅ Detect    Rust (cargo), 42 crates, Docker ✓, CI ✓       │
│  ✅ Init      SDLC STANDARD, 13 files created               │
├─────────────────────────────────────────────────────────────┤
│  📋 Next Steps:                                              │
│     endiorbot ops build --path {path}                        │
│     endiorbot ops run --path {path} --dev                    │
│     endiorbot compliance check --path {path}                 │
└─────────────────────────────────────────────────────────────┘
```

**OTT format:**
```
✅ Cloned *Glass* (Rust/cargo)
SDLC STANDARD initialized (13 files)

📋 Next:
`/ops build` — Build project
`/ops run --dev` — Run dev server
`/compliance check` — Check SDLC compliance
```

### A7: OTT Progress Pattern — CPO C-CPO-4

For OTT channels (Telegram/Zalo), bootstrap is async with phase updates:

```
Phase 0 (immediate): "⏳ Cloning Glass-HQ/Glass..."
Phase 1 (after clone): "✅ Cloned. Detecting ecosystem..."
Phase 2 (after detect): "✅ Rust (cargo). Initializing SDLC..."
Phase 3 (after init): "✅ SDLC STANDARD initialized. Building..."
Phase 4 (after build): "✅ Build complete (38s). Run with /ops run"
```

**Implementation:** `bootstrap-handler.ts` returns `BootstrapResult` with `phases[]` array. OTT adapter sends updates progressively. CLI displays as live-updating box.

```typescript
interface BootstrapResult {
  success: boolean;
  phases: BootstrapPhase[];
  ecosystem?: EcosystemDetectResult;
  nextSteps: string[];       // Post-bootstrap guidance
  error?: PhaseError;
  totalDurationMs: number;
}

interface BootstrapPhase {
  name: "clone" | "detect" | "init" | "build" | "run";
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message: string;
  durationMs?: number;
}
```

### A8: Shell Safety — Security

```typescript
// SAFE: spawn with argv array (no shell interpretation)
function runEcosystemCommand(args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), {
      cwd,
      stdio: "inherit",
      // NO shell: true — prevents injection via directory names
    });
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

// UNSAFE (current pattern in devops.ts — must refactor):
// spawn(cmd, args, { shell: true })  ← attacker-controlled cwd could inject
```

### A9: Git Trust Warning — Security

Bootstrap output includes trust note (first line after clone starts):

**CLI:**
```
⚠️ Note: Cloning runs git hooks from the repo. Only clone repos you trust.
```

**OTT:**
```
⚠️ Cloning runs repo hooks. Ensure you trust this source.
```

---

## Verification

```bash
# T1: Ecosystem detection
node endiorbot.mjs init --path /Users/dttai/Documents/Python/01.NQH/Glass --analyze
# Should show: "Rust (cargo)" not "JavaScript (npm)"

# T2: Multi-ecosystem build
node endiorbot.mjs ops build --path /Users/dttai/Documents/Python/01.NQH/Glass --skip-gate-check
# Should run: cargo build

# T3: Full bootstrap
node endiorbot.mjs bootstrap https://github.com/Glass-HQ/Glass.git --dir /tmp/glass-test --tier STANDARD --build
# Should: clone → detect Rust → init SDLC → cargo build

# Full test suite
pnpm build && pnpm test  # 7,453+ tests, 0 failures
```

---

## ADR Reference

- **ADR-037**: Polyglot Bootstrap & Multi-Ecosystem DevOps
