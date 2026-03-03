/**
 * Gate Confirmation Store
 *
 * Persists gate confirmations to disk so they survive across CLI invocations.
 * Storage: ~/.endiorbot/gate-confirmations/{projectId}.json
 *
 * @module sdlc/gates/gate-store
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE
 * @authority ADR-004 SDLC Gate Engine
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { GateId } from "./gate-checklist.js";

// ============================================================================
// Types
// ============================================================================

export interface GateConfirmation {
  gateId: GateId;
  featureId: string;
  confirmedAt: string;
  confirmedBy: string;
  force: boolean;
  reason?: string;
}

interface GateConfirmationFile {
  projectId: string;
  confirmations: GateConfirmation[];
}

// ============================================================================
// Store
// ============================================================================

const STORE_DIR = join(homedir(), ".endiorbot", "gate-confirmations");

function getStorePath(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(STORE_DIR, `${safeId}.json`);
}

/**
 * Load all gate confirmations for a project.
 */
export function loadGateConfirmations(projectId: string): GateConfirmation[] {
  const filePath = getStorePath(projectId);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as GateConfirmationFile;
    return data.confirmations ?? [];
  } catch {
    return [];
  }
}

/**
 * Check if a specific gate has been confirmed.
 */
export function isGateConfirmed(
  projectId: string,
  gateId: GateId,
  featureId: string = "default",
): boolean {
  const confirmations = loadGateConfirmations(projectId);
  return confirmations.some(
    (c) => c.gateId === gateId && c.featureId === featureId,
  );
}

/**
 * Save a gate confirmation.
 */
export function saveGateConfirmation(
  projectId: string,
  confirmation: GateConfirmation,
): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }

  const existing = loadGateConfirmations(projectId);

  // Replace existing confirmation for same gate+feature, or add new
  const idx = existing.findIndex(
    (c) =>
      c.gateId === confirmation.gateId &&
      c.featureId === confirmation.featureId,
  );
  if (idx >= 0) {
    existing[idx] = confirmation;
  } else {
    existing.push(confirmation);
  }

  const data: GateConfirmationFile = {
    projectId,
    confirmations: existing,
  };

  writeFileSync(getStorePath(projectId), JSON.stringify(data, null, 2));
}

/**
 * Get confirmation for a specific gate.
 */
export function getGateConfirmation(
  projectId: string,
  gateId: GateId,
  featureId: string = "default",
): GateConfirmation | undefined {
  const confirmations = loadGateConfirmations(projectId);
  return confirmations.find(
    (c) => c.gateId === gateId && c.featureId === featureId,
  );
}
