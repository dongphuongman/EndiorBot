# Sprint 51 Implementation Guide - Composio Integration Phase 2

**Version**: 1.0.0
**Date**: 2026-02-27
**Status**: PLANNED (After Sprint 50)
**Stage**: 04 - BUILD
**Authority**: CTO
**SDLC**: Framework 6.1.1

---

## Overview

Sprint 51 implements **Composio Integration Phase 2: Integration & Advanced Features** - building on the security foundation from Sprint 50 to enable AI-driven tool execution with CEO approval via OTT channels.

**Key Deliverables**:
1. ToolAwareOrchestrator (provider integration)
2. Evaluator toolEffectiveness dimension (5% weight)
3. CEO approval via OTT (Telegram/Zalo)
4. Brain Layer 2 pattern recognition
5. Mental models for tool preferences

---

## Prerequisites

Before starting Sprint 51:

- [ ] Sprint 50 complete (Composio Phase 1)
- [ ] ToolControlPlane operational
- [ ] 10 tools executing with policy enforcement
- [ ] OAuth connections working (GitHub, Gmail)
- [ ] All 3,200+ tests passing
- [ ] G-Sprint-50 gate PASS

---

## Architecture Overview

### Phase 2 Integration Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     Provider Layer                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Anthropic  │    │   OpenAI    │    │   Gemini    │         │
│  │  Provider   │    │  Provider   │    │  Provider   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────┐                       │
│              │  ToolAwareOrchestrator  │ ◄── NEW (Phase 2)     │
│              └───────────┬─────────────┘                       │
│                          │                                     │
│         ┌────────────────┼────────────────┐                    │
│         │                │                │                    │
│         ▼                ▼                ▼                    │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐              │
│  │  Extract   │  │ ToolControl  │  │  Return   │              │
│  │ tool_calls │  │    Plane     │  │  Result   │              │
│  └────────────┘  └──────────────┘  └───────────┘              │
│                          │                                     │
│                          ▼                                     │
│              ┌─────────────────────────┐                       │
│              │    CEO Approval Flow    │ ◄── NEW (Phase 2)     │
│              │    (Telegram/Zalo)      │                       │
│              └─────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Day 1-3: ToolAwareOrchestrator

### Concept

The ToolAwareOrchestrator wraps providers + Composio, intercepting `tool_calls` from AI responses and routing them through ToolControlPlane for policy enforcement.

**Key Principle**: Providers return `tool_calls` as **proposals only**. Execution happens separately via ToolControlPlane.

### Implementation

**File**: `src/tools/orchestrator.ts`

