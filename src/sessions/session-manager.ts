/**
 * Session Manager
 *
 * Manages session lifecycle, context switching, and history.
 */

import type { Message } from "../providers/types.js";
import { getSessionStore } from "./session-store.js";
import { getTokenCounter, TokenCounter } from "./token-counter.js";
import type {
  GateId,
  ProjectTier,
  SDLCStage,
  Session,
  SessionEvent,
  SessionEventListener,
  SessionStore,
} from "./types.js";
import { COMPACTION_THRESHOLD, TOKEN_BUDGETS } from "./types.js";

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

export class SessionManager {
  private store: SessionStore;
  private tokenCounter: TokenCounter;
  private activeSession: Session | undefined;
  private listeners: Set<SessionEventListener> = new Set();

  constructor(store?: SessionStore, tokenCounter?: TokenCounter) {
    this.store = store ?? getSessionStore();
    this.tokenCounter = tokenCounter ?? getTokenCounter();
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  async createSession(
    projectId: string,
    tier: ProjectTier = "STANDARD",
  ): Promise<Session> {
    const now = new Date();
    const maxTokens = TOKEN_BUDGETS[tier];

    const session: Session = {
      id: generateSessionId(),
      projectId,
      createdAt: now,
      lastActiveAt: now,
      messages: [],
      tokenCount: 0,
      maxTokens,
      sdlcStage: "04-BUILD",
      activeGates: [],
      compactionCount: 0,
    };

    await this.store.save(session);
    this.activeSession = session;

    this.emit({
      type: "session-created",
      sessionId: session.id,
      projectId,
      timestamp: now,
    });

    return session;
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const session = await this.store.load(sessionId);

    if (session) {
      this.activeSession = session;

      this.emit({
        type: "session-loaded",
        sessionId: session.id,
        projectId: session.projectId,
        timestamp: new Date(),
      });
    }

    return session;
  }

  async saveSession(session?: Session): Promise<void> {
    const toSave = session ?? this.activeSession;
    if (!toSave) return;

    toSave.lastActiveAt = new Date();
    await this.store.save(toSave);

    this.emit({
      type: "session-saved",
      sessionId: toSave.id,
      projectId: toSave.projectId,
      timestamp: new Date(),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);

    if (this.activeSession?.id === sessionId) {
      this.activeSession = undefined;
    }

    this.emit({
      type: "session-deleted",
      sessionId,
      timestamp: new Date(),
    });
  }

  // ============================================================================
  // Active Session
  // ============================================================================

  getActiveSession(): Session | undefined {
    return this.activeSession;
  }

  setActiveSession(session: Session): void {
    this.activeSession = session;
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  async addMessage(message: Message): Promise<void> {
    if (!this.activeSession) {
      throw new Error("No active session");
    }

    const tokenCount = this.tokenCounter.countMessage(message);
    this.activeSession.messages.push(message);
    this.activeSession.tokenCount += tokenCount;
    this.activeSession.lastActiveAt = new Date();

    // Check if compaction needed
    const threshold = this.activeSession.maxTokens * COMPACTION_THRESHOLD;
    if (this.activeSession.tokenCount > threshold) {
      await this.compactHistory();
    }

    this.emit({
      type: "message-added",
      sessionId: this.activeSession.id,
      projectId: this.activeSession.projectId,
      timestamp: new Date(),
      data: { tokenCount, totalTokens: this.activeSession.tokenCount },
    });
  }

  // ============================================================================
  // History Compaction
  // ============================================================================

  async compactHistory(): Promise<void> {
    if (!this.activeSession) return;

    const session = this.activeSession;
    const messageCount = session.messages.length;

    if (messageCount < 4) return; // Too few messages to compact

    // Keep last 30% of messages intact
    const keepCount = Math.max(2, Math.floor(messageCount * 0.3));
    const recentMessages = session.messages.slice(-keepCount);
    const oldMessages = session.messages.slice(0, -keepCount);

    // Create summary of old messages
    const summary = this.summarizeMessages(oldMessages);

    // Replace messages with summary + recent
    session.messages = [
      { role: "system", content: `Previous context summary:\n${summary}` },
      ...recentMessages,
    ];

    // Recalculate token count
    session.tokenCount = this.tokenCounter.countMessages(session.messages);
    session.compactedHistory = summary;
    session.compactionCount++;

    await this.saveSession(session);

    this.emit({
      type: "history-compacted",
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date(),
      data: {
        compactedCount: oldMessages.length,
        keptCount: recentMessages.length,
        newTokenCount: session.tokenCount,
      },
    });
  }

  private summarizeMessages(messages: Message[]): string {
    // Simple summarization - extract key points
    const lines: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");

      // Take first 200 chars of each message
      const excerpt = content.length > 200
        ? content.slice(0, 197) + "..."
        : content;

      lines.push(`[${msg.role}]: ${excerpt}`);
    }

    return lines.join("\n\n");
  }

  // ============================================================================
  // Project Context Switching
  // ============================================================================

  async switchProject(
    projectId: string,
    tier: ProjectTier = "STANDARD",
  ): Promise<Session> {
    // Save current session
    if (this.activeSession) {
      await this.saveSession();
    }

    // Try to load existing session for project
    const sessions = await this.store.list(projectId);
    const latestSession = sessions[0]; // Sorted by lastActiveAt

    let session: Session;

    if (latestSession) {
      const loaded = await this.loadSession(latestSession.id);
      if (loaded) {
        session = loaded;
      } else {
        session = await this.createSession(projectId, tier);
      }
    } else {
      session = await this.createSession(projectId, tier);
    }

    this.emit({
      type: "project-switched",
      sessionId: session.id,
      projectId,
      timestamp: new Date(),
    });

    return session;
  }

  // ============================================================================
  // SDLC State
  // ============================================================================

  updateSDLCStage(stage: SDLCStage): void {
    if (!this.activeSession) return;
    this.activeSession.sdlcStage = stage;
  }

  addActiveGate(gateId: GateId): void {
    if (!this.activeSession) return;
    if (!this.activeSession.activeGates.includes(gateId)) {
      this.activeSession.activeGates.push(gateId);
    }
  }

  removeActiveGate(gateId: GateId): void {
    if (!this.activeSession) return;
    this.activeSession.activeGates = this.activeSession.activeGates.filter(
      (g) => g !== gateId,
    );
  }

  setActiveTask(task: string | undefined): void {
    if (!this.activeSession) return;
    if (task === undefined) {
      delete this.activeSession.activeTask;
    } else {
      this.activeSession.activeTask = task;
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  on(listener: SessionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Session event listener error:", error);
      }
    }
  }
}

// Singleton instance
let globalManager: SessionManager | undefined;

export function getSessionManager(): SessionManager {
  if (!globalManager) {
    globalManager = new SessionManager();
  }
  return globalManager;
}

export function resetSessionManager(): void {
  globalManager = undefined;
}
