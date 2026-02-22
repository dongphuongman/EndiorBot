/**
 * EndiorBot CLI
 *
 * Solo developer tool for enterprise-scale projects.
 * Provides commands for project management, SDLC gates, and AI consultation.
 *
 * @module cli
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Phase 6 Implementation
 * @authority ADR-006 CLI Architecture
 * @pillar 2 - Sprint Governance
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { Command } from "commander";
import {
  registerStartCommand,
  registerSwitchCommand,
  registerStatusCommand,
  registerGateCommand,
  registerConsultCommand,
} from "./commands/index.js";

const VERSION = "1.0.0";

export async function run(): Promise<void> {
  const program = new Command();

  program
    .name("endiorbot")
    .description("Solo developer tool for enterprise-scale projects")
    .version(VERSION);

  // Register all commands
  registerStartCommand(program);
  registerSwitchCommand(program);
  registerStatusCommand(program);
  registerGateCommand(program);
  registerConsultCommand(program);

  await program.parseAsync(process.argv);
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
