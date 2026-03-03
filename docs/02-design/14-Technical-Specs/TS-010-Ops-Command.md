# TS-010: Ops Command (DevOps CLI)

**Status:** Implemented
**Date:** 2026-03-03
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** E2E Testing Phase (Post Sprint 72)

---

## 1. Overview

The `endiorbot ops` command provides DevOps operations (build, run, deploy) for managed projects. It auto-detects the package manager and build system, and enforces G3 gate confirmation before execution.

**Identity:** @devops agent CLI interface (SE4A Executor, Stage 06-07, Gate G4).

**Note:** Command registered as `ops` (not `devops`) because `agent.ts` already registers `devops` as an agent shorthand command (`endiorbot devops <message>`).

---

## 2. Commands

### 2.1 `endiorbot ops build`

Install dependencies and build the project.

```bash
endiorbot ops build [--path <path>] [--skip-gate-check]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--path` | Project directory | Active project path or cwd |
| `--skip-gate-check` | Skip G3 gate verification | false |

**Flow:**
1. Resolve project path (active project → `--path` → cwd)
2. Check G3 gate confirmed (unless `--skip-gate-check`)
3. Detect package manager from lock files
4. Install deps if `node_modules/` missing
5. Run `{pm} run build` if build script exists

### 2.2 `endiorbot ops run`

Run the project (start or dev script).

```bash
endiorbot ops run [--path <path>] [--skip-gate-check] [--dev]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--path` | Project directory | Active project path or cwd |
| `--skip-gate-check` | Skip G3 gate verification | false |
| `--dev` | Use dev script instead of start | false |

**Script Priority:**
- Default: `start` → `dev` (fallback)
- With `--dev`: `dev` → `start` (fallback)

### 2.3 `endiorbot ops build-run`

Build then run (combines both operations).

```bash
endiorbot ops build-run [--path <path>] [--skip-gate-check] [--dev]
```

---

## 3. Package Manager Detection

Auto-detected from lock files in project root:

| Lock File | Package Manager |
|-----------|----------------|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `bun.lockb` or `bun.lock` | bun |
| (none / `package-lock.json`) | npm |

---

## 4. Gate Check

Before executing build/run, the command verifies that G3 (Build Complete) gate has been confirmed via the `gate-store.ts` persistence layer.

```typescript
const g3Confirmed = isGateConfirmed(projectId, "G3");
if (!g3Confirmed && !options.skipGateCheck) {
  // Block execution — prompt user to confirm G3 first
}
```

**Rationale:** @devops should only operate after @tester and @reviewer have completed their work (G3 = Build Complete gate).

---

## 5. Implementation

**File:** `src/cli/commands/devops.ts`

**Key Functions:**
- `detectPackageManager(path)` — Lock file detection
- `detectBuildInfo(path)` — Parse package.json for scripts
- `runCommand(cmd, args, cwd)` — Spawn child process with live stdio
- `devopsBuildAction(options)` — Build flow
- `devopsRunAction(options)` — Run flow
- `registerDevopsCommand(program)` — Commander.js registration as `ops`

**Dependencies:**
- `isGateConfirmed` from `sdlc/gates/gate-store.ts`
- `loadActiveProject` from `config/paths.ts`

---

## 6. E2E Test Results (Dyad Project)

| Test | Command | Result |
|------|---------|--------|
| Build detection | `ops build --path .../dyad` | npm detected, build script found |
| Dep install skip | (node_modules exists) | Correctly skipped |
| Build execution | `npm run build` | Electron-forge package success |
| Run execution | `ops run --path .../dyad` | Electron app launched |
| Gate check | Without G3 confirmed | Correctly blocked |

---

*SDLC Framework v6.1.1 - Stage 02: Design*
