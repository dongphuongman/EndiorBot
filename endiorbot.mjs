#!/usr/bin/env node

/**
 * EndiorBot CLI Entry Point
 *
 * Solo developer tool for enterprise-scale projects:
 * - Claude Code + SDLC Framework automation
 * - Multi-model orchestrator (Claude + GPT + Gemini + Mistral)
 * - Project context switching
 * - SDLC gate evaluation and evidence collection
 *
 * @see https://endiorbot.nqh-internal.example
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if running from built dist or source
const distEntry = join(__dirname, 'dist', 'cli', 'index.js');
const srcEntry = join(__dirname, 'src', 'cli', 'index.ts');

async function main() {
  try {
    if (existsSync(distEntry)) {
      // Production: run from built dist
      const { run } = await import(distEntry);
      await run();
    } else if (existsSync(srcEntry)) {
      // Development: run from source with tsx
      console.log('[EndiorBot] Running in development mode...');
      const { spawn } = await import('node:child_process');
      const child = spawn('node', ['--import', 'tsx', srcEntry, ...process.argv.slice(2)], {
        stdio: 'inherit',
        cwd: __dirname,
      });
      child.on('exit', (code) => process.exit(code ?? 0));
    } else {
      console.error('[EndiorBot] Error: No entry point found.');
      console.error('  Run "pnpm build" to build the project, or');
      console.error('  Run "pnpm dev" for development mode.');
      process.exit(1);
    }
  } catch (error) {
    console.error('[EndiorBot] Fatal error:', error.message);
    process.exit(1);
  }
}

main();