```typescript
/**
 * ToolAwareOrchestrator - Wraps provider + Composio for tool-aware conversations
 * Phase 2: Provider integration without modifying BaseProvider
 */

import type { ChatRequest, ChatResponse } from '../providers/types.js';
import type { BaseProvider } from '../providers/base-provider.js';
import { ToolControlPlane } from './control-plane.js';
import { ToolRegistry } from './tool-registry.js';
import type { Tool, ToolCall, ToolResult, PolicyDecision } from './types.js';

interface OrchestratorConfig {
  provider: BaseProvider;
  controlPlane: ToolControlPlane;
  toolRegistry: ToolRegistry;
  principal_id: string;
  autoExecuteReads?: boolean;  // Default: true
  onApprovalRequired?: (decision: PolicyDecision) => Promise<void>;
}

interface ToolAwareResponse extends ChatResponse {
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  pending_approvals?: PolicyDecision[];
}

export class ToolAwareOrchestrator {
  private provider: BaseProvider;
  private controlPlane: ToolControlPlane;
  private toolRegistry: ToolRegistry;
  private principal_id: string;
  private autoExecuteReads: boolean;
  private onApprovalRequired?: (decision: PolicyDecision) => Promise<void>;

  constructor(config: OrchestratorConfig) {
    this.provider = config.provider;
    this.controlPlane = config.controlPlane;
    this.toolRegistry = config.toolRegistry;
    this.principal_id = config.principal_id;
    this.autoExecuteReads = config.autoExecuteReads ?? true;
    this.onApprovalRequired = config.onApprovalRequired;
  }

  /**
   * Send chat request with tool awareness
   * Injects available tools, handles tool_calls in response
   */
  async chat(request: ChatRequest): Promise<ToolAwareResponse> {
    // 1. Get available tools for this principal
    const tools = await this.toolRegistry.discoverTools(this.principal_id);

    // 2. Inject tools into request (provider-specific format)
    const toolAwareRequest = this.injectTools(request, tools);

    // 3. Send to provider
    const response = await this.provider.chat(toolAwareRequest);

    // 4. Extract tool_calls from response (if any)
    const toolCalls = this.extractToolCalls(response);

    if (toolCalls.length === 0) {
      return response;
    }

    // 5. Process each tool call through ToolControlPlane
    const results: ToolResult[] = [];
    const pendingApprovals: PolicyDecision[] = [];

    for (const toolCall of toolCalls) {
      const decision = await this.controlPlane.evaluate(
        toolCall.name,
        toolCall.arguments,
        this.principal_id
      );

      if (decision.action === 'allow' && this.autoExecuteReads) {
        // Auto-execute READ tools
        const result = await this.controlPlane.execute(
          toolCall.name,
          toolCall.arguments,
          this.principal_id
        );
        results.push(result);
      } else if (decision.action === 'require_approval') {
        // Queue for approval
        pendingApprovals.push(decision);
        if (this.onApprovalRequired) {
          await this.onApprovalRequired(decision);
        }
      } else {
        // Denied
        results.push({
          id: toolCall.id,
          success: false,
          error: { code: 'DENIED', message: decision.reason },
          duration_ms: 0,
        });
      }
    }

    return {
      ...response,
      tool_calls: toolCalls,
      tool_results: results,
      pending_approvals: pendingApprovals,
    };
  }

  /**
   * Continue conversation with tool results
   */
  async continueWithToolResults(
    originalRequest: ChatRequest,
    toolResults: ToolResult[]
  ): Promise<ToolAwareResponse> {
    // Add tool results to conversation
    const messagesWithResults = [
      ...originalRequest.messages,
      {
        role: 'tool' as const,
        content: JSON.stringify(toolResults),
      },
    ];

    return this.chat({
      ...originalRequest,
      messages: messagesWithResults,
    });
  }

  private injectTools(request: ChatRequest, tools: Tool[]): ChatRequest {
    // Convert Composio tools to provider-specific format
    const providerTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.convertParameters(tool.parameters),
    }));

    return {
      ...request,
      tools: providerTools,
    };
  }

  private extractToolCalls(response: ChatResponse): ToolCall[] {
    // Extract tool_use blocks from Anthropic response
    // or function_call from OpenAI response
    const toolCalls: ToolCall[] = [];

    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        toolCalls.push({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          principal_id: this.principal_id,
        });
      }
    }

    return toolCalls;
  }

  private convertParameters(parameters: unknown[]): Record<string, unknown> {
    // Convert Composio parameters to JSON Schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of parameters as Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
    }>) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }
}
```

### Gateway Integration

**File**: `src/gateway/methods/chat.ts` (update)

```typescript
/**
 * Update chat methods to use ToolAwareOrchestrator
 */

import { ToolAwareOrchestrator } from '../../tools/orchestrator.js';

export function registerChatMethods(server: GatewayServer): void {
  server.registerMethod('chat.send', async (params, clientInfo) => {
    const { message, sessionId, model, enableTools } = params as ChatSendParams;

    // Get provider
    const provider = await getActiveProvider(model);

    // If tools enabled, use ToolAwareOrchestrator
    if (enableTools) {
      const orchestrator = new ToolAwareOrchestrator({
        provider,
        controlPlane,
        toolRegistry,
        principal_id: clientInfo.principal_id,
        autoExecuteReads: true,
        onApprovalRequired: async (decision) => {
          // Send to OTT channel for CEO approval
          await sendApprovalRequest(decision, clientInfo);
        },
      });

      const response = await orchestrator.chat({
        messages: [{ role: 'user', content: message }],
        model,
      });

      return {
        id: crypto.randomUUID(),
        content: response.content,
        model: response.model,
        tool_calls: response.tool_calls,
        tool_results: response.tool_results,
        pending_approvals: response.pending_approvals,
      };
    }

    // Regular chat without tools
    const response = await provider.chat({
      messages: [{ role: 'user', content: message }],
      model,
    });

    return {
      id: crypto.randomUUID(),
      content: response.content,
      model: response.model,
    };
  });
}
```

