# Sprint 43 Detailed Plan - Desktop Foundation (ClawX Port)

**Version**: 1.0.0
**Date**: 2026-02-23
**Status**: COMPLETE ✅ (G-Sprint-43 PASS)
**Authority**: PM + CEO (Option A Resequence — Sprint 42 Scope Change)
**Pillar**: 3 - Software Engineering 3.0
**Stage**: 04 - BUILD → 05 - TEST (Gate Passed)
**Prerequisites**:
- Sprint 42 Complete (Adaptive Quality Tuning validated) ✅
- ClawX codebase or spec available for reference
**SDLC**: Framework 6.1.1

---

## Executive Summary

Sprint 43 implements **Desktop Foundation** — port ClawX Electron/React desktop app into EndiorBot as integrated UI. No gateway yet; IPC calls EndiorBot core directly.

### Vision: Desktop UI for EndiorBot

```
Current (Sprint 42):  CLI only → CEO at terminal
Sprint 43 Target:     Electron app → Dashboard, Chat, Checkpoints, Fix stats
Future (Sprint 44):   Gateway → real-time sync
```

### Why Desktop?

> **CEO/CPO**: "Use EndiorBot Desktop directly (no VSCode needed)." Port ClawX INTO EndiorBot (single codebase).

Benefits:
- Single codebase (EndiorBot repo includes desktop)
- Dashboard: active session, budget status, approval queue
- Chat interface: streaming from multi-model orchestrator
- Checkpoint viewer: list/restore
- Fix stats viewer (Sprint 41 Fix Logging)
- Dark/Light theme (Tailwind)

> **Note**: Originally planned as Sprint 42. Shifted to Sprint 43 per CEO-approved Option A resequence (2026-02-23). Sprint 42 delivered Adaptive Quality Tuning instead.

---

## Sprint Goal

**Port ClawX Electron/React shell into EndiorBot; implement core UI screens (Dashboard, Chat, Checkpoint viewer, Fix stats) with IPC bridge to CLI core.**

---

## Prerequisites (Hard Gates)

| Gate | Requirement | Status | Blocking |
|------|-------------|--------|----------|
| **Sprint 42** | Adaptive Quality Tuning validated | ✅ COMPLETE | — |
| **Electron 40+** | Runtime | ⚠️ Dependency | package.json |
| **React 19, Vite, Tailwind** | From ClawX stack | ⚠️ Dependency | package.json |

### Validation Criteria

- [ ] Electron app launches
- [ ] Dashboard shows session status + budget bar
- [ ] Checkpoint viewer lists and can restore
- [ ] Fix stats viewer shows weekly summary (Sprint 41)
- [ ] Dark/Light theme works
- [ ] No gateway needed (IPC only)

---

## Sprint 43 Overview

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Electron Shell + IPC | main/, preload/, renderer shell, IPC handlers |
| **Week 2** | Core UI Screens | Dashboard, Chat, Checkpoint viewer, Fix stats, themes |

**Duration**: 10 working days (2 weeks from Sprint 42 close)

---

## Week 1: Electron Shell + IPC (Day 1-5)

### Day 1-2: Electron Main + Preload

**Goal**: Electron main process, window, preload context bridge.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Add Electron, electron-builder, Vite (desktop) to package.json | P0 | package.json, vite.config | — |
| Create src/desktop/main/index.ts | P0 | App lifecycle, createWindow | ~150 |
| Create src/desktop/main/window.ts | P0 | BrowserWindow config (800×600, dark frame) | ~100 |
| Create src/desktop/preload/index.ts | P0 | contextBridge.exposeInMainWorld | ~200 |
| Create src/desktop/preload/api.ts | P0 | Type-safe IPC API surface | ~80 |
| Create tests/desktop/preload.test.ts | P0 | API surface unit tests | ~60 |

**Acceptance Criteria**:
- [ ] Electron window opens with React renderer
- [ ] preload exposes typed `window.endiorbot` API
- [ ] No `nodeIntegration: true` (use contextBridge)
- [ ] Build passes

**Preload API (example)**:
```typescript
window.endiorbot = {
  session: { get(), list() },
  budget: { get() },
  approval: { list(), approve(id), reject(id) },
  checkpoints: { list(), restore(id) },
  fixStats: { getWeeklySummary(), getPatterns() },
}
```

---

### Day 3-4: IPC Handlers

