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
  registerConfigCommand,
  registerCheckpointCommand,
  registerResumeCommand,
  registerQueueCommand,
  registerFixCommand,
  registerFixStatsCommand,
  registerGatewayCommand,
  registerBrainCommand,
  registerEvalCommand,
  registerSetupCommand,
  registerSecretsCommand,
} from "./commands/index.js";
import { getCLILogger, logDebug, logError } from "./logger.js";
import { installGlobalErrorHandlers, formatErrorForCLI } from "../errors/index.js";
import { ensureSecureStateDir } from "../security/secure-fs.js";
import { resolveStateDir } from "../config/paths.js";

const VERSION = "1.0.0";

export async function run(): Promise<void> {
  // Install global error handlers for uncaught exceptions/rejections
  installGlobalErrorHandlers();

  // Ensure state directory exists with secure permissions (0o700)
  // This runs BEFORE any file operations to establish security from first run
  try {
    const stateDir = resolveStateDir();
    ensureSecureStateDir(stateDir);
  } catch {
    // Non-fatal - directory creation will happen on first write
  }

  const program = new Command();

  // Initialize logger based on global options
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    const loggerConfig: Parameters<typeof getCLILogger>[0] = {};
    if (typeof opts.verbose === "boolean") {
      loggerConfig.verbose = opts.verbose;
    }
    if (typeof opts.debug === "boolean") {
      loggerConfig.debug = opts.debug;
    }
    getCLILogger(loggerConfig);
    logDebug("CLI initialized", { version: VERSION, command: thisCommand.name() });
  });

  program
    .name("endiorbot")
    .description("Solo developer tool for enterprise-scale projects")
    .version(VERSION)
    .option("-v, --verbose", "Show verbose output")
    .option("--debug", "Show debug output");

  // Register all commands
  registerStartCommand(program);
  registerSwitchCommand(program);
  registerStatusCommand(program);
  registerGateCommand(program);
  registerConsultCommand(program);
  registerConfigCommand(program);
  registerCheckpointCommand(program);
  registerResumeCommand(program);
  registerQueueCommand(program);
  registerFixCommand(program);
  registerFixStatsCommand(program);
  registerGatewayCommand(program);
  registerBrainCommand(program);
  registerEvalCommand(program);
  registerSetupCommand(program);
  registerSecretsCommand(program);

  await program.parseAsync(process.argv);
}

// Re-export logger utilities for commands
export { getCLILogger, logDebug, logError } from "./logger.js";

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err: Error) => {
    console.error(formatErrorForCLI(err));
    logError("CLI error", err);
    process.exit(1);
  });
}
