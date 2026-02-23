/**
 * EndiorBot
 *
 * Solo developer tool for enterprise-scale projects:
 * - Claude Code + SDLC Framework automation
 * - Multi-model orchestrator
 * - Project context switching
 * - SDLC gate evaluation
 *
 * @packageDocumentation
 */

export { run } from './cli/index.js';

// Re-export core modules for desktop integration
export * from './sessions/index.js';
export * from './budget/index.js';
export * from './self-correction/index.js';

// Sprint 41: Persistent Fix Logging (file-backed for desktop)
export {
  // FixLogger (async, persistent)
  FixLogger as PersistentFixLogger,
  createFixLogger as createPersistentFixLogger,
  getFixLogger as getPersistentFixLogger,
  resetFixLogger,
  type LogFixParams,
  type FixLoggerConfig as PersistentFixLoggerConfig,
} from './agents/fix-logging/fix-logger.js';

export type {
  WeeklySummary,
  CategorySummary,
  PatternSummary,
  EnhancedFixLogEntry,
} from './agents/fix-logging/types.js';

export const VERSION = '1.0.0';
export const FRAMEWORK_VERSION = '6.1.1';