---

## Day 4-5: Evaluator Integration

### Concept

Add `toolEffectiveness` dimension to Evaluator with 5% weight (per CTO requirement).

### Weight Renormalization

```typescript
// BEFORE (Sprint 50)
export const DEFAULT_WEIGHTS: DimensionWeights = {
  correctness: 0.30,
  relevance: 0.25,
  coherence: 0.15,
  creativity: 0.10,
  safety: 0.10,
  efficiency: 0.10,
};

// AFTER (Sprint 51)
export const DEFAULT_WEIGHTS: DimensionWeights = {
  correctness: 0.25,      // -0.05
  relevance: 0.25,        // unchanged
  coherence: 0.15,        // unchanged
  creativity: 0.10,       // unchanged
  safety: 0.10,           // unchanged
  efficiency: 0.10,       // unchanged
  toolEffectiveness: 0.05, // NEW
};
```

### Implementation

**File**: `src/evaluator/dimensions/tool-effectiveness.ts`

```typescript
/**
 * Tool Effectiveness Dimension
 * Evaluates how well AI selects and uses tools
 * Weight: 5% (added in Sprint 51)
 */

import type { EvaluationContext, DimensionScore } from '../types.js';

export interface ToolEffectivenessMetrics {
  toolSelectionAccuracy: number;   // Was the right tool chosen?
  argumentCorrectness: number;      // Were arguments valid?
  executionSuccess: number;         // Did execution succeed?
  resultUtilization: number;        // Was result used effectively?
}

export async function evaluateToolEffectiveness(
  context: EvaluationContext
): Promise<DimensionScore> {
  const { response, toolCalls, toolResults } = context;

  // No tools used - neutral score
  if (!toolCalls || toolCalls.length === 0) {
    return {
      dimension: 'toolEffectiveness',
      score: 0.5,
      confidence: 0.3,
      reason: 'No tools were used in this response',
    };
  }

  const metrics = calculateMetrics(toolCalls, toolResults, response);
  const score = calculateScore(metrics);

  return {
    dimension: 'toolEffectiveness',
    score,
    confidence: 0.8,
    reason: generateReason(metrics),
    metadata: metrics,
  };
}

function calculateMetrics(
  toolCalls: unknown[],
  toolResults: unknown[],
  response: unknown
): ToolEffectivenessMetrics {
  const totalCalls = toolCalls.length;
  const successfulCalls = (toolResults as Array<{ success: boolean }>).filter(
    (r) => r.success
  ).length;

  return {
    toolSelectionAccuracy: 0.8, // TODO: ML-based evaluation
    argumentCorrectness: successfulCalls / totalCalls,
    executionSuccess: successfulCalls / totalCalls,
    resultUtilization: 0.7, // TODO: Check if results referenced in response
  };
}

function calculateScore(metrics: ToolEffectivenessMetrics): number {
  const weights = {
    toolSelectionAccuracy: 0.25,
    argumentCorrectness: 0.30,
    executionSuccess: 0.30,
    resultUtilization: 0.15,
  };

  return (
    metrics.toolSelectionAccuracy * weights.toolSelectionAccuracy +
    metrics.argumentCorrectness * weights.argumentCorrectness +
    metrics.executionSuccess * weights.executionSuccess +
    metrics.resultUtilization * weights.resultUtilization
  );
}

function generateReason(metrics: ToolEffectivenessMetrics): string {
  const reasons: string[] = [];

  if (metrics.executionSuccess >= 0.9) {
    reasons.push('High tool execution success rate');
  }
  if (metrics.argumentCorrectness >= 0.9) {
    reasons.push('Accurate tool arguments');
  }
  if (metrics.toolSelectionAccuracy < 0.7) {
    reasons.push('Could improve tool selection');
  }

  return reasons.join('. ') || 'Tool usage was adequate';
}
```

### Evaluator Update

**File**: `src/evaluator/index.ts` (update)

