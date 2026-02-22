/**
 * CLI Commands Module
 *
 * Exports all CLI command registrations.
 *
 * @module cli/commands
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Implementation
 * @authority ADR-006 CLI Architecture
 * @pillar 2 - Sprint Governance
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

export { registerStartCommand } from "./start.js";
export { registerSwitchCommand } from "./switch.js";
export { registerStatusCommand } from "./status.js";
export { registerGateCommand } from "./gate.js";
export { registerConsultCommand } from "./consult.js";
