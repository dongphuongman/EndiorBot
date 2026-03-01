/**
 * Brain Architecture Types
 *
 * EndiorBot Brain - Persistent, LLM-agnostic knowledge storage
 * Following the "iceberg" 4-layer model.
 *
 * @see ADR-009-Brain-Architecture.md
 */

// =============================================================================
// Brain Version & Digest
// =============================================================================

/**
 * Brain version tracking for checkpoint provenance
 */
export interface BrainVersion {
  /** Semver "1.0.0" or timestamp-based version */
  version: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
  /** Per-layer version counters */
  layerVersions: LayerVersions;
}

export interface LayerVersions {
  events: number;
  patterns: number;
  structures: number;
  mentalModels: number;
}

/**
 * Brain digest for checkpoint integrity
 */
export interface BrainDigest {
  /** SHA-256 hash of combined layer contents */
  hash: string;
  /** ISO 8601 computation timestamp */
  computedAt: string;
  /** Per-layer hashes */
  layerHashes: LayerHashes;
}

export interface LayerHashes {
  events: string;
  patterns: string;
  structures: string;
  mentalModels: string;
  ceoProfile: string;
}

// =============================================================================
// Layer 1: Events
// =============================================================================

/**
 * Raw event entry (session logs, fix attempts, escalations)
 */
export interface EventEntry {
  /** UUID */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type */
  type: EventType;
  /** Reference to session */
  sessionId?: string;
  /** Event-specific data */
  payload: Record<string, unknown>;
}

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'fix_attempt'
  | 'fix_success'
  | 'fix_failure'
  | 'escalation'
  | 'checkpoint_created'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'model_routed'
  | 'budget_warning'
  | 'gate_passed'
  | 'gate_failed'
  | 'brain_evolution';

// =============================================================================
// Layer 2: Patterns
// =============================================================================

/**
 * Recurring pattern entry (errors, fixes, success signatures)
 */
export interface PatternEntry {
  /** UUID */
  id: string;
  /** Error fingerprint or pattern key */
  signature: string;
  /** Pattern type */
  type: PatternType;
  /** Suggested fix hint */
  fixHint?: string;
  /** Occurrence count */
  count: number;
  /** ISO 8601 last occurrence */
  lastSeen: string;
  /** ISO 8601 first occurrence */
  firstSeen: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type PatternType = 'error' | 'fix' | 'success' | 'warning';

// =============================================================================
// Layer 3: Structures
// =============================================================================

/**
 * Project structure entry (module maps, file trees)
 */
export interface StructureEntry {
  /** UUID */
  id: string;
  /** Project identifier */
  projectId: string;
  /** Structure type */
  type: StructureType;
  /** Structure data */
  data: Record<string, unknown>;
  /** ISO 8601 last update */
  updatedAt: string;
}

export type StructureType =
  | 'module_map'
  | 'file_tree'
  | 'dependency_graph'
  | 'api_schema'
  | 'component_tree'
  | 'context_anchor'   // Sprint 65: Context anchoring state
  | 'code_index';       // Sprint 63-64: Code search index

// =============================================================================
// Layer 4: Mental Models
// =============================================================================

/**
 * Decision heuristic entry ("prefer X when Y")
 */
export interface MentalModelEntry {
  /** UUID */
  id: string;
  /** Domain area (e.g., "typescript", "testing") */
  domain: string;
  /** Human-readable rule */
  rule: string;
  /** Source of this model */
  source: MentalModelSource;
  /** Confidence level 0.0 - 1.0 */
  confidence: number;
  /** ISO 8601 last update */
  updatedAt: string;
}

export type MentalModelSource = 'ceo_import' | 'derived' | 'manual';

// =============================================================================
// CEO Profile
// =============================================================================

/**
 * CEO coding style and preferences
 */
export interface CEOProfile {
  /** Code style preferences */
  style: CEOStylePreferences;
  /** Development preferences */
  preferences: CEODevelopmentPreferences;
  /** Naming conventions */
  conventions: CEOConventions;
  /** Additional CEO-specific rules */
  customRules?: string[];
}

export interface CEOStylePreferences {
  indent: 'tabs' | 'spaces';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingComma: 'none' | 'es5' | 'all';
}

export interface CEODevelopmentPreferences {
  testing: 'tdd' | 'bdd' | 'minimal';
  documentation: 'jsdoc' | 'tsdoc' | 'minimal';
  codeReviews: boolean;
  autoFormat: boolean;
}

export interface CEOConventions {
  naming: 'camelCase' | 'snake_case' | 'PascalCase';
  fileNaming: 'kebab-case' | 'camelCase' | 'PascalCase';
  componentStructure: 'flat' | 'nested';
}

// =============================================================================
// Brain Layer IDs
// =============================================================================

export const BRAIN_LAYERS = {
  EVENTS: 'events',
  PATTERNS: 'patterns',
  STRUCTURES: 'structures',
  MENTAL_MODELS: 'mental-models',
} as const;

export type BrainLayerId = (typeof BRAIN_LAYERS)[keyof typeof BRAIN_LAYERS];

// =============================================================================
// Brain Context
// =============================================================================

/**
 * Brain context snapshot for checkpoint restore
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
 * Brain export format
 */
export interface BrainExport {
  exportedAt: string;
  version: BrainVersion;
  digest: BrainDigest;
  layers: {
    events: EventEntry[];
    patterns: PatternEntry[];
    structures: StructureEntry[];
    mentalModels: MentalModelEntry[];
  };
  ceoProfile: CEOProfile;
}

// =============================================================================
// Brain Operations (Input Types)
// =============================================================================

export type CreateEventInput = Omit<EventEntry, 'id' | 'timestamp'>;
export type CreatePatternInput = Omit<PatternEntry, 'id' | 'firstSeen' | 'lastSeen' | 'count'>;
export type CreateStructureInput = Omit<StructureEntry, 'id' | 'updatedAt'>;
export type CreateMentalModelInput = Omit<MentalModelEntry, 'id' | 'updatedAt'>;

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_CEO_PROFILE: CEOProfile = {
  style: {
    indent: 'spaces',
    indentSize: 2,
    quotes: 'single',
    semicolons: true,
    trailingComma: 'es5',
  },
  preferences: {
    testing: 'tdd',
    documentation: 'tsdoc',
    codeReviews: true,
    autoFormat: true,
  },
  conventions: {
    naming: 'camelCase',
    fileNaming: 'kebab-case',
    componentStructure: 'flat',
  },
};

export const DEFAULT_BRAIN_VERSION: BrainVersion = {
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  layerVersions: {
    events: 0,
    patterns: 0,
    structures: 0,
    mentalModels: 0,
  },
};
