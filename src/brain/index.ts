/**
 * Brain Module - Barrel Export
 *
 * EndiorBot Brain - Persistent, LLM-agnostic knowledge storage.
 * 4-layer iceberg model: Events → Patterns → Structures → Mental Models.
 *
 * @see ADR-009-Brain-Architecture.md
 */

// Types
export type {
  BrainContext,
  BrainDigest,
  BrainExport,
  BrainLayerId,
  BrainVersion,
  CEOConventions,
  CEODevelopmentPreferences,
  CEOProfile,
  CEOStylePreferences,
  CreateEventInput,
  CreateMentalModelInput,
  CreatePatternInput,
  CreateStructureInput,
  EventEntry,
  EventType,
  LayerHashes,
  LayerVersions,
  MentalModelEntry,
  MentalModelSource,
  PatternEntry,
  PatternType,
  StructureEntry,
  StructureType,
} from './types.js';

export {
  BRAIN_LAYERS,
  DEFAULT_BRAIN_VERSION,
  DEFAULT_CEO_PROFILE,
} from './types.js';

// Storage
export {
  brainExists,
  BRAIN_BASE_PATH,
  BRAIN_FILES,
  bumpBrainVersion,
  computeBrainDigest,
  computeHash,
  computeLayerHashes,
  ensureBrainDir,
  exportBrain,
  generateId,
  getBrainBasePath,
  getBrainFilePath,
  initializeBrain,
  readBrainJson,
  readBrainJsonOrDefault,
  readBrainVersion,
  readCEOProfile,
  readEvents,
  readMentalModels,
  readPatterns,
  readStructures,
  writeBrainJson,
  writeBrainVersion,
  writeCEOProfile,
  writeEvents,
  writeMentalModels,
  writePatterns,
  writeStructures,
} from './storage.js';

// Layer 1: Events
export {
  appendEvent,
  appendEventRaw,
  clearEvents,
  countEventsByType,
  deleteEventsBefore,
  getAllEvents,
  getEventById,
  getEventCount,
  getEventsBySession,
  getEventsByType,
  getEventsSince,
  getRecentEvents,
  logCheckpointCreated,
  logEscalation,
  logFixAttempt,
  logFixFailure,
  logFixSuccess,
  logModelRouted,
  logSessionEnd,
  logSessionStart,
} from './layers/events.js';