```typescript
import { evaluateToolEffectiveness } from './dimensions/tool-effectiveness.js';

export class Evaluator {
  // ...existing code...

  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const dimensions = await Promise.all([
      evaluateCorrectness(context),
      evaluateRelevance(context),
      evaluateCoherence(context),
      evaluateCreativity(context),
      evaluateSafety(context),
      evaluateEfficiency(context),
      evaluateToolEffectiveness(context), // NEW
    ]);

    // Apply weights and calculate final score
    const weightedScore = this.applyWeights(dimensions);

    return {
      score: weightedScore,
      dimensions,
      timestamp: new Date(),
    };
  }
}
```

---

## Day 6-8: CEO Approval via OTT

### Concept

When a WRITE/DESTRUCTIVE tool requires approval, send notification to CEO via Telegram/Zalo and wait for approval response.

### Implementation

**File**: `src/tools/ott-approval.ts`

```typescript
/**
 * OTT Approval Flow
 * Send approval requests to CEO via Telegram/Zalo
 */

import type { PolicyDecision, ApprovalToken } from './types.js';
import type { TelegramChannel } from '../channels/telegram/telegram-channel.js';
import type { ZaloChannel } from '../channels/zalo/zalo-channel.js';

interface OTTApprovalConfig {
  telegramChannel?: TelegramChannel;
  zaloChannel?: ZaloChannel;
  preferredChannel: 'telegram' | 'zalo';
  ceoChatId: string;
}

export class OTTApprovalService {
  private config: OTTApprovalConfig;
  private pendingApprovals: Map<string, {
    decision: PolicyDecision;
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: OTTApprovalConfig) {
    this.config = config;
  }

  /**
   * Request CEO approval via OTT channel
   */
  async requestApproval(decision: PolicyDecision): Promise<boolean> {
    const message = this.formatApprovalMessage(decision);

    // Send to preferred channel
    if (this.config.preferredChannel === 'telegram' && this.config.telegramChannel) {
      await this.sendTelegramApproval(message, decision);
    } else if (this.config.preferredChannel === 'zalo' && this.config.zaloChannel) {
      await this.sendZaloApproval(message, decision);
    } else {
      throw new Error('No OTT channel configured for approval');
    }

    // Wait for approval (with timeout)
    return this.waitForApproval(decision.approval_token!, 5 * 60 * 1000);
  }

  /**
   * Handle approval response from OTT
   */
  handleApprovalResponse(token: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(token);
    if (pending) {
      pending.resolve(approved);
      this.pendingApprovals.delete(token);
    }
  }

  private formatApprovalMessage(decision: PolicyDecision): string {
    return `
🔔 **Tool Approval Required**

**Tool**: ${decision.approval_token ? 'Pending' : 'Unknown'}
**Risk Level**: ${decision.risk}
**Reason**: ${decision.reason}
**Expires**: ${decision.expires_at?.toLocaleString()}

Reply with:
✅ /approve ${decision.approval_token?.slice(0, 8)}
❌ /deny ${decision.approval_token?.slice(0, 8)}
    `.trim();
  }

  private async sendTelegramApproval(
    message: string,
    decision: PolicyDecision
  ): Promise<void> {
    await this.config.telegramChannel!.sendMessage({
      chatId: this.config.ceoChatId,
      text: message,
      parseMode: 'Markdown',
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '✅ Approve',
              callback_data: `approve:${decision.approval_token}`,
            },
            {
              text: '❌ Deny',
              callback_data: `deny:${decision.approval_token}`,
            },
          ],
        ],
      },
    });
  }

  private async sendZaloApproval(
    message: string,
    decision: PolicyDecision
  ): Promise<void> {
    await this.config.zaloChannel!.sendMessage({
      userId: this.config.ceoChatId,
      text: message,
    });
  }

  private waitForApproval(token: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(token, { decision: {} as PolicyDecision, resolve, reject });

      setTimeout(() => {
        if (this.pendingApprovals.has(token)) {
          this.pendingApprovals.delete(token);
          reject(new Error('Approval timeout'));
        }
      }, timeoutMs);
    });
  }
}
```

### Telegram Handler Update

**File**: `src/channels/telegram/telegram-channel.ts` (update)

