/**
 * Code Search Providers
 *
 * Barrel export for all search providers.
 *
 * @module search/providers
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 63
 * @sprint 63
 */

// ============================================================================
// Provider Implementations
// ============================================================================

export { RgProvider, type RgProviderConfig } from "./rg-provider.js";

export {
  AstGrepProvider,
  shouldUseAstGrep,
} from "./ast-grep-provider.js";

// ZoektProvider will be added in Sprint 66-67 (conditional)
