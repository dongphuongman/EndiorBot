/**
 * Gate Mark Store
 *
 * Persists manual checklist item marks to disk so teams can mark
 * `autoCheck: false` items as complete with evidence — enabling
 * `gate confirm` without CEO `--force` override.
 *
 * Storage: ~/.endiorbot/gate-marks/{projectId}.json
 *
 * CEO bug report (OGA team, 2026-04-26): "đã confirm mà phải dùng force
 * luôn luôn là không đúng, CEO chỉ override khi cần thiết."
 *
 * @module sdlc/gates/gate-mark-store
 * @version 1.0.0
 * @date 2026-04-26
 * @status ACTIVE — Sprint 143 A3
 * @authority CEO bug report + CTO design review
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { GateId } from "./gate-checklist.js";

// ============================================================================
// Types
// ============================================================================

export interface GateItemMark {
  gateId: GateId;
  itemId: string;
  status: "pass";
  evidence: string;
  markedAt: string;
  markedBy: string;
}

interface GateMarkFile {
  projectId: string;
  marks: GateItemMark[];
}

// ============================================================================
// Store paths
// ============================================================================

function getStoreDir(): string {
  const base = process.env["ENDIORBOT_STATE_DIR"] ?? join(homedir(), ".endiorbot");
  return join(base, "gate-marks");
}

function getStorePath(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getStoreDir(), `${safeId}.json`);
}

// ============================================================================
// Read / Write
// ============================================================================

/**
 * Load all gate marks for a project.
 */
export function loadGateMarks(projectId: string): GateItemMark[] {
  const filePath = getStorePath(projectId);
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as GateMarkFile;
    return data.marks ?? [];
  } catch {
    return [];
  }
}

/**
 * Save a gate item mark. Replaces existing mark for same gate+item.
 */
export function saveGateItemMark(
  projectId: string,
  mark: GateItemMark,
): void {
  const dir = getStoreDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const existing = loadGateMarks(projectId);

  // Replace existing mark for same gate+item, or add new
  const idx = existing.findIndex(
    (m) => m.gateId === mark.gateId && m.itemId === mark.itemId,
  );
  if (idx >= 0) {
    existing[idx] = mark;
  } else {
    existing.push(mark);
  }

  const data: GateMarkFile = {
    projectId,
    marks: existing,
  };

  writeFileSync(getStorePath(projectId), JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Check if a specific gate item has been marked as pass.
 */
export function isItemMarked(
  projectId: string,
  gateId: GateId,
  itemId: string,
): boolean {
  const marks = loadGateMarks(projectId);
  return marks.some(
    (m) => m.gateId === gateId && m.itemId === itemId && m.status === "pass",
  );
}

/**
 * Get mark for a specific gate item.
 */
export function getItemMark(
  projectId: string,
  gateId: GateId,
  itemId: string,
): GateItemMark | undefined {
  const marks = loadGateMarks(projectId);
  return marks.find(
    (m) => m.gateId === gateId && m.itemId === itemId,
  );
}

/**
 * Remove a mark (reset an item back to manual/pending).
 */
export function removeGateItemMark(
  projectId: string,
  gateId: GateId,
  itemId: string,
): boolean {
  const dir = getStoreDir();
  const existing = loadGateMarks(projectId);
  const idx = existing.findIndex(
    (m) => m.gateId === gateId && m.itemId === itemId,
  );
  if (idx < 0) return false;

  existing.splice(idx, 1);

  const data: GateMarkFile = {
    projectId,
    marks: existing,
  };

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getStorePath(projectId), JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  return true;
}