```typescript
// Add callback query handler for approval buttons
async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  const [action, token] = query.data.split(':');

  if (action === 'approve' || action === 'deny') {
    const approved = action === 'approve';
    this.ottApprovalService.handleApprovalResponse(token, approved);

    // Answer callback
    await this.bot.answerCallbackQuery(query.id, {
      text: approved ? '✅ Approved' : '❌ Denied',
    });

    // Update message
    await this.bot.editMessageText(
      `${approved ? '✅ Approved' : '❌ Denied'} by CEO`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      }
    );
  }
}
```

---

## Day 9-10: Brain Pattern Recognition

### Concept

Track tool usage patterns in Brain Layer 2 to learn CEO preferences and enable auto-approval of common patterns.

### Implementation

**File**: `src/brain/layers/patterns.ts` (update)

```typescript
/**
 * Tool Patterns - Learn CEO tool preferences
 * Added in Sprint 51
 */

export interface ToolPattern {
  tool_name: string;
  argument_pattern: Record<string, unknown>;
  frequency: number;
  success_rate: number;
  auto_approve_eligible: boolean;
  last_used: Date;
}

export class ToolPatternRecognizer {
  private patterns: Map<string, ToolPattern[]> = new Map();

  /**
   * Record tool usage for pattern learning
   */
  async recordToolUsage(
    principal_id: string,
    tool_name: string,
    arguments: Record<string, unknown>,
    success: boolean
  ): Promise<void> {
    const principalPatterns = this.patterns.get(principal_id) ?? [];
    const existingPattern = this.findMatchingPattern(principalPatterns, tool_name, arguments);

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.success_rate =
        (existingPattern.success_rate * (existingPattern.frequency - 1) + (success ? 1 : 0)) /
        existingPattern.frequency;
      existingPattern.last_used = new Date();

      // Eligible for auto-approve if used 5+ times with 95%+ success
      existingPattern.auto_approve_eligible =
        existingPattern.frequency >= 5 && existingPattern.success_rate >= 0.95;
    } else {
      principalPatterns.push({
        tool_name,
        argument_pattern: this.extractPattern(arguments),
        frequency: 1,
        success_rate: success ? 1 : 0,
        auto_approve_eligible: false,
        last_used: new Date(),
      });
    }

    this.patterns.set(principal_id, principalPatterns);
  }

  /**
   * Check if tool call matches auto-approve pattern
   */
  async checkAutoApprove(
    principal_id: string,
    tool_name: string,
    arguments: Record<string, unknown>
  ): Promise<boolean> {
    const principalPatterns = this.patterns.get(principal_id) ?? [];
    const pattern = this.findMatchingPattern(principalPatterns, tool_name, arguments);

    return pattern?.auto_approve_eligible ?? false;
  }

  private findMatchingPattern(
    patterns: ToolPattern[],
    tool_name: string,
    arguments: Record<string, unknown>
  ): ToolPattern | undefined {
    return patterns.find(
      (p) =>
        p.tool_name === tool_name &&
        this.matchesPattern(arguments, p.argument_pattern)
    );
  }

  private extractPattern(arguments: Record<string, unknown>): Record<string, unknown> {
    // Extract pattern (e.g., repo prefix, email domain)
    const pattern: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(arguments)) {
      if (typeof value === 'string') {
        // Extract prefix/domain patterns
        if (value.includes('@')) {
          pattern[key] = `*@${value.split('@')[1]}`;
        } else if (value.includes('/')) {
          pattern[key] = `${value.split('/')[0]}/*`;
        } else {
          pattern[key] = value;
        }
      } else {
        pattern[key] = value;
      }
    }

    return pattern;
  }

  private matchesPattern(
    arguments: Record<string, unknown>,
    pattern: Record<string, unknown>
  ): boolean {
    for (const [key, patternValue] of Object.entries(pattern)) {
      const argValue = arguments[key];

      if (typeof patternValue === 'string' && patternValue.includes('*')) {
        // Wildcard matching
        const regex = new RegExp(
          `^${patternValue.replace(/\*/g, '.*')}$`
        );
        if (typeof argValue !== 'string' || !regex.test(argValue)) {
          return false;
        }
      } else if (argValue !== patternValue) {
        return false;
      }
    }

    return true;
  }
}
```

### Mental Models Update

**File**: `src/brain/layers/mental-models.ts` (update)

