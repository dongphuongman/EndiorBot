/**
 * Session Types
 *
 * Core interfaces for session and project context management.
 * Based on TS-002 Session Management specification.
 */

import type { Message } from "../providers/types.js";

// ============================================================================
// Project Tier
// ============================================================================

export type ProjectTier = "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";

// Token budgets by tier
export const TOKEN_BUDGETS: Record<ProjectTier, number> = {
  LITE: 10000,
  STANDARD: 50000,
  PROFESSIONAL: 100000,
  ENTERPRISE: 200000,
};

// Compaction threshold (80% of budget)
export const COMPACTION_THRESHOLD = 0.8;

// ============================================================================
// SDLC Types
// ============================================================================

export type SDLCStage =
  | "00-FOUNDATION"
  | "01-PLANNING"
  | "02-DESIGN"
  | "03-INTEGRATE"
  | "04-BUILD"
  | "05-TEST"
  | "06-DEPLOY"
  | "07-OPERATE";

export type GateId =
  | "G0"
  | "G0.1"
  | "G1"
  | "G2"
  | "G3"
  | "G4"
  | "G-Sprint";

export interface SDLCConfig {
  frameworkVersion: string;
  docsRoot: string;
  strict: boolean;
  currentStage: SDLCStage;
  gates: GateStatus[];
}

export interface GateStatus {
  gateId: GateId;
  featureId: string;
  status: "pending" | "passed" | "failed";
  evaluatedAt?: Date;
}

// ============================================================================
// Git State
// ============================================================================

export interface GitState {
  branch: string;
  uncommittedFiles: number;
  lastCommit?: string;
  lastCommitMessage?: string;
}

// ============================================================================
// Session
// ============================================================================

export interface Session {
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

export interface SessionSummary {
  id: string;
  projectId: string;
  createdAt: Date;
  lastActiveAt: Date;
  messageCount: number;
  tokenCount: number;
}

// ============================================================================
// Project Context
// ============================================================================

export interface ProjectContext {
  id: string;
  name: string;
  path: string;
  tier: ProjectTier;

  sdlcConfig: SDLCConfig;
  session: Session;
  gitState: GitState;
}

// ============================================================================
// Session Store Interface
// ============================================================================

export interface SessionStore {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<void>;
  list(projectId?: string): Promise<SessionSummary[]>;
}

// ============================================================================
// Session Events
// ============================================================================

export type SessionEventType =
  | "session-created"
  | "session-loaded"
  | "session-saved"
  | "session-deleted"
  | "message-added"
  | "history-compacted"
  | "project-switched";

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  projectId?: string;
  timestamp: Date;
  data?: unknown;
}

export type SessionEventListener = (event: SessionEvent) => void;
