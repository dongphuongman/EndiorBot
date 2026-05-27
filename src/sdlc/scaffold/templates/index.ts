/**
 * Template Generators Index
 *
 * @module sdlc/scaffold/templates
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

export {
  generateSdlcConfig,
  serializeSdlcConfig,
  generateMinimalConfig,
} from "./sdlc-config.js";

export { generateClaudeMd, generateSubdirClaudeMd } from "./claude-md.js";

export { generateIdentityMd } from "./identity-md.js";

export {
  generateAgentsMd,
  getAllAgents,
  getAgentById,
} from "./agents-md.js";
