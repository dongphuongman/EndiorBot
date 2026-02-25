/**
 * Brain Storage
 *
 * File-based storage for EndiorBot Brain at ~/.endiorbot/brain/
 *
 * @see ADR-009-Brain-Architecture.md
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

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
import { DEFAULT_BRAIN_VERSION, DEFAULT_CEO_PROFILE } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Base path for brain storage */
export const BRAIN_BASE_PATH = join(homedir(), '.endiorbot', 'brain');

/** File names for brain data */
export const BRAIN_FILES = {
  VERSION: 'version.json',
  EVENTS: 'events.json',
  PATTERNS: 'patterns.json',
  STRUCTURES: 'structures.json',
  MENTAL_MODELS: 'mental-models.json',
  CEO_PROFILE: 'ceo-profile.json',
} as const;

// =============================================================================
// Directory Management
// =============================================================================

/**
 * Get the brain base path (supports override via env)
 */
export function getBrainBasePath(): string {
  const envPath = process.env['ENDIORBOT_BRAIN_PATH'];
  return envPath ?? BRAIN_BASE_PATH;
}

/**
 * Get full path to a brain file
 */
export function getBrainFilePath(filename: string): string {
  return join(getBrainBasePath(), filename);
}

/**
 * Ensure brain directory exists
 */
export function ensureBrainDir(): void {
  const basePath = getBrainBasePath();
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }
}

/**
 * Check if brain storage exists
 */
export function brainExists(): boolean {
  const versionPath = getBrainFilePath(BRAIN_FILES.VERSION);
  return existsSync(versionPath);
}

// =============================================================================
// JSON Read/Write
// =============================================================================

/**
 * Read JSON file from brain storage
 * @throws Error if file doesn't exist or is invalid JSON
 */
