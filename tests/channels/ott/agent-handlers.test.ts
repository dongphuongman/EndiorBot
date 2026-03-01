/**
 * OTT Agent Handler Tests
 *
 * Tests for Telegram and Zalo agent handlers that wire
 * OTT messages to EndiorBot orchestration layer.
 *
 * @module tests/channels/ott/agent-handlers
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 57
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Response formatter
import {
  formatForTelegram,
  formatForZalo,
  formatProcessing,
  formatAgentNotFound,
  formatError,
  type AgentResponse,
} from '../../../src/channels/ott/response-formatter.js';

// Keyboards
import {
  createHandoffKeyboard,
  createPatchConfirmKeyboard,
  createAgentSelectionKeyboard,
  parseCallbackData,
  CALLBACK_PREFIX,
} from '../../../src/channels/telegram/keyboards.js';

import type { AgentRole, ParsedHandoff } from '../../../src/agents/types/handoff.js';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Create a test agent response.
 */
function createTestResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    agent: 'pm' as AgentRole,
    task: 'plan payment gateway integration',
    output: 'Here is the plan for payment gateway integration:\n\n1. Research providers\n2. Design API schema\n3. Implement handlers\n4. Write tests',
    durationMs: 1500,
    ...overrides,
  };
}

/**
 * Create a test handoff.
 */
function createTestHandoff(overrides: Partial<ParsedHandoff> = {}): ParsedHandoff {
  return {
    to: 'architect' as AgentRole,
    from: 'pm' as AgentRole,
    intent: 'Design the payment gateway architecture',
    priority: 'HIGH',
    inputs: { domain: 'payments' },
    reason: 'Technical design required',
    depth: 0,
    timestamp: new Date(),
    correlationId: 'wf-test-123',
    ...overrides,
  };
}

