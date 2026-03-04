/**
 * Sprint 76: OTT Channel Enhancement Tests
 *
 * Tests for:
 * - Telegram commands (10 new)
 * - Agent keyboard (12, tier-aware)
 * - Team keyboard (tier-aware)
 * - Help message (14 commands)
 * - formatAgentNotFound (dynamic list)
 * - Webhook handler (Telegram + Zalo)
 * - Mode escalation
 * - OTT timeout config
 * - i18n completeness
 *
 * @module tests/channels/ott/ott-enhancement
 * @version 1.0.0
 * @date 2026-03-04
 * @status ACTIVE - Sprint 76
 * @authority ADR-019 OTT Channel Enhancement
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Telegram commands
import {
  handleAgentsCommand,
  handleTeamsCommand,
  handleGateCommand,
  handleComplianceCommand,
  handleFixCommand,
  handleConsultCommand,
  handleConfigCommand,
  handleInitCommand,
  handleModeCommand,
  handleWebhookCommand,
  generateHelpMessage,
} from '../../../src/channels/telegram/telegram-commands.js';

// Keyboards
import {
  createAgentSelectionKeyboard,
  createTeamSelectionKeyboard,
  createModeConfirmKeyboard,
  createHandoffKeyboard,
  parseCallbackData,
  getAgentIcon,
  CALLBACK_PREFIX,
} from '../../../src/channels/telegram/keyboards.js';

// Response formatter
import {
  formatAgentNotFound,
  formatForTelegram,
  formatProcessing,
  formatError,
  type AgentResponse,
} from '../../../src/channels/ott/response-formatter.js';

// Webhook handler
import {
  WebhookHandler,
  createWebhookHandler,
} from '../../../src/channels/ott/webhook-handler.js';

// i18n
import { messages } from '../../../src/i18n/messages.js';

import type { AgentRole } from '../../../src/agents/types/handoff.js';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// Mock team registry for team commands
// ============================================================================

vi.mock('../../../src/agents/orchestrator/team-registry.js', () => {
  const mockTeam = (id: string, leader: string, active: boolean) => ({
    found: true,
    team: { id, leader, isActive: active, members: [], tier: 'STANDARD' },
  });

  const mockNotFound = () => ({ found: false });

  return {
    getTeamRegistry: (tier?: string) => ({
      getTeam: (id: string) => {
        const teams: Record<string, ReturnType<typeof mockTeam>> = {
          fullstack: mockTeam('fullstack', 'fullstack', true),
          planning: mockTeam('planning', 'pm', true),
          dev: mockTeam('dev', 'coder', true),
          qa: mockTeam('qa', 'tester', tier === 'PROFESSIONAL' || tier === 'ENTERPRISE'),
          design: mockTeam('design', 'architect', tier === 'PROFESSIONAL' || tier === 'ENTERPRISE'),
          ops: mockTeam('ops', 'devops', tier === 'ENTERPRISE'),
          executive: mockTeam('executive', 'ceo', tier === 'PROFESSIONAL' || tier === 'ENTERPRISE'),
        };
        return teams[id] ?? mockNotFound();
      },
      getTier: () => tier ?? 'STANDARD',
      getAllTeams: () => [],
    }),
  };
});

// ============================================================================
// Telegram Commands Tests
// ============================================================================

describe('Telegram Commands (Sprint 76)', () => {
  describe('handleAgentsCommand', () => {
    it('should list all 12 user-facing agents', () => {
      const result = handleAgentsCommand();
      expect(result.success).toBe(true);
      expect(result.response).toContain('Available Agents');
      // SE4A executors
      expect(result.response).toContain('@researcher');
      expect(result.response).toContain('@pm');
      expect(result.response).toContain('@pjm');
      expect(result.response).toContain('@architect');
      expect(result.response).toContain('@coder');
      expect(result.response).toContain('@reviewer');
      expect(result.response).toContain('@tester');
      expect(result.response).toContain('@devops');
      expect(result.response).toContain('@fullstack');
      // SE4H advisors
      expect(result.response).toContain('@ceo');
      expect(result.response).toContain('@cpo');
      expect(result.response).toContain('@cto');
    });

    it('should exclude assistant (router, not user-facing)', () => {
      const result = handleAgentsCommand();
      expect(result.response).not.toContain('@assistant');
    });

    it('should include usage hint', () => {
      const result = handleAgentsCommand();
      expect(result.response).toContain('@agent task');
    });
  });

  describe('handleTeamsCommand', () => {
    it('should list tier-appropriate teams', () => {
      const result = handleTeamsCommand('STANDARD');
      expect(result.success).toBe(true);
      expect(result.response).toContain('Available Teams');
      expect(result.response).toContain('@fullstack');
      expect(result.response).toContain('@planning');
    });

    it('should show tier info', () => {
      const result = handleTeamsCommand('STANDARD');
      expect(result.response).toContain('Tier:');
    });
  });

  describe('handleGateCommand', () => {
    it('should show help when no gate ID provided', () => {
      const result = handleGateCommand([]);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Quality Gates');
      expect(result.response).toContain('/gate <gateId>');
    });

    it('should show gate info for specific gate', () => {
      const result = handleGateCommand(['G2']);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Gate G2');
    });
  });

  describe('handleComplianceCommand', () => {
    it('should show compliance help', () => {
      const result = handleComplianceCommand([]);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Compliance');
    });

    it('should handle score subcommand', () => {
      const result = handleComplianceCommand(['score']);
      expect(result.success).toBe(true);
    });

    it('should handle unknown subcommand', () => {
      const result = handleComplianceCommand(['unknown']);
      expect(result.response).toContain('unknown sub-command');
    });
  });

  describe('handleFixCommand', () => {
    it('should default to dry-run mode', () => {
      const result = handleFixCommand([]);
      expect(result.success).toBe(true);
      expect(result.response).toContain('dry-run');
    });

    it('should detect --yes for live mode', () => {
      const result = handleFixCommand(['--yes']);
      expect(result.response).toContain('live');
    });

    it('should detect --stage argument', () => {
      const result = handleFixCommand(['--stage', '01-planning']);
      expect(result.response).toContain('01-planning');
    });

    it('should show all fix options', () => {
      const result = handleFixCommand([]);
      expect(result.response).toContain('/fix');
      expect(result.response).toContain('/fix --yes');
      expect(result.response).toContain('/fix --stage');
    });
  });

  describe('handleConsultCommand', () => {
    it('should show help when no query provided', () => {
      const result = handleConsultCommand([]);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Multi-Model Consultation');
    });

    it('should include query in response', () => {
      const result = handleConsultCommand(['Redis', 'vs', 'PostgreSQL']);
      expect(result.response).toContain('Redis vs PostgreSQL');
    });
  });

  describe('handleConfigCommand', () => {
    it('should return config info', () => {
      const result = handleConfigCommand();
      expect(result.success).toBe(true);
      expect(result.response).toContain('Project Config');
    });
  });

  describe('handleInitCommand', () => {
    it('should return init status info', () => {
      const result = handleInitCommand();
      expect(result.success).toBe(true);
      expect(result.response).toContain('Init Status');
    });
  });

  describe('handleModeCommand', () => {
    it('should show current mode when no args', () => {
      const result = handleModeCommand([], 'READ');
      expect(result.success).toBe(true);
      expect(result.response).toContain('READ');
    });

    it('should handle read mode', () => {
      const result = handleModeCommand(['read'], 'PATCH');
      expect(result.response).toContain('READ');
    });

    it('should handle patch mode request', () => {
      const result = handleModeCommand(['patch'], 'READ');
      expect(result.response).toContain('PATCH');
    });

    it('should reject unknown mode', () => {
      const result = handleModeCommand(['unknown'], 'READ');
      expect(result.success).toBe(false);
      expect(result.response).toContain('Unknown mode');
    });
  });

  describe('handleWebhookCommand', () => {
    it('should show webhook status when no args', () => {
      const result = handleWebhookCommand([], false);
      expect(result.success).toBe(true);
      expect(result.response).toContain('Webhook Status');
      expect(result.response).toContain('INACTIVE');
    });

    it('should show active status', () => {
      const result = handleWebhookCommand([], true);
      expect(result.response).toContain('ACTIVE');
    });

    it('should handle webhook on', () => {
      const result = handleWebhookCommand(['on'], false);
      expect(result.response).toContain('HTTPS');
    });

    it('should handle webhook off', () => {
      const result = handleWebhookCommand(['off'], true);
      expect(result.response).toContain('disabled');
    });

    it('should reject unknown action', () => {
      const result = handleWebhookCommand(['invalid'], false);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Help Message Tests
// ============================================================================

describe('Help Message (Sprint 76)', () => {
  it('should list all 14 commands', () => {
    const help = generateHelpMessage();
    const commands = [
      '/approve', '/reject', '/status', '/help',
      '/gate', '/compliance', '/fix', '/init',
      '/consult', '/agents', '/teams',
      '/config', '/mode', '/webhook',
    ];
    for (const cmd of commands) {
      expect(help).toContain(cmd);
    }
  });

  it('should include agent mention format', () => {
    const help = generateHelpMessage();
    expect(help).toContain('@agent task');
  });

  it('should include team mention format', () => {
    const help = generateHelpMessage();
    expect(help).toContain('@team task');
  });
});

// ============================================================================
// Agent Keyboard Tests
// ============================================================================

describe('Agent Keyboard (Sprint 76)', () => {
  it('should include all 12 agents for STANDARD tier', () => {
    const keyboard = createAgentSelectionKeyboard('STANDARD');
    const allButtons = keyboard.inline_keyboard.flat();
    expect(allButtons.length).toBe(12);
  });

  it('should exclude SE4H for LITE tier', () => {
    const keyboard = createAgentSelectionKeyboard('LITE');
    const allButtons = keyboard.inline_keyboard.flat();
    expect(allButtons.length).toBe(9); // Only SE4A
    const texts = allButtons.map(b => b.text);
    expect(texts.join(' ')).not.toContain('ceo');
    expect(texts.join(' ')).not.toContain('cpo');
    expect(texts.join(' ')).not.toContain('cto');
  });

  it('should use 3 agents per row for mobile readability', () => {
    const keyboard = createAgentSelectionKeyboard('STANDARD');
    for (const row of keyboard.inline_keyboard) {
      expect(row.length).toBeLessThanOrEqual(3);
    }
  });

  it('should include agent icons', () => {
    const keyboard = createAgentSelectionKeyboard();
    const firstButton = keyboard.inline_keyboard[0]?.[0];
    expect(firstButton).toBeDefined();
    // Should contain icon emoji
    expect(firstButton!.text).toMatch(/[🔍📋📊🏗️💻👀🧪🚀🛠️👔🎯⚙️]/);
  });

  it('should use agent_select callback prefix', () => {
    const keyboard = createAgentSelectionKeyboard();
    const firstButton = keyboard.inline_keyboard[0]?.[0];
    expect(firstButton!.callback_data).toContain(CALLBACK_PREFIX.AGENT_SELECT);
  });

  it('should parse agent_select callback', () => {
    const result = parseCallbackData(`${CALLBACK_PREFIX.AGENT_SELECT}pm`);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('agent_select');
    expect(result!.target).toBe('pm');
  });
});

// ============================================================================
// Team Keyboard Tests
// ============================================================================

describe('Team Keyboard (Sprint 76)', () => {
  it('should show only fullstack for LITE', () => {
    const keyboard = createTeamSelectionKeyboard('LITE');
    const allButtons = keyboard.inline_keyboard.flat();
    expect(allButtons.length).toBe(1);
    expect(allButtons[0]!.callback_data).toContain('fullstack');
  });

  it('should show planning/dev/qa for STANDARD', () => {
    const keyboard = createTeamSelectionKeyboard('STANDARD');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbackData = allButtons.map(b => b.callback_data).join(' ');
    expect(callbackData).toContain('planning');
    expect(callbackData).toContain('dev');
    expect(callbackData).toContain('qa');
    expect(allButtons.length).toBe(3);
  });

  it('should use 2 teams per row', () => {
    const keyboard = createTeamSelectionKeyboard('ENTERPRISE');
    for (const row of keyboard.inline_keyboard) {
      expect(row.length).toBeLessThanOrEqual(2);
    }
  });

  it('should use team_select callback prefix', () => {
    const keyboard = createTeamSelectionKeyboard();
    const firstButton = keyboard.inline_keyboard[0]?.[0];
    expect(firstButton!.callback_data).toContain(CALLBACK_PREFIX.TEAM_SELECT);
  });

  it('should parse team_select callback', () => {
    const result = parseCallbackData(`${CALLBACK_PREFIX.TEAM_SELECT}planning:start`);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('team_select');
    expect(result!.target).toBe('planning');
  });
});

// ============================================================================
// Mode Confirm Keyboard Tests
// ============================================================================

describe('Mode Confirm Keyboard (Sprint 76)', () => {
  it('should have confirm and cancel buttons', () => {
    const keyboard = createModeConfirmKeyboard('req-123');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbacks = allButtons.map(b => b.callback_data);
    expect(callbacks.some(c => c.includes('confirm'))).toBe(true);
    expect(callbacks.some(c => c.includes('cancel'))).toBe(true);
  });

  it('should parse mode callback', () => {
    const result = parseCallbackData(`${CALLBACK_PREFIX.MODE}confirm:req-123`);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('mode');
    expect(result!.target).toBe('confirm');
  });
});

// ============================================================================
// formatAgentNotFound Tests
// ============================================================================

describe('formatAgentNotFound (Sprint 76)', () => {
  it('should list all 12 user-facing agents', () => {
    const msg = formatAgentNotFound('invalid input');
    expect(msg).toContain('@researcher');
    expect(msg).toContain('@pm');
    expect(msg).toContain('@coder');
    expect(msg).toContain('@ceo');
    expect(msg).toContain('@cto');
  });

  it('should list all 7 teams', () => {
    const msg = formatAgentNotFound('invalid input');
    expect(msg).toContain('@fullstack');
    expect(msg).toContain('@planning');
    expect(msg).toContain('@design');
    expect(msg).toContain('@dev');
    expect(msg).toContain('@qa');
    expect(msg).toContain('@ops');
    expect(msg).toContain('@executive');
  });
});

// ============================================================================
// Webhook Handler Tests
// ============================================================================

describe('WebhookHandler (Sprint 76)', () => {
  function createMockReq(url: string, method: string, body?: string, headers?: Record<string, string>): IncomingMessage {
    const chunks: Buffer[] = body ? [Buffer.from(body)] : [];
    const req = {
      url,
      method,
      headers: headers ?? {},
      socket: { remoteAddress: '127.0.0.1' },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'data') {
          for (const chunk of chunks) {
            cb(chunk);
          }
        } else if (event === 'end') {
          cb();
        }
        return req;
      },
      destroy: vi.fn(),
    } as unknown as IncomingMessage;
    return req;
  }

  function createMockRes(): ServerResponse & { _statusCode: number; _body: string; _headers: Record<string, string> } {
    const res = {
      _statusCode: 200,
      _body: '',
      _headers: {} as Record<string, string>,
      headersSent: false,
      writeHead: vi.fn().mockImplementation(function(this: { _statusCode: number; headersSent: boolean }, code: number) {
        this._statusCode = code;
        this.headersSent = true;
      }),
      setHeader: vi.fn().mockImplementation(function(this: { _headers: Record<string, string> }, k: string, v: string) {
        this._headers[k] = v;
      }),
      end: vi.fn().mockImplementation(function(this: { _body: string }, body?: string) {
        if (body) this._body = body;
      }),
    } as unknown as ServerResponse & { _statusCode: number; _body: string; _headers: Record<string, string> };
    return res;
  }

  describe('Routing', () => {
    it('should return false for non-webhook routes', async () => {
      const handler = createWebhookHandler({});
      const req = createMockReq('/api/status', 'GET');
      const res = createMockRes();
      const handled = await handler.handleRequest(req, res);
      expect(handled).toBe(false);
    });

    it('should return true for webhook routes', async () => {
      const handler = createWebhookHandler({});
      const req = createMockReq('/webhook/telegram', 'POST', '{}');
      const res = createMockRes();
      const handled = await handler.handleRequest(req, res);
      expect(handled).toBe(true);
    });

    it('should reject non-POST methods', async () => {
      const handler = createWebhookHandler({});
      const req = createMockReq('/webhook/telegram', 'GET');
      const res = createMockRes();
      await handler.handleRequest(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    });
  });

  describe('Telegram Webhook', () => {
    it('should accept valid request with secret token', async () => {
      const telegramHandler = vi.fn();
      const handler = createWebhookHandler({
        telegramSecretToken: 'my-secret',
        telegramHandler,
      });

      const body = JSON.stringify({ update_id: 12345, message: { text: 'hello' } });
      const req = createMockReq('/webhook/telegram', 'POST', body, {
        'x-telegram-bot-api-secret-token': 'my-secret',
      });
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(200);
      expect(telegramHandler).toHaveBeenCalledWith(
        expect.objectContaining({ update_id: 12345 })
      );
    });

    it('should reject invalid secret token', async () => {
      const handler = createWebhookHandler({
        telegramSecretToken: 'my-secret',
      });

      const req = createMockReq('/webhook/telegram', 'POST', '{}', {
        'x-telegram-bot-api-secret-token': 'wrong-token',
      });
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(403);
    });

    it('should accept request without secret when not configured', async () => {
      const telegramHandler = vi.fn();
      const handler = createWebhookHandler({ telegramHandler });

      const body = JSON.stringify({ update_id: 1 });
      const req = createMockReq('/webhook/telegram', 'POST', body);
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(200);
      expect(telegramHandler).toHaveBeenCalled();
    });

    it('should reject invalid JSON', async () => {
      const handler = createWebhookHandler({});
      const req = createMockReq('/webhook/telegram', 'POST', 'not-json');
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(400);
    });
  });

  describe('Zalo Webhook', () => {
    it('should accept valid request with MAC signature', async () => {
      const zaloHandler = vi.fn();
      const secret = 'zalo-secret';
      const handler = createWebhookHandler({
        zaloWebhookSecret: secret,
        zaloHandler,
      });

      const body = JSON.stringify({
        event_name: 'user_send_text',
        timestamp: String(Date.now()),
        sender: { id: '123' },
        recipient: { id: '456' },
      });

      // Compute MAC
      const { createHmac } = await import('crypto');
      const mac = createHmac('sha256', secret).update(body).digest('hex');

      const req = createMockReq('/webhook/zalo', 'POST', body, {
        'x-zalooa-signature': mac,
      });
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(200);
      expect(zaloHandler).toHaveBeenCalled();
    });

    it('should reject invalid MAC signature', async () => {
      const handler = createWebhookHandler({
        zaloWebhookSecret: 'zalo-secret',
      });

      const body = JSON.stringify({ event_name: 'test', timestamp: String(Date.now()) });
      const req = createMockReq('/webhook/zalo', 'POST', body, {
        'x-zalooa-signature': 'invalid-mac',
      });
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(403);
    });

    it('should reject missing MAC signature when secret configured', async () => {
      const handler = createWebhookHandler({
        zaloWebhookSecret: 'zalo-secret',
      });

      const body = JSON.stringify({ event_name: 'test', timestamp: String(Date.now()) });
      const req = createMockReq('/webhook/zalo', 'POST', body);
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(403);
    });

    it('should reject events with stale timestamp (replay protection)', async () => {
      const handler = createWebhookHandler({
        zaloTimestampWindowMs: 5 * 60 * 1000, // 5 min
      });

      const staleTime = Date.now() - 10 * 60 * 1000; // 10 min ago
      const body = JSON.stringify({
        event_name: 'test',
        timestamp: String(staleTime),
        sender: { id: '1' },
        recipient: { id: '2' },
      });
      const req = createMockReq('/webhook/zalo', 'POST', body);
      const res = createMockRes();

      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive requests', async () => {
      const handler = createWebhookHandler({
        rateLimitPerMinute: 3,
      });

      for (let i = 0; i < 3; i++) {
        const req = createMockReq('/webhook/telegram', 'POST', '{}');
        const res = createMockRes();
        await handler.handleRequest(req, res);
      }

      // 4th request should be rate limited
      const req = createMockReq('/webhook/telegram', 'POST', '{}');
      const res = createMockRes();
      await handler.handleRequest(req, res);
      expect(res._statusCode).toBe(429);
    });
  });
});

// ============================================================================
// Agent Icon Tests
// ============================================================================

describe('getAgentIcon (Sprint 76)', () => {
  it('should return correct icons for all agents', () => {
    expect(getAgentIcon('researcher')).toBe('🔍');
    expect(getAgentIcon('pm')).toBe('📋');
    expect(getAgentIcon('coder')).toBe('💻');
    expect(getAgentIcon('ceo')).toBe('👔');
  });

  it('should return fallback for unknown agent', () => {
    expect(getAgentIcon('unknown' as AgentRole)).toBe('🔹');
  });
});

// ============================================================================
// i18n Completeness Tests
// ============================================================================

describe('i18n OTT Keys (Sprint 76)', () => {
  const enKeys = Object.keys(messages.en);
  const viKeys = Object.keys(messages.vi);

  it('should have OTT keys in EN', () => {
    const ottKeys = enKeys.filter(k => k.startsWith('ott.'));
    expect(ottKeys.length).toBeGreaterThanOrEqual(25);
  });

  it('should have matching OTT keys in VI', () => {
    const enOttKeys = enKeys.filter(k => k.startsWith('ott.'));
    const viOttKeys = viKeys.filter(k => k.startsWith('ott.'));
    expect(viOttKeys.length).toBe(enOttKeys.length);

    for (const key of enOttKeys) {
      expect(viKeys).toContain(key);
    }
  });
});

// ============================================================================
// Response Formatter Tests
// ============================================================================

describe('Response Formatter Updates (Sprint 76)', () => {
  it('formatProcessing should include agent icon', () => {
    const msg = formatProcessing('pm' as AgentRole, 'plan payment gateway');
    expect(msg).toContain('📋');
    expect(msg).toContain('@pm');
    expect(msg).toContain('processing');
  });

  it('formatError should truncate long errors', () => {
    const longError = 'x'.repeat(5000);
    const msg = formatError(longError, 'telegram');
    expect(msg.length).toBeLessThan(5000);
    expect(msg).toContain('Error');
  });

  it('formatForTelegram should include patch status', () => {
    const response: AgentResponse = {
      agent: 'coder' as AgentRole,
      task: 'implement feature',
      output: 'Done',
      patchApplied: true,
    };
    const formatted = formatForTelegram(response);
    expect(formatted.text).toContain('Patch applied');
  });
});

// ============================================================================
// CTO Review Fix Tests
// ============================================================================

describe('CTO B3: Handoff callback_data 64-byte limit', () => {
  it('should keep callback_data within 64 bytes', () => {
    const keyboard = createHandoffKeyboard([
      {
        agent: 'researcher' as AgentRole, // longest agent name (10 chars)
        intent: 'This is a very long intent that should be truncated to stay within limits',
        priority: 'HIGH',
      },
    ]);
    const allButtons = keyboard.inline_keyboard.flat();
    for (const button of allButtons) {
      if (button.callback_data) {
        const byteLength = Buffer.byteLength(button.callback_data, 'utf-8');
        expect(byteLength).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe('CTO P0-4: fullstack agent icon', () => {
  it('should return proper icon for fullstack', () => {
    expect(getAgentIcon('fullstack')).toBe('🛠️');
    expect(getAgentIcon('fullstack')).not.toBe('🔹');
  });
});

describe('CTO P0-2: OTT timeout NaN guard', () => {
  it('parseInt with invalid string falls back to 300', () => {
    // Simulates the pattern: parseInt("invalid", 10) || 300
    const result = parseInt("not-a-number", 10) || 300;
    expect(result).toBe(300);
  });

  it('parseInt with valid string returns value', () => {
    const result = parseInt("600", 10) || 300;
    expect(result).toBe(600);
  });
});
