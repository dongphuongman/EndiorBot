/**
 * Brain Evolution
 *
 * Version management and checkpoint integration for the Brain system.
 * Handles brain state evolution, versioning, and restore operations.
 *
 * @see ADR-009-Brain-Architecture.md
 * @see ADR-006-Checkpoint-State-Model.md
 */

import { appendEvent } from './layers/events.js';
import {
  bumpBrainVersion,
  computeBrainDigest,
  computeLayerHashes,
  exportBrain,
  readBrainVersion,
  readCEOProfile,
  readEvents,
  readMentalModels,
  readPatterns,
  readStructures,
  writeBrainVersion,
  writeCEOProfile,
  writeEvents,
  writeMentalModels,
  writePatterns,
  writeStructures,
} from './storage.js';
import type {
  BrainDigest,
  BrainExport,
  BrainLayerId,
  BrainVersion,
  CEOProfile,
  EventEntry,
  LayerHashes,
  MentalModelEntry,
  PatternEntry,
  StructureEntry,
} from './types.js';

// =============================================================================
// Version Management
// =============================================================================

/**
 * Get current brain version
 */
export function getBrainVersion(): BrainVersion {
  return readBrainVersion();
}

/**
 * Set brain version (for restore operations)
 */
export function setBrainVersion(version: BrainVersion): void {
  writeBrainVersion(version);
}

/**
 * Bump version for a specific layer
 */
export function bumpVersion(layer: BrainLayerId): BrainVersion {
  return bumpBrainVersion(layer);
}

/**
 * Get version string for checkpoint reference
 *
 * Format: "v{version}-{events}.{patterns}.{structures}.{mentalModels}"
 */
export function getVersionString(): string {
  const ver = readBrainVersion();
  const lv = ver.layerVersions;
  return `v${ver.version}-${lv.events}.${lv.patterns}.${lv.structures}.${lv.mentalModels}`;
}

// =============================================================================
// Digest Functions (re-exports)
// =============================================================================

export { computeBrainDigest, computeLayerHashes };

/**
 * Get brain digest for checkpoint
 *
 * Returns the current brain digest with all layer hashes.
 */
export function getDigestForCheckpoint(): BrainDigest {
  return computeBrainDigest();
}

/**
 * Get brain digest hash only (short form)
 */
export function getDigestHash(): string {
  return computeBrainDigest().hash;
}

// =============================================================================
// Checkpoint Integration
// =============================================================================

/**
 * Brain reference for checkpoint state
 *
 * This is the data structure used in CheckpointState.brain
 */
export interface BrainCheckpointReference {
  /** Brain version string */
  brainVersion: string;
  /** Brain digest (SHA256, 16 chars) */
  brainDigest: string;
  /** Per-layer hashes for granular comparison */
  layerHashes: LayerHashes;
  /** Timestamp when reference was created */
  capturedAt: string;
}

/**
 * Get brain reference for checkpoint creation
 *
 * Call this during checkpoint creation to capture current brain state.
 */
