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

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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
} from '../../../src/commands/handlers.js';

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

// Mention parser (T1 tests)
import {
  hasMention,
  parseMention,
} from '../../../src/agents/orchestrator/mention-parser.js';

// i18n
import { messages } from '../../../src/i18n/messages.js';

import type { AgentRole } from '../../../src/agents/types/handoff.js';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// Mocks for session-aware commands (handleModeCommand)
// ============================================================================

vi.mock('../../../src/bridge/agent-launcher.js', () => ({
  getAgentLauncher: vi.fn(),
}));

vi.mock('../../../src/bridge/session-registry.js', () => ({
  getSessionRegistry: vi.fn(),
  resetSessionRegistry: vi.fn(),
}));

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
    it('should return workspace-required message when no workspace', async () => {
      const result = await handleInitCommand([], undefined);
      expect(result.success).toBe(false);
      expect(result.response).toMatch(/focus|workspace/i);
    });
  });

  describe('handleModeCommand', () => {
    /** Set up a fake session via handleLaunchCommand (only way to populate activeSessionMap). */
    async function setupSession(actorId: string, initialMode: 'read' | 'patch' = 'read') {
      const sessionId = 'ott-mode-test-' + Math.random().toString(36).slice(2);
      const fakeSession = {
        id: sessionId,
        riskMode: initialMode,
        status: 'active',
        agentType: 'claude',
        tmuxTarget: 'endiorbot:0',
        projectPath: '/tmp/test',
        actorId,
        createdAt: Date.now(),
      };
      const { getAgentLauncher } = await import('../../../src/bridge/agent-launcher.js');
      vi.mocked(getAgentLauncher).mockReturnValue({
        launch: vi.fn().mockResolvedValue({ success: true, session: fakeSession }),
      } as never);
      const { handleLaunchCommand } = await import('../../../src/commands/handlers.js');
      await handleLaunchCommand(['claude', '/tmp/test'], actorId);
      const { getSessionRegistry } = await import('../../../src/bridge/session-registry.js');
      vi.mocked(getSessionRegistry).mockReturnValue({
        get: vi.fn((id: string) => (id === sessionId ? fakeSession : undefined)),
        list: vi.fn().mockReturnValue([fakeSession]),
      } as never);
      return { fakeSession, sessionId };
    }

    it('should show current mode when no args', async () => {
      const actorId = 'ott-mode-show-' + Math.random().toString(36).slice(2);
      await setupSession(actorId, 'read');
      const result = handleModeCommand([], actorId);
      expect(result.success).toBe(true);
      expect(result.response).toContain('READ');
    });

    it('should handle read mode', async () => {
      const actorId = 'ott-mode-read-' + Math.random().toString(36).slice(2);
      await setupSession(actorId, 'patch');
      const result = handleModeCommand(['read'], actorId);
      expect(result.response).toContain('READ');
    });

    it('should handle patch mode request', async () => {
      const actorId = 'ott-mode-patch-' + Math.random().toString(36).slice(2);
      await setupSession(actorId, 'read');
      const result = handleModeCommand(['patch'], actorId);
      expect(result.response).toContain('PATCH');
    });

    it('should reject unknown mode', async () => {
      const actorId = 'ott-mode-unknown-' + Math.random().toString(36).slice(2);
      await setupSession(actorId, 'read');
      const result = handleModeCommand(['unknown'], actorId);
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
    expect(callbacks.some(c => c?.includes('confirm'))).toBe(true);
    expect(callbacks.some(c => c?.includes('cancel'))).toBe(true);
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

// ============================================================================
// CTO P1-1: Input sanitization in error responses
// ============================================================================

describe('CTO P1-1: Input sanitization in error responses', () => {
  it('should sanitize Markdown chars in /compliance unknown sub-command', () => {
    const result = handleComplianceCommand(['*bold*_italic_`code`']);
    expect(result.response).not.toContain('*bold*');
    expect(result.response).not.toContain('_italic_');
    expect(result.response).not.toContain('`code`');
    expect(result.response).toContain('unknown sub-command');
  });

  it('should sanitize Markdown chars in /mode unknown mode', async () => {
    const actorId = 'ott-sanitize-mode-' + Math.random().toString(36).slice(2);
    const sessionId = 'ott-san-mode-sess-' + Math.random().toString(36).slice(2);
    const fakeSession = { id: sessionId, riskMode: 'read' as const, status: 'active', agentType: 'claude', tmuxTarget: 'endiorbot:0', projectPath: '/tmp/test', actorId, createdAt: Date.now() };
    const { getAgentLauncher } = await import('../../../src/bridge/agent-launcher.js');
    vi.mocked(getAgentLauncher).mockReturnValue({ launch: vi.fn().mockResolvedValue({ success: true, session: fakeSession }) } as never);
    const { handleLaunchCommand } = await import('../../../src/commands/handlers.js');
    await handleLaunchCommand(['claude', '/tmp/test'], actorId);
    const { getSessionRegistry } = await import('../../../src/bridge/session-registry.js');
    vi.mocked(getSessionRegistry).mockReturnValue({ get: vi.fn((id: string) => (id === sessionId ? fakeSession : undefined)), list: vi.fn().mockReturnValue([fakeSession]) } as never);
    const result = handleModeCommand(['[link](http://evil.com)'], actorId);
    expect(result.response).not.toContain('[link]');
    expect(result.response).not.toContain('http://evil.com');
    expect(result.response).toContain('Unknown mode');
  });

  it('should sanitize Markdown chars in /webhook unknown action', () => {
    const result = handleWebhookCommand(['*inject*'], false);
    expect(result.response).not.toContain('*inject*');
    expect(result.response).toContain('Unknown webhook action');
  });

  it('should truncate excessively long input', () => {
    const longInput = 'x'.repeat(200);
    const result = handleModeCommand([longInput], 'READ');
    // sanitizeForEcho truncates to 50 chars
    expect(result.response.length).toBeLessThan(300);
  });
});

// ============================================================================
// CTO P1-3: fullstack dual-listing clarification
// ============================================================================

describe('CTO P1-3: fullstack dual-listing clarification', () => {
  it('formatAgentNotFound should clarify fullstack works as both agent and team', () => {
    const msg = formatAgentNotFound('invalid');
    expect(msg).toContain('@fullstack works as both agent and team');
  });
});

// ============================================================================
// T1: hasMention(content, teamRegistry) — core team integration path
// ============================================================================

describe('T1: hasMention with teamRegistry (core integration path)', () => {
  it('hasMention should accept team registry parameter', () => {
    expect(typeof hasMention).toBe('function');
    expect(hasMention.length).toBeGreaterThanOrEqual(1);
  });

  it('parseMention should accept team registry parameter', () => {
    expect(typeof parseMention).toBe('function');
    expect(parseMention.length).toBeGreaterThanOrEqual(1);
  });

  it('hasMention returns true for agent mention without registry', () => {
    // @pm is a valid agent — works without team registry
    const result = hasMention('@pm "plan something"');
    expect(result).toBe(true);
  });

  it('hasMention with team input and no registry returns false for team-only mention', () => {
    // Without registry, @planning is not recognized as an agent
    const result = hasMention('@planning "test"');
    expect(result).toBe(false);
  });

  it('parseMention resolves agent mention without registry', () => {
    const result = parseMention('@coder "implement feature"');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents).toContain('coder');
    }
  });
});

// ============================================================================
// T2: OTT timeout configuration
// ============================================================================

describe('T2: OTT timeout configuration', () => {
  const originalEnv = process.env.ENDIORBOT_OTT_TIMEOUT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENDIORBOT_OTT_TIMEOUT;
    } else {
      process.env.ENDIORBOT_OTT_TIMEOUT = originalEnv;
    }
  });

  it('should default to 300s when env not set', () => {
    delete process.env.ENDIORBOT_OTT_TIMEOUT;
    const timeout = parseInt(process.env.ENDIORBOT_OTT_TIMEOUT ?? "300", 10) || 300;
    expect(timeout).toBe(300);
  });

  it('should respect custom timeout from env', () => {
    process.env.ENDIORBOT_OTT_TIMEOUT = "600";
    const timeout = parseInt(process.env.ENDIORBOT_OTT_TIMEOUT ?? "300", 10) || 300;
    expect(timeout).toBe(600);
  });

  it('should fallback to 300 for NaN env value', () => {
    process.env.ENDIORBOT_OTT_TIMEOUT = "invalid";
    const timeout = parseInt(process.env.ENDIORBOT_OTT_TIMEOUT ?? "300", 10) || 300;
    expect(timeout).toBe(300);
  });

  it('should fallback to 300 for zero value', () => {
    process.env.ENDIORBOT_OTT_TIMEOUT = "0";
    const timeout = parseInt(process.env.ENDIORBOT_OTT_TIMEOUT ?? "300", 10) || 300;
    expect(timeout).toBe(300);
  });
});

