# Technical Specification: Session Management

**ID:** TS-002
**Status:** Proposed
**Date:** 2026-02-22
**Related ADR:** ADR-002 (Project Context Switching)
**SDLC Stage:** 02-DESIGN

---

## Overview

The Session module manages conversation state, project context, and token budget across multiple projects.

---

## Architecture

```
src/sessions/
├── index.ts                 # Re-exports
├── types.ts                 # Session types
├── session-manager.ts       # Session lifecycle
├── session-store.ts         # Persistence
├── history-manager.ts       # Conversation history
├── token-counter.ts         # Token budget tracking
└── compactor.ts             # History compaction
```

---

## Core Interfaces

### Session Types

```typescript
interface Session {
  id: string;
  projectId: string;
  createdAt: Date;
  lastActiveAt: Date;

  // Conversation state
  messages: Message[];
  tokenCount: number;
  maxTokens: number;

  // SDLC state
  sdlcStage: SDLCStage;
  activeGates: GateId[];
  activeTask?: string;

  // Compaction
  compactedHistory?: string;
  compactionCount: number;
}

interface ProjectContext {
  id: string;
  name: string;
  path: string;
  tier: ProjectTier;

  sdlcConfig: SDLCConfig;
  session: Session;
  gitState: GitState;
}

type ProjectTier = 'LITE' | 'STANDARD' | 'PROFESSIONAL' | 'ENTERPRISE';
```

### Session Manager

```typescript
class SessionManager {
  private activeSessions: Map<string, Session> = new Map();
  private store: SessionStore;

  // Lifecycle
  async createSession(projectId: string): Promise<Session>;
  async loadSession(sessionId: string): Promise<Session>;
  async saveSession(session: Session): Promise<void>;
  async deleteSession(sessionId: string): Promise<void>;

  // Active session
  getActiveSession(): Session | undefined;
  setActiveSession(sessionId: string): void;

  // Context switching
  async switchProject(projectId: string): Promise<Session>;

  // History management
  async addMessage(message: Message): Promise<void>;
  async compactHistory(): Promise<void>;
}
```

---

## Token Budget Management

### Budget by Tier

| Tier | Max Tokens | Compaction Threshold |
|------|------------|---------------------|
| LITE | 10,000 | 80% (8,000) |
| STANDARD | 50,000 | 80% (40,000) |
| PROFESSIONAL | 100,000 | 80% (80,000) |
| ENTERPRISE | 200,000 | 80% (160,000) |

### Token Counter

```typescript
class TokenCounter {
  private encoder: Tiktoken;

  constructor(model: string = 'claude-opus-4') {
    this.encoder = getEncoding(model);
  }

  count(text: string): number {
    return this.encoder.encode(text).length;
  }

  countMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.count(msg.content);
      total += 4; // Role overhead
    }
    return total;
  }
}
```

---

## History Compaction

### Algorithm

```typescript
class HistoryCompactor {
  private tokenCounter: TokenCounter;
  private provider: AIProvider;

  async compact(session: Session): Promise<Session> {
    const threshold = session.maxTokens * 0.8;

    if (session.tokenCount < threshold) {
      return session; // No compaction needed
    }

    // Keep recent messages intact
    const recentCount = Math.floor(session.messages.length * 0.3);
    const recentMessages = session.messages.slice(-recentCount);
    const oldMessages = session.messages.slice(0, -recentCount);

    // Summarize old messages
    const summary = await this.summarize(oldMessages);

    return {
      ...session,
      messages: [
        { role: 'system', content: `Previous context summary:\n${summary}` },
        ...recentMessages,
      ],
      compactedHistory: summary,
      compactionCount: session.compactionCount + 1,
      tokenCount: this.tokenCounter.countMessages([
        { role: 'system', content: summary },
        ...recentMessages,
      ]),
    };
  }

  private async summarize(messages: Message[]): Promise<string> {
    const response = await this.provider.chat({
      model: 'claude-haiku-4', // Fast model for summarization
      messages: [
        {
          role: 'system',
          content: 'Summarize the following conversation, preserving key decisions, code changes, and context.',
        },
        {
          role: 'user',
          content: messages.map(m => `${m.role}: ${m.content}`).join('\n\n'),
        },
      ],
      maxTokens: 2000,
    });
    return response.content;
  }
}
```

---

## Persistence

### Session Store

```typescript
interface SessionStore {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<void>;
  list(projectId?: string): Promise<SessionSummary[]>;
}

class FileSessionStore implements SessionStore {
  private basePath: string;

  constructor(basePath: string = '~/.endiorbot/sessions') {
    this.basePath = resolveUserPath(basePath);
  }

  async save(session: Session): Promise<void> {
    const path = this.sessionPath(session.id);
    await fs.writeFile(path, JSON.stringify(session, null, 2));
  }

  async load(sessionId: string): Promise<Session | null> {
    const path = this.sessionPath(sessionId);
    if (!await fs.pathExists(path)) return null;
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data);
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.basePath, `${sessionId}.json`);
  }
}
```

### Storage Structure

```
~/.endiorbot/sessions/
├── {sessionId}.json
├── {sessionId}.json
└── index.json           # Quick lookup index
```

---

## Project Context Switching

### Switch Flow

```
1. User: "endiorbot switch bflow"
2. SessionManager.switchProject("bflow")
   a. Save current session
   b. Load/create bflow session
   c. Load SDLC state
   d. Check git state for uncommitted changes
   e. Emit 'project-switched' event
3. Return new session to CLI
```

### Context Preservation

| Preserved on Switch | Reset on Switch |
|---------------------|-----------------|
| Conversation history | Active tool calls |
| SDLC stage & gates | Streaming connections |
| Active task | Temp file references |
| Git branch | Model selection (reset to project default) |

---

## Migration from OpenClaw

| OpenClaw File | EndiorBot Target | Changes |
|---------------|------------------|---------|
| src/sessions/index.ts | src/sessions/index.ts | - |
| src/sessions/session.ts | src/sessions/session-manager.ts | Rename |
| src/sessions/store.ts | src/sessions/session-store.ts | Rename |

---

## Testing Requirements

| Test Type | Coverage Target |
|-----------|-----------------|
| Unit tests | > 80% |
| Integration tests | Session lifecycle |
| Compaction tests | Various token counts |

---

*SDLC Framework v6.1.1 - Stage 02: Design*
