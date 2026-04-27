/**
 * Gateway Checkpoint Methods
 *
 * JSON-RPC methods for checkpoint management.
 *
 * @module gateway/methods/checkpoints
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
 * Checkpoint information.
 */
export interface CheckpointInfo {
  id: string;
  sessionId: string;
  label?: string;
  createdAt: number;
  fileCount: number;
  messageCount: number;
  tokenUsage: {
    input: number;
    output: number;
  };
  brainVersion?: string;
  brainDigest?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Checkpoint store (in-memory for now).
 * TODO: Wire to actual CheckpointManager in Sprint 44 Day 5+
 */
const checkpoints: Map<string, CheckpointInfo> = new Map();

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Get list of checkpoints.
 */
function handleCheckpointsList(
  params: unknown,
  _client: ClientInfo
): { checkpoints: CheckpointInfo[]; total: number } {
  const { sessionId, limit = 50, offset = 0 } = (params ?? {}) as {
    sessionId?: string;
    limit?: number;
    offset?: number;
  };

  let cpList = Array.from(checkpoints.values());

  // Filter by session if provided
  if (sessionId) {
    cpList = cpList.filter((cp) => cp.sessionId === sessionId);
  }

  // Sort by creation time (newest first)
  cpList.sort((a, b) => b.createdAt - a.createdAt);

  const total = cpList.length;
  cpList = cpList.slice(offset, offset + limit);

  return { checkpoints: cpList, total };
}

/**
 * Get a specific checkpoint.
 */
function handleCheckpointsGet(
  params: unknown,
  _client: ClientInfo
): CheckpointInfo {
  const { checkpointId } = (params ?? {}) as { checkpointId?: string };

  if (!checkpointId) {
    throw new Error("checkpointId is required");
  }

  const checkpoint = checkpoints.get(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  return checkpoint;
}

/**
 * Create a new checkpoint.
 */
function handleCheckpointsCreate(
  params: unknown,
  _client: ClientInfo
): CheckpointInfo {
  const { sessionId, label, metadata } = (params ?? {}) as {
    sessionId: string;
    label?: string;
    metadata?: Record<string, unknown>;
  };

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const checkpoint: CheckpointInfo = {
    id: crypto.randomUUID(),
    sessionId,
    createdAt: Date.now(),
    fileCount: 0,
    messageCount: 0,
    tokenUsage: { input: 0, output: 0 },
  };

  if (label !== undefined) {
    checkpoint.label = label;
  }
  if (metadata !== undefined) {
    checkpoint.metadata = metadata;
  }

  checkpoints.set(checkpoint.id, checkpoint);

  return checkpoint;
}

/**
 * Restore from a checkpoint.
 */
function handleCheckpointsRestore(
  params: unknown,
  _client: ClientInfo
): { success: boolean; checkpoint: CheckpointInfo; newSessionId: string } {
  const { checkpointId } = (params ?? {}) as { checkpointId?: string };

  if (!checkpointId) {
    throw new Error("checkpointId is required");
  }

  const checkpoint = checkpoints.get(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  // CSO Sprint 144: Restore not yet implemented — return explicit error
  // instead of fake success that misleads callers into thinking state was restored.
  throw new Error("Checkpoint restore not yet implemented. Checkpoint data is available for manual review via checkpoints.get.");
}

/**
 * Delete a checkpoint.
 */
function handleCheckpointsDelete(
  params: unknown,
  _client: ClientInfo
): { success: boolean; deletedId: string } {
  const { checkpointId } = (params ?? {}) as { checkpointId?: string };

  if (!checkpointId) {
    throw new Error("checkpointId is required");
  }

  const checkpoint = checkpoints.get(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  checkpoints.delete(checkpointId);

  return { success: true, deletedId: checkpointId };
}

/**
 * Get latest checkpoint for a session.
 */
function handleCheckpointsLatest(
  params: unknown,
  _client: ClientInfo
): CheckpointInfo | null {
  const { sessionId } = (params ?? {}) as { sessionId?: string };

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const sessionCheckpoints = Array.from(checkpoints.values())
    .filter((cp) => cp.sessionId === sessionId)
    .sort((a, b) => b.createdAt - a.createdAt);

  return sessionCheckpoints[0] ?? null;
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register checkpoint methods with the gateway server.
 */
export function registerCheckpointMethods(server: GatewayServer): void {
  server.registerMethod("checkpoints.list", handleCheckpointsList);
  server.registerMethod("checkpoints.get", handleCheckpointsGet);
  server.registerMethod("checkpoints.create", handleCheckpointsCreate);
  server.registerMethod("checkpoints.restore", handleCheckpointsRestore);
  server.registerMethod("checkpoints.delete", handleCheckpointsDelete);
  server.registerMethod("checkpoints.latest", handleCheckpointsLatest);
}

// ============================================================================
// Internal API (for CheckpointManager integration)
// ============================================================================

/**
 * Store a checkpoint (called by CheckpointManager).
 */
export function storeCheckpoint(checkpoint: CheckpointInfo): void {
  checkpoints.set(checkpoint.id, checkpoint);
}

/**
 * Update checkpoint (called by CheckpointManager).
 */
export function updateCheckpoint(
  checkpointId: string,
  updates: Partial<CheckpointInfo>
): CheckpointInfo | null {
  const checkpoint = checkpoints.get(checkpointId);
  if (!checkpoint) {
    return null;
  }

  Object.assign(checkpoint, updates);
  return checkpoint;
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clear checkpoints (for testing).
 */
export function clearCheckpoints(): void {
  checkpoints.clear();
}

/**
 * Get checkpoints map (for testing).
 */
export function getCheckpointsMap(): Map<string, CheckpointInfo> {
  return checkpoints;
}

/**
 * Add test checkpoint (for testing).
 */
export function addTestCheckpoint(checkpoint: CheckpointInfo): void {
  checkpoints.set(checkpoint.id, checkpoint);
}