**Goal**: Main process handles IPC calls from renderer.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/main/ipc/session-handlers.ts | P0 | session.get, session.list | ~100 |
| Create src/desktop/main/ipc/budget-handlers.ts | P0 | budget.get | ~80 |
| Create src/desktop/main/ipc/approval-handlers.ts | P0 | approval.list, approve, reject | ~100 |
| Create src/desktop/main/ipc/checkpoint-handlers.ts | P0 | checkpoints.list, checkpoints.restore | ~100 |
| Create src/desktop/main/ipc/fix-stats-handlers.ts | P0 | fixStats.getWeeklySummary, getPatterns | ~80 |
| Create src/desktop/main/ipc/index.ts | P0 | Register all handlers | ~60 |
| Create tests/desktop/ipc/*.test.ts | P0 | Unit tests with mocks | ~200 |

**Acceptance Criteria**:
- [ ] IPC handles: session, budget, approval, checkpoint, fix-stats
- [ ] Handlers wire to existing EndiorBot core modules
- [ ] Error cases return `{ error: string }` (never throw)
- [ ] Build passes

---

### Day 5: Renderer Shell

**Goal**: React renderer skeleton, routing, layout.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/App.tsx | P0 | Root component, router setup | ~80 |
| Create src/desktop/renderer/layout/Sidebar.tsx | P0 | Navigation links | ~100 |
| Create src/desktop/renderer/layout/Layout.tsx | P0 | Sidebar + main content | ~60 |
| Create src/desktop/renderer/store/index.ts | P0 | Zustand store or React context | ~100 |
| Tailwind config + dark/light base theme | P0 | tailwind.config.ts | ~40 |
| Vite renderer config | P0 | vite.renderer.config.ts | ~40 |
| Create src/desktop/renderer/pages/Loading.tsx | P0 | Splash/loading screen | ~40 |

**Acceptance Criteria**:
- [ ] Renderer loads in Electron window
- [ ] Sidebar navigates between pages (no content yet)
- [ ] Dark mode toggle works
- [ ] Build passes

---

## Week 2: Core UI Screens (Day 6-10)

### Day 6-7: Dashboard + Chat

**Goal**: Dashboard (session status, budget bar, approval queue) and Chat interface.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/pages/Dashboard.tsx | P0 | Session status, budget bar, approval queue | ~250 |
| Create src/desktop/renderer/components/BudgetBar.tsx | P0 | Visual budget usage | ~80 |
| Create src/desktop/renderer/components/ApprovalCard.tsx | P0 | Approve/reject action card | ~100 |
| Create src/desktop/renderer/pages/Chat.tsx | P0 | Message list, input, streaming placeholder | ~200 |
| Create src/desktop/renderer/components/MessageBubble.tsx | P0 | User/bot message | ~80 |
| Poll IPC every 5s for Dashboard data (gateway in Sprint 44) | P0 | useInterval hook | ~40 |

**Acceptance Criteria**:
- [ ] Dashboard shows active session name, budget %, approval count
- [ ] Approve/reject buttons call IPC approval handlers
- [ ] Chat renders placeholder (streaming in Sprint 44+)
- [ ] Build passes

---

### Day 8: Checkpoint Viewer + Fix Stats

**Goal**: Checkpoint list/restore UI and Fix Stats (Sprint 41 integration).

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/pages/Checkpoints.tsx | P0 | List checkpoints, restore button | ~200 |
| Create src/desktop/renderer/components/CheckpointCard.tsx | P0 | ID, timestamp, brain digest | ~100 |
| Create src/desktop/renderer/pages/FixStats.tsx | P0 | Weekly summary, pattern list | ~200 |
| Create src/desktop/renderer/components/SuccessRateBar.tsx | P0 | Progress bar component | ~60 |
| Fix stats calls Sprint 41 FixLogger via IPC handler | P0 | fix-stats-handlers.ts | ~80 |

**Acceptance Criteria**:
- [ ] Checkpoints page lists all checkpoints (newest first)
- [ ] Restore triggers IPC checkpoint restore
- [ ] Fix Stats shows weekly summary breakdown by category
- [ ] Build passes

---

### Day 9: Settings + Theme

**Goal**: Settings page (config viewer) and persistent theme.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| Create src/desktop/renderer/pages/Settings.tsx | P0 | Display ~/.endiorbot/config.json fields | ~150 |
| Add IPC handler: config.get() | P0 | config-handlers.ts | ~60 |
| Persist dark/light theme in localStorage | P0 | useTheme hook | ~60 |
| Create src/desktop/renderer/components/ThemeToggle.tsx | P0 | Toggle button | ~40 |
| Create src/desktop/renderer/hooks/useIpc.ts | P0 | Typed IPC call hook | ~80 |

**Acceptance Criteria**:
- [ ] Settings page shows config values (read-only)
- [ ] Theme persists across app restarts
- [ ] Build passes

---

### Day 10: Integration + G-Sprint-43

**Goal**: End-to-end Desktop + CLI core; release build check.

| Task | Priority | Deliverable | Est. LOC |
|------|----------|-------------|----------|
| E2E: launch Electron, verify Dashboard loads session state | P0 | Manual test | — |
| E2E: approve from Desktop → ApprovalQueue updated | P0 | Manual test | — |
| E2E: restore checkpoint from Desktop | P0 | Manual test | — |
| electron-builder config + `npm run build:desktop` | P0 | electron-builder.json | ~40 |
| G-Sprint-43 checklist | P0 | All criteria below | — |

**Acceptance Criteria**:
- [ ] All Sprint 43 acceptance criteria met
- [ ] `npm run build:desktop` produces distributable
- [ ] Build and lint pass
- [ ] No `nodeIntegration: true`

---

## Files Created (Sprint 43)

| File | Est. LOC | Purpose |
|------|----------|---------|
| src/desktop/main/index.ts | ~150 | Electron main process |
| src/desktop/main/window.ts | ~100 | BrowserWindow config |
| src/desktop/preload/index.ts | ~200 | contextBridge API |
| src/desktop/preload/api.ts | ~80 | TypeScript types |
| src/desktop/main/ipc/session-handlers.ts | ~100 | Session IPC |
| src/desktop/main/ipc/budget-handlers.ts | ~80 | Budget IPC |
| src/desktop/main/ipc/approval-handlers.ts | ~100 | Approval IPC |
| src/desktop/main/ipc/checkpoint-handlers.ts | ~100 | Checkpoint IPC |
| src/desktop/main/ipc/fix-stats-handlers.ts | ~80 | Fix stats IPC |
| src/desktop/main/ipc/index.ts | ~60 | Handler registry |
| src/desktop/renderer/App.tsx | ~80 | Root component |
| src/desktop/renderer/layout/Sidebar.tsx | ~100 | Navigation |
| src/desktop/renderer/layout/Layout.tsx | ~60 | Shell layout |
| src/desktop/renderer/store/index.ts | ~100 | App state |
| src/desktop/renderer/pages/Dashboard.tsx | ~250 | Main dashboard |
| src/desktop/renderer/pages/Chat.tsx | ~200 | Chat interface |
| src/desktop/renderer/pages/Checkpoints.tsx | ~200 | Checkpoint viewer |
| src/desktop/renderer/pages/FixStats.tsx | ~200 | Fix statistics |
| src/desktop/renderer/pages/Settings.tsx | ~150 | Settings viewer |
| src/desktop/renderer/components/*.tsx (×8) | ~560 | Shared components |
| src/desktop/renderer/hooks/*.ts (×2) | ~140 | Custom hooks |
| tests/desktop/**/*.test.ts | ~260 | Unit tests |
| vite.renderer.config.ts | ~40 | Vite renderer |
| electron-builder.json | ~40 | Build config |
| **Total** | **~3,430** | |