```typescript
/**
 * Mental Models - CEO preferences for tools
 * Added in Sprint 51
 */

export interface ToolPreferenceModel {
  preferred_tools: Map<string, string[]>;  // category -> tool names
  approval_speed: 'fast' | 'careful';
  risk_tolerance: 'low' | 'medium' | 'high';
  common_workflows: string[];
}

export class MentalModelManager {
  // ...existing code...

  /**
   * Get tool preferences for decision making
   */
  async getToolPreferences(principal_id: string): Promise<ToolPreferenceModel> {
    const model = await this.getModel(principal_id);

    return {
      preferred_tools: model.toolPreferences ?? new Map([
        ['issues', ['github.create_issue', 'linear.create_issue']],
        ['email', ['gmail.send_message']],
        ['calendar', ['google_calendar.create_event']],
        ['messaging', ['slack.send_message']],
      ]),
      approval_speed: model.approvalSpeed ?? 'careful',
      risk_tolerance: model.riskTolerance ?? 'medium',
      common_workflows: model.commonWorkflows ?? [
        'Create GitHub issue from bug report',
        'Schedule meeting with attendees',
        'Send status update email',
      ],
    };
  }
}
```

---

## Day-by-Day Checklist

### Day 1-3: ToolAwareOrchestrator
- [ ] Create `src/tools/orchestrator.ts`
- [ ] Implement tool injection for Anthropic/OpenAI/Gemini
- [ ] Implement tool_calls extraction
- [ ] Route tool_calls through ToolControlPlane
- [ ] Update `chat.send` gateway method
- [ ] Write 15+ tests

### Day 4-5: Evaluator Integration
- [ ] Create `src/evaluator/dimensions/tool-effectiveness.ts`
- [ ] Add toolEffectiveness to DimensionWeights (5%)
- [ ] Renormalize weights (correctness 0.30 → 0.25)
- [ ] Update Evaluator to include new dimension
- [ ] Write 10+ tests

### Day 6-8: CEO Approval via OTT
- [ ] Create `src/tools/ott-approval.ts`
- [ ] Integrate with Telegram channel
- [ ] Integrate with Zalo channel
- [ ] Add inline keyboard buttons for approval
- [ ] Handle callback queries
- [ ] Write 10+ tests

### Day 9-10: Brain Pattern Recognition
- [ ] Update `src/brain/layers/patterns.ts`
- [ ] Implement tool pattern tracking
- [ ] Implement auto-approve detection
- [ ] Update mental models for tool preferences
- [ ] Write 10+ tests
- [ ] G-Sprint-51 gate evaluation

---

## Testing Commands

```bash
# Run Phase 2 tests
pnpm test src/tools/orchestrator
pnpm test src/evaluator/dimensions/tool-effectiveness
pnpm test src/tools/ott-approval
pnpm test src/brain/layers/patterns

# Run full suite
pnpm test

# Integration tests
pnpm test:e2e
```

---

## Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Orchestrator | Tools inject correctly | Unit tests |
| Evaluator | toolEffectiveness scoring | Evaluation tests |
| OTT Approval | < 30s response time | Integration tests |
| Brain Patterns | 80%+ auto-approve accuracy | Pattern tests |
| Regression | 0 broken tests | `pnpm test` |

---

## NOT in Phase 2

The following features are **deferred to Sprint 52+**:

- ❌ Multi-model tool routing (select best model for tool)
- ❌ MONEY/ADMIN risk tools
- ❌ MCP server integration
- ❌ Multi-project tool contexts

---

## References

- [Sprint 50 Implementation Guide](./sprint-50-implementation-guide.md)
- [ADR-011: Composio Integration](../02-design/01-ADRs/ADR-011-Composio-Integration.md)
- [TOOL-POLICY.md](./TOOL-POLICY.md)
- [Sprint 50 Plan](../01-planning/sprint-50-plan.md)
- [Telegram Channel](../04-build/ott-channels.md)

---

**Status**: PLANNED (After Sprint 50)
**Prerequisites**: Sprint 50 complete, G-Sprint-50 PASS
**Next**: Sprint 52 - Claude Code Integration

*SDLC Framework 6.1.1*
*Stage 04 - BUILD*