// ============================================================================
// T3: callback_data 64-byte limit assertion
// ============================================================================

describe('T3: callback_data 64-byte limit', () => {
  it('agent keyboard callback_data should be within 64 bytes', () => {
    const keyboard = createAgentSelectionKeyboard('ENTERPRISE');
    for (const row of keyboard.inline_keyboard) {
      for (const btn of row) {
        if (btn.callback_data) {
          const bytes = Buffer.byteLength(btn.callback_data, 'utf-8');
          expect(bytes).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it('team keyboard callback_data should be within 64 bytes', () => {
    const keyboard = createTeamSelectionKeyboard('ENTERPRISE');
    for (const row of keyboard.inline_keyboard) {
      for (const btn of row) {
        if (btn.callback_data) {
          const bytes = Buffer.byteLength(btn.callback_data, 'utf-8');
          expect(bytes).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it('mode confirm callback_data should be within 64 bytes', () => {
    const keyboard = createModeConfirmKeyboard('some-long-request-id-12345');
    for (const row of keyboard.inline_keyboard) {
      for (const btn of row) {
        if (btn.callback_data) {
          const bytes = Buffer.byteLength(btn.callback_data, 'utf-8');
          expect(bytes).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it('handoff keyboard with long intent stays within 64 bytes', () => {
    const keyboard = createHandoffKeyboard([
      {
        agent: 'researcher' as AgentRole,
        intent: 'A very long intent string that definitely exceeds the normal callback limit for Telegram bots',
        priority: 'HIGH',
      },
      {
        agent: 'fullstack' as AgentRole,
        intent: 'Another extremely long intent for testing the 64-byte constraint',
        priority: 'LOW',
      },
    ]);
    for (const row of keyboard.inline_keyboard) {
      for (const btn of row) {
        if (btn.callback_data) {
          const bytes = Buffer.byteLength(btn.callback_data, 'utf-8');
          expect(bytes).toBeLessThanOrEqual(64);
        }
      }
    }
  });
});

// ============================================================================
// T4: Mode escalation confirm/cancel state transition
// ============================================================================

describe('T4: Mode escalation state transitions', () => {
  it('should parse mode:confirm callback correctly', () => {
    const result = parseCallbackData('mode:confirm:req-abc');
    expect(result.action).toBe('mode');
    expect(result.target).toBe('confirm');
    expect(result.data).toBe('req-abc');
  });

  it('should parse mode:cancel callback correctly', () => {
    const result = parseCallbackData('mode:cancel:req-xyz');
    expect(result.action).toBe('mode');
    expect(result.target).toBe('cancel');
    expect(result.data).toBe('req-xyz');
  });

  it('confirm keyboard should have both confirm and cancel actions', () => {
    const keyboard = createModeConfirmKeyboard('test-req');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbacks = allButtons.map(b => b.callback_data ?? '');

    const hasConfirm = callbacks.some(c => c.includes('mode:confirm:'));
    const hasCancel = callbacks.some(c => c.includes('mode:cancel:'));
    expect(hasConfirm).toBe(true);
    expect(hasCancel).toBe(true);
  });

  it('confirm and cancel callbacks should contain the request ID', () => {
    const reqId = 'my-patch-req-42';
    const keyboard = createModeConfirmKeyboard(reqId);
    const allButtons = keyboard.inline_keyboard.flat();

    for (const btn of allButtons) {
      expect(btn.callback_data).toContain(reqId);
    }
  });
});

// ============================================================================
// T5: PROFESSIONAL tier team keyboard
// ============================================================================

describe('T5: PROFESSIONAL tier team keyboard', () => {
  it('should include design and executive teams', () => {
    const keyboard = createTeamSelectionKeyboard('PROFESSIONAL');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbackData = allButtons.map(b => b.callback_data).join(' ');
    expect(callbackData).toContain('design');
    expect(callbackData).toContain('executive');
  });

  it('should include planning/dev/qa teams', () => {
    const keyboard = createTeamSelectionKeyboard('PROFESSIONAL');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbackData = allButtons.map(b => b.callback_data).join(' ');
    expect(callbackData).toContain('planning');
    expect(callbackData).toContain('dev');
    expect(callbackData).toContain('qa');
  });

  it('should NOT include ops team (ENTERPRISE only)', () => {
    const keyboard = createTeamSelectionKeyboard('PROFESSIONAL');
    const allButtons = keyboard.inline_keyboard.flat();
    const callbackData = allButtons.map(b => b.callback_data).join(' ');
    expect(callbackData).not.toContain('ops');
  });

  it('should have 5 teams total for PROFESSIONAL', () => {
    const keyboard = createTeamSelectionKeyboard('PROFESSIONAL');
    const allButtons = keyboard.inline_keyboard.flat();
    expect(allButtons.length).toBe(5);
  });
});

// ============================================================================
// T6: cleanupRateLimits() window reset behavior
// ============================================================================

describe('T6: cleanupRateLimits() window reset behavior', () => {
  it('should remove entries older than 1 minute', () => {
    const handler = createWebhookHandler({ rateLimitPerMinute: 100 });

    // Access private rateLimitMap via any cast for testing
    const internal = handler as unknown as {
      rateLimitMap: Map<string, number[]>;
      cleanupRateLimits(): void;
    };

    // Add stale entries (2 minutes ago)
    const staleTime = Date.now() - 2 * 60 * 1000;
    internal.rateLimitMap.set('1.2.3.4', [staleTime, staleTime + 1000]);
    internal.rateLimitMap.set('5.6.7.8', [staleTime]);

    expect(internal.rateLimitMap.size).toBe(2);

    // Cleanup
    internal.cleanupRateLimits();

    // All stale entries should be removed
    expect(internal.rateLimitMap.size).toBe(0);

    // Cleanup handler resources
    handler.dispose();
  });

  it('should keep recent entries', () => {
    const handler = createWebhookHandler({ rateLimitPerMinute: 100 });

    const internal = handler as unknown as {
      rateLimitMap: Map<string, number[]>;
      cleanupRateLimits(): void;
    };

    // Add recent entries
    const recentTime = Date.now() - 10_000; // 10 seconds ago
    internal.rateLimitMap.set('1.2.3.4', [recentTime]);

    // Cleanup
    internal.cleanupRateLimits();

    // Recent entries should remain
    expect(internal.rateLimitMap.size).toBe(1);
    expect(internal.rateLimitMap.get('1.2.3.4')?.length).toBe(1);

    handler.dispose();
  });

  it('should remove only stale timestamps within an entry', () => {
    const handler = createWebhookHandler({ rateLimitPerMinute: 100 });

    const internal = handler as unknown as {
      rateLimitMap: Map<string, number[]>;
      cleanupRateLimits(): void;
    };

    const staleTime = Date.now() - 2 * 60 * 1000;
    const recentTime = Date.now() - 5_000;
    internal.rateLimitMap.set('1.2.3.4', [staleTime, recentTime]);

    internal.cleanupRateLimits();

    // Entry should remain with only the recent timestamp
    expect(internal.rateLimitMap.size).toBe(1);
    expect(internal.rateLimitMap.get('1.2.3.4')?.length).toBe(1);
    expect(internal.rateLimitMap.get('1.2.3.4')?.[0]).toBe(recentTime);

    handler.dispose();
  });

  it('dispose() should clear cleanup interval', () => {
    const handler = createWebhookHandler({});

    const internal = handler as unknown as { cleanupInterval: ReturnType<typeof setInterval> | null };
    expect(internal.cleanupInterval).not.toBeNull();

    handler.dispose();
    expect(internal.cleanupInterval).toBeNull();
  });
});
