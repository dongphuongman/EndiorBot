# Sprint 99: Per-Chat Workspace + Unified Channel Architecture

**Sprint Duration**: March 10, 2026
**Sprint Goal**: Per-chat workspace resolution, Web→Ingress unification, SOUL 6.1.2 version bump
**Status**: COMPLETE
**Priority**: P0 (Architecture Hardening)
**Framework**: SDLC 6.1.2
**Authority**: ADR-029 + CTO 9/10 APPROVED + CPO APPROVED
**Previous Sprint**: Sprint 98 COMPLETE — Code-Design Gap Closure (+106/6,263)
**CTO Plan Review**: 9/10 APPROVED (0 must-fix, 0 should-fix, 3 informational)
**CTO Code Review**: 9.5/10 APPROVED (0 must-fix, 0 should-fix, 4 informational)
**CPO Review**: APPROVED
**Tests**: +24 new (6,287 cumulative)

---

## Background

CEO workflow requires using EndiorBot 100% via Telegram/Web to develop multiple projects (EndiorBot, paperclip) — switching between repos seamlessly without opening VSCode/CLI.

**Architect Assessment (post-Sprint 98): 7.4/10** — Solid foundation, ready for hardening.

### Critical Gaps Identified

| Gap | Impact | Fix |
|-----|--------|-----|
| Web bypasses Ingress | No history, workspace, policy, commands for Web | Phase 2: Route through Ingress |
| Global ActiveProject vs per-chat focus | Gate/compliance use global, remote commands use per-chat | Phase 1+3: WorkspaceResolver |
| callAI() ignores workspace | Always uses config.projectRoot | Phase 1: Add workspace param |
| MultiAgentDispatcher ignores workspace | Subtasks use fixed projectRoot | Phase 1: Add workspace param |

### Architectural Invariant (NON-NEGOTIABLE)

```
ALL interfaces (OTT, CLI, Web, Desktop)
  → GatewayServer → GatewayIngress (SINGLE entry point)
    → CommandDispatcher | ChannelRouter | Orchestrator
```

---

## Sprint 99 Deliverables

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | WorkspaceResolver + callAI workspace param — core foundation | DONE |
| 2 | Unified Web → Ingress (MF-1: metadata extension) — fix architectural violation | DONE |
| 3 | SDLC commands workspace-aware — /gate, /compliance, /init | DONE |
| 4 | NBM /launch workspace wiring (SF-1: correct file reference) | DONE |
| 5 | SOUL templates version bump 6.1.1→6.1.2 — 7 files | DONE |

**Recommended execution order** (CTO F3): 1 → 2 → 5 → 3 → 4

---

## Phase 1: WorkspaceResolver + callAI Workspace Param

**Goal**: `@agent task` uses focused repo as workspace. Foundation for all other phases.

**New file**: `src/bridge/repo/workspace-resolver.ts`
- `resolveWorkspace(chatId, fallback)` → absolute path
- Reuses `getChatFocusManager()` + `getRepoRegistry()` (existing singletons)

**Modified files**:
- `src/agents/channel-router.ts` — `callAI()` accepts optional `workspace?` param
- `src/gateway/ingress.ts` — Resolves workspace from chatId before AI routing
- `src/autonomy/multi-agent-dispatcher.ts` — `dispatch()` accepts optional `workspace`
- `src/channels/telegram/remote-commands.ts` — Replace `getRepoForChat()` with `resolveWorkspace()`

---

## Phase 2: Unified Web → Ingress (CTO MF-1 Fix)

**Goal**: Web channel routes through GatewayIngress — same pipeline as Telegram.

**Key change**: Extend `InboundResponse` with optional `metadata?: { agent?, model?, latencyMs? }` to preserve Web UI's rich response display.

**Modified files**:
- `src/gateway/ingress.ts` — Extend InboundResponse, populate metadata from AIResult
- `src/gateway/methods/router-chat.ts` — Call `ingress.handleInbound()` instead of `router.callAI()`
- `src/cli/commands/serve.ts` — Pass `ingress` to router-chat methods
- `src/gateway/web/index.html` — Persistent clientId, command/agent support, metadata display

---

## Phase 3: SDLC Commands Workspace-Aware

**Goal**: `/gate`, `/compliance`, `/init` resolve workspace from CommandContext.

**Modified files**:
- `src/commands/command-dispatcher.ts` — Add `workspace?: string` to CommandContext
- `src/gateway/ingress.ts` — Populate ctx.workspace via resolveWorkspace()
- `src/channels/telegram/telegram-commands.ts` — SDLC stubs use workspace if provided

---

## Phase 4: NBM /launch Workspace Wiring (CTO SF-1 Fix)

**Goal**: `/launch` starts sessions in focused repo directory.

**CTO SF-1**: Handler is in `telegram-commands.ts:423`, NOT `remote-commands.ts`.

**Modified files**:
- `src/channels/telegram/telegram-commands.ts` — `handleLaunchCommand()` accepts workspace param
- `src/commands/index.ts` — Wire workspace via `resolveWorkspace(ctx.chatId, process.cwd())`
- `src/bridge/agent-launcher.ts` — Verify workspace propagation

---

## Phase 5: SOUL Templates Version Bump (6.1.1 → 6.1.2)

**Goal**: Update version references to match SDLC Framework 6.1.2.

**Scope**: Version string replacement ONLY. Tier matrix alignment + new SASE artifacts deferred to Sprint 100 (CTO F3).

**Modified files**: 7 of 13 files in `docs/reference/templates/souls/SOUL-*.md`
- Replace `SDLC v6.1.1` → `SDLC v6.1.2` / `SDLC 6.1.1` → `SDLC 6.1.2`

---

## CTO Review Summary (v3 — Final)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| MF-1 | Must-Fix | InboundResponse metadata loss | RESOLVED — metadata? extension |
| SF-1 | Should-Fix | /launch wrong file + no chatId | RESOLVED — telegram-commands.ts:423 |
| F1 | Info | soul-loader.ts "6.1.1" claim | RESOLVED — grep confirmed 0 matches |
| F2 | Info | .sdlc-framework/ reference | RESOLVED — removed from plan |
| F3 | Info | Sprint scope too large | RESOLVED — 5b/5c deferred to Sprint 100 |
| F4 | Info | Multi-agent subtask history | RESOLVED — deferred to Sprint 100 |

**CTO Conditions**:
- C1: `pnpm build` passes before merge
- C2: Existing 6,263 tests must not decrease
- C3: /launch changes must include regression test
- C4: InboundResponse metadata field must be optional

---

## Deferred to Sprint 100+

| Item | Sprint | Reason |
|------|--------|--------|
| Tier matrix alignment (SASE 6.1.2) | 100 | CTO F3: scope reduction |
| New SASE artifacts (4 SOULs, 10 TEAMs, CRP/MRP/VCR) | 100 | CTO F3: scope reduction |
| Multi-agent subtask history propagation | 100 | CTO F4: rare path |
| AGENT_MODEL_MAP tier-aware routing | 101 | Gap S2: dynamic routing |
| Per-workspace team roster | 101 | Gap S3: team customization |
| SOUL workspace awareness | 101 | Gap S1: per-project context |

---

**Last Updated**: 2026-03-10 (by @coder — Sprint 99 COMPLETE)
**Sprint Owner**: @coder (AI)
**Sprint Status**: COMPLETE