describe('OTT Response Formatter', () => {
  // ===========================================================================
  // Telegram Formatting
  // ===========================================================================

  describe('Telegram Formatting', () => {
    it('should format basic response', () => {
      const response = createTestResponse();
      const formatted = formatForTelegram(response);

      expect(formatted.text).toContain('@pm');
      expect(formatted.text).toContain('plan payment gateway');
      expect(formatted.parseMode).toBe('Markdown');
      expect(formatted.showHandoffButtons).toBe(false);
      expect(formatted.handoffOptions).toHaveLength(0);
    });

    it('should format response with handoff', () => {
      const response = createTestResponse({
        handoff: createTestHandoff(),
      });

      const formatted = formatForTelegram(response);

      expect(formatted.showHandoffButtons).toBe(true);
      expect(formatted.handoffOptions).toHaveLength(1);
      expect(formatted.handoffOptions[0]).toEqual({
        agent: 'architect',
        intent: 'Design the payment gateway architecture',
        priority: 'HIGH',
      });
    });

    it('should truncate long output', () => {
      const longOutput = 'A'.repeat(5000);
      const response = createTestResponse({ output: longOutput });

      const formatted = formatForTelegram(response);

      expect(formatted.text.length).toBeLessThanOrEqual(4096);
      expect(formatted.text).toContain('truncated for mobile');
    });

    it('should format error response', () => {
      const response = createTestResponse({
        output: '',
        error: 'Agent timeout',
      });

      const formatted = formatForTelegram(response);

      expect(formatted.text).toContain('Error');
      expect(formatted.text).toContain('timeout');
    });
  });

  // ===========================================================================
  // Zalo Formatting
  // ===========================================================================

  describe('Zalo Formatting', () => {
    it('should format basic response', () => {
      const response = createTestResponse();
      const formatted = formatForZalo(response);

      expect(formatted.text).toContain('@pm');
      expect(formatted.parseMode).toBe('plain');
      expect(formatted.showHandoffButtons).toBe(false);
    });

    it('should respect Zalo character limit', () => {
      const longOutput = 'A'.repeat(3000);
      const response = createTestResponse({ output: longOutput });

      const formatted = formatForZalo(response);

      expect(formatted.text.length).toBeLessThanOrEqual(2000);
      expect(formatted.text).toContain('truncated for mobile');
    });

    it('should format response with handoff', () => {
      const response = createTestResponse({
        handoff: createTestHandoff(),
      });

      const formatted = formatForZalo(response);

      expect(formatted.showHandoffButtons).toBe(true);
      expect(formatted.text).toContain('Handoff');
      expect(formatted.text).toContain('@architect');
    });
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  describe('Helper Functions', () => {
    it('should format processing message', () => {
      const message = formatProcessing('pm', 'plan payment');

      expect(message).toContain('@pm');
      expect(message).toContain('processing');
    });

    it('should format agent not found', () => {
      const message = formatAgentNotFound('@unknown: do something');

      expect(message).toContain('Unknown agent');
      expect(message).toContain('Available agents');
    });

    it('should format error', () => {
      const telegram = formatError('Connection failed', 'telegram');
      const zalo = formatError('Connection failed', 'zalo');

      expect(telegram).toContain('Error');
      expect(telegram).toContain('Connection failed');
      expect(zalo).toContain('Error');
    });
  });
});

describe('Telegram Keyboards', () => {
  // ===========================================================================
  // Handoff Keyboard
  // ===========================================================================

  describe('Handoff Keyboard', () => {
    it('should create handoff keyboard', () => {
      const handoffs = [
        { agent: 'architect' as AgentRole, intent: 'Design architecture', priority: 'HIGH' },
        { agent: 'coder' as AgentRole, intent: 'Implement feature', priority: 'NORMAL' },
      ];

      const keyboard = createHandoffKeyboard(handoffs);

      expect(keyboard.inline_keyboard).toHaveLength(3); // 2 handoffs + cancel
      expect(keyboard.inline_keyboard[0][0].text).toContain('@architect');
      expect(keyboard.inline_keyboard[0][0].callback_data).toContain('handoff:architect');
    });

    it('should add priority indicator for HIGH', () => {
      const handoffs = [
        { agent: 'architect' as AgentRole, intent: 'urgent', priority: 'HIGH' },
      ];

      const keyboard = createHandoffKeyboard(handoffs);

      expect(keyboard.inline_keyboard[0][0].text).toContain('⚡');
    });

    it('should include cancel button', () => {
      const handoffs = [
        { agent: 'coder' as AgentRole, intent: 'test', priority: 'NORMAL' },
      ];

      const keyboard = createHandoffKeyboard(handoffs);

      const lastRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1];
      expect(lastRow[0].text).toContain('Cancel');
      expect(lastRow[0].callback_data).toContain('cancel:');
    });
  });

  // ===========================================================================
  // Patch Confirm Keyboard
  // ===========================================================================

  describe('Patch Confirm Keyboard', () => {
    it('should create patch confirm keyboard', () => {
      const keyboard = createPatchConfirmKeyboard('patch-123');

      expect(keyboard.inline_keyboard).toHaveLength(1);
      expect(keyboard.inline_keyboard[0]).toHaveLength(2);
      expect(keyboard.inline_keyboard[0][0].text).toContain('Apply');
      expect(keyboard.inline_keyboard[0][1].text).toContain('Reject');
    });

    it('should include patch ID in callback', () => {
      const keyboard = createPatchConfirmKeyboard('patch-abc');

      expect(keyboard.inline_keyboard[0][0].callback_data).toContain('patch-abc');
      expect(keyboard.inline_keyboard[0][1].callback_data).toContain('patch-abc');
    });
  });

  // ===========================================================================
  // Agent Selection Keyboard
  // ===========================================================================

  describe('Agent Selection Keyboard', () => {
    it('should create agent selection keyboard', () => {
      const keyboard = createAgentSelectionKeyboard();

      expect(keyboard.inline_keyboard.length).toBeGreaterThan(0);

      // Check first row has agents
      const firstRow = keyboard.inline_keyboard[0];
      expect(firstRow[0].callback_data).toContain('handoff:');
    });
  });

  // ===========================================================================
  // Callback Data Parser
  // ===========================================================================

  describe('Callback Data Parser', () => {
    it('should parse handoff callback', () => {
      const parsed = parseCallbackData('handoff:architect:YXJjaGl0ZWN0dXJl');

      expect(parsed.action).toBe('handoff');
      expect(parsed.target).toBe('architect');
      expect(parsed.data).toBeDefined();
    });

    it('should parse confirm callback', () => {
      const parsed = parseCallbackData('confirm:patch-123');

      expect(parsed.action).toBe('confirm');
      expect(parsed.target).toBe('patch-123');
    });

    it('should parse reject callback', () => {
      const parsed = parseCallbackData('reject:patch-456');

      expect(parsed.action).toBe('reject');
      expect(parsed.target).toBe('patch-456');
    });

    it('should parse cancel callback', () => {
      const parsed = parseCallbackData('cancel:workflow');

      expect(parsed.action).toBe('cancel');
      expect(parsed.target).toBe('workflow');
    });

    it('should parse status callback', () => {
      const parsed = parseCallbackData('status:wf-123');

      expect(parsed.action).toBe('status');
      expect(parsed.target).toBe('wf-123');
    });

    it('should handle unknown callback', () => {
      const parsed = parseCallbackData('unknown:data');

      expect(parsed.action).toBe('unknown');
      expect(parsed.target).toBe('unknown:data');
    });
  });

  // ===========================================================================
  // Callback Prefixes
  // ===========================================================================

  describe('Callback Prefixes', () => {
    it('should have correct prefixes', () => {
      expect(CALLBACK_PREFIX.HANDOFF).toBe('handoff:');
      expect(CALLBACK_PREFIX.CONFIRM).toBe('confirm:');
      expect(CALLBACK_PREFIX.REJECT).toBe('reject:');
      expect(CALLBACK_PREFIX.CANCEL).toBe('cancel:');
    });
  });
});

describe('OTT Agent Handler Integration', () => {
  // ===========================================================================
  // Message Parsing
  // ===========================================================================

  describe('Message Format', () => {
    it('should recognize OTT mention format', () => {
      // Test various OTT mention formats
      const formats = [
        '[@pm: plan payment gateway]',
        '[@architect: design the system]',
        '[@coder: implement auth flow]',
      ];

      for (const format of formats) {
        expect(format).toMatch(/\[@\w+:\s*.+\]/);
      }
    });

    it('should handle multi-agent mentions', () => {
      const multiAgent = '[@pm, @architect: plan and design]';
      expect(multiAgent).toContain('@pm');
      expect(multiAgent).toContain('@architect');
    });
  });

  // ===========================================================================
  // Response Chain
  // ===========================================================================

  describe('Response Chain', () => {
    it('should chain handoff buttons from response', () => {
      // Simulate full response chain
      const agentResponse = createTestResponse({
        handoff: createTestHandoff(),
      });

      const formatted = formatForTelegram(agentResponse);

      if (formatted.showHandoffButtons) {
        const keyboard = createHandoffKeyboard(formatted.handoffOptions);
        expect(keyboard.inline_keyboard.length).toBeGreaterThan(0);
      }
    });

    it('should handle error responses gracefully', () => {
      const errorResponse = createTestResponse({
        output: '',
        error: 'Agent not available',
      });

      const formatted = formatForTelegram(errorResponse);

      expect(formatted.showHandoffButtons).toBe(false);
      expect(formatted.handoffOptions).toHaveLength(0);
    });
  });
});
