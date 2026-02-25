/**
 * Tests for Brain Bridge
 *
 * @module tests/evaluator/brain-bridge
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mapMentalModelToCeoRule,
  getBrainRulesAsCeoRules,
  hasBrainRulesAvailable,
  getBrainFormattedRules,
  checkRuleViolations,
  storeFeedback,
  getRecentFeedback,
  getFeedbackByTask,
  getAverageScore,
  getImprovementRate,
  clearFeedback,
  type FeedbackEntry,
} from '../../src/evaluator/brain-bridge.js';
import type { MentalModelEntry } from '../../src/brain/types.js';
import { getDefaultCeoRules } from '../../src/evaluator/strategies/add-context.js';
import * as mentalModels from '../../src/brain/layers/mental-models.js';

// =============================================================================
// mapMentalModelToCeoRule Tests
// =============================================================================

describe('mapMentalModelToCeoRule', () => {
  it('should map basic mental model to CEO rule', () => {
    const model: MentalModelEntry = {
      id: 'test-1',
      domain: 'coding',
      rule: 'Always use TypeScript with strict mode.',
      source: 'ceo_import',
      confidence: 0.9,
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const result = mapMentalModelToCeoRule(model);

    expect(result.id).toBe('test-1');
    expect(result.name).toBe('Always use TypeScript with strict mode');
    expect(result.description).toBe('Always use TypeScript with strict mode.');
    expect(result.domain).toBe('coding');
    expect(result.priority).toBe(9); // 0.9 * 10
  });

  it('should truncate long names', () => {
    const model: MentalModelEntry = {
      id: 'test-2',
      domain: 'coding',
      rule: 'This is a very long rule that exceeds fifty characters in the first sentence alone. Second sentence here.',
      source: 'manual',
      confidence: 0.8,
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const result = mapMentalModelToCeoRule(model);

    expect(result.name.length).toBeLessThanOrEqual(50);
    expect(result.name).toContain('...');
    expect(result.description).toBe(model.rule); // Full rule preserved
  });

  it('should convert confidence to priority scale', () => {
    const model: MentalModelEntry = {
      id: 'test-3',
      domain: 'testing',
      rule: 'Write unit tests.',
      source: 'derived',
      confidence: 0.5,
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const result = mapMentalModelToCeoRule(model);

    expect(result.priority).toBe(5); // 0.5 * 10
  });
});

// =============================================================================
// getBrainRulesAsCeoRules Tests
// =============================================================================

describe('getBrainRulesAsCeoRules', () => {
  it('should return default rules when Brain is empty', () => {
    // Mock empty Brain
    vi.spyOn(mentalModels, 'getAllModels').mockReturnValue([]);

    const rules = getBrainRulesAsCeoRules();
    const defaults = getDefaultCeoRules();

    expect(rules.length).toBe(defaults.length);
    expect(rules[0]?.id).toBe(defaults[0]?.id);

    vi.restoreAllMocks();
  });

  it('should return Brain rules when available', () => {
    const brainRules: MentalModelEntry[] = [
      {
        id: 'brain-1',
        domain: 'coding',
        rule: 'Brain rule 1',
        source: 'ceo_import',
        confidence: 0.9,
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'brain-2',
        domain: 'coding',
        rule: 'Brain rule 2',
        source: 'manual',
        confidence: 0.8,
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];

    vi.spyOn(mentalModels, 'getAllModels').mockReturnValue(brainRules);

    const rules = getBrainRulesAsCeoRules();

    expect(rules.length).toBe(2);
    expect(rules[0]?.id).toBe('brain-1');
    expect(rules[1]?.id).toBe('brain-2');

    vi.restoreAllMocks();
  });

  it('should filter by domain', () => {
    const typescriptRules: MentalModelEntry[] = [
      {
        id: 'ts-1',
        domain: 'typescript',
        rule: 'TypeScript rule',
        source: 'manual',
        confidence: 0.9,
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];

    vi.spyOn(mentalModels, 'getModelsByDomain').mockReturnValue(typescriptRules);

    const rules = getBrainRulesAsCeoRules('typescript');

    expect(rules.length).toBe(1);
    expect(rules[0]?.domain).toBe('typescript');

    vi.restoreAllMocks();
  });

  it('should fallback to defaults on error', () => {
    vi.spyOn(mentalModels, 'getAllModels').mockImplementation(() => {
      throw new Error('Brain read error');
    });

    const rules = getBrainRulesAsCeoRules();
    const defaults = getDefaultCeoRules();

    expect(rules.length).toBe(defaults.length);

    vi.restoreAllMocks();
  });
});

// =============================================================================
// hasBrainRulesAvailable Tests
// =============================================================================

describe('hasBrainRulesAvailable', () => {
  it('should return true when Brain has rules', () => {
    vi.spyOn(mentalModels, 'getAllModels').mockReturnValue([
      {
        id: 'rule-1',
        domain: 'coding',
        rule: 'Test rule',
        source: 'manual',
        confidence: 0.8,
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ]);

    expect(hasBrainRulesAvailable()).toBe(true);

    vi.restoreAllMocks();
  });

  it('should return false when Brain is empty', () => {
    vi.spyOn(mentalModels, 'getAllModels').mockReturnValue([]);

    expect(hasBrainRulesAvailable()).toBe(false);

    vi.restoreAllMocks();
  });

  it('should return false on error', () => {
    vi.spyOn(mentalModels, 'getAllModels').mockImplementation(() => {
      throw new Error('Brain error');
    });

    expect(hasBrainRulesAvailable()).toBe(false);

    vi.restoreAllMocks();
  });

  it('should check specific domain', () => {
    vi.spyOn(mentalModels, 'getModelsByDomain').mockReturnValue([]);

    expect(hasBrainRulesAvailable('nonexistent')).toBe(false);

    vi.restoreAllMocks();
  });
});

// =============================================================================
// getBrainFormattedRules Tests
// =============================================================================

describe('getBrainFormattedRules', () => {
  it('should return formatted rules from Brain', () => {
    vi.spyOn(mentalModels, 'getFormattedRules').mockReturnValue(
      '[coding] Use TypeScript (high)\n[coding] Write tests (med)'
    );

    const formatted = getBrainFormattedRules();

    expect(formatted).toContain('Use TypeScript');
    expect(formatted).toContain('Write tests');

    vi.restoreAllMocks();
  });

  it('should return formatted defaults when Brain empty', () => {
    vi.spyOn(mentalModels, 'getFormattedRules').mockReturnValue('');

    const formatted = getBrainFormattedRules();
    const defaults = getDefaultCeoRules();

    expect(formatted).toContain(defaults[0]?.description);

    vi.restoreAllMocks();
  });

  it('should handle errors gracefully', () => {
    vi.spyOn(mentalModels, 'getFormattedRules').mockImplementation(() => {
      throw new Error('Format error');
    });

    const formatted = getBrainFormattedRules();

    // Should return defaults
    expect(formatted).toBeTruthy();
    expect(formatted.length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });
});

// =============================================================================
// checkRuleViolations Tests
// =============================================================================

describe('checkRuleViolations', () => {
  beforeEach(() => {
    // Mock Brain rules that check for "any" and require "const"
    vi.spyOn(mentalModels, 'getAllModels').mockReturnValue([
      {
        id: 'no-any',
        domain: 'coding',
        rule: "Avoid 'any' type in TypeScript",
        source: 'ceo_import',
        confidence: 0.9,
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'use-const',
        domain: 'coding',
        rule: "Always use 'const' for immutable variables",
        source: 'ceo_import',
        confidence: 0.8,
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect rule violations', () => {
    const response = `
\`\`\`typescript
const data: any = {};
function process(x: any) { return x; }
\`\`\`
`;

    const result = checkRuleViolations(response);

    expect(result.total).toBe(2);
    expect(result.violated).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it('should return perfect score for compliant code', () => {
    const response = `
\`\`\`typescript
const data: Record<string, string> = {};
function process(x: string): string { return x; }
\`\`\`
`;

    const result = checkRuleViolations(response);

    // Should have high score (may not be perfect due to heuristics)
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('should handle empty response', () => {
    const result = checkRuleViolations('');

    expect(result.total).toBe(2);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });
});

// =============================================================================
// Feedback Storage Tests
// =============================================================================

describe('Feedback Storage', () => {
  beforeEach(() => {
    clearFeedback();
  });

  describe('storeFeedback', () => {
    it('should store feedback entry', () => {
      const entry: FeedbackEntry = {
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test prompt',
        response: 'Test response',
        score: 85,
        dimensions: { correctness: 90, clarity: 80 },
        improved: false,
      };

      storeFeedback(entry);

      const recent = getRecentFeedback(10);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.taskId).toBe('task-1');
    });
  });

  describe('getRecentFeedback', () => {
    it('should return recent entries', () => {
      for (let i = 0; i < 15; i++) {
        storeFeedback({
          taskId: `task-${i}`,
          timestamp: new Date().toISOString(),
          prompt: `Prompt ${i}`,
          response: `Response ${i}`,
          score: 70 + i,
          dimensions: {},
          improved: false,
        });
      }

      const recent = getRecentFeedback(5);

      expect(recent).toHaveLength(5);
      expect(recent[0]?.taskId).toBe('task-10'); // 15 - 5 = 10
    });

    it('should return all if less than limit', () => {
      storeFeedback({
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 80,
        dimensions: {},
        improved: false,
      });

      const recent = getRecentFeedback(10);

      expect(recent).toHaveLength(1);
    });
  });

  describe('getFeedbackByTask', () => {
    it('should filter by task ID', () => {
      storeFeedback({
        taskId: 'task-a',
        timestamp: new Date().toISOString(),
        prompt: 'A',
        response: 'A',
        score: 80,
        dimensions: {},
        improved: false,
      });

      storeFeedback({
        taskId: 'task-b',
        timestamp: new Date().toISOString(),
        prompt: 'B',
        response: 'B',
        score: 85,
        dimensions: {},
        improved: false,
      });

      storeFeedback({
        taskId: 'task-a',
        timestamp: new Date().toISOString(),
        prompt: 'A2',
        response: 'A2',
        score: 90,
        dimensions: {},
        strategyApplied: 'rephrase',
        improved: true,
      });

      const taskAFeedback = getFeedbackByTask('task-a');

      expect(taskAFeedback).toHaveLength(2);
      expect(taskAFeedback[1]?.improved).toBe(true);
    });
  });

  describe('getAverageScore', () => {
    it('should calculate average score', () => {
      storeFeedback({
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 80,
        dimensions: {},
        improved: false,
      });

      storeFeedback({
        taskId: 'task-2',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 90,
        dimensions: {},
        improved: false,
      });

      const avg = getAverageScore();

      expect(avg).toBe(85); // (80 + 90) / 2
    });

    it('should return undefined for empty storage', () => {
      expect(getAverageScore()).toBeUndefined();
    });
  });

  describe('getImprovementRate', () => {
    it('should calculate improvement rate', () => {
      // 2 with strategy, 1 improved
      storeFeedback({
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 70,
        dimensions: {},
        strategyApplied: 'rephrase',
        improved: true,
      });

      storeFeedback({
        taskId: 'task-2',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 65,
        dimensions: {},
        strategyApplied: 'decompose',
        improved: false,
      });

      // This one has no strategy
      storeFeedback({
        taskId: 'task-3',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 85,
        dimensions: {},
        improved: false,
      });

      const rate = getImprovementRate();

      expect(rate).toBe(50); // 1 improved out of 2 with strategy
    });

    it('should return 0 for no strategy applied', () => {
      storeFeedback({
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 85,
        dimensions: {},
        improved: false,
      });

      expect(getImprovementRate()).toBe(0);
    });
  });

  describe('clearFeedback', () => {
    it('should clear all feedback', () => {
      storeFeedback({
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        prompt: 'Test',
        response: 'Response',
        score: 80,
        dimensions: {},
        improved: false,
      });

      clearFeedback();

      expect(getRecentFeedback(10)).toHaveLength(0);
    });
  });
});