export function readBrainJson<T>(filename: string): T {
  const filePath = getBrainFilePath(filename);
  if (!existsSync(filePath)) {
    throw new Error(`Brain file not found: ${filename}`);
  }
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Read JSON file from brain storage with default value
 */
export function readBrainJsonOrDefault<T>(filename: string, defaultValue: T): T {
  try {
    return readBrainJson<T>(filename);
  } catch {
    return defaultValue;
  }
}

/**
 * Write JSON file to brain storage (atomic write)
 */
export function writeBrainJson<T>(filename: string, data: T): void {
  ensureBrainDir();
  const filePath = getBrainFilePath(filename);

  // Ensure parent directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to temp file, then rename
  const tempPath = `${filePath}.tmp`;
  const content = JSON.stringify(data, null, 2);
  writeFileSync(tempPath, content, 'utf-8');

  // Rename is atomic on most filesystems
  renameSync(tempPath, filePath);
}

// =============================================================================
// Version Management
// =============================================================================

/**
 * Read brain version
 */
export function readBrainVersion(): BrainVersion {
  return readBrainJsonOrDefault(BRAIN_FILES.VERSION, {
    ...DEFAULT_BRAIN_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Write brain version
 */
export function writeBrainVersion(version: BrainVersion): void {
  writeBrainJson(BRAIN_FILES.VERSION, version);
}

/**
 * Bump brain version (increments layer version and updates timestamp)
 */
export function bumpBrainVersion(layerId: BrainLayerId): BrainVersion {
  const current = readBrainVersion();
  const layerKey = layerIdToKey(layerId);

  const updated: BrainVersion = {
    ...current,
    updatedAt: new Date().toISOString(),
    layerVersions: {
      ...current.layerVersions,
      [layerKey]: current.layerVersions[layerKey] + 1,
    },
  };

  writeBrainVersion(updated);
  return updated;
}

/**
 * Convert layer ID to version key
 */
function layerIdToKey(
  layerId: BrainLayerId
): keyof BrainVersion['layerVersions'] {
  const mapping: Record<string, keyof BrainVersion['layerVersions']> = {
    events: 'events',
    patterns: 'patterns',
    structures: 'structures',
    'mental-models': 'mentalModels',
  };
  return mapping[layerId] ?? 'events';
}

// =============================================================================
// Layer Storage
// =============================================================================

/**
 * Read events layer
 */
export function readEvents(): EventEntry[] {
  return readBrainJsonOrDefault<EventEntry[]>(BRAIN_FILES.EVENTS, []);
}

/**
 * Write events layer
 */
export function writeEvents(events: EventEntry[]): void {
  writeBrainJson(BRAIN_FILES.EVENTS, events);
}

/**
 * Read patterns layer
 */
export function readPatterns(): PatternEntry[] {
  return readBrainJsonOrDefault<PatternEntry[]>(BRAIN_FILES.PATTERNS, []);
}

/**
 * Write patterns layer
 */
export function writePatterns(patterns: PatternEntry[]): void {
  writeBrainJson(BRAIN_FILES.PATTERNS, patterns);
}

/**
 * Read structures layer
 */
export function readStructures(): StructureEntry[] {
  return readBrainJsonOrDefault<StructureEntry[]>(BRAIN_FILES.STRUCTURES, []);
}

/**
 * Write structures layer
 */
export function writeStructures(structures: StructureEntry[]): void {
  writeBrainJson(BRAIN_FILES.STRUCTURES, structures);
}

/**
 * Read mental models layer
 */
export function readMentalModels(): MentalModelEntry[] {
  return readBrainJsonOrDefault<MentalModelEntry[]>(
    BRAIN_FILES.MENTAL_MODELS,
    []
  );
}

/**
 * Write mental models layer
 */
export function writeMentalModels(models: MentalModelEntry[]): void {
  writeBrainJson(BRAIN_FILES.MENTAL_MODELS, models);
}

/**
 * Read CEO profile
 */
export function readCEOProfile(): CEOProfile {
  return readBrainJsonOrDefault<CEOProfile>(
    BRAIN_FILES.CEO_PROFILE,
    DEFAULT_CEO_PROFILE
  );
}

/**
 * Write CEO profile
 */
export function writeCEOProfile(profile: CEOProfile): void {
  writeBrainJson(BRAIN_FILES.CEO_PROFILE, profile);
}

// =============================================================================
// Digest Computation
// =============================================================================

/**
 * Compute hash of content
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Compute layer hashes
 */
export function computeLayerHashes(): LayerHashes {
  const events = readEvents();
  const patterns = readPatterns();
  const structures = readStructures();
  const mentalModels = readMentalModels();
  const ceoProfile = readCEOProfile();

  return {
    events: computeHash(JSON.stringify(events)),
    patterns: computeHash(JSON.stringify(patterns)),
    structures: computeHash(JSON.stringify(structures)),
    mentalModels: computeHash(JSON.stringify(mentalModels)),
    ceoProfile: computeHash(JSON.stringify(ceoProfile)),
  };
}

/**
 * Compute brain digest
 */
export function computeBrainDigest(): BrainDigest {
  const layerHashes = computeLayerHashes();
  const combinedContent = Object.values(layerHashes).join('');
  const hash = computeHash(combinedContent);

  return {
    hash,
    computedAt: new Date().toISOString(),
    layerHashes,
  };
}

// =============================================================================
// Brain Export
// =============================================================================

/**
 * Export entire brain to a single object
 */
export function exportBrain(): BrainExport {
  return {
    exportedAt: new Date().toISOString(),
    version: readBrainVersion(),
    digest: computeBrainDigest(),
    layers: {
      events: readEvents(),
      patterns: readPatterns(),
      structures: readStructures(),
      mentalModels: readMentalModels(),
    },
    ceoProfile: readCEOProfile(),
  };
}

/**
 * Initialize brain storage with default values
 */
export function initializeBrain(): void {
  ensureBrainDir();

  // Initialize version if not exists
  if (!brainExists()) {
    writeBrainVersion({
      ...DEFAULT_BRAIN_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Initialize layers with empty arrays if not exists
  const eventsPath = getBrainFilePath(BRAIN_FILES.EVENTS);
  if (!existsSync(eventsPath)) {
    writeEvents([]);
  }

  const patternsPath = getBrainFilePath(BRAIN_FILES.PATTERNS);
  if (!existsSync(patternsPath)) {
    writePatterns([]);
  }

  const structuresPath = getBrainFilePath(BRAIN_FILES.STRUCTURES);
  if (!existsSync(structuresPath)) {
    writeStructures([]);
  }

  const mentalModelsPath = getBrainFilePath(BRAIN_FILES.MENTAL_MODELS);
  if (!existsSync(mentalModelsPath)) {
    writeMentalModels([]);
  }

  // Initialize CEO profile with defaults if not exists
  const ceoProfilePath = getBrainFilePath(BRAIN_FILES.CEO_PROFILE);
  if (!existsSync(ceoProfilePath)) {
    writeCEOProfile(DEFAULT_CEO_PROFILE);
  }
}

// =============================================================================
// UUID Generation
// =============================================================================

/**
 * Generate a simple UUID v4
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
