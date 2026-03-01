/**
 * Context Module - Barrel Export
 *
 * Context injection for Claude Code prompts.
 *
 * @module agents/context
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

// Context Manifest
export {
  type ContextManifest,
  type ContextItem,
  type ContextTier,
  type ContextSource,
  type ManifestBuilderOptions,
  buildManifest,
  createContextItem,
  estimateTokens,
  formatManifestLog,
  getOptionsForComplexity,
  DEFAULT_MANIFEST_OPTIONS,
} from "./context-manifest.js";

// Context Injector
export {
  ContextInjector,
  getContextInjector,
  resetContextInjector,
  createContextInjector,
  type InjectionConfig,
  type InjectionRequest,
  type InjectionResult,
  DEFAULT_INJECTION_CONFIG,
} from "./context-injector.js";

// Project Verifier
export {
  ProjectVerifier,
  getProjectVerifier,
  resetProjectVerifier,
  createProjectVerifier,
  verifyProject,
  type ProjectTier,
  type SDLCConfig,
  type GitStatus,
  type VerificationResult,
  type VerifierConfig,
  DEFAULT_VERIFIER_CONFIG,
} from "./project-verifier.js";