---

## Success Criteria (Sprint 43 — G-Sprint-43)

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Electron window opens | 100% | Manual |
| Dashboard shows session + budget + approvals | 100% | Manual |
| Approve/reject from Desktop works | 100% | Manual |
| Checkpoint viewer lists and restores | 100% | Manual |
| Fix Stats shows weekly summary (Sprint 41) | 100% | Manual |
| Settings page shows config | 100% | Manual |
| Dark/Light theme persists | 100% | Manual |
| `npm run build:desktop` succeeds | Pass | Build |
| No nodeIntegration: true | Pass | Code review |
| TypeScript clean | Pass | tsc --noEmit |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 42 complete | ✅ | Adaptive Quality Tuning |
| SessionManager, BudgetTracker | ✅ | Prior sprints |
| ApprovalQueue, CheckpointManager | ✅ | Prior sprints |
| FixLogger (Sprint 41) | ✅ | Fix stats IPC |
| Electron 40+ | ⚠️ | Add to package.json |
| React 19, Vite, Tailwind | ⚠️ | Add to package.json |
| Zustand (state) | ⚠️ | Add to package.json |
| electron-builder | ⚠️ | Add to package.json |

---

## Next Sprint Preview (Sprint 44)

**Sprint Goal**: Gateway + Desktop Integration

**Key Deliverables**:
- WebSocket gateway server (port 18790, JSON-RPC 2.0)
- Real-time budget/approval/checkpoint events to Desktop
- Telegram + Desktop notifications in parallel
- CLI: `endiorbot gateway`

**Prerequisite**: Sprint 43 PASS (Desktop Foundation validated)

---

## Approval Checklist (G-Sprint-43)

- [ ] Electron app launches without errors
- [ ] contextBridge API: session, budget, approval, checkpoints, fix-stats
- [ ] IPC handlers wire to EndiorBot core modules
- [ ] Dashboard: session name, budget bar, approval queue + actions
- [ ] Checkpoint viewer: list, restore
- [ ] Fix Stats: weekly summary by category (from Sprint 41 FixLogger)
- [ ] Settings: config display
- [ ] Dark/Light theme persistent
- [ ] `npm run build:desktop` passes
- [ ] No nodeIntegration: true
- [ ] TypeScript clean, lint pass

---

**Last Updated**: 2026-02-23
**Sprint Status**: IN PROGRESS
**Blocking**: None - Sprint 42 closed ✅
**Shifted from**: Originally Sprint 42; shifted per CEO Option A approval 2026-02-23

---

*Sprint 43 Plan - Desktop Foundation (ClawX Port)*
*EndiorBot - Desktop UI*
*SDLC Framework 6.1.1*
