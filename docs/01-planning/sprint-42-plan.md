# Sprint 42 Detailed Plan - Desktop Foundation (ClawX Port)

**Version**: 1.0.0
**Date**: 2026-02-22
**Status**: DRAFT - Pending CEO Approval
**Authority**: PM + CEO (Sprint 38-46 Replan)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 01 - PLANNING
**Prerequisites**:
- Sprint 41 Complete (Fix Logging validated)
- ClawX codebase or spec available for reference
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 42 implements **Desktop Foundation** — port ClawX Electron/React desktop app into EndiorBot as integrated UI. No gateway yet; IPC calls EndiorBot core directly.

### Vision: Desktop UI for EndiorBot

```
Current (Sprint 41):  CLI only → CEO at terminal
Sprint 42 Target:     Electron app → Dashboard, Chat, Checkpoints, Fix stats
Future (Sprint 43):   Gateway → real-time sync
```

### Why Desktop?

> **CEO/CPO**: "Use EndiorBot Desktop directly (no VSCode needed)." Port ClawX INTO EndiorBot (single codebase).

Benefits:
- Single codebase (EndiorBot repo includes desktop)
- Dashboard: active session, budget status, approval queue
- Chat interface: streaming from multi-model orchestrator
- Checkpoint viewer: list/restore
- Fix stats viewer
- Dark/Light theme (Tailwind)

---

## Sprint Goal

**Port ClawX Electron/React shell into EndiorBot; implement core UI screens (Dashboard, Chat, Checkpoint viewer, Fix stats) with IPC bridge to CLI core.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 41** | Fix Logging validated | PLANNED | Sprint 42 start |
| **Electron 40+** | Runtime | ⚠️ Dependency | package.json |
| **React 19, Vite, Tailwind** | From ClawX stack | ⚠️ Dependency | package.json |

---

## Sprint 42 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Electron Shell + IPC | main/, preload/, renderer shell, IPC handlers |
| **Week 2** | Core UI Screens | Dashboard, Chat, Checkpoint viewer, Fix stats, themes |

**Duration**: 10 working days (2 weeks from Sprint 41 close)

---

## Week 1: Electron Shell + IPC (Day 1-5)

### Day 1-2: Electron Main + Preload

**Goal**: Electron main process, window, preload context bridge.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add Electron, electron-builder, Vite (desktop) | P0 | package.json, vite.config | - |
| Create src/desktop/main/index.ts | P0 | App lifecycle, createWindow | ~150 |
| Create src/desktop/main/window.ts | P0 | BrowserWindow config | ~100 |
| Create src/desktop/preload/index.ts | P0 | contextBridge.exposeInMainWorld | ~200 |
| IPC: session load/save/status (invoke SessionManager) | P0 | main/ipc-handlers.ts | ~150 |
| Create src/desktop/main/menu.ts | P1 | App menu | ~80 |
| System tray (optional) | P2 | Tray icon, menu | ~100 |

**Acceptance Criteria**:
- [ ] npm run desktop (or pnpm) launches Electron window
- [ ] Preload exposes safe API (e.g. window.endiorbot.session.status())
- [ ] IPC handlers call EndiorBot core (SessionManager, etc.) — direct require/import, no gateway
- [ ] Build passes (TS + Vite for renderer)

---

### Day 3: Renderer Shell + Routing

