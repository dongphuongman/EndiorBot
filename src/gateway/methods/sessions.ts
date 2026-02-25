/**
 * Gateway Sessions Methods
 *
 * JSON-RPC methods for session management.
 *
 * @module gateway/methods/sessions
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Day 3
 */

import type { GatewayServer } from "../server.js";
import type { ClientInfo } from "../types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Session information.
 */
export interface SessionInfo {
  id: string;
  status: "active" | "paused" | "completed";
  startedAt: number;
  projectId?: string;
  projectName?: string;
  tokenUsage: {
    input: number;
    output: number;
  };
  messageCount: number;
  currentAgent?: string;
}

/**
 * Active sessions store (in-memory for now).
 * TODO: Wire to actual session manager in Sprint 44 Day 5+
 */
const activeSessions: Map<string, SessionInfo> = new Map();

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get list of all sessions.
 */
function handleSessionsList(
  params: unknown,
  _client: ClientInfo
): { sessions: SessionInfo[] } {
  const { status, limit = 50, offset = 0 } = (params ?? {}) as {
    status?: string;
    limit?: number;
    offset?: number;
  };

  let sessions = Array.from(activeSessions.values());

  // Filter by status if provided
  if (status) {
    sessions = sessions.filter((s) => s.status === status);
  }

  // Apply pagination
  sessions = sessions.slice(offset, offset + limit);

  return { sessions };
}

/**
 * Get a specific session by ID.
 */
function handleSessionsGet(
  params: unknown,
  _client: ClientInfo
): SessionInfo | { error: string } {
  const { sessionId } = (params ?? {}) as { sessionId?: string };

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return session;
}

/**
 * Get current session status (quick status check).
 */
function handleSessionsStatus(
  params: unknown,
  _client: ClientInfo
): {
  activeCount: number;
  pausedCount: number;
  currentSession?: SessionInfo;
} {
  const { sessionId } = (params ?? {}) as { sessionId?: string };

  const sessions = Array.from(activeSessions.values());
  const activeCount = sessions.filter((s) => s.status === "active").length;
  const pausedCount = sessions.filter((s) => s.status === "paused").length;

  let currentSession: SessionInfo | undefined;
  if (sessionId) {
    currentSession = activeSessions.get(sessionId);
  } else {
    // Return most recent active session
    currentSession = sessions.find((s) => s.status === "active");
  }

  const result: { activeCount: number; pausedCount: number; currentSession?: SessionInfo } = {
    activeCount,
    pausedCount,
  };
  if (currentSession !== undefined) {
    result.currentSession = currentSession;
  }
  return result;
}

/**
 * Create a new session.
 */
function handleSessionsCreate(
  params: unknown,
  _client: ClientInfo
): SessionInfo {
  const { projectId, projectName } = (params ?? {}) as {
    projectId?: string;
    projectName?: string;
  };

  const session: SessionInfo = {
    id: crypto.randomUUID(),
    status: "active",
    startedAt: Date.now(),
    tokenUsage: { input: 0, output: 0 },
    messageCount: 0,
  };

  if (projectId !== undefined) {
    session.projectId = projectId;
  }
  if (projectName !== undefined) {
    session.projectName = projectName;
  }

  activeSessions.set(session.id, session);

  return session;
}

/**
 * Pause a session.
 */
function handleSessionsPause(
  params: unknown,
  _client: ClientInfo
): { success: boolean; session: SessionInfo } {
  const { sessionId } = (params ?? {}) as { sessionId?: string };

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  session.status = "paused";

  return { success: true, session };
}

/**
 * Resume a paused session.
 */
function handleSessionsResume(
  params: unknown,
  _client: ClientInfo
): { success: boolean; session: SessionInfo } {
  const { sessionId } = (params ?? {}) as { sessionId?: string };

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.status !== "paused") {
    throw new Error(`Session is not paused: ${sessionId}`);
  }

  session.status = "active";

  return { success: true, session };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register session methods with the gateway server.
 */
export function registerSessionMethods(server: GatewayServer): void {
  server.registerMethod("sessions.list", handleSessionsList);
  server.registerMethod("sessions.get", handleSessionsGet);
  server.registerMethod("sessions.status", handleSessionsStatus);
  server.registerMethod("sessions.create", handleSessionsCreate);
  server.registerMethod("sessions.pause", handleSessionsPause);
  server.registerMethod("sessions.resume", handleSessionsResume);
}

// ============================================================================
// Test Helpers (for integration testing)
// ============================================================================

/**
 * Add a session directly (for testing).
 */
export function addTestSession(session: SessionInfo): void {
  activeSessions.set(session.id, session);
}

/**
 * Clear all sessions (for testing).
 */
export function clearSessions(): void {
  activeSessions.clear();
}

/**
 * Get sessions map (for testing).
 */
export function getSessionsMap(): Map<string, SessionInfo> {
  return activeSessions;
}
