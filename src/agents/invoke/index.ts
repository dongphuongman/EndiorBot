/**
 * Invoke Module - Barrel Export
 *
 * Claude Code invocation and response handling.
 *
 * @module agents/invoke
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

// Claude Code Bridge
export {
  ClaudeCodeBridge,
  getClaudeCodeBridge,
  resetClaudeCodeBridge,
  createClaudeCodeBridge,
  promptConfirmation,
  createPatchConfirmCallback,
  type InvokeMode,
  type InvokeRequest,
  type ClaudeResponse,
  type PatchResponse,
  type BridgeConfig,
  DEFAULT_BRIDGE_CONFIG,
} from "./claude-code-bridge.js";

// Patch Validator
export {
  PatchValidator,
  createPatchValidator,
  validatePatch,
  type PatchValidation,
  type PatchRisk,
  type ValidatorConfig,
  DEFAULT_VALIDATOR_CONFIG,
} from "./patch-validator.js";

// Response Parser
export {
  ResponseParser,
  getResponseParser,
  resetResponseParser,
  createResponseParser,
  parseResponse,
  hasHandoff,
  extractFirstHandoff,
  type ParsedResponse,
  type CodeBlock,
  type ParserConfig,
  DEFAULT_PARSER_CONFIG,
} from "./response-parser.js";
