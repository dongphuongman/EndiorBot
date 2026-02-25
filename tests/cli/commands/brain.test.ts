/**
 * Brain CLI Tests
 *
 * Tests for brain CLI commands.
 *
 * @module tests/cli/commands/brain
 * @version 1.0.0
 * @date 2026-02-24
 * @status ACTIVE - Sprint 45 Day 9
 * @authority ADR-009 Brain Architecture
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerBrainCommand } from '../../../src/cli/commands/brain.js';
import { appendEvent } from '../../../src/brain/layers/events.js';
import { addPattern } from '../../../src/brain/layers/patterns.js';
import { setModel } from '../../../src/brain/layers/mental-models.js';
import { setStructure } from '../../../src/brain/layers/structures.js';
import { initializeBrain, brainExists } from '../../../src/brain/storage.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_BRAIN_PATH = join(tmpdir(), 'endiorbot-brain-cli-test', `brain-${Date.now()}`);

/**
 * Create a test program with brain commands.
 */
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  registerBrainCommand(program);
  return program;
}

// ============================================================================
// Tests
// ============================================================================

describe('Brain Command', () => {
  let consoleOutput: string[] = [];
  let consoleErrorOutput: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    process.env['ENDIORBOT_BRAIN_PATH'] = TEST_BRAIN_PATH;
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }

    // Capture console output
    consoleOutput = [];
    consoleErrorOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    if (existsSync(TEST_BRAIN_PATH)) {
      rmSync(TEST_BRAIN_PATH, { recursive: true, force: true });
    }
    delete process.env['ENDIORBOT_BRAIN_PATH'];

    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // ===========================================================================
  // Command Registration
  // ===========================================================================

  describe('Command Registration', () => {
    it('should register brain command', () => {
      const program = createTestProgram();
      const brainCmd = program.commands.find((cmd) => cmd.name() === 'brain');

      expect(brainCmd).toBeDefined();
    });

    it('should register subcommands', () => {
      const program = createTestProgram();
      const brainCmd = program.commands.find((cmd) => cmd.name() === 'brain');
      const subcommands = brainCmd?.commands.map((cmd) => cmd.name());

      expect(subcommands).toContain('status');
      expect(subcommands).toContain('export');
      expect(subcommands).toContain('layers');
      expect(subcommands).toContain('init');
    });
  });

  // ===========================================================================
  // Init Command
  // ===========================================================================

  describe('brain init', () => {
    it('should initialize brain storage', async () => {
      const program = createTestProgram();

      expect(brainExists()).toBe(false);

      await program.parseAsync(['node', 'test', 'brain', 'init']);

      expect(brainExists()).toBe(true);
      expect(consoleOutput.join('\n')).toContain('Brain initialized successfully');
    });

    it('should warn if already initialized', async () => {
      initializeBrain();
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'init']);

      expect(consoleOutput.join('\n')).toContain('already initialized');
    });
  });

  // ===========================================================================
  // Status Command
  // ===========================================================================

  describe('brain status', () => {
    it('should show not initialized when brain does not exist', async () => {
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'status']);

      expect(consoleOutput.join('\n')).toContain('not initialized');
    });

    it('should show brain status', async () => {
      initializeBrain();
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'status']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Brain Status');
      expect(output).toContain('healthy');
      expect(output).toContain('Layers:');
    });

    it('should show layer counts', async () => {
      initializeBrain();
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'session_end', payload: {} });
      addPattern({ signature: 'test-pattern', type: 'error' });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'status']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Events:');
      expect(output).toContain('2 entries');
      expect(output).toContain('1 patterns');
    });
  });

  // ===========================================================================
  // Export Command
  // ===========================================================================

  describe('brain export', () => {
    it('should fail when brain not initialized', async () => {
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'export']);

      expect(consoleOutput.join('\n')).toContain('not initialized');
    });

    it('should export brain to default path', async () => {
      initializeBrain();
      appendEvent({ type: 'test', payload: {} });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'export']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Brain exported successfully');
      expect(output).toContain('Output:');
    });

    it('should export brain to specified path', async () => {
      initializeBrain();
      const outputPath = join(TEST_BRAIN_PATH, 'test-export.json');

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'export', '-o', outputPath]);

      expect(existsSync(outputPath)).toBe(true);
      const output = consoleOutput.join('\n');
      expect(output).toContain('Brain exported successfully');
      expect(output).toContain(outputPath);
    });
  });

  // ===========================================================================
  // Layers Command
  // ===========================================================================

  describe('brain layers', () => {
    it('should fail when brain not initialized', async () => {
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'layers']);

      expect(consoleOutput.join('\n')).toContain('not initialized');
    });

    it('should list all layers with counts', async () => {
      initializeBrain();
      appendEvent({ type: 'test', payload: {} });
      addPattern({ signature: 'test', type: 'error' });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'layers']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Brain Layers:');
      expect(output).toContain('events');
      expect(output).toContain('patterns');
      expect(output).toContain('structures');
      expect(output).toContain('mental-models');
    });

    it('should show events layer entries', async () => {
      initializeBrain();
      appendEvent({ type: 'session_start', payload: {} });
      appendEvent({ type: 'fix_attempt', payload: { error: 'test' } });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'layers', 'events']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Events Layer');
      expect(output).toContain('session_start');
      expect(output).toContain('fix_attempt');
    });

    it('should show patterns layer entries', async () => {
      initializeBrain();
      addPattern({ signature: 'TypeError: null', type: 'error', fixHint: 'Check for null' });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'layers', 'patterns']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Patterns Layer');
      expect(output).toContain('error');
      expect(output).toContain('TypeError');
    });

    it('should show structures layer entries', async () => {
      initializeBrain();
      setStructure('project-1', 'module_map', { modules: ['src'] });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'layers', 'structures']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Structures Layer');
      expect(output).toContain('module_map');
      expect(output).toContain('project-1');
    });

    it('should show mental-models layer entries', async () => {
      initializeBrain();
      setModel({
        domain: 'formatting',
        rule: 'Use 2 spaces for indentation',
        source: 'ceo',
        confidence: 0.9,
      });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'brain', 'layers', 'mental-models']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Mental Models Layer');
      expect(output).toContain('formatting');
      expect(output).toContain('90%');
    });

    it('should handle unknown layer', async () => {
      initializeBrain();
      const program = createTestProgram();

      await program.parseAsync(['node', 'test', 'brain', 'layers', 'unknown']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('Unknown layer');
    });
  });
});
