/**
 * ToolAwareOrchestrator Tests
 * Sprint 51 - Day 1-2 - Composio Integration Phase 2
 *
 * @module tests/tools/orchestrator
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolAwareOrchestrator,
  createToolAwareOrchestrator,
  type OrchestratorConfig,
  type ToolAwareResponse,
} from '../../src/tools/orchestrator.js';
import type { AIProvider, ChatRequest, ChatResponse } from '../../src/providers/types.js';
import { ToolControlPlane } from '../../src/tools/control-plane.js';
import { ToolRegistry } from '../../src/tools/tool-registry.js';
import { ComposioClient } from '../../src/tools/composio-client.js';

// =============================================================================
// Mock Setup
// =============================================================================

function createMockProvider(): AIProvider {
  return {
    id: 'mock',
    name: 'Mock Provider',
    models: [],
    initialize: vi.fn(),
    dispose: vi.fn(),
    chat: vi.fn(),
    chatStream: vi.fn(),
    healthCheck: vi.fn(),
  };
}

function createMockChatResponse(toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>): ChatResponse {
  return {
    id: 'resp-1',
    model: 'mock-model',
    content: 'Mock response',
    toolCalls,
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: toolCalls ? 'tool_calls' : 'stop',
  };
}

describe('ToolAwareOrchestrator', () => {
  let orchestrator: ToolAwareOrchestrator;
  let mockProvider: AIProvider;
  let controlPlane: ToolControlPlane;
  let toolRegistry: ToolRegistry;
  let composioClient: ComposioClient;

  beforeEach(async () => {
    // Create mock provider
    mockProvider = createMockProvider();

    // Create real ToolControlPlane with mockMode
    composioClient = new ComposioClient({ mockMode: true });
    await composioClient.initialize();

    controlPlane = new ToolControlPlane({
      composioClient: { mockMode: true },
    });
    await controlPlane.initialize();

    toolRegistry = new ToolRegistry(composioClient);

    // Create orchestrator
    orchestrator = createToolAwareOrchestrator({
      provider: mockProvider,
      controlPlane,
      toolRegistry,
      principal_id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  // ===========================================================================
  // Basic Chat
  // ===========================================================================

  describe('Basic Chat', () => {
    it('should pass through non-tool responses', async () => {
      const response = createMockChatResponse();
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      const result = await orchestrator.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.tools_invoked).toBe(false);
      expect(result.tool_calls).toBeUndefined();
      expect(result.content).toBe('Mock response');
    });

    it('should inject tools into request', async () => {
      const response = createMockChatResponse();
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      await orchestrator.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'List my repos' }],
      });

      const chatCall = (mockProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(chatCall.tools).toBeDefined();
      expect(chatCall.tools.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Tool Calls
  // ===========================================================================

  describe('Tool Calls', () => {
    it('should extract tool calls from response', async () => {
      const response = createMockChatResponse([
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'test/repo' },
        },
      ]);
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      const result = await orchestrator.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'Get repo info' }],
      });

      expect(result.tools_invoked).toBe(true);
      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls?.length).toBe(1);
      expect(result.tool_calls?.[0].name).toBe('github.get_repo');
    });

    it('should auto-execute READ tools', async () => {
      const response = createMockChatResponse([
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'test/repo' },
        },
      ]);
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      const result = await orchestrator.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'Get repo info' }],
      });

      expect(result.tool_results).toBeDefined();
      expect(result.tool_results?.length).toBe(1);
      expect(result.tool_results?.[0].success).toBe(true);
    });

    it('should queue WRITE tools for approval', async () => {
      const response = createMockChatResponse([
        {
          id: 'call-1',
          name: 'github.create_issue',
          arguments: { title: 'Test', body: 'Test body' },
        },
      ]);
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      let approvalCalled = false;
      const orchWithCallback = createToolAwareOrchestrator({
        provider: mockProvider,
        controlPlane,
        toolRegistry,
        principal_id: '550e8400-e29b-41d4-a716-446655440000',
        autoExecuteReads: false,
        onApprovalRequired: async () => {
          approvalCalled = true;
        },
      });

      const result = await orchWithCallback.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'Create issue' }],
      });

      expect(result.pending_approvals).toBeDefined();
      expect(approvalCalled).toBe(true);
    });
  });

  // ===========================================================================
  // Tool Availability
  // ===========================================================================

  describe('Tool Availability', () => {
    it('should return available tools', async () => {
      const tools = await orchestrator.getAvailableTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === 'github.get_repo')).toBe(true);
    });

    it('should check specific tool availability', async () => {
      const available = await orchestrator.isToolAvailable('github.get_repo');
      expect(available).toBe(true);

      const notAvailable = await orchestrator.isToolAvailable('unknown.tool');
      expect(notAvailable).toBe(false);
    });
  });

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  describe('Rate Limiting', () => {
    it('should expose rate limit stats', () => {
      const stats = orchestrator.getRateLimitStats();
      expect(stats).toBeDefined();
      expect(stats.toolCounts).toBeDefined();
    });
  });

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  describe('Event Emission', () => {
    it('should emit tool execution events', async () => {
      const events: unknown[] = [];

      const orchWithEvents = createToolAwareOrchestrator({
        provider: mockProvider,
        controlPlane,
        toolRegistry,
        principal_id: '550e8400-e29b-41d4-a716-446655440000',
        onToolExecution: async (event) => {
          events.push(event);
        },
      });

      const response = createMockChatResponse([
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'test/repo' },
        },
      ]);
      (mockProvider.chat as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      await orchWithEvents.chat({
        model: 'mock',
        messages: [{ role: 'user', content: 'Get repo' }],
      });

      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Continuation
  // ===========================================================================

  describe('Continuation', () => {
    it('should continue conversation with tool results', async () => {
      const response1 = createMockChatResponse([
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'test/repo' },
        },
      ]);
      const response2 = createMockChatResponse();
      (mockProvider.chat as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(response1)
        .mockResolvedValueOnce(response2);

      const request: ChatRequest = {
        model: 'mock',
        messages: [{ role: 'user', content: 'Get repo' }],
      };

      const result1 = await orchestrator.chat(request);
      expect(result1.tool_results).toBeDefined();

      const result2 = await orchestrator.continueWithToolResults(
        request,
        result1.tool_results!
      );

      expect(result2).toBeDefined();
    });
  });
});
