/**
 * Brain Digest
 *
 * Functions for computing and comparing brain digests.
 * Used for checkpoint provenance and change detection.
 *
 * @see ADR-009-Brain-Architecture.md
 */

import { computeBrainDigest, computeLayerHashes } from './storage.js';
import type { BrainDigest, BrainLayerId, LayerHashes } from './types.js';

// =============================================================================
// Digest Computation (re-export from storage for convenience)
// =============================================================================

export { computeBrainDigest, computeLayerHashes };

// =============================================================================
// Digest Comparison
// =============================================================================

/**
 * Result of comparing two brain digests
 */
export interface DigestDiff {
  /** Whether the digests are identical */
  identical: boolean;
  /** List of layers that changed */
  changedLayers: BrainLayerId[];
  /** Previous digest hash */
  previousHash: string;
  /** Current digest hash */
  currentHash: string;
  /** Per-layer diff details */
  layerDiffs: LayerDiff[];
}

export interface LayerDiff {
  layer: BrainLayerId;
  changed: boolean;
  previousHash: string;
  currentHash: string;
}

/**
 * Compare two brain digests
 *
 * @param previous - Previous digest
 * @param current - Current digest
 * @returns Detailed diff between digests
 */
export function compareBrainDigests(
  previous: BrainDigest,
  current: BrainDigest
): DigestDiff {
  const layerIds: BrainLayerId[] = [
    'events',
    'patterns',
    'structures',
    'mental-models',
  ];

  const layerDiffs: LayerDiff[] = layerIds.map((layer) => {
    const prevHash = getLayerHash(previous.layerHashes, layer);
    const currHash = getLayerHash(current.layerHashes, layer);
    return {
      layer,
      changed: prevHash !== currHash,
      previousHash: prevHash,
      currentHash: currHash,
    };
  });

  const changedLayers = layerDiffs
    .filter((d) => d.changed)
    .map((d) => d.layer);

  return {
    identical: previous.hash === current.hash,
    changedLayers,
    previousHash: previous.hash,
    currentHash: current.hash,
    layerDiffs,
  };
}

/**
 * Check if a specific layer has changed between two digests
 *
 * @param layer - Layer to check
 * @param current - Current digest
 * @param previous - Previous digest
 * @returns true if the layer hash differs
 */
export function hasLayerChanged(
  layer: BrainLayerId,
  current: BrainDigest,
  previous: BrainDigest
): boolean {
  const currentHash = getLayerHash(current.layerHashes, layer);
  const previousHash = getLayerHash(previous.layerHashes, layer);
  return currentHash !== previousHash;
}

/**
 * Check if CEO profile has changed between two digests
 *
 * @param current - Current digest
 * @param previous - Previous digest
 * @returns true if CEO profile hash differs
 */
export function hasCEOProfileChanged(
  current: BrainDigest,
  previous: BrainDigest
): boolean {
  return current.layerHashes.ceoProfile !== previous.layerHashes.ceoProfile;
}

/**
 * Get the hash for a specific layer
 */
function getLayerHash(hashes: LayerHashes, layer: BrainLayerId): string {
  switch (layer) {
    case 'events':
      return hashes.events;
    case 'patterns':
      return hashes.patterns;
    case 'structures':
      return hashes.structures;
    case 'mental-models':
      return hashes.mentalModels;
    default:
      return '';
  }
}

// =============================================================================
// Digest Summary
// =============================================================================

/**
 * Get a human-readable summary of a brain digest
 *
 * @param digest - Brain digest
 * @returns Summary string
 */
export function getDigestSummary(digest: BrainDigest): string {
  const lines = [
    `Brain Digest: ${digest.hash}`,
    `Computed: ${digest.computedAt}`,
    '',
    'Layer Hashes:',
    `  events:        ${digest.layerHashes.events}`,
    `  patterns:      ${digest.layerHashes.patterns}`,
    `  structures:    ${digest.layerHashes.structures}`,
    `  mentalModels:  ${digest.layerHashes.mentalModels}`,
    `  ceoProfile:    ${digest.layerHashes.ceoProfile}`,
  ];
  return lines.join('\n');
}

/**
 * Get a diff summary between two digests
 *
 * @param diff - Digest diff
 * @returns Summary string
 */
export function getDiffSummary(diff: DigestDiff): string {
  if (diff.identical) {
    return 'No changes detected';
  }

  const lines = [
    `Changes detected (${diff.changedLayers.length} layer(s)):`,
    `  Previous: ${diff.previousHash}`,
    `  Current:  ${diff.currentHash}`,
    '',
    'Changed layers:',
    ...diff.layerDiffs
      .filter((d) => d.changed)
      .map((d) => `  - ${d.layer}: ${d.previousHash} → ${d.currentHash}`),
  ];

  return lines.join('\n');
}

// =============================================================================
// Digest Validation
// =============================================================================

/**
 * Validate that a digest has all required fields
 *
 * @param digest - Digest to validate
 * @returns true if valid
 */
export function isValidDigest(digest: unknown): digest is BrainDigest {
  if (!digest || typeof digest !== 'object') {
    return false;
  }

  const d = digest as Record<string, unknown>;

  if (typeof d['hash'] !== 'string' || d['hash'].length === 0) {
    return false;
  }

  if (typeof d['computedAt'] !== 'string') {
    return false;
  }

  const hashes = d['layerHashes'];
  if (!hashes || typeof hashes !== 'object') {
    return false;
  }

  const h = hashes as Record<string, unknown>;
  const requiredLayers = ['events', 'patterns', 'structures', 'mentalModels', 'ceoProfile'];
  for (const layer of requiredLayers) {
    if (typeof h[layer] !== 'string') {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Snapshot Functions
// =============================================================================

/**
 * Create a snapshot of the current brain state
 *
 * Returns the current digest along with metadata useful for checkpoints.
 *
 * @returns Brain snapshot
 */
export function createBrainSnapshot(): {
  digest: BrainDigest;
  snapshotAt: string;
} {
  return {
    digest: computeBrainDigest(),
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Check if brain state matches a snapshot
 *
 * @param snapshotDigest - Digest from a previous snapshot
 * @returns true if current state matches snapshot
 */
export function matchesSnapshot(snapshotDigest: BrainDigest): boolean {
  const current = computeBrainDigest();
  return current.hash === snapshotDigest.hash;
}
