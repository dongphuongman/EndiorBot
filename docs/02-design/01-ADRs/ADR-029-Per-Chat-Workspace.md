# ADR-029: Per-Chat Workspace + Unified Channel Architecture

**Status**: ACCEPTED
**Date**: 2026-03-10
**Sprint**: 99
**Author**: @architect (AI)
**Reviewers**: CTO (9/10 APPROVED), CPO (APPROVED)

## Context

After 98 sprints, EndiorBot has a Gateway-centric architecture (Sprint 93) where ALL interfaces route through `GatewayServer → GatewayIngress`. However, two architectural gaps remain:

1. **Web channel bypasses Ingress**: `router.chat` JSON-RPC method calls `ChannelRouter.callAI()` directly, skipping history, workspace resolution, policy, and command dispatch.
2. **Global vs per-chat workspace**: Two separate project context systems coexist — `loadActiveProject()` (global singleton) for SDLC commands and `ChatFocusManager` (per-chat) for remote commands. The AI call path (`callAI()`) always uses the router's hardcoded `config.projectRoot`.

CEO workflow requires switching between multiple projects (EndiorBot, paperclip) via Telegram/Web without opening VSCode/CLI. Each chat must maintain its own workspace focus independently.

## Decision

### AD-1: WorkspaceResolver — Single Resolution Function

Create `src/bridge/repo/workspace-resolver.ts` with a single function `resolveWorkspace(chatId, fallback)` that:
- Looks up chat focus via existing `ChatFocusManager` singleton
- Resolves repo path via existing `RepoRegistry` singleton
- Falls back to provided default (typically `config.projectRoot`)

This reuses the existing `getRepoForChat()` pattern from `remote-commands.ts` but as a shared utility.

### AD-2: callAI() Workspace Parameter

Extend `ChannelRouter.callAI()` signature from `(agent, task, history?)` to `(agent, task, history?, workspace?)`. The workspace parameter propagates to:
- `callClaudeBridge()`: passed as `workspace` in `InvokeRequest` (bridge already accepts it)
- `callCloudFallback()` + `callRemoteOllama()`: injected as `[Workspace: path]` in system prompt
- When omitted, falls back to `this.config.projectRoot` (backward compatible)

### AD-3: MultiAgentDispatcher Workspace Propagation

Extend `dispatch()` from `(decomposition, router)` to `(decomposition, router, workspace?)`. Each `executeSubtask()` passes workspace to `router.callAI()`. Multi-agent subtask history propagation deferred to Sprint 100 (CTO F4).

### AD-4: Unified Web → Ingress (Architectural Invariant)

Route `router.chat` JSON-RPC method through `GatewayIngress.handleInbound()` instead of calling `ChannelRouter.callAI()` directly. This gives Web the same pipeline as Telegram: commands, history, workspace, policy, multi-agent.

Extend `InboundResponse` with optional `metadata?: { agent?, model?, latencyMs? }` to preserve Web UI's rich response display (CTO MF-1).

### AD-5: CommandContext Workspace

Add `workspace?: string` to `CommandContext` interface. `GatewayIngress` populates this via `resolveWorkspace(chatId, fallback)` before dispatching commands. SDLC commands (`/gate`, `/compliance`, `/init`) use workspace when available, fall back to `loadActiveProject()` for CLI.

### AD-6: NBM /launch Workspace Wiring

Wire workspace into `/launch` handler via `resolveWorkspace(ctx.chatId, process.cwd())` in command registration. `handleLaunchCommand()` (in `telegram-commands.ts:423`) accepts optional workspace parameter.

## Consequences

- **ALL interfaces → Gateway → Ingress** — Web no longer bypasses (architectural invariant enforced)
- **Per-chat workspace isolation** — different Telegram chats/Web sessions work on different repos simultaneously
- **Backward compatible** — CLI and chatId-less contexts fall back to global `loadActiveProject()`
- **Existing context stack preserved** — ConversationStore, SessionRelay, Cross-Session Transfer unchanged
- **SOUL templates updated** — 6.1.1 → 6.1.2 version bump (content identical, strings only)
- **Deferred to Sprint 100**: Tier matrix alignment (SASE 6.1.2), new SASE artifacts, multi-agent history

## References

- Sprint 99 Plan: sprint-99-workspace-channel.md
- ADR-024: Notification Bridge (Sprint 92 — Gateway architecture)
- Sprint 93: Gateway-Centric Architecture (serve command)
- Sprint 98: Conversation Context + Model Routing (gap closure)
- SASE 6.1.2: `.sdlc-framework/05-Templates-Tools/04-SASE-Artifacts/`
