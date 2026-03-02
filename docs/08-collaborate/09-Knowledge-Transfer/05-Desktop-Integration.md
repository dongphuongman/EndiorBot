# Desktop Integration: ClawX Porting

**Version**: 1.0.0
**Date**: 2026-02-22
**Decision**: Port ClawX INTO EndiorBot (not separate app)

---

## Overview

ClawX is a mature Electron desktop application (v0.1.15) that will be **ported into EndiorBot** as its integrated desktop interface.

### Architecture Decision

**Port INTO EndiorBot**, not connect as separate app:
- Single codebase, simpler maintenance
- No IPC complexity between apps
- CEO vision: "Use EndiorBot Desktop directly (no VSCode needed)"

---

## ClawX Current State

### Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 40+ |
| Frontend | React 19, TypeScript |
| State | Zustand 5.x |
| Styling | Tailwind CSS |
| Build | Vite |
| Package | pnpm, electron-builder |

### Features (Production Ready)

| Feature | Status |
|---------|--------|
| Chat interface with streaming | ✅ |
| Multi-channel management | ✅ |
| Provider configuration | ✅ |
| Skill browser & installation | ✅ |
| Scheduled tasks (cron) | ✅ |
| Dark/Light/System themes | ✅ |
| Multi-language (EN, ZH, JA) | ✅ |
| System tray integration | ✅ |
| Auto-updates | ✅ |
| Secure credential storage | ✅ |

---

## Porting Strategy

### Target Structure

```
src/
├── ... (existing CLI modules)
└── desktop/
    ├── main/              # Electron main process
    │   ├── index.ts       # App lifecycle
    │   ├── window.ts      # BrowserWindow
    │   ├── ipc-handlers.ts
    │   └── menu.ts
    ├── preload/           # Context bridge
    │   └── index.ts
    ├── renderer/          # React app
    │   ├── components/    # Ported from ClawX
    │   ├── pages/         # Dashboard, Chat, Settings
    │   ├── stores/        # Zustand stores
    │   └── App.tsx
    └── shared/            # Shared types
```

### Integration Points

| ClawX Component | EndiorBot Integration |
|-----------------|----------------------|
| Gateway Manager | → EndiorBot SessionManager |
| Chat Store | → EndiorBot Session messages |
| Provider Registry | → EndiorBot ProviderRegistry |
| Channel Config | → EndiorBot ProjectContext |
| Skill Store | → Future: EndiorBot Skills |

### Adaptation Required

1. **Replace MTS-OpenClaw Gateway** → EndiorBot Gateway
   - Same WebSocket protocol (JSON-RPC 2.0)
   - Port 18789 → configurable

2. **Adapt Zustand Stores** → Integrate with SessionManager
   ```typescript
   // ClawX: standalone store
   const useGatewayStore = create(() => ({ ... }));

   // EndiorBot: integrated with SessionManager
   const useSessionStore = create((set) => ({
     session: null,
     loadSession: async (id) => {
       const session = await SessionManager.load(id);
       set({ session });
     }
   }));
   ```

3. **Port UI Components** → Minimal changes
   - Keep React 19, Tailwind, Lucide icons
   - Update imports, remove MTS-OpenClaw-specific code

4. **IPC Handlers** → Map to EndiorBot services
   ```typescript
   // ClawX
   ipcMain.handle('gateway:status', () => gatewayManager.getStatus());

   // EndiorBot
   ipcMain.handle('session:status', () => sessionManager.getStatus());
   ```

---

## Phased Porting Plan

### Phase A: Foundation (Sprint Future)

| Task | Description |
|------|-------------|
| Setup Electron in EndiorBot | electron-builder, vite config |
| Port main process | Window, menu, tray |
| Port preload script | Context bridge |

### Phase B: Core UI (Sprint Future+1)

| Task | Description |
|------|-------------|
| Port Dashboard | Stats, status |
| Port Chat interface | Messages, streaming |
| Port Settings | Config panels |

### Phase C: Integration (Sprint Future+2)

| Task | Description |
|------|-------------|
| Connect to SessionManager | Real-time sync |
| Connect to ProviderRegistry | Provider config |
| Connect to Logger | Structured logging |

### Phase D: Polish (Sprint Future+3)

| Task | Description |
|------|-------------|
| Auto-updates | GitHub releases |
| Platform installers | macOS, Windows, Linux |
| Dark mode + themes | System preference |

---

## Key Code Patterns to Reuse

### IPC Communication

```typescript
// Preload (secure bridge)
contextBridge.exposeInMainWorld('endiorbot', {
  session: {
    load: (id: string) => ipcRenderer.invoke('session:load', id),
    save: (session: Session) => ipcRenderer.invoke('session:save', session),
    status: () => ipcRenderer.invoke('session:status'),
  },
  onMessage: (callback: (msg: Message) => void) => {
    ipcRenderer.on('session:message', (_, msg) => callback(msg));
  }
});
```

### Zustand Store Pattern

```typescript
// ClawX pattern (keep)
interface SessionStore {
  session: Session | null;
  loading: boolean;
  error: string | null;
  actions: {
    loadSession: (id: string) => Promise<void>;
    sendMessage: (content: string) => Promise<void>;
  };
}

const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  loading: false,
  error: null,
  actions: {
    loadSession: async (id) => {
      set({ loading: true });
      try {
        const session = await window.endiorbot.session.load(id);
        set({ session, loading: false });
      } catch (e) {
        set({ error: e.message, loading: false });
      }
    },
    // ...
  }
}));
```

### WebSocket Streaming

```typescript
// ClawX pattern for streaming messages (keep)
const handleStreamMessage = (chunk: string) => {
  setMessages(prev => {
    const last = prev[prev.length - 1];
    if (last?.role === 'assistant' && last.streaming) {
      return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
    }
    return prev;
  });
};
```

---

## Estimated Effort

| Phase | Duration | LOC |
|-------|----------|-----|
| Foundation | 1 sprint | ~500 |
| Core UI | 2 sprints | ~2,000 |
| Integration | 1 sprint | ~800 |
| Polish | 1 sprint | ~500 |
| **Total** | 5 sprints | ~3,800 |

---

## Deferred to Post-MVP

- Channel integrations (WhatsApp, Telegram)
- Skill marketplace
- Cron scheduling UI
- Multi-language beyond EN

---

## CEO Vision

> "Use EndiorBot Desktop directly (no VSCode needed)"

The ported desktop app will provide:
1. **Chat interface** for AI conversations
2. **Project dashboard** for context switching
3. **SDLC status** for gate tracking
4. **Settings** for provider/budget configuration

All while maintaining CLI for power users.

---

*Desktop Integration v1.0.0*
*SDLC Framework 6.1.1*