**Goal**: React 19 app shell, routing, Tailwind.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/App.tsx | P0 | Root, router | ~80 |
| Add React 19, React Router, Tailwind | P0 | package.json, tailwind.config | - |
| Create placeholder pages: Dashboard, Chat, Checkpoints, FixStats, Settings | P0 | renderer/pages/*.tsx | ~200 |
| Navigation (sidebar or tabs) | P0 | components/Nav.tsx | ~80 |
| Dark/Light theme (Tailwind dark:) | P0 | Theme provider or class | ~60 |

**Acceptance Criteria**:
- [ ] App renders; navigation switches pages
- [ ] Tailwind styles apply; dark mode toggles
- [ ] Build passes

---

### Day 4-5: IPC Handlers for Core Data

**Goal**: All IPC handlers needed by Week 2 screens.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| session:load, session:save, session:status, session:list | P0 | ipc-handlers.ts | ~80 |
| budget:status (BudgetTracker state) | P0 | ipc-handlers.ts | ~60 |
| approvalQueue:list, approvalQueue:approve, approvalQueue:reject | P0 | ipc-handlers.ts | ~80 |
| checkpoints:list, checkpoints:get, checkpoints:restore (or resume) | P0 | ipc-handlers.ts | ~100 |
| fixStats:get (FixLogger getStats, getEntries) | P0 | ipc-handlers.ts | ~60 |
| Preload exposes all above under window.endiorbot | P0 | preload/index.ts | ~80 |
| Create tests/desktop/ipc-handlers.test.ts (mock) | P1 | Unit tests | ~150 |

**Acceptance Criteria**:
- [ ] Renderer can call session status, budget status, queue list, checkpoint list, fix stats
- [ ] No gateway yet — main process imports from src/sessions, src/budget, etc.
- [ ] Build passes

---

## Week 2: Core UI Screens (Day 6-10)

### Day 6-7: Dashboard + Checkpoint Viewer

**Goal**: Dashboard shows active session, budget, approval count; Checkpoint viewer lists and restores.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Dashboard page: session id, project, budget bar, approval pending count | P0 | renderer/pages/Dashboard.tsx | ~250 |
| Checkpoints page: list from checkpoints:list, show id/date/reason | P0 | renderer/pages/Checkpoints.tsx | ~200 |
| Checkpoint detail: show meta, restore button → checkpoints:restore | P0 | Same or modal | ~120 |
| Loading and error states | P0 | Components | ~80 |
| Create tests/renderer (optional) | P2 | React Testing Library | - |

**Acceptance Criteria**:
- [ ] Dashboard reflects live session and budget (on load; real-time in Sprint 43)
- [ ] Checkpoint list loads; restore triggers IPC and shows success/error
- [ ] Build passes

---

### Day 8: Chat Interface

**Goal**: Chat UI with streaming from multi-model orchestrator.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Chat page: message list, input box | P0 | renderer/pages/Chat.tsx | ~200 |
| IPC: chat:send(prompt), chat:stream (or poll for updates) | P0 | Without gateway: invoke run and stream via IPC or file tail | ~150 |
| Streaming display (append tokens or chunks) | P0 | Component state | ~100 |
| Session messages loaded on mount (session:getMessages or session:load) | P0 | Load history | ~80 |

**Acceptance Criteria**:
- [ ] User can type and send; response appears (streaming or after complete)
- [ ] Without gateway, streaming may be simulated or via polling — document limitation
- [ ] Build passes

---

### Day 9: Fix Stats Viewer + Settings Skeleton

**Goal**: Fix stats dashboard; settings page skeleton.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Fix Stats page: total fixes, success rate, by category, table of recent | P0 | renderer/pages/FixStats.tsx | ~250 |
| Data from fixStats:get (stats + recent entries) | P0 | IPC | - |
| Settings page: placeholder (config path, theme toggle) | P1 | renderer/pages/Settings.tsx | ~100 |
| Document: how to run desktop, how to build installer (future) | P1 | docs/04-build/desktop.md | ~80 |

**Acceptance Criteria**:
- [ ] Fix Stats shows data from FixLogger
- [ ] Settings has theme toggle; other settings TBD
- [ ] Build passes

---

### Day 10: Integration + G-Sprint-42

**Goal**: Full desktop build; smoke test all screens.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Electron builder config (packaging) | P1 | electron-builder.yml or package.json build | - |
| Smoke test: launch app, open each page, no crash | P0 | Manual or E2E | - |
| G-Sprint-42 checklist | P0 | All criteria below | - |

**Acceptance Criteria**:
- [ ] pnpm run desktop launches app
- [ ] All pages load without error
- [ ] IPC calls return data (or graceful error)
- [ ] Build and lint pass

---

## Files Created (Sprint 42)

| File / Dir | Est. LOC | Purpose |
|------------|----------|---------|
| src/desktop/main/index.ts | ~150 | Main process |
| src/desktop/main/window.ts | ~100 | BrowserWindow |
| src/desktop/main/ipc-handlers.ts | ~450 | IPC handlers |
| src/desktop/main/menu.ts | ~80 | Menu |
| src/desktop/preload/index.ts | ~280 | Preload bridge |
| src/desktop/renderer/App.tsx | ~80 | Root |
| src/desktop/renderer/pages/*.tsx | ~1,200 | Dashboard, Chat, Checkpoints, FixStats, Settings |
| src/desktop/renderer/components/*.tsx | ~400 | Nav, etc. |
| docs/04-build/desktop.md | ~80 | Run + build guide |
| **Total** | **~4,000** | (Desktop is heavier) |

---

## Modified Files (Sprint 42)

| File | Changes |
|------|---------|
| package.json | Scripts: desktop, build:desktop; deps: electron, react, tailwind, vite |
| tsconfig.json | Include desktop (or tsconfig.desktop.json) |
| .gitignore | dist-desktop, out (electron-builder) |

---

## Success Criteria (Sprint 42)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Desktop launches | 100% | Manual |
| Dashboard shows session/budget | 100% | Manual |
| Checkpoint list + restore | 100% | Manual |
| Chat send + response | 100% | Manual |
| Fix Stats shows data | 100% | Manual |
| Build + lint | Pass | CI |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 41 complete | PLANNED | Fix Logging |
| SessionManager | ✅ | Sprint 29+ |
| BudgetTracker | ✅ | Sprint 36 |
| ApprovalQueue | ✅ | Sprint 36 |
| CheckpointManager | ✅ | Sprint 35 |
| FixLogger | ✅ | Sprint 37 + 41 |
| ClawX reference | ⚠️ | Port patterns from 05-Desktop-Integration.md |

---

## Next Sprint Preview (Sprint 43)

**Sprint Goal**: Gateway + Desktop Integration

**Key Deliverables**:
- WebSocket gateway server (port 18790)
- Desktop connects via WebSocket
- Real-time budget, approval queue, checkpoint events
- Telegram + Desktop notifications in parallel

**Prerequisite**: Sprint 42 PASS (Desktop foundation validated)

---

## Approval Checklist (G-Sprint-42)

- [ ] Electron app launches
- [ ] Dashboard, Chat, Checkpoints, Fix Stats, Settings pages exist and load
- [ ] IPC to SessionManager, BudgetTracker, ApprovalQueue, Checkpoints, FixLogger works
- [ ] Dark/Light theme works
- [ ] Build and lint pass
- [ ] docs/04-build/desktop.md updated

---

**Last Updated**: 2026-02-22
**Sprint Status**: DRAFT - Sprint 38-46 Replan
**Blocking**: Sprint 41 close

---

*Sprint 42 Plan - Desktop Foundation (ClawX Port)*
*EndiorBot - Desktop UI*
*SDLC Framework 6.1.1*
