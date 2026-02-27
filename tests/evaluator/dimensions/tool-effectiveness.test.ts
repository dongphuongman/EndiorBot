/**
 * Tool Effectiveness Dimension Tests
 * Sprint 51 - Day 3-4 - Composio Integration Phase 2
 *
 * @module tests/evaluator/dimensions/tool-effectiveness
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateToolEffectiveness,
  aggregateToolEffectivenessScores,
  type ToolEvaluationContext,
  type ToolEffectivenessScore,
} from '../../../src/evaluator/dimensions/tool-effectiveness.js';
import type { ToolCall, ToolResult } from '../../../src/tools/types.js';

describe('Tool Effectiveness Dimension', () => {
  // ===========================================================================
  // No Tools Used
  // ===========================================================================

  describe('No Tools Used', () => {
    it('should return neutral score when no tools used', () => {
      const context: ToolEvaluationContext = {
        responseContent: 'Hello, how can I help you?',
        toolCalls: [],
        toolResults: [],
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.score).toBe(50); // Neutral
      expect(result.confidence).toBe(0.3); // Low confidence
      expect(result.reason).toContain('No tools');
    });

    it('should return neutral score when toolCalls undefined', () => {
      const context: ToolEvaluationContext = {
        responseContent: 'Here is some information.',
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.score).toBe(50);
    });
  });

  // ===========================================================================
  // Successful Tool Usage
  // ===========================================================================

  describe('Successful Tool Usage', () => {
    it('should return high score for successful tool calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'test/repo' },
          principal_id: 'user-1',
        },
      ];

      const toolResults: ToolResult[] = [
        {
          id: 'call-1',
          success: true,
          output: { name: 'repo', full_name: 'test/repo' },
          duration_ms: 100,
        },
      ];

      const context: ToolEvaluationContext = {
        responseContent: 'The repo test/repo has 42 stars.',
        toolCalls,
        toolResults,
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.metrics.executionSuccess).toBe(1);
      expect(result.metrics.argumentCorrectness).toBe(1);
    });

    it('should detect result utilization in response', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'EndiorBot/repo' },
          principal_id: 'user-1',
        },
      ];

      const toolResults: ToolResult[] = [
        {
          id: 'call-1',
          success: true,
          output: { name: 'EndiorBot', stargazers_count: 42 },
          duration_ms: 100,
        },
      ];

      const context: ToolEvaluationContext = {
        responseContent: 'The EndiorBot repository has 42 stars.',
        toolCalls,
        toolResults,
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.metrics.resultUtilization).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Failed Tool Usage
  // ===========================================================================

  describe('Failed Tool Usage', () => {
    it('should return low score for failed tool calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call-1',
          name: 'github.get_repo',
          arguments: { repo: 'invalid' },
          principal_id: 'user-1',
        },
      ];

      const toolResults: ToolResult[] = [
        {
          id: 'call-1',
          success: false,
          error: { code: 'NOT_FOUND', message: 'Repo not found' },
          duration_ms: 50,
        },
      ];

      const context: ToolEvaluationContext = {
        responseContent: 'I could not find the repository.',
        toolCalls,
        toolResults,
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.score).toBeLessThan(50);
      expect(result.metrics.executionSuccess).toBe(0);
      expect(result.reason).toContain('Low tool execution success');
    });

    it('should detect validation errors', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call-1',
          name: 'github.create_issue',
          arguments: {}, // Missing required args
          principal_id: 'user-1',
        },
      ];

      const toolResults: ToolResult[] = [
        {
          id: 'call-1',
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing title' },
          duration_ms: 10,
        },
      ];

      const context: ToolEvaluationContext = {
        responseContent: 'Failed to create issue.',
        toolCalls,
        toolResults,
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.metrics.argumentCorrectness).toBe(0);
    });
  });

  // ===========================================================================
  // Multiple Tools
  // ===========================================================================

  describe('Multiple Tools', () => {
    it('should calculate average for multiple calls', () => {
      const toolCalls: ToolCall[] = [
        { id: 'call-1', name: 'github.get_repo', arguments: {}, principal_id: 'user-1' },
        { id: 'call-2', name: 'github.get_issue', arguments: {}, principal_id: 'user-1' },
        { id: 'call-3', name: 'gmail.list_messages', arguments: {}, principal_id: 'user-1' },
      ];

      const toolResults: ToolResult[] = [
        { id: 'call-1', success: true, output: {}, duration_ms: 100 },
        { id: 'call-2', success: true, output: {}, duration_ms: 100 },
        { id: 'call-3', success: false, error: { code: 'ERROR', message: 'Failed' }, duration_ms: 50 },
      ];

      const context: ToolEvaluationContext = {
        responseContent: 'Here are the results.',
        toolCalls,
        toolResults,
      };

      const result = evaluateToolEffectiveness(context);

      expect(result.metrics.executionSuccess).toBeCloseTo(2 / 3, 2);
      expect(result.metrics.raw.totalCalls).toBe(3);
      expect(result.metrics.raw.successfulCalls).toBe(2);
      expect(result.metrics.raw.failedCalls).toBe(1);
    });

    it('should increase confidence with more calls', () => {
      const manyToolCalls: ToolCall[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `call-${i}`,
          name: 'github.get_repo',
          arguments: {},
          principal_id: 'user-1',
        }));

      const manyToolResults: ToolResult[] = manyToolCalls.map((c) => ({
        id: c.id,
        success: true,
        output: {},
        duration_ms: 100,
      }));

      const fewToolCalls: ToolCall[] = [
        { id: 'call-1', name: 'github.get_repo', arguments: {}, principal_id: 'user-1' },
      ];

      const fewToolResults: ToolResult[] = [
        { id: 'call-1', success: true, output: {}, duration_ms: 100 },
      ];

      const resultMany = evaluateToolEffectiveness({
        responseContent: 'Results',
        toolCalls: manyToolCalls,
        toolResults: manyToolResults,
      });

      const resultFew = evaluateToolEffectiveness({
        responseContent: 'Results',
        toolCalls: fewToolCalls,
        toolResults: fewToolResults,
      });

      expect(resultMany.confidence).toBeGreaterThan(resultFew.confidence);
    });
  });

  // ===========================================================================
  // Aggregation
  // ===========================================================================

  describe('Score Aggregation', () => {
    it('should aggregate multiple scores', () => {
      const scores: ToolEffectivenessScore[] = [
        {
          dimension: 'toolEffectiveness',
          score: 80,
          confidence: 0.9,
          reason: 'Good',
          metrics: {
            toolSelectionAccuracy: 0.8,
            argumentCorrectness: 0.9,
            executionSuccess: 0.9,
            resultUtilization: 0.7,
            raw: { totalCalls: 2, successfulCalls: 2, failedCalls: 0, resultsReferenced: 1 },
          },
        },
        {
          dimension: 'toolEffectiveness',
          score: 60,
          confidence: 0.7,
          reason: 'Okay',
          metrics: {
            toolSelectionAccuracy: 0.6,
            argumentCorrectness: 0.7,
            executionSuccess: 0.5,
            resultUtilization: 0.5,
            raw: { totalCalls: 2, successfulCalls: 1, failedCalls: 1, resultsReferenced: 0 },
          },
        },
      ];

      const result = aggregateToolEffectivenessScores(scores);

      expect(result.averageScore).toBe(70);
      expect(result.averageMetrics.executionSuccess).toBeCloseTo(0.7, 1);
    });

    it('should detect improving trend', () => {
      const scores: ToolEffectivenessScore[] = [
        { dimension: 'toolEffectiveness', score: 50, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 55, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 70, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 80, confidence: 0.5, reason: '', metrics: createMetrics() },
      ];

      const result = aggregateToolEffectivenessScores(scores);

      expect(result.trend).toBe('improving');
    });

    it('should detect declining trend', () => {
      const scores: ToolEffectivenessScore[] = [
        { dimension: 'toolEffectiveness', score: 80, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 75, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 55, confidence: 0.5, reason: '', metrics: createMetrics() },
        { dimension: 'toolEffectiveness', score: 50, confidence: 0.5, reason: '', metrics: createMetrics() },
      ];

      const result = aggregateToolEffectivenessScores(scores);

      expect(result.trend).toBe('declining');
    });

    it('should handle empty scores', () => {
      const result = aggregateToolEffectivenessScores([]);

      expect(result.averageScore).toBe(50);
      expect(result.trend).toBe('stable');
    });
  });
});

// Helper to create metrics
function createMetrics() {
  return {
    toolSelectionAccuracy: 0.7,
    argumentCorrectness: 0.8,
    executionSuccess: 0.8,
    resultUtilization: 0.6,
    raw: { totalCalls: 1, successfulCalls: 1, failedCalls: 0, resultsReferenced: 0 },
  };
}