export function getBrainCheckpointReference(): BrainCheckpointReference {
  const digest = computeBrainDigest();
  return {
    brainVersion: getVersionString(),
    brainDigest: digest.hash,
    layerHashes: digest.layerHashes,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Verify brain state matches checkpoint reference
 *
 * @param reference - Brain reference from checkpoint
 * @returns true if current brain matches checkpoint
 */
export function verifyBrainCheckpoint(reference: BrainCheckpointReference): boolean {
  const currentDigest = computeBrainDigest();
  return currentDigest.hash === reference.brainDigest;
}

/**
 * Compare current brain with checkpoint reference
 *
 * @param reference - Brain reference from checkpoint
 * @returns Layer differences between current and checkpoint
 */
export function compareBrainCheckpoint(reference: BrainCheckpointReference): {
  matches: boolean;
  changedLayers: BrainLayerId[];
  currentDigest: string;
  checkpointDigest: string;
} {
  const current = computeLayerHashes();
  const checkpoint = reference.layerHashes;

  const changedLayers: BrainLayerId[] = [];

  if (current.events !== checkpoint.events) {
    changedLayers.push('events');
  }
  if (current.patterns !== checkpoint.patterns) {
    changedLayers.push('patterns');
  }
  if (current.structures !== checkpoint.structures) {
    changedLayers.push('structures');
  }
  if (current.mentalModels !== checkpoint.mentalModels) {
    changedLayers.push('mental-models');
  }

  return {
    matches: changedLayers.length === 0,
    changedLayers,
    currentDigest: computeBrainDigest().hash,
    checkpointDigest: reference.brainDigest,
  };
}

// =============================================================================
// Brain Context (for restore)
// =============================================================================

/**
 * Complete brain context for restore operations
 */
export interface BrainContext {
  version: BrainVersion;
  digest: BrainDigest;
  events: EventEntry[];
  patterns: PatternEntry[];
  structures: StructureEntry[];
  mentalModels: MentalModelEntry[];
  ceoProfile: CEOProfile;
}

/**
 * Load current brain context
 *
 * @returns Complete brain state for backup or restore
 */
export function loadBrainContext(): BrainContext {
  return {
    version: readBrainVersion(),
    digest: computeBrainDigest(),
    events: readEvents(),
    patterns: readPatterns(),
    structures: readStructures(),
    mentalModels: readMentalModels(),
    ceoProfile: readCEOProfile(),
  };
}

/**
 * Restore brain from context
 *
 * WARNING: This replaces all brain data. Use with caution.
 *
 * @param context - Brain context to restore
 */
export function restoreBrainContext(context: BrainContext): void {
  // Restore layers
  writeEvents(context.events);
  writePatterns(context.patterns);
  writeStructures(context.structures);
  writeMentalModels(context.mentalModels);
  writeCEOProfile(context.ceoProfile);

  // Restore version (update timestamp)
  writeBrainVersion({
    ...context.version,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Create brain snapshot for backup
 */
export function createBrainBackup(): BrainExport {
  return exportBrain();
}

/**
 * Restore brain from export backup
 *
 * @param backup - Brain export to restore from
 */
export function restoreBrainFromBackup(backup: BrainExport): void {
  writeEvents(backup.layers.events);
  writePatterns(backup.layers.patterns);
  writeStructures(backup.layers.structures);
  writeMentalModels(backup.layers.mentalModels);
  writeCEOProfile(backup.ceoProfile);

  // Update version with restored layer versions
  writeBrainVersion({
    ...backup.version,
    updatedAt: new Date().toISOString(),
  });
}

// =============================================================================
// Brain Health
// =============================================================================

/**
 * Brain health status
 */
export interface BrainHealth {
  /** Is brain initialized? */
  initialized: boolean;
  /** Version string */
  version: string;
  /** Current digest hash */
  digestHash: string;
  /** Layer counts */
  layers: {
    events: number;
    patterns: number;
    structures: number;
    mentalModels: number;
  };
  /** CEO profile loaded? */
  ceoProfileLoaded: boolean;
  /** Last update timestamp */
  lastUpdated: string;
}

/**
 * Get brain health status
 */
export function getBrainHealth(): BrainHealth {
  try {
    const version = readBrainVersion();
    const digest = computeBrainDigest();
    const events = readEvents();
    const patterns = readPatterns();
    const structures = readStructures();
    const mentalModels = readMentalModels();

    let ceoProfileLoaded = false;
    try {
      readCEOProfile();
      ceoProfileLoaded = true;
    } catch {
      // CEO profile not loaded
    }

    return {
      initialized: true,
      version: getVersionString(),
      digestHash: digest.hash,
      layers: {
        events: events.length,
        patterns: patterns.length,
        structures: structures.length,
        mentalModels: mentalModels.length,
      },
      ceoProfileLoaded,
      lastUpdated: version.updatedAt,
    };
  } catch {
    return {
      initialized: false,
      version: 'v0.0-0.0.0.0',
      digestHash: '',
      layers: {
        events: 0,
        patterns: 0,
        structures: 0,
        mentalModels: 0,
      },
      ceoProfileLoaded: false,
      lastUpdated: '',
    };
  }
}

/**
 * Format brain health as summary string
 */
export function formatBrainHealthSummary(): string {
  const health = getBrainHealth();

  if (!health.initialized) {
    return 'Brain: Not initialized';
  }

  const lines = [
    `Brain: ${health.version}`,
    `Digest: ${health.digestHash}`,
    `Layers: E=${health.layers.events} P=${health.layers.patterns} S=${health.layers.structures} M=${health.layers.mentalModels}`,
    `CEO Profile: ${health.ceoProfileLoaded ? 'loaded' : 'not loaded'}`,
    `Last Updated: ${health.lastUpdated}`,
  ];

  return lines.join('\n');
}

// =============================================================================
// Evolution History
// =============================================================================

/**
 * Evolution event type
 */
export type EvolutionEventType =
  | 'layer_updated'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'profile_changed'
  | 'brain_reset';

/**
 * Evolution event
 */
export interface EvolutionEvent {
  type: EvolutionEventType;
  timestamp: string;
  layer?: BrainLayerId;
  details?: Record<string, unknown>;
}

/**
 * Record an evolution event to the events layer
 *
 * This creates a meta-event tracking brain evolution itself.
 */
export function recordEvolutionEvent(
  type: EvolutionEventType,
  layer?: BrainLayerId,
  details?: Record<string, unknown>
): void {
  const payload: Record<string, unknown> = { evolutionType: type };
  if (layer !== undefined) {
    payload.layer = layer;
  }
  if (details !== undefined) {
    payload.details = details;
  }

  appendEvent({
    type: 'brain_evolution',
    payload,
  });
}
